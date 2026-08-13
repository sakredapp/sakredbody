/**
 * The coaching conversation — who may read it, write to it, and open its files.
 *
 * ── What these are guarding ───────────────────────────────────────────────
 *
 * Coaching attachments were permanent Supabase *public* URLs. A member's
 * progress photo or blood panel was retrievable by anyone holding the link,
 * forever, with no session — and the upload endpoint that minted those links
 * was gated on `isAuthenticated` and nothing else, so any account could put a
 * file in the bucket.
 *
 * The replacement stores private objects and mints a short-lived URL per
 * request, after the caller has been authorized against the conversation. These
 * assertions pin the authorization; the storage behaviour is verified against
 * the real Postgres and the real bucket separately.
 *
 * Pure decisions only — no server, no database.
 *
 * Run: tsx script/test-coaching-messages.ts
 */

import { readFileSync } from "node:fs";
import {
  decideConversationAccess,
  senderRoleFor,
} from "../shared/models/conversationAccess.js";
import { sendMessageSchema } from "../shared/models/coaching.js";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  attachmentPath,
} from "../server/coaching/attachmentStore.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const SARAH = "u-sarah";
const JOHN = "u-john";
const NICK = "u-nick";
const GERARD = "u-gerard";

/** Sarah's conversation, with Nick currently coaching her. */
const sarahsThread = (actorId: string, actorRole: Parameters<typeof decideConversationAccess>[0]["actorRole"], coach: string | null = NICK) =>
  decideConversationAccess({
    actorId,
    memberUserId: SARAH,
    actorRole,
    currentCoachUserId: coach,
  });

console.log("\nWho may open a coaching conversation\n");

check("the member always reaches their own", sarahsThread(SARAH, "member") === "self");
check("their current coach reaches it", sarahsThread(NICK, "coach") === "coach");
check("another member does not", sarahsThread(JOHN, "member") === null);
check("an unrelated coach does not", sarahsThread(GERARD, "coach") === null);

/**
 * The regression that closed in Slice 2, restated for conversations: the ladder
 * is hierarchical, so a moderator outranks a coach — and coaches nobody.
 */
check("a moderator outranks a coach and reaches nothing", sarahsThread("u-mod", "moderator") === null);

/** The bypass is a named capability, and it is the only way past. */
check("an admin reaches it, as an admin", sarahsThread("u-admin", "admin") === "admin");
check("an owner too", sarahsThread("u-owner", "owner") === "admin");
check(
  "and it is distinguishable from being their coach",
  sarahsThread("u-admin", "admin") !== "coach",
);

console.log("\nA former coach keeps the history and loses the access\n");

/**
 * The whole point of §5. Reassignment preserves the thread — Nick's messages
 * stay Nick's — but "old messages exist" must never become "Nick can still
 * fetch her lab results", including files uploaded long after he stopped
 * coaching her. An ended relationship is not permanent access to future
 * information.
 */
check("Nick reaches Sarah while he coaches her", sarahsThread(NICK, "coach", NICK) === "coach");
check("and reaches nothing once Gerard has her", sarahsThread(NICK, "coach", GERARD) === null);
check("Gerard reaches her now", sarahsThread(GERARD, "coach", GERARD) === "coach");
check("Sarah still reaches her own thread throughout", sarahsThread(SARAH, "member", GERARD) === "self");

/** A member with no coach at all: only they and an admin reach it. */
check("nobody's coach reaches an uncoached member", sarahsThread(NICK, "coach", null) === null);
check("the member still does", sarahsThread(SARAH, "member", null) === "self");
check("an admin still does", sarahsThread("u-admin", "admin", null) === "admin");

console.log("\nWhich side wrote it\n");

check("the member's own messages are from the member", senderRoleFor("self") === "member");
check("their coach's are from the coach", senderRoleFor("coach") === "coach");
/**
 * An admin writing into a thread is displayed on the coach's side, because the
 * member's side of a conversation is theirs alone. `sender_user_id` still
 * records exactly which human it was, which is what attribution is for.
 */
check("an admin writes on the coach side", senderRoleFor("admin") === "coach");

console.log("\nWhat a client may say when sending\n");

check("text alone is fine", sendMessageSchema.safeParse({ content: "hello" }).success);
check(
  "an attachment alone is fine",
  sendMessageSchema.safeParse({
    content: "",
    attachmentIds: ["11111111-2222-3333-4444-555555555555"],
  }).success,
);
check("empty and attachmentless is refused", !sendMessageSchema.safeParse({ content: "" }).success);
check(
  "whitespace is not content",
  !sendMessageSchema.safeParse({ content: "   \n  " }).success,
);

