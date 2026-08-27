import type { Config } from "tailwindcss";

export default {
  // Not `class`. The dark palette is selected by an attribute now, because the
  // `.dark` class was simultaneously the portal's route marker — see the note
  // above the palette in index.css. `dark:` variants keep working unchanged;
  // they compile against this selector instead of `.dark`.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: ".5625rem", /* 9px */
        md: ".375rem", /* 6px */
        sm: ".1875rem", /* 3px */
      },
      colors: {
        // Flat / base colors (regular buttons)
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)"
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
        // Gold as a real colour, so `bg-gold/25` and `border-gold/30` resolve.
        // They were used in twenty-odd places against the hand-written
        // `.bg-gold` utility, where the opacity modifier silently did nothing.
        // `.text-gold` stays hand-written in index.css — it tracks
        // `--gold-text`, which flips between the ink and light tones.
        gold: {
          DEFAULT: "hsl(var(--gold) / <alpha-value>)",
          light: "hsl(var(--gold-light) / <alpha-value>)",
          dark: "hsl(var(--gold-dark) / <alpha-value>)",
          // What text on a gold fill is, in both atmospheres. `text-gold-
          // foreground` was already written in MemberDashboard against no
          // such colour, so it resolved to nothing and that badge had no
          // text colour at all. Now it has one.
          foreground: "hsl(var(--gold-foreground) / <alpha-value>)",
        },
        // The ground a photograph or a video is viewed against, so
        // `bg-media/70` and `bg-media/30` resolve for player chrome. Black in
        // both themes on purpose — see the token.
        media: "hsl(var(--media-ground) / <alpha-value>)",
        // Text or a control drawn on a saturated fill we chose — a generated
        // avatar colour, an emerald badge, a play button on a video. White in
        // both themes, because the fill under it is the same in both.
        onfill: "hsl(var(--on-fill) / <alpha-value>)",
      },
      /*
        Gold as type resolves a different token from gold as a fill.

        `--gold` is 39 48% 56% in both atmospheres — a fill, and the same fill
        in both. `--gold-text` is that at night and bronze by day, because a
        56%-lightness gold on limestone is 1.6:1 and gone. Splitting them here
        rather than at every call site means `bg-gold` and `text-gold` can keep
        one name and still mean the two different things they have always
        meant.
      */
      textColor: {
        // Themed, unlike the emerald-400 and amber-400 they replaced.
        rise: "hsl(var(--rise) / <alpha-value>)",
        caution: "hsl(var(--caution) / <alpha-value>)",
        gold: {
          DEFAULT: "hsl(var(--gold-text) / <alpha-value>)",
          light: "hsl(var(--gold-light) / <alpha-value>)",
          dark: "hsl(var(--gold-dark) / <alpha-value>)",
          foreground: "hsl(var(--gold-foreground) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
        display: ["var(--font-display)"],
      },
      letterSpacing: {
        tightest: "-0.05em",
        tighter: "-0.03em",
        tight: "-0.02em",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
