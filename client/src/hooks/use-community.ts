/**
 * Community — data layer.
 *
 * The room polls; a thread does not. A room is where people are talking at
 * each other in real time, so it goes stale in seconds. A thread is a
 * conversation you have opened and are reading — repainting it underneath
 * someone mid-sentence is worse than being a few seconds behind.
 *
 * The global query client sets `staleTime: Infinity`, so every interval here
 * is stated rather than inherited.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Channel } from "@shared/schema";
// Segments, not markup — see the module for why rendering the raw headline as
// HTML would be a stored XSS.
import type { HeadlineSegment } from "@shared/utils/highlight";
import { worthRetrying } from "@shared/models/community";

export interface Author {
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

/** One movement on a shared workout card. Working sets only. */
export interface SharedMovement {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number | null;
  topWeightKg: number | null;
  supersetGroup: string | null;
}

export interface SharedWorkout {
  sessionId: string;
  title: string | null;
  onDate: string;
  durationMinutes: number | null;
  movements: SharedMovement[];
  volumeKg: number | null;
  /** When the member published this. The card is as of then, and only then. */
  publishedAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  parentId: string | null;
  rootId: string | null;
  depth: number;
  body: string;

  /** A voice memo, when there is one. `audioMime` is the real recorded

   *  type — iOS records mp4, Android webm, and iOS cannot play webm. */

  audioUrl?: string | null;

  audioMime?: string | null;

  audioDurationSeconds?: number | null;
  /** A photograph, when there is one. An id, never a URL — see MediaImage. */
  imageAssetId?: string | null;

  /**
   * The workout this post is about, as the member published it.
   *
   * A copy taken at publish time, not a live view of their training log —
   * correcting a set later corrects the log and leaves this post saying what
   * it said. Null when the post is not about a workout, or is a tombstone.
   */
  workout?: SharedWorkout | null;

  replyCount: number;
  deletedAt: string | null;
  editedAt: string | null;
  createdAt: string;
  /** Absent on a tombstone — a deleted message has no author to show. */
  author: Author | null;
  reactions: Reaction[];
  deleted?: boolean;
}

export interface SearchHit {
  id: string;
  channelId: string;
  rootId: string | null;
  body: string;
  headline: HeadlineSegment[];
  createdAt: string;
  author: Author | null;
}

async function get<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    /*
      The status travels with the error, in the shape `humanError` reads.

      Without it every failure was the same opaque string, and the Room had no
      way to tell "you cannot see this" from "the server did not answer" — so
      it said the first about both. A 503 from a cold server became a sentence
      about the member's access.
    */
    const serverMessage = await res.text().catch(() => "");
    throw Object.assign(new Error(`Failed to load ${label}`), {
      status: res.status,
      serverMessage,
    });
  }
  return res.json();
}

/** The rule itself lives in the shared model, where it is tested. */
function transient(err: unknown): boolean {
  const status =
    err && typeof err === "object" && "status" in err && typeof err.status === "number"
      ? err.status
      : null;
  return worthRetrying(status);
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((d) => d.message)
      .catch(() => null);
    throw new Error(message ?? "That didn't go through");
  }
  return res.json();
}

export function useChannels() {
  return useQuery<Channel[]>({
    queryKey: ["/api/community/channels"],
    queryFn: () => get("/api/community/channels", "the rooms"),
    /*
      This list is the gate to the whole tab, and the global defaults are
      `retry: false` with `staleTime: Infinity`. One failed request therefore
      left the Room saying "No rooms are open to you yet" — and never asked
      again, so it stayed wrong until the app was restarted. A member who has
      always had access reads that as having lost it.

      The first request after a cold start is the one that fails: the server
      answers 503 while it is still finding a database connection. So this
      retries what is worth retrying, and refetches when the app comes back to
      the foreground.
    */
    retry: (count, err) => count < 2 && transient(err),
    retryDelay: (count) => 400 * 2 ** count,
    refetchOnWindowFocus: true,
  });
}

