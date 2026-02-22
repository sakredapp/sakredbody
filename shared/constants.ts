/**
 * Shared constants used across both client and server.
 * Single source of truth for business rules, categories, and tier configuration.
 */

// ─── Service / Partner Categories ──────────────────────────────────────────

export const SERVICE_CATEGORIES = [
  { value: "hotel", label: "Hotel" },
  { value: "resort", label: "Resort" },
  { value: "vacation_rental", label: "Vacation Rental" },
  { value: "yoga_studio", label: "Yoga Studio" },
  { value: "pilates_studio", label: "Pilates Studio" },
  { value: "fitness_gym", label: "Fitness Gym" },
  { value: "spa", label: "Spa" },
  { value: "restaurant", label: "Restaurant" },
  { value: "wellness_center", label: "Wellness Center" },
  { value: "other", label: "Other" },
] as const;

export type ServiceCategoryValue = (typeof SERVICE_CATEGORIES)[number]["value"];

export function getCategoryLabel(cat: string): string {
  return SERVICE_CATEGORIES.find((c) => c.value === cat)?.label || cat;
}

// ─── Housing Tiers ─────────────────────────────────────────────────────────

export const HOUSING_TIERS = {
  essential: {
    label: "Essential",
    pricing: "Included",
    pricingNote: "with membership",
    pricePerNight: 0,
    description:
      "Boutique hotel-style room with shared common spaces. Clean, comfortable, and everything you need to focus on the experience.",
    dashboardDescription:
      "Shared resort experience with fellow members. Group energy, curated programming, all-inclusive.",
    features: [
      "Private hotel-style room",
      "Shared common areas",
      "Wi-Fi, A/C, daily housekeeping",
    ],
    privateAvailable: false,
    maxGuests: 2,
  },
  premium: {
    label: "Premium",
    pricing: "$450",
    pricingNote: "/night",
    pricePerNight: 450,
    description:
      "Your own suite at a five-star resort. Full resort amenities, pool, spa access, and room service — all coordinated by our concierge team.",
    dashboardDescription:
      "5-star resort with premium amenities. Private or shared — your call. Elevated service, your own rhythm.",
    features: [
      "Private suite at 5-star resort",
      "Pool, spa + fitness center",
      "Restaurant access + room service",
    ],
    privateAvailable: true,
    maxGuests: 10,
  },
  elite: {
    label: "Elite",
    pricing: "$1,500",
    pricingNote: "/night",
    pricePerNight: 1500,
    description:
      "A fully private 4-5 bedroom luxury home with your own chef, daily catering, housekeeping, and a personal trainer on call.",
    dashboardDescription:
      "Your own luxury home. Private chef, personal staff, complete solitude. The full experience, nobody around.",
    features: [
      "Private luxury home (4-5 bedrooms)",
      "Private chef + daily catering",
      "Housekeeping + personal trainer",
    ],
    privateAvailable: true,
    maxGuests: 10,
  },
} as const;

export type HousingTierKey = keyof typeof HOUSING_TIERS;

export function getTierLabel(tier: string): string {
  return HOUSING_TIERS[tier as HousingTierKey]?.label || tier;
}

export function getTierPricing(tier: string): string {
  const t = HOUSING_TIERS[tier as HousingTierKey];
  if (!t) return "";
  return t.pricePerNight === 0 ? "Included" : `$${t.pricePerNight.toLocaleString()}/night`;
}

// ─── Booking / Retreat Rules ───────────────────────────────────────────────

export const BOOKING_RULES = {
  minDuration: 2,
  maxDuration: 14,
  maxGuests: 10,
  minLeadTimeDays: 14,
  durationOptions: [3, 5, 7, 10, 14] as const,
} as const;

// ─── Membership Pricing ────────────────────────────────────────────────────

export const MEMBERSHIP_PRICING = {
  quarterly: {
    label: "Quarterly Membership",
    price: 2000,
    period: "quarter",
    features: [
      "Mastermind community + live calls",
      "Health protocols and daily systems",
      "Private member portal access",
      "Design your own retreat (dates + duration)",
      "Essential housing included, upgrades available",
    ],
  },
  annual: {
    label: "All-In Annual",
    price: 5000,
    period: "year",
    features: [
      "Everything in Quarterly",
      "One Puerto Rico retreat included",
      "Essential housing included",
      "Priority upgrade to Premium + Elite",
      "Direct concierge access + priority scheduling",
    ],
  },
} as const;