/**
 * The field this replaces accepted `imageUrl: z.string()` — any URL in the
 * world, stored and then rendered into the thread. That was a privacy hole and
 * a way to put arbitrary remote content on somebody else's screen.
 */
{
  const parsed = sendMessageSchema.safeParse({
    content: "hi",
    imageUrl: "https://evil.example/tracker.gif",
  });
  check("a client-supplied URL is not accepted", parsed.success && !("imageUrl" in parsed.data));
}
check(
  "an attachment id must be a uuid, not a path",
  !sendMessageSchema.safeParse({ content: "hi", attachmentIds: ["../../secrets"] }).success,
);
check(
  "and there is a ceiling on how many",
  !sendMessageSchema.safeParse({
    content: "hi",
    attachmentIds: Array.from({ length: 11 }, () => "11111111-2222-3333-4444-555555555555"),
  }).success,
);
/** `photo` is gone as a client-settable type — a PDF is not a photograph. */
check(
  "a message cannot declare itself a photo",
  !sendMessageSchema.safeParse({ content: "hi", messageType: "photo" }).success,
);

console.log("\nWhat may be uploaded, and where it lands\n");

check("SVG is not an accepted image", !ALLOWED_ATTACHMENT_TYPES.includes("image/svg+xml"));
check("nor is HTML", !ALLOWED_ATTACHMENT_TYPES.includes("text/html"));
check("PDFs are", ALLOWED_ATTACHMENT_TYPES.includes("application/pdf"));
check("photographs are", ALLOWED_ATTACHMENT_TYPES.includes("image/jpeg"));
check("the ceiling is 10 MB", MAX_ATTACHMENT_BYTES === 10 * 1024 * 1024);

/**
 * The old path was `${userId}/${Date.now()}_${sanitizedOriginalName}`, and it
 * was then published as a public URL — so "Sarah-bloodwork-August.pdf" was in a
 * link that leaked its own contents. The name is data now, never a path.
 */
{
  const path = attachmentPath(SARAH, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "application/pdf");
  check("the path is built from ids we minted", path === `${SARAH}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf`);
  check("the member's filename is nowhere in it", !path.toLowerCase().includes("bloodwork"));
}
check(
  "an unknown mime falls back rather than guessing",
  attachmentPath(SARAH, "x", "application/zip").endsWith(".bin"),
);

/**
 * Both inputs are ours today — a database key and a uuid we just minted — so
 * these pass trivially on current callers. They are here because callers get
 * added, and a builder that is only safe while everybody remembers to be
 * careful will eventually be handed something careless.
 */
for (const hostile of ["../../etc", "a/b", "..", "....", "\u0000x"]) {
  const path = attachmentPath(hostile, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "image/png");
  check(`no traversal from ${JSON.stringify(hostile)}`, !path.includes(".."), path);
  check(`exactly two segments from ${JSON.stringify(hostile)}`, path.split("/").length === 2, path);
}

console.log("\nThree different things that must not become one\n");

/**
 * Chat, the member-visible plan note, and the coach's private note.
 *
 * `coachNote` is written by a coach *about* a member and the member is not its
 * audience. The refactor that moved messaging into its own module is exactly
 * when a private field gets swept into a response by a `select()` with no
 * column list, so this reads the source rather than trusting the review.
 */
{
  const messaging = readFileSync(new URL("../server/coaching/messageRoutes.ts", import.meta.url), "utf8");
  check("messaging never touches coachNote", !/coachNote|coach_note/.test(messaging));

  const conversation = readFileSync(new URL("../server/coaching/conversation.ts", import.meta.url), "utf8");
  check("nor does the conversation gate", !/coachNote|coach_note/.test(conversation));

  /** The member's own phases endpoint still strips it on the way out. */
  const habits = readFileSync(new URL("../server/habits/routes.ts", import.meta.url), "utf8");
  check(
    "the member's phases endpoint still strips it",
    /rows\.map\(\(\{ coachNote, \.\.\.rest \}\) => rest\)/.test(habits),
  );
}

/**
 * And the attachment shape hands out no way to reach an object directly.
 *
 * A response carrying `storagePath` or a signed URL would be the old bug in new
 * clothes: something that looks like a handle, works without a session, and
 * gets pasted somewhere.
 */
{
  const messaging = readFileSync(new URL("../server/coaching/messageRoutes.ts", import.meta.url), "utf8");
  const shape = messaging.slice(
    messaging.indexOf("function publicAttachment"),
    messaging.indexOf("/** The thread"),
  );
  check("no storage path in the client shape", !/storagePath|storage_path/.test(shape));
  check("no bucket in the client shape", !/storageBucket|COACHING_BUCKET/.test(shape));
  check("no url in the client shape", !/[uU]rl/.test(shape));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
