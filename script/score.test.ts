import { scoreApplication, EXEC_QUESTIONS } from "../shared/models/executiveQuestions.js";

const base: Record<string, unknown> = {
  commitment: "Yes", investment: "Yes", startTiming: "Immediately",
  peopleAffected: "51–250", weeklyTime: "4–7 hours", duration: "3+ years",
  readiness: 9, support: ["Private 1:1 coaching"], teamInterest: "Just me",
  fiveYear: "x".repeat(200), possible: "y".repeat(200),
  threeChanges: "z".repeat(200), worthwhile: "w".repeat(200),
};

const cases: [string, Record<string, unknown>][] = [
  ["strong exec", base],
  ["cannot invest", { ...base, investment: "Not currently" }],
  ["wants it for team", { ...base, teamInterest: "Yes — I'd want this for my team" }],
  ["not committed", { ...base, commitment: "No" }],
  ["retreat-leaning", { commitment: "Yes", investment: "Possibly, depending on the program", startTiming: "1–3 months", readiness: 5, support: ["Retreat"], teamInterest: "Just me" }],
  ["just exploring", { commitment: "Yes", investment: "Possibly, depending on the program", startTiming: "Just exploring", readiness: 3, support: ["Community"], teamInterest: "Just me" }],
];

for (const [name, a] of cases) {
  const r = scoreApplication(a);
  console.log(name.padEnd(20), "score", String(r.score).padStart(3), "->", r.route.padEnd(9), "|", r.reasons.join("; "));
}
const ids = EXEC_QUESTIONS.map((q) => q.id);
console.log("\nquestions:", EXEC_QUESTIONS.length, "| required:", EXEC_QUESTIONS.filter((q) => q.required).length);
console.log("duplicate ids:", ids.filter((v, i) => ids.indexOf(v) !== i));
