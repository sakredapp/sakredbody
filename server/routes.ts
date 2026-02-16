import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "./replit_integrations/auth";

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
    retreatId: z.number().int().positive(),
    propertyId: z.number().int().positive(),
    guestCount: z.number().int().min(1).max(10).default(1),
    specialRequests: z.string().nullable().optional(),
  });

  app.post("/api/booking-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = bookingInputSchema.parse(req.body);

      const retreat = await storage.getRetreat(parsed.retreatId);
      if (!retreat) return res.status(404).json({ message: "Retreat not found" });

      const property = await storage.getProperty(parsed.propertyId);
      if (!property) return res.status(404).json({ message: "Property not found" });

      const booking = await storage.createBookingRequest({
        userId,
        retreatId: parsed.retreatId,
        propertyId: parsed.propertyId,
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

  app.get("/api/booking-requests/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requests = await storage.getBookingRequestsByUser(userId);
      res.json(requests);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  return httpServer;
}
