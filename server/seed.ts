import { db } from "./db.js";
import { retreats, properties } from "@shared/schema";

async function seed() {
  console.log("Seeding retreats...");
  
  const insertedRetreats = await db.insert(retreats).values([
    {
      name: "Spring Reset — Rincón",
      location: "Rincón, Puerto Rico",
      description: "Five-day immersive reset in oceanfront Rincón. Morning cold plunges, breath-work sessions on the beach, personalized nutrition protocols, and evening recovery workshops. Limited to 12 members for deep, focused transformation.",
      startDate: "2026-04-15",
      endDate: "2026-04-20",
      capacity: 12,
      imageUrl: "/images/puerto-rico-coast.jpg",
      active: true,
    },
    {
      name: "Summer Forge — Dorado",
      location: "Dorado, Puerto Rico",
      description: "Seven-day intensive at a private estate in Dorado. Advanced biohacking labs, functional movement training, sauna/ice protocols, and one-on-one coaching sessions. Build the systems that sustain elite performance year-round.",
      startDate: "2026-07-10",
      endDate: "2026-07-17",
      capacity: 10,
      imageUrl: "/images/retreat-jungle.jpg",
      active: true,
    },
    {
      name: "Fall Elevation — Yunque",
      location: "El Yunque, Puerto Rico",
      description: "Four-day mountain retreat in the rainforest. Altitude-adapted breathwork, jungle hikes, plant medicine-informed nutrition workshops, and deep recovery work surrounded by nature. Reconnect with your terrain.",
      startDate: "2026-10-05",
      endDate: "2026-10-09",
      capacity: 8,
      imageUrl: "/images/retreat-mountain.jpg",
      active: true,
    },
  ]).returning();

  console.log(`Inserted ${insertedRetreats.length} retreats`);

  const r1 = insertedRetreats[0].id;
  const r2 = insertedRetreats[1].id;
  const r3 = insertedRetreats[2].id;

  console.log("Seeding properties...");

  const insertedProperties = await db.insert(properties).values([
    { retreatId: r1, name: "Ocean View Studio", tier: "standard", description: "Clean, comfortable studio with ocean views. Private bathroom, workspace, and direct beach access. Perfect for solo members focused on the work.", bedrooms: 1, bathrooms: 1, maxGuests: 1, pricePerNight: 350, imageUrl: "/images/studio-standard.jpg", amenities: ["Ocean View", "Private Bath", "Beach Access", "Wi-Fi", "AC"], available: true },
    { retreatId: r1, name: "Beachfront Suite", tier: "premium", description: "Spacious one-bedroom suite steps from the water. King bed, living area, full kitchen, and private terrace overlooking the surf. Ideal for members who want extra space to decompress.", bedrooms: 1, bathrooms: 1, maxGuests: 2, pricePerNight: 550, imageUrl: "/images/beach-suite.jpg", amenities: ["Beachfront", "King Bed", "Full Kitchen", "Private Terrace", "Wi-Fi", "AC"], available: true },
    { retreatId: r1, name: "Villa Sakred", tier: "elite", description: "Two-bedroom private villa with infinity pool, outdoor shower, chef kitchen, and wraparound deck. The ultimate retreat-within-a-retreat for members bringing a partner or wanting top-tier privacy.", bedrooms: 2, bathrooms: 2, maxGuests: 4, pricePerNight: 950, imageUrl: "/images/villa-premium.jpg", amenities: ["Private Pool", "Chef Kitchen", "Outdoor Shower", "2 Bedrooms", "Wraparound Deck", "Concierge Service"], available: true },
    { retreatId: r2, name: "Garden Room", tier: "standard", description: "Private room in the estate's garden wing. Queen bed, ensuite bath, access to shared wellness spaces. Quiet and grounded.", bedrooms: 1, bathrooms: 1, maxGuests: 1, pricePerNight: 400, imageUrl: "/images/studio-standard.jpg", amenities: ["Garden View", "Queen Bed", "Ensuite Bath", "Wellness Access", "Wi-Fi"], available: true },
    { retreatId: r2, name: "Estate Suite", tier: "premium", description: "One-bedroom suite in the main house. King bed, sitting room, premium linens, and estate grounds access. Elevated comfort for focused work.", bedrooms: 1, bathrooms: 1, maxGuests: 2, pricePerNight: 700, imageUrl: "/images/beach-suite.jpg", amenities: ["Estate Grounds", "King Bed", "Sitting Room", "Premium Linens", "Pool Access"], available: true },
    { retreatId: r2, name: "Owner's Penthouse", tier: "elite", description: "The crown jewel — top-floor penthouse with 360-degree views, private rooftop terrace, two bedrooms, full bar, and dedicated concierge. For members who operate at the highest level.", bedrooms: 2, bathrooms: 2, maxGuests: 4, pricePerNight: 1200, imageUrl: "/images/penthouse.jpg", amenities: ["360° Views", "Rooftop Terrace", "Private Bar", "Dedicated Concierge", "2 Bedrooms", "Premium Everything"], available: true },
    { retreatId: r3, name: "Rainforest Cabin", tier: "standard", description: "Cozy cabin nestled in the canopy. Queen bed, outdoor deck, natural ventilation, and the sounds of the rainforest. Simple, powerful, intentional.", bedrooms: 1, bathrooms: 1, maxGuests: 1, pricePerNight: 300, imageUrl: "/images/studio-standard.jpg", amenities: ["Rainforest Views", "Outdoor Deck", "Queen Bed", "Natural Setting"], available: true },
    { retreatId: r3, name: "Canopy Suite", tier: "premium", description: "Elevated suite with floor-to-ceiling windows into the jungle. King bed, soaking tub, private meditation space. Where nature meets luxury.", bedrooms: 1, bathrooms: 1, maxGuests: 2, pricePerNight: 500, imageUrl: "/images/retreat-jungle.jpg", amenities: ["Canopy Views", "Soaking Tub", "Meditation Space", "King Bed", "Floor-to-Ceiling Windows"], available: true },
    { retreatId: r3, name: "Summit Villa", tier: "elite", description: "Private mountaintop villa with panoramic views, plunge pool, two bedrooms, outdoor kitchen, and private trail access. The ultimate mountain sanctuary.", bedrooms: 2, bathrooms: 2, maxGuests: 3, pricePerNight: 850, imageUrl: "/images/villa-premium.jpg", amenities: ["Mountain Views", "Plunge Pool", "Outdoor Kitchen", "Private Trail", "2 Bedrooms", "Panoramic Deck"], available: true },
  ]).returning();

  console.log(`Inserted ${insertedProperties.length} properties`);
  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
