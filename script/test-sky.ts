/**
 * The constellation sky — the parts that can be wrong invisibly.
 *
 * A background canvas has a failure mode nothing else in this codebase has:
 * when it goes wrong it goes quiet. An empty sky, a sky where every figure
 * landed in one corner, a sky where the left arm connects to the right knee —
 * all three type-check, build clean, throw nothing, and look from a distance
 * like a background that is simply subtle. The only honest check is to assert
 * against the geometry itself.
 *
 * So the placement is a pure function of (width, height) with no canvas in it,
 * and this is what actually reads it.
 *
 * Run: tsx script/test-sky.ts
 */

import { readFileSync } from "node:fs";
import { ASPECT, LOD, planSky, type Figure } from "../client/src/components/portal/ConstellationSky.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/** The viewports this actually ships to, not round numbers. */
const SCREENS: [string, number, number][] = [
  ["iPhone 15 portrait", 393, 852],
  ["iPhone SE portrait", 375, 667],
  ["Pixel 8 portrait", 412, 915],
  ["phone landscape", 852, 393],
  ["iPad portrait", 820, 1180],
  ["laptop", 1440, 900],
  ["wide desktop", 2560, 1400],
  ["squat panel", 1200, 260],
];

console.log("Constellation sky");

/* ── The figure is a figure ──────────────────────────────────────────────── */

section("Topology");

