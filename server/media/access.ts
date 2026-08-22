/**
 * May this person see this image?
 *
 * ── One function, because there was nearly one per feature ────────────────
 *
 * The alternative — each route deciding for itself — is how a photograph ends
 * up readable from a screen nobody thought about. This reads the asset's own
 * `purpose` and answers from that, so adding a fourth screen that renders
 * images adds no new opportunity to get it wrong.
 *
 * ── Every refusal is a 404 ────────────────────────────────────────────────
 *
 * Callers turn `false` into "no such image", never "not allowed". A 403 on a
 * progress photo tells a stranger that a particular member has one, which is
 * information about somebody's body given to somebody with no claim on it.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { mediaAssets, communityMessages, progressPhotos } from "../../shared/schema.js";
import { canSee } from "../community/routes.js";
import { activeRelationship } from "../coaching/relationships.js";
import type { MediaPurpose } from "../../shared/models/media.js";

export type AssetRow = { id: string; ownerUserId: string; purpose: string };

export async function assetById(assetId: string): Promise<AssetRow | null> {
  const [row] = await db
    .select({ id: mediaAssets.id, ownerUserId: mediaAssets.ownerUserId, purpose: mediaAssets.purpose })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  return row ?? null;
}

/**
 * Whether `viewerId` may read the bytes of `asset`.
 *
 * The owner always may — including before the image has been attached to
 * anything, which is the state it is in while they are still deciding whether
 * to post it.
 */
export async function mayRead(viewerId: string, asset: AssetRow): Promise<boolean> {
  if (asset.ownerUserId === viewerId) return true;

  const purpose = asset.purpose as MediaPurpose;

  if (purpose === "progress") {
    /*
      Deliberately `activeRelationship` rather than `requireCoachOf`.

      That middleware grants access to anyone holding `superviseCoaching`,
      which is right for running the coaching programme and wrong here: an
      admin is not this member's coach, and a progress photo is not coaching
      administration. The narrower check is the whole point of this branch.
    */
    return (await activeRelationship(viewerId, asset.ownerUserId)) !== null;
  }

  if (purpose === "room") {
    /*
      A Room photo is visible to whoever can read the room it was posted in —
      not to anyone holding the link, and not to the whole community, because
      channels are tier- and offering-gated and a photograph posted in a paid
      room stays in it.

      An asset attached to nothing is visible only to its owner, handled above.
    */
    const posts = await db
      .select({ channelId: communityMessages.channelId })
      .from(communityMessages)
      .where(eq(communityMessages.imageAssetId, asset.id));
    for (const post of posts) {
      if (await canSee(viewerId, post.channelId)) return true;
    }
    return false;
  }

  return false;
}

/**
 * The member whose progress timeline an asset belongs to, if it is one.
 *
 * Used by the coach's view to check that the photo it is about to render
 * really is a photo of the client it is rendering it under.
 */
export async function progressOwnerOf(assetId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: progressPhotos.userId })
    .from(progressPhotos)
    .where(eq(progressPhotos.assetId, assetId))
    .limit(1);
  return row?.userId ?? null;
}

/** Whether `coachUserId` is the member's coach right now. Relationship only. */
export async function isActiveCoachOf(coachUserId: string, memberUserId: string): Promise<boolean> {
  if (coachUserId === memberUserId) return false;
  return (await activeRelationship(coachUserId, memberUserId)) !== null;
}
