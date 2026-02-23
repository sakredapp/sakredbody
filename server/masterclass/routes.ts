/**
 * Masterclass API Routes
 *
 * Public (authenticated):
 *   GET  /api/masterclass/categories         — list active categories
 *   GET  /api/masterclass/videos              — list videos (filter by category, search, subscribed)
 *   GET  /api/masterclass/videos/featured     — featured/recommended videos
 *   GET  /api/masterclass/videos/:id          — single video detail
 *   GET  /api/masterclass/subscriptions       — user's subscribed categories
 *   POST /api/masterclass/subscriptions       — subscribe to a category
 *   DELETE /api/masterclass/subscriptions/:categoryId — unsubscribe
 *
 * Admin:
 *   POST   /api/masterclass/categories        — create category
 *   PUT    /api/masterclass/categories/:id     — update category
 *   DELETE /api/masterclass/categories/:id     — delete category
 *   POST   /api/masterclass/videos            — create video
 *   PUT    /api/masterclass/videos/:id         — update video
 *   DELETE /api/masterclass/videos/:id         — delete video
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import {
  masterclassCategories,
  masterclassVideos,
  userCategorySubs,
  insertMasterclassCategorySchema,
  insertMasterclassVideoSchema,
} from "../../shared/schema.js";

function isAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  storage.getUser(userId).then((user) => {
    if (!user || user.isAdmin !== "true") return res.status(403).json({ message: "Admin access required" });
    next();
  }).catch(() => res.status(500).json({ message: "Internal Server Error" }));
}

export function registerMasterclassRoutes(app: Express) {

  // ─── PUBLIC (Authenticated) ──────────────────────────────────────────

  // List active categories
  app.get("/api/masterclass/categories", isAuthenticated, async (_req, res) => {
    try {
      const cats = await db
        .select()
        .from(masterclassCategories)
        .where(eq(masterclassCategories.active, true))
        .orderBy(masterclassCategories.sortOrder);
      res.json(cats);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // List videos — optional ?category=<id>&search=<q>&subscribed=true
  app.get("/api/masterclass/videos", isAuthenticated, async (req, res) => {
    try {
      const { category, search, subscribed } = req.query;
      const userId = req.session!.userId!;

      let query = db
        .select()
        .from(masterclassVideos)
        .where(eq(masterclassVideos.active, true))
        .orderBy(desc(masterclassVideos.createdAt))
        .$dynamic();

      // If user only wants subscribed categories
      if (subscribed === "true") {
        const subs = await db
          .select({ categoryId: userCategorySubs.categoryId })
          .from(userCategorySubs)
          .where(eq(userCategorySubs.userId, userId));
        const subIds = subs.map((s) => s.categoryId);
        if (subIds.length > 0) {
          query = query.where(
            and(
              eq(masterclassVideos.active, true),
              inArray(masterclassVideos.categoryId, subIds)
            )
          );
        } else {
          return res.json([]);
        }
      }

      // Category filter
      if (category && typeof category === "string") {
        query = query.where(
          and(
            eq(masterclassVideos.active, true),
            eq(masterclassVideos.categoryId, category)
          )
        );
      }

      const videos = await query;

      // Client-side search over title/description/tags (simple filter)
      if (search && typeof search === "string") {
        const s = (search as string).toLowerCase();
        const filtered = videos.filter(
          (v) =>
            v.title.toLowerCase().includes(s) ||
            v.description?.toLowerCase().includes(s) ||
            v.tags?.some((t) => t.toLowerCase().includes(s)) ||
            v.searchKeywords?.some((k) => k.toLowerCase().includes(s))
        );
        return res.json(filtered);
      }

      res.json(videos);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Featured / recommended videos
  app.get("/api/masterclass/videos/featured", isAuthenticated, async (_req, res) => {
    try {
      const videos = await db
        .select()
        .from(masterclassVideos)
        .where(and(eq(masterclassVideos.active, true), eq(masterclassVideos.isFeatured, true)))
        .orderBy(masterclassVideos.sortOrder);
      res.json(videos);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Single video
  app.get("/api/masterclass/videos/:id", isAuthenticated, async (req, res) => {
    try {
      const [video] = await db
        .select()
        .from(masterclassVideos)
        .where(eq(masterclassVideos.id, String(req.params.id)));
      if (!video) return res.status(404).json({ message: "Video not found" });
      res.json(video);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // User subscriptions
  app.get("/api/masterclass/subscriptions", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const subs = await db
        .select()
        .from(userCategorySubs)
        .where(eq(userCategorySubs.userId, userId));
      res.json(subs);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Subscribe to category
  app.post("/api/masterclass/subscriptions", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const { categoryId } = req.body;
      if (!categoryId) return res.status(400).json({ message: "categoryId required" });

      // Check if already subscribed
      const existing = await db
        .select()
        .from(userCategorySubs)
        .where(
          and(
            eq(userCategorySubs.userId, userId),
            eq(userCategorySubs.categoryId, categoryId)
          )
        );
      if (existing.length > 0) return res.json(existing[0]);

      const [sub] = await db
        .insert(userCategorySubs)
        .values({ userId, categoryId })
        .returning();
      res.status(201).json(sub);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Unsubscribe
  app.delete("/api/masterclass/subscriptions/:categoryId", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      await db
        .delete(userCategorySubs)
        .where(
          and(
            eq(userCategorySubs.userId, userId),
            eq(userCategorySubs.categoryId, String(req.params.categoryId))
          )
        );
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────

  // List ALL categories (including inactive) — admin only
  app.get("/api/admin/masterclass/categories", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const cats = await db
        .select()
        .from(masterclassCategories)
        .orderBy(masterclassCategories.sortOrder);
      res.json(cats);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // List ALL videos (including inactive) — admin only
  app.get("/api/admin/masterclass/videos", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const videos = await db
        .select()
        .from(masterclassVideos)
        .orderBy(desc(masterclassVideos.createdAt));
      res.json(videos);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Create category
  app.post("/api/masterclass/categories", isAdmin, async (req, res) => {
    try {
      const data = insertMasterclassCategorySchema.parse(req.body);
      const [cat] = await db.insert(masterclassCategories).values(data).returning();
      res.status(201).json(cat);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: err.issues[0].message });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Update category
  app.put("/api/masterclass/categories/:id", isAdmin, async (req, res) => {
    try {
      const [cat] = await db
        .update(masterclassCategories)
        .set(req.body)
        .where(eq(masterclassCategories.id, String(req.params.id)))
        .returning();
      if (!cat) return res.status(404).json({ message: "Not found" });
      res.json(cat);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Delete category
  app.delete("/api/masterclass/categories/:id", isAdmin, async (req, res) => {
    try {
      await db.delete(masterclassCategories).where(eq(masterclassCategories.id, String(req.params.id)));
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Create video
  app.post("/api/masterclass/videos", isAdmin, async (req, res) => {
    try {
      const data = insertMasterclassVideoSchema.parse(req.body);
      const [video] = await db.insert(masterclassVideos).values(data).returning();
      res.status(201).json(video);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: err.issues[0].message });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Update video
  app.put("/api/masterclass/videos/:id", isAdmin, async (req, res) => {
    try {
      const [video] = await db
        .update(masterclassVideos)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(masterclassVideos.id, String(req.params.id)))
        .returning();
      if (!video) return res.status(404).json({ message: "Not found" });
      res.json(video);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Delete video
  app.delete("/api/masterclass/videos/:id", isAdmin, async (req, res) => {
    try {
      await db.delete(masterclassVideos).where(eq(masterclassVideos.id, String(req.params.id)));
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });
}
