/**
 * Finding a movement, instantly.
 *
 * ── Why the whole catalogue is fetched at once ────────────────────────────
 *
 * The obvious build is a search box that calls the server on every keystroke.
 * It is also the one that feels broken: each letter is a round trip, results
 * arrive out of order, and on a phone on mobile data the list visibly lags the
 * text. Debouncing hides it by making the app slower on purpose.
 *
 * So none of that. The catalogue is ~470 rows of short strings — under 100KB
 * of JSON, perhaps 15KB over the wire compressed — fetched once, cached by
 * react-query for the session, and searched with an array filter. Typing is
 * synchronous and cannot lag, it works with no signal, and the server is asked
 * nothing at all after the first load.
 *
 * The index is built once per catalogue rather than per keystroke: lower-cased
 * name and aliases joined into one haystack, so a search is a substring test
 * over a prepared string instead of an allocation for every row on every
 * letter.
 *
 * ── Ranking ───────────────────────────────────────────────────────────────
 *
 * Substring matching alone puts "Single-Arm Landmine Press" above "Landmine
 * Press" for the query "landmine", which is wrong every time. Matches are
 * ordered: name starts with the query, then a word in the name starts with it,
 * then anywhere in the name, then alias only. That is the whole ranking, and
 * it is enough — the failure people notice is the exact thing they typed not
 * being first.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, X, Check } from "lucide-react";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_GROUPS,
  isPracticeCategory,
  categoriesForModalities,
} from "@shared/schema";
import { useModalities } from "./Modalities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isTourActive } from "@/lib/tour/active";

export type Movement = {
  id: string;
  name: string;
  category: string;
  equipment: string;
  trackingType: "reps" | "duration" | "distance";
  takesLoad: boolean;
  unilateral: boolean;
  aliases: string[] | null;
  ownerUserId: string | null;
};

type Indexed = Movement & { _name: string; _hay: string };

const CATEGORY_LABEL = new Map(EXERCISE_CATEGORIES.map((c) => [c.id as string, c.label]));
const GROUP_OF = new Map(EXERCISE_CATEGORIES.map((c) => [c.id as string, c.group as string]));

/** How well a row answers the query. Lower is better; -1 means no match. */
function rank(row: Indexed, q: string): number {
  if (!q) return 0;
  const i = row._name.indexOf(q);
  if (i === 0) return 0;
  if (i > 0) return row._name[i - 1] === " " || row._name[i - 1] === "-" ? 1 : 2;
  return row._hay.includes(q) ? 3 : -1;
}

