import { useEffect, useRef } from "react";
import { breathAt } from "@/lib/breath";
import { hash01, mountStage } from "@/lib/canvasStage";

/**
 * The moon tonight, and the sun behind it.
 *
 * Not an illustration — the phase is computed from the actual date, so the
 * disc on the page matches the one outside the window. That is the whole
 * claim of the brand in one object: the body is read against the season and
 * the sky, and the sky is a fact you can check.
 *
 * The terminator is drawn the way it actually falls: an ellipse whose width
 * tracks the illuminated fraction, which is why a gibbous moon bulges and a
 * crescent cuts.
 */

/** Days since a known new moon, folded into the 29.53-day synodic month. */
export function moonAge(date = new Date()) {
  const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  const SYNODIC = 29.530588853;
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC;
}

export function moonPhaseName(age = moonAge()) {
  if (age < 1.85) return "New Moon";
  if (age < 5.54) return "Waxing Crescent";
  if (age < 9.23) return "First Quarter";
  if (age < 12.91) return "Waxing Gibbous";
  if (age < 16.61) return "Full Moon";
  if (age < 20.3) return "Waning Gibbous";
  if (age < 23.99) return "Last Quarter";
  if (age < 27.68) return "Waning Crescent";
  return "New Moon";
}

export function MoonPhase({
  className,
  /** Override for a fixed phase; otherwise it reads today. */
  age,
  testId,
}: {
  className?: string;
  age?: number;
  testId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const a = age ?? moonAge();
    const SYNODIC = 29.530588853;
    // 0 new, 0.5 full, 1 new again.
    const phase = a / SYNODIC;
    const illuminated = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    const waxing = phase < 0.5;

    return mountStage(canvas, (S) => (t) => {
      const { ctx, w, h } = S;
      const breath = breathAt(t);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.3 * (1 + breath * 0.015);

      // The halo. Wider on the exhale, like breath on cold glass.
      const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * (2.4 + breath * 0.5));
      halo.addColorStop(0, `rgba(235,211,162,${0.14 + breath * 0.08})`);
      halo.addColorStop(1, "rgba(235,211,162,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // The unlit disc, so the dark limb still reads as a body.
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(60,54,46,0.5)";
      ctx.fill();
      ctx.strokeStyle = "rgba(197,160,89,0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // The lit part: a half disc, plus the terminator ellipse. The ellipse
      // is drawn in the same direction as the limb for a gibbous phase and
      // the opposite direction for a crescent — that flip is the phase.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      const lit = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      lit.addColorStop(0, "rgba(247,240,222,0.95)");
      lit.addColorStop(1, "rgba(206,177,120,0.85)");
      ctx.fillStyle = lit;

      const k = illuminated * 2 - 1; // -1 … 1
      ctx.beginPath();
      if (waxing) ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2);
      else ctx.arc(cx, cy, R, Math.PI / 2, (Math.PI * 3) / 2);
      ctx.ellipse(cx, cy, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, waxing === k > 0);
      ctx.closePath();
      ctx.fill();

      // Maria: a few soft blots so the lit face isn't a flat coin.
      for (let i = 0; i < 5; i++) {
        const mx = cx + (hash01(i, 21.3) - 0.5) * R * 1.2;
        const my = cy + (hash01(i, 57.9) - 0.5) * R * 1.2;
        const mr = R * (0.1 + hash01(i, 88.4) * 0.16);
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(150,132,101,0.16)";
        ctx.fill();
      }
      ctx.restore();
    });
  }, [age]);

  return <canvas ref={ref} className={className} aria-hidden="true" data-testid={testId} />;
}
