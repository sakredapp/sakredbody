import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupAuth, registerAuthRoutes } from "./auth/index.js";
import { serveStatic } from "./static.js";
import { createServer } from "http";
import { ensureStorageBucket } from "./supabaseStorage.js";
import { ensureCoachingBucket } from "./coaching/attachmentStore.js";
import { ensureMediaBucket } from "./media/store.js";
import { securityHeaders } from "./security/headers.js";
import { cors } from "./security/cors.js";
import { bearerAuth } from "./auth/bearerAuth.js";
import { registerNotificationRoutes } from "./notifications/routes.js";
import { registerNotificationInboxRoutes } from "./notifications/inbox.js";
import { registerSupportRoutes } from "./support/routes.js";
import { registerApplicationRoutes } from "./applications/routes.js";
import { registerRetreatAdminRoutes } from "./retreats/routes.js";
import { registerCohortRoutes } from "./cohorts/routes.js";

const app = express();
const httpServer = createServer(app);

// First middleware, so it applies to static assets and error responses too.
app.use(securityHeaders);
app.use(cors);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  setupAuth(app);
  app.use(bearerAuth);
  registerAuthRoutes(app);
  registerNotificationRoutes(app);
  registerNotificationInboxRoutes(app);
  registerSupportRoutes(app);
  // The back office for the three things that had tables but no routes:
  // the intake inbox, retreats, and masterminds.
  registerApplicationRoutes(app);
  registerRetreatAdminRoutes(app);
  registerCohortRoutes(app);
  await registerRoutes(httpServer, app);

  // Ensure Supabase Storage bucket exists (idempotent)
  ensureStorageBucket().catch((err) => console.warn("Storage bucket init:", err.message));
  // The private one, separate on purpose — see server/coaching/attachmentStore.ts.
  ensureCoachingBucket().catch((err) => console.warn("Coaching bucket init:", err.message));
  // Member photographs. Private, and a no-op when object storage is unconfigured
  // — see server/media/store.ts for what happens instead.
  ensureMediaBucket().catch((err) => console.warn("Media bucket init:", err.message));

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Serve on the port specified by environment (Vercel, local dev, etc.)
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
