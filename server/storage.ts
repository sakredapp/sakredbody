import { db } from "./db";
import { eq, and, ne } from "drizzle-orm";
import {
  applications,
  retreats,
  properties,
  bookingRequests,
  partners,
  partnerServices,
  users,
  type InsertApplication,
  type Application,
  type InsertRetreat,
  type Retreat,
  type InsertProperty,
  type Property,
  type InsertBookingRequest,
  type BookingRequest,
  type InsertPartner,
  type Partner,
  type InsertPartnerService,
  type PartnerService,
  type User,
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
  getAllBookingRequests(): Promise<BookingRequest[]>;
  getBookingRequest(id: number): Promise<BookingRequest | undefined>;
  getSharedRetreatRequests(): Promise<BookingRequest[]>;
  updateBookingRequestStatus(id: number, status: string, conciergeNotes?: string): Promise<BookingRequest | undefined>;
  getPartners(): Promise<Partner[]>;
  getPartner(id: number): Promise<Partner | undefined>;
  createPartner(partner: InsertPartner): Promise<Partner>;
  updatePartner(id: number, partner: Partial<InsertPartner>): Promise<Partner | undefined>;
  deletePartner(id: number): Promise<void>;
  getPartnerServices(partnerId: number): Promise<PartnerService[]>;
  getAllPartnerServices(): Promise<PartnerService[]>;
  getPartnerService(id: number): Promise<PartnerService | undefined>;
  createPartnerService(service: InsertPartnerService): Promise<PartnerService>;
  updatePartnerService(id: number, service: Partial<InsertPartnerService>): Promise<PartnerService | undefined>;
  deletePartnerService(id: number): Promise<void>;
  getUser(id: string): Promise<User | undefined>;
  setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined>;
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

  async getAllBookingRequests(): Promise<BookingRequest[]> {
    return db.select().from(bookingRequests);
  }

  async getSharedRetreatRequests(): Promise<BookingRequest[]> {
    return db.select().from(bookingRequests).where(
      and(
        eq(bookingRequests.retreatType, "shared"),
        ne(bookingRequests.status, "cancelled")
      )
    );
  }

  async updateBookingRequestStatus(id: number, status: string, conciergeNotes?: string): Promise<BookingRequest | undefined> {
    const values: Record<string, any> = { status, updatedAt: new Date() };
    if (conciergeNotes !== undefined) values.conciergeNotes = conciergeNotes;
    const [updated] = await db.update(bookingRequests).set(values).where(eq(bookingRequests.id, id)).returning();
    return updated;
  }

  async getPartners(): Promise<Partner[]> {
    return db.select().from(partners);
  }

  async getPartner(id: number): Promise<Partner | undefined> {
    const [partner] = await db.select().from(partners).where(eq(partners.id, id));
    return partner;
  }

  async createPartner(partner: InsertPartner): Promise<Partner> {
    const [created] = await db.insert(partners).values(partner).returning();
    return created;
  }

  async updatePartner(id: number, data: Partial<InsertPartner>): Promise<Partner | undefined> {
    const [updated] = await db.update(partners).set(data).where(eq(partners.id, id)).returning();
    return updated;
  }

  async deletePartner(id: number): Promise<void> {
    await db.delete(partnerServices).where(eq(partnerServices.partnerId, id));
    await db.delete(partners).where(eq(partners.id, id));
  }

  async getPartnerServices(partnerId: number): Promise<PartnerService[]> {
    return db.select().from(partnerServices).where(eq(partnerServices.partnerId, partnerId));
  }

  async getAllPartnerServices(): Promise<PartnerService[]> {
    return db.select().from(partnerServices).where(eq(partnerServices.available, true));
  }

  async getPartnerService(id: number): Promise<PartnerService | undefined> {
    const [service] = await db.select().from(partnerServices).where(eq(partnerServices.id, id));
    return service;
  }

  async createPartnerService(service: InsertPartnerService): Promise<PartnerService> {
    const [created] = await db.insert(partnerServices).values(service).returning();
    return created;
  }

  async updatePartnerService(id: number, data: Partial<InsertPartnerService>): Promise<PartnerService | undefined> {
    const [updated] = await db.update(partnerServices).set(data).where(eq(partnerServices.id, id)).returning();
    return updated;
  }

  async deletePartnerService(id: number): Promise<void> {
    await db.delete(partnerServices).where(eq(partnerServices.id, id));
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ isAdmin: isAdmin ? "true" : "false", updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
