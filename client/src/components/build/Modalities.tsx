/**
 * "What kinds of movement are part of your life?"
 *
 * Asked once, and the only personalisation Build does before it knows anything
 * else about somebody. Six hundred and fifty-seven movements is the right
 * catalogue and the wrong first impression: a member who does Pilates, walks
 * and stretches should not open Build and find a bodybuilding app, and a
 * member who only lifts should not scroll past reformer work to reach a squat
 * rack.
 *
 * What it does NOT do is hide anything. The answer changes what the picker
 * shows *by default*; search still spans the whole catalogue and every group
 * chip is still there. The failure mode of a preference like this is somebody
 * unable to find a movement they know exists, which is worse than a long list —
 * so it narrows the browse and never the search.
 *
 * Multi-select with no minimum, dismissible, and changeable afterwards. It is
 * a preference, not a gate: nothing in Build waits on an answer.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { BUILD_MODALITIES } from "@shared/models/training";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/portal/Panel";
import { cn } from "@/lib/utils";

/** null means never asked; [] means asked and answered with nothing. */
export function useModalities() {
  return useQuery<{ modalities: string[] | null }>({
    queryKey: ["/api/training/modalities"],
    staleTime: 30 * 60 * 1000,
  });
}

export function ModalityChooser({
  initial,
  onDone,
  onDismiss,
}: {
  initial: string[];
  onDone?: () => void;
  onDismiss?: () => void;
}) {
  const qc = useQueryClient();
  const [chosen, setChosen] = useState<string[]>(initial);

  const save = useMutation({
    mutationFn: async (modalities: string[]) =>
      apiRequest("PUT", "/api/training/modalities", { modalities }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training/modalities"] });
      onDone?.();
    },
  });

  const toggle = (id: string) =>
    setChosen((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  return (
    <Panel>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-lg leading-tight">
              What kinds of movement are part of your life?
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Just so Build opens on what you actually do. Everything else stays one
              search away, and you can change this whenever.
            </p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
              aria-label="Not now"
              data-testid="modalities-dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {BUILD_MODALITIES.map((m) => {
            const on = chosen.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                title={m.hint || undefined}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs tap-clean transition-colors inline-flex items-center gap-1.5",
                  on
                    ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/15 text-gold"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
                data-testid={`modality-${m.id}`}
              >
                {on && <Check className="h-3 w-3" />}
                {m.label}
              </button>
            );
          })}
        </div>

        <Button
          className="w-full"
          onClick={() => save.mutate(chosen)}
          disabled={save.isPending}
          data-testid="modalities-save"
        >
          {save.isPending
            ? "Saving…"
            : chosen.length === 0
              ? "Show me everything"
              : `Save — ${chosen.length} selected`}
        </Button>
      </div>
    </Panel>
  );
}

/**
 * The panel as it appears on the Build screen: the question until it has been
 * answered, then nothing. Editing it afterwards lives in Settings rather than
 * here, so the screen a member sees every day is not carrying a form.
 */
export function ModalityPrompt() {
  const { data, isLoading } = useModalities();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed) return null;
  // Answered — including answered with nothing, which is a real answer.
  if (data?.modalities !== null && data?.modalities !== undefined) return null;

  return <ModalityChooser initial={[]} onDismiss={() => setDismissed(true)} />;
}
