/**
 * Offerings — API
 *
 * Everything with a date on it that someone can join: retreats, masterminds,
 * webinars, one-off talks. One catalogue, one calendar, one roster shape.
 *
 * Member:
 *   GET  /api/offerings                  — what's on, filtered to what they may see
 *   GET  /api/offerings/upcoming         — the next sessions across everything
 *   GET  /api/offerings/mine             — what they're in, and what's next in it
 *   GET  /api/offerings/:idOrSlug        — one offering, its schedule and its hosts
 *   POST /api/offerings/:id/register     — register, or apply, depending on the mode
 *   POST /api/offerings/:id/withdraw     — leave, or take back an application
 *   GET  /api/hosts                      — who teaches here
 *   GET  /api/hosts/:slug                — one host, and what they're leading
 *
 * Admin:
 *   GET/POST/PUT/DELETE  /api/admin/offerings[/:id]
 *   GET   /api/admin/offerings/:id/roster
 *   PATCH /api/admin/offerings/registrations/:id      — decide on someone
 *   POST  /api/admin/offerings/:id/invite             — put someone in directly
 *   POST/PUT/DELETE /api/admin/offerings/:id/sessions[/:sessionId]
 *   PUT   /api/admin/offerings/:id/hosts              — set the host list
 *   PUT   /api/admin/sessions/:sessionId/hosts        — set a session's guests
 *   GET   /api/admin/sessions/:sessionId/attendance
 *   POST  /api/admin/sessions/:sessionId/attendance
 *   GET/POST/PUT/DELETE /api/admin/hosts[/:id]
 *
 * ── Two things this is careful about ──────────────────────────────────────
 *
 * `reviewNote` is the host's private note on an applicant. It is never
 * selected into a member-facing payload — not hidden in the UI, not present.
 *
 * `meetingUrl` is the door. It is stripped from every response except to
 * someone whose registration is confirmed. The schedule itself is public,
 * because for a talk the agenda is the reason to come; the link is not.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { db } from "../db.js";
import { eq, and, or, inArray, asc, desc, ne, gte, sql, count, isNotNull } from "drizzle-orm";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import { z } from "zod";
import { track } from "../telemetry/index.js";
import {
  offerings,
  offeringRegistrations,
  offeringSessions,
  offeringHosts,
  sessionHosts,
  sessionAttendance,
  hosts,
  membershipTiers,
  users,
  insertOfferingSchema,
  insertOfferingSessionSchema,
  insertHostSchema,
  registrationStatusEnum,
  hostRoleEnum,
  type Offering,
  type OfferingSession,
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

/** Express 5 types route params as `string | string[]`. Normalise. */
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── The gate ──────────────────────────────────────────────────────────────

/**
 * This member's tier rank, and whether they're an admin.
 *
 * Same rule the community uses. Kept as its own function rather than inlined
 * so there is one answer to "how senior is this member" in the codebase.
 */
async function standing(userId: string): Promise<{ rank: number; admin: boolean }> {
  const [me] = await db
    .select({ tier: users.membershipTier, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId));

  const [tier] = me?.tier
    ? await db
        .select({ rank: membershipTiers.rank })
        .from(membershipTiers)
        .where(eq(membershipTiers.id, me.tier))
    : [];

  return { rank: tier?.rank ?? 0, admin: me?.isAdmin === "true" };
}

/**
 * Strip the door.
 *
 * Called on every member-facing payload. `confirmed` is the only thing that
 * opens it, and it's passed in rather than re-derived so a caller can't forget
 * to check and get a truthy default.
 */
function present<T extends { meetingUrl?: string | null; replayUrl?: string | null }>(
  row: T,
  confirmed: boolean,
): T {
  if (confirmed) return row;
  return { ...row, meetingUrl: null, replayUrl: null };
}