export function useCatalogue() {
  return useQuery<Movement[]>({
    queryKey: ["/api/training/exercises"],
    // The catalogue changes when somebody edits a seed file and deploys, which
    // is not something to re-check every thirty seconds on a phone.
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function MovementPicker({
  onPick,
  onClose,
  onCreate,
  picked,
  only,
  placeholder,
  ignoreModalities,
}: {
  onPick: (m: Movement) => void;
  onClose?: () => void;
  onCreate?: (name: string) => void;
  /** Ids already in the workout, ticked rather than hidden. */
  picked?: Set<string>;
  /**
   * Which half of the catalogue this picker is for.
   *
   * A member adding movements to a workout has no use for `Basketball`, and a
   * member logging what they did this evening has no use for `Barbell Row` —
   * offering both is how a picker ends up feeling like a database.
   */
  only?: "practices" | "movements";
  placeholder?: string;
  /**
   * Ignore the viewer's own modality preferences.
   *
   * True wherever the picker is used on somebody else's behalf — a coach
   * prescribing for a member should see the whole catalogue, because what the
   * coach happens to do on a Tuesday has nothing to do with it.
   */
  ignoreModalities?: boolean;
}) {
  const { data, isLoading } = useCatalogue();
  const { data: prefs } = useModalities();
  const modalities = prefs?.modalities ?? null;
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  // Built once per catalogue, not per keystroke.
  const indexed: Indexed[] = useMemo(
    () =>
      (data ?? [])
        .filter((m) => (only ? isPracticeCategory(m.category) === (only === "practices") : true))
        .map((m) => ({
          ...m,
          _name: m.name.toLowerCase(),
          _hay: `${m.name} ${(m.aliases ?? []).join(" ")} ${
            CATEGORY_LABEL.get(m.category) ?? ""
          } ${m.equipment}`.toLowerCase(),
        })),
    [data, only],
  );

  /**
   * With the catalogue cut in half, one side may have a single group left —
   * and a filter bar holding one chip is a chip that does nothing. When that
   * happens the group is simply assumed and its categories take the top row.
   */
  const groups = useMemo(
    () =>
      EXERCISE_GROUPS.filter((g) =>
        only ? (g.id === "practice") === (only === "practices") : true,
      ),
    [only],
  );
  const activeGroup = groups.length === 1 ? groups[0].id : group;

  const query = q.trim().toLowerCase();

  /**
   * ── What they said they do ────────────────────────────────────────────
   *
   * Applied to the browse and never to the search. Somebody who did not tick
   * "Pilates" and then types "reformer" wants the reformer, not an empty list
   * and a lesson about their preferences — a filter that hides what you asked
   * for by name is the one thing this must never do.
   *
   * It also steps aside the moment a group or category chip is tapped, because
   * tapping "Studio" is itself a statement that you want to see the studio.
   */
  const preferred = useMemo(() => {
    if (ignoreModalities) return null;
    const chosen = modalities ?? [];
    return chosen.length ? categoriesForModalities(chosen) : null;
  }, [modalities, ignoreModalities]);

  const narrowed = !query && !activeGroup && !category && preferred !== null;

  const results = useMemo(() => {
    const scored: { row: Indexed; r: number }[] = [];
    for (const row of indexed) {
      if (category && row.category !== category) continue;
      if (!category && activeGroup && GROUP_OF.get(row.category) !== activeGroup) continue;
      if (narrowed && !preferred!.has(row.category) && !row.ownerUserId) continue;
      const r = rank(row, query);
      if (r < 0) continue;
      scored.push({ row, r });
    }
    scored.sort((a, b) => a.r - b.r || a.row.name.length - b.row.name.length);
    // Nobody scrolls past this many; the rest are reachable by typing more.
    return scored.slice(0, 80).map((s) => s.row);
  }, [indexed, query, activeGroup, category, narrowed, preferred]);

  /** Categories worth showing: only those with something in them right now. */
  const categoriesInGroup = useMemo(() => {
    if (!activeGroup) return [];
    const present = new Set(
      indexed.filter((m) => GROUP_OF.get(m.category) === activeGroup).map((m) => m.category),
    );
    return EXERCISE_CATEGORIES.filter((c) => c.group === activeGroup && present.has(c.id));
  }, [activeGroup, indexed]);

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* ── Search ── */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          /*
            Not while a lesson is on screen.

            Autofocus is right when a member opens this to find a movement —
            they came here to type. It is wrong when the walkthrough opens it
            to teach the picker: the keyboard takes half the phone, the
            categories and the movement list go behind it, and the lesson asks
            somebody to choose from a list they cannot see.

            Tapping Search still opens the keyboard normally. The tour is
            declining to summon it, not disabling it.
          */
          autoFocus={!isTourActive()}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? "Search movements…"}
          className="pl-9 pr-9"
          data-testid="movement-search"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Groups, then categories within one ──
          Five chips, not thirty-four. The second row appears only once a group
          is chosen, so the default state is calm. */}
      <div className="shrink-0 space-y-2">
        {groups.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scroll-touch pb-0.5 -mx-1 px-1">
          {groups.map((g) => {
            const on = group === g.id;
            return (
              <button
                key={g.id}
                onClick={() => {
                  setGroup(on ? null : g.id);
                  setCategory(null);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs tap-clean transition-colors",
                  on
                    ? "border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
                data-testid={`movement-group-${g.id}`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        )}

        {categoriesInGroup.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto scroll-touch pb-0.5 -mx-1 px-1">
            {categoriesInGroup.map((c) => {
              const on = category === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategory(on ? null : c.id)}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] tap-clean transition-colors",
                    on
                      ? "bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`movement-category-${c.id}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-touch -mx-1 px-1">
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Loading movements…</p>
        ) : results.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Nothing matches “{q}”.
            </p>
            {onCreate && q.trim().length > 1 && (
              <Button size="sm" variant="outline" onClick={() => onCreate(q.trim())}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add “{q.trim()}”
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-1">
            {results.map((m) => {
              const on = picked?.has(m.id);
              return (
                <li key={m.id}>
                  <button
                    onClick={() => onPick(m)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left tap-clean hover:bg-white/[0.04] transition-colors"
                    data-testid={`movement-${m.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{m.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {CATEGORY_LABEL.get(m.category) ?? m.category}
                        {m.equipment !== "bodyweight" && ` · ${m.equipment}`}
                        {m.unilateral && " · per side"}
                        {m.ownerUserId && " · yours"}
                      </p>
                    </div>
                    {on ? (
                      <Check className="h-4 w-4 text-[hsl(var(--gold))] shrink-0" />
                    ) : (
                      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Said out loud, with the way out next to it. A filtered list that does
          not admit it is filtered is how somebody concludes the catalogue is
          missing half of what they do. */}
      {narrowed && (
        <p className="shrink-0 text-[11px] text-muted-foreground">
          Showing what you said you do.{" "}
          <button
            onClick={() => setGroup(EXERCISE_GROUPS[0].id)}
            className="underline underline-offset-2 hover:text-foreground"
            data-testid="movement-show-all"
          >
            Browse everything
          </button>{" "}
          — or just search for it.
        </p>
      )}

      {/* Always reachable, not only when a search comes up empty — somebody who
          knows the catalogue lacks their machine should not have to search for
          it first to be told so. */}
      {onCreate && results.length > 0 && (
        <button
          onClick={() => onCreate(q.trim())}
          className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground py-1"
          data-testid="movement-create"
        >
          <Plus className="h-3 w-3 inline mr-1" />
          Can't find it? Add your own
        </button>
      )}

      {onClose && (
        <Button variant="ghost" onClick={onClose} className="shrink-0 text-muted-foreground">
          Done
        </Button>
      )}
    </div>
  );
}
