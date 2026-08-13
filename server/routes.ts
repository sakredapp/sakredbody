import type { Express, Request, Response, NextFunction } from "express";
import { zodMessage } from "../shared/utils/zodMessage.js";
import type { Server } from "http";
import { storage } from "./storage.js";
import { db } from "./db.js";
import { eq } from "drizzle-orm";
import { api } from "../shared/routes.js";
import { z } from "zod";
import { isAuthenticated } from "./auth/index.js";
import "./auth/sessionAuth.js"; // session type augmentation
import { insertPartnerSchema, insertPartnerServiceSchema, users } from "../shared/schema.js";
import { submitExecutiveApplicationSchema, scoreApplication, EXEC_QUESTIONS } from "../shared/models/executive.js";
import {
  registerCoachingRoutes,
  registerCoachRelationshipRoutes,
  registerCoachClientRoutes,
  registerCoachingMessageRoutes,
  registerCoachPlanRoutes,
} from "./coaching/index.js";
import { registerMasterclassRoutes } from "./masterclass/index.js";
import { registerShopRoutes } from "./shop/index.js";
import { registerLibraryRoutes } from "./library/index.js";
import { registerEnergyRoutes } from "./energy/index.js";
import { registerOfferingRoutes } from "./offerings/index.js";
import { registerDailyRoutes } from "./daily/index.js";
import { registerTodayRoutes } from "./today/index.js";
import { registerCommunityRoutes } from "./community/index.js";
import { registerTelemetryRoutes } from "./telemetry/index.js";
import { registerProfileRoutes } from "./profile/routes.js";
import { registerWinRoutes } from "./wins/index.js";
import { registerMemberRoutes } from "./members/index.js";
import { registerTrainingRoutes } from "./training/index.js";
import { registerMemberWorkoutRoutes } from "./training/memberWorkouts.js";
import { registerHealthRoutes } from "./health/index.js";
import { registerTerrainRoutes } from "./terrain/index.js";
import { registerHabitRoutes } from "./habits/index.js";
import { registerModerationRoutes } from "./moderation/index.js";
import { requireRole } from "./auth/roles.js";
import {
  atLeast,
  can,
  effectiveRole,
  CAPABILITIES,
  type Capability,
} from "../shared/models/access.js";

/**
 * The original gate, kept because roughly thirty routes import it.
 *
 * It no longer reads the `isAdmin` varchar directly: it delegates to the role
 * ladder in shared/models/access.ts, which trusts whichever of `role` and the
 * legacy bit is higher. Behaviour for existing accounts is identical — an
 * `isAdmin: "true"` row resolves to the `admin` role — but a route gated this
 * way now also admits `owner`, which the string comparison did not.
 *
 * New routes should use `requireCapability` from ./auth/roles.js and say what
 * they need rather than how senior the caller has to be.
 */
