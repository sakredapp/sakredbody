/**
 * The Apothecary — API
 *
 * Member:
 *   GET    /api/apothecary/products              — catalog (category / search filters)
 *   GET    /api/apothecary/products/:id          — one product with its buy links
 *   GET    /api/apothecary/supply                — sourcing list for the active protocol
 *   GET    /api/apothecary/checkoffs             — product ids the member already has
 *   POST   /api/apothecary/checkoffs/:productId  — "I have this"
 *   DELETE /api/apothecary/checkoffs/:productId  — undo
 *
 * Admin:
 *   POST   /api/admin/apothecary/products             — create
 *   PUT    /api/admin/apothecary/products/:id         — update
 *   DELETE /api/admin/apothecary/products/:id         — delete (cascades links + attachments)
 *   POST   /api/admin/apothecary/products/:id/links   — add a buy link
 *   DELETE /api/admin/apothecary/links/:linkId        — remove a buy link
 *   POST   /api/admin/apothecary/routine-products     — attach a product to a protocol
 *   DELETE /api/admin/apothecary/routine-products/:id — detach
 *   POST   /api/admin/apothecary/habit-products       — attach a product to a habit
 *   DELETE /api/admin/apothecary/habit-products/:id   — detach
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { eq, and, inArray, desc, asc, or, ilike, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import { z } from "zod";
import {
  products,
  productLinks,
  habitProducts,
  routineProducts,
  userShopCheckoffs,
  insertProductSchema,
  insertProductLinkSchema,
  insertRoutineProductSchema,
  insertHabitProductSchema,
  userRoutines,
  wellnessRoutines,
  type Product,
  type ProductLink,
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
      message: err.errors[0].message,
      field: err.errors[0].path.join("."),
    });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

/** Attach each product's buy links in one round trip rather than N. */
async function withLinks(rows: Product[]): Promise<(Product & { links: ProductLink[] })[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select()
    .from(productLinks)
    .where(inArray(productLinks.productId, rows.map((p) => p.id)))
    .orderBy(desc(productLinks.isPrimary), asc(productLinks.sortOrder));

  const byProduct = new Map<string, ProductLink[]>();
  for (const l of links) {
    const list = byProduct.get(l.productId);
    if (list) list.push(l);
    else byProduct.set(l.productId, [l]);
  }
  return rows.map((p) => ({ ...p, links: byProduct.get(p.id) ?? [] }));
}

