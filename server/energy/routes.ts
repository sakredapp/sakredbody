/**
 * The Body Map — API
 *
 * Member:
 *   GET  /api/energy/centres            — the map, with this member's latest reading per centre
 *   GET  /api/energy/centres/:id        — one centre, with the practices and protocols that work it
 *   POST /api/energy/readings           — record how a centre feels today
 *   GET  /api/energy/readings/:centreId — that centre's history, oldest first
 *   GET  /api/energy/cosmology          — the member's birth data
 *   PUT  /api/energy/cosmology          — save it (life path computed server-side)
 *
 * Admin:
 *   GET  /api/admin/energy/centres              — all centres, published or not
 *   POST /api/admin/energy/centres              — create / upsert by slug
 *   PUT  /api/admin/energy/centres/:id          — update
 *   POST /api/admin/energy/centre-habits        — link a practice to a centre
 *   POST /api/admin/energy/centre-routines      — link a protocol to a centre
 *   GET  /api/admin/energy/member/:userId       — a member's readings + cosmology, for the coach
 *   POST /api/admin/energy/member/:userId/reading — a coach's own reading
 *
 * Readings are append-only. What a coach needs is movement over time, so
 * nothing here updates a reading — it records a new one.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import { z } from "zod";
import {
  energyCentres,
  centreHabits,
  centreRoutines,
  userCentreReadings,
  userCosmology,
  routineHabits,
  wellnessRoutines,
  insertEnergyCentreSchema,
  insertCosmologySchema,
  centreStateEnum,
  centreActionEnum,
  lifePathNumber,
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

const readingSchema = z.object({
  centreId: z.string().min(1),
  state: centreStateEnum,
  note: z.string().max(2000).optional().nullable(),
});

/**
 * One latest reading per centre, in a single query.
 *
 * DISTINCT ON is the right tool here — the alternative is a window function
 * subquery or N queries, and readings are append-only so the table grows
 * without bound per member.
 */
async function latestReadings(userId: string) {
  const rows = await db.execute<{
    centre_id: string;
    state: string;
    note: string | null;
    recorded_by: string;
    recorded_at: string;
  }>(sql`
    SELECT DISTINCT ON (centre_id)
           centre_id, state, note, recorded_by, recorded_at
    FROM user_centre_readings
    WHERE user_id = ${userId}
    ORDER BY centre_id, recorded_at DESC
  `);
  return rows.rows ?? [];
}

