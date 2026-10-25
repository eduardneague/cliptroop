"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useScrollLock } from "@/lib/hooks/use-scroll-lock";
import { signOut, switchTeam } from "@/app/(dashboard)/actions";
import { LOGOUT_CONFIRM } from "@/components/ui/logout-button";
import { syncAnalyticsNow } from "@/app/(dashboard)/analytics/actions";
import { setSounds } from "@/app/(dashboard)/settings/actions";
import { profileHref } from "@/lib/profile-link";
import type { TeamSummary } from "@/lib/teams";
import { buildCatalog, prepared, SUGGESTED, type Entry } from "@/lib/search/catalog";
import { rank } from "@/lib/search/match";
import { localToday, parseDate } from "@/lib/search/dates";
import { isDark, onThemeChange, setDark } from "@/lib/theme";
import { changeLook } from "@/lib/look-screen";
import { setSoundsEnabled, sounds, soundsEnabled } from "@/lib/sounds";
import { flashWhenReady } from "@/lib/flash";
import { minWidth } from "@/lib/breakpoints";
import { openWhatsNew } from "@/components/ui/whats-new";
import { startTutorial } from "@/components/tutorial/tutorial";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { startNavProgress } from "@/components/ui/nav-progress";
import { ArrowRightIcon, CloseIcon, SearchIcon } from "@/components/ui/icons";
import { useGlobalSearch } from "./use-global-search";
import { useVideoSearch } from "./use-video-search";
import { clearRecents, pushRecent, pushTerm, readRecents, readTerms } from "./recents";
import { InvitePanel } from "./invite-panel";
import { entryItem, recentItem, resultItems, switchItem, type BuildHelpers } from "./build";
import { FILTERS, LIMIT_ALL, SECTION_TITLE, filterOf, orderSections, readPrefix, type FilterId, type Item, type SectionId } from "./sections";
import { EMPTY_RESPONSE, type PersonResult, type RecentItem, type SearchResponse, type SearchTeamRef } from "./types";

const NO_ROLES: readonly string[] = [];

/** The main places, for "Go to" when nothing is typed. */
const GOTO = ["dashboard", "shorts", "videos", "calendar", "meetings", "posting", "analytics", "objectives", "team", "settings", "profile"];
/** Things to try, when nothing is typed. */
const TRY = ["#1", "editing", "tomorrow", "dark mode", "best time to post"];
/** The app's areas, in the order the App filter lists them with nothing typed. */
const AREAS = ["Pages", "Actions", "Dashboard", "Short videos", "Long videos", "Calendar", "Meetings", "Posting", "Analytics", "Objectives", "Team", "Settings", "Developer"];
const areaOf = (e: Entry) => (e.trail.length ? e.trail[0] : e.kind === "action" ? "Actions" : "Pages");

/** What Recent shows under each filter, with nothing typed. */
const RECENT_KINDS: Partial<Record<FilterId, RecentItem["kind"][]>> = {
  videos: ["project", "short"],
  scripts: ["script"],
  meetings: ["meeting"],
  goals: ["goal"],
  people: ["person", "team"],
};

/** Which list of the database answer a section is (to tell when there may be more). */
const RPC_KEY: Partial<Record<SectionId, keyof SearchResponse>> = {
  projects: "projects",
  shorts: "shorts",
  scripts: "scripts",
  meetings: "meetings",
  actionItems: "actions",
  objectives: "objectives",
  projections: "projections",
  people: "people",
  teams: "teams",
};

/**
 * The search window (1.26.0: finds everything). The header's GlobalSearch
 * (global-search.tsx) opens it and loads this file the first time it's
 * needed (1.32.2: it's most of the search's code, and every page used to
 * download it up front).
 *
 * Opens with a click, Ctrl/⌘+K, or "/": a centered window on desktop, a
 * full-screen sheet on phones. One box for videos (by title, #number,
 * caption or notes), scripts, meetings and action items, objectives and
 * projections, people and teams, every page, tab and setting of the app,
 * things to do right there (dark mode, sounds, What's new…) and days in the
 * calendar ("tomorrow", "oct 20"). Typos are fine. The filters along the
 * top pick one kind; ">" means actions and pages, "@" people.
 *
 * Keyboard: ↑/↓ move · Enter opens (Ctrl/⌘+Enter: a new tab) · Tab the
 * next filter · → on a person opens Invite · Esc closes (or goes back).
 */
