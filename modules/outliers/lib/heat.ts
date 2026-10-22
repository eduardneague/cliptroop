import { band, type Band } from "./scores";

/*
 * The multiplier's colours (1.29.9): red under its usual, about usual quiet,
 * 2–5× yellow, 5× and up green (deeper from 10×; the badge glows from 25×).
 * Its own colours (the --m-* tokens in globals.css, brighter in dark mode),
 * never the theme's: a multiplier in the accent read like a button, and the
 * accent changes with the colour theme. The same scale everywhere a score
 * shows: badges, the spike, the panels' bars and tiles.
 */

export type Heat = {
  /** A fill (a badge, a bar). */
  solid: string;
  /** A light wash (a tile behind the number). */
  soft: string;
  /** The number on the page. */
  text: string;
  /** The number on the fill. */
  on: string;
};

export const HEAT: Record<Band, Heat> = {
  none: { solid: "rgb(var(--ink-faint))", soft: "rgb(var(--ink) / 0.06)", text: "rgb(var(--ink-faint))", on: "#fff" },
  below: { solid: "rgb(var(--m-red))", soft: "rgb(var(--m-red) / 0.1)", text: "rgb(var(--m-red-ink))", on: "#fff" },
  usual: { solid: "rgb(var(--ink-soft))", soft: "rgb(var(--ink) / 0.08)", text: "rgb(var(--ink-soft))", on: "#fff" },
  good: { solid: "rgb(var(--m-yellow))", soft: "rgb(var(--m-yellow) / 0.18)", text: "rgb(var(--m-yellow-ink))", on: "rgb(var(--m-on-yellow))" },
  great: { solid: "rgb(var(--m-green))", soft: "rgb(var(--m-green) / 0.14)", text: "rgb(var(--m-green-ink))", on: "rgb(var(--m-on-green))" },
  huge: { solid: "rgb(var(--m-green-2))", soft: "rgb(var(--m-green-2) / 0.16)", text: "rgb(var(--m-green-ink))", on: "rgb(var(--m-on-green))" },
  viral: { solid: "rgb(var(--m-green-2))", soft: "rgb(var(--m-green-2) / 0.18)", text: "rgb(var(--m-green-ink))", on: "rgb(var(--m-on-green))" },
};

export const heat = (score: number | null | undefined): Heat => HEAT[band(score)];