export function registerEnergyRoutes(app: Express) {
  // ─── MEMBER ──────────────────────────────────────────────────────────────

  app.get("/api/energy/centres", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;

      const [centres, readings] = await Promise.all([
        db
          .select()
          .from(energyCentres)
          .where(eq(energyCentres.isPublished, true))
          .orderBy(asc(energyCentres.sortOrder)),
        latestReadings(userId),
      ]);

      const byCentre = new Map(readings.map((r) => [r.centre_id, r]));

      res.json(
        centres.map((c) => {
          const r = byCentre.get(c.id);
          return {
            ...c,
            reading: r
              ? {
                  state: r.state,
                  note: r.note,
                  recordedBy: r.recorded_by,
                  recordedAt: r.recorded_at,
                }
              : null,
          };
        }),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/energy/centres/:id", isAuthenticated, async (req, res) => {
    try {
      const centreId = param(req, "id");

      const [centre] = await db
        .select()
        .from(energyCentres)
        .where(eq(energyCentres.id, centreId));
      if (!centre || !centre.isPublished) return res.status(404).json({ message: "Not found" });

      const [practices, protocols] = await Promise.all([
        db
          .select({
            id: routineHabits.id,
            title: routineHabits.title,
            shortDescription: routineHabits.shortDescription,
            action: centreHabits.action,
          })
          .from(centreHabits)
          .innerJoin(routineHabits, eq(centreHabits.habitId, routineHabits.id))
          .where(eq(centreHabits.centreId, centreId))
          .orderBy(asc(routineHabits.title)),
        db
          .select({
            id: wellnessRoutines.id,
            name: wellnessRoutines.name,
            durationDays: wellnessRoutines.durationDays,
            isPrimary: centreRoutines.isPrimary,
          })
          .from(centreRoutines)
          .innerJoin(wellnessRoutines, eq(centreRoutines.routineId, wellnessRoutines.id))
          .where(eq(centreRoutines.centreId, centreId))
          .orderBy(desc(centreRoutines.isPrimary), asc(wellnessRoutines.name)),
      ]);

      res.json({ ...centre, practices, protocols });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/energy/readings", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = readingSchema.parse(req.body);

      const [centre] = await db
        .select({ id: energyCentres.id })
        .from(energyCentres)
        .where(eq(energyCentres.id, input.centreId));
      if (!centre) return res.status(404).json({ message: "Centre not found" });

      const [created] = await db
        .insert(userCentreReadings)
        .values({
          userId,
          centreId: input.centreId,
          state: input.state,
          note: input.note ?? null,
          recordedBy: "member",
        })
        .returning();

      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/energy/readings/:centreId", isAuthenticated, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(userCentreReadings)
        .where(
          and(
            eq(userCentreReadings.userId, req.session!.userId!),
            eq(userCentreReadings.centreId, param(req, "centreId")),
          ),
        )
        .orderBy(asc(userCentreReadings.recordedAt));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/energy/cosmology", isAuthenticated, async (req, res) => {
    try {
      const [row] = await db
        .select()
        .from(userCosmology)
        .where(eq(userCosmology.userId, req.session!.userId!));
      res.json(row ?? null);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/energy/cosmology", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      // `disposition` is the coach's reading — a member can't write their own.
      const input = insertCosmologySchema
        .partial()
        .omit({ userId: true, disposition: true, lifePathNumber: true })
        .parse(req.body);

      const values = {
        ...input,
        userId,
        lifePathNumber: input.birthDate ? lifePathNumber(String(input.birthDate)) : null,
        updatedAt: new Date(),
      };

      const [saved] = await db
        .insert(userCosmology)
        .values(values)
        .onConflictDoUpdate({
          target: userCosmology.userId,
          set: {
            birthDate: values.birthDate ?? null,
            birthTime: values.birthTime ?? null,
            birthPlace: values.birthPlace ?? null,
            sunSign: values.sunSign ?? null,
            moonSign: values.moonSign ?? null,
            risingSign: values.risingSign ?? null,
            lifePathNumber: values.lifePathNumber,
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

  app.get("/api/admin/energy/centres", isAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(energyCentres).orderBy(asc(energyCentres.sortOrder));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/energy/centres", isAdmin, async (req, res) => {
    try {
      const input = insertEnergyCentreSchema.parse(req.body);
      const [created] = await db
        .insert(energyCentres)
        .values(input)
        .onConflictDoUpdate({ target: energyCentres.id, set: { ...input, updatedAt: new Date() } })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/energy/centres/:id", isAdmin, async (req, res) => {
    try {
      const input = insertEnergyCentreSchema.partial().parse(req.body);
      const [updated] = await db
        .update(energyCentres)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(energyCentres.id, param(req, "id")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/energy/centre-habits", isAdmin, async (req, res) => {
    try {
      const input = z
        .object({
          centreId: z.string().min(1),
          habitId: z.string().uuid(),
          action: centreActionEnum.default("moves"),
        })
        .parse(req.body);

      const [created] = await db
        .insert(centreHabits)
        .values(input)
        .onConflictDoUpdate({
          target: [centreHabits.centreId, centreHabits.habitId],
          set: { action: input.action },
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/energy/centre-routines", isAdmin, async (req, res) => {
    try {
      const input = z
        .object({
          centreId: z.string().min(1),
          routineId: z.string().min(1),
          isPrimary: z.boolean().default(false),
        })
        .parse(req.body);

      const [created] = await db
        .insert(centreRoutines)
        .values(input)
        .onConflictDoUpdate({
          target: [centreRoutines.centreId, centreRoutines.routineId],
          set: { isPrimary: input.isPrimary },
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/energy/member/:userId", isAdmin, async (req, res) => {
    try {
      const userId = param(req, "userId");
      const [readings, cosmology] = await Promise.all([
        db
          .select()
          .from(userCentreReadings)
          .where(eq(userCentreReadings.userId, userId))
          .orderBy(desc(userCentreReadings.recordedAt)),
        db.select().from(userCosmology).where(eq(userCosmology.userId, userId)),
      ]);
      res.json({ readings, cosmology: cosmology[0] ?? null });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/energy/member/:userId/reading", isAdmin, async (req, res) => {
    try {
      const input = readingSchema.parse(req.body);
      const [created] = await db
        .insert(userCentreReadings)
        .values({
          userId: param(req, "userId"),
          centreId: input.centreId,
          state: input.state,
          note: input.note ?? null,
          recordedBy: "coach",
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/energy/member/:userId/disposition", isAdmin, async (req, res) => {
    try {
      const userId = param(req, "userId");
      const { disposition } = z.object({ disposition: z.string().max(8000) }).parse(req.body);

      const [saved] = await db
        .insert(userCosmology)
        .values({ userId, disposition, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userCosmology.userId,
          set: { disposition, updatedAt: new Date() },
        })
        .returning();

      res.json(saved);
    } catch (err) {
      fail(res, err);
    }
  });
}
