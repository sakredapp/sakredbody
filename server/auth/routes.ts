import type { Express, Request, Response } from "express";
import { storage } from "../storage.js";
import { isAuthenticated } from "./sessionAuth.js";
import { z } from "zod";
import crypto from "crypto";

const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

// Password hashing using Node's built-in scrypt (no external deps)
async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err: Error | null, derivedKey: Buffer) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    crypto.scrypt(password, salt, 64, (err: Error | null, derivedKey: Buffer) => {
      if (err) reject(err);
      resolve(crypto.timingSafeEqual(Buffer.from(key, "hex"), derivedKey));
    });
  });
}

export function registerAuthRoutes(app: Express): void {
  // Login with email + password
  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);

      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const valid = await verifyPassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Register new user
  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = registerSchema.parse(req.body);

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.upsertUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
      });

      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Logout (POST)
  app.post("/api/logout", (req: Request, res: Response) => {
    req.session.destroy((err: Error | null) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out" });
    });
  });

  // Logout (GET — backward compat, redirects to home)
  app.get("/api/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });
}
