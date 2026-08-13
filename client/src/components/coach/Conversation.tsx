/**
 * A coaching conversation — the same one, from either side.
 *
 * One component because there is one conversation. Two implementations would
 * mean the member and their coach could be looking at different renderings of
 * the same thread, disagreeing about what was said and when, and the person
 * best placed to notice would be the one least able to prove it.
 *
 * ── Attachments are fetched, not linked ──────────────────────────────────
 *
 * `src` and `href` point at `/api/coaching/attachments/:id`, which authorizes
 * the caller and then redirects to a URL that lives a few minutes. There is no
 * permanent URL anywhere in this file, and the server never sends one — the id
 * is the whole handle, and it is worthless without a session.
 *
 * ── Optimistic, but never dishonest ──────────────────────────────────────
 *
 * A pending message is visibly pending and a failed one is visibly failed, with
 * the text still there to retry. The version of this that "feels fast" — draw
 * it as sent, clear the box, sort it out later — tells somebody their message
 * reached their coach when it reached nothing, and they find out when they
 * reload, which may be days.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Send, X, FileText, AlertCircle, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type Attachment = {
  id: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  uploadedByUserId: string;
};

export type ThreadMessage = {
  id: string;
  senderRole: string;
  senderUserId: string | null;
  senderName: string | null;
  messageType: string;
  content: string;
  createdAt: string;
  readAt: string | null;
  attachments: Attachment[];
};

/** Everything that differs between the two sides, named once. */
export type ConversationSide = {
  /** GET the thread. */
  threadUrl: string;
  /** POST a message. */
  sendUrl: string;
  /** POST to mark the other side's messages read. */
  readUrl: string;
  /** POST a file. Carries the member id when a coach is sending. */
  uploadUrl: string;
  /** Whose messages sit on the right. */
  mine: "member" | "coach";
  /** The person on the other end, for the composer and the empty state. */
  otherName: string;
  /** Shown above the thread when it is empty. */
  emptyTitle: string;
  emptyBody: string;
};

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "PDF", "DOCX" — the kind, said plainly rather than a mime type. */
function fileKind(mimeType: string, filename: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("wordprocessingml") || mimeType === "application/msword") return "Word";
  if (mimeType === "text/plain") return "Text";
  const ext = filename.split(".").pop();
  return ext ? ext.toUpperCase() : "File";
}

function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Today";
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

// ─── Attachments ───────────────────────────────────────────────────────────

