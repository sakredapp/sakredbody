/**
 * The daily ritual — API
 *
 * Member:
 *   GET  /api/daily                  — today: the note, their intention, the almanac
 *   PUT  /api/daily/intention        — set or change today's intention
 *   POST /api/daily/intention/met    — mark it met
 *   GET  /api/daily/chart            — what we know about them
 *   PUT  /api/daily/chart            — tell us more; numbers are computed here
 *   GET  /api/frequencies            — audio, filtered by moment
 *
 * Admin:
 *   GET   /api/admin/daily/notes         — what members were actually told
 *   PATCH /api/admin/daily/notes/:id     — review or flag
 *   POST  /api/admin/daily/notes/:id/regenerate
 *   GET/POST/PUT/DELETE /api/admin/frequencies
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { eq, and, desc, asc, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import {
  dailyNotes,
  dailyIntentions,
  frequencies,
  userCosmology,
  users,
  memberChartSchema,
  setIntentionSchema,
  insertFrequencySchema,
  frequencyMomentEnum,
} from "../../shared/schema.js";
import { almanacFor, nameNumbers, lifePathFromDate } from "../../shared/utils/almanac.js";
import { memberToday } from "../coaching/enrollment.js";
import { getOrCreateDailyNote } from "./generate.js";

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

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      message: err.errors[0].message,
      field: err.errors[0].path.join("."),
    });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

/**
 * Recompute every derived number from its inputs.
 *
 * Always server-side, never trusted from the client, and always recomputed
 * rather than patched — otherwise a member who corrects their birth date ends
 * up with a life path from the old one.
 */
function deriveNumbers(chart: { birthDate?: string | null; birthName?: string | null }) {
  const names = nameNumbers(chart.birthName);
  return {
    lifePathNumber: chart.birthDate ? lifePathFromDate(chart.birthDate) : null,
    expressionNumber: names.expression,
    soulUrgeNumber: names.soulUrge,
    personalityNumber: names.personality,
  };
}

