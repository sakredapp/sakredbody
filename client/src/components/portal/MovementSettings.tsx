/**
 * Changing what Build opens on.
 *
 * The question is asked once on the Build screen and then never again, which
 * is the right amount of asking and the wrong amount if there is nowhere to
 * change the answer. People take up Pilates. People stop playing basketball.
 * A preference you can set once and never unset is the same trap the health
 * and notification settings exist to undo.
 *
 * Sits in Settings rather than on Build for the same reason: the screen a
 * member opens every day should not be carrying a form.
 */

import { useState } from "react";
import { ModalityChooser, useModalities } from "@/components/build/Modalities";
import { BUILD_MODALITIES } from "@shared/models/training";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const LABEL = new Map(BUILD_MODALITIES.map((m) => [m.id as string, m.label]));

export function MovementSettings() {
  const { data, isLoading } = useModalities();
  const [editing, setEditing] = useState(false);

  if (isLoading) return <Skeleton className="h-12 w-full" />;

  const chosen = data?.modalities ?? [];

  if (editing) {
    return <ModalityChooser initial={chosen} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {chosen.length === 0
          ? "Build is showing you everything. Narrow it to what you actually do and it'll open on that instead — search always reaches the rest either way."
          : `Build opens on ${chosen.map((c) => LABEL.get(c) ?? c).join(", ")}. Everything else is still one search away.`}
      </p>
      <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="edit-modalities">
        {chosen.length === 0 ? "Choose what you do" : "Change"}
      </Button>
    </div>
  );
}