function ImageAttachment({ a, onOpen }: { a: Attachment; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <FileAttachment a={a} />;
  return (
    <button
      onClick={onOpen}
      className="block mt-2 rounded-lg overflow-hidden border border-border/30 tap-clean"
      data-testid={`attachment-image-${a.id}`}
    >
      <img
        src={`/api/coaching/attachments/${a.id}`}
        alt={a.filename}
        className="max-h-64 w-auto object-cover"
        onError={() => setBroken(true)}
      />
    </button>
  );
}

/**
 * A file card — not a photograph.
 *
 * The old model called everything a photo: `message_type = 'photo'`, stored in
 * a column called `image_url`. A member's blood panel was filed as a
 * photograph and rendered as a broken `<img>`.
 */
function FileAttachment({ a }: { a: Attachment }) {
  return (
    <a
      href={`/api/coaching/attachments/${a.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 mt-2 rounded-lg border border-border/30 px-3 py-2.5 hover:border-border/60 transition-colors tap-clean"
      data-testid={`attachment-file-${a.id}`}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm truncate">{a.filename}</span>
        <span className="block text-[11px] text-muted-foreground">
          {fileKind(a.mimeType, a.filename)} · {fileSize(a.sizeBytes)}
        </span>
      </span>
    </a>
  );
}

/** Tap an image, see the image. Close, and nothing else. */
function Lightbox({ a, onClose }: { a: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll while this is up.
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prior;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="attachment-lightbox"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors p-2"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={`/api/coaching/attachments/${a.id}`}
        alt={a.filename}
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ─── The composer ──────────────────────────────────────────────────────────

type Staged =
  | { state: "uploading"; file: File; preview?: string }
  | { state: "ready"; file: File; preview?: string; attachment: Attachment }
  | { state: "failed"; file: File; preview?: string; message: string };

function Composer({
  side,
  onSent,
}: {
  side: ConversationSide;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<Staged | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      if (staged?.preview) URL.revokeObjectURL(staged.preview);
    };
  }, [staged]);

  const send = useMutation({
    mutationFn: async () => {
      const attachmentIds = staged?.state === "ready" ? [staged.attachment.id] : [];
      const res = await apiRequest("POST", side.sendUrl, {
        content: text.trim(),
        attachmentIds,
      });
      return res.json();
    },
    onSuccess: () => {
      setText("");
      setStaged(null);
      setSendError(null);
      onSent();
    },
    /**
     * The failure is shown, and the text is kept.
     *
     * Clearing the box on a failed send loses what somebody wrote, which is the
     * one thing they cannot get back.
     */
    onError: (e: Error) => setSendError(e.message || "That didn't send."),
  });

  async function upload(file: File) {
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
    setStaged({ state: "uploading", file, preview });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(side.uploadUrl, { method: "POST", body, credentials: "include" });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        setStaged({ state: "failed", file, preview, message: msg.message ?? "That didn't upload." });
        return;
      }
      setStaged({ state: "ready", file, preview, attachment: await res.json() });
    } catch {
      setStaged({ state: "failed", file, preview, message: "That didn't upload." });
    }
  }

  /** Discard a staged file — and delete the object, not just the preview. */
  async function discard() {
    if (staged?.state === "ready") {
      await apiRequest("DELETE", `/api/coaching/attachments/${staged.attachment.id}`).catch(
        () => undefined,
      );
    }
    if (staged?.preview) URL.revokeObjectURL(staged.preview);
    setStaged(null);
  }

  const busy = send.isPending || staged?.state === "uploading";
  const canSend = (text.trim().length > 0 || staged?.state === "ready") && !busy;

  return (
    <div className="border-t border-border/30 pt-3 space-y-2">
      {staged && (
        <div className="flex items-center gap-3 rounded-lg border border-border/30 px-3 py-2">
          {staged.preview ? (
            <img src={staged.preview} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{staged.file.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {staged.state === "uploading" && "Uploading…"}
              {staged.state === "ready" &&
                `${fileKind(staged.file.type, staged.file.name)} · ${fileSize(staged.file.size)}`}
              {staged.state === "failed" && (
                <span className="text-destructive">{staged.message}</span>
              )}
            </p>
          </div>
          {staged.state === "failed" && (
            <button
              onClick={() => upload(staged.file)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label="Try again"
              data-testid="attachment-retry"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={discard}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Remove"
            data-testid="attachment-remove"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {sendError && (
        <p className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {sendError}
        </p>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={Boolean(staged) || busy}
          className="shrink-0 p-2 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors tap-clean"
          aria-label="Attach a file"
          data-testid="attachment-pick"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <textarea
          ref={box}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Grows with the message rather than scrolling a one-line box.
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter is a new line — and on a touch keyboard
            // neither, because there is no shift and people write paragraphs.
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              if (canSend) send.mutate();
            }
          }}
          rows={1}
          placeholder={`Message ${side.otherName}…`}
          className="flex-1 resize-none bg-transparent border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border max-h-40"
          data-testid="composer-input"
        />

        <Button
          size="sm"
          disabled={!canSend}
          onClick={() => send.mutate()}
          className="shrink-0"
          data-testid="composer-send"
        >
          {send.isPending ? "Sending…" : <Send className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

// ─── The thread ────────────────────────────────────────────────────────────

export function Conversation({ side }: { side: ConversationSide }) {
  const qc = useQueryClient();
  const scroll = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  const thread = useQuery<ThreadMessage[]>({
    queryKey: [side.threadUrl],
    queryFn: async () => {
      const res = await fetch(side.threadUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load this conversation.");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const messages = useMemo(() => thread.data ?? [], [thread.data]);

  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages]);

  /**
   * Mark the other side's messages read on open.
   *
   * Fire-and-forget: a failed read receipt is not worth telling anybody about,
   * and the count corrects itself next time.
   */
  const unread = messages.some((m) => m.senderRole !== side.mine && !m.readAt);
  useEffect(() => {
    if (!unread) return;
    apiRequest("POST", side.readUrl)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/coach/clients"] }))
      .catch(() => undefined);
  }, [unread, side.readUrl, qc]);

  const days = useMemo(() => {
    const out: { heading: string; items: ThreadMessage[] }[] = [];
    for (const m of messages) {
      const heading = dayHeading(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.heading === heading) last.items.push(m);
      else out.push({ heading, items: [m] });
    }
    return out;
  }, [messages]);

  if (thread.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {messages.length === 0 ? (
        /*
          Compact, and it says what to do.

          This was a full-height empty panel reading "Start the Conversation —
          they'll respond here", which is a large piece of nothing dressed as a
          feature. The composer is right underneath; the room does not need to
          be empty and enormous as well.
        */
        <div className="py-6">
          <p className="text-sm">{side.emptyTitle}</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">{side.emptyBody}</p>
        </div>
      ) : (
        <div
          ref={scroll}
          className="flex-1 overflow-y-auto max-h-[55vh] space-y-4 pr-1 scrollbar-thin"
        >
          {days.map((day) => (
            <div key={day.heading}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 text-center my-3">
                {day.heading}
              </p>
              <div className="space-y-3">
                {day.items.map((m) => {
                  const isMine = m.senderRole === side.mine;
                  return (
                    <div
                      key={m.id}
                      className={cn("flex", isMine ? "justify-end" : "justify-start")}
                      data-testid={`message-${m.id}`}
                    >
                      <div className="max-w-[80%]">
                        {/*
                          The human, where we know which one.

                          The single message that predates `sender_user_id` has
                          no author to recover, so it says nothing rather than
                          naming somebody who may not have written it.
                        */}
                        {!isMine && m.senderName && (
                          <p className="text-[10px] text-muted-foreground/70 mb-0.5">
                            {m.senderName}
                          </p>
                        )}
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-2.5",
                            isMine ? "bg-[hsl(var(--gold))]/12" : "bg-card/60 border border-border/30",
                          )}
                        >
                          {m.content && <p className="text-sm whitespace-pre-wrap">{m.content}</p>}
                          {m.attachments.map((a) =>
                            isImage(a.mimeType) ? (
                              <ImageAttachment key={a.id} a={a} onOpen={() => setLightbox(a)} />
                            ) : (
                              <FileAttachment key={a.id} a={a} />
                            ),
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5 px-1">
                          {new Date(m.createdAt).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Composer
        side={side}
        onSent={() => qc.invalidateQueries({ queryKey: [side.threadUrl] })}
      />

      {lightbox && <Lightbox a={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
