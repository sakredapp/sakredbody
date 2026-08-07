/** Outbound links used across the marketing pages. */
export const APP_STORE_URL = "https://apps.apple.com/us/app/sakred-health/id6756814847";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.sakredunion.app";

export const FOOD_CHART_URL = "https://www.sakredhealth.com/food-chart";
export const SAKRED_HEALTH_URL = "https://www.sakredhealth.com";

/** Primary site navigation — real pages, shared by the header and footer. */
export const SITE_NAV = [
  { label: "The App", href: "/app" },
  { label: "Food Chart", href: "/food-chart" },
  { label: "Mastermind", href: "/mastermind" },
] as const;

/** Legal pages are shared across the brands and live on the Sakred Health domain. */
export const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "https://www.sakredhealth.com/privacy-policy" },
  { label: "Terms of Service", href: "https://www.sakredhealth.com/terms-of-service" },
  { label: "AI Privacy", href: "https://www.sakredhealth.com/ai-privacy" },
  { label: "Opt-In", href: "https://www.sakredhealth.com/opt-in" },
] as const;
