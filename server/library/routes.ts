/**
 * The Library — API
 *
 * Member:
 *   GET   /api/library/ebooks              — shelf: published guides + owned flag + progress
 *   GET   /api/library/ebooks/:id          — one guide, with sections gated by entitlement
 *   PUT   /api/library/ebooks/:id/progress — where they stopped
 *
 * Admin:
 *   GET    /api/admin/library/ebooks               — all guides, published or not
 *   POST   /api/admin/library/ebooks               — create
 *   PUT    /api/admin/library/ebooks/:id           — update
 *   DELETE /api/admin/library/ebooks/:id           — delete (cascades sections + grants)
 *   POST   /api/admin/library/ebooks/:id/sections  — add a section
 *   PUT    /api/admin/library/sections/:sectionId  — update a section
 *   DELETE /api/admin/library/sections/:sectionId  — delete a section
 *   POST   /api/admin/library/grants               — grant a guide to a member
 *   DELETE /api/admin/library/grants/:id           — revoke
 *
 * Access rule, in one place: a member may read a section's content if they hold
 * an entitlement row for the guide, OR the section is marked free. Everything
 * else returns the section's title and nothing more, so the shape of the guide
 * is visible but the text is not.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { db } from "../db.js";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import { z } from "zod";
import {
  ebooks,
  ebookSections,
  ebookEntitlements,
  ebookProgress,
  insertEbookSchema,
  insertEbookSectionSchema,
  entitlementSourceEnum,
  wellnessRoutines,
} from "../../shared/schema.js";

function isAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  storage
    .getUser(userId)
    .then((user) => {
      if (!user || user.isAdmin !== "true")
        return res.status(403).json({ message: "Admin access required" });
      next();
    })
    .catch(() => res.status(500).json({ message: "Internal Server Error" }));
}

/** Express 5 types route params as `string | string[]`. Normalise to a string. */
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      message: zodMessage(err),
      field: err.errors[0].path.join("."),
    });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

const progressSchema = z.object({
  sectionId: z.string().uuid().nullable().optional(),
  scrollFraction: z.number().int().min(0).max(1000).optional(),
  completed: z.boolean().optional(),
});

const grantSchema = z.object({
  userId: z.string().min(1),
  ebookId: z.string().uuid(),
  source: entitlementSourceEnum.default("coaching"),
});

