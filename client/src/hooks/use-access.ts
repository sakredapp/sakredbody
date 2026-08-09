import { useAuth } from "@/hooks/use-auth";
import {
  can as canDo,
  effectiveRole,
  roleRank,
  atLeast,
  type Capability,
  type Role,
} from "@shared/models/access";
import { TIER_RANKS, type TierKey } from "@shared/models/community";

/**
 * What the person looking at the screen is allowed to see.
 *
 * The UI used to gate on `user.isAdmin === "true"` — a string comparison
 * against a two-state field, repeated wherever an admin-only control lived.
 * Two problems with that, and the second is the one that bites:
 *
 *   1. It can only ever answer one question. There is no way to show a coach
 *      their cohort roster without also handing them the members table.
 *   2. It couples the UI to the *ladder* rather than to the *job*. Deciding
 *      that moderators can answer support means finding every screen that
 *      asked "is this an admin" and working out which of them meant it.
 *
 * So components ask `can("answerSupport")`, and where a capability sits is a
 * one-line change in shared/models/access.ts.
 *
 * ── This is convenience, not security ────────────────────────────────────
 *
 * Everything here is derived from a response the client was handed, so it
 * decides what to *draw* and nothing else. Every route behind these controls
 * is independently gated server-side by `requireCapability`. Hiding a button
 * is not access control; it is manners.
 */
export interface Access {
  role: Role;
  /** Position on the staff ladder. Useful for `>=` comparisons in a render. */
  rank: number;
  /** Where the member sits on the paid ladder — 0 for free, 30 for executive. */
  tierRank: number;
  /** Any back-office surface at all. Cheap check for "show the Admin link". */
  isStaff: boolean;
  can: (capability: Capability) => boolean;
  /** Directly on the staff ladder, when a capability would be overwrought. */
  atLeast: (role: Role) => boolean;
  /** Paid tier, for gating member-facing content rather than staff tools. */
  hasTier: (tier: TierKey) => boolean;
}

export function useAccess(): Access {
  const { user } = useAuth();

  // `effectiveRole` trusts whichever of `role` and the legacy `isAdmin` bit
  // is higher, so a session opened before the migration ran doesn't silently
  // lose its back office.
  const role = user ? effectiveRole(user) : "member";
  const tierRank = (user as { tierRank?: number } | null | undefined)?.tierRank ?? 0;

  return {
    role,
    rank: roleRank(role),
    tierRank,
    isStaff: canDo(role, "viewBackOffice"),
    can: (capability) => canDo(role, capability),
    atLeast: (min) => atLeast(role, min),
    hasTier: (tier) => tierRank >= TIER_RANKS[tier],
  };
}
