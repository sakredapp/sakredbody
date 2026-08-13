/** Outbound links used across the marketing pages. */

/**
 * The app store listings — `null` until each one is actually live.
 *
 * Both of these used to point at **Sakred Health**: `id6756814847` on the App
 * Store and `com.sakredunion.app` on Play. That is a different product for a
 * different audience (docs/VISION.md §1) — free and macro, where this one is
 * a five-figure coaching engagement. Someone who came here, read this page and
 * tapped "iOS" would have installed the wrong app and had no way to find out;
 * there is no error state for landing in a listing that looks plausible. Worse
 * than sending them nowhere.
 *
 * `com.sakredbody.app` is submitted and in review. Approval gives each store
 * its own URL — and the two stores approve independently, so expect to fill
 * these in one at a time rather than together.
 *
 * **To restore:** paste the real URL over `null` here and nothing else. The
 * footer and the login page each read these directly and turn back into links
 * on their own; neither has a hardcoded store URL. Do not re-point either one
 * at Sakred Health in the meantime.
 */
export const APP_STORE_URL: string | null = null;
export const PLAY_STORE_URL: string | null = null;

export const FOOD_CHART_URL = "https://www.sakredhealth.com/food-chart";
export const SAKRED_HEALTH_URL = "https://www.sakredhealth.com";

export interface NavEntry {
  label: string;
  href?: string;
  /**
   * When present the entry becomes a dropdown and `href` is ignored.
   *
   * `tool` marks an entry that is not the same kind of thing as the ones above
   * it. The Intelligence holds three philosophy pages and one utility; without
   * the distinction a visitor reads four equal destinations and has to work
   * out for themselves that one of them is a lookup table.
   */
  children?: { label: string; href: string; note?: string; tool?: boolean }[];
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
 *
 *                      This held four items and read as a pile, largely
 *                      because two of them — The Terrain and Body Literacy —
 *                      were one argument split across two pages. They are now
 *                      The Body Map, and what is left is three things that are
 *                      genuinely different in kind: the map, the manifesto and
 *                      the tool.
 *   Gather           — where the practice becomes an experience with other
 *                      people. Already a coherent trio in WaysToWork.tsx.
 *
 * Embody is not here. Embodiment is what living the system produces, not a
 * fourth thing to choose; its material is now inside The Body Map, along with
 * the terrain and the literacy pages it used to sit beside.
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
      { label: "The Body Map", href: "/the-body-map", note: "How the body works, and who taught us to read it" },
      { label: "How Sakred Works", href: "/how-sakred-works", note: "The philosophy inside the app" },
      { label: "The Manifesto", href: "/manifesto", note: "Why modern health feels fragmented" },
      { label: "Food Chart", href: "/food-chart", note: "What food actually does", tool: true },
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
