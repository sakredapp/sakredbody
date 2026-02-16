import { pgTable, text, serial, timestamp, boolean, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  goals: text("goals").notNull(), // Energy, sleep, digestion, etc.
  stressLevel: text("stress_level").notNull(),
  willingness: text("willingness").notNull(),
  constraints: text("constraints").notNull(),
  whyNow: text("why_now").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  createdAt: true,
});

export type Application = typeof applications.$inferSelect;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;

export const retreats = pgTable("retreats", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  description: text("description").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  capacity: integer("capacity").notNull().default(12),
  imageUrl: text("image_url"),
  active: boolean("active").notNull().default(true),
});

export const insertRetreatSchema = createInsertSchema(retreats).omit({
  id: true,
});
export type Retreat = typeof retreats.$inferSelect;
export type InsertRetreat = z.infer<typeof insertRetreatSchema>;

export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  retreatId: integer("retreat_id").notNull(),
  name: text("name").notNull(),
  tier: text("tier").notNull(),
  description: text("description").notNull(),
  bedrooms: integer("bedrooms").notNull().default(1),
  bathrooms: integer("bathrooms").notNull().default(1),
  maxGuests: integer("max_guests").notNull().default(2),
  pricePerNight: integer("price_per_night").notNull(),
  imageUrl: text("image_url"),
  amenities: text("amenities").array(),
  available: boolean("available").notNull().default(true),
});

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
});
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;

export const bookingStatusEnum = z.enum(["requested", "confirmed", "completed", "cancelled"]);
export type BookingStatus = z.infer<typeof bookingStatusEnum>;

export const retreatTypeEnum = z.enum(["private", "shared"]);
export type RetreatType = z.infer<typeof retreatTypeEnum>;

export const bookingRequests = pgTable("booking_requests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  retreatId: integer("retreat_id"),
  propertyId: integer("property_id"),
  retreatType: text("retreat_type").notNull().default("shared"),
  preferredStartDate: text("preferred_start_date"),
  preferredEndDate: text("preferred_end_date"),
  duration: integer("duration").default(3),
  housingTier: text("housing_tier").default("essential"),
  status: text("status").notNull().default("requested"),
  guestCount: integer("guest_count").notNull().default(1),
  specialRequests: text("special_requests"),
  conciergeNotes: text("concierge_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBookingRequestSchema = createInsertSchema(bookingRequests).omit({
  id: true,
  status: true,
  conciergeNotes: true,
  createdAt: true,
  updatedAt: true,
});
export type BookingRequest = typeof bookingRequests.$inferSelect;
export type InsertBookingRequest = z.infer<typeof insertBookingRequestSchema>;

export const partnerCategoryEnum = z.enum([
  "hotel",
  "resort",
  "vacation_rental",
  "yoga_studio",
  "pilates_studio",
  "fitness_gym",
  "spa",
  "restaurant",
  "wellness_center",
  "other",
]);
export type PartnerCategory = z.infer<typeof partnerCategoryEnum>;

export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  imageUrl: text("image_url"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPartnerSchema = createInsertSchema(partners).omit({
  id: true,
  createdAt: true,
});
export type Partner = typeof partners.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;

export const partnerServices = pgTable("partner_services", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  price: integer("price"),
  priceUnit: text("price_unit").default("per session"),
  duration: text("duration"),
  imageUrl: text("image_url"),
  amenities: text("amenities").array(),
  maxCapacity: integer("max_capacity"),
  available: boolean("available").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPartnerServiceSchema = createInsertSchema(partnerServices).omit({
  id: true,
  createdAt: true,
});
export type PartnerService = typeof partnerServices.$inferSelect;
export type InsertPartnerService = z.infer<typeof insertPartnerServiceSchema>;
