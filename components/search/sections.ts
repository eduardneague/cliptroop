import type { ReactNode } from "react";
import type { PersonResult } from "./types";

/**
 * The search window's lists and filters (1.26.0). Results come in kinds
 * (sections); the filters along the top pick one group of them. With
 * something typed, the section of the best match goes first and the rest
 * keep this order, so the list doesn't jump around as more answers arrive.
 */

export type FilterId = "all" | "videos" | "scripts" | "meetings" | "goals" | "people" | "app";

export type SectionId =
  | "projects"
  | "shorts"
  | "scripts"
  | "meetings"
  | "actionItems"
  | "objectives"
  | "projections"
  | "people"
  | "teams"
  | "date"
  | "actions"
  | "pages"
  | "analytics"
  // With nothing typed:
  | "here"
  | "recent"
  | "suggested"
  | "goto"
  | "switch"
  | `area:${string}`;

export type Item = {
  key: string;
  section: SectionId;
  /** 0–1: how sure we are (lib/search/strength.ts, lib/search/match.ts). */
  strength: number;
  visual: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Plain text for screen readers. */
  label: string;
  /** Where it goes (Ctrl/⌘ or middle click: a new tab). Actions have none. */
  href?: string;
  run: () => void;
  person?: PersonResult;
};

export const SECTION_TITLE: Record<string, string> = {
  projects: "Long videos",
  shorts: "Short videos",
  scripts: "Scripts and research",
  meetings: "Meetings",
  actionItems: "Action items",
  objectives: "Objectives",
  projections: "Projections",
  people: "People",
  teams: "Teams",
  date: "Calendar",
  actions: "Actions",
  pages: "Pages and settings",
  analytics: "Video analytics",
  here: "This video",
  recent: "Recent",
  suggested: "Suggested",
  goto: "Go to",
  switch: "Switch team",
};

/** With something typed: after the best match's section, in this order. */
export const ORDER: SectionId[] = ["projects", "shorts", "scripts", "meetings", "actionItems", "objectives", "projections", "people", "teams", "date", "actions", "pages", "analytics"];

/** How many of each show under All (the filter shows them all). */
export const LIMIT_ALL: Partial<Record<SectionId, number>> = {
  projects: 4,
  shorts: 4,
  scripts: 3,
  meetings: 3,
  actionItems: 3,
  objectives: 3,
  projections: 3,
  people: 4,
  teams: 3,
  date: 1,
  actions: 4,
  pages: 5,
  analytics: 4,
};

export const FILTERS: { id: FilterId; label: string; sections: SectionId[]; empty: string; none: string }[] = [
  { id: "all", label: "All", sections: ORDER, empty: "", none: "No matches" },
  { id: "videos", label: "Videos", sections: ["projects", "shorts", "analytics"], empty: "Type a title or a #number. Captions, hooks and descriptions count too.", none: "No videos" },
  { id: "scripts", label: "Scripts", sections: ["scripts"], empty: "Type words from a script or a research document.", none: "No scripts" },
  { id: "meetings", label: "Meetings", sections: ["meetings", "actionItems"], empty: "Type a meeting's name, words from its agenda or notes, or an action item.", none: "No meetings" },
  { id: "goals", label: "Goals", sections: ["objectives", "projections"], empty: "Type the name of an objective or a projection.", none: "No goals" },
  { id: "people", label: "People", sections: ["people", "teams"], empty: "Type a name, an @username or a team.", none: "No one" },
  { id: "app", label: "App", sections: ["date", "actions", "pages"], empty: "", none: "Nothing in the app" },
];

export const filterOf = (section: SectionId): FilterId => FILTERS.find((f) => f.id !== "all" && f.sections.includes(section))?.id ?? "app";

/**
 * Typed first: ">" actions and pages, "@" people. What's left is what to
 * look for; "#12" or "12" is a video's number.
 */
export function readPrefix(query: string): { filter: FilterId | null; text: string; number: boolean } {
  const q = query.trim();
  if (q.startsWith(">")) return { filter: "app", text: q.slice(1).trim(), number: false };
  if (q.startsWith("@")) return { filter: "people", text: q.slice(1).trim(), number: false };
  const n = /^#\s*(\d{1,7})$/.exec(q);
  if (n) return { filter: null, text: `#${n[1]}`, number: true };
  return { filter: null, text: q, number: /^\d{1,7}$/.test(q) };
}

/**
 * Sections in the order they show: the one with the best match first (ties
 * keep ORDER), then the others in ORDER. Empty ones are left out.
 */
export function orderSections(items: Item[], allowed: SectionId[]): SectionId[] {
  const present = ORDER.filter((s) => allowed.includes(s) && items.some((i) => i.section === s));
  if (!present.length) return [];
  let best: SectionId = present[0];
  let bestScore = -1;
  for (const s of present) {
    const top = Math.max(...items.filter((i) => i.section === s).map((i) => i.strength));
    if (top > bestScore + 1e-9) {
      best = s;
      bestScore = top;
    }
  }
  return [best, ...present.filter((s) => s !== best)];
}
