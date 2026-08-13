/**
 * What has happened that this person has not seen.
 *
 * ── Not the source of truth for anything ──────────────────────────────────
 *
 * A notification is evidence that an event occurred. It is never the state.
 * "There is an unread `checkin_requested`" does not mean a request is open —
 * `coaching_checkin_requests.status` says that, and the card on Today reads it
 * directly. An unread `plan_activated` does not mean there is a plan; the plan
 * does. This exists to put a number on a nav item, and to stop a member
 * wondering whether they missed something.
 *
 * ── And invisible to most people ──────────────────────────────────────────
 *
 * Somebody with no coach generates no coaching events, so the count is zero and
 * nothing renders. There is no "turn on notifications" module, no empty inbox,
 * no bell with a dash in it. The presence of the infrastructure is not a reason
 * to put it on their screen.
 */

import { useQuery } from "@tanstack/react-query";

export type AppNotification = {
  id: string;
  type: string;
  actorUserId: string | null;
  resourceType: string;
  resourceId: string | null;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
};

/**
 * The badge.
 *
 * Its own endpoint rather than counting a fetched list — the count is polled
 * and the list is not, and a partial index makes the count cheap regardless of
 * how much history somebody has.
 *
 * `0` on failure, deliberately. A badge that renders an error is worse than a
 * badge that renders nothing, and the destinations themselves are the truth.
 */
export function useUnreadCount(): number {
  const { data } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return data?.count ?? 0;
}

/**
 * How many of those are about a coach conversation.
 *
 * The Coach badge counts messages specifically, rather than every event —
 * "Coach · 1" next to a plan activation would send somebody to a conversation
 * to find nothing new in it.
 */
export function useUnreadCoachMessages(): number {
  const { data } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
  return (data ?? []).filter((n) => n.type === "coaching.message" && !n.readAt).length;
}
