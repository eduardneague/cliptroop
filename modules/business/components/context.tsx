"use client";

import { createContext, useContext, useMemo } from "react";
import type { Prior } from "../lib/entries";
import { pick, type Dict, type Words } from "../lib/i18n";
import type { Lang } from "../lib/kinds";
import type { Access, Asset, Books, BusinessFile, BusinessPerson, Entry, Inventory, InventoryItem, Profile, RefLine, Source, YearState } from "../lib/types";

/*
 * Business (1.42.0): the year's books on the page, shared by every tab. The server reads them once (page.tsx); every
 * change goes through a server action and comes back as the database saved it, then lands here, so the tabs (and the
 * exports) always agree with each other.
 */

export type BooksState = {
  profile: Profile;
  setUp: boolean;
  sources: Source[];
  /** The year's entries (and fixed assets' purchases from other years: which source their amortization goes to). */
  entries: Entry[];
  assets: Asset[];
  inventories: Inventory[];
  items: InventoryItem[];
  refLines: RefLine[];
  years: YearState[];
  files: BusinessFile[];
};

export type BusinessCtx = {
  teamId: string;
  teamName: string;
  me: string;
  access: Access;
  /** May change things (the owner, or given edit). */
  edit: boolean;
  year: number;
  years: number[];
  today: string;
  prior: Prior;
  s: BooksState;
  books: Books;
  /** This year is closed: nothing in it changes until it's reopened. */
  closed: boolean;
  /** May change this year's entries now. */
  writable: boolean;
  closedYears: ReadonlySet<number>;
  patch: (fn: (s: BooksState) => BooksState) => void;
  /** The page's language: English, or Romanian in the registers' own terms (remembered in this browser). */
  lang: Lang;
  setLang: (l: Lang) => void;
  people: BusinessPerson[] | null;
  setPeople: (fn: (p: BusinessPerson[]) => BusinessPerson[]) => void;
  /** Another tab, or another year (the books for it come from the server). */
  goTab: (tab: string) => void;
  goYear: (year: number) => void;
  /** The entry window: a new entry (with what's known, and 1.43.0 documents chosen for it already), or one to change. */
  openEntry: (o: { entry?: Entry | null; draft?: Partial<Entry> | null; reverse?: boolean; files?: File[] }) => void;
};

export const Ctx = createContext<BusinessCtx | null>(null);
export function useBusiness(): BusinessCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBusiness outside <BusinessApp>");
  return c;
}

/** The page's language (English outside the page, e.g. a lone piece in a test). */
export const useLang = (): Lang => useContext(Ctx)?.lang ?? "en";

/** A file's words in the page's language: `const w = useWords(W)`, then `w.save`, `w.lines(3)`. */
export function useWords<D extends Dict>(d: D): Words<D> {
  const lang = useLang();
  return useMemo(() => pick(d, lang), [d, lang]);
}

/** A row put in its list: replaced when it's there, added when it isn't. */
export function upsert<T extends { id: string }>(list: readonly T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i < 0) return [...list, row];
  const out = list.slice();
  out[i] = row;
  return out;
}
export const without = <T extends { id: string }>(list: readonly T[], ids: readonly string[]) => list.filter((x) => !ids.includes(x.id));