/** Confirmed seats taken. An application doesn't hold a seat. */
async function takenSeats(offeringId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(offeringRegistrations)
    .where(
      and(
        eq(offeringRegistrations.offeringId, offeringId),
        eq(offeringRegistrations.status, "confirmed"),
      ),
    );
  return Number(row?.n ?? 0);
}

/** null capacity means unlimited — right for a webinar, wrong for a mastermind. */
function seatsRemaining(offering: Offering, taken: number): number | null {
  if (offering.capacity == null) return null;
  return Math.max(0, offering.capacity - taken);
}

/** Hosts for a set of offerings, in one query. */
async function hostsForOfferings(offeringIds: string[]) {
  const map = new Map<string, (typeof hosts.$inferSelect & { role: string })[]>();
  if (offeringIds.length === 0) return map;

  const rows = await db
    .select({ offeringId: offeringHosts.offeringId, role: offeringHosts.role, host: hosts })
    .from(offeringHosts)
    .innerJoin(hosts, eq(hosts.id, offeringHosts.hostId))
    .where(inArray(offeringHosts.offeringId, offeringIds))
    .orderBy(asc(offeringHosts.sortOrder));

  for (const r of rows) {
    const list = map.get(r.offeringId) ?? [];
    list.push({ ...r.host, role: r.role });
    map.set(r.offeringId, list);
  }
  return map;
}

/** Guest hosts for a set of sessions, in one query. */
async function hostsForSessions(sessionIds: string[]) {
  const map = new Map<string, (typeof hosts.$inferSelect)[]>();
  if (sessionIds.length === 0) return map;

  const rows = await db
    .select({ sessionId: sessionHosts.sessionId, host: hosts })
    .from(sessionHosts)
    .innerJoin(hosts, eq(hosts.id, sessionHosts.hostId))
    .where(inArray(sessionHosts.sessionId, sessionIds))
    .orderBy(asc(sessionHosts.sortOrder));

  for (const r of rows) {
    const list = map.get(r.sessionId) ?? [];
    list.push(r.host);
    map.set(r.sessionId, list);
  }
  return map;
}

