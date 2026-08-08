
/**
 * Sakred Executive application.
 *
 * Answers are stored as JSON rather than one column per question so the form can
 * evolve without a migration every time. Identity and the derived score/route are
 * promoted to real columns because that's what the admin list sorts and filters on.
 *
 * IMPORTANT: this is a qualifying form, not a health intake. It deliberately does
 * not collect symptoms, medications, diagnoses, or medical history — that belongs
 * after enrolment, gathered separately, not on a public marketing page.
 */

export type QuestionType = "text" | "email" | "tel" | "long" | "single" | "multi" | "scale";

export interface ExecQuestion {
  id: string;
  type: QuestionType;
  label: string;
  help?: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  /** Groups questions into screens in the UI. */
  section: string;
}

export const EXEC_SECTIONS = [
  "You",
  "Responsibility",
  "Where You Are",
  "What You Want",
  "Fit",
] as const;

export const EXEC_QUESTIONS: ExecQuestion[] = [
  // ── You ────────────────────────────────────────────────────────────────
  { id: "firstName", type: "text", label: "First name", required: true, section: "You" },
  { id: "lastName", type: "text", label: "Last name", required: true, section: "You" },
  { id: "email", type: "email", label: "Email", required: true, section: "You" },
  { id: "phone", type: "tel", label: "Phone", required: true, section: "You" },
  { id: "location", type: "text", label: "City and country", required: true, section: "You" },
  {
    id: "occupation",
    type: "text",
    label: "What do you do?",
    placeholder: "Role and company",
    required: true,
    section: "You",
  },

  // ── Responsibility ─────────────────────────────────────────────────────
  {
    id: "role",
    type: "single",
    label: "What best describes your current role?",
    required: true,
    section: "Responsibility",
    options: [
      "Founder / Owner",
      "C-Suite / Executive",
      "Senior leadership",
      "Sales / Revenue leadership",
      "Professional practice",
      "Investor",
      "Other",
    ],
  },
  {
    id: "peopleAffected",
    type: "single",
    label: "How many people are ultimately affected by your decisions?",
    help: "A better measure of load than revenue.",
    required: true,
    section: "Responsibility",
    options: ["Just me", "2–10", "11–50", "51–250", "250+"],
  },
  {
    id: "workHours",
    type: "single",
    label: "How demanding is an average week?",
    required: true,
    section: "Responsibility",
    options: ["Under 40 hours", "40–50 hours", "50–60 hours", "60+ hours"],
  },
  {
    id: "travel",
    type: "single",
    label: "How often do you travel for work?",
    required: true,
    section: "Responsibility",
    options: ["Rarely", "A few times a year", "Monthly", "Every other week", "Weekly"],
  },
  {
    id: "scheduleControl",
    type: "single",
    label: "How much control do you have over your own schedule?",
    required: true,
    section: "Responsibility",
    options: ["Almost none", "A little", "Moderate", "A great deal", "Almost complete"],
  },

  // ── Where You Are ──────────────────────────────────────────────────────
  {
    id: "physicalState",
    type: "single",
    label: "How would you describe your current physical state?",
    required: true,
    section: "Where You Are",
    options: [
      "Struggling / depleted",
      "Functional but not thriving",
      "Generally healthy",
      "Healthy and actively improving",
      "Highly trained / performance focused",
    ],
  },
  {
    id: "limiting",
    type: "multi",
    label: "Where is your body currently limiting your performance?",
    help: "Select everything that applies.",
    required: true,
    section: "Where You Are",
    options: [
      "Energy",
      "Focus",
      "Sleep",
      "Stress tolerance",
      "Training",
      "Recovery",
      "Body composition",
      "Digestion",
      "Mobility or pain",
      "Travel resilience",
      "Consistency",
      "Confidence",
      "Nothing obvious — I simply want more capacity",
    ],
  },
  {
    id: "dropoff",
    type: "single",
    label: "At what point in the day do you stop feeling like your best self?",
    required: true,
    section: "Where You Are",
    options: [
      "Morning",
      "Early afternoon",
      "Late afternoon",
      "Evening",
      "It varies dramatically",
      "I generally hold good energy",
    ],
  },
  {
    id: "closest",
    type: "single",
    label: "Which of these feels closest to true?",
    required: true,
    section: "Where You Are",
    options: [
      "My career has advanced faster than my health",
      "I know exactly what to do but don't consistently do it",
      "I've optimized individual pieces without building a complete system",
      "I'm starting to feel the physical cost of my lifestyle",
      "I'm already healthy and want another level of performance",
      "I've neglected myself while building everything else",
    ],
  },
  {
    id: "routine",
    type: "long",
    label: "What does your routine actually look like right now?",
    help: "Food, training, movement, sleep, work schedule — whatever is genuinely consistent.",
    placeholder: "Be honest rather than aspirational — it's more useful to us.",
    required: true,
    section: "Where You Are",
  },
  {
    id: "tried",
    type: "long",
    label: "What have you already tried?",
    placeholder: "What worked, what didn't, and how long you stuck with it.",
    section: "Where You Are",
  },
  {
    id: "blockers",
    type: "multi",
    label: "What keeps you from making this change on your own?",
    required: true,
    section: "Where You Are",
    options: [
      "I don't know what to do",
      "Too much conflicting information",
      "Lack of consistency",
      "Lack of accountability",
      "My schedule",
      "Stress or burnout",
      "I start strong and fall off",
      "I need a personalized plan",
      "I need a better environment",
    ],
  },

  // ── What You Want ──────────────────────────────────────────────────────
  {
    id: "fiveYear",
    type: "long",
    label: "If your current health and lifestyle continued unchanged for five years, what concerns you most?",
    required: true,
    section: "What You Want",
  },
  {
    id: "possible",
    type: "long",
    label: "What becomes possible if your physical capacity meaningfully improves?",
    required: true,
    section: "What You Want",
  },
  {
    id: "threeChanges",
    type: "long",
    label: "If we could meaningfully change three things in the next six months, what would they be?",
    required: true,
    section: "What You Want",
  },
  {
    id: "orientation",
    type: "single",
    label: "What are you primarily looking for?",
    required: true,
    section: "What You Want",
    options: [
      "Health restoration",
      "Physical development",
      "Personal development",
      "Professional performance",
      "A combination of all four",
    ],
  },
  {
    id: "duration",
    type: "single",
    label: "How long has this been something you've wanted to change?",
    required: true,
    section: "What You Want",
    options: ["Recently", "3–12 months", "1–3 years", "3+ years", "Most of my adult life"],
  },

  // ── Fit ────────────────────────────────────────────────────────────────
  {
    id: "readiness",
    type: "scale",
    label: "How ready are you to change your current habits?",
    help: "1 = not really, 10 = whatever it takes.",
    required: true,
    section: "Fit",
  },
  {
    id: "weeklyTime",
    type: "single",
    label: "How much time could you realistically give this each week?",
    required: true,
    section: "Fit",
    options: ["Less than 2 hours", "2–4 hours", "4–7 hours", "7+ hours"],
  },
  {
    id: "support",
    type: "multi",
    label: "Which kind of support interests you?",
    required: true,
    section: "Fit",
    options: [
      "Private 1:1 coaching",
      "Small-group coaching",
      "Mastermind",
      "Retreat",
      "Workshops",
      "Community",
      "Open to your recommendation",
    ],
  },
  {
    id: "retreatOpen",
    type: "single",
    label: "Would you be open to an in-person retreat?",
    required: true,
    section: "Fit",
    options: ["Yes", "Maybe", "Not currently"],
  },
  {
    id: "teamInterest",
    type: "single",
    label: "Would you want this for your team as well as yourself?",
    required: true,
    section: "Fit",
    options: ["Just me", "Possibly my team later", "Yes — I'd want this for my team"],
  },
  {
    id: "startTiming",
    type: "single",
    label: "If accepted, when would you want to begin?",
    required: true,
    section: "Fit",
    options: ["Immediately", "Within 30 days", "1–3 months", "Just exploring"],
  },
  {
    id: "investment",
    type: "single",
    label:
      "Private Sakred Body programs take a meaningful investment of time and money. If there's a strong fit, are you in a position to invest?",
    required: true,
    section: "Fit",
    options: [
      "Yes",
      "Yes, with a payment plan",
      "Possibly, depending on the program",
      "Not currently",
    ],
  },
  {
    id: "worthwhile",
    type: "long",
    label: "What would have to happen for this to feel unquestionably worthwhile?",
    required: true,
    section: "Fit",
  },
  {
    id: "context",
    type: "long",
    label:
      "Is there anything about your circumstances we should know before we talk about training or coaching?",
    help: "Optional, and intentionally broad. Please don't share detailed medical information here — if we work together we'll gather anything relevant securely, separately.",
    section: "Fit",
  },
  {
    id: "commitment",
    type: "single",
    label:
      "Sakred Body coaching is collaborative. We provide structure, education, and accountability — you do the work. Are you prepared to participate actively?",
    required: true,
    section: "Fit",
    options: ["Yes", "No"],
  },
  {
    id: "anythingElse",
    type: "long",
    label: "Anything else you want us to understand before we speak?",
    section: "Fit",
  },
];

