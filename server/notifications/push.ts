/**
 * Delivering a notification to a phone.
 *
 * ── One HTTP call, not an SDK ─────────────────────────────────────────────
 *
 * This talks to FCM HTTP v1 directly. `firebase-admin` would do the same POST,
 * but it arrives with Firestore, Realtime Database, Storage and their transitive
 * dependencies — every one of the audit findings that install produced came from
 * that chain, none of it from the part we use. What we need is an OAuth2 access
 * token and one endpoint, so `google-auth-library` signs the JWT and the request
 * is written out below where it can be read.
 *
 * ── The push is never the record ──────────────────────────────────────────
 *
 * `notifications` is the durable truth; this is a best-effort tap on the
 * shoulder. A member with no token, a denied permission, an expired
 * registration, a Firebase outage — all of them end with the row still written
 * and visible when they next open Sakred. Nothing here may throw into a caller,
 * because by the time it runs the transaction has already committed.
 *
 * ── What may be in a payload ──────────────────────────────────────────────
 *
 * Only the safe copy from NOTIFICATION_COPY: "Nick sent you a message", never
 * the message. A lock screen is a public surface — read over a shoulder, mirrored
 * to a watch, shown to whoever picks the phone up. The body of a coaching
 * conversation, a check-in answer, or anything a member wrote about their health
 * does not go through here. `data` carries ids, and the app fetches under the
 * member's own authorization once it is unlocked and open.
 */

import { GoogleAuth } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { isDeadToken } from "./fcmErrors.js";
import { pushTokens } from "../../shared/models/auth.js";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/**
 * `undefined` means "not read yet", `null` means "read, and there is none" —
 * the same distinction apiFetch makes about the auth token, and for the same
 * reason: without it every send re-parses the credential.
 */
let configured: { auth: GoogleAuth; projectId: string } | null | undefined;

/**
 * The service account, or nothing.
 *
 * Absent is a normal state, not an error: local development has no credential,
 * and neither did production until it did. Push simply does not happen, and the
 * durable notification still does. It warns once rather than per send, because a
 * log line on every message is how a warning stops being read.
 */
function fcm(): { auth: GoogleAuth; projectId: string } | null {
  if (configured !== undefined) return configured;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn("push: FIREBASE_SERVICE_ACCOUNT not set — notifications are in-app only");
    configured = null;
    return configured;
  }

  try {
    const json = JSON.parse(raw);
    if (!json.project_id || !json.private_key) {
      throw new Error("service account is missing project_id or private_key");
    }
    configured = {
      auth: new GoogleAuth({ credentials: json, scopes: [SCOPE] }),
      projectId: json.project_id,
    };
  } catch (err) {
    // Never the value — a malformed credential is still a credential.
    console.error(
      `push: FIREBASE_SERVICE_ACCOUNT could not be parsed (${
        err instanceof Error ? err.message : "unknown"
      }) — notifications are in-app only`,
    );
    configured = null;
  }
  return configured;
}

/**
 * Enough of a token to correlate two log lines, never enough to send with.
 *
 * A push token in a log is a way for anyone who can read logs to put a
 * notification on a member's phone.
 */
const trace = (token: string) => `…${token.slice(-6)}`;

export type PushPayload = {
  title: string;
  /** Already safe copy. See the header — no member content reaches here. */
  body?: string | null;
  /** Ids only, for routing on tap. FCM requires every value to be a string. */
  data: Record<string, string>;
};

/**
 * Send to every device a member has registered.
 *
 * Resolves when the attempts are done, and never rejects. Callers are
 * post-commit and have nothing useful to do with a failure.
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  const config = fcm();
  if (!config) return;

  const devices = await db
    .select({ token: pushTokens.token, platform: pushTokens.platform })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));

  // The common case for most of the product: nobody has granted permission, or
  // this member only ever uses the web app. Not a failure, and not worth a log.
  if (!devices.length) return;

  let accessToken: string | null | undefined;
  try {
    accessToken = (await config.auth.getAccessToken()) as string | null | undefined;
  } catch (err) {
    console.error(
      `push: could not obtain an access token (${err instanceof Error ? err.message : "unknown"})`,
    );
    return;
  }
  if (!accessToken) return;

  const url = `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`;

  for (const device of devices) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: {
              title: payload.title,
              ...(payload.body ? { body: payload.body } : {}),
            },
            data: payload.data,
            // High priority because these are person-to-person and time-bound;
            // a coach's reply batched until the next maintenance window is a
            // reply that arrived tomorrow.
            android: {
              priority: "high",
              notification: { channelId: "coaching", sound: "default" },
            },
            apns: {
              headers: { "apns-priority": "10" },
              payload: { aps: { sound: "default" } },
            },
          },
        }),
      });

      if (res.ok) continue;

      const detail = await res.text();
      if (isDeadToken(res.status, detail)) {
        // The device uninstalled, restored from a backup, or rotated. Keeping
        // the row means failing this send again for every future notification.
        await db.delete(pushTokens).where(eq(pushTokens.token, device.token));
        console.log(
          JSON.stringify({
            at: new Date().toISOString(),
            event: "push.token_retired",
            platform: device.platform,
            token: trace(device.token),
          }),
        );
        continue;
      }

      console.error(
        JSON.stringify({
          at: new Date().toISOString(),
          event: "push.failed",
          status: res.status,
          platform: device.platform,
          token: trace(device.token),
        }),
      );
    } catch (err) {
      // One unreachable device must not stop the others.
      console.error(
        JSON.stringify({
          at: new Date().toISOString(),
          event: "push.failed",
          platform: device.platform,
          token: trace(device.token),
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}

/** Test seam. Nothing in the app calls this. */
export function resetPushConfigForTests(): void {
  configured = undefined;
}