export function useRoom(channelId: string | null) {
  return useQuery<Message[]>({
    queryKey: ["/api/community/channels", channelId],
    queryFn: () => get(`/api/community/channels/${channelId}`, "this room"),
    enabled: !!channelId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

export function useThread(rootId: string | null) {
  return useQuery<Message[]>({
    queryKey: ["/api/community/threads", rootId],
    queryFn: () => get(`/api/community/threads/${rootId}`, "this thread"),
    enabled: !!rootId,
  });
}

/**
 * Search only runs on a real query. `enabled` on a trimmed length rather than
 * a debounce hook — the caller debounces the term it passes in, so this stays
 * a pure function of its argument.
 */
export function useCommunitySearch(q: string) {
  const term = q.trim();
  return useQuery<SearchHit[]>({
    queryKey: ["/api/community/search", term],
    queryFn: () => get(`/api/community/search?q=${encodeURIComponent(term)}`, "search"),
    enabled: term.length >= 2,
  });
}

/** Both the room and any open thread may now be wrong. Refresh both. */
function invalidateConversation(channelId: string, rootId?: string | null) {
  queryClient.invalidateQueries({ queryKey: ["/api/community/channels", channelId] });
  if (rootId) {
    queryClient.invalidateQueries({ queryKey: ["/api/community/threads", rootId] });
  }
}

export function usePostMessage() {
  return useMutation({
    mutationFn: (input: {
      channelId: string;
      parentId?: string | null;
      body: string;
      audioUrl?: string | null;
      audioMime?: string | null;
      audioDurationSeconds?: number | null;
      imageAssetId?: string | null;
      sharedSessionId?: string | null;
    }) => send<Message>("POST", "/api/community/messages", input),
    onSuccess: (created) => invalidateConversation(created.channelId, created.rootId),
  });
}

export function useEditMessage() {
  return useMutation({
    mutationFn: (input: { id: string; body: string }) =>
      send<Message>("PATCH", `/api/community/messages/${input.id}`, { body: input.body }),
    onSuccess: (updated) => invalidateConversation(updated.channelId, updated.rootId),
  });
}

export function useDeleteMessage() {
  return useMutation({
    mutationFn: (input: { id: string; channelId: string; rootId: string | null }) =>
      send<{ id: string }>("DELETE", `/api/community/messages/${input.id}`).then(() => input),
    onSuccess: (input) => invalidateConversation(input.channelId, input.rootId),
  });
}

export function useToggleReaction() {
  return useMutation({
    mutationFn: (input: {
      id: string;
      emoji: string;
      channelId: string;
      rootId: string | null;
    }) =>
      send<{ emoji: string; reacted: boolean }>(
        "POST",
        `/api/community/messages/${input.id}/react`,
        { emoji: input.emoji },
      ).then(() => input),
    onSuccess: (input) => invalidateConversation(input.channelId, input.rootId),
  });
}

// ─── Presentation helpers ──────────────────────────────────────────────────

export function displayName(author: Author | null): string {
  if (!author) return "Someone";
  const name = [author.firstName, author.lastName].filter(Boolean).join(" ").trim();
  return name || "Someone";
}

export function initialsOf(author: Author | null): string {
  if (!author) return "·";
  return (
    [author.firstName?.[0], author.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "·"
  );
}

/**
 * Relative until it stops being useful, then absolute.
 *
 * "3 days ago" is worse than a date once you're past a couple of days — people
 * read a community thread to find out *when* something happened.
 */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 172_800) return "yesterday";

  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(new Date(then).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

/**
 * Build the reply tree from the flat payload.
 *
 * The server returns a thread flat and ordered by time; nesting is the client's
 * job. Children keep the server's ordering, so a reply always appears after the
 * one it answers.
 */
export interface TreeNode {
  message: Message;
  children: TreeNode[];
}

export function buildTree(messages: Message[], rootId: string): TreeNode | null {
  const nodes = new Map<string, TreeNode>();
  for (const m of messages) nodes.set(m.id, { message: m, children: [] });

  for (const m of messages) {
    if (m.id === rootId || !m.parentId) continue;
    // A reply whose parent isn't in the payload would vanish silently; hanging
    // it off the root keeps the words visible even if the shape is imperfect.
    const parent = nodes.get(m.parentId) ?? nodes.get(rootId);
    parent?.children.push(nodes.get(m.id)!);
  }

  return nodes.get(rootId) ?? null;
}