export function registerDailyRoutes(app: Express) {
  // ─── MEMBER ──────────────────────────────────────────────────────────────

  app.get("/api/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const onDate = await memberToday(userId);

      const [chart] = await db
        .select()
        .from(userCosmology)
        .where(eq(userCosmology.userId, userId));

      const [intention] = await db
        .select()
        .from(dailyIntentions)
        .where(and(eq(dailyIntentions.userId, userId), eq(dailyIntentions.onDate, onDate)));

      // Generating is the slow part, so everything else is already in hand if
      // it fails. A member must never get an error page for their own day.
      let note = null;
      try {
        note = await getOrCreateDailyNote(userId, onDate);
      } catch (err) {
        console.error("[daily] note unavailable:", err);
      }

      const almanac = almanacFor(onDate, {
        birthDate: chart?.birthDate ?? null,
        birthName: chart?.birthName ?? null,
        lifePathNumber: chart?.lifePathNumber ?? null,
        sunSign: chart?.sunSign ?? null,
        moonSign: chart?.moonSign ?? null,
        risingSign: chart?.risingSign ?? null,
      });

      res.json({
        date: onDate,
        note: note
          ? {
              headline: note.headline,
              body: note.body,
              invitation: note.invitation,
            }
          : null,
        intention: intention ?? null,
        almanac,
        // Nudge the chart form only when there's something real to gain.
        chartDepth: almanac.personal?.depth ?? 0,
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/daily/intention", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const onDate = await memberToday(userId);
      const { intention } = setIntentionSchema.parse(req.body);

      const [saved] = await db
        .insert(dailyIntentions)
        .values({ userId, onDate, intention })
        .onConflictDoUpdate({
          target: [dailyIntentions.userId, dailyIntentions.onDate],
          set: { intention, updatedAt: new Date() },
        })
        .returning();

      res.json(saved);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/daily/intention/met", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const onDate = await memberToday(userId);

      const [updated] = await db
        .update(dailyIntentions)
        .set({ metAt: new Date(), updatedAt: new Date() })
        .where(and(eq(dailyIntentions.userId, userId), eq(dailyIntentions.onDate, onDate)))
        .returning();

      if (!updated) return res.status(404).json({ message: "No intention set today" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/daily/chart", isAuthenticated, async (req, res) => {
    try {
      const [chart] = await db
        .select()
        .from(userCosmology)
        .where(eq(userCosmology.userId, req.session!.userId!));
      // `disposition` is the coach's private reading — never returned here.
      if (!chart) return res.json(null);
      const { disposition, ...visible } = chart;
      res.json(visible);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/daily/chart", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = memberChartSchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(userCosmology)
        .where(eq(userCosmology.userId, userId));

      // Merge over what's there, then derive from the merged result — a member
      // adding only a middle name must not lose their birth date.
      const merged = {
        birthDate: input.birthDate !== undefined ? input.birthDate : existing?.birthDate ?? null,
        birthTime: input.birthTime !== undefined ? input.birthTime : existing?.birthTime ?? null,
        birthPlace: input.birthPlace !== undefined ? input.birthPlace : existing?.birthPlace ?? null,
        birthName: input.birthName !== undefined ? input.birthName : existing?.birthName ?? null,
        polarity: input.polarity !== undefined ? input.polarity : existing?.polarity ?? null,
        sunSign: input.sunSign !== undefined ? input.sunSign : existing?.sunSign ?? null,
        moonSign: input.moonSign !== undefined ? input.moonSign : existing?.moonSign ?? null,
        risingSign: input.risingSign !== undefined ? input.risingSign : existing?.risingSign ?? null,
      };

      const values = { userId, ...merged, ...deriveNumbers(merged), updatedAt: new Date() };

      const [saved] = await db
        .insert(userCosmology)
        .values(values)
        .onConflictDoUpdate({ target: userCosmology.userId, set: values })
        .returning();

      const { disposition, ...visible } = saved;
      res.json(visible);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/frequencies", isAuthenticated, async (req, res) => {
    try {
      const moment = (req.query.moment as string | undefined)?.trim();
      const filters = [eq(frequencies.isActive, true)];
      if (moment && moment !== "all") filters.push(eq(frequencies.moment, moment));

      const rows = await db
        .select()
        .from(frequencies)
        .where(and(...filters))
        .orderBy(asc(frequencies.sortOrder), asc(frequencies.name));

      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  /**
   * What members were actually told. This is the whole reason notes are
   * stored rather than streamed — generated copy nobody can read after the
   * fact is copy nobody can be accountable for.
   */
  app.get("/api/admin/daily/notes", isAdmin, async (req, res) => {
    try {
      const { flagged, source, since } = req.query as Record<string, string | undefined>;

      const filters = [];
      if (flagged === "true") filters.push(eq(dailyNotes.flagged, true));
      if (source) filters.push(eq(dailyNotes.source, source));
      if (since) filters.push(gte(dailyNotes.onDate, since));

      const rows = await db
        .select({
          note: dailyNotes,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(dailyNotes)
        .leftJoin(users, eq(dailyNotes.userId, users.id))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(dailyNotes.onDate), desc(dailyNotes.createdAt))
        .limit(200);

      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.patch("/api/admin/daily/notes/:id", isAdmin, async (req, res) => {
    try {
      const input = z
        .object({
          flagged: z.boolean().optional(),
          flagNote: z.string().max(2000).nullable().optional(),
          reviewed: z.boolean().optional(),
        })
        .parse(req.body);

      const [updated] = await db
        .update(dailyNotes)
        .set({
          ...(input.flagged !== undefined ? { flagged: input.flagged } : {}),
          ...(input.flagNote !== undefined ? { flagNote: input.flagNote } : {}),
          ...(input.reviewed
            ? { reviewedAt: new Date(), reviewedBy: req.session!.userId! }
            : {}),
        })
        .where(eq(dailyNotes.id, param(req, "id")))
        .returning();

      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/daily/notes/:id/regenerate", isAdmin, async (req, res) => {
    try {
      const [existing] = await db
        .select()
        .from(dailyNotes)
        .where(eq(dailyNotes.id, param(req, "id")));
      if (!existing) return res.status(404).json({ message: "Not found" });

      const regenerated = await getOrCreateDailyNote(existing.userId, existing.onDate, {
        force: true,
      });
      res.json(regenerated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/frequencies", isAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(frequencies)
        .orderBy(asc(frequencies.sortOrder), asc(frequencies.name));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/frequencies", isAdmin, async (req, res) => {
    try {
      const input = insertFrequencySchema.parse(req.body);
      const [created] = await db.insert(frequencies).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/frequencies/:id", isAdmin, async (req, res) => {
    try {
      const input = insertFrequencySchema.partial().parse(req.body);
      const [updated] = await db
        .update(frequencies)
        .set(input)
        .where(eq(frequencies.id, param(req, "id")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/frequencies/:id", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(frequencies)
        .where(eq(frequencies.id, param(req, "id")))
        .returning({ id: frequencies.id });
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });
}
