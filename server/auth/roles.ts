/**
 * Role-gated middleware.
 *
 * `isAdmin` in server/routes.ts was the only gate in the app: one boolean,
 * guarding everything from the support inbox to deleting a retreat. It still
 * exists and still works — it now delegates here — but new routes should say
 * what they actually need:
 *
 *   app.get("/api/admin/support", isAuthenticated, requireCapability("answerSupport"), …)
 *
 * which is a sentence, and which moves on its own when the capability is
 * re-levelled in shared/models/access.ts rather than needing every call site
 * found again.
 *
 * The lookup is a `getUser` per request, same as the old middleware — no
 * session-cached role, deliberately. Demoting somebody has to take effect on
 * their next request, not on their next login, or removing access from a
 * departing coach means nothing until they choose to sign out.
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage.js";
import {
  can,
  effectiveRole,
  atLeast,
  type Capability,
  type Role,
} from "../../shared/models/access.js";

/** Attached so a handler can branch without a second round trip. */
declare module "express-serve-static-core" {
  interface Request {
    role?: Role;
  }
}

async function resolve(req: Request, res: Response): Promise<Role | null> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  const user = await storage.getUser(userId);
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  const role = effectiveRole(user);
  req.role = role;
  return role;
}

/** Gate on the ladder directly. Prefer `requireCapability`. */
export function requireRole(min: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await resolve(req, res);
      if (!role) return;
      if (!atLeast(role, min)) {
        return res.status(403).json({ message: "You don't have access to that" });
      }
      next();
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

/** Gate on what the route is for, not on who happens to be senior enough. */
export function requireCapability(capability: Capability) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await resolve(req, res);
      if (!role) return;
      if (!can(role, capability)) {
        return res.status(403).json({ message: "You don't have access to that" });
      }
      next();
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
}