export function SearchPalette({
  onClose,
  userId,
  username,
  teams,
  currentTeamId,
  roles = NO_ROLES,
  developer = false,
}: {
  /** Close it (the header's GlobalSearch unmounts it). */
  onClose: () => void;
  userId: string;
  username: string | null;
  teams: TeamSummary[];
  currentTeamId: string | null;
  /** Your roles in the current team: what you're offered (the database still decides). */
  roles?: readonly string[];
  developer?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const confirm = useConfirm();
  // Mounted only while it's open (1.32.2: GlobalSearch, in the header, loads this when it's first needed).
  const open = true;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [highlighted, setHighlighted] = useState(0);
  const [invitee, setInvitee] = useState<PersonResult | null>(null);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [dark, setDarkState] = useState(false);
  const [soundsOn, setSoundsOn] = useState(true);
  const [today, setToday] = useState("");
  // Wide enough for the long hint in the box (not on phones).
  const [wide, setWide] = useState(true);
  const [, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const subKeyHandler = useRef<((e: React.KeyboardEvent) => boolean) | null>(null);
  const registerKeyHandler = useCallback((h: ((e: React.KeyboardEvent) => boolean) | null) => {
    subKeyHandler.current = h;
  }, []);

  // What's typed: a ">" or "@" in front picks the filter; the rest is looked for.
  const prefix = readPrefix(query);
  const activeFilter: FilterId = prefix.filter ?? filter;
  const text = prefix.text;
  const typed = text.length > 0;
  // "#12" / "12" look up entry numbers, so even one digit counts.
  const rpcText = text;
  const hasQuery = rpcText.length >= 2 || /^#?\d+$/.test(rpcText);
  const wantsRpc = open && activeFilter !== "app";
  const limit = activeFilter === "all" || activeFilter === "app" ? 6 : 20;
  const search = useGlobalSearch(rpcText, wantsRpc, limit);
  const data = wantsRpc ? search.data : EMPTY_RESPONSE;
  const { loading, error, patchPerson } = search;
  // Videos with their numbers (the current team's accounts).
  const videos = useVideoSearch(rpcText, open && hasQuery && (activeFilter === "all" || activeFilter === "videos"), currentTeamId);
  const textRef = useRef(text);
  textRef.current = text;

  // What it shows before anything's typed, read as it opens.
  useEffect(() => {
    setRecents(readRecents(userId));
    setTerms(readTerms(userId));
    setDarkState(isDark());
    setSoundsOn(soundsEnabled());
    setToday(localToday());
    setWide(window.matchMedia?.(minWidth("sm")).matches ?? true);
    return onThemeChange(setDarkState);
  }, [userId]);

  const close = useCallback(() => onClose(), [onClose]);


  // Lock page scroll behind the palette; focus the input.
  useScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  /** Remember what was searched for, once something found is opened. */
  const rememberTerm = useCallback(() => {
    const t = textRef.current;
    if (t.length >= 2) pushTerm(userId, t);
  }, [userId]);

  const go = useCallback(
    (href: string, recent?: RecentItem) => {
      if (recent) pushRecent(userId, recent);
      rememberTerm();
      close();
      startNavProgress(href);
      router.push(href);
      // A part of a page ("…#sounds"): scroll to it and make it glow once it's there.
      const hash = href.indexOf("#");
      if (hash >= 0) flashWhenReady(decodeURIComponent(href.slice(hash + 1)), href.slice(0, hash));
    },
    [close, router, userId, rememberTerm]
  );

  const switchTo = useCallback(
    (team: { id: string; name: string; color: string; logo_url: string | null }) => {
      pushRecent(userId, { kind: "team", id: team.id, label: team.name, href: "/dashboard", imageUrl: team.logo_url, color: team.color });
      rememberTerm();
      close();
      startTransition(async () => {
        if (team.id !== currentTeamId) await switchTeam(team.id);
        router.push("/dashboard");
      });
    },
    [close, currentTeamId, rememberTerm, router, userId]
  );

  const goInTeam = useCallback(
    (team: SearchTeamRef, href: string, recent?: RecentItem) => {
      if (!team.id || team.id === currentTeamId) return go(href, recent);
      if (recent) pushRecent(userId, recent);
      rememberTerm();
      close();
      startTransition(async () => {
        await switchTeam(team.id);
        router.push(href);
      });
    },
    [close, currentTeamId, go, rememberTerm, router, userId]
  );

  const runEntry = useCallback(
    (e: Entry) => {
      if (e.href) {
        // Pages, tabs and settings come back under Recent; actions are always one search away.
        const recent: RecentItem | undefined =
          e.kind === "action" ? undefined : { kind: "page", id: e.id, label: e.title, sublabel: e.trail.join(" › ") || undefined, href: e.href, icon: e.icon };
        return go(e.href, recent);
      }
      rememberTerm();
      close();
      switch (e.run) {
        case "theme": {
          const next = !isDark();
          changeLook(next ? "dark" : "light", () => setDark(next));
          sounds.tick();
          toast.success(next ? "Dark mode on" : "Dark mode off");
          return;
        }
        case "sounds": {
          const next = !soundsEnabled();
          setSoundsEnabled(next);
          startTransition(async () => {
            const res = await setSounds(next);
            if (res?.error) {
              setSoundsEnabled(!next);
              toast.error(res.error);
            } else toast.success(next ? "Sounds on" : "Sounds off");
          });
          return;
        }
        case "whatsNew":
          openWhatsNew();
          return;
        case "tour":
          startTutorial();
          router.push("/dashboard");
          return;
        case "copyLink":
          navigator.clipboard?.writeText(window.location.href).then(
            () => toast.success("Link copied"),
            () => toast.error("Couldn't copy the link")
          );
          return;
        case "sync":
          if (!currentTeamId) return;
          startTransition(async () => {
            try {
              const r = await syncAnalyticsNow(currentTeamId);
              if (r.error !== undefined) toast.error(r.error);
              else toast.success(r.summary);
            } catch {
              toast.error("Couldn't start the sync. Check your connection and try again.");
            }
          });
          return;
        case "logout":
          void confirm(LOGOUT_CONFIRM).then((ok) => {
            if (ok) startTransition(() => signOut());
          });
          return;
      }
    },
    [close, confirm, currentTeamId, go, rememberTerm, router, toast]
  );

  const canInviteAnyone = data.master_teams.length > 0 || search.data.master_teams.length > 0;
  const helpers: BuildHelpers = useMemo(
    () => ({ term: text, currentTeamId, canInviteAnyone, go, goInTeam, switchTo, runEntry, invite: setInvitee }),
    [text, currentTeamId, canInviteAnyone, go, goInTeam, switchTo, runEntry]
  );

  // On a video's pages: that video's script, review and studio are one step away.
  const here = useMemo(() => {
    const m = /^\/(videos|shorts)\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname ?? "");
    return m ? { kind: m[1] === "videos" ? ("long" as const) : ("short" as const), id: m[2] } : null;
  }, [pathname]);
  // Everything in the app you could open or do (who you are decides).
  const catalog = useMemo(
    () =>
      buildCatalog({
        roles,
        developer,
        hasTeam: !!currentTeamId,
        profileHref: profileHref({ username, userId }),
        dark,
        sounds: soundsOn,
        here,
      }).filter((e) => !e.id.startsWith("here.") || e.href?.split("?")[0] !== pathname || e.href?.includes("?")),
    [roles, developer, currentTeamId, username, userId, dark, soundsOn, here, pathname]
  );
  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);

  // ---- What's shown -------------------------------------------------------------
  const number = prefix.number;
  const ranked = useMemo(
    () => (typed && !number ? rank(text, catalog, prepared, { boost: (e) => e.boost ?? 0 }).slice(0, 20) : []),
    [typed, number, text, catalog]
  );
  const date = useMemo(() => {
    if (!typed || number || !today) return null;
    const hit = parseDate(text, today);
    if (!hit) return null;
    // Below a name that starts the same ("March update"); "may" alone, below most things.
    return { hit, strength: text.replace(/[^a-z]/gi, "").length >= 4 ? 0.75 : 0.45 };
  }, [typed, number, text, today]);

  const results = useMemo(
    () =>
      typed
        ? resultItems(helpers, data, activeFilter === "all" || activeFilter === "videos" ? videos.items : [], ranked, date, activeFilter === "videos" ? 20 : 8)
        : [],
    [typed, helpers, data, videos.items, ranked, date, activeFilter]
  );

  const emptyItems = useMemo(() => {
    if (typed) return [] as Item[];
    if (activeFilter === "app") return catalog.map((e) => entryItem(helpers, e, 0, `area:${areaOf(e)}`));
    // A filter with nothing typed: what you opened lately of that kind.
    if (activeFilter !== "all") {
      const kinds = RECENT_KINDS[activeFilter] ?? [];
      return recents.filter((r) => kinds.includes(r.kind)).map((r) => recentItem(helpers, r));
    }
    // Where you are first: this video's other pages.
    const list: Item[] = catalog.filter((e) => e.id.startsWith("here.")).map((e) => ({ ...entryItem(helpers, e, 0, "here"), subtitle: undefined }));
    recents.forEach((r) => {
      // A remembered page runs like the page itself (a setting's glow, a team switch).
      const e = r.kind === "page" ? byId.get(r.id) : undefined;
      list.push(recentItem(helpers, r, e ? () => runEntry(e) : undefined));
    });
    SUGGESTED.forEach((id) => {
      const e = byId.get(id);
      if (e) list.push(entryItem(helpers, e, 0, "suggested"));
    });
    GOTO.forEach((id) => {
      const e = byId.get(id);
      if (e) list.push(entryItem(helpers, e, 0, "goto"));
    });
    teams.filter((t) => t.id !== currentTeamId).forEach((t) => list.push(switchItem(helpers, t)));
    return list;
  }, [typed, activeFilter, catalog, helpers, recents, byId, runEntry, teams, currentTeamId]);

  const source = typed ? results : emptyItems;
  const allowed = FILTERS.find((f) => f.id === activeFilter)!.sections;
  const sectionOrder: SectionId[] = typed
    ? orderSections(results, allowed)
    : activeFilter === "app"
      ? [...AREAS, ...new Set(catalog.map(areaOf))].filter((a, i, all) => all.indexOf(a) === i).map((a) => `area:${a}` as SectionId)
      : ["here", "recent", "suggested", "goto", "switch"];

  /** The database sent as many as it was asked for: there may be more. */
  const full = useCallback(
    (s: SectionId) => {
      if (s === "analytics") return videos.items.length > (LIMIT_ALL.analytics ?? 4);
      const key = RPC_KEY[s];
      return !!key && Array.isArray(data[key]) && (data[key] as unknown[]).length >= limit;
    },
    [data, limit, videos.items.length]
  );

  const sections: { id: SectionId; items: { item: Item; index: number }[]; more: boolean }[] = [];
  const items: Item[] = [];
  for (const s of sectionOrder) {
    const all = source.filter((i) => i.section === s);
    // Best first inside each list too (the order among equals stays).
    if (typed) all.sort((a, b) => b.strength - a.strength);
    if (!all.length) continue;
    const cap = typed && activeFilter === "all" ? (LIMIT_ALL[s] ?? all.length) : all.length;
    const list = all.slice(0, cap);
    sections.push({
      id: s,
      items: list.map((item) => ({ item, index: items.push(item) - 1 })),
      more: typed && activeFilter === "all" && (all.length > cap || full(s)),
    });
  }

  // Each filter's count, for the chips.
  const counts = useMemo(() => {
    const out = {} as Record<FilterId, { n: number; plus: boolean }>;
    for (const f of FILTERS) {
      const inIt = f.id === "all" ? results : results.filter((i) => f.sections.includes(i.section));
      out[f.id] = { n: inIt.length, plus: f.id !== "all" && f.sections.some((s) => full(s)) };
    }
    return out;
  }, [results, full]);

  // New results → start from the top.
  useEffect(() => setHighlighted(0), [text, activeFilter, open]);
  const safeHighlighted = Math.min(highlighted, Math.max(0, items.length - 1));

  // Keep the highlighted row visible; warm up its page so Enter is instant.
  const highlightedHref = items[safeHighlighted]?.href;
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${safeHighlighted}"]`);
    el?.scrollIntoView({ block: "nearest" });
    if (highlightedHref && open) router.prefetch(highlightedHref);
  }, [safeHighlighted, highlightedHref, open, router]);

  function pickFilter(id: FilterId) {
    setFilter(id);
    // ">" or "@" typed in front: picking another filter takes it away.
    if (prefix.filter && prefix.filter !== id) setQuery(prefix.text);
    setHighlighted(0);
    inputRef.current?.focus();
  }
  function cycleFilter(step: number) {
    const i = FILTERS.findIndex((f) => f.id === activeFilter);
    pickFilter(FILTERS[(i + step + FILTERS.length) % FILTERS.length].id);
  }
  function tryText(t: string) {
    setQuery(t);
    inputRef.current?.focus();
  }
  function openInTab(item: Item | undefined) {
    // The app's own pages only (1.31.15: every result is one; nothing else is opened from here).
    if (!item?.href || !/^\/(?![/\\])/.test(item.href)) return false;
    window.open(item.href, "_blank", "noopener");
    return true;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (invitee) {
        setInvitee(null);
        inputRef.current?.focus();
      } else close();
      return;
    }

    if (invitee) {
      if (subKeyHandler.current?.(e)) {
        e.preventDefault();
        return;
      }
      // Any other letter: go back to searching with it.
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
        setInvitee(null);
        inputRef.current?.focus();
      }
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      setHighlighted((i) => {
        const cur = Math.min(i, items.length - 1);
        return e.key === "ArrowDown" ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
      });
    } else if (e.key === "Enter") {
      if (e.target instanceof HTMLButtonElement) return; // let the button act
      e.preventDefault();
      const item = items[safeHighlighted];
      if ((e.metaKey || e.ctrlKey) && openInTab(item)) return;
      item?.run();
    } else if (e.key === "Tab") {
      // Tab and Shift+Tab: the next or previous filter (focus stays in the box).
      e.preventDefault();
      cycleFilter(e.shiftKey ? -1 : 1);
    } else if (e.key === "ArrowRight" && (e.target as HTMLInputElement).selectionStart === query.length) {
      const person = items[safeHighlighted]?.person;
      if (person && canInviteAnyone && !person.is_self) {
        e.preventDefault();
        setInvitee(person);
      }
    }
  }

  const busy = wantsRpc && hasQuery && (loading || videos.loading);
  const nothingFound = typed && !busy && !(wantsRpc && error && hasQuery) && items.length === 0;
  const highlightedPerson = items[safeHighlighted]?.person;
  const filterMeta = FILTERS.find((f) => f.id === activeFilter)!;

  return (
    <>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex sm:items-start sm:justify-center sm:pt-[10vh] sm:px-4" onKeyDown={onKeyDown}>
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-[fadein_.12s_ease]" onClick={close} aria-hidden />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              className="glass-pane glass-lift relative w-full h-full sm:h-auto sm:max-h-[min(680px,80vh)] sm:max-w-[680px] bg-surface sm:rounded-2xl sm:border sm:border-line/10 shadow-2xl flex flex-col overflow-hidden animate-[modalin_.14s_ease]"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
              {/* Input row */}
              <div className="flex items-center gap-2.5 px-4 h-14 flex-shrink-0">
                <SearchIcon className="w-[18px] h-[18px] text-ink-faint flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (invitee) setInvitee(null);
                  }}
                  placeholder={wide ? "Search everything: videos, scripts, people, settings…" : "Search everything…"}
                  className="flex-1 min-w-0 bg-transparent text-[16px] sm:text-[15px] outline-none placeholder:text-ink-faint"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="global-search-results"
                  aria-activedescendant={items[safeHighlighted] ? `gs-item-${safeHighlighted}` : undefined}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                />
                {busy && <span aria-hidden className="w-4 h-4 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin flex-shrink-0" />}
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setInvitee(null);
                      inputRef.current?.focus();
                    }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
                    aria-label="Clear search"
                  >
                    <CloseIcon className="w-3.5 h-3.5" />
                  </button>
                )}
                <button type="button" onClick={close} className="sm:hidden text-[14px] font-semibold text-amber pl-1">
                  Cancel
                </button>
                <kbd className="hidden sm:inline font-mono text-[10.5px] font-semibold rounded-md border border-line/15 px-1.5 py-0.5 text-ink-faint">Esc</kbd>
              </div>

              {/* Filters: what kind of thing to look for */}
              {!invitee && (
                <div className="border-b border-line/10 flex-shrink-0">
                <div
                  className="flex items-center gap-1.5 px-3 pb-2.5 overflow-x-auto no-scrollbar [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none]"
                  role="toolbar"
                  aria-label="Look for"
                >
                  {FILTERS.map((f) => {
                    const on = f.id === activeFilter;
                    const c = counts[f.id];
                    const dim = typed && !on && f.id !== "all" && c.n === 0;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        tabIndex={-1}
                        aria-pressed={on}
                        onClick={() => pickFilter(f.id)}
                        className={`h-7 px-2.5 rounded-lg text-[12.5px] font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors flex-shrink-0 ${
                          on ? "bg-ink text-paper" : dim ? "text-ink-faint/70 hover:text-ink-soft" : "text-ink-soft hover:text-ink hover:bg-surface-2"
                        }`}
                      >
                        {f.label}
                        {typed && f.id !== "all" && c.n > 0 && (
                          <span className={`text-[10.5px] tabular-nums font-bold ${on ? "text-paper/70" : "text-ink-faint"}`}>
                            {c.n}
                            {c.plus ? "+" : ""}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                </div>
              )}

              {/* Body */}
              <div ref={listRef} id="global-search-results" role="listbox" aria-label="Results" className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll">
                {invitee ? (
                  <InvitePanel
                    person={invitee}
                    masterTeams={search.data.master_teams}
                    registerKeyHandler={registerKeyHandler}
                    onBack={() => {
                      setInvitee(null);
                      inputRef.current?.focus();
                    }}
                    onSent={(teamId) => {
                      patchPerson(invitee.id, (p) => ({ ...p, invited_to: [...p.invited_to, teamId] }));
                      setInvitee(null);
                      inputRef.current?.focus();
                    }}
                  />
                ) : wantsRpc && error && hasQuery && !items.length ? (
                  <p className="px-5 py-12 text-center text-[13px] text-ink-faint">Search isn&rsquo;t available right now. Check your connection and try again.</p>
                ) : nothingFound ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-[14px] font-semibold mb-1">
                      {filterMeta.none} for &ldquo;{text}&rdquo;
                    </p>
                    <p className="text-[12.5px] text-ink-faint">Try fewer words, or another spelling.</p>
                    {activeFilter !== "all" && counts.all.n > 0 && (
                      <button type="button" onClick={() => pickFilter("all")} className="mt-3 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
                        Look everywhere ({counts.all.n})
                      </button>
                    )}
                  </div>
                ) : !typed && activeFilter !== "all" && activeFilter !== "app" && !items.length ? (
                  <p className="px-6 py-12 text-center text-[13px] text-ink-soft max-w-sm mx-auto">{filterMeta.empty}</p>
                ) : (
                  <div className="p-2 pb-3">
                    {/* Nothing remembered yet: what you can do here, first. */}
                    {!typed && activeFilter === "all" && !recents.length && !terms.length && <Tips onTry={tryText} />}
                    {/* What you searched for lately. */}
                    {!typed && activeFilter === "all" && terms.length > 0 && (
                      <div className="px-2.5 pt-2 pb-1.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Recent searches</span>
                          <ClearButton
                            onClear={() => {
                              clearRecents(userId);
                              setRecents([]);
                              setTerms([]);
                              inputRef.current?.focus();
                            }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {terms.map((t) => (
                            <button
                              key={t}
                              type="button"
                              tabIndex={-1}
                              onClick={() => {
                                setQuery(t);
                                inputRef.current?.focus();
                              }}
                              className="inline-flex items-center gap-1.5 h-7 rounded-lg border border-line/15 px-2.5 text-[12.5px] text-ink-soft hover:text-ink hover:border-line/30 max-w-[14rem]"
                            >
                              <SearchIcon className="w-3 h-3 flex-shrink-0 text-ink-faint" />
                              <span className="truncate">{t}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {sections.map((section) => {
                      const name = section.id === "here" ? (here?.kind === "short" ? "This short" : "This video") : (SECTION_TITLE[section.id] ?? section.id.replace(/^area:/, ""));
                      return (
                      <div key={section.id} className="mb-1" role="group" aria-label={name}>
                        <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1">
                          <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{name}</span>
                          {section.id === "recent" && terms.length === 0 && (
                            <ClearButton
                              onClear={() => {
                                clearRecents(userId);
                                setRecents([]);
                                setTerms([]);
                                inputRef.current?.focus();
                              }}
                            />
                          )}
                          {section.more && (
                            <button type="button" tabIndex={-1} onClick={() => pickFilter(filterOf(section.id))} className="text-[11px] font-semibold text-ink-faint hover:text-ink">
                              See all
                            </button>
                          )}
                        </div>
                        {section.items.map(({ item, index }) => (
                          <Row
                            key={item.key}
                            item={item}
                            index={index}
                            active={index === safeHighlighted}
                            onHover={() => highlighted !== index && setHighlighted(index)}
                            onTab={() => openInTab(item)}
                          />
                        ))}
                      </div>
                      );
                    })}

                    {/* Still looking (1.28.0): rows shimmer where the results will be, instead of an empty box. */}
                    {busy && <SearchSkeleton rows={items.length ? 3 : 6} more={items.length > 0} />}

                    {!typed && activeFilter === "all" && (recents.length > 0 || terms.length > 0) && <Tips onTry={tryText} />}
                    {!typed && activeFilter === "app" && <p className="px-2.5 pt-2 pb-1 text-[12px] text-ink-faint">Everything in the app. Type to narrow it down.</p>}
                    {!typed && activeFilter !== "all" && activeFilter !== "app" && <p className="px-2.5 pt-2 pb-1 text-[12px] text-ink-faint">{filterMeta.empty}</p>}
                  </div>
                )}
              </div>

              {/* Keyboard legend (desktop) */}
              <div className="hidden sm:flex items-center gap-4 px-4 h-10 border-t border-line/10 text-[11px] text-ink-faint flex-shrink-0">
                {invitee ? (
                  <>
                    <span>
                      <Kbd>↑</Kbd>
                      <Kbd>↓</Kbd> team
                    </span>
                    <span>
                      <Kbd>1–6</Kbd> roles
                    </span>
                    <span>
                      <Kbd>↵</Kbd> send
                    </span>
                    <span>
                      <Kbd>Esc</Kbd> back
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      <Kbd>↑</Kbd>
                      <Kbd>↓</Kbd> move
                    </span>
                    <span>
                      <Kbd>↵</Kbd> open
                    </span>
                    <span>
                      <Kbd>Tab</Kbd> filters
                    </span>
                    {highlightedPerson && canInviteAnyone && !highlightedPerson.is_self && (
                      <span>
                        <Kbd>→</Kbd> invite
                      </span>
                    )}
                    <span className="ml-auto">
                      <Kbd>Esc</Kbd> close
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/** One result. Ctrl/⌘ or middle click opens a link in a new tab. */
function Row({ item, index, active, onHover, onTab }: { item: Item; index: number; active: boolean; onHover: () => void; onTab: () => boolean }) {
  return (
    <div
      id={`gs-item-${index}`}
      data-index={index}
      role="option"
      aria-selected={active}
      aria-label={item.label}
      onMouseMove={onHover}
      onClick={(e) => {
        if ((e.metaKey || e.ctrlKey) && onTab()) return;
        item.run();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onTab();
        }
      }}
      className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 sm:py-2 cursor-pointer transition-colors ${active ? "bg-surface-2" : ""}`}
    >
      {item.visual}
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold truncate">{item.title}</div>
        {item.subtitle && <div className="text-[11.5px] text-ink-soft truncate mt-0.5">{item.subtitle}</div>}
      </div>
      {item.trailing}
      {active && !item.trailing && <ArrowRightIcon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0 hidden sm:block" />}
    </div>
  );
}

/** What you can type, with a few to try. */
function Tips({ onTry }: { onTry: (t: string) => void }) {
  return (
    <div className="px-2.5 pt-3 pb-1.5 text-[12px] text-ink-faint space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5">Try</span>
        {TRY.map((t) => (
          <button key={t} type="button" tabIndex={-1} onClick={() => onTry(t)} className="h-6 rounded-md bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft hover:text-ink">
            {t}
          </button>
        ))}
      </div>
      <p>
        Type <Kbd>&gt;</Kbd> for actions and pages, <Kbd>@</Kbd> for people. Typos are fine.
      </p>
    </div>
  );
}

function ClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button type="button" tabIndex={-1} onClick={onClear} className="text-[11px] font-semibold text-ink-faint hover:text-ink">
      Clear
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="font-mono text-[10px] font-semibold rounded border border-line/15 px-1 py-[1px] mr-1 text-ink-soft">{children}</kbd>;
}

/** Results on their way: a few shimmering rows the shape of real ones. */
function SearchSkeleton({ rows, more }: { rows: number; more: boolean }) {
  return (
    <div role="status" aria-label="Searching" className="px-1 pt-1">
      <div className="px-2.5 pt-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{more ? "Looking for more" : "Searching"}</div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-2" aria-hidden>
          <span className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
          <span className="flex-1 min-w-0 space-y-1.5">
            <span className="skeleton block h-3 rounded-md" style={{ width: `${[62, 48, 71, 55, 66, 40][i % 6]}%` }} />
            <span className="skeleton block h-2.5 rounded-md" style={{ width: `${[34, 28, 40, 22, 31, 26][i % 6]}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
