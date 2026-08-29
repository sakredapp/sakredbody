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

import { useEffect, useMemo, useRef, useState } from "react";
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
import { MediaImage } from "@/components/MediaImage";
import { humanError } from "@shared/models/labels";
import {
  PhotoAttach,
  PhotoDraft,
  photoPending,
  type PhotoAttachment,
} from "@/components/PhotoAttach";
import { SharedWorkoutCard } from "@/components/SharedWorkoutCard";

/** Kept short deliberately. A long picker turns a reaction into a decision. */
/**
 * One reaction, deliberately.
 *
 * This was five emoji behind a `+` picker. The picker is the beginning of an
 * engagement surface — five becomes twelve, twelve becomes a tray, and a
 * member starts choosing how to feel about a post before they have finished
 * reading it. Room is for acknowledgement and conversation, not for scoring
 * each other.
 *
 * So: one thumb. Tap to acknowledge, tap again to take it back. The storage
 * model still carries `emoji`, so a second reaction remains a product decision
 * rather than a migration, and nothing here forecloses it.
 */
const LIKE = "\u{1F44D}";

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
  allowPhoto = false,
}: {
  placeholder: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  pending: boolean;
  /**
   * Returning a promise is what lets the draft survive a failed post.
   *
   * This used to return void and the composer emptied itself on the next
   * line, before anything had reached the server — so a post that failed
   * took the member's words and their photograph with it, and the toast
   * arrived over an empty box. Callers that resolve are cleared; callers
   * that reject keep the draft exactly as it was.
   */
  onSubmit: (
    body: string,
    audio?: { url: string; mime: string; durationSeconds: number },
    imageAssetId?: string | null,
  ) => void | Promise<unknown>;
  onCancel?: () => void;
  /** Off for edits — you can add words to a memo, not re-record it. */
  allowVoice?: boolean;
  /** Off for edits and replies to announcements. */
  allowPhoto?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const [photo, setPhoto] = useState<PhotoAttachment | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  /*
    Whether Enter can send depends on whether Shift+Enter exists.

    It sent unconditionally, with Shift+Enter reserved for a line break — and a
    phone keyboard has no shift to hold. Its return key arrives as Enter with
    `shiftKey` false, indistinguishable from the desktop send. So on a phone
    the member could not type a second line at all: every attempt at a
    paragraph break posted the half-written message instead.

    `(pointer: fine)` is the question actually being asked — is there a mouse
    and, with it, a hardware keyboard carrying the shift key this shortcut
    needs. On anything else Enter does what the key says and the Post button
    sends.
  */
  const enterSends = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches,
    [],
  );

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

  /*
    Removing the photo before posting. Revokes the blob URL and lets the
    attach control reset its file input, so choosing the identical picture
    again fires a change event — without that, removing and re-picking the
    same file does nothing at all.
  */
  const clearPhoto = () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
  };

  const clearDraft = () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setBody("");
    setPhoto(null);
  };

  const submit = async () => {
    const text = body.trim();
    /*
      A photograph is a thing to say. Requiring words alongside it would mean
      the one post nobody needs to caption — here is the lift — is the one the
      composer refuses to send.
    */
    if ((!text && !photo) || pending) return;
    /* Attached but still uploading. Posting now would refer to an asset that
       does not exist yet; the button says "Attaching…" and waits. */
    if (photoPending(photo)) return;
    try {
      await onSubmit(text, undefined, photo?.assetId ?? null);
      clearDraft();
    } catch {
      /* Kept on purpose. The toast says what went wrong; the draft is still
         here to try again with. */
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // With a hardware keyboard, Enter sends and Shift+Enter breaks the
          // line. Without one, Enter breaks the line and the button sends.
          // Escape backs out of a reply or an edit without losing the room
          // underneath.
          if (enterSends && e.key === "Enter" && !e.shiftKey) {
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
      {/*
        Inside the draft, under the words, above the buttons.

        It used to be rendered by the button in the action row, which put the
        member's photograph in the gap between the composer and the feed —
        floating, square-cropped, and giving no sign that Post would publish
        it. An attachment belongs visually to the thing that will publish it.
      */}
      {photo && (
        <div className="rounded-lg border border-border/60 bg-raise p-2">
          <PhotoDraft photo={photo} onRemove={clearPhoto} />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {photo.assetId ? "Photo attached" : "Attaching…"}
          </p>
        </div>
      )}
      {/* One action row.
          Record used to sit in its own block underneath, which read as a
          separate feature rather than the other way to say the same thing —
          and left a band of empty space between the two ways of doing one
          job. They are alternatives, so they sit side by side. */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={(!body.trim() && !photo) || pending || photoPending(photo)}
          className="bg-gold border-gold-border text-gold-foreground"
          data-testid="button-community-send"
        >
          {/*
            Named for what it will do. A draft that is only a photograph gives
            no clue that "Post" publishes the picture — which is exactly what
            was unclear on a phone: the image sat outside the box, and the
            button said the same word it says for a sentence.
          */}
          {photoPending(photo)
            ? "Attaching…"
            : photo && !body.trim()
              ? "Post photo"
              : submitLabel}
        </Button>

        {/* A memo sends on its own — it does not wait for the text box,
            because the whole point is not having to type. Any words already
            written go with it, which is why it is not disabled on empty. */}
        {allowVoice && (
          <VoiceRecorderControl
            disabled={pending}
            onSend={async (audio) => {
              try {
                await onSubmit(body.trim(), audio, photo?.assetId ?? null);
                clearDraft();
              } catch {
                /* Same as above — a failed memo keeps the draft. */
              }
            }}
          />
        )}

        {allowPhoto && (
          <PhotoAttach
            purpose="room"
            attached={photo}
            onAttached={setPhoto}
            onCleared={() => setPhoto(null)}
            disabled={pending}
            preview="none"
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
  const like = message.reactions.find((r) => r.emoji === LIKE);
  const count = like?.count ?? 0;
  const mine = !!like?.mine;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={() => onToggle(LIKE)}
        aria-pressed={mine}
        aria-label={mine ? "Remove your acknowledgement" : "Acknowledge this"}
        className={cn(
          "text-xs rounded-full px-2 py-0.5 border transition-colors tap-clean",
          mine
            ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/15"
            : "border-border/60 text-muted-foreground/70 hover:border-[hsl(var(--gold))]/50",
        )}
        data-testid="button-reaction-like"
      >
        {/* The count only once somebody has. A standing "0" invites nothing. */}
        {LIKE}{count > 0 ? ` ${count}` : ""}
      </button>

      {/*
        Any reaction from before this change still renders, read-only in
        spirit — tapping removes your own. Nothing is migrated away, and a
        member who reacted with a moon last week does not find it vanished.
      */}
      {message.reactions
        .filter((r) => r.emoji !== LIKE)
        .map((r) => (
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
  /*
    Held here rather than lifted to the tab: only the photograph that was
    tapped can be open, so the message that owns it owns the overlay, and
    nothing has to be threaded down through ThreadNode's recursion.
  */
  const [full, setFull] = useState(false);

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
          <>
            {/* whitespace-pre-wrap so paragraph breaks survive; break-words so
                a pasted URL can't push the column wider than the phone. */}
            {message.body && (
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                {message.body}
              </p>
            )}

            {/* The workout above the photograph: the card is what the post is
                about, the picture is how it looked. */}
            {message.workout && <SharedWorkoutCard workout={message.workout} />}

            {/*
              Whole, and openable.

              It was neither: `object-cover` in a fixed 4:3 box, with no
              onClick. A photograph taken on a phone is portrait, so the box
              showed a band across its middle and there was no way to see the
              rest of it. `contain` takes the shape from the picture, and a
              tap opens it against the full screen.
            */}
            {message.imageAssetId && (
              <MediaImage
                assetId={message.imageAssetId}
                variant="display"
                alt={`Photo shared by ${displayName(message.author)}`}
                aspect="4 / 3"
                fit="contain"
                className="max-w-sm"
                onClick={() => setFull(true)}
              />
            )}
          </>
        )}

        {!gone && !editing && (
          <div className="flex items-center gap-3 flex-wrap pt-0.5">
            <Reactions message={message} onToggle={onToggleReaction} />

            {onReply && (
              <button
                onClick={onReply}
                className="text-xs text-muted-foreground/60 hover:text-gold"
                data-testid="button-reply"
              >
                Reply
              </button>
            )}

            {onOpenThread && message.replyCount > 0 && (
              <button
                onClick={onOpenThread}
                className="text-xs text-gold hover:underline inline-flex items-center gap-1"
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

      {/*
        The photograph, full size, on tap.

        A plain overlay rather than a dialog, matching the progress photos:
        the only interaction is closing it. `contain` and the whole viewport,
        because the point of opening it is to see the parts the feed could
        not show.
      */}
      {full && message.imageAssetId && (
        <div
          className="fixed inset-0 z-[10002] grid place-items-center bg-background/95 p-4"
          onClick={() => setFull(false)}
          role="button"
          tabIndex={-1}
          aria-label="Close photo"
          data-testid="overlay-room-photo"
        >
          <div className="w-full max-w-2xl">
            <MediaImage
              assetId={message.imageAssetId}
              variant="display"
              alt={`Photo shared by ${displayName(message.author)}`}
              aspect="4 / 3"
              fit="contain"
              className="max-h-[88vh] bg-transparent"
            />
          </div>
        </div>
      )}
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
              allowPhoto
              onSubmit={async (body, audio, imageAssetId) => {
                try {
                  await post.mutateAsync({
                    channelId,
                    parentId: m.id,
                    body,
                    audioUrl: audio?.url ?? null,
                    audioMime: audio?.mime ?? null,
                    audioDurationSeconds: audio?.durationSeconds ?? null,
                    imageAssetId,
                  });
                } catch (e) {
                  toast({ title: humanError(e, "That reply didn't post."), variant: "destructive" });
                  throw e;
                }
                /* Only once it is actually posted. Closing the reply box on a
                   failure would take the draft off screen along with it. */
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
          allowPhoto
          /*
            `mutateAsync`, so a rejection reaches the composer and the draft
            survives. `mutate` swallows the failure into its own callback, and
            the composer — having no way to know — emptied itself regardless.
          */
          onSubmit={async (body, audio, imageAssetId) => {
            try {
              await post.mutateAsync({
                channelId: channel.id,
                body,
                audioUrl: audio?.url ?? null,
                audioMime: audio?.mime ?? null,
                audioDurationSeconds: audio?.durationSeconds ?? null,
                imageAssetId,
              });
            } catch (e) {
              toast({ title: humanError(e, "That didn't post."), variant: "destructive" });
              throw e;
            }
          }}
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

  /*
    A failed request and an empty answer are different sentences.

    These used to be one branch — `!channels.data` is true for both — so a
    single failed load told the member "No rooms are open to you yet", which
    is a statement about their access made out of a network error. With
    `retry: false` and `staleTime: Infinity` nothing asked again either, so it
    stayed on screen until the app was restarted. That is exactly what it
    looked like from the outside: no access, then access after a reload.

    The room list now retries a transient failure (see `useChannels`). This is
    what is left when the retries are also gone.
  */
  if (channels.isError) {
    return (
      <div className="py-20 text-center space-y-3" data-testid="rooms-unavailable">
        <Users className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {humanError(channels.error, "Sakred couldn't load your rooms just then.")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => channels.refetch()}
          data-testid="button-retry-rooms"
        >
          Try again
        </Button>
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
                    ? "bg-[hsl(var(--gold))]/15 text-gold font-medium"
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
