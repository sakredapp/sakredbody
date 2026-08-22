import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { pool } from "../db.js";

// Augment express-session types
declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export function setupAuth(app: Express) {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  /*
    The application's pool, not a second one.

    `conString` makes connect-pg-simple open its own pool, so this process held
    two — the app's and the session store's — each with its own default of ten
    connections and neither aware of the other. Against a pooler with a seat
    limit that is not a tuning question: Supabase's session mode caps a project
    at fifteen clients, and what going over looks like is not a connection
    error in a log. It is Terrain failing to compute, its card never rendering,
    and a walkthrough lesson pointing at a card that is not there. That cost
    most of a day to recognise as a connection ceiling.

    One pool also makes `DATABASE_POOL_MAX` mean what it says.
  */
  const sessionStore = new pgStore({
    pool,
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
