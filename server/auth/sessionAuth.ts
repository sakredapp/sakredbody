import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";

// Augment express-session types
declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export function setupAuth(app: Express) {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.SAKREDBODY_DATABASE_URL || process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  app.set("trust proxy", 1);
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: sessionTtl,
      },
    })
  );
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.session?.userId) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};
