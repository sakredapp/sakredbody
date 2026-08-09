/**
 * The Library
 *
 * Shelf → reader. The reader keeps the chapter list on the left and the text
 * on the right, and when a guide is the reasoning behind a protocol, the last
 * chapter hands off to it. Reading and doing are one loop.
 *
 * Locked chapters keep their titles. Seeing the shape of a guide you don't yet
 * have is an invitation; hiding it entirely is just an empty page.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShelf, useEbook, useSaveProgress, type ShelfEntry } from "@/hooks/use-library";
import { useEnrollInRoutine } from "@/hooks/use-coaching";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Lock, BookOpen, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/portal/Panel";

function readingLabel(entry: ShelfEntry) {
  if (entry.progress?.completedAt) return "Finished";
  if (entry.progress) return "Reading";
  if (entry.readingMinutes) return `${entry.readingMinutes} min`;
  return null;
}

// ─── Shelf ─────────────────────────────────────────────────────────────────

function Shelf({ onOpen }: { onOpen: (id: string) => void }) {
  const shelf = useShelf();

  if (shelf.isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full" />
        ))}
      </div>
    );
  }

  if ((shelf.data?.length ?? 0) === 0) {
    return (
      <div className="py-20 text-center">
        <BookOpen className="h-6 w-6 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">Nothing published yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8">
      {shelf.data!.map((b) => {
        const label = readingLabel(b);
        return (
          <button
            key={b.id}
            onClick={() => onOpen(b.id)}
            className="text-left group"
            data-testid={`library-book-${b.id}`}
          >
            <div className="aspect-[2/3] w-full rounded-md overflow-hidden bg-muted/60 mb-3 relative">
              {b.coverUrl ? (
                <img
                  src={b.coverUrl}
                  alt={b.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-muted-foreground/40" />
                </div>
              )}
              {!b.owned && (
                <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-background/85 backdrop-blur flex items-center justify-center">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </div>
            <p className="text-sm leading-snug">{b.title}</p>
            {label && <p className="text-xs text-muted-foreground mt-1">{label}</p>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Reader ────────────────────────────────────────────────────────────────

function Reader({ ebookId, onBack }: { ebookId: string; onBack: () => void }) {
  const book = useEbook(ebookId);
  const saveProgress = useSaveProgress();
  const enroll = useEnrollInRoutine();

  const [sectionId, setSectionId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const readable = useMemo(
    () => book.data?.sections.filter((s) => !s.locked) ?? [],
    [book.data],
  );

  // Resume where they stopped, else open the first readable chapter.
  useEffect(() => {
    if (sectionId || !book.data) return;
    const saved = book.data.progress?.sectionId;
    const resume = saved && readable.some((s) => s.id === saved) ? saved : readable[0]?.id;
    if (resume) setSectionId(resume);
  }, [book.data, readable, sectionId]);

  // Scroll to the top on chapter change — otherwise the reader opens a new
  // chapter halfway down where the previous one was left.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [sectionId]);

  const current = book.data?.sections.find((s) => s.id === sectionId) ?? null;
  const index = current ? readable.findIndex((s) => s.id === current.id) : -1;
  const isLast = index >= 0 && index === readable.length - 1;

  const goTo = (id: string) => {
    setSectionId(id);
    saveProgress.mutate({ ebookId, sectionId: id });
  };

  const finish = () => {
    saveProgress.mutate({ ebookId, sectionId, completed: true });
  };

  if (book.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!book.data) {
    return <p className="text-sm text-muted-foreground">Couldn't open this guide.</p>;
  }

  const { title, subtitle, author, owned, sections, pairedRoutine } = book.data;

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        data-testid="button-library-back"
      >
        <ArrowLeft className="h-4 w-4" />
        Library
      </button>

      <div className="mb-8">
        <h2 className="font-display text-3xl leading-tight" data-testid="text-ebook-title">{title}</h2>
        {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        {author && <p className="text-xs text-muted-foreground mt-1">{author}</p>}
      </div>

      {!owned && (
        <div className="border-t border-b border-border/50 py-5 mb-8">
          <p className="text-sm text-muted-foreground">
            {readable.length > 0
              ? "You have the opening chapter. Your coach can open the rest."
              : "Your coach can open this for you."}
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-[200px_1fr] gap-10">
        <nav className="space-y-0.5 md:sticky md:top-24 md:self-start">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => !s.locked && goTo(s.id)}
              disabled={s.locked}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
                s.locked
                  ? "text-muted-foreground/50 cursor-default"
                  : sectionId === s.id
                    ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
              data-testid={`library-section-${s.id}`}
            >
              <span className="flex-1 truncate">{s.title}</span>
              {s.locked && <Lock className="h-3 w-3 shrink-0" />}
            </button>
          ))}
        </nav>

        <div ref={bodyRef}>
          <AnimatePresence mode="wait">
            <motion.div
              key={sectionId ?? "none"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {current ? (
                <>
                  <h3 className="font-display text-2xl mb-6">{current.title}</h3>

                  {current.audioUrl && (
                    <audio controls src={current.audioUrl} className="w-full mb-8" />
                  )}

                  {current.content ? (
                    // Admin-authored HTML. Never member input — see the model.
                    <div
                      className="prose-sakred text-[15px] leading-[1.85] space-y-5"
                      dangerouslySetInnerHTML={{ __html: current.content }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">This chapter is empty.</p>
                  )}

                  {isLast && (
                    <div className="border-t border-border/50 mt-14 pt-8 space-y-4">
                      <Button variant="outline" onClick={finish} data-testid="button-finish-ebook">
                        <Check className="h-4 w-4 mr-2" />
                        Finished
                      </Button>

                      {/* The handoff. This is why guides and protocols are paired. */}
                      {pairedRoutine && (
                        <div className="pt-4">
                          <p className="text-xs uppercase tracking-widest text-[hsl(var(--gold))] mb-3">
                            Now do it
                          </p>
                          <div className="flex items-center gap-4 flex-wrap">
                            <span className="text-sm">
                              {pairedRoutine.name}
                              <span className="text-muted-foreground">
                                {" "}· {pairedRoutine.durationDays} days
                              </span>
                            </span>
                            <Button
                              onClick={() =>
                                // The hook reports success and failure itself.
                                enroll.mutate({
                                  routineId: pairedRoutine.id,
                                  startDate: new Date().toISOString().split("T")[0],
                                  intensity: "lite",
                                })
                              }
                              disabled={enroll.isPending}
                              data-testid="button-start-paired-protocol"
                            >
                              Begin
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing here is open to you yet.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Tab ───────────────────────────────────────────────────────────────────

export function LibraryTab() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Only on the shelf. Inside a guide the heading is the guide's own
          title, and two display headings stacked would compete. */}
      {!open && (
        <SectionHeading
          title="The Library"
          subtitle="The reasoning behind the protocols, long enough to be worth reading."
        />
      )}
      {open ? (
        <Reader ebookId={open} onBack={() => setOpen(null)} />
      ) : (
        <Shelf onOpen={setOpen} />
      )}
    </div>
  );
}
