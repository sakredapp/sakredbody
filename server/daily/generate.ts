/**
 * Daily note generation.
 *
 * Generate once per member per day, filter it, store it. The unique index on
 * (user_id, on_date) is what makes this idempotent — two concurrent requests
 * race to insert and the loser reads the winner's row rather than paying for a
 * second generation.
 *
 * Order of preference, and it never throws at the caller:
 *   1. an existing row for today
 *   2. a fresh generation that passes `judge()`
 *   3. computed fallback text
 *
 * A member never sees an error here. The worst case is a terse, true note.
 */

import { db } from "../db.js";
import { eq, and, gte, sql, count } from "drizzle-orm";
import {
  dailyNotes,
  dailyIntentions,
  users,
  userCosmology,
  userRoutines,
  wellnessRoutines,
  energyCentres,
  habits,
  type DailyNote,
} from "../../shared/schema.js";
import { almanacFor, elementalSeason } from "../../shared/utils/almanac.js";
import { addDaysToString, routineDayNumber } from "../../shared/utils/dates.js";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  judge,
  anchorsFor,
  fallbackNote,
  type Candidate,
  type NoteContext,
} from "./voice.js";
import { getModelClient } from "./model.js";
import { afterResponse } from "./background.js";

const MAX_ATTEMPTS = 3;

// ─── Context gathering ────────────────────────────────────────────────────

/** Which third of a protocol a day falls in. */
function protocolPhase(dayNumber: number, durationDays: number): string {
  const through = dayNumber / Math.max(1, durationDays);
  if (through <= 0.34) return "prepare";
  if (through <= 0.72) return "clear";
  return "rebuild";
}

export async function buildContext(userId: string, onDate: string): Promise<NoteContext> {
  const [user] = await db
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, userId));

  const [chart] = await db
    .select()
    .from(userCosmology)
    .where(eq(userCosmology.userId, userId));

  const almanac = almanacFor(onDate, {
    birthDate: chart?.birthDate ?? null,
    birthName: chart?.birthName ?? null,
    lifePathNumber: chart?.lifePathNumber ?? null,
    sunSign: chart?.sunSign ?? null,
    moonSign: chart?.moonSign ?? null,
    risingSign: chart?.risingSign ?? null,
  });

  // Where they are in a protocol, if anywhere.
  const [enrollment] = await db
    .select()
    .from(userRoutines)
    .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")))
    .limit(1);

  let protocol: NoteContext["protocol"] = null;
  let centreId: string | null = null;

  if (enrollment) {
    const [routine] = await db
      .select({ name: wellnessRoutines.name, durationDays: wellnessRoutines.durationDays })
      .from(wellnessRoutines)
      .where(eq(wellnessRoutines.id, enrollment.routineId));

    if (routine) {
      const dayNumber = routineDayNumber(enrollment.startDate, onDate);
      // Guard the display: a settled routine should never be out of range, but
      // a note claiming "day 24 of 21" would be worse than one claiming nothing.
      if (dayNumber >= 1 && dayNumber <= routine.durationDays) {
        protocol = {
          name: routine.name,
          dayNumber,
          durationDays: routine.durationDays,
          phase: protocolPhase(dayNumber, routine.durationDays),
        };
      }
    }
  }

  // The centre in focus: the season's, since protocol↔centre links are content
  // the admin sets and may not exist yet.
  const [y, m, d] = onDate.split("-").map(Number);
  centreId = elementalSeason(new Date(Date.UTC(y, m - 1, d, 12))).centreId;

  let centre: NoteContext["centre"] = null;
  if (centreId) {
    const [row] = await db
      .select({ id: energyCentres.id, name: energyCentres.name, aspect: energyCentres.aspect })
      .from(energyCentres)
      .where(eq(energyCentres.id, centreId));
    centre = row ?? null;
  }

  // Their own intention, if they set one before opening this.
  const [intention] = await db
    .select({ intention: dailyIntentions.intention })
    .from(dailyIntentions)
    .where(and(eq(dailyIntentions.userId, userId), eq(dailyIntentions.onDate, onDate)));

  // Last seven days of completion, so the note can notice without scolding.
  const weekAgo = addDaysToString(onDate, -7);
  const [recent] = await db
    .select({
      total: count(),
      done: sql<number>`SUM(CASE WHEN ${habits.completed} THEN 1 ELSE 0 END)`,
    })
    .from(habits)
    .where(
      and(
        eq(habits.userId, userId),
        gte(habits.scheduledDate, weekAgo),
        sql`${habits.scheduledDate} < ${onDate}`,
      ),
    );

  return {
    almanac,
    firstName: user?.firstName ?? null,
    polarity: chart?.polarity ?? null,
    protocol,
    centre,
    intention: intention?.intention ?? null,
    recentCompletion:
      recent && Number(recent.total) > 0
        ? { done: Number(recent.done ?? 0), total: Number(recent.total) }
        : null,
  };
}

// ─── Generation ───────────────────────────────────────────────────────────

function parseCandidate(text: string): Candidate | null {
  // Models sometimes wrap JSON in prose or a fence despite instructions.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (typeof parsed?.headline !== "string" || typeof parsed?.body !== "string") return null;
    return {
      headline: parsed.headline.trim(),
      body: parsed.body.trim(),
      invitation:
        typeof parsed.invitation === "string" && parsed.invitation.trim()
          ? parsed.invitation.trim()
          : null,
    };
  } catch {
    return null;
  }
}

