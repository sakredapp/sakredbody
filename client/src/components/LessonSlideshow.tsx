import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Lesson {
  title: string;
  body: string;
}

interface LessonSlideshowProps {
  lessons: Lesson[];
  /** Auto-advance interval. Auto-advance is disabled under prefers-reduced-motion. */
  intervalMs?: number;
  className?: string;
}

const slideVariants = {
  enter: (direction: number) => ({ opacity: 0, y: direction > 0 ? 28 : -28 }),
  center: { opacity: 1, y: 0 },
  exit: (direction: number) => ({ opacity: 0, y: direction > 0 ? -28 : 28 }),
};

export function LessonSlideshow({ lessons, intervalMs = 7000, className }: LessonSlideshowProps) {
  const [[index, direction], setState] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);

  const total = lessons.length;

  const goTo = useCallback(
    (next: number, dir: number) => setState([((next % total) + total) % total, dir]),
    [total],
  );
  const next = useCallback(() => goTo(index + 1, 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1, -1), [goTo, index]);

  // Auto-advance, paused on hover/focus and for users who ask for less motion.
  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(next, intervalMs);
    return () => clearTimeout(timer);
  }, [index, paused, next, intervalMs]);

  const lesson = lessons[index];

  return (
    <div
      className={cn("relative", className)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Core lessons"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") next();
        if (e.key === "ArrowLeft") prev();
      }}
    >
      <div className="flex items-center gap-2 sm:gap-6">
        <button
          onClick={prev}
          aria-label="Previous lesson"
          className="shrink-0 h-10 w-10 rounded-full border border-gold/30 text-gold flex items-center justify-center hover-elevate transition-colors"
          data-testid="button-lesson-prev"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex-1 min-h-[300px] sm:min-h-[260px] flex items-center justify-center px-2">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={index}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="text-center max-w-xl mx-auto"
            >
              <h3 className="font-display text-3xl md:text-4xl mb-5" data-testid="text-lesson-title">
                {lesson.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed text-base md:text-lg">{lesson.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          onClick={next}
          aria-label="Next lesson"
          className="shrink-0 h-10 w-10 rounded-full border border-gold/30 text-gold flex items-center justify-center hover-elevate transition-colors"
          data-testid="button-lesson-next"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex justify-center items-center gap-2.5 mt-10">
        {lessons.map((l, i) => (
          <button
            key={l.title}
            onClick={() => goTo(i, i > index ? 1 : -1)}
            aria-label={`Go to lesson ${i + 1}: ${l.title}`}
            aria-current={i === index}
            className={cn(
              "h-1.5 rounded-full transition-all duration-500",
              i === index ? "w-10 bg-gold" : "w-1.5 bg-gold/25 hover:bg-gold/50",
            )}
            data-testid={`button-lesson-dot-${i}`}
          />
        ))}
      </div>

      {/* Announce slide changes without duplicating the visible text for sighted users. */}
      <p className="sr-only" aria-live="polite">
        Lesson {index + 1} of {total}: {lesson.title}
      </p>
    </div>
  );
}
