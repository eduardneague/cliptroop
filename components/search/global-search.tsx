"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { switchTeam } from "@/app/(dashboard)/actions";
import { colorForId, displayName } from "@/lib/avatar";
import { profileHref } from "@/lib/profile-link";
import type { TeamSummary } from "@/lib/teams";
import { STAGE_LABELS, stageColor } from "@/modules/long-videos/lib/stages";
import { SHORT_STAGE_COLOR, SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";
import { formatShortDate } from "@/modules/short-videos/lib/dates";
import {
  ArrowRightIcon,
  CloseIcon,
  HomeIcon,
  PlusIcon,
  ShortsIcon,
  UserIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
  VideoIcon,
} from "@/components/ui/icons";
import { useGlobalSearch } from "./use-global-search";
import { clearRecents, pushRecent, readRecents } from "./recents";
import { Highlight } from "./highlight";
import { InvitePanel } from "./invite-panel";
import { PersonAvatar, ProjectThumb, ShortThumb, TeamBadge } from "./visuals";
import type { PersonResult, RecentItem } from "./types";
import { startNavProgress } from "@/components/ui/nav-progress";

const THUMB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;

type Item = {
  key: string;
  section: string;
  visual: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Plain text for screen readers. */
  label: string;
  href?: string;
  run: () => void;
  person?: PersonResult;
};

type QuickAction = { key: string; label: string; keywords: string; href: string; icon: React.ReactNode };

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * The search bar in the header.
 *
 * Opens with a click, Ctrl/⌘+K, or "/" — a centered command palette on
 * desktop, a full-screen sheet on phones. Finds projects (with thumbnail +
 * team), people (with "Invite to…" for Masters) and teams, plus quick
 * navigation and recent picks when the box is empty.
 *
 * Keyboard: ↑/↓ move · Enter opens · Tab or → on a person opens Invite ·
 * Esc closes (or goes back from Invite).
 */
export function GlobalSearch({
  userId,
  username,
  teams,
  currentTeamId,
}: {
  userId: string;
  username: string | null;
  teams: TeamSummary[];
  currentTeamId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [invitee, setInvitee] = useState<PersonResult | null>(null);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  // Mac shows ⌘ first, everyone else Ctrl first — both always shown.
  const [isMac, setIsMac] = useState(false);
  const [, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const subKeyHandler = useRef<((e: React.KeyboardEvent) => boolean) | null>(null);
  const registerKeyHandler = useCallback((h: ((e: React.KeyboardEvent) => boolean) | null) => {
    subKeyHandler.current = h;
  }, []);

  // "@edu4rd" should find the username "edu4rd".
  const searchText = query.trim().replace(/^@/, "");
  const { data, loading, error, term, patchPerson } = useGlobalSearch(searchText, open);
  // "#12" / "12" look up entry numbers, so even one digit counts.
  const hasQuery = term.length >= 2 || /^#?\d+$/.test(term);

  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent;
    setIsMac(/mac|iphone|ipad|ipod/i.test(platform));
  }, []);

  const openPalette = useCallback(() => {
    setRecents(readRecents(userId));
    setOpen(true);
  }, [userId]);

  const close = useCallback(() => {
    setOpen(false);
    setInvitee(null);
    setQuery("");
    setHighlighted(0);
  }, []);

  // Global shortcuts: Ctrl/⌘+K anywhere, "/" when not typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing || e.repeat) return;
      // ⌘K (Mac) and Ctrl+K (Windows/Linux — and Mac too) both work.
      // e.code is the PHYSICAL key, so it also works on non-English
      // keyboard layouts where the K key types a different letter.
      const isK = e.code === "KeyK" || e.key.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && isK) {
        e.preventDefault();
        if (open) close();
        else openPalette();
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !open && !isTypingTarget(e.target)) {
        e.preventDefault();
        openPalette();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, openPalette]);

  // Lock page scroll behind the palette; focus the input.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open]);

  const go = useCallback(
    (href: string, recent?: RecentItem) => {
      if (recent) pushRecent(userId, recent);
      close();
      startNavProgress(href);
      router.push(href);
    },
    [close, router, userId]
  );

  const quickActions: QuickAction[] = useMemo(() => {
    const me = profileHref({ username, userId });
    return [
      { key: "new-project", label: "New long-form project", keywords: "create add idea video", href: "/videos/new", icon: <PlusIcon className="w-4 h-4" /> },
      { key: "new-short", label: "New short", keywords: "create add short reel tiktok script", href: "/shorts/new", icon: <PlusIcon className="w-4 h-4" /> },
      { key: "shorts", label: "Short videos", keywords: "shorts reels tiktok posted schedule", href: "/shorts", icon: <ShortsIcon className="w-4 h-4 text-short" /> },
      { key: "videos", label: "Long videos", keywords: "projects pipeline list", href: "/videos", icon: <VideoIcon className="w-4 h-4 text-long" /> },
      { key: "dashboard", label: "Dashboard", keywords: "home", href: "/dashboard", icon: <HomeIcon className="w-4 h-4" /> },
      { key: "team", label: "Team settings", keywords: "members roles invite", href: "/team", icon: <UsersIcon className="w-4 h-4" /> },
      { key: "settings", label: "Account settings", keywords: "profile avatar password privacy logout", href: "/settings", icon: <SettingsIcon className="w-4 h-4" /> },
      ...(me ? [{ key: "profile", label: "My profile", keywords: "me account public", href: me, icon: <UserIcon className="w-4 h-4" /> }] : []),
      { key: "new-team", label: "Create a team", keywords: "new workspace channel", href: "/teams/new", icon: <PlusIcon className="w-4 h-4" /> },
    ];
  }, [username, userId]);

  const canInviteAnyone = data.master_teams.length > 0;

  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    const actionVisual = (icon: React.ReactNode) => (
      <span className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-ink-soft flex-shrink-0">{icon}</span>
    );

    if (!hasQuery) {
      recents.forEach((r) =>
        list.push({
          key: `recent-${r.kind}-${r.id}`,
          section: "Recent",
          label: r.label,
          visual:
            r.kind === "project" ? (
              <ProjectThumb url={r.imageUrl ?? null} color={r.color ?? "#999"} />
            ) : r.kind === "short" ? (
              <ShortThumb color={r.color ?? "#999"} />
            ) : r.kind === "team" ? (
              <TeamBadge team={{ name: r.label, color: r.color ?? "#999", logo_url: r.imageUrl ?? null }} />
            ) : (
              <PersonAvatar name={r.label} avatarUrl={r.imageUrl ?? null} color={r.color ?? "#999"} />
            ),
          title: r.label,
          subtitle: r.sublabel,
          href: r.href,
          run: () => go(r.href, r),
        })
      );
      quickActions.forEach((a) =>
        list.push({
          key: `action-${a.key}`,
          section: "Jump to",
          label: a.label,
          visual: actionVisual(a.icon),
          title: a.label,
          href: a.href,
          run: () => go(a.href),
        })
      );
      teams
        .filter((t) => t.id !== currentTeamId)
        .forEach((t) =>
          list.push({
            key: `switch-${t.id}`,
            section: "Switch team",
            label: `Switch to ${t.name}`,
            visual: <TeamBadge team={{ name: t.name, color: t.color, logo_url: t.logoUrl }} />,
            title: t.name,
            subtitle: "Switch workspace",
            run: () => {
              close();
              startTransition(async () => {
                await switchTeam(t.id);
                router.push("/dashboard");
              });
            },
          })
        );
      return list;
    }

    const q = term.toLowerCase();
    quickActions
      .filter((a) => a.label.toLowerCase().includes(q) || a.keywords.includes(q))
      .slice(0, 3)
      .forEach((a) =>
        list.push({
          key: `action-${a.key}`,
          section: "Actions",
          label: a.label,
          visual: actionVisual(a.icon),
          title: <Highlight text={a.label} query={term} />,
          href: a.href,
          run: () => go(a.href),
        })
      );

    data.projects.forEach((p) => {
      const href = `/videos/${p.id}`;
      const thumb = p.thumbnail_path ? THUMB_BASE + p.thumbnail_path : null;
      const c = stageColor(p.stage);
      list.push({
        key: `project-${p.id}`,
        section: "Long videos",
        label: `Long video #${p.entry_number} ${p.title}, ${STAGE_LABELS[p.stage]}, in ${p.team.name}`,
        visual: <ProjectThumb url={thumb} color={c} />,
        title: (
          <>
            <span className="font-mono text-[11.5px] font-semibold text-ink-faint mr-1.5">#{p.entry_number}</span>
            <Highlight text={p.title} query={term} />
          </>
        ),
        subtitle: (
          <span className="flex items-center gap-1.5 min-w-0">
            <TeamBadge team={p.team} size="w-4 h-4 text-[7px] rounded-[4px]" />
            <span className="truncate flex-shrink-0 max-w-[45%]">{p.team.name}</span>
            {p.matched_title && (
              <span className="hidden sm:inline truncate text-ink-faint">
                · also titled &ldquo;<Highlight text={p.matched_title} query={term} />&rdquo;
              </span>
            )}
          </span>
        ),
        trailing: (
          <span
            className="text-[10.5px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
          >
            {STAGE_LABELS[p.stage]}
          </span>
        ),
        href,
        run: () =>
          go(href, {
            kind: "project",
            id: p.id,
            label: `#${p.entry_number} ${p.title}`,
            sublabel: `Long video · ${p.team.name}`,
            href,
            imageUrl: thumb,
            color: c,
          }),
      });
    });

    (data.shorts ?? []).forEach((sh) => {
      const href = `/shorts/${sh.id}`;
      const c = SHORT_STAGE_COLOR[sh.stage];
      const date = formatShortDate(sh.planned_date);
      list.push({
        key: `short-${sh.id}`,
        section: "Short videos",
        label: `Short #${sh.entry_number} ${sh.title}, ${SHORT_STAGE_LABELS[sh.stage]}, in ${sh.team.name}`,
        visual: <ShortThumb color={c} />,
        title: (
          <>
            <span className="font-mono text-[11.5px] font-semibold text-ink-faint mr-1.5">#{sh.entry_number}</span>
            <Highlight text={sh.title} query={term} />
          </>
        ),
        subtitle: (
          <span className="flex items-center gap-1.5 min-w-0">
            <TeamBadge team={sh.team} size="w-4 h-4 text-[7px] rounded-[4px]" />
            <span className="truncate flex-shrink-0 max-w-[45%]">{sh.team.name}</span>
            {date && <span className="truncate text-ink-faint">· {date}</span>}
          </span>
        ),
        trailing: (
          <span className="flex items-center gap-2 flex-shrink-0">
            {sh.posted_count > 0 && sh.stage !== "posted" && (
              <span className="hidden sm:inline text-[10.5px] font-bold text-amber tabular-nums">
                {sh.posted_count}/{sh.platform_count} posted
              </span>
            )}
            <span
              className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
              style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
            >
              {SHORT_STAGE_LABELS[sh.stage]}
            </span>
          </span>
        ),
        href,
        run: () =>
          go(href, {
            kind: "short",
            id: sh.id,
            label: `#${sh.entry_number} ${sh.title}`,
            sublabel: `Short · ${sh.team.name}`,
            href,
            color: c,
          }),
      });
    });

    data.people.forEach((person) => {
      const name = displayName(person.username, person.full_name, person.email_name);
      const href = profileHref({ username: person.username, userId: person.id }) ?? "/dashboard";
      const color = colorForId(person.id);
      const invitable = canInviteAnyone && !person.is_self;
      list.push({
        key: `person-${person.id}`,
        section: "People",
        label: name,
        person,
        visual: <PersonAvatar name={name} avatarUrl={person.avatar_url} color={color} />,
        title: (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">
              <Highlight text={name} query={term} />
            </span>
            {person.is_self && <span className="text-[10.5px] font-semibold text-ink-faint">(you)</span>}
            {person.is_teammate && !person.is_self && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-teal bg-teal/10 px-1.5 py-0.5 rounded">
                Teammate
              </span>
            )}
          </span>
        ),
        subtitle:
          person.username && person.full_name
            ? (
                <span className="truncate">
                  @<Highlight text={person.username} query={term} /> · {person.full_name}
                </span>
              )
            : person.username
              ? <span>@{person.username}</span>
              : undefined,
        trailing: invitable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setInvitee(person);
            }}
            className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border border-line/15 px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft hover:border-amber hover:text-amber transition-colors"
          >
            Invite
            <ArrowRightIcon className="w-3 h-3" />
          </button>
        ) : undefined,
        href,
        run: () =>
          go(href, {
            kind: "person",
            id: person.id,
            label: name,
            sublabel: person.username ? `@${person.username}` : undefined,
            href,
            imageUrl: person.avatar_url,
            color,
          }),
      });
    });

    data.teams.forEach((t) => {
      const isCurrent = t.id === currentTeamId;
      list.push({
        key: `team-${t.id}`,
        section: "Teams",
        label: t.name,
        visual: <TeamBadge team={t} />,
        title: <Highlight text={t.name} query={term} />,
        subtitle: `${t.member_count} member${t.member_count === 1 ? "" : "s"}${t.is_master ? " · you're a Master" : ""}`,
        trailing: (
          <span className="text-[11px] font-semibold text-ink-faint flex-shrink-0">
            {isCurrent ? "Current" : "Switch"}
          </span>
        ),
        run: () => {
          pushRecent(userId, { kind: "team", id: t.id, label: t.name, href: "/dashboard", imageUrl: t.logo_url, color: t.color });
          close();
          startTransition(async () => {
            if (!isCurrent) await switchTeam(t.id);
            router.push("/dashboard");
          });
        },
      });
    });

    return list;
  }, [hasQuery, recents, quickActions, teams, currentTeamId, term, data, canInviteAnyone, go, close, router, userId]);

  // New results → start from the top.
  useEffect(() => setHighlighted(0), [term, open]);

  // Keep the highlighted row visible; warm up its page so Enter is instant.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`);
    el?.scrollIntoView({ block: "nearest" });
    const href = items[highlighted]?.href;
    if (href && open) router.prefetch(href);
  }, [highlighted, items, open, router]);

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
      setHighlighted((i) =>
        e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length
      );
    } else if (e.key === "Enter") {
      if (e.target instanceof HTMLButtonElement) return; // let the button act
      e.preventDefault();
      items[highlighted]?.run();
    } else if (e.key === "Tab" || (e.key === "ArrowRight" && (e.target as HTMLInputElement).selectionStart === query.length)) {
      const person = items[highlighted]?.person;
      if (person && canInviteAnyone && !person.is_self) {
        e.preventDefault();
        setInvitee(person);
      } else if (e.key === "Tab") {
        e.preventDefault(); // keep focus inside the palette
      }
    }
  }

  // Group consecutive items under their section headers.
  const sections: { name: string; items: { item: Item; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = sections[sections.length - 1];
    if (last && last.name === item.section) last.items.push({ item, index });
    else sections.push({ name: item.section, items: [{ item, index }] });
  });

  const nothingFound =
    hasQuery && !loading && !error && items.length === 0;

  return (
    <>
      {/* Desktop trigger */}
      <button
        type="button"
        onClick={openPalette}
        data-tour="search"
        className="hidden md:flex items-center gap-2.5 w-full h-9 rounded-xl border border-line/15 bg-surface/60 px-3 text-[13px] text-ink-faint hover:border-line/30 hover:text-ink-soft transition-colors"
        aria-label="Search"
      >
        <SearchIcon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left truncate">Search videos, shorts, people…</span>
        <span className="flex items-center gap-1 flex-shrink-0" aria-label={isMac ? "Command K or Control K" : "Control K or Command K"}>
          {(isMac ? ["⌘", "Ctrl"] : ["Ctrl", "⌘"]).map((mod, i) => (
            <span key={mod} className="flex items-center gap-1">
              {i > 0 && <span className="text-[10px] text-ink-faint/60">/</span>}
              <kbd className="font-mono text-[10.5px] font-semibold rounded-md border border-line/15 px-1.5 py-0.5 text-ink-faint leading-none min-w-[20px] text-center">
                {mod}
              </kbd>
            </span>
          ))}
          <kbd className="font-mono text-[10.5px] font-semibold rounded-md border border-line/15 px-1.5 py-0.5 text-ink-faint leading-none">
            K
          </kbd>
        </span>
      </button>

      {/* Mobile trigger */}
      <button
        type="button"
        onClick={openPalette}
        data-tour="search"
        className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
        aria-label="Search"
      >
        <SearchIcon className="w-[19px] h-[19px]" />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex sm:items-start sm:justify-center sm:pt-[12vh] sm:px-4"
            onKeyDown={onKeyDown}
          >
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-[fadein_.12s_ease]"
              onClick={close}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              className="relative w-full h-full sm:h-auto sm:max-h-[min(640px,76vh)] sm:max-w-[640px] bg-surface sm:rounded-2xl sm:border sm:border-line/10 shadow-2xl flex flex-col overflow-hidden animate-[modalin_.14s_ease]"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
              {/* Input row */}
              <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line/10 flex-shrink-0">
                <SearchIcon className="w-[18px] h-[18px] text-ink-faint flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (invitee) setInvitee(null);
                  }}
                  placeholder="Search videos, shorts, people, teams… (or #12)"
                  className="flex-1 min-w-0 bg-transparent text-[16px] sm:text-[15px] outline-none placeholder:text-ink-faint"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="global-search-results"
                  aria-activedescendant={items[highlighted] ? `gs-item-${highlighted}` : undefined}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                />
                {loading && hasQuery && (
                  <span
                    aria-hidden
                    className="w-4 h-4 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin flex-shrink-0"
                  />
                )}
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
                <button
                  type="button"
                  onClick={close}
                  className="sm:hidden text-[14px] font-semibold text-amber pl-1"
                >
                  Cancel
                </button>
                <kbd className="hidden sm:inline font-mono text-[10.5px] font-semibold rounded-md border border-line/15 px-1.5 py-0.5 text-ink-faint">
                  Esc
                </kbd>
              </div>

              {/* Body */}
              <div
                ref={listRef}
                id="global-search-results"
                role="listbox"
                className="flex-1 overflow-y-auto overscroll-contain styled-scroll"
              >
                {invitee ? (
                  <InvitePanel
                    person={invitee}
                    masterTeams={data.master_teams}
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
                ) : error ? (
                  <p className="px-5 py-12 text-center text-[13px] text-ink-faint">
                    Search isn&rsquo;t available right now. Check your connection and try again.
                  </p>
                ) : nothingFound ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-[14px] font-semibold mb-1">No matches for &ldquo;{query.trim()}&rdquo;</p>
                    <p className="text-[12.5px] text-ink-faint">
                      Try a project title, a person&rsquo;s name or @username, or a team name.
                    </p>
                  </div>
                ) : (
                  <div className="p-2 pb-4">
                    {sections.map((section) => (
                      <div key={section.name} className="mb-1">
                        <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1">
                          <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                            {section.name}
                          </span>
                          {section.name === "Recent" && (
                            <button
                              type="button"
                              onClick={() => {
                                clearRecents(userId);
                                setRecents([]);
                                inputRef.current?.focus();
                              }}
                              className="text-[11px] font-semibold text-ink-faint hover:text-ink"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {section.items.map(({ item, index }) => {
                          const active = index === highlighted;
                          return (
                            <div
                              key={item.key}
                              id={`gs-item-${index}`}
                              data-index={index}
                              role="option"
                              aria-selected={active}
                              aria-label={item.label}
                              onMouseMove={() => highlighted !== index && setHighlighted(index)}
                              onClick={() => item.run()}
                              className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 sm:py-2 cursor-pointer transition-colors ${
                                active ? "bg-surface-2" : ""
                              }`}
                            >
                              {item.visual}
                              <div className="min-w-0 flex-1">
                                <div className="text-[13.5px] font-semibold truncate">{item.title}</div>
                                {item.subtitle && (
                                  <div className="text-[11.5px] text-ink-soft truncate mt-0.5">{item.subtitle}</div>
                                )}
                              </div>
                              {item.trailing}
                              {active && !item.trailing && (
                                <ArrowRightIcon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0 hidden sm:block" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {!hasQuery && term.length === 1 && (
                      <p className="px-3 py-2 text-[11.5px] text-ink-faint">Keep typing…</p>
                    )}
                  </div>
                )}
              </div>

              {/* Keyboard legend (desktop) */}
              <div className="hidden sm:flex items-center gap-4 px-4 h-10 border-t border-line/10 text-[11px] text-ink-faint flex-shrink-0">
                {invitee ? (
                  <>
                    <span><Kbd>↑</Kbd><Kbd>↓</Kbd> team</span>
                    <span><Kbd>1–6</Kbd> roles</span>
                    <span><Kbd>↵</Kbd> send</span>
                    <span><Kbd>Esc</Kbd> back</span>
                  </>
                ) : (
                  <>
                    <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
                    <span><Kbd>↵</Kbd> open</span>
                    {canInviteAnyone && <span><Kbd>Tab</Kbd> invite person</span>}
                    <span className="ml-auto"><Kbd>Esc</Kbd> close</span>
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-[10px] font-semibold rounded border border-line/15 px-1 py-[1px] mr-1 text-ink-soft">
      {children}
    </kbd>
  );
}
