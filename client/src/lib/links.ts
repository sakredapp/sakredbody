/** Outbound links used across the marketing pages. */
export const APP_STORE_URL = "https://apps.apple.com/us/app/sakred-health/id6756814847";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.sakredunion.app";

export const FOOD_CHART_URL = "https://www.sakredhealth.com/food-chart";
export const SAKRED_HEALTH_URL = "https://www.sakredhealth.com";

export interface NavEntry {
  label: string;
  href?: string;
  /** When present the entry becomes a dropdown and `href` is ignored. */
  children?: { label: string; href: string; note?: string }[];
}

/**
 * Primary site navigation — shared by the header on every page.
 *
 * ── Why the groups are these groups ───────────────────────────────────────
 *
 * "The Path" used to hold five things that were not the same kind of thing:
 * two directions (Restore, Build), a relationship dressed as a destination
 * (Embody), a sales page (Gather → /retreats) and a tool (Food Chart). A menu
 * that mixes categories teaches the visitor that the model is complicated,
 * before they have read a word of it.
 *
 * The three groups below are the model:
 *
 *   The Practice     — the interface. Two items, because the body has two
 *                      directions and that is the whole first idea.
 *   The Intelligence — why either direction can be right or wrong, and how to
 *                      tell. Seasons and elements live in here, one level
 *                      down, where they read as depth rather than as a
 *                      prerequisite.
 *   Gather           — where the practice becomes an experience with other
 *                      people. Already a coherent trio in WaysToWork.tsx.
 *
 * Embody is not here. Embodiment is what living the system produces, not a
 * fourth thing to choose; its material moved to Body Literacy, whose job is
 * teaching you which direction you currently need. See data/territories.ts.
 */
export const SITE_NAV: NavEntry[] = [
  {
    label: "The Practice",
    children: [
      { label: "Restore", href: "/restore", note: "Yin — clear the terrain" },
      { label: "Build", href: "/build", note: "Yang — build its capacity" },
    ],
  },
  {
    label: "The Intelligence",
    children: [
      { label: "The Terrain", href: "/the-terrain", note: "Why the same input helps or harms" },
      { label: "Body Literacy", href: "/body-literacy", note: "Learn which direction you need" },
      { label: "What Is a Sakred Body?", href: "/philosophy", note: "The manifesto" },
      { label: "Food Chart", href: "/food-chart", note: "What food actually does" },
    ],
  },
  {
    label: "Gather",
    children: [
      { label: "Retreats", href: "/retreats", note: "Six formats, three days to two weeks" },
      { label: "Mastermind", href: "/mastermind", note: "Membership + retreats" },
      { label: "Sakred Executive", href: "/executive", note: "Private coaching · application only" },
    ],
  },
];

/** Legal pages are shared across the brands and live on the Sakred Health domain. */
export const LEGAL_LINKS = [
  // On this domain, not sakredhealth.com. The app stores require a policy at a
  // public URL for *this* product, and a reviewer following a link to another
  // brand's policy is a rejection.
  { label: "Support", href: "/support" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  // Linked in the footer, not only from the Play listing: Play wants the route
  // discoverable from the product itself, not just from the console field.
  { label: "Delete Account", href: "/delete-account" },
  { label: "AI Privacy", href: "https://www.sakredhealth.com/ai-privacy" },
  { label: "Opt-In", href: "https://www.sakredhealth.com/opt-in" },
] as const;
