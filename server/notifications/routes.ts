/**
 * FCM registration tokens.
 *
 * The client hands us one on launch and again on every rotation; this stores
 * it against the member so the coach thread can push to their devices.
 *
 * Nothing here sends a notification — that belongs with whatever writes the
 * coach message. This is only the registry.
 */

import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { pushTokens } from "../../shared/models/auth.js";
import { isAuthenticated } from "../auth/sessionAuth.js";
import { trackError } from "../telemetry/index.js";

const registerSchema = z.object({
  // FCM tokens run to roughly 160-180 characters today, but the format is not
  // contractual — the cap is here to bound the write, not to validate.
  token: z.string().min(20).max(4096),
  platform: z.enum(["ios", "android", "web"]),
});

export function registerNotificationRoutes(app: Express): void {
  app.post("/api/notifications/token", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { token, platform } = registerSchema.parse(req.body);
      const userId = req.session.userId!;

      // Conflict on the token, not on the user: one member legitimately has
      // several devices, and FCM can hand the same token to a different
      // account after a device is passed on or an app is reinstalled. The
      // token is the identity of the *device*, so it is what must be unique,
      // and re-pointing it at the current member is the correct resolution.
      await db
        .insert(pushTokens)
        .values({ userId, token, platform })
        .onConflictDoUpdate({
          target: pushTokens.token,
          set: { userId, platform, updatedAt: new Date() },
        });

      res.status(204).end();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("notifications.registerToken", error);
      res.status(500).json({ message: "Failed to register device" });
    }
  });

  /**
   * Drop a device.
   *
   * Called on sign-out. Without it, a shared or resold phone keeps receiving
   * another member's coach messages — the one notification failure that is a
   * privacy incident rather than an inconvenience.
   */
  app.delete("/api/notifications/token", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { token } = z.object({ token: z.string().min(20).max(4096) }).parse(req.body);
      await db.delete(pushTokens).where(eq(pushTokens.token, token));
      res.status(204).end();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("notifications.deleteToken", error);
      res.status(500).json({ message: "Failed to remove device" });
    }
  });
}
