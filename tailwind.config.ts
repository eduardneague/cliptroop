import type { Config } from "tailwindcss";
import { BREAKPOINTS } from "./lib/breakpoints";

// NOTE: These are placeholder tokens matching the prototype's palette,
// so the app renders coherently from day one. The full visual design
// system (typography scale, motion, final palette) gets a dedicated
// pass before we build real screens — see /docs/design-system.md (TBD).
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./modules/**/*.{ts,tsx}",
  ],
  darkMode: ["class"],
  theme: {
    // Earlier than Tailwind's defaults (lib/breakpoints.ts says why).
    screens: Object.fromEntries(Object.entries(BREAKPOINTS).map(([k, v]) => [k, `${v}px`])),
    extend: {
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        "paper-2": "rgb(var(--paper-2) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        "ink-faint": "rgb(var(--ink-faint) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",
        teal: "rgb(var(--teal) / <alpha-value>)",
        blue: "rgb(var(--blue) / <alpha-value>)",
        violet: "rgb(var(--violet) / <alpha-value>)",
        short: "rgb(var(--short) / <alpha-value>)",
        long: "rgb(var(--long) / <alpha-value>)",
        pink: "rgb(var(--pink) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
        green: "rgb(var(--green) / <alpha-value>)",
        red: "rgb(var(--red) / <alpha-value>)",
        coral: "rgb(var(--coral) / <alpha-value>)",
      },
      // 1.35.0: words in a colour use its text shade (globals.css, --*-text): in light mode a deeper one, so they read
      // at 4.5:1 on cards, paper and their own tinted chips; in dark mode the colour itself. Fills, borders, rings and
      // icons drawn with fill-/stroke- keep the colour.
      textColor: {
        amber: "rgb(var(--amber-text) / <alpha-value>)",
        teal: "rgb(var(--teal-text) / <alpha-value>)",
        blue: "rgb(var(--blue-text) / <alpha-value>)",
        violet: "rgb(var(--violet-text) / <alpha-value>)",
        short: "rgb(var(--short-text) / <alpha-value>)",
        long: "rgb(var(--long-text) / <alpha-value>)",
        pink: "rgb(var(--pink-text) / <alpha-value>)",
        gold: "rgb(var(--gold-text) / <alpha-value>)",
        green: "rgb(var(--green-text) / <alpha-value>)",
        red: "rgb(var(--red-text) / <alpha-value>)",
        coral: "rgb(var(--coral-text) / <alpha-value>)",
      },
      // 12% tints (badges, chips, tiles) are used across the app; Tailwind's
      // scale only has steps of 5, so without this they rendered with no tint.
      opacity: {
        12: "0.12",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};

export default config;
