import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod";

export * from "./executiveQuestions.js";

// ── Table ────────────────────────────────────────────────────────────────

export const executiveApplications = pgTable("executive_applications", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  location: text("location"),
  occupation: text("occupation"),
  role: text("role"),
  answers: jsonb("answers").notNull(),
  fitScore: integer("fit_score").notNull().default(0),
  route: text("route").notNull().default("nurture"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const submitExecutiveApplicationSchema = z.object({
  answers: z.record(z.union([z.string(), z.array(z.string()), z.number()])),
});

export type ExecutiveApplication = typeof executiveApplications.$inferSelect;
export type SubmitExecutiveApplication = z.infer<typeof submitExecutiveApplicationSchema>;
