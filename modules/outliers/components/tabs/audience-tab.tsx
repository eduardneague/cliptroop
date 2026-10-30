"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Dialog } from "@/components/ui/dialog";
import { CheckIcon, ChevronDownIcon, CloseIcon, PlusIcon, SearchIcon, ShortsIcon, VideoIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import { addChannelsToNiche, nicheFromChannels } from "@/app/(dashboard)/outliers/actions";
import { audienceList, type AudienceSort } from "../../lib/audience";
import { compact } from "../../lib/filters";
import { countryName, langName } from "../../lib/regions";
import type { AudienceChannel, AudienceExample, NicheInfo } from "../../lib/types";
import type { AudienceTabData } from "../../lib/view";
import { BTN, BTN_MAIN, ChannelAvatar, EmptyNote, FIELD, LABEL, Mult, NicheDot, PeopleIcon, SourceNote, Thumb, TimeAgo } from "../bits";
import { ChannelMenu, type MenuItem } from "../card-menu";
import { useOutliers, useOutliersBlocked } from "../context";
import { useShellNav } from "../shell-nav";
import { TrackButton } from "../track-button";
import { Leaves } from "@/components/ui/leaves";

/*
 * Audience (1.29.0): the channels the team's viewers also watch, worked out
 * once a day from where YouTube sends viewers to the team's videos (the
 * videos they watched just before) and what YouTube suggests next to the
 * team's best videos. Add them to a niche (they always count there), or make
 * a niche of just some of them: then only their outliers show.
 *
 * 1.29.11: cleaner cards (what it sent you first, with a bar against the
 * top one, its videos that did it, bigger), an Add button on each card that
 * turns into "In <niche>" (no ticks), a search box and a sort; picking
 * several for a new niche is behind Select.
 */

type Sort = AudienceSort;
const SORTS: { value: Sort; label: string }[] = [
  { value: "views", label: "Most viewers sent" },
  { value: "ours", label: "Next to most of yours" },
  { value: "subs", label: "Biggest channels" },
];

export function AudienceTab({ data }: { data: AudienceTabData }) {
  const ctx = useOutliers();
  const nav = useShellNav();
  const toast = useToast();
  const { blocked } = useOutliersBlocked();
  const { audience } = data;
  const rows = useMemo(() => audience.rows.filter((r) => !blocked.has(r.id)), [audience.rows, blocked]);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const [sort, setSort] = useState<Sort>("views");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [inNiche, setInNiche] = useState<Map<string, Set<string>>>(new Map());
  const [making, setMaking] = useState<string[] | null>(null);
  const own = ctx.niches;
  // Where Add puts a channel: the niche being looked at (one of the team's), or its only one.
  const target = ctx.niche && !ctx.niche.explore ? ctx.niche : own.length === 1 ? own[0] : null;
  const nichesOf = (c: AudienceChannel) => new Set([...c.niches, ...(inNiche.get(c.id) ?? [])]);
  const top = Math.max(1, ...rows.map((r) => r.views));

  const shown = useMemo(() => audienceList(rows, query, sort), [rows, query, sort]);
  // Its place by viewers sent (the list's own order), whatever it's sorted by now.
  const rank = useMemo(() => new Map(rows.map((r, i) => [r.id, i + 1])), [rows]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const addTo = async (n: NicheInfo, ids: string[]): Promise<boolean> => {
    if (!ids.length) return false;
    try {
      const r = await addChannelsToNiche(ctx.teamId, n.id, ids, "audience");
      if (r.error !== undefined) {
        toast.error(r.error);
        return false;
      }
      setInNiche((m) => {
        const next = new Map(m);
        for (const id of ids) next.set(id, new Set([...(next.get(id) ?? []), n.id]));
        return next;
      });
      toast.success(`${ids.length === 1 ? (rows.find((x) => x.id === ids[0])?.title ?? "The channel") : `${ids.length} channels`} added to ${n.name}. ${ids.length === 1 ? "It always counts" : "They always count"} there.`);
      return true;
    } catch {
      toast.error("Couldn't add them. Try again.");
      return false;
    }
  };
  // Picked several: add them all, then back to the plain list.
  const addPicked = async (n: NicheInfo, list: string[]) => {
    if (await addTo(n, list)) {
      setPicked(new Set());
      setSelecting(false);
    }
  };
  const itemsFor = (c: AudienceChannel): MenuItem[] =>
    ctx.canManage
      ? own
          .filter((n) => !nichesOf(c).has(n.id))
          .slice(0, 6)
          .map((n) => ({ label: `Add to ${n.name}`, icon: <PlusIcon className="w-4 h-4" />, onClick: () => void addTo(n, [c.id]), tone: "amber" as const }))
      : [];

  const intro = (
    <div className="mb-5 rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-violet/12 text-violet flex items-center justify-center flex-shrink-0">
        <PeopleIcon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[18px] font-semibold leading-snug">Channels your viewers also watch</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft max-w-3xl">
          From where YouTube sends viewers to your videos: the videos they watched just before yours, and what YouTube suggests next to your best ones. Add them to a niche, or make a niche of just them to see only their outliers.
          {audience.at && (
            <span className="text-ink-faint">
              {" "}
              Updated <TimeAgo iso={audience.at} />.
            </span>
          )}
        </p>
      </div>
      {rows.length > 0 && (
        <button type="button" onClick={() => nav.go({ tab: "search", params: { scope: "audience" } })} className={`${BTN} flex-shrink-0 self-start md:self-auto text-ink`}>
          See their outliers
        </button>
      )}
    </div>
  );

  if (!rows.length) {
    const note = audience.note;
    return (
      <div>
        {intro}
        {note === "no-youtube" || !data.youtube ? (
          <EmptyNote
            title="Connect your YouTube channel first"
            action={
              ctx.isMaster ? (
                <Link href="/team?tab=accounts" className={BTN_MAIN}>
                  Connect it
                </Link>
              ) : undefined
            }
          >
            This list comes from your channel&rsquo;s own numbers on YouTube.{ctx.isMaster ? " Nothing is posted or changed on it." : " Ask a master to connect it in Team → Connected accounts."}
          </EmptyNote>
        ) : note === "no-analytics" ? (
          <EmptyNote
            title="YouTube didn't share where your views come from"
            action={
              ctx.isMaster ? (
                <Link href="/team?tab=accounts" className={BTN}>
                  Connected accounts
                </Link>
              ) : undefined
            }
          >
            Connect the channel again and allow its analytics, then this fills within a day.
          </EmptyNote>
        ) : note === "nothing-yet" ? (
          <EmptyNote title="Not enough views yet">YouTube shows where viewers come from once your videos have a few thousand views. This list fills by itself.</EmptyNote>
        ) : (
          <EmptyNote title="Working it out">This list is worked out once a day from your channel&rsquo;s numbers. It shows here within a day.</EmptyNote>
        )}
      </div>
    );
  }

  const ids = [...picked];
  return (
    <div className={selecting && picked.size ? "pb-24" : undefined}>
      {intro}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[min(100%,16rem)] max-w-xl">
          <span className="sr-only">Find a channel in this list</span>
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-ink-faint pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                e.preventDefault();
                setQ("");
              }
            }}
            placeholder="Search these channels"
            className="w-full rounded-xl border border-line/15 bg-surface pl-10 pr-9 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear the search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
        <div className="w-[13.5rem]">
          <Select value={sort} onChange={(v) => setSort((v as Sort) ?? "views")} options={SORTS} ariaLabel="Sort by" />
        </div>
        {ctx.canManage && (
          <button
            type="button"
            onClick={() => {
              setSelecting((s) => !s);
              setPicked(new Set());
            }}
            aria-pressed={selecting}
            className={`${BTN} !h-10 ${selecting ? "!border-amber/50 !bg-amber/10 !text-ink" : ""}`}
            title="Pick several, then add them to a niche or make a niche of them"
          >
            {selecting ? "Done" : "Select"}
          </button>
        )}
        <span className="ml-auto text-[13px] text-ink-soft tabular-nums" role="status">
          {query.trim() ? (
            <>
              <span className="font-semibold text-ink">{shown.length}</span> of {rows.length}
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">{rows.length}</span> channels
            </>
          )}
        </span>
      </div>
      {selecting && <p className="-mt-2 mb-3 text-[12.5px] text-ink-faint">Tap the channels to pick them.</p>}

      {shown.length ? (
        <ul className="grid gap-3 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
          {shown.map((c) => (
            <AudienceCard
              key={c.id}
              c={c}
              rank={rank.get(c.id) ?? 0}
              share={c.views / top}
              niches={own.filter((n) => nichesOf(c).has(n.id))}
              fresh={inNiche.get(c.id)}
              items={itemsFor(c)}
              selecting={selecting}
              picked={picked.has(c.id)}
              onPick={() => toggle(c.id)}
              add={
                !ctx.canManage
                  ? null
                  : own.length === 0
                    ? { kind: "make", go: () => setMaking([c.id]) }
                    : { kind: "add", target, others: own.filter((n) => !nichesOf(c).has(n.id)), go: (n: NicheInfo) => addTo(n, [c.id]) }
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyNote
          title={`No channel like “${query.trim()}” in this list`}
          action={
            <button type="button" onClick={() => setQ("")} className={BTN}>
              Clear the search
            </button>
          }
        >
          It looks in names, @handles, countries and languages.
        </EmptyNote>
      )}
      <SourceNote className="mt-8" />

      {selecting && picked.size > 0 && (
        <Leaves>
          <div className="fixed inset-x-0 z-[30] flex justify-center px-3 pointer-events-none bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] md:bottom-6">
            <div className="pointer-events-auto glass-pane rounded-2xl border border-line/15 bg-surface shadow-[0_18px_50px_-18px_rgb(0_0_0/0.55)] px-2.5 py-2 flex items-center gap-2 flex-wrap justify-center pop-modal" role="region" aria-label="Picked channels">
              <span className="text-[13px] font-semibold px-1.5 tabular-nums">{picked.size} picked</span>
              {own.length > 0 && <AddToNiche niches={own} onPick={(n) => void addPicked(n, ids)} />}
              <button type="button" onClick={() => setMaking(ids)} className={BTN_MAIN}>
                Make a niche of {picked.size === 1 ? "it" : "these"}
              </button>
              <button type="button" onClick={() => setPicked(new Set())} className={BTN}>
                Clear
              </button>
            </div>
          </div>
        </Leaves>
      )}
      <MakeNicheDialog
        open={making !== null}
        onClose={() => setMaking(null)}
        ids={making ?? []}
        onMade={(id) => {
          setSelecting(false);
          setPicked(new Set());
          nav.go({ tab: "home", niche: id });
        }}
      />
    </div>
  );
}

type AddAction = { kind: "make"; go: () => void } | { kind: "add"; target: NicheInfo | null; others: NicheInfo[]; go: (n: NicheInfo) => Promise<boolean> };

function AudienceCard({
  c,
  rank,
  share,
  niches,
  fresh,
  items,
  selecting,
  picked,
  onPick,
  add,
}: {
  c: AudienceChannel;
  rank: number;
  share: number;
  niches: NicheInfo[];
  /** The niches it was added to just now (their chips pop in). */
  fresh?: Set<string>;
  items: MenuItem[];
  selecting: boolean;
  picked: boolean;
  onPick: () => void;
  add: AddAction | null;
}) {
  const ctx = useOutliers();
  const short = ctx.kind === "short";
  const where = [c.handle, countryName(c.country) || null, c.lang && c.lang !== "en" ? langName(c.lang) : null, c.subs !== null ? `${compact(c.subs)} subscribers` : null].filter(Boolean).join(" · ");
  const usual = short ? c.shortMedian : c.longMedian;
  return (
    <li
      className={`group relative flex flex-col rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow] ${picked ? "border-amber/60 ring-2 ring-amber/35" : "border-line/10 hover:border-line/25 hover:shadow-[0_12px_30px_-20px_rgb(0_0_0/0.45)]"} ${selecting ? "cursor-pointer select-none" : ""}`}
    >
      {/* While picking, the whole card is the button (and its links wait). */}
      {selecting && <button type="button" onClick={onPick} aria-pressed={picked} aria-label={`${picked ? "Picked" : "Pick"}: ${c.title}`} className="absolute inset-0 z-[2] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber" />}

      <div className="flex items-start gap-3">
        <span className="relative flex-shrink-0">
          <ChannelAvatar src={c.avatar} title={c.title || "?"} size={48} />
          {selecting ? (
            <span className={`absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full border-2 border-surface flex items-center justify-center transition-colors ${picked ? "bg-amber text-white" : "bg-surface-2 text-transparent"}`} aria-hidden>
              <CheckIcon className="w-3 h-3" />
            </span>
          ) : (
            rank > 0 &&
            rank <= 99 && (
              <span className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 rounded-full border-2 border-surface bg-ink text-paper text-[10.5px] font-bold leading-none flex items-center justify-center tabular-nums" title={`Number ${rank} for viewers sent`}>
                {rank}
              </span>
            )
          )}
        </span>
        <button type="button" onClick={() => ctx.openChannel(c.id, c)} className="min-w-0 flex-1 text-left" tabIndex={selecting ? -1 : 0}>
          <span className="block text-[15px] font-semibold leading-snug truncate hover:underline decoration-line/40 underline-offset-2">{c.title || "A channel"}</span>
          <span className="mt-0.5 block text-[12px] text-ink-faint truncate">{where || "On YouTube"}</span>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0 -mr-1">
          <TrackButton channelId={c.id} label={false} size="sm" />
          <ChannelMenu c={c} items={items} />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-x-5 gap-y-1 flex-wrap">
          <span title="Views YouTube sent your videos from this channel's (last 90 days, as far as YouTube says)">
            <span className="font-display text-[24px] leading-none font-semibold tabular-nums">{c.views ? compact(c.views) : "A few"}</span>
            <span className="ml-1.5 text-[12px] text-ink-soft">views sent you</span>
          </span>
          <span className="text-[12.5px] text-ink-soft" title="How many of your videos it sent viewers to">
            <span className="font-semibold text-ink tabular-nums">{c.ours}</span> of your videos
          </span>
          {usual !== null && (
            <span className="text-[12.5px] text-ink-soft" title={`Views on its usual ${short ? "Short" : "video"} (the middle of its last ones)`}>
              <span className="font-semibold text-ink tabular-nums">{compact(usual)}</span> views a {short ? "Short" : "video"}
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-ink/[0.07] overflow-hidden" aria-hidden>
          <div className="aud-bar h-full rounded-full bg-violet/70" style={{ width: `${Math.max(3, Math.min(100, share * 100))}%` }} />
        </div>
      </div>

      <AudienceVideos c={c} selecting={selecting} />

      <div className="mt-auto pt-4 flex items-center gap-2 flex-wrap">
        {niches.map((n) => (
          <span key={n.id} className={`inline-flex items-center gap-1.5 rounded-lg bg-green/10 text-green px-2.5 h-8 text-[12.5px] font-semibold ${fresh?.has(n.id) ? "aud-pop" : ""}`}>
            <CheckIcon className="w-3.5 h-3.5" />
            <NicheDot color={n.color} className="w-2 h-2" />
            In {n.name}
          </span>
        ))}
        <span className="flex-1" />
        {add && !selecting && <AddButton c={c} add={add} niches={niches} />}
      </div>
    </li>
  );
}

/**
 * The channel's videos on its card (1.43.0, the owner: "i dont just want to see long videos as examples from each
 * channel, id like to see shorts as well and more video examples in there, not just 1 or two, have like 5 or 6 per
 * channel"): its best long videos and Shorts (0122), each in its own shape, the kind being looked at first; the ones
 * that sent your videos viewers marked. Three long ones and four Shorts when it has both, more of the one it has.
 * Before 0122: the videos that sent viewers, as before.
 */
function AudienceVideos({ c, selecting }: { c: AudienceChannel; selecting: boolean }) {
  const ctx = useOutliers();
  const ex: AudienceExample[] = c.examples?.length ? c.examples : c.top.map((id) => ({ id, kind: "long", title: "", views: null, score: null, at: null, sent: true }));
  const longs = ex.filter((x) => x.kind === "long");
  const shorts = ex.filter((x) => x.kind === "short");
  const both = longs.length > 0 && shorts.length > 0;
  const groups: { kind: "long" | "short"; list: AudienceExample[] }[] = [
    { kind: "long" as const, list: longs.slice(0, both ? 3 : 6) },
    { kind: "short" as const, list: shorts.slice(0, both ? 4 : 8) },
  ].filter((g) => g.list.length);
  if (ctx.kind === "short") groups.reverse();
  if (!groups.length) return null;
  return (
    <div className="mt-4 space-y-3">
      {groups.map((g) => (
        <div key={g.kind} aria-label={g.kind === "short" ? "Its Shorts" : "Its long videos"}>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {g.kind === "short" ? <ShortsIcon className="w-3.5 h-3.5" /> : <VideoIcon className="w-3.5 h-3.5" />}
            {g.kind === "short" ? "Shorts" : "Videos"}
          </p>
          <div className={`grid gap-2 ${g.kind === "short" ? "grid-cols-4" : "grid-cols-3"}`}>
            {g.list.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => ctx.openVideo(x.id)}
                tabIndex={selecting ? -1 : 0}
                title={x.title ? `${x.title}${x.sent ? " · sent your videos viewers" : ""}` : "Open this video"}
                aria-label={x.title ? `Open “${x.title}”` : "Open this video"}
                className={`aud-video group/ex relative rounded-lg overflow-hidden bg-surface-2 ring-1 ring-line/10 hover:ring-line/40 transition-shadow ${g.kind === "short" ? "aspect-[9/16]" : "aspect-video"}`}
              >
                <Thumb id={x.id} kind={g.kind} sizes={g.kind === "short" ? "110px" : "(min-width: 1536px) 140px, (min-width: 1024px) 160px, 30vw"} />
                <span className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" aria-hidden />
                {x.score !== null && <Mult score={x.score} size="sm" on className="absolute top-1 left-1 origin-top-left scale-[0.82]" />}
                {x.views !== null && <span className="absolute left-1.5 bottom-1 text-[10.5px] font-semibold text-white tabular-nums drop-shadow">{compact(x.views)}</span>}
                {x.sent && (
                  <span className="absolute right-1 bottom-1 w-[18px] h-[18px] rounded-full bg-violet text-white flex items-center justify-center shadow" aria-hidden>
                    <PeopleIcon className="w-2.5 h-2.5" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Add a channel to a niche: straight to the niche being looked at (or the
 * team's only one), with a menu for the others; it turns into "In <niche>"
 * on the card. A team without a niche makes one of it.
 */
function AddButton({ c, add, niches }: { c: AudienceChannel; add: AddAction; niches: NicheInfo[] }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const base = "aud-add inline-flex items-center gap-1.5 rounded-lg h-8 text-[12.5px] font-semibold whitespace-nowrap transition-[background-color,filter,opacity] disabled:opacity-60";
  if (add.kind === "make")
    return (
      <button type="button" onClick={add.go} className={`${base} px-3 bg-amber text-white hover:brightness-110`} title={`Make a niche of ${c.title}: only its outliers show there`}>
        <PlusIcon className="w-3.5 h-3.5 aud-plus" />
        Make a niche
      </button>
    );
  const go = async (n: NicheInfo) => {
    setOpen(false);
    if (busy) return;
    setBusy(true);
    try {
      await add.go(n);
    } finally {
      setBusy(false);
    }
  };
  const main = add.target && add.others.some((n) => n.id === add.target!.id) ? add.target : null;
  const rest = add.others.filter((n) => n.id !== main?.id);
  if (!main && !rest.length) return null;
  const label = busy ? "Adding…" : main ? `Add to ${main.name}` : niches.length ? "Add to another niche" : "Add to a niche";
  return (
    <>
      <span className="inline-flex rounded-lg overflow-hidden shadow-[0_6px_16px_-10px_rgb(var(--amber)/0.9)]">
        <button
          ref={main ? undefined : anchor}
          type="button"
          disabled={busy}
          onClick={() => (main ? void go(main) : setOpen((o) => !o))}
          aria-haspopup={main ? undefined : "menu"}
          aria-expanded={main ? undefined : open}
          title={main ? `Add ${c.title} to ${main.name}: it always counts there` : `Add ${c.title} to one of your niches`}
          className={`${base} pl-2.5 ${main && rest.length ? "pr-2.5 rounded-none" : "pr-3"} bg-amber text-white hover:brightness-110`}
        >
          {busy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden /> : <PlusIcon className="w-3.5 h-3.5 aud-plus" />}
          <span className="max-w-[11rem] truncate">{label}</span>
          {!main && <ChevronDownIcon className="w-3.5 h-3.5 -mr-0.5 opacity-80" />}
        </button>
        {main && rest.length > 0 && (
          <button ref={anchor} type="button" disabled={busy} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Add to another niche" title="Add to another niche" className={`${base} rounded-none w-7 justify-center border-l border-white/25 bg-amber text-white hover:brightness-110`}>
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={anchor} width={250} label="Add to a niche">
        <div className="p-1.5">
          <p className="px-3 pt-1 pb-1.5 text-[11.5px] font-semibold text-ink-faint">Add {c.title || "it"} to</p>
          {(main ? rest : add.others).map((n) => (
            <button key={n.id} type="button" role="menuitem" onClick={() => void go(n)} className="w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-left text-[13.5px] hover:bg-surface-2">
              <NicheDot color={n.color} />
              <span className="flex-1 truncate">{n.name}</span>
              <PlusIcon className="w-3.5 h-3.5 text-ink-faint" />
            </button>
          ))}
        </div>
      </AnchoredMenu>
    </>
  );
}

function AddToNiche({ niches, onPick }: { niches: NicheInfo[]; onPick: (n: NicheInfo) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={`${BTN} text-ink`}>
        Add to a niche
        <ChevronDownIcon className="w-4 h-4 text-ink-faint" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={anchor} width={260} label="Niches">
        <div className="p-1.5">
          {niches.map((n) => (
            <button
              key={n.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(n);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-left text-[13.5px] hover:bg-surface-2"
            >
              <NicheDot color={n.color} />
              <span className="flex-1 truncate">{n.name}</span>
            </button>
          ))}
        </div>
      </AnchoredMenu>
    </>
  );
}

function MakeNicheDialog({ open, onClose, ids, onMade }: { open: boolean; onClose: () => void; ids: string[]; onMade: (id: string) => void }) {
  const ctx = useOutliers();
  const toast = useToast();
  const [name, setName] = useState("Channels my viewers watch");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const r = await nicheFromChannels(ctx.teamId, name.trim(), ids);
      if (r.error !== undefined) return toast.error(r.error);
      toast.success(`${name.trim()} is ready. Their videos are read now.`);
      onClose();
      onMade(r.id);
    } catch {
      toast.error("Couldn't make the niche. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={ids.length === 1 ? "Make a niche of it" : "Make a niche of these"}
      description={`A niche of just ${ids.length === 1 ? "this channel" : `these ${ids.length} channels`}: only their outliers show in it. You can add channels or keywords to it later.`}
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy || !name.trim()} className={BTN_MAIN}>
            {busy ? "Making it…" : "Make the niche"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className={LABEL}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={FIELD} data-autofocus />
        </label>
      </form>
    </Dialog>
  );
}
