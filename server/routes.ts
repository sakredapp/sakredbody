import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "./auth";
import "./auth/sessionAuth"; // session type augmentation
import { insertPartnerSchema, insertPartnerServiceSchema } from "@shared/schema";

function isAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  storage.getUser(userId).then((user) => {
    if (!user || user.isAdmin !== "true") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  }).catch(() => {
    res.status(500).json({ message: "Internal Server Error" });
  });
}

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
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
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
          message: err.errors[0].message,
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
      res.json({ isAdmin: user?.isAdmin === "true" });
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
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
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
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
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
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
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
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
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
      res.json(allBookings);
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
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
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

  return httpServer;
}