interface Generated {
  candidate: Candidate;
  source: "model" | "fallback";
  model: string | null;
  attempts: number;
}

/**
 * Ask for a note, up to MAX_ATTEMPTS times, rejecting anything the filter
 * fails. Each retry tells the model exactly what was wrong — a filter that
 * only says "no" wastes the attempt.
 */
async function generate(ctx: NoteContext): Promise<Generated> {
  const client = await getModelClient();
  if (!client) {
    return { candidate: fallbackNote(ctx), source: "fallback", model: null, attempts: 0 };
  }

  const userPrompt = buildUserPrompt(ctx);
  // The facts this note is allowed to be about. A note citing none of them is
  // about nothing, which is the failure mode that matters most here.
  const anchors = anchorsFor(ctx);
  let lastReasons: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: userPrompt },
    ];

    if (lastReasons.length > 0) {
      // Tell it exactly what was wrong. A filter that only says "no" wastes
      // the retry.
      messages.push({ role: "assistant", content: "{}" });
      messages.push({
        role: "user",
        content:
          `That was rejected: ${lastReasons.join("; ")}. ` +
          "Write it again, shorter and plainer, naming a fact about today and " +
          "what follows from it. JSON only.",
      });
    }

    try {
      const { text } = await client.complete({
        system: SYSTEM_PROMPT,
        messages,
        maxTokens: 600,
      });

      const candidate = parseCandidate(text);
      if (!candidate) {
        lastReasons = ["response was not valid JSON"];
        continue;
      }

      const verdict = judge(candidate, anchors);
      if (verdict.ok) {
        return { candidate, source: "model", model: client.model, attempts: attempt };
      }
      lastReasons = verdict.reasons;
      console.warn(`[daily] attempt ${attempt} rejected:`, verdict.reasons.join("; "));
    } catch (err) {
      console.error(`[daily] generation attempt ${attempt} failed:`, err);
      lastReasons = ["generation error"];
    }
  }

  // Everything was rejected. Terse and true beats plausible and wrong.
  console.warn("[daily] falling back after", MAX_ATTEMPTS, "attempts:", lastReasons.join("; "));
  return { candidate: fallbackNote(ctx), source: "fallback", model: client.model, attempts: MAX_ATTEMPTS };
}

// ─── The entry point ──────────────────────────────────────────────────────

/**
 * The note for today, without ever waiting on the model.
 *
 * Generation was measured between 1.4s and 25.5s against a 30s function
 * ceiling, so the read path returns immediately: the stored note if there is
 * one, otherwise computed fallback text, with the real generation continuing
 * after the response. The member sees something true straight away and the
 * written note is there on their next load.
 *
 * `pending` tells the client whether it's worth asking again shortly.
 */
export async function getDailyNoteFast(
  userId: string,
  onDate: string,
): Promise<{ note: DailyNote | { headline: string; body: string; invitation: string | null }; pending: boolean }> {
  const [existing] = await db
    .select()
    .from(dailyNotes)
    .where(and(eq(dailyNotes.userId, userId), eq(dailyNotes.onDate, onDate)));

  if (existing) return { note: existing, pending: false };

  // Nothing stored yet. Answer from the almanac now, write the real one behind.
  const ctx = await buildContext(userId, onDate);
  const placeholder = fallbackNote(ctx);

  afterResponse(() => getOrCreateDailyNote(userId, onDate));

  return {
    note: {
      headline: placeholder.headline,
      body: placeholder.body,
      invitation: placeholder.invitation ?? null,
    },
    pending: true,
  };
}

/**
 * Today's note for this member, generating it if it doesn't exist yet.
 *
 * Blocks on the model, so this belongs in a background task or a cron — not
 * on a request path. `force` regenerates over an existing row: for the admin,
 * after a prompt change, never on a member's request.
 */
export async function getOrCreateDailyNote(
  userId: string,
  onDate: string,
  opts: { force?: boolean } = {},
): Promise<DailyNote> {
  if (!opts.force) {
    const [existing] = await db
      .select()
      .from(dailyNotes)
      .where(and(eq(dailyNotes.userId, userId), eq(dailyNotes.onDate, onDate)));
    if (existing) return existing;
  }

  const ctx = await buildContext(userId, onDate);
  const { candidate, source, model, attempts } = await generate(ctx);

  const values = {
    userId,
    onDate,
    headline: candidate.headline,
    body: candidate.body,
    invitation: candidate.invitation ?? null,
    inputs: ctx.almanac as unknown as Record<string, unknown>,
    source,
    model,
    attempts,
  };

  const [saved] = await db
    .insert(dailyNotes)
    .values(values)
    .onConflictDoUpdate({
      target: [dailyNotes.userId, dailyNotes.onDate],
      // A concurrent generation that lost the race wrote an equally valid note;
      // only overwrite deliberately.
      set: opts.force
        ? { ...values, reviewedAt: null, reviewedBy: null, flagged: false, flagNote: null }
        : { userId },
    })
    .returning();

  return saved;
}
