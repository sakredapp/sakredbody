import express, { type Request, type Response, type NextFunction } from "express";
import type { IncomingMessage, ServerResponse } from "http";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

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
    const { registerRoutes } = await import("../server/routes.js");
    
    setupAuth(app);
    registerAuthRoutes(app);
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
