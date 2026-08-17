/**
 * Community.
 *
 * One room at a time, threads hanging off any message, and a search bar that
 * only looks inside rooms you're actually in.
 *
 * Three views, never two at once: the room, one thread, or search results.
 * A thread takes the whole pane on purpose — Slack's side-panel makes a reply
 * feel like a footnote, and here the replies are usually the point.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useChannels,
  useRoom,
  useThread,
  useCommunitySearch,
  usePostMessage,
  useEditMessage,
  useDeleteMessage,
  useToggleReaction,
  buildTree,
  displayName,
  initialsOf,
  timeAgo,
  type Message,
  type TreeNode,
  type SearchHit,
} from "@/hooks/use-community";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Flag,
  ArrowLeft,
  MessageSquare,
  Search,
  Lock,
  X,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Channel } from "@shared/schema";
import { SectionHeading } from "@/components/portal/Panel";
import { ReportDialog } from "@/components/ReportDialog";
import { VoiceRecorderControl, VoiceMemoPlayer } from "@/components/VoiceMemo";

/** Kept short deliberately. A long picker turns a reaction into a decision. */
const REACTIONS = ["🔥", "🙏", "💛", "👀", "🌙"];

// ─── Composer ──────────────────────────────────────────────────────────────

function Composer({
  placeholder,
  submitLabel,
  initial = "",
  autoFocus = false,
  pending,
  onSubmit,
  onCancel,
  allowVoice = false,
}: {
  placeholder: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  pending: boolean;
  onSubmit: (body: string, audio?: { url: string; mime: string; durationSeconds: number }) => void;
  onCancel?: () => void;
  /** Off for edits — you can add words to a memo, not re-record it. */
  allowVoice?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Grow to the text rather than scrolling inside a fixed box — people write
  // paragraphs here, not chat lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [body]);

  const submit = () => {
    const text = body.trim();
    if (!text || pending) return;
    onSubmit(text);
    setBody("");
  };

  return (
    <div className="space-y-2">
      <Textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter breaks the line. Escape backs out of a
          // reply or an edit without losing the room underneath.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape" && onCancel) onCancel();
        }}
        placeholder={placeholder}
        rows={2}
        maxLength={8000}
        className="resize-none min-h-0"
        data-testid="input-community-composer"
      />
      {/* One action row.
          Record used to sit in its own block underneath, which read as a
          separate feature rather than the other way to say the same thing —
          and left a band of empty space between the two ways of doing one
          job. They are alternatives, so they sit side by side. */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={!body.trim() || pending}
          className="bg-gold border-gold-border text-white"
          data-testid="button-community-send"
        >
          {submitLabel}
        </Button>

        {/* A memo sends on its own — it does not wait for the text box,
            because the whole point is not having to type. Any words already
            written go with it, which is why it is not disabled on empty. */}
        {allowVoice && (
          <VoiceRecorderControl
            disabled={pending}
            onSend={(audio) => {
              onSubmit(body.trim(), audio);
              setBody("");
            }}
          />
        )}

        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground/60 ml-auto hidden sm:inline">
          Enter to send · Shift+Enter for a new line
        </span>
      </div>
    </div>
  );
}

// ─── One message ───────────────────────────────────────────────────────────