LOD.forEach((lod, i) => {
  const joints = new Set(lod.joints);

  // The reason the joints are named rather than indexed. Subsetting a list of
  // anonymous coordinate pairs by index is exactly how an edge ends up
  // pointing at a joint this level of detail doesn't draw — which renders as a
  // line going off to nowhere, or to whatever happens to sit at that index.
  const dangling = lod.edges
    .flat()
    .filter((n) => !joints.has(n));
  check(`LOD ${i}: every edge lands on a drawn joint`, dangling.length === 0, dangling.join(", "));

  // One body, not a body and a spare part floating beside it.
  const seen = new Set<string>([lod.joints[0]]);
  const queue = [lod.joints[0]];
  while (queue.length) {
    const at = queue.pop()!;
    for (const [a, b] of lod.edges) {
      const other = a === at ? b : b === at ? a : null;
      if (other && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  check(
    `LOD ${i}: one connected figure, no detached limbs`,
    seen.size === lod.joints.length,
    `reached ${seen.size} of ${lod.joints.length}`,
  );

  // Nothing drawn twice, which would double its brightness against its
  // neighbours for no visible reason.
  check(`LOD ${i}: no duplicate joints`, joints.size === lod.joints.length);
});

check("far figure stays legible — 8 joints or fewer", LOD[0].joints.length <= 8);
check("detail increases with proximity", LOD[0].joints.length < LOD[1].joints.length && LOD[1].joints.length < LOD[2].joints.length);

/* ── A sky appears at all ────────────────────────────────────────────────── */

section("Placement");

for (const [name, w, h] of SCREENS) {
  const sky = planSky(w, h, { density: 1 });

  // The bug this whole file exists for.
  check(`${name}: not empty`, sky.length > 0, `${sky.length} figures`);
  check(`${name}: enough to read as a sky`, sky.length >= 5, `${sky.length} figures`);

  // Every figure whole. A beheaded constellation is worse than none.
  const clipped = sky.filter((f: Figure) => {
    const fw = f.h * ASPECT;
    return f.cx - fw / 2 < 0 || f.cx + fw / 2 > w || f.cy - f.h / 2 < 0 || f.cy + f.h / 2 > h;
  });
  check(`${name}: nothing clipped by the canvas edge`, clipped.length === 0, `${clipped.length} clipped`);

  // Not all piled in one corner. Checked as spread rather than as overlap
  // because the placement loop already rejects overlap — if that rejection
  // silently stopped working, this is what would catch it.
  const overlapping: string[] = [];
  for (let i = 0; i < sky.length; i++) {
    for (let j = i + 1; j < sky.length; j++) {
      const a = sky[i];
      const b = sky[j];
      const dx = (a.cx - b.cx) / (((a.h * ASPECT + b.h * ASPECT) / 2) * 0.85);
      const dy = (a.cy - b.cy) / (((a.h + b.h) / 2) * 0.62);
      if (dx * dx + dy * dy < 1) overlapping.push(`${i}/${j}`);
    }
  }
  check(`${name}: no two figures overlap`, overlapping.length === 0, overlapping.join(" "));

  // Every joint the level of detail wants to draw has a coordinate.
  const missing = sky.filter((f: Figure) => LOD[f.lod].joints.some((n) => !f.pts[n]));
  check(`${name}: every drawn joint has a position`, missing.length === 0);
}

/* ── The composition, not just the count ─────────────────────────────────── */

section("Composition");

{
  const sky = planSky(1440, 900, { density: 1 });
  const near = sky.filter((f: Figure) => f.lod === 2).length;
  const mid = sky.filter((f: Figure) => f.lod === 1).length;
  const far = sky.filter((f: Figure) => f.lod === 0).length;

  // A field of one size is a texture. The mix is the effect.
  check("a laptop gets all three sizes", near > 0 && mid > 0 && far > 0, `${near}/${mid}/${far}`);
  check("far figures outnumber near ones", far > near, `${far} far, ${near} near`);

  // Small figures sit further back and must read fainter, or the depth
  // collapses and it looks like one plane of clutter.
  const wrongDepth = sky.filter(
    (f: Figure) => (f.lod === 0 && f.depth >= 0.72) || (f.lod === 2 && f.depth < 1),
  );
  check("smaller means fainter", wrongDepth.length === 0);

  // Mirrored and tilted, or fourteen copies of one stamp.
  check("some figures are mirrored", sky.some((f: Figure) => f.mirror) && sky.some((f: Figure) => !f.mirror));
  check("figures are tilted off vertical", sky.some((f: Figure) => Math.abs(f.tilt) > 0.02));

  // Each on its own cycle. Identical rates would pulse them in unison, which
  // is a Christmas tree rather than a sky.
  const rates = new Set(sky.map((f: Figure) => f.rate.toFixed(4)));
  check("every figure pulses on its own cycle", rates.size === sky.length, `${rates.size} of ${sky.length}`);

  // The skeleton is jittered per figure, so no two stand identically.
  const shapes = new Set(sky.map((f: Figure) => JSON.stringify(f.pts.crown)));
  check("no two figures share a skeleton", shapes.size === sky.length);
}

/* ── Determinism ─────────────────────────────────────────────────────────── */

section("Determinism");

{
  const a = planSky(393, 852, { density: 1 });
  const b = planSky(393, 852, { density: 1 });
  check(
    "the same viewport gets the same sky twice",
    JSON.stringify(a) === JSON.stringify(b),
  );
}

/* ── The knobs do what they say ──────────────────────────────────────────── */

section("Density and the clear centre");

{
  const full = planSky(1440, 900, { density: 1 });
  const half = planSky(1440, 900, { density: 0.5 });
  const desk = planSky(1440, 900, { density: 0.34 });
  check("density thins the field", half.length < full.length, `${half.length} vs ${full.length}`);
  check("the back office is thinner still", desk.length <= half.length, `${desk.length} vs ${half.length}`);
  check("even the thinnest still has a sky", desk.length >= 5, `${desk.length}`);
}

{
  // The login card sits dead centre. A face behind glass is the effect; a face
  // behind a habit list is a legibility bug.
  const w = 1440;
  const h = 900;
  const sky = planSky(w, h, { density: 1, clearCentre: 0.5 });
  const band = h * 0.5 * 0.5;
  const wband = Math.min(w * 0.45, 260);
  const intruders = sky.filter(
    (f: Figure) => f.lod > 0 && Math.abs(f.cy - h / 2) < band && Math.abs(f.cx - w / 2) < wband,
  );
  check("no large figure stands behind the card", intruders.length === 0, `${intruders.length} intruders`);

  // And it must not clear the screen while it's at it.
  check("clearing the centre still leaves a sky", sky.length >= 5, `${sky.length}`);
}

/* ── Degenerate inputs ───────────────────────────────────────────────────── */

section("Degenerate sizes");

check("zero width returns nothing rather than throwing", planSky(0, 800).length === 0);
check("zero height returns nothing rather than throwing", planSky(800, 0).length === 0);
check("NaN returns nothing rather than throwing", planSky(NaN, NaN).length === 0);

// A canvas can measure this small for a frame during layout. It must not hang
// or produce a figure taller than its container.
{
  const tiny = planSky(40, 40, { density: 1 });
  check("a 40px canvas produces figures that fit", tiny.every((f: Figure) => f.h <= 40));
}

/* ── Web and native agree on the ground ──────────────────────────────────── */

section("Design alignment: web ↔ native");

{
  // The launch of a Capacitor app is painted by five different files owned by
  // three different toolchains — the CSS token, the web manifest, the HTML
  // meta tag, the Android theme, and an iOS storyboard that stores its colour
  // as three floats. Nothing links them. Changing `--ink` in index.css to warm
  // the app up half a shade leaves the other four on the old value, and the
  // symptom is a flash at launch that no stack trace will ever mention.
  //
  // This derives the expected value from the CSS token — the one a designer
  // would actually edit — and checks the other four against it.
  const read = (p: string) => readFileSync(p, "utf8");

  const css = read("client/src/index.css");
  const m = css.match(/--ink:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  check("index.css still defines --ink", !!m);

  if (m) {
    const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const mm = l - c / 2;
    const [r1, g1, b1] =
      h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const rgb = [r1 + mm, g1 + mm, b1 + mm];
    const hex =
      "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0").toUpperCase()).join("");

    console.log(`  --ink is ${hex}`);

    const upper = hex.toUpperCase();
    const has = (p: string, label: string, count = 1) => {
      const hits = (read(p).toUpperCase().match(new RegExp(upper, "g")) ?? []).length;
      check(`${label} paints ${hex}`, hits >= count, `found ${hits}, wanted ${count}`);
    };

    has("client/index.html", "the theme-color meta tag");
    has("client/public/manifest.webmanifest", "the web manifest", 2);
    has("capacitor.config.ts", "the Capacitor shell config", 2);
    has("android/app/src/main/res/values/colors.xml", "the Android theme colour");

    // The storyboard stores components as 0…1 floats, so it needs comparing
    // numerically rather than by string.
    const sb = read("ios/App/App/Base.lproj/LaunchScreen.storyboard");
    const cm = sb.match(/red="([\d.]+)" green="([\d.]+)" blue="([\d.]+)"/);
    check("the iOS launch screen sets an explicit colour", !!cm);
    if (cm) {
      const off = [1, 2, 3].map((i) => Math.abs(Number(cm[i]) * 255 - Math.round(rgb[i - 1] * 255)));
      check("the iOS launch screen matches it", Math.max(...off) < 1, `off by ${off.map((v) => v.toFixed(2)).join(", ")}`);
    }
    // The white it used to be. systemBackground is white in light mode, and
    // this app has no light mode.
    check(
      "the iOS launch screen no longer falls back to systemBackground",
      !sb.includes("systemBackgroundColor"),
    );
  }

  // Android must not follow the system into a light theme it doesn't have.
  const styles = read("android/app/src/main/res/values/styles.xml");
  check("the Android base theme isn't Light", !/parent="Theme\.AppCompat\.Light/.test(styles));
  check("the Android window has a real background, not @null", !/android:background">@null/.test(styles));
  // The attribute carries a tools:targetApi alongside it, so the value isn't
  // adjacent to the closing quote.
  check("Android force-dark is off", /forceDarkAllowed"[^>]*>false/.test(styles));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
