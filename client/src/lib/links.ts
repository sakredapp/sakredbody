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

/** Primary site navigation — shared by the header on every page. */
export const SITE_NAV: NavEntry[] = [
  {
    label: "Philosophy",
    children: [
      { label: "What Is a Sakred Body?", href: "/philosophy", note: "The manifesto" },
      { label: "The Terrain", href: "/the-terrain", note: "The body as an environment" },
      { label: "Body Literacy", href: "/body-literacy", note: "Learn to read the signals" },
    ],
  },
  {
    label: "The Path",
    children: [
      { label: "Restore", href: "/restore", note: "Clear the terrain" },
      { label: "Build", href: "/build", note: "Build its capacity" },
      { label: "Embody", href: "/embody", note: "Live inside it consciously" },
      { label: "Gather", href: "/retreats", note: "Environment that holds" },
    ],
  },
  { label: "Portal", href: "/member" },
  { label: "Food Chart", href: "/food-chart" },
  {
    label: "Work With Us",
    children: [
      { label: "Sakred Executive", href: "/executive", note: "Private coaching · application only" },
      { label: "Mastermind", href: "/mastermind", note: "Membership + retreats" },
      { label: "Retreats", href: "/retreats", note: "Puerto Rico, six formats" },
    ],
  },
];

/** Legal pages are shared across the brands and live on the Sakred Health domain. */
export const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "https://www.sakredhealth.com/privacy-policy" },
  { label: "Terms of Service", href: "https://www.sakredhealth.com/terms-of-service" },
  { label: "AI Privacy", href: "https://www.sakredhealth.com/ai-privacy" },
  { label: "Opt-In", href: "https://www.sakredhealth.com/opt-in" },
] as const;