// ── Scoring ──────────────────────────────────────────────────────────────

export type ExecRoute = "book" | "nurture" | "retreat" | "teams" | "declined";

export interface ExecScore {
  score: number;
  route: ExecRoute;
  reasons: string[];
}

const POINTS: Record<string, Record<string, number>> = {
  investment: { Yes: 30, "Yes, with a payment plan": 24, "Possibly, depending on the program": 10, "Not currently": 0 },
  startTiming: { Immediately: 20, "Within 30 days": 16, "1–3 months": 8, "Just exploring": 0 },
  peopleAffected: { "Just me": 2, "2–10": 6, "11–50": 10, "51–250": 12, "250+": 14 },
  weeklyTime: { "Less than 2 hours": 0, "2–4 hours": 6, "4–7 hours": 10, "7+ hours": 12 },
  duration: { Recently: 2, "3–12 months": 5, "1–3 years": 8, "3+ years": 10, "Most of my adult life": 10 },
};

/**
 * Fit score out of 100, plus the route the application should take.
 * Computed server-side so the client can't influence it.
 */
export function scoreApplication(answers: Record<string, unknown>): ExecScore {
  const reasons: string[] = [];
  let score = 0;

  const str = (k: string) => (typeof answers[k] === "string" ? (answers[k] as string) : "");
  const arr = (k: string) => (Array.isArray(answers[k]) ? (answers[k] as string[]) : []);

  for (const [key, table] of Object.entries(POINTS)) {
    const v = str(key);
    if (v && table[v] !== undefined) score += table[v];
  }

  const readiness = Number(answers.readiness) || 0;
  score += Math.round((readiness / 10) * 14);

  // Depth of written answers is a strong seriousness signal.
  const written = ["fiveYear", "possible", "threeChanges", "worthwhile"]
    .map((k) => str(k).trim().length)
    .reduce((a, b) => a + b, 0);
  if (written > 600) { score += 10; reasons.push("Detailed written answers"); }
  else if (written > 250) score += 5;

  score = Math.max(0, Math.min(100, score));

  if (str("commitment") === "No") {
    return { score, route: "declined", reasons: ["Not prepared to participate actively"] };
  }

  if (str("investment") === "Not currently") {
    reasons.push("Not currently able to invest — route to app and community");
    return { score, route: "nurture", reasons };
  }

  if (str("teamInterest") === "Yes — I'd want this for my team") {
    reasons.push("Wants this for a team — corporate opportunity");
    return { score, route: "teams", reasons };
  }

  if (readiness >= 7) reasons.push(`High readiness (${readiness}/10)`);
  if (["11–50", "51–250", "250+"].includes(str("peopleAffected"))) {
    reasons.push(`Responsible for ${str("peopleAffected")} people`);
  }
  if (arr("support").includes("Retreat") && !arr("support").includes("Private 1:1 coaching") && score < 60) {
    reasons.push("Primarily interested in immersion");
    return { score, route: "retreat", reasons };
  }

  if (score >= 60) {
    reasons.push("Strong fit — offer a call");
    return { score, route: "book", reasons };
  }

  reasons.push("Interested but not yet qualified");
  return { score, route: "nurture", reasons };
}

export const ROUTE_LABELS: Record<ExecRoute, string> = {
  book: "Book a call",
  nurture: "App + community",
  retreat: "Retreats",
  teams: "Corporate / teams",
  declined: "Not a fit",
};
