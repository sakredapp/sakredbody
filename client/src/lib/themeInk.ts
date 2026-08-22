/**
 * Reading the palette from a canvas, which cannot see CSS.
 *
 * ── The problem the inventory turned up ───────────────────────────────────
 *
 * Sakred's art divides cleanly in two, and the halves have opposite problems.
 *
 * The SVG half — the Body Map, the terrain wheel, the capacity radar, the
 * dials, the sparklines, the star marks — is already written against
 * `hsl(var(--…))` and `currentColor`. It follows a theme change for free, and
 * that includes the surface Jace cares most about. Nothing needs doing to it.
 *
 * The canvas half — the constellation body, the star dust, the moon, the flow
 * field, the signal chain, the canopy — cannot do that. A 2D context takes
 * strings, resolves no custom properties, and inherits nothing. So every one
 * of those files carries baked RGB with a runtime alpha:
 *
 *     ctx.strokeStyle = `rgba(214,178,104,${0.16 + heat * 0.46})`
 *
 * The alpha is the whole animation, so these cannot become utility classes.
 * `214,178,104` is antique gold, and it is gold that only reads as gold
 * against ink. In daylight the same value is a muddy tan on limestone.
 *
 * ── What this does, and what it deliberately does not ─────────────────────
 *
 * It hands canvas code the *channels* of a themed token, so the line above can
 * become:
 *
 *     ctx.strokeStyle = `rgba(${channels("--gold")},${0.16 + heat * 0.46})`
 *
 * and the geometry, the timing and the alpha curve — which are the art — stay
 * exactly as they are. Only the ink moves.
 *
 * That is the mechanism, not the design. Daylight Sakred is not the nocturnal
 * constellation with its colours swapped: it is the same cosmology etched
 * rather than lit — bronze linework on parchment, restrained solar arcs, less
 * bloom and more incision. Some of these surfaces will want different token
 * choices per theme, and one or two will want different geometry. This makes
 * that possible; it does not make it automatic, and nothing here should be
 * mistaken for having done it.
 *
 * ── Why it caches ─────────────────────────────────────────────────────────
 *
 * These draw in a requestAnimationFrame loop. `getComputedStyle` forces style
 * resolution, and calling it per stroke per frame is how a constellation
 * becomes a stutter. The cache is keyed by the theme attribute alongside the
 * token, so a member changing appearance mid-animation gets new ink on the
 * next frame without anything having to subscribe or be torn down.
 */

/** `40 26% 92%` — the shape a custom property holds a colour in — as channels. */
export function hslTripletToRgb(triplet: string): [number, number, number] | null {
  const parts = triplet.trim().replace(/%/g, "").split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;

  const h = Number(parts[0]);
  const s = Number(parts[1]) / 100;
  const l = Number(parts[2]) / 100;
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    hp < 1 ? [c, x, 0] :
    hp < 2 ? [x, c, 0] :
    hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] :
    hp < 5 ? [x, 0, c] :
             [c, 0, x];

  const byte = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return [byte(r), byte(g), byte(b)];
}

export function hslTripletToHex(triplet: string): string | null {
  const rgb = hslTripletToRgb(triplet);
  if (!rgb) return null;
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ── The canvas-side accessor ──────────────────────────────────────────────

const cache = new Map<string, string>();

function currentTheme(): string {
  if (typeof document === "undefined") return "";
  return document.documentElement.getAttribute("data-theme") ?? "";
}

/**
 * A themed token as `"r,g,b"`, ready to interpolate into `rgba(…)`.
 *
 * The fallback is the caller's own baked value, which is what makes this
 * adoptable one line at a time: a converted call site behaves identically to
 * the one it replaced if the token is missing, renamed, or the document isn't
 * there — so a conversion can never be the reason a constellation goes black.
 */
export function channels(token: string, fallback = "235,211,162"): string {
  const key = `${currentTheme()}|${token}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let value = fallback;
  if (typeof document !== "undefined" && typeof getComputedStyle === "function") {
    const triplet = getComputedStyle(document.documentElement).getPropertyValue(token);
    const rgb = triplet ? hslTripletToRgb(triplet) : null;
    if (rgb) value = rgb.join(",");
  }

  cache.set(key, value);
  return value;
}

/** Test seam, and the escape hatch if a token is ever changed at runtime. */
export function forgetThemeInk(): void {
  cache.clear();
}
