import express, { type Request, type Response, type NextFunction } from "express";
import type { IncomingMessage, ServerResponse } from "http";
import { createServer } from "http";
import { securityHeaders } from "../server/security/headers.js";
import { cors } from "../server/security/cors.js";

const app = express();
const httpServer = createServer(app);

// Before everything, including the health check and the error paths — a
// header that only gets set on the happy path is not a security header.
//
// Statically imported, unlike the route modules below. Those are deferred so
// that a failure to reach the database still leaves /api/health answering;
// this module imports nothing but express types, so there is nothing for it
// to fail at, and deferring it would mean the health check and any init-error
// response went out bare.
app.use(securityHeaders);

// Immediately after the headers and before anything that can fail: a CORS
// preflight is answered here and never reaches the deferred init below, so
// the native app gets a straight 204 even while the database is waking up.
app.use(cors);

app.use(
  express.json({
    verify: (req: IncomingMessage & { rawBody?: unknown }, _res: ServerResponse, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: false }));

// Diagnostic endpoint — available even if init fails
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: initialized ? "ok" : "initializing",
    initError: initError ? initError.message : null,
    env: {
      hasDbUrl: !!(process.env.SAKREDBODY_DATABASE_URL || process.env.DATABASE_URL),
      hasSessionSecret: !!process.env.SESSION_SECRET,
      nodeEnv: process.env.NODE_ENV || "not set",
    },
  });
});

// Deferred initialization
let initialized = false;
let initError: Error | null = null;

const initPromise = (async () => {
  try {
    const { setupAuth, registerAuthRoutes } = await import("../server/auth/index.js");
    const { bearerAuth } = await import("../server/auth/bearerAuth.js");
    const { registerRoutes } = await import("../server/routes.js");
    const { registerNotificationRoutes } = await import("../server/notifications/routes.js");
    const { registerNotificationInboxRoutes } = await import("../server/notifications/inbox.js");
    const { registerSupportRoutes } = await import("../server/support/routes.js");
    const { registerApplicationRoutes } = await import("../server/applications/routes.js");
    const { registerRetreatAdminRoutes } = await import("../server/retreats/routes.js");
    const { registerCohortRoutes } = await import("../server/cohorts/routes.js");

    setupAuth(app);
    // After setupAuth because it writes to req.session, and before every route
    // because they all read req.session.userId.
    app.use(bearerAuth);
    registerAuthRoutes(app);
    registerNotificationRoutes(app);
    registerNotificationInboxRoutes(app);
    registerSupportRoutes(app);
    // This file is the production entry point, not server/index.ts — that one
    // only runs locally. A route module registered there and not here builds,
    // typechecks, passes tests, and 404s in production. Every module has to be
    // in both lists.
    registerApplicationRoutes(app);
    registerRetreatAdminRoutes(app);
    registerCohortRoutes(app);
    await registerRoutes(httpServer, app);
    
    // Error handler (must be added after routes)
    app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("API Error:", err);
      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    });
    
    initialized = true;
  } catch (err) {
    initError = err instanceof Error ? err : new Error(String(err));
    console.error("INIT FAILED:", initError.message, initError.stack);
  }
})();

// Vercel serverless handler
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await initPromise;
  
  if (initError) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      error: "Server initialization failed", 
      message: initError.message 
    }));
    return;
  }
  
  return app(req, res);
}
