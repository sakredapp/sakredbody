import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "../server/routes";
import { setupAuth, registerAuthRoutes } from "../server/auth";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

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
  })
);

app.use(express.urlencoded({ extended: false }));

// Setup auth (sessions)
setupAuth(app);
registerAuthRoutes(app);

// Register all API routes
let initialized = false;
const initPromise = (async () => {
  await registerRoutes(httpServer, app);
  initialized = true;
})();

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  console.error("API Error:", err);
  if (!res.headersSent) {
    res.status(status).json({ message });
  }
});

// Vercel serverless handler
export default async function handler(req: any, res: any) {
  if (!initialized) {
    await initPromise;
  }
  return app(req, res);
}
