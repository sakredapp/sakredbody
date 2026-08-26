/**
 * The last thing the walkthrough asks, and the only one that changes the world.
 *
 * ── Why this is a step and not a line pointing at Settings ────────────────
 *
 * Because "Sakred comes in two atmospheres" is not a sentence anybody
 * understands from reading it. It is a thing you understand when the entire
 * application turns to daylight underneath the panel you are still standing in.
 * Pointing at the setting teaches where a control lives; tapping it teaches
 * what the product is.
 *
 * It is also the right note to end on. Everything before this asked the member
 * to go and look at something; this asks them to decide something, and the app
 * answers immediately.
 *
 * ── Why there is no System option here ────────────────────────────────────
 *
 * System is a third answer to a question the member has not been asked yet —
 * "should this follow your phone" — and offering it at this moment turns a
 * choice between two worlds into a settings screen. It stays in Settings, where
 * somebody who wants it will look for it.
 *
 * ── Why nothing is preselected unless they already chose ──────────────────
 *
 * Every existing member reaches this too, and some of them have already picked
 * an appearance. Showing that one selected, and letting them confirm or change
 * it, is different from silently overwriting it with whichever card they happen
 * to tap first. A member who has never chosen sees neither selected, because
 * the default is what nobody chose.
 */

import { Moon, SunMedium } from "lucide-react";
import type { Appearance } from "@/lib/appearance";
import { hasStoredAppearance } from "@/lib/appearance";
import { useAppearance } from "@/hooks/use-appearance";
import { cn } from "@/lib/utils";

type Option = {
  value: Extract<Appearance, "dark" | "light">;
  name: string;
  line: string;
  Icon: typeof Moon;
};

const OPTIONS: Option[] = [
  { value: "dark", name: "Dark", line: "Night · Ink · Constellation", Icon: Moon },
  { value: "light", name: "Light", line: "Day · Oak · Celestial", Icon: SunMedium },
];

export function AtmosphereChoice() {
  const { preference, choose } = useAppearance();
  // Distinct from "the preference is dark": the default is dark, and treating
  // the default as a choice would preselect a card for somebody who has never
  // opened the setting.
  const chosen = hasStoredAppearance() ? preference : null;

  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Atmosphere">
      {OPTIONS.map(({ value, name, line, Icon }) => {
        const selected = chosen === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(value)}
            className={cn(
              /*
                A column, because a button centres its content by default and
                these two do not have the same amount of it: at 430px "Night ·
                Ink · Constellation" wraps and "Day · Oak · Celestial" does
                not, so the shorter card's artwork was pushed 7.5px down the
                frame and the two skies no longer lined up.
              */
              "flex flex-col rounded-xl border overflow-hidden text-left tap-clean transition-colors",
              selected
                ? "border-[hsl(var(--gold))]/70"
                : "border-border/50 hover:border-[hsl(var(--gold))]/40",
            )}
            data-tour-id="atmosphere-choice"
            data-tour-instance={value}
            data-testid={`button-atmosphere-${value}`}
          >
            <Preview value={value} />
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-[hsl(var(--gold-text))]" aria-hidden="true" />
                <span className="text-sm" data-testid={`atmosphere-${value}-name`}>
                  {name}
                </span>
              </div>
              {/*
                Two lines of room, kept whether or not this descriptor needs
                them. Expressed in the descriptor's own type rather than in
                pixels, so it stays two lines if the size ever changes.
              */}
              <div
                className={cn(
                  "text-[10px] uppercase tracking-[0.12em] text-muted-foreground mt-0.5",
                  "leading-[1.5] min-h-[3em]",
                )}
                data-testid={`atmosphere-${value}-line`}
              >
                {line}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A small standing figure under its own sky.
 *
 * Drawn from literal values rather than theme tokens — deliberately, and it is
 * the one place in the portal where that is right. Both previews have to show
 * both atmospheres *at the same time*, side by side, which is precisely what a
 * themed token cannot do: a token resolves to whichever theme is currently
 * active, so the two cards would look identical and the choice would be
 * invisible.
 *
 * Same constellation in both, which is the point. Dark is luminous on ink;
 * Light is the same geometry etched in bronze on parchment. Not an inversion,
 * and not a sun replacing the stars.
 */
function Preview({ value }: { value: "dark" | "light" }) {
  const dark = value === "dark";
  const ground = dark ? "#1C1A17" : "#F0ECE5";
  const ink = dark ? "#EBD3A2" : "#8A6A34";
  const halo = dark ? "#EBD3A2" : "#C59F59";

  // A figure, not a diagram: crown, shoulders, heart, hips, feet.
  const stars: [number, number][] = [
    [50, 14], [36, 30], [64, 30], [50, 38], [50, 54], [38, 70], [62, 70],
  ];
  const lines: [number, number][] = [
    [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5], [4, 6],
  ];

  return (
    <svg viewBox="0 0 100 88" className="w-full block" style={{ background: ground }} aria-hidden="true">
      {dark ? (
        <circle cx="78" cy="18" r="7" fill={halo} opacity="0.22" />
      ) : (
        /*
          Daylight gets a restrained solar arc rather than a disc — the same
          register as the etched linework, not a weather icon.

          Struck across the same span the moon occupies (71 to 85, centred on
          78), so the two marks sit in the same place in their skies. It used
          to run to x=90 and read as drifting toward the corner next to a moon
          that was comfortably inset.
        */
        <path d="M71 21 A11 11 0 0 1 85 21" fill="none" stroke={halo} strokeWidth="1" opacity="0.5" />
      )}
      {lines.map(([a, b], i) => (
        <line
          key={i}
          x1={stars[a][0]} y1={stars[a][1]}
          x2={stars[b][0]} y2={stars[b][1]}
          stroke={ink}
          strokeWidth={dark ? 0.7 : 0.9}
          opacity={dark ? 0.55 : 0.75}
        />
      ))}
      {stars.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={dark ? 1.6 : 1.3} fill={ink} opacity={dark ? 0.95 : 0.85} />
      ))}
    </svg>
  );
}
