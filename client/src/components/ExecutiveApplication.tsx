import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EXEC_QUESTIONS, type ExecQuestion } from "@shared/models/executiveQuestions";

type Answer = string | string[] | number;
type Answers = Record<string, Answer>;

const variants = {
  enter: (d: number) => ({ opacity: 0, x: d > 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d > 0 ? -40 : 40 }),
};

function isAnswered(q: ExecQuestion, a: Answer | undefined): boolean {
  if (!q.required) return true;
  if (a === undefined || a === null) return false;
  if (Array.isArray(a)) return a.length > 0;
  return String(a).trim().length > 0;
}

export function ExecutiveApplication() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ route: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = EXEC_QUESTIONS.length;
  const q = EXEC_QUESTIONS[step];
  const current = answers[q?.id];
  const canAdvance = q ? isAnswered(q, current) : false;

  const progress = useMemo(() => Math.round((step / total) * 100), [step, total]);

  const set = (id: string, value: Answer) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setError(null);
  };

  const go = (delta: number) => {
    setDirection(delta);
    setStep((s) => Math.min(total - 1, Math.max(0, s + delta)));
  };

  const next = () => {
    if (!canAdvance) {
      setError("This one's required.");
      return;
    }
    if (step === total - 1) void submit();
    else go(1);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/executive-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Something went wrong. Please try again.");
        // Jump back to the offending question when the server names one.
        const idx = EXEC_QUESTIONS.findIndex((x) => x.id === data.field);
        if (idx >= 0) { setDirection(-1); setStep(idx); }
        return;
      }
      setDone({ route: data.route });
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    const copy: Record<string, { title: string; body: string }> = {
      book: {
        title: "Let's talk.",
        body: "Your application reads like a strong fit. We'll be in touch within two business days to schedule a call — check your email for the next step.",
      },
      teams: {
        title: "Received — including the team piece.",
        body: "You flagged interest in bringing this to your team, so we'll come back to you on both the private program and what a team engagement could look like. Expect to hear from us within two business days.",
      },
      retreat: {
        title: "Received.",
        body: "Based on what you told us, an in-person retreat may be the better starting point than private coaching. We'll follow up with dates and formats within two business days.",
      },
      nurture: {
        title: "Thank you — this is genuinely useful.",
        body: "Private coaching may not be the right starting point right now, and we'd rather say that than sell you into it. Start with the app and the protocols; the door stays open, and you're welcome to reapply whenever the timing changes.",
      },
      declined: {
        title: "Thank you for your honesty.",
        body: "This programme only works when someone wants to do the work, and there's no judgment in it not being the right time. The app and the food chart are free and always will be.",
      },
    };
    const c = copy[done.route] ?? copy.nurture;
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl mx-auto text-center py-16"
        data-testid="application-complete"
      >
        <div className="h-14 w-14 rounded-full border border-gold/40 flex items-center justify-center mx-auto mb-7">
          <Check className="h-6 w-6 text-gold" />
        </div>
        <h3 className="font-display text-3xl mb-5">{c.title}</h3>
        <p className="text-muted-foreground leading-relaxed">{c.body}</p>
      </motion.div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto" data-testid="executive-application">
      {/* Progress */}
      <div className="mb-10">
        <div className="h-0.5 bg-border rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gold"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex justify-between mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{q.section}</span>
          <span>
            {step + 1} / {total}
          </span>
        </div>
      </div>

      <div className="min-h-[340px]">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={q.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="text-center"
          >
            <h3 className="font-display text-2xl md:text-3xl leading-snug mb-3" data-testid="question-label">
              {q.label}
            </h3>
            {q.help && <p className="text-sm text-muted-foreground mb-8 max-w-lg mx-auto">{q.help}</p>}
            {!q.help && <div className="mb-8" />}

            {/* ── Free text ── */}
            {(q.type === "text" || q.type === "email" || q.type === "tel") && (
              <Input
                type={q.type === "text" ? "text" : q.type}
                value={(current as string) ?? ""}
                onChange={(e) => set(q.id, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && next()}
                placeholder={q.placeholder}
                autoFocus
                className="h-12 text-center max-w-md mx-auto"
                data-testid={`input-${q.id}`}
              />
            )}

            {q.type === "long" && (
              <Textarea
                value={(current as string) ?? ""}
                onChange={(e) => set(q.id, e.target.value)}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && next()}
                placeholder={q.placeholder}
                rows={5}
                autoFocus
                className="max-w-lg mx-auto"
                data-testid={`input-${q.id}`}
              />
            )}

            {/* ── Single select: choosing advances ── */}
            {q.type === "single" && (
              <div className="flex flex-col gap-2.5 max-w-lg mx-auto">
                {q.options?.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      set(q.id, opt);
                      if (step < total - 1) setTimeout(() => go(1), 180);
                    }}
                    className={cn(
                      "px-5 py-3.5 rounded-md border text-sm transition-colors hover-elevate",
                      current === opt ? "border-gold bg-gold/10 text-foreground" : "border-border text-muted-foreground",
                    )}
                    data-testid={`option-${q.id}-${opt.slice(0, 12).replace(/\W+/g, "-").toLowerCase()}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* ── Multi select ── */}
            {q.type === "multi" && (
              <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                {q.options?.map((opt) => {
                  const sel = Array.isArray(current) && current.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        const prev = Array.isArray(current) ? current : [];
                        set(q.id, sel ? prev.filter((x) => x !== opt) : [...prev, opt]);
                      }}
                      className={cn(
                        "px-4 py-2 rounded-full border text-sm transition-colors hover-elevate",
                        sel ? "border-gold bg-gold/10 text-foreground" : "border-border text-muted-foreground",
                      )}
                      data-testid={`option-${q.id}-${opt.slice(0, 12).replace(/\W+/g, "-").toLowerCase()}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Scale ── */}
            {q.type === "scale" && (
              <div className="flex justify-center gap-1.5 flex-wrap max-w-lg mx-auto">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      set(q.id, n);
                      if (step < total - 1) setTimeout(() => go(1), 180);
                    }}
                    className={cn(
                      "h-11 w-11 rounded-md border text-sm transition-colors hover-elevate",
                      current === n ? "border-gold bg-gold/10 text-foreground" : "border-border text-muted-foreground",
                    )}
                    data-testid={`scale-${q.id}-${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {error && (
        <p className="text-center text-sm text-destructive mt-6" role="alert" data-testid="application-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-center gap-3 mt-10">
        <Button
          variant="outline"
          onClick={() => go(-1)}
          disabled={step === 0 || submitting}
          data-testid="button-back"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button
          onClick={next}
          disabled={submitting}
          className="gold-metallic-btn px-8"
          data-testid="button-next"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending
            </>
          ) : step === total - 1 ? (
            <>Submit application</>
          ) : (
            <>
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      {!q.required && (
        <p className="text-center text-xs text-muted-foreground mt-4">Optional — you can skip this one.</p>
      )}
    </div>
  );
}
