"use client";

import { createContext, useContext } from "react";

/*
 * The words the app's own controls say (a calendar, a date chip, a list to pick from, a window's ×) in English, or in
 * Romanian where a page says so (1.42.0: Business set to Română). A page puts <UiLocale value="ro"> around its content
 * and every control inside follows; everywhere else nothing changes.
 */
export type UiLang = "en" | "ro";

const Lang = createContext<UiLang>("en");
export const UiLocale = Lang.Provider;
export const useUiLang = () => useContext(Lang);
/** For dates and numbers (Intl). */
export const intlOf = (l: UiLang) => (l === "ro" ? "ro-RO" : "en-US");

export type UiWords = {
  close: string;
  dismiss: string;
  pickDate: string;
  clearDate: string;
  clearDateTitle: string;
  clearDateBody: string;
  keepIt: string;
  today: string;
  clear: string;
  prevMonth: string;
  nextMonth: string;
  loadingMonth: string;
  weekdays: readonly string[];
  planned: string;
  full: string;
  long: string;
  meeting: string;
  andMore: (n: number) => string;
  shorts: (n: number, of: number) => string;
  longs: (n: number) => string;
  meetings: (n: number) => string;
  select: string;
  typeToFilter: string;
  noMatches: string;
};

const WORDS: Record<UiLang, UiWords> = {
  en: {
    close: "Close",
    dismiss: "Dismiss",
    pickDate: "Pick a date",
    clearDate: "Clear date",
    clearDateTitle: "Clear this date?",
    clearDateBody: "The date is removed. You can pick a date again any time.",
    keepIt: "Keep it",
    today: "Today",
    clear: "Clear",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    loadingMonth: "Loading the month",
    weekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    planned: "planned",
    full: "full",
    long: "long",
    meeting: "meeting",
    andMore: (n: number) => `and ${n} more`,
    shorts: (n: number, of: number) => `${n} short${n === 1 ? "" : "s"}${of ? ` of ${of}` : ""}`,
    longs: (n: number) => `${n} long video${n === 1 ? "" : "s"}`,
    meetings: (n: number) => `${n} meeting${n === 1 ? "" : "s"}`,
    select: "Select…",
    typeToFilter: "Type to filter…",
    noMatches: "No matches",
  },
  ro: {
    close: "Închide",
    dismiss: "Închide",
    pickDate: "Alege data",
    clearDate: "Șterge data",
    clearDateTitle: "Ștergi data?",
    clearDateBody: "Data se șterge. Poți alege alta oricând.",
    keepIt: "Păstreaz-o",
    today: "Azi",
    clear: "Șterge",
    prevMonth: "Luna anterioară",
    nextMonth: "Luna următoare",
    loadingMonth: "Se încarcă luna",
    weekdays: ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"],
    planned: "planificat",
    full: "plin",
    long: "lung",
    meeting: "întâlnire",
    andMore: (n: number) => `și încă ${n}`,
    shorts: (n: number, of: number) => `${n} ${n === 1 ? "short" : "shorturi"}${of ? ` din ${of}` : ""}`,
    longs: (n: number) => `${n} ${n === 1 ? "videoclip lung" : "videoclipuri lungi"}`,
    meetings: (n: number) => `${n} ${n === 1 ? "întâlnire" : "întâlniri"}`,
    select: "Alege…",
    typeToFilter: "Scrie ca să cauți…",
    noMatches: "Nimic potrivit",
  },
};

export const uiWords = (l: UiLang): UiWords => WORDS[l];
export const useUiWords = (): UiWords => uiWords(useContext(Lang));
