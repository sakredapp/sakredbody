/**
 * The intake, afterwards.
 *
 * Most people do not know their time of birth when first asked. They ask their
 * mother that evening, and then they need somewhere to put the answer — and if
 * onboarding is the only place it can be entered, the answer is lost and the
 * rising sign never exists.
 *
 * So this is the same form, reachable forever. It also covers the member who
 * skipped intake entirely: nothing about the app's personalisation is
 * permanently forfeited by tapping "later" once.
 *
 * Deliberately the same component as onboarding uses rather than a second form
 * that drifts from it — the Y question, the recommended-middle-name note and
 * the birth-certificate wording all have reasons behind them, and none of
 * those reasons stop applying here.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { nameNumbers } from "@shared/utils/almanac";
import { IntakeStep, type IntakeValues } from "./IntakeStep";

type Cosmology = {
  birthDate?: string | null;
  birthTime?: string | null;
  birthName?: string | null;
  yOverrides?: Record<string, boolean> | null;
  lifePathNumber?: number | null;
  expressionNumber?: number | null;
  soulUrgeNumber?: number | null;
  personalityNumber?: number | null;
};

export function AboutYouSettings() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const { data } = useQuery<Cosmology>({ queryKey: ["/api/energy/cosmology"] });

  const initial = useMemo(() => {
    const parts = (data?.birthName ?? "").trim().split(/\s+/).filter(Boolean);
    return {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
      birthDate: data?.birthDate ?? "",
      birthTime: data?.birthTime ?? "",
      yOverrides: data?.yOverrides ?? {},
    };
  }, [data, user]);

  const save = useMutation({
    mutationFn: async (v: IntakeValues) => {
      const birthName = [v.firstName, v.middleName, v.lastName]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
      await apiRequest("PATCH", "/api/profile", {
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim() || null,
      });
      const res = await apiRequest("PUT", "/api/energy/cosmology", {
        birthName,
        birthDate: v.birthDate || null,
        birthTime: v.birthTime || null,
        yOverrides: Object.keys(v.yOverrides).length ? v.yOverrides : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/energy/cosmology"] });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    },
  });

  // Shown from the same function the server saves with, so what a member reads
  // here is what the daily note is written from. Recomputing rather than
  // displaying the stored column is the point: if the two ever disagree, this
  // is where it becomes visible.
  const numbers = useMemo(
    () => nameNumbers(data?.birthName ?? null, data?.yOverrides ?? null),
    [data],
  );

  return (
    <div className="space-y-4">
      <IntakeStep
        initial={initial}
        saving={save.isPending}
        error={save.isError ? "That didn't save. Try again." : null}
        onSubmit={(v) => save.mutate(v)}
        onSkip={() => setSaved(false)}
      />

      {saved && (
        <p className="text-[11px] text-[hsl(var(--gold))] flex items-center gap-1">
          <Check className="h-3 w-3" /> Saved.
        </p>
      )}

      {/* What it produced. Not decoration — a member who supplied a name is
          owed the thing the name was for, and seeing the numbers move when a Y
          is reclassified is what makes that question feel worth answering. */}
      {(numbers.expression || data?.lifePathNumber) && (
        <div className="rounded-xl border border-border/40 p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Your numbers
          </p>
          <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
            {[
              ["Life path", data?.lifePathNumber],
              ["Expression", numbers.expression],
              ["Soul urge", numbers.soulUrge],
              ["Personality", numbers.personality],
            ].map(([label, value]) =>
              value == null ? null : (
                <div key={String(label)} className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-display text-base text-[hsl(var(--gold))]">{value}</span>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