export const isAdmin = requireRole("admin");

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post(api.applications.create.path, async (req, res) => {
    try {
      const input = api.applications.create.input.parse(req.body);
      const application = await storage.createApplication(input);
      res.status(201).json(application);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: zodMessage(err),
          field: err.errors[0].path.join('.'),
        });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Sakred Executive applications ────────────────────────────────────
  // Scoring happens here, never on the client.
  app.post("/api/executive-applications", async (req, res) => {
    try {
      const { answers } = submitExecutiveApplicationSchema.parse(req.body);

      const missing = EXEC_QUESTIONS.filter((q) => {
        if (!q.required) return false;
        const v = answers[q.id];
        if (Array.isArray(v)) return v.length === 0;
        return v === undefined || v === null || String(v).trim() === "";
      }).map((q) => q.id);

      if (missing.length) {
        return res.status(400).json({ message: "Some required answers are missing", field: missing[0] });
      }

      const str = (k: string) => (typeof answers[k] === "string" ? (answers[k] as string).trim() : "");
      const email = str("email");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address", field: "email" });
      }

      const { score, route } = scoreApplication(answers);

      const created = await storage.createExecutiveApplication({
        firstName: str("firstName"),
        lastName: str("lastName"),
        email,
        phone: str("phone"),
        location: str("location"),
        occupation: str("occupation"),
        role: str("role"),
        answers,
        fitScore: score,
        route,
      });

      // The applicant is told what happens next, not their score.
      res.status(201).json({ id: created.id, route });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err), field: err.errors[0].path.join(".") });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/executive-applications", isAdmin, async (_req, res) => {
    try {
      res.json(await storage.getExecutiveApplications());
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.patch("/api/executive-applications/:id", isAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { status, notes } = req.body ?? {};
      const updated = await storage.updateExecutiveApplication(id, { status, notes });
      if (!updated) return res.status(404).json({ message: "Application not found" });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/retreats", async (_req, res) => {
    try {
      const allRetreats = await storage.getRetreats();
      res.json(allRetreats);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/retreats/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const retreat = await storage.getRetreat(id);
      if (!retreat) return res.status(404).json({ message: "Retreat not found" });
      res.json(retreat);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/retreats/:id/properties", async (req, res) => {
    try {
      const retreatId = parseInt(req.params.id);
      const props = await storage.getPropertiesByRetreat(retreatId);
      res.json(props);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  const bookingInputSchema = z.object({
    retreatId: z.number().int().positive().nullable().optional(),
    propertyId: z.number().int().positive().nullable().optional(),
    retreatType: z.enum(["private", "shared"]).default("shared"),
    preferredStartDate: z.string().min(1, "Start date is required"),
    preferredEndDate: z.string().min(1, "End date is required"),
    duration: z.number().int().min(2).max(14).default(3),
    housingTier: z.enum(["essential", "premium", "elite"]).default("essential"),
    guestCount: z.number().int().min(1).max(10).default(1),
    specialRequests: z.string().nullable().optional(),
  }).refine((data) => {
    const start = new Date(data.preferredStartDate);
    const end = new Date(data.preferredEndDate);
    return start < end;
  }, { message: "Start date must be before end date", path: ["preferredStartDate"] }).refine((data) => {
    if (data.retreatType === "private" && data.housingTier === "essential") {
      return false;
    }
    return true;
  }, { message: "Private retreats are only available with Premium or Elite housing", path: ["housingTier"] });

  app.post("/api/booking-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const parsed = bookingInputSchema.parse(req.body);

      const booking = await storage.createBookingRequest({
        userId,
        retreatId: parsed.retreatId || null,
        propertyId: parsed.propertyId || null,
        retreatType: parsed.retreatType,
        preferredStartDate: parsed.preferredStartDate || null,
        preferredEndDate: parsed.preferredEndDate || null,
        duration: parsed.duration,
        housingTier: parsed.housingTier,
        guestCount: parsed.guestCount,
        specialRequests: parsed.specialRequests || null,
      });

      res.status(201).json(booking);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: zodMessage(err),
          field: err.errors[0].path.join('.'),
        });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/shared-retreat-dates", isAuthenticated, async (_req, res) => {
    try {
      const sharedRequests = await storage.getSharedRetreatRequests();
      const dates = sharedRequests
        .filter(r => r.preferredStartDate && r.preferredEndDate)
        .map(r => ({
          startDate: r.preferredStartDate,
          endDate: r.preferredEndDate,
          duration: r.duration,
          guestCount: r.guestCount,
          status: r.status,
        }));
      res.json(dates);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/booking-requests/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const requests = await storage.getBookingRequestsByUser(userId);
      res.json(requests);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/admin/check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      const role = user ? effectiveRole(user) : "member";
      // `isAdmin` stays in the response — the admin portal reads it and this
      // route is not the place to break it. `role` and `capabilities` are
      // what new UI should gate on: the client asks "can I answer support",
      // not "am I senior enough", so re-levelling a capability moves the UI
      // without a client release.
      res.json({
        isAdmin: atLeast(role, "admin"),
        role,
        capabilities: Object.fromEntries(
          (Object.keys(CAPABILITIES) as Capability[]).map((c) => [c, can(role, c)]),
        ),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/admin/partners", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const allPartners = await storage.getPartners();
      res.json(allPartners);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/admin/partners", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const input = insertPartnerSchema.parse(req.body);
      const partner = await storage.createPartner(input);
      res.status(201).json(partner);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err), field: err.errors[0].path.join('.') });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.patch("/api/admin/partners/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const input = insertPartnerSchema.partial().parse(req.body);
      const updated = await storage.updatePartner(id, input);
      if (!updated) return res.status(404).json({ message: "Partner not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err), field: err.errors[0].path.join('.') });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete("/api/admin/partners/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await storage.deletePartner(id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/admin/partners/:id/services", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const partnerId = parseInt(req.params.id as string);
      const services = await storage.getPartnerServices(partnerId);
      res.json(services);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/admin/services", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const input = insertPartnerServiceSchema.parse(req.body);
      const service = await storage.createPartnerService(input);
      res.status(201).json(service);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err), field: err.errors[0].path.join('.') });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.patch("/api/admin/services/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const input = insertPartnerServiceSchema.partial().parse(req.body);
      const updated = await storage.updatePartnerService(id, input);
      if (!updated) return res.status(404).json({ message: "Service not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err), field: err.errors[0].path.join('.') });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete("/api/admin/services/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await storage.deletePartnerService(id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/admin/bookings", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const allBookings = await storage.getAllBookingRequests();
      // Enrich with user name/email
      const userIds = Array.from(new Set(allBookings.map((b) => b.userId)));
      const usersData = await Promise.all(
        userIds.map((uid) =>
          db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users).where(eq(users.id, uid)).then((rows) => rows[0])
        )
      );
      const userMap: Record<string, { firstName?: string | null; lastName?: string | null; email?: string | null }> = {};
      usersData.forEach((u) => { if (u) userMap[u.id] = u; });
      const enriched = allBookings.map((b) => ({
        ...b,
        userName: [userMap[b.userId]?.firstName, userMap[b.userId]?.lastName].filter(Boolean).join(" ") || null,
        userEmail: userMap[b.userId]?.email || null,
      }));
      res.json(enriched);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  const bookingStatusUpdateSchema = z.object({
    status: z.enum(["requested", "confirmed", "completed", "cancelled"]),
    conciergeNotes: z.string().optional(),
  });

  app.patch("/api/admin/bookings/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const { status, conciergeNotes } = bookingStatusUpdateSchema.parse(req.body);
      const updated = await storage.updateBookingRequestStatus(id, status, conciergeNotes);
      if (!updated) return res.status(404).json({ message: "Booking not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err), field: err.errors[0].path.join('.') });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/partners/active", async (_req, res) => {
    try {
      const allPartners = await storage.getPartners();
      res.json(allPartners.filter(p => p.active));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/partners/:id/services", async (req, res) => {
    try {
      const partnerId = parseInt(req.params.id);
      const services = await storage.getPartnerServices(partnerId);
      res.json(services.filter(s => s.available));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/services", async (_req, res) => {
    try {
      const services = await storage.getAllPartnerServices();
      res.json(services);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Coaching Engine ──────────────────────────────────────────────────
  registerCoachingRoutes(app);
  registerCoachRelationshipRoutes(app);
  registerCoachClientRoutes(app);
  registerCoachingMessageRoutes(app);
  registerCoachPlanRoutes(app);

  // ── Masterclass Video Library ────────────────────────────────────────
  registerMasterclassRoutes(app);

  // ── The Apothecary ───────────────────────────────────────────────────
  registerShopRoutes(app);

  // ── The Library ──────────────────────────────────────────────────────
  registerLibraryRoutes(app);

  // ── The Body Map ─────────────────────────────────────────────────────
  registerEnergyRoutes(app);

  // ── Masterminds ──────────────────────────────────────────────────────
  registerOfferingRoutes(app);

  // ── The daily ritual ─────────────────────────────────────────────────
  registerDailyRoutes(app);

  // ── Today — the read, the three options, the sky, and rhythm ─────────
  registerTodayRoutes(app);

  // ── Community ────────────────────────────────────────────────────────
  registerCommunityRoutes(app);

  registerWinRoutes(app);

  // Members and tiers — who is in, and what that lets them see.
  registerMemberRoutes(app);

  // Build — the prescription and what was actually lifted against it.
  registerTrainingRoutes(app);
  // The member's own movements and saved workouts.
  registerMemberWorkoutRoutes(app);

  // Health — what the phone measured. Read-only to us; the device owns it.
  registerHealthRoutes(app);

  // Terrain — the two above, read together: what condition the body is in.
  registerTerrainRoutes(app);

  // The habit loop: catalogue → tracked → phase → entry → resolved day.
  registerHabitRoutes(app);

  // Reporting and blocking — required by both app stores for UGC.
  registerModerationRoutes(app);

  // Telemetry last: it observes the app, so nothing else should depend on it.
  registerTelemetryRoutes(app);

  // The member's own photo and display name.
  registerProfileRoutes(app);

  return httpServer;
}
