/**
 * The read side of the intake form.
 *
 * `POST /api/applications` has existed since the beginning and lives in
 * server/routes.ts. Nothing ever read one back: no GET route, no storage
 * method, no admin surface. Someone filled in the mastermind form and the row
 * went into a table nobody could see.
 *
 * These are the two routes that close that. Both are admin-guarded. An
 * applicant has no session and can never read back what they submitted, which
 * is the correct behaviour — the notes on a row are internal.
 *
 * Registered from server/index.ts rather than server/routes.ts so the two
 * sessions working in this tree aren't editing the same file.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { APPLICATION_STATUSES } from "../../shared/schema.js";
import { isAuthenticated } from "../auth/sessionAuth.js";
import { isAdmin } from "../routes.js";
import { storage } from "../storage.js";
import { trackError } from "../telemetry/index.js";

const patchSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export function registerApplicationRoutes(app: Express): void {
  app.get(
    "/api/admin/applications",
    isAuthenticated,
    isAdmin,
    async (_req: Request, res: Response) => {
      try {
        res.json(await storage.getApplications());
      } catch (error) {
        trackError("applications.list", error);
        res.status(500).json({ message: "Failed to load applications" });
      }
    },
  );

  app.patch(
    "/api/admin/applications/:id",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        // Express 5 types params as string | string[]; a single :id is always
        // the former, but the cast has to be explicit.
        const id = parseInt(String(req.params.id), 10);
        if (Number.isNaN(id)) return res.status(400).json({ message: "Bad id" });

        const { status, notes } = patchSchema.parse(req.body ?? {});
        const updated = await storage.updateApplication(id, {
          status,
          notes: notes ?? undefined,
        });

        if (!updated) return res.status(404).json({ message: "Application not found" });
        res.json(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        trackError("applications.update", error);
        res.status(500).json({ message: "Failed to update" });
      }
    },
  );
}
