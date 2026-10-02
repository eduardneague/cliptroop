import type { Config } from "tailwindcss";

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