export function registerShopRoutes(app: Express) {
  // ─── MEMBER ──────────────────────────────────────────────────────────────

  app.get("/api/apothecary/products", isAuthenticated, async (req, res) => {
    try {
      const { category, q } = req.query as { category?: string; q?: string };

      const filters = [eq(products.isActive, true)];
      if (category && category !== "all") filters.push(eq(products.category, category));
      if (q && q.trim()) {
        const term = `%${q.trim()}%`;
        filters.push(
          or(
            ilike(products.name, term),
            ilike(products.brand, term),
            ilike(products.description, term),
            sql`EXISTS (SELECT 1 FROM unnest(${products.searchKeywords}) kw WHERE kw ILIKE ${term})`,
          )!,
        );
      }

      const rows = await db
        .select()
        .from(products)
        .where(and(...filters))
        .orderBy(desc(products.isFeatured), asc(products.sortOrder), asc(products.name));

      res.json(await withLinks(rows));
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/apothecary/products/:id", isAuthenticated, async (req, res) => {
    try {
      const [product] = await db.select().from(products).where(eq(products.id, param(req, "id")));
      if (!product) return res.status(404).json({ message: "Product not found" });
      const [withIt] = await withLinks([product]);
      res.json(withIt);
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * The sourcing list for whatever the member is actually running.
   *
   * Staged by phase, because handing someone a 20-item shopping list on day one
   * turns a protocol into a shopping trip. `?routineId=` overrides so the
   * catalog can preview a protocol's supply before enrolling.
   */
  app.get("/api/apothecary/supply", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const override = (req.query.routineId as string | undefined)?.trim();

      let routineId = override;
      if (!routineId) {
        const [active] = await db
          .select({ routineId: userRoutines.routineId })
          .from(userRoutines)
          .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")))
          .orderBy(desc(userRoutines.createdAt))
          .limit(1);
        routineId = active?.routineId;
      }

      if (!routineId) {
        return res.json({ routineId: null, routineName: null, phases: [], checkedIds: [] });
      }

      const [routine] = await db
        .select({ id: wellnessRoutines.id, name: wellnessRoutines.name })
        .from(wellnessRoutines)
        .where(eq(wellnessRoutines.id, routineId));

      const rows = await db
        .select({
          attachment: routineProducts,
          product: products,
        })
        .from(routineProducts)
        .innerJoin(products, eq(routineProducts.productId, products.id))
        .where(and(eq(routineProducts.routineId, routineId), eq(products.isActive, true)))
        .orderBy(
          desc(routineProducts.isEssential),
          asc(routineProducts.sortOrder),
          asc(products.name),
        );

      const enriched = await withLinks(rows.map((r) => r.product));
      const linkedById = new Map(enriched.map((p) => [p.id, p]));

      const ORDER = ["prepare", "clear", "rebuild"] as const;
      const phases = ORDER.map((phase) => ({
        phase,
        items: rows
          .filter((r) => r.attachment.phase === phase)
          .map((r) => ({
            ...linkedById.get(r.product.id)!,
            note: r.attachment.note,
            isEssential: r.attachment.isEssential,
            attachmentId: r.attachment.id,
          })),
      })).filter((p) => p.items.length > 0);

      const checked = await db
        .select({ productId: userShopCheckoffs.productId })
        .from(userShopCheckoffs)
        .where(eq(userShopCheckoffs.userId, userId));

      res.json({
        routineId,
        routineName: routine?.name ?? null,
        phases,
        checkedIds: checked.map((c) => c.productId),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/apothecary/checkoffs", isAuthenticated, async (req, res) => {
    try {
      const rows = await db
        .select({ productId: userShopCheckoffs.productId })
        .from(userShopCheckoffs)
        .where(eq(userShopCheckoffs.userId, req.session!.userId!));
      res.json(rows.map((r) => r.productId));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/apothecary/checkoffs/:productId", isAuthenticated, async (req, res) => {
    try {
      // Presence is the state, so a repeat check-off is a no-op rather than an error.
      await db
        .insert(userShopCheckoffs)
        .values({ userId: req.session!.userId!, productId: param(req, "productId") })
        .onConflictDoNothing();
      res.status(201).json({ productId: param(req, "productId"), checked: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/apothecary/checkoffs/:productId", isAuthenticated, async (req, res) => {
    try {
      await db
        .delete(userShopCheckoffs)
        .where(
          and(
            eq(userShopCheckoffs.userId, req.session!.userId!),
            eq(userShopCheckoffs.productId, param(req, "productId")),
          ),
        );
      res.json({ productId: param(req, "productId"), checked: false });
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  app.get("/api/admin/apothecary/products", isAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(products)
        .orderBy(asc(products.sortOrder), asc(products.name));
      res.json(await withLinks(rows));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/apothecary/products", isAdmin, async (req, res) => {
    try {
      const input = insertProductSchema.parse(req.body);
      const [created] = await db.insert(products).values(input).returning();
      res.status(201).json({ ...created, links: [] });
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/apothecary/products/:id", isAdmin, async (req, res) => {
    try {
      const input = insertProductSchema.partial().parse(req.body);
      const [updated] = await db
        .update(products)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(products.id, param(req, "id")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Product not found" });
      const [withIt] = await withLinks([updated]);
      res.json(withIt);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/apothecary/products/:id", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(products)
        .where(eq(products.id, param(req, "id")))
        .returning({ id: products.id });
      if (!deleted) return res.status(404).json({ message: "Product not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/apothecary/products/:id/links", isAdmin, async (req, res) => {
    try {
      const input = insertProductLinkSchema.parse({ ...req.body, productId: param(req, "id") });
      // Only one primary link per product — promoting a new one demotes the rest.
      if (input.isPrimary) {
        await db
          .update(productLinks)
          .set({ isPrimary: false })
          .where(eq(productLinks.productId, param(req, "id")));
      }
      const [created] = await db.insert(productLinks).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/apothecary/links/:linkId", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(productLinks)
        .where(eq(productLinks.id, param(req, "linkId")))
        .returning({ id: productLinks.id });
      if (!deleted) return res.status(404).json({ message: "Link not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/apothecary/routine-products/:routineId", isAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({ attachment: routineProducts, product: products })
        .from(routineProducts)
        .innerJoin(products, eq(routineProducts.productId, products.id))
        .where(eq(routineProducts.routineId, param(req, "routineId")))
        .orderBy(asc(routineProducts.sortOrder));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/apothecary/routine-products", isAdmin, async (req, res) => {
    try {
      const input = insertRoutineProductSchema.parse(req.body);
      const [created] = await db
        .insert(routineProducts)
        .values(input)
        .onConflictDoUpdate({
          target: [routineProducts.routineId, routineProducts.productId],
          set: { phase: input.phase, note: input.note, isEssential: input.isEssential },
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/apothecary/routine-products/:id", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(routineProducts)
        .where(eq(routineProducts.id, param(req, "id")))
        .returning({ id: routineProducts.id });
      if (!deleted) return res.status(404).json({ message: "Attachment not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/apothecary/habit-products/:habitId", isAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({ attachment: habitProducts, product: products })
        .from(habitProducts)
        .innerJoin(products, eq(habitProducts.productId, products.id))
        .where(eq(habitProducts.habitId, param(req, "habitId")))
        .orderBy(asc(habitProducts.sortOrder));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/apothecary/habit-products", isAdmin, async (req, res) => {
    try {
      const input = insertHabitProductSchema.parse(req.body);
      const [created] = await db
        .insert(habitProducts)
        .values(input)
        .onConflictDoUpdate({
          target: [habitProducts.habitId, habitProducts.productId],
          set: { note: input.note, isEssential: input.isEssential },
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/apothecary/habit-products/:id", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(habitProducts)
        .where(eq(habitProducts.id, param(req, "id")))
        .returning({ id: habitProducts.id });
      if (!deleted) return res.status(404).json({ message: "Attachment not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });
}
