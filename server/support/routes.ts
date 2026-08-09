/**
 * Support requests.
 *
 * `POST /api/support` is **unauthenticated**, which is a deliberate exception
 * to the rule stated in ErrorBoundary. Two things force it: both app stores
 * require a support URL a reviewer can open without an account, and the
 * member most likely to need support is the one who cannot sign in. A support
 * form that requires a session is useless to exactly the people it exists for.
 *
 * Opening a public write endpoint means owning the abuse case, so it is
 * throttled per IP through the same `login_attempts` counter the login route
 * uses — Postgres rather than process memory, for the reason set out in
 * shared/models/security.ts: this runs on Vercel Functions, where a memory
 * counter is one counter per instance and therefore not a limit.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { supportRequests, SUPPORT_CATEGORIES } from "../../shared/models/support.js";
import { isAuthenticated } from "../auth/sessionAuth.js";
import { isAdmin } from "../routes.js";
import { storage } from "../storage.js";
import { track, trackError } from "../telemetry/index.js";

/**
 * Deliberately tighter than the login throttle.
 *
 * Login is something a legitimate person retries; a support request is not.
 * Five an hour from one address is generous for a human and useless for a
 * spammer.
 */
const SUPPORT_THROTTLE = {
  max: 5,
  windowMs: 60 * 60 * 1000,
  lockMs: 60 * 60 * 1000,
} as const;

const submitSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(254),
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  // Long enough for someone to actually explain a problem, bounded so the
  // endpoint cannot be used to write megabytes into the table.
  message: z.string().trim().min(10, "Please tell us a little more").max(5000),
});

function clientIp(req: Request): string {
  // `app.set("trust proxy", 1)` is set in sessionAuth, so req.ip already
  // reflects the last hop rather than Vercel's own address.
  return req.ip ?? "unknown";
}

/** Returns seconds to wait, or 0 if the caller may proceed. */
async function throttle(ip: string): Promise<number> {
  const key = `support:ip:${ip}`;
  const now = Date.now();

  const { rows } = await db.execute<{
    attempts: number;
    window_start: Date;
    locked_until: Date | null;
  }>(sql`
    select attempts, window_start, locked_until
    from login_attempts where identifier = ${key}
  `);
  const row = rows[0];

  if (row?.locked_until && new Date(row.locked_until).getTime() > now) {
    return Math.ceil((new Date(row.locked_until).getTime() - now) / 1000);
  }

  const windowExpired =
    !row || now - new Date(row.window_start).getTime() > SUPPORT_THROTTLE.windowMs;
  const attempts = windowExpired ? 1 : row.attempts + 1;
  const lockedUntil =
    attempts > SUPPORT_THROTTLE.max ? new Date(now + SUPPORT_THROTTLE.lockMs) : null;

  await db.execute(sql`
    insert into login_attempts (identifier, attempts, window_start, locked_until)
    values (${key}, ${attempts}, ${windowExpired ? new Date(now) : row!.window_start}, ${lockedUntil})
    on conflict (identifier) do update
      set attempts = excluded.attempts,
          window_start = excluded.window_start,
          locked_until = excluded.locked_until
  `);

  return lockedUntil ? Math.ceil(SUPPORT_THROTTLE.lockMs / 1000) : 0;
}

export function registerSupportRoutes(app: Express): void {
  app.post("/api/support", async (req: Request, res: Response) => {
    try {
      const retryAfter = await throttle(clientIp(req));
      if (retryAfter > 0) {
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({
          message: "Too many requests. Please email us directly at team@sakredbody.com.",
        });
      }

      const input = submitSchema.parse(req.body);

      // Attach the member when we know who they are — but never require it.
      // req.session.userId is populated by the cookie on web and by the bearer
      // token in the native shells.
      const userId = req.session?.userId ?? null;

      const [created] = await db
        .insert(supportRequests)
        .values({ ...input, email: input.email.toLowerCase(), userId })
        .returning({ id: supportRequests.id });

      track("support.submitted", {
        userId: userId ?? undefined,
        surface: "support",
        props: { category: input.category, signedIn: Boolean(userId) },
      });

      res.status(201).json({ id: created.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("support.submit", error);
      res.status(500).json({
        message: "We couldn't send that. Please email team@sakredbody.com instead.",
      });
    }
  });

  app.get(
    "/api/admin/support",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const status = typeof req.query.status === "string" ? req.query.status : null;
        const rows = await db
          .select()
          .from(supportRequests)
          .where(status ? eq(supportRequests.status, status) : undefined)
          .orderBy(desc(supportRequests.createdAt))
          .limit(200);
        res.json(rows);
      } catch (error) {
        trackError("support.list", error);
        res.status(500).json({ message: "Failed to load support requests" });
      }
    },
  );

  app.patch(
    "/api/admin/support/:id",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const { status } = z
          .object({ status: z.enum(["open", "answered", "closed"]) })
          .parse(req.body);

        // Express 5 types params as string | string[]; a single :id is always
        // the former, but the cast has to be explicit.
        const id = String(req.params.id);

        const [updated] = await db
          .update(supportRequests)
          .set({ status, updatedAt: new Date() })
          .where(eq(supportRequests.id, id))
          .returning({ id: supportRequests.id, status: supportRequests.status });

        if (!updated) return res.status(404).json({ message: "Not found" });
        res.json(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        trackError("support.update", error);
        res.status(500).json({ message: "Failed to update" });
      }
    },
  );
}