export function registerLibraryRoutes(app: Express) {
  // ─── MEMBER ──────────────────────────────────────────────────────────────

  app.get("/api/library/ebooks", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;

      const rows = await db
        .select()
        .from(ebooks)
        .where(eq(ebooks.isPublished, true))
        .orderBy(desc(ebooks.isFeatured), asc(ebooks.sortOrder), asc(ebooks.title));

      if (rows.length === 0) return res.json([]);

      const ids = rows.map((b) => b.id);
      const [owned, progress] = await Promise.all([
        db
          .select({ ebookId: ebookEntitlements.ebookId })
          .from(ebookEntitlements)
          .where(and(eq(ebookEntitlements.userId, userId), inArray(ebookEntitlements.ebookId, ids))),
        db
          .select()
          .from(ebookProgress)
          .where(and(eq(ebookProgress.userId, userId), inArray(ebookProgress.ebookId, ids))),
      ]);

      const ownedIds = new Set(owned.map((o) => o.ebookId));
      const progressByBook = new Map(progress.map((p) => [p.ebookId, p]));

      res.json(
        rows.map((b) => ({
          ...b,
          owned: ownedIds.has(b.id),
          progress: progressByBook.get(b.id) ?? null,
        })),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/library/ebooks/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const ebookId = param(req, "id");

      const [book] = await db.select().from(ebooks).where(eq(ebooks.id, ebookId));
      if (!book || !book.isPublished) return res.status(404).json({ message: "Not found" });

      const [entitlement] = await db
        .select()
        .from(ebookEntitlements)
        .where(and(eq(ebookEntitlements.userId, userId), eq(ebookEntitlements.ebookId, ebookId)));

      const owned = !!entitlement;

      const sections = await db
        .select()
        .from(ebookSections)
        .where(eq(ebookSections.ebookId, ebookId))
        .orderBy(asc(ebookSections.orderIndex));

      // Titles always; text only when it's theirs to read.
      const gated = sections.map((s) =>
        owned || s.isFree ? { ...s, locked: false } : { ...s, content: null, audioUrl: null, locked: true },
      );

      // The handoff: when a guide is the reasoning behind a protocol, the
      // reader can start it from the last page. This is the whole point of
      // pairing them, so the pairing travels with the response.
      let pairedRoutine = null;
      if (book.routineId) {
        const [r] = await db
          .select({
            id: wellnessRoutines.id,
            name: wellnessRoutines.name,
            durationDays: wellnessRoutines.durationDays,
          })
          .from(wellnessRoutines)
          .where(eq(wellnessRoutines.id, book.routineId));
        pairedRoutine = r ?? null;
      }

      const [progress] = await db
        .select()
        .from(ebookProgress)
        .where(and(eq(ebookProgress.userId, userId), eq(ebookProgress.ebookId, ebookId)));

      res.json({ ...book, owned, sections: gated, pairedRoutine, progress: progress ?? null });
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/library/ebooks/:id/progress", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const ebookId = param(req, "id");
      const input = progressSchema.parse(req.body);

      const values = {
        userId,
        ebookId,
        sectionId: input.sectionId ?? null,
        scrollFraction: input.scrollFraction ?? 0,
        completedAt: input.completed ? new Date() : null,
        updatedAt: new Date(),
      };

      const [saved] = await db
        .insert(ebookProgress)
        .values(values)
        .onConflictDoUpdate({
          target: [ebookProgress.userId, ebookProgress.ebookId],
          set: {
            sectionId: values.sectionId,
            scrollFraction: values.scrollFraction,
            // Finishing is sticky — reopening an earlier chapter shouldn't
            // un-finish a guide the member already got to the end of.
            ...(input.completed ? { completedAt: values.completedAt } : {}),
            updatedAt: values.updatedAt,
          },
        })
        .returning();

      res.json(saved);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  app.get("/api/admin/library/ebooks", isAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(ebooks)
        .orderBy(asc(ebooks.sortOrder), asc(ebooks.title));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/library/ebooks", isAdmin, async (req, res) => {
    try {
      const input = insertEbookSchema.parse(req.body);
      const [created] = await db.insert(ebooks).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/library/ebooks/:id", isAdmin, async (req, res) => {
    try {
      const input = insertEbookSchema.partial().parse(req.body);
      const [updated] = await db
        .update(ebooks)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(ebooks.id, param(req, "id")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/library/ebooks/:id", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(ebooks)
        .where(eq(ebooks.id, param(req, "id")))
        .returning({ id: ebooks.id });
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/library/ebooks/:id/sections", isAdmin, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(ebookSections)
        .where(eq(ebookSections.ebookId, param(req, "id")))
        .orderBy(asc(ebookSections.orderIndex));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/library/ebooks/:id/sections", isAdmin, async (req, res) => {
    try {
      const ebookId = param(req, "id");
      // order_index is unique per book, so default to appending rather than
      // making the caller work out the next free slot.
      const existing = await db
        .select({ orderIndex: ebookSections.orderIndex })
        .from(ebookSections)
        .where(eq(ebookSections.ebookId, ebookId));
      const nextIndex = existing.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;

      const input = insertEbookSectionSchema.parse({
        orderIndex: nextIndex,
        ...req.body,
        ebookId,
      });
      const [created] = await db.insert(ebookSections).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/library/sections/:sectionId", isAdmin, async (req, res) => {
    try {
      const input = insertEbookSectionSchema.partial().parse(req.body);
      const [updated] = await db
        .update(ebookSections)
        .set(input)
        .where(eq(ebookSections.id, param(req, "sectionId")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/library/sections/:sectionId", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(ebookSections)
        .where(eq(ebookSections.id, param(req, "sectionId")))
        .returning({ id: ebookSections.id });
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/library/grants/:ebookId", isAdmin, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(ebookEntitlements)
        .where(eq(ebookEntitlements.ebookId, param(req, "ebookId")))
        .orderBy(desc(ebookEntitlements.grantedAt));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/library/grants", isAdmin, async (req, res) => {
    try {
      const input = grantSchema.parse(req.body);
      const [granted] = await db
        .insert(ebookEntitlements)
        .values({ ...input, grantedBy: req.session!.userId! })
        .onConflictDoNothing()
        .returning();
      // Already granted is success, not a conflict — the member has it either way.
      res.status(201).json(granted ?? { userId: input.userId, ebookId: input.ebookId, existing: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/library/grants/:id", isAdmin, async (req, res) => {
    try {
      const [revoked] = await db
        .delete(ebookEntitlements)
        .where(eq(ebookEntitlements.id, param(req, "id")))
        .returning({ id: ebookEntitlements.id });
      if (!revoked) return res.status(404).json({ message: "Not found" });
      res.json({ id: revoked.id });
    } catch (err) {
      fail(res, err);
    }
  });
}
