import { db } from "./db";
import { applications, type InsertApplication, type Application } from "@shared/schema";

export interface IStorage {
  createApplication(application: InsertApplication): Promise<Application>;
}

export class DatabaseStorage implements IStorage {
  async createApplication(insertApplication: InsertApplication): Promise<Application> {
    const [application] = await db
      .insert(applications)
      .values(insertApplication)
      .returning();
    return application;
  }
}

export const storage = new DatabaseStorage();
