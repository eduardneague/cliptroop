"use client";

import type { RecentItem } from "./types";

const MAX = 6;
const MAX_TERMS = 5;
const keyFor = (userId: string) => `vp:recent-search:${userId}`;
const termsKey = (userId: string) => `vp:recent-terms:${userId}`;

/** Per-user, per-browser list of recently opened search results. */
export function readRecents(userId: string): RecentItem[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const list = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.href === "string" && typeof r.label === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(userId: string, item: RecentItem) {
  try {
    const next = [item, ...readRecents(userId).filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, MAX);
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    /* storage full / disabled — recents are a nicety */
  }
}

/** What you searched for lately (1.26.0), newest first. */
export function readTerms(userId: string): string[] {
  try {
    const raw = localStorage.getItem(termsKey(userId));
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, MAX_TERMS) : [];
  } catch {
    return [];
  }
}

export function pushTerm(userId: string, term: string) {
  const t = term.trim().replace(/\s+/g, " ").slice(0, 64);
  if (t.length < 2) return;
  try {
    const next = [t, ...readTerms(userId).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_TERMS);
    localStorage.setItem(termsKey(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Forget both: what you opened and what you searched for. */
export function clearRecents(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId));
    localStorage.removeItem(termsKey(userId));
  } catch {
    /* ignore */
  }
}
