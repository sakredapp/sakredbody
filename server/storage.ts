import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  applications,
  retreats,
  properties,
  bookingRequests,
  type InsertApplication,
  type Application,
  type InsertRetreat,
  type Retreat,
  type InsertProperty,
  type Property,
  type InsertBookingRequest,
  type BookingRequest,
} from "@shared/schema";

export interface IStorage {
  createApplication(application: InsertApplication): Promise<Application>;
  getRetreats(): Promise<Retreat[]>;
  getRetreat(id: number): Promise<Retreat | undefined>;
  createRetreat(retreat: InsertRetreat): Promise<Retreat>;
  getPropertiesByRetreat(retreatId: number): Promise<Property[]>;
  getProperty(id: number): Promise<Property | undefined>;
  createProperty(property: InsertProperty): Promise<Property>;
  createBookingRequest(request: InsertBookingRequest): Promise<BookingRequest>;
  getBookingRequestsByUser(userId: string): Promise<BookingRequest[]>;
  getBookingRequest(id: number): Promise<BookingRequest | undefined>;
  updateBookingRequestStatus(id: number, status: string, conciergeNotes?: string): Promise<BookingRequest | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createApplication(insertApplication: InsertApplication): Promise<Application> {
    const [application] = await db
      .insert(applications)
      .values(insertApplication)
      .returning();
    return application;
  }

  async getRetreats(): Promise<Retreat[]> {
    return db.select().from(retreats).where(eq(retreats.active, true));
  }

  async getRetreat(id: number): Promise<Retreat | undefined> {
    const [retreat] = await db.select().from(retreats).where(eq(retreats.id, id));
    return retreat;
  }

  async createRetreat(retreat: InsertRetreat): Promise<Retreat> {
    const [created] = await db.insert(retreats).values(retreat).returning();
    return created;
  }

  async getPropertiesByRetreat(retreatId: number): Promise<Property[]> {
    return db.select().from(properties).where(eq(properties.retreatId, retreatId));
  }

  async getProperty(id: number): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property;
  }

  async createProperty(property: InsertProperty): Promise<Property> {
    const [created] = await db.insert(properties).values(property).returning();
    return created;
  }

  async createBookingRequest(request: InsertBookingRequest): Promise<BookingRequest> {
    const [created] = await db.insert(bookingRequests).values(request).returning();
    return created;
  }

  async getBookingRequestsByUser(userId: string): Promise<BookingRequest[]> {
    return db.select().from(bookingRequests).where(eq(bookingRequests.userId, userId));
  }

  async getBookingRequest(id: number): Promise<BookingRequest | undefined> {
    const [request] = await db.select().from(bookingRequests).where(eq(bookingRequests.id, id));
    return request;
  }

  async updateBookingRequestStatus(id: number, status: string, conciergeNotes?: string): Promise<BookingRequest | undefined> {
    const values: Record<string, any> = { status, updatedAt: new Date() };
    if (conciergeNotes !== undefined) values.conciergeNotes = conciergeNotes;
    const [updated] = await db.update(bookingRequests).set(values).where(eq(bookingRequests.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
