/**
 * Retreats and their properties — the write side.
 *
 * `GET /api/retreats` has always existed. Nothing else did: no POST, no
 * PATCH, no DELETE, anywhere. The rows came from server/seed.ts, hardcoded,
 * which meant changing a date or adding a format was a deploy.
 *
 * Bookings against a retreat were already manageable (`/api/admin/bookings`)
 * and so were partners. This is the missing half — the retreat itself.
 *
 * Registered from server/index.ts rather than server/routes.ts so the two
 * sessions working in this tree aren't editing the same file.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/sessionAuth.js";
import { isAdmin } from "../routes.js";
import { storage } from "../storage.js";
import { trackError } from "../telemetry/index.js";

/**
 * Dates are `text` in the schema rather than `date`, which the marketing
 * pages rely on to print things like "March 2026" alongside real ISO dates.
 * Validation therefore checks presence and length, not format.
 */
const retreatSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  location: z.string().trim().min(1, "Location is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(4000),
  startDate: z.string().trim().min(1, "Start date is required").max(60),
  endDate: z.string().trim().min(1, "End date is required").max(60),
  capacity: z.number().int().min(1).max(200).default(12),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
});

const propertySchema = z.object({
  retreatId: z.number().int().positive(),
  name: z.string().trim().min(1, "Name is required").max(200),
  tier: z.string().trim().min(1, "Tier is required").max(60),
  description: z.string().trim().min(1, "Description is required").max(4000),
  bedrooms: z.number().int().min(0).max(50).default(1),
  bathrooms: z.number().int().min(0).max(50).default(1),
  maxGuests: z.number().int().min(1).max(100).default(2),
  // Whole currency units, as stored. No cents anywhere in this table.
  pricePerNight: z.number().int().min(0).max(1_000_000),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  amenities: z.array(z.string().trim().max(120)).max(60).nullable().optional(),
  available: z.boolean().default(true),
});

function parseId(raw: unknown): number | null {
  const id = parseInt(String(raw), 10);
  return Number.isNaN(id) ? null : id;
}

export function registerRetreatAdminRoutes(app: Express): void {
  // ── Retreats ─────────────────────────────────────────────────────────
  // The public GET filters to active; this one does not, because a draft you
  // cannot see is a draft you cannot finish.
  app.get("/api/admin/retreats", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getAllRetreats());
    } catch (error) {
      trackError("retreats.list", error);
      res.status(500).json({ message: "Failed to load retreats" });
    }
  });

  app.post("/api/admin/retreats", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const input = retreatSchema.parse(req.body ?? {});
      res.status(201).json(await storage.createRetreat(input));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("retreats.create", error);
      res.status(500).json({ message: "Failed to create retreat" });
    }
  });

  app.patch("/api/admin/retreats/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ message: "Bad id" });

      const input = retreatSchema.partial().parse(req.body ?? {});
      const updated = await storage.updateRetreat(id, input);
      if (!updated) return res.status(404).json({ message: "Retreat not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("retreats.update", error);
      res.status(500).json({ message: "Failed to update retreat" });
    }
  });

  /**
   * Deletes the retreat and its properties. Bookings are deliberately left
   * alone: a booking is a record of something a member asked for, and
   * removing the retreat should not erase that they asked. The bookings tab
   * will show the retreat id with nothing behind it, which is honest.
   *
   * Setting `active: false` is almost always the better move, and the admin
   * UI leads with it.
   */
  app.delete("/api/admin/retreats/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ message: "Bad id" });

      const ok = await storage.deleteRetreat(id);
      if (!ok) return res.status(404).json({ message: "Retreat not found" });
      res.status(204).end();
    } catch (error) {
      trackError("retreats.delete", error);
      res.status(500).json({ message: "Failed to delete retreat" });
    }
  });

  // ── Properties ───────────────────────────────────────────────────────
  app.get("/api/admin/properties", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getAllProperties());
    } catch (error) {
      trackError("properties.list", error);
      res.status(500).json({ message: "Failed to load properties" });
    }
  });

  app.post("/api/admin/properties", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const input = propertySchema.parse(req.body ?? {});

      // No foreign key on properties.retreat_id, so nothing at the database
      // level would stop this creating an orphan.
      const parent = await storage.getRetreat(input.retreatId);
      if (!parent) return res.status(400).json({ message: "That retreat doesn't exist" });

      res.status(201).json(await storage.createProperty(input));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("properties.create", error);
      res.status(500).json({ message: "Failed to create property" });
    }
  });

  app.patch("/api/admin/properties/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ message: "Bad id" });

      const input = propertySchema.partial().parse(req.body ?? {});
      if (input.retreatId !== undefined) {
        const parent = await storage.getRetreat(input.retreatId);
        if (!parent) return res.status(400).json({ message: "That retreat doesn't exist" });
      }

      const updated = await storage.updateProperty(id, input);
      if (!updated) return res.status(404).json({ message: "Property not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("properties.update", error);
      res.status(500).json({ message: "Failed to update property" });
    }
  });

  app.delete("/api/admin/properties/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ message: "Bad id" });

      const ok = await storage.deleteProperty(id);
      if (!ok) return res.status(404).json({ message: "Property not found" });
      res.status(204).end();
    } catch (error) {
      trackError("properties.delete", error);
      res.status(500).json({ message: "Failed to delete property" });
    }
  });
}
