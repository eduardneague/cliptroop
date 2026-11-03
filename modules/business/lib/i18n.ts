/**
 * Business (1.42.0): the page in English or Romanian. The owner (Oct 29 2026): "vreau să pot seta și limba în pagina de
 * business între engleză și română și totul să fie tradus în termenii corecți de business". Every file keeps its words
 * side by side (`words({...})`, English and Romanian together, a function when a sentence takes values) and the page
 * picks one language (`pick`). Romanian follows the registers' own terms (OMFP 170/2015, OMFP 3254/2017, Codul fiscal):
 * Registrul-jurnal de încasări și plăți, încasări / plăți, numerar / bancă, sold, venit brut, cheltuieli deductibile,
 * mijloace fixe, amortizare, stornare. tests/business.test.ts checks every pair is whole.
 */
import type { Lang } from "./kinds";

export type { Lang };

type Say = (...args: never[]) => string;
/** A word or a sentence in both languages (a function when it takes values: the same function in both). */
export type Pair = { en: string; ro: string } | { en: Say; ro: Say };
export type Dict = Record<string, Pair>;
/** One language's words: `w.save`, `w.lines(3)`. */
export type Words<D extends Dict> = { [K in keyof D]: D[K]["en"] };

/** A file's words (the object itself: the type keeps English and Romanian together). */
export const words = <D extends Dict>(d: D): D => d;

export function pick<D extends Dict>(d: D, lang: Lang): Words<D> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(d)) out[k] = d[k][lang];
  return out as Words<D>;
}

/** Where the page's language is kept: a cookie (this browser), so the server draws the page in it from the start. */
export const LANG_COOKIE = "vp_business_lang";
export const langOf = (v: unknown): Lang => (v === "ro" ? "ro" : "en");

/**
 * How many of something, said right: 1 line, 2 lines; 1 rând, 2 rânduri, 20 de rânduri (Romanian puts "de" from 20 on,
 * except after 101–119, 201–219…).
 */
export function nOf(lang: Lang, n: number, en: readonly [string, string], ro: readonly [string, string]): string {
  const shown = n.toLocaleString(lang === "ro" ? "ro-RO" : "en-US");
  if (lang === "en") return `${shown} ${n === 1 ? en[0] : en[1]}`;
  if (n === 1) return `${shown} ${ro[0]}`;
  const r = Math.abs(n) % 100;
  return n !== 0 && (r === 0 || r >= 20) ? `${shown} de ${ro[1]}` : `${shown} ${ro[1]}`;
}
/** The same, for one language's sentences: nEn(3, "line", "lines"), nRo(20, "rând", "rânduri"). */
export const nEn = (n: number, one: string, many: string) => nOf("en", n, [one, many], [one, many]);
export const nRo = (n: number, one: string, many: string) => nOf("ro", n, [one, many], [one, many]);