export function registerOfferingRoutes(app: Express) {
  // ─── MEMBER ──────────────────────────────────────────────────────────────

  /**
   * What's on.
   *
   * Optional `?kind=` and `?format=` narrow it; `?when=upcoming|past` splits on
   * the end date, because a finished retreat is a different question from a
   * forthcoming one and both are worth being able to ask.
   */
  app.get("/api/offerings", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const { rank, admin } = await standing(userId);
      const { kind, format, when } = req.query as Record<string, string | undefined>;

      const filters = [ne(offerings.status, "draft")];
      if (!admin) filters.push(sql`${offerings.minTierRank} <= ${rank}`);
      if (kind) filters.push(eq(offerings.kind, kind));
      if (format) filters.push(eq(offerings.format, format));
      if (when === "past") filters.push(sql`${offerings.endDate} < current_date`);
      if (when === "upcoming") {
        filters.push(
          sql`(${offerings.endDate} IS NULL OR ${offerings.endDate} >= current_date)`,
        );
      }

      const rows = await db
        .select()
        .from(offerings)
        .where(and(...filters))
        .orderBy(desc(offerings.isFeatured), asc(offerings.startDate), asc(offerings.sortOrder));

      if (rows.length === 0) return res.json([]);

      const ids = rows.map((o) => o.id);

      const [mine, seats, hostMap] = await Promise.all([
        db
          .select({
            offeringId: offeringRegistrations.offeringId,
            status: offeringRegistrations.status,
          })
          .from(offeringRegistrations)
          .where(
            and(
              eq(offeringRegistrations.userId, userId),
              inArray(offeringRegistrations.offeringId, ids),
            ),
          ),
        db
          .select({ offeringId: offeringRegistrations.offeringId, n: count() })
          .from(offeringRegistrations)
          .where(
            and(
              inArray(offeringRegistrations.offeringId, ids),
              eq(offeringRegistrations.status, "confirmed"),
            ),
          )
          .groupBy(offeringRegistrations.offeringId),
        hostsForOfferings(ids),
      ]);

      const myStatus = new Map(mine.map((m) => [m.offeringId, m.status]));
      const taken = new Map(seats.map((s) => [s.offeringId, Number(s.n)]));

      res.json(
        rows.map((o) => {
          const status = myStatus.get(o.id) ?? null;
          return {
            ...present(o, status === "confirmed"),
            myStatus: status,
            seatsRemaining: seatsRemaining(o, taken.get(o.id) ?? 0),
            hosts: hostMap.get(o.id) ?? [],
          };
        }),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * The next things happening, across every offering this member can see.
   *
   * This is the calendar. It answers "what is on this month" in one query
   * rather than one per offering, which is the whole reason sessions live in
   * their own table instead of as a blob on the offering.
   */
  app.get("/api/offerings/upcoming", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const { rank, admin } = await standing(userId);
      const limit = Math.min(Number(req.query.limit) || 20, 100);

      const visible = [ne(offerings.status, "draft")];
      if (!admin) visible.push(sql`${offerings.minTierRank} <= ${rank}`);

      const rows = await db
        .select({ session: offeringSessions, offering: offerings })
        .from(offeringSessions)
        .innerJoin(offerings, eq(offerings.id, offeringSessions.offeringId))
        .where(
          and(
            ...visible,
            isNotNull(offeringSessions.startsAt),
            gte(offeringSessions.startsAt, new Date()),
          ),
        )
        .orderBy(asc(offeringSessions.startsAt))
        .limit(limit);

      if (rows.length === 0) return res.json([]);

      const registrations = await db
        .select({
          offeringId: offeringRegistrations.offeringId,
          status: offeringRegistrations.status,
        })
        .from(offeringRegistrations)
        .where(
          and(
            eq(offeringRegistrations.userId, userId),
            inArray(
              offeringRegistrations.offeringId,
              rows.map((r) => r.offering.id),
            ),
          ),
        );
      const myStatus = new Map(registrations.map((r) => [r.offeringId, r.status]));

      const guestMap = await hostsForSessions(rows.map((r) => r.session.id));

      res.json(
        rows.map(({ session, offering }) => {
          const confirmed = myStatus.get(offering.id) === "confirmed";
          return {
            ...present(session, confirmed),
            guests: guestMap.get(session.id) ?? [],
            offering: {
              id: offering.id,
              slug: offering.slug,
              name: offering.name,
              kind: offering.kind,
              format: offering.format,
              timezone: offering.timezone,
            },
            myStatus: myStatus.get(offering.id) ?? null,
          };
        }),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  /** What this member is actually in. */
  app.get("/api/offerings/mine", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;

      const rows = await db
        .select({ registration: offeringRegistrations, offering: offerings })
        .from(offeringRegistrations)
        .innerJoin(offerings, eq(offerings.id, offeringRegistrations.offeringId))
        .where(
          and(
            eq(offeringRegistrations.userId, userId),
            ne(offeringRegistrations.status, "withdrawn"),
          ),
        )
        .orderBy(asc(offerings.startDate));

      if (rows.length === 0) return res.json([]);

      // The next session in each, so the card can say when rather than just what.
      const next = await db
        .select({ session: offeringSessions })
        .from(offeringSessions)
        .where(
          and(
            inArray(
              offeringSessions.offeringId,
              rows.map((r) => r.offering.id),
            ),
            isNotNull(offeringSessions.startsAt),
            gte(offeringSessions.startsAt, new Date()),
          ),
        )
        .orderBy(asc(offeringSessions.startsAt));

      const nextByOffering = new Map<string, OfferingSession>();
      for (const { session } of next) {
        if (!nextByOffering.has(session.offeringId)) {
          nextByOffering.set(session.offeringId, session);
        }
      }

      const hostMap = await hostsForOfferings(rows.map((r) => r.offering.id));

      res.json(
        rows.map(({ registration, offering }) => {
          const confirmed = registration.status === "confirmed";
          const upcoming = nextByOffering.get(offering.id) ?? null;
          return {
            ...present(offering, confirmed),
            myStatus: registration.status,
            // reviewNote is the host's. Never leaves the admin surface.
            myNote: registration.note,
            hosts: hostMap.get(offering.id) ?? [],
            nextSession: upcoming ? present(upcoming, confirmed) : null,
          };
        }),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/offerings/:idOrSlug", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const key = param(req, "idOrSlug");
      const { rank, admin } = await standing(userId);

      const [offering] = await db
        .select()
        .from(offerings)
        .where(UUID.test(key) ? eq(offerings.id, key) : eq(offerings.slug, key));

      // 404 rather than 403 throughout: something you can't be in shouldn't
      // announce that it exists.
      if (!offering || offering.status === "draft") {
        return res.status(404).json({ message: "Not found" });
      }
      if (!admin && offering.minTierRank > rank) {
        return res.status(404).json({ message: "Not found" });
      }

      const [registration] = await db
        .select({
          status: offeringRegistrations.status,
          note: offeringRegistrations.note,
        })
        .from(offeringRegistrations)
        .where(
          and(
            eq(offeringRegistrations.offeringId, offering.id),
            eq(offeringRegistrations.userId, userId),
          ),
        );

      const confirmed = registration?.status === "confirmed";

      // The schedule is public; the link is not. For a talk the agenda is the
      // reason to come, so hiding it until someone commits gets the incentive
      // backwards.
      const sessions = await db
        .select()
        .from(offeringSessions)
        .where(eq(offeringSessions.offeringId, offering.id))
        .orderBy(asc(offeringSessions.orderIndex), asc(offeringSessions.startsAt));

      const [hostList, guestMap, taken] = await Promise.all([
        hostsForOfferings([offering.id]),
        hostsForSessions(sessions.map((s) => s.id)),
        takenSeats(offering.id),
      ]);

      track("offering.view", {
        userId,
        surface: "offering_detail",
        subjectId: offering.id,
        props: { kind: offering.kind, status: offering.status },
      });

      res.json({
        ...present(offering, confirmed),
        myStatus: registration?.status ?? null,
        myNote: registration?.note ?? null,
        seatsRemaining: seatsRemaining(offering, taken),
        hosts: hostList.get(offering.id) ?? [],
        sessions: sessions.map((s) => ({
          ...present(s, confirmed),
          guests: guestMap.get(s.id) ?? [],
        })),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Join.
   *
   * The mode decides what joining means, which is the point of having a mode:
   * an open webinar confirms you on the spot, a mastermind takes an
   * application, an invite-only room refuses. Capacity is checked in the same
   * place for all three, so a full open event puts you on the waitlist rather
   * than failing.
   */
  app.post("/api/offerings/:id/register", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const offeringId = param(req, "id");
      const { note } = z.object({ note: z.string().max(4000).optional() }).parse(req.body ?? {});
      const { rank, admin } = await standing(userId);

      const [offering] = await db.select().from(offerings).where(eq(offerings.id, offeringId));
      if (!offering || offering.status === "draft") {
        return res.status(404).json({ message: "Not found" });
      }
      if (!admin && offering.minTierRank > rank) {
        return res.status(404).json({ message: "Not found" });
      }

      if (offering.registrationMode === "invite") {
        return res.status(403).json({ message: "This one is by invitation." });
      }
      if (!["open", "running"].includes(offering.status)) {
        return res.status(409).json({
          message:
            offering.status === "complete" ? "This has already happened." : "This isn't open yet.",
        });
      }

      const full =
        offering.capacity != null && (await takenSeats(offeringId)) >= offering.capacity;

      // An application is a request, so a full room doesn't block one — the
      // host may still make space, and refusing here would lose the interest.
      const status =
        offering.registrationMode === "open" ? (full ? "waitlist" : "confirmed") : "applied";

      // Re-registering after withdrawing resets the row rather than stacking
      // a second one.
      const [saved] = await db
        .insert(offeringRegistrations)
        .values({ offeringId, userId, note: note ?? null, status })
        .onConflictDoUpdate({
          target: [offeringRegistrations.offeringId, offeringRegistrations.userId],
          set: {
            status,
            note: note ?? null,
            decidedAt: status === "confirmed" ? new Date() : null,
          },
        })
        .returning({
          id: offeringRegistrations.id,
          status: offeringRegistrations.status,
          note: offeringRegistrations.note,
        });

      // Three different facts, not one — an application that gets declined and
      // a place taken on the spot are not the same event, and rolling them up
      // would make the funnel unreadable.
      track(
        status === "confirmed"
          ? "offering.register"
          : status === "waitlist"
            ? "offering.waitlist"
            : "offering.apply",
        {
          userId,
          surface: "offering_detail",
          subjectId: offeringId,
          props: {
            kind: offering.kind,
            format: offering.format,
            mode: offering.registrationMode,
            priceCents: offering.priceCents,
          },
        },
      );

      res.status(201).json(saved);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/offerings/:id/withdraw", isAuthenticated, async (req, res) => {
    try {
      const [updated] = await db
        .update(offeringRegistrations)
        .set({ status: "withdrawn", decidedAt: new Date() })
        .where(
          and(
            eq(offeringRegistrations.offeringId, param(req, "id")),
            eq(offeringRegistrations.userId, req.session!.userId!),
          ),
        )
        .returning({ id: offeringRegistrations.id, status: offeringRegistrations.status });

      if (!updated) return res.status(404).json({ message: "You're not on this roster." });

      track("offering.withdraw", {
        userId: req.session!.userId!,
        surface: "offering_detail",
        subjectId: param(req, "id"),
      });

      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── HOSTS, member-facing ────────────────────────────────────────────────

  app.get("/api/hosts", isAuthenticated, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(hosts)
        .where(eq(hosts.isActive, true))
        .orderBy(asc(hosts.sortOrder), asc(hosts.name));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/hosts/:slug", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const { rank, admin } = await standing(userId);

      const [host] = await db.select().from(hosts).where(eq(hosts.slug, param(req, "slug")));
      if (!host || !host.isActive) return res.status(404).json({ message: "Not found" });

      const visible = [ne(offerings.status, "draft")];
      if (!admin) visible.push(sql`${offerings.minTierRank} <= ${rank}`);

      const leading = await db
        .select({ offering: offerings, role: offeringHosts.role })
        .from(offeringHosts)
        .innerJoin(offerings, eq(offerings.id, offeringHosts.offeringId))
        .where(and(eq(offeringHosts.hostId, host.id), ...visible))
        .orderBy(asc(offerings.startDate));

      res.json({
        ...host,
        offerings: leading.map((l) => ({ ...present(l.offering, false), role: l.role })),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN — offerings ───────────────────────────────────────────────────

  app.get("/api/admin/offerings", isAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(offerings)
        .orderBy(asc(offerings.sortOrder), desc(offerings.startDate));

      const hostMap = await hostsForOfferings(rows.map((o) => o.id));

      // Roster counts by status, so the list can show "6 confirmed, 3 applied"
      // without a query per row.
      const counts = await db
        .select({
          offeringId: offeringRegistrations.offeringId,
          status: offeringRegistrations.status,
          n: count(),
        })
        .from(offeringRegistrations)
        .groupBy(offeringRegistrations.offeringId, offeringRegistrations.status);

      const byOffering = new Map<string, Record<string, number>>();
      for (const c of counts) {
        const bucket = byOffering.get(c.offeringId) ?? {};
        bucket[c.status] = Number(c.n);
        byOffering.set(c.offeringId, bucket);
      }

      res.json(
        rows.map((o) => ({
          ...o,
          hosts: hostMap.get(o.id) ?? [],
          counts: byOffering.get(o.id) ?? {},
        })),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/offerings", isAdmin, async (req, res) => {
    try {
      const input = insertOfferingSchema.parse(req.body);
      const [created] = await db.insert(offerings).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/offerings/:id", isAdmin, async (req, res) => {
    try {
      const input = insertOfferingSchema.partial().parse(req.body);
      const [updated] = await db
        .update(offerings)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(offerings.id, param(req, "id")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/offerings/:id", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(offerings)
        .where(eq(offerings.id, param(req, "id")))
        .returning({ id: offerings.id });
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/offerings/:id/roster", isAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({
          registration: offeringRegistrations,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(offeringRegistrations)
        .leftJoin(users, eq(offeringRegistrations.userId, users.id))
        .where(eq(offeringRegistrations.offeringId, param(req, "id")))
        .orderBy(asc(offeringRegistrations.appliedAt));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.patch("/api/admin/offerings/registrations/:id", isAdmin, async (req, res) => {
    try {
      const input = z
        .object({
          status: registrationStatusEnum.optional(),
          reviewNote: z.string().max(4000).nullable().optional(),
        })
        .parse(req.body);

      const [updated] = await db
        .update(offeringRegistrations)
        .set({ ...input, ...(input.status ? { decidedAt: new Date() } : {}) })
        .where(eq(offeringRegistrations.id, param(req, "id")))
        .returning();

      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  /** Put someone in directly — the invite-only path, and the manual override. */
  app.post("/api/admin/offerings/:id/invite", isAdmin, async (req, res) => {
    try {
      const offeringId = param(req, "id");
      const { userId, status } = z
        .object({
          userId: z.string().min(1),
          status: registrationStatusEnum.default("confirmed"),
        })
        .parse(req.body);

      const [saved] = await db
        .insert(offeringRegistrations)
        .values({ offeringId, userId, status, decidedAt: new Date() })
        .onConflictDoUpdate({
          target: [offeringRegistrations.offeringId, offeringRegistrations.userId],
          set: { status, decidedAt: new Date() },
        })
        .returning();

      res.status(201).json(saved);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN — sessions ────────────────────────────────────────────────────

  app.post("/api/admin/offerings/:id/sessions", isAdmin, async (req, res) => {
    try {
      const offeringId = param(req, "id");
      const existing = await db
        .select({ orderIndex: offeringSessions.orderIndex })
        .from(offeringSessions)
        .where(eq(offeringSessions.offeringId, offeringId));
      const nextIndex = existing.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;

      const input = insertOfferingSessionSchema.parse({
        orderIndex: nextIndex,
        ...req.body,
        offeringId,
        ...(req.body?.startsAt ? { startsAt: new Date(req.body.startsAt) } : {}),
      });

      const [created] = await db.insert(offeringSessions).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/sessions/:sessionId", isAdmin, async (req, res) => {
    try {
      const input = insertOfferingSessionSchema.partial().parse({
        ...req.body,
        ...(req.body?.startsAt ? { startsAt: new Date(req.body.startsAt) } : {}),
      });
      const [updated] = await db
        .update(offeringSessions)
        .set(input)
        .where(eq(offeringSessions.id, param(req, "sessionId")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/sessions/:sessionId", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(offeringSessions)
        .where(eq(offeringSessions.id, param(req, "sessionId")))
        .returning({ id: offeringSessions.id });
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN — who's leading ───────────────────────────────────────────────

  /**
   * Replace an offering's host list.
   *
   * Delete-then-insert inside one transaction. Doing it as two separate calls
   * is how a network blip leaves an offering with no hosts at all.
   */
  app.put("/api/admin/offerings/:id/hosts", isAdmin, async (req, res) => {
    try {
      const offeringId = param(req, "id");
      const { hosts: list } = z
        .object({
          hosts: z.array(
            z.object({ hostId: z.string().uuid(), role: hostRoleEnum.default("lead") }),
          ),
        })
        .parse(req.body);

      await db.transaction(async (tx) => {
        await tx.delete(offeringHosts).where(eq(offeringHosts.offeringId, offeringId));
        if (list.length > 0) {
          await tx.insert(offeringHosts).values(
            list.map((h, i) => ({ offeringId, hostId: h.hostId, role: h.role, sortOrder: i })),
          );
        }
      });

      const map = await hostsForOfferings([offeringId]);
      res.json(map.get(offeringId) ?? []);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/sessions/:sessionId/hosts", isAdmin, async (req, res) => {
    try {
      const sessionId = param(req, "sessionId");
      const { hostIds } = z.object({ hostIds: z.array(z.string().uuid()) }).parse(req.body);

      await db.transaction(async (tx) => {
        await tx.delete(sessionHosts).where(eq(sessionHosts.sessionId, sessionId));
        if (hostIds.length > 0) {
          await tx
            .insert(sessionHosts)
            .values(hostIds.map((hostId, i) => ({ sessionId, hostId, sortOrder: i })));
        }
      });

      const map = await hostsForSessions([sessionId]);
      res.json(map.get(sessionId) ?? []);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN — attendance ──────────────────────────────────────────────────

  app.get("/api/admin/sessions/:sessionId/attendance", isAdmin, async (req, res) => {
    try {
      const sessionId = param(req, "sessionId");

      const [session] = await db
        .select()
        .from(offeringSessions)
        .where(eq(offeringSessions.id, sessionId));
      if (!session) return res.status(404).json({ message: "Not found" });

      // The roster is the list to mark, so this returns everyone confirmed —
      // present or not — rather than only those already recorded.
      const roster = await db
        .select({
          userId: offeringRegistrations.userId,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(offeringRegistrations)
        .leftJoin(users, eq(offeringRegistrations.userId, users.id))
        .where(
          and(
            eq(offeringRegistrations.offeringId, session.offeringId),
            eq(offeringRegistrations.status, "confirmed"),
          ),
        );

      const marks = await db
        .select()
        .from(sessionAttendance)
        .where(eq(sessionAttendance.sessionId, sessionId));
      const byUser = new Map(marks.map((m) => [m.userId, m]));

      res.json(
        roster.map((r) => ({
          ...r,
          present: byUser.get(r.userId)?.present ?? null,
          note: byUser.get(r.userId)?.note ?? null,
        })),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/sessions/:sessionId/attendance", isAdmin, async (req, res) => {
    try {
      const sessionId = param(req, "sessionId");
      const { userId, present: wasPresent, note } = z
        .object({
          userId: z.string().min(1),
          present: z.boolean(),
          note: z.string().max(2000).nullable().optional(),
        })
        .parse(req.body);

      const [saved] = await db
        .insert(sessionAttendance)
        .values({ sessionId, userId, present: wasPresent, note: note ?? null })
        .onConflictDoUpdate({
          target: [sessionAttendance.sessionId, sessionAttendance.userId],
          set: { present: wasPresent, note: note ?? null, recordedAt: new Date() },
        })
        .returning();

      track("session.attend", {
        userId,
        surface: "admin_attendance",
        subjectId: sessionId,
        props: { present: wasPresent },
      });

      res.json(saved);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN — hosts ───────────────────────────────────────────────────────

  app.get("/api/admin/hosts", isAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(hosts).orderBy(asc(hosts.sortOrder), asc(hosts.name));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/hosts", isAdmin, async (req, res) => {
    try {
      const input = insertHostSchema.parse(req.body);
      const [created] = await db.insert(hosts).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/hosts/:id", isAdmin, async (req, res) => {
    try {
      const input = insertHostSchema.partial().parse(req.body);
      const [updated] = await db
        .update(hosts)
        .set(input)
        .where(eq(hosts.id, param(req, "id")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/hosts/:id", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(hosts)
        .where(eq(hosts.id, param(req, "id")))
        .returning({ id: hosts.id });
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });
}