function Reactions({
  message,
  onToggle,
}: {
  message: Message;
  onToggle: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const has = new Set(message.reactions.map((r) => r.emoji));

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {message.reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onToggle(r.emoji)}
          className={cn(
            "text-xs rounded-full px-2 py-0.5 border transition-colors",
            r.mine
              ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/15"
              : "border-border/60 hover:border-[hsl(var(--gold))]/50",
          )}
          data-testid={`button-reaction-${r.emoji}`}
        >
          {r.emoji} {r.count}
        </button>
      ))}

      {open ? (
        <span className="flex items-center gap-0.5">
          {REACTIONS.filter((e) => !has.has(e)).map((e) => (
            <button
              key={e}
              onClick={() => {
                onToggle(e);
                setOpen(false);
              }}
              className="text-xs rounded-full px-1.5 py-0.5 hover:bg-muted"
            >
              {e}
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground/60 px-1"
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-muted-foreground/50 hover:text-[hsl(var(--gold))] px-1.5 py-0.5"
          aria-label="Add a reaction"
          data-testid="button-add-reaction"
        >
          +
        </button>
      )}
    </div>
  );
}

function MessageBody({
  message,
  mine,
  onReply,
  onOpenThread,
  onToggleReaction,
  onEdit,
  onDelete,
  onReport,
  editing,
  onStartEdit,
  onCancelEdit,
  editPending,
}: {
  message: Message;
  mine: boolean;
  onReply?: () => void;
  onOpenThread?: () => void;
  onToggleReaction: (emoji: string) => void;
  onEdit: (body: string) => void;
  onDelete: () => void;
  onReport?: () => void;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  editPending: boolean;
}) {
  const gone = !!message.deletedAt;

  return (
    <div className="flex gap-3 min-w-0">
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        {message.author?.profileImageUrl && (
          <AvatarImage src={message.author.profileImageUrl} alt="" />
        )}
        <AvatarFallback className="text-[10px]">{initialsOf(message.author)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium">
            {gone ? "—" : displayName(message.author)}
          </span>
          <span className="text-[11px] text-muted-foreground/60">
            {timeAgo(message.createdAt)}
            {message.editedAt && !gone && " · edited"}
          </span>
        </div>

        {/* Above the words, because a memo with a caption is a memo first. */}
        {!gone && message.audioUrl && (
          <VoiceMemoPlayer
            url={message.audioUrl}
            mime={message.audioMime}
            durationSeconds={message.audioDurationSeconds}
          />
        )}

        {gone ? (
          <p className="text-sm italic text-muted-foreground/50">This message was deleted.</p>
        ) : editing ? (
          <Composer
            placeholder="Edit your message"
            submitLabel="Save"
            initial={message.body}
            autoFocus
            pending={editPending}
            onSubmit={onEdit}
            onCancel={onCancelEdit}
          />
        ) : (
          // whitespace-pre-wrap so paragraph breaks survive; break-words so a
          // pasted URL can't push the column wider than the phone.
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {message.body}
          </p>
        )}

        {!gone && !editing && (
          <div className="flex items-center gap-3 flex-wrap pt-0.5">
            <Reactions message={message} onToggle={onToggleReaction} />

            {onReply && (
              <button
                onClick={onReply}
                className="text-xs text-muted-foreground/60 hover:text-[hsl(var(--gold))]"
                data-testid="button-reply"
              >
                Reply
              </button>
            )}

            {onOpenThread && message.replyCount > 0 && (
              <button
                onClick={onOpenThread}
                className="text-xs text-[hsl(var(--gold))] hover:underline inline-flex items-center gap-1"
                data-testid="button-open-thread"
              >
                <MessageSquare className="h-3 w-3" />
                {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
              </button>
            )}

            {/* On other people's messages only. Reporting your own is not a
                thing, and the API refuses it — you can delete it instead. */}
            {!mine && !gone && onReport && (
              <button
                onClick={onReport}
                className="text-xs text-muted-foreground/40 hover:text-foreground inline-flex items-center gap-1"
                aria-label="Report or block"
                data-testid="button-report-message"
              >
                <Flag className="h-3 w-3" />
              </button>
            )}

            {mine && (
              <>
                <button
                  onClick={onStartEdit}
                  className="text-xs text-muted-foreground/50 hover:text-foreground inline-flex items-center gap-1"
                  aria-label="Edit"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={onDelete}
                  className="text-xs text-muted-foreground/50 hover:text-destructive inline-flex items-center gap-1"
                  aria-label="Delete"
                  data-testid="button-delete-message"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Thread ────────────────────────────────────────────────────────────────

function ThreadNode({
  node,
  channelId,
  rootId,
  myId,
  depth,
}: {
  node: TreeNode;
  channelId: string;
  rootId: string;
  myId: string | undefined;
  depth: number;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);

  const post = usePostMessage();
  const edit = useEditMessage();
  const remove = useDeleteMessage();
  const react = useToggleReaction();
  const { toast } = useToast();

  const m = node.message;

  return (
    <div
      className={cn(
        depth > 0 &&
          // The rail is what makes nesting readable; indent alone stops working
          // by about the third level on a phone.
          "border-l border-border/40 pl-4 ml-3",
      )}
    >
      <div className="py-3">
        <MessageBody
          message={m}
          mine={!!myId && m.userId === myId}
          onReply={() => setReplying((v) => !v)}
          onToggleReaction={(emoji) =>
            react.mutate({ id: m.id, emoji, channelId, rootId })
          }
          onEdit={(body) => {
            edit.mutate(
              { id: m.id, body },
              { onError: (e) => toast({ title: e.message, variant: "destructive" }) },
            );
            setEditing(false);
          }}
          onDelete={() => remove.mutate({ id: m.id, channelId, rootId })}
          editing={editing}
          onReport={() => setReporting(true)}
          onStartEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          editPending={edit.isPending}
        />

        {reporting && (
          <ReportDialog
            messageId={m.id}
            authorId={m.userId}
            authorName={displayName(m.author)}
            open
            onClose={() => setReporting(false)}
          />
        )}

        {replying && (
          <div className="mt-3 pl-10">
            <Composer
              placeholder={`Reply to ${displayName(m.author)}`}
              submitLabel="Reply"
              autoFocus
              pending={post.isPending}
              allowVoice
              onSubmit={(body, audio) => {
                post.mutate(
                  {
                    channelId,
                    parentId: m.id,
                    body,
                    audioUrl: audio?.url ?? null,
                    audioMime: audio?.mime ?? null,
                    audioDurationSeconds: audio?.durationSeconds ?? null,
                  },
                  { onError: (e) => toast({ title: e.message, variant: "destructive" }) },
                );
                setReplying(false);
              }}
              onCancel={() => setReplying(false)}
            />
          </div>
        )}
      </div>

      {node.children.map((child) => (
        <ThreadNode
          key={child.message.id}
          node={child}
          channelId={channelId}
          rootId={rootId}
          myId={myId}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function ThreadView({
  rootId,
  channelId,
  onBack,
}: {
  rootId: string;
  channelId: string;
  onBack: () => void;
}) {
  const thread = useThread(rootId);
  const { user } = useAuth();

  if (thread.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const tree = thread.data ? buildTree(thread.data, rootId) : null;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        data-testid="button-back-to-room"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the room
      </button>

      {tree ? (
        <ThreadNode
          node={tree}
          channelId={channelId}
          rootId={rootId}
          myId={user?.id}
          depth={0}
        />
      ) : (
        <p className="text-sm text-muted-foreground py-12 text-center">
          This thread is no longer here.
        </p>
      )}
    </div>
  );
}

// ─── Room ──────────────────────────────────────────────────────────────────

function RoomView({
  channel,
  onOpenThread,
}: {
  channel: Channel;
  onOpenThread: (rootId: string) => void;
}) {
  const room = useRoom(channel.id);
  const post = usePostMessage();
  const edit = useEditMessage();
  const remove = useDeleteMessage();
  const react = useToggleReaction();
  const { user } = useAuth();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);

  const readOnly = channel.isReadOnly && user?.isAdmin !== "true";

  return (
    <div className="space-y-6" data-tour-id="room-feed">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-display text-2xl">{channel.name}</h2>
          {channel.isReadOnly && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Lock className="h-2.5 w-2.5" /> Announcements
            </Badge>
          )}
        </div>
        {channel.description && (
          <p className="text-sm text-muted-foreground">{channel.description}</p>
        )}
      </div>

      {readOnly ? (
        <p className="text-sm text-muted-foreground/70 border border-border/50 rounded-md p-4">
          This room is for announcements. You can read and react, but not post.
        </p>
      ) : (
        <Composer
          placeholder={`Say something in ${channel.name}`}
          submitLabel="Post"
          pending={post.isPending}
          allowVoice
          onSubmit={(body, audio) =>
            post.mutate(
              {
                channelId: channel.id,
                body,
                audioUrl: audio?.url ?? null,
                audioMime: audio?.mime ?? null,
                audioDurationSeconds: audio?.durationSeconds ?? null,
              },
              { onError: (e) => toast({ title: e.message, variant: "destructive" }) },
            )
          }
        />
      )}

      {room.isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : room.data && room.data.length > 0 ? (
        <div className="divide-y divide-border/40">
          {room.data.map((m) => (
            <div key={m.id} className="py-5">
              <MessageBody
                message={m}
                mine={!!user?.id && m.userId === user.id}
                onOpenThread={() => onOpenThread(m.rootId ?? m.id)}
                onReply={() => onOpenThread(m.rootId ?? m.id)}
                onToggleReaction={(emoji) =>
                  react.mutate({ id: m.id, emoji, channelId: channel.id, rootId: null })
                }
                onEdit={(body) => {
                  edit.mutate(
                    { id: m.id, body },
                    { onError: (e) => toast({ title: e.message, variant: "destructive" }) },
                  );
                  setEditingId(null);
                }}
                onDelete={() =>
                  remove.mutate({ id: m.id, channelId: channel.id, rootId: null })
                }
                editing={editingId === m.id}
                onReport={() => setReportingId(m.id)}
                onStartEdit={() => setEditingId(m.id)}
                onCancelEdit={() => setEditingId(null)}
                editPending={edit.isPending}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-12 text-center">
          Nothing here yet. Start it.
        </p>
      )}

      {/* One dialog for the room, driven by which message is being reported,
          rather than one mounted per message — a room of forty posts would
          otherwise mount forty dialogs to show none of them. */}
      {reportingId && (() => {
        const target = room.data?.find((m) => m.id === reportingId);
        if (!target) return null;
        return (
          <ReportDialog
            messageId={target.id}
            authorId={target.userId}
            authorName={displayName(target.author)}
            open
            onClose={() => setReportingId(null)}
          />
        );
      })()}
    </div>
  );
}

// ─── Search ────────────────────────────────────────────────────────────────

function SearchResults({
  term,
  channels,
  onOpen,
}: {
  term: string;
  channels: Channel[];
  onOpen: (channelId: string, rootId: string) => void;
}) {
  const results = useCommunitySearch(term);
  const nameOf = (id: string) => channels.find((c) => c.id === id)?.name ?? "a room";

  if (term.trim().length < 2) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        Type at least two characters.
      </p>
    );
  }

  if (results.isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!results.data || results.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        Nothing matched “{term}”.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {results.data.map((hit: SearchHit) => (
        <button
          key={hit.id}
          onClick={() => onOpen(hit.channelId, hit.rootId ?? hit.id)}
          className="w-full text-left py-4 space-y-1.5 hover:bg-muted/30 px-2 -mx-2 rounded-md"
          data-testid={`search-hit-${hit.id}`}
        >
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium">{displayName(hit.author)}</span>
            <span className="text-[11px] text-muted-foreground/60">
              in {nameOf(hit.channelId)} · {timeAgo(hit.createdAt)}
            </span>
          </div>
          {/* Segments from ts_headline, rendered as text nodes. The emphasis is
              on the terms Postgres actually matched, and nothing a member typed
              is ever parsed as markup. */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {hit.headline.map((seg, i) =>
              seg.match ? (
                <strong key={i} className="text-foreground font-medium">
                  {seg.text}
                </strong>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </p>
        </button>
      ))}
    </div>
  );
}

// ─── The tab ───────────────────────────────────────────────────────────────

export function CommunityTab() {
  const channels = useChannels();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);

  // Land in the first room they can see rather than on a picker — with one
  // general room, a picker would be a screen between them and the only thing
  // behind it.
  useEffect(() => {
    if (!channelId && channels.data && channels.data.length > 0) {
      setChannelId(channels.data[0].id);
    }
  }, [channels.data, channelId]);

  if (channels.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!channels.data || channels.data.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <Users className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No rooms are open to you yet.
        </p>
      </div>
    );
  }

  const channel = channels.data.find((c) => c.id === channelId) ?? channels.data[0];

  return (
    <div className="space-y-6">
      <SectionHeading
        title="The Room"
        subtitle="What people are working through, and what they've finished."
      />

      {/* Rooms + search. Rooms scroll horizontally so the header never wraps
          on a phone, however many cohort rooms someone belongs to. */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setSearching(e.target.value.trim().length > 0);
              }}
              placeholder="Search everything you can see"
              className="pl-9"
              data-testid="input-community-search"
            />
          </div>
          {searching && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTerm("");
                setSearching(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {!searching && channels.data.length > 1 && (
          <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-1">
            {channels.data.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setChannelId(c.id);
                  setThreadId(null);
                }}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors",
                  c.id === channel.id
                    ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
                data-testid={`community-channel-${c.slug}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={searching ? "search" : threadId ?? channel.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {searching ? (
            <SearchResults
              term={term}
              channels={channels.data}
              onOpen={(cid, rid) => {
                setChannelId(cid);
                setThreadId(rid);
                setSearching(false);
                setTerm("");
              }}
            />
          ) : threadId ? (
            <ThreadView
              rootId={threadId}
              channelId={channel.id}
              onBack={() => setThreadId(null)}
            />
          ) : (
            <RoomView channel={channel} onOpenThread={setThreadId} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
