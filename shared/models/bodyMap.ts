/**
 * The Sakred Body Map — the canon.
 *
 * Seven territories, their stable keys, their canonical names, and the order
 * they are read in. Nothing else. This is the part the website and the app are
 * required to agree on.
 *
 * ── Why this is not the content ───────────────────────────────────────────
 *
 * The app used to read the website's content object directly, which meant a
 * copy edit to the public Body Map silently changed how a member's health
 * screen explained their body. Sharing the *taxonomy* is correct — one Sakred
 * model, not two vocabularies for one body. Sharing the *prose* is not: the two
 * surfaces have different jobs, different lengths, and different readers, and
 * a website editor should not be able to reach into a member's screen.
 *
 * So the split is:
 *
 *     shared/models/bodyMap.ts    the seven, their names, their order
 *     client/src/data/bodyMap.ts  public education — philosophy, traditions
 *     client/src/data/bodyMapApp.ts  member-facing — notice, signals, practice
 *
 * Both surfaces must cover all seven keys, and a test asserts it in both
 * directions. Adding a territory is therefore a deliberate act in three files
 * rather than something one surface can drift into alone.
 *
 * ── The keys are geometry, the names are the model ───────────────────────
 *
 * `crown`, `throat`, `root` and the rest name regions of the constellation
 * figure — where the stars are. They are deliberately *not* the taxonomy, and
 * they are not shown to anybody. The nine-centre vocabulary they echo is one
 * lens on the body, not the body itself; the names below are the model.
 */

export const BODY_REGION_KEYS = [
  "crown",
  "throat",
  "root",
  "heart",
  "gut",
  "legs",
  "arms",
] as const;

export type BodyRegionKey = (typeof BODY_REGION_KEYS)[number];

/**
 * The canonical name of each territory. Changing one of these changes Sakred's
 * model of the body, on every surface at once — which is the intent.
 */
export const BODY_REGION_NAMES: Record<BodyRegionKey, string> = {
  crown: "Mind & Awareness",
  throat: "Breath & Pressure",
  root: "The Central Axis",
  heart: "The Organ Network",
  gut: "The Middle",
  legs: "Flow",
  arms: "Structure & Strength",
};

/** Head to ground. The order both surfaces read them in. */
export const BODY_REGION_ORDER: BodyRegionKey[] = [
  "crown",
  "throat",
  "root",
  "heart",
  "gut",
  "legs",
  "arms",
];
