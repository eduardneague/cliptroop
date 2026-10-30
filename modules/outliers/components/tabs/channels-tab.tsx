"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { CloseIcon, MinusIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { LayoutSwitch, LAYOUTS, useStoredView } from "@/components/ui/table-bits";
import { useToast } from "@/components/ui/toast-provider";
import { addChannelsToNiche, loadChannels, lookUpChannels, setChannelHidden, setNicheOnlyGroup, setTracked as setTrackedAction } from "@/app/(dashboard)/outliers/actions";
import { compact } from "../../lib/filters";
import { countryName, langName } from "../../lib/regions";
import type { ChannelRowData, NicheInfo } from "../../lib/types";
import { CHANNEL_SORTS, type ChannelSort, type ChannelsData, type ChannelsOnly } from "../../lib/view";
import { BTN, BTN_MAIN, ChannelAvatar, EmptyNote, FitChip, Mult, SourceNote, Thumb, TimeAgo, Toggle } from "../bits";
import { ChannelMenu, type MenuItem } from "../card-menu";
import { ChannelFinder, type FoundChannel } from "../channel-finder";
import { useOutliers, useOutliersBlocked } from "../context";
import { useShellNav } from "../shell-nav";
import { TrackButton } from "../track-button";

/*
 * Channels (1.27.0, 1.29.0): a niche is its own channels (picked: they
 * always count) and the channels its keywords find that fit (the language,
 * where they're from, what they post). "Only videos from your channels"
 * leaves the found ones out. Each list says why a channel is there or not;
 * a channel ClipTroop hasn't read yet shows as "Reading" until its videos
 * are in. Finding one is on a button (nothing loads while you type), and a
 * channel that isn't collected yet is looked up on YouTube.
 */

type Look = { q: string; rows: FoundChannel[]; searched: boolean };

export function ChannelsTab({ data, onEditNiche }: { data: ChannelsData; onEditNiche?: (n: NicheInfo) => void }) {
  const ctx = useOutliers();
  const nav = useShellNav();
  const toast = useToast();
  const router = useRouter();
  const { blocked } = useOutliersBlocked();
  const [rows, setRows] = useState(data.rows);
  const [total, setTotal] = useState(data.total);
  const [q, setQ] = useState(data.q);
  const [layout, setLayout] = useStoredView("vp-outliers-channels-layout", LAYOUTS, "table");
  const [more, startMore] = useTransition();
  const [adding, setAdding] = useState(false);
  const [look, setLook] = useState<Look | null>(null);
  const [looking, setLooking] = useState(false);
  const own = ctx.niche && !ctx.niche.explore ? ctx.niche : null;
  const [onlyGroup, setOnlyGroup] = useState(own?.onlyGroup ?? false);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    setRows(data.rows);
    setTotal(data.total);
    setQ(data.q);
  }, [data]);
  useEffect(() => setOnlyGroup(own?.onlyGroup ?? false), [own?.id, own?.onlyGroup]);

  const params = (p: { sort?: ChannelSort; q?: string; only?: ChannelsOnly }) => {
    const sort = p.sort ?? data.sort;
    const only = p.only ?? data.only;
    return { csort: sort === "rate" ? null : sort, cq: (p.q ?? data.q).trim() || null, only: only === "all" ? null : only };
  };
  const go = (p: { sort?: ChannelSort; q?: string; only?: ChannelsOnly }) => nav.go({ tab: "channels", params: params(p) }, { replace: true });
  const search = async (text: string) => {
    const t = text.trim();
    go({ q: t });
    if (t.length < 2) return setLook(null);
    setLooking(true);
    try {
      const r = await lookUpChannels(ctx.teamId, t, false);
      setLook(r.error !== undefined ? null : { q: t, rows: r.rows, searched: r.searched });
    } catch {
      setLook(null);
    } finally {
      setLooking(false);
    }
  };
  const searchYouTube = async () => {
    if (!look || looking) return;
    setLooking(true);
    try {
      const r = await lookUpChannels(ctx.teamId, look.q, true);
      if (r.error !== undefined) return toast.error(r.error);
      setLook((old) => {
        const seen = new Map((old?.rows ?? []).map((x) => [x.id, x]));
        for (const x of r.rows) if (!seen.has(x.id)) seen.set(x.id, x);
        return { q: look.q, rows: [...seen.values()], searched: true };
      });
    } catch {
      toast.error("Couldn't search YouTube. Try again.");
    } finally {
      setLooking(false);
    }
  };
  const clear = () => {
    setQ("");
    setLook(null);
    if (data.q) go({ q: "" });
  };

  const f = { ...(data.q ? { q: data.q } : {}), only: data.only };
  const showMore = () =>
    startMore(async () => {
      try {
        const r = await loadChannels(ctx.teamId, ctx.nicheId, f, data.sort, rows.length);
        if (r.error !== undefined) return toast.error(r.error);
        setRows((old) => {
          const seen = new Set(old.map((x) => x.id));
          return [...old, ...r.rows.filter((x) => !seen.has(x.id))];
        });
        setTotal(r.total);
      } catch {
        toast.error("Couldn't load more. Check your connection and try again.");
      }
    });

  const visible = useMemo(() => rows.filter((r) => !blocked.has(r.id)), [rows, blocked]);
  // Channels being read: the list looks again by itself until their videos are in.
  const reading = visible.some((r) => r.pending);
  useEffect(() => {
    if (!reading) return;
    const looks = [20, 45, 80, 130, 200].map((s) => window.setTimeout(() => router.refresh(), s * 1000));
    return () => looks.forEach((t) => window.clearTimeout(t));
  }, [reading, router]);

  const flipOnly = async (on: boolean) => {
    if (!own || switching) return;
    setSwitching(true);
    setOnlyGroup(on);
    try {
      const r = await setNicheOnlyGroup(ctx.teamId, own.id, on);
      if (r.error !== undefined) {
        setOnlyGroup(!on);
        return toast.error(r.error);
      }
      toast.success(on ? `${own.name} now shows only your channels` : `${own.name} takes found channels again, when they fit`);
    } catch {
      setOnlyGroup(!on);
      toast.error("Couldn't change it. Try again.");
    } finally {
      setSwitching(false);
    }
  };

  // In the niche (one of its own), or taken out of it: changed in place, then read again.
  const addOne = async (c: { id: string; title: string }) => {
    if (!own) return;
    try {
      const r = await addChannelsToNiche(ctx.teamId, own.id, [c.id]);
      if (r.error !== undefined) return toast.error(r.error);
      setRows((old) => old.map((x) => (x.id === c.id ? { ...x, group: true, counted: true, hidden: false, source: "manual" } : x)));
      toast.success(`${c.title || "The channel"} is one of ${own.name}'s channels now`);
    } catch {
      toast.error("Couldn't add it. Try again.");
    }
  };
  const setOut = async (c: ChannelRowData, out: boolean) => {
    if (!own) return;
    try {
      const r = await setChannelHidden(ctx.teamId, own.id, c.id, out);
      if (r.error !== undefined) return toast.error(r.error);
      setRows((old) => (data.only === "hidden" || out ? old.filter((x) => x.id !== c.id) : old));
      setTotal((t) => Math.max(0, t - 1));
      toast.success(out ? `${c.title} is out of ${own.name}` : `${c.title} is back in ${own.name}`);
    } catch {
      toast.error("Couldn't change it. Try again.");
    }
  };
  const itemsFor = (c: ChannelRowData): MenuItem[] => {
    if (!own || !ctx.canManage) return [];
    const list: MenuItem[] = [];
    if (!c.group && !c.hidden) list.push({ label: `Add to ${own.name}`, sub: "One of its own channels: it always counts.", icon: <PlusIcon className="w-4 h-4" />, onClick: () => addOne(c), tone: "amber" });
    if (c.hidden) list.push({ label: `Put back in ${own.name}`, icon: <PlusIcon className="w-4 h-4" />, onClick: () => setOut(c, false) });
    else if (data.only !== "tracked") list.push({ label: `Take out of ${own.name}`, sub: "It stops counting in this niche only.", icon: <MinusIcon className="w-4 h-4" />, onClick: () => setOut(c, true) });
    return list;
  };

  const n = ctx.niche;
  const groupLabel = own || (!n && ctx.niches.length) ? "Your channels" : "Picked";
  const modes: { value: ChannelsOnly; label: string; count?: number; title?: string }[] = [
    { value: "all", label: n ? "In the niche" : "All", title: "The channels whose videos count" },
    { value: "group", label: groupLabel, count: n?.groupN || undefined, title: own ? "The channels you picked: they always count" : "The well-known channels this niche starts from" },
    { value: "found", label: "Found", count: n?.foundN || undefined, title: "Found by the keywords, and they fit" },
    { value: "out", label: "Not a fit", count: n?.outN || undefined, title: "Found by the keywords, but another language, another country, off topic or made for kids" },
    { value: "tracked", label: "Tracked", count: ctx.tracked.size || undefined, title: "Channels your team tracks (alerts when their videos take off)" },
    ...(ctx.canManage && own ? [{ value: "hidden" as const, label: "Removed", title: "Taken out of this niche by your team" }] : []),
  ];
  const rowIds = new Set(rows.map((r) => r.id));
  const extra = look && look.q === data.q ? look.rows.filter((c) => !rowIds.has(c.id) && !blocked.has(c.id)) : [];

  const empty = (() => {
    if (data.q) return { title: `No channel called “${data.q}” here`, body: look && extra.length ? "Other channels by that name are above." : "Try its @handle or a link to it." };
    switch (data.only) {
      case "group":
        return { title: own ? "No channels of your own yet" : "No picked channels yet", body: own ? "Pick the channels this niche is about. They always count, and with “Only videos from your channels” on, nothing else does." : "They're being looked up. This list fills within a few minutes." };
      case "found":
        return { title: "Nothing found by keywords yet", body: own?.onlyGroup ? "This niche shows only your channels, so nothing is searched for it." : "The keywords are searched a few times a day. Channels that fit show here." };
      case "out":
        return { title: "Nothing left out", body: "Channels the keywords find that don't fit (another language, another country, off topic, made for kids) show here, with why." };
      case "tracked":
        return { title: "No tracked channels", body: "Track a channel to hear when one of its videos takes off." };
      case "hidden":
        return { title: "Nothing removed", body: "Channels your team takes out of this niche show here, so you can put them back." };
      default:
        return { title: "No channels here yet", body: own ? "Add the channels this niche is about, or a few keywords. ClipTroop finds more channels that fit." : "Channels come in as this niche is collected." };
    }
  })();

  return (
    <div>
      {own && (
        <div className="mb-5 rounded-2xl border border-line/10 bg-surface p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Toggle
              on={onlyGroup}
              onChange={flipOnly}
              disabled={!ctx.canManage || switching || (!onlyGroup && own.groupN === 0)}
              label="Only videos from your channels"
              title={!ctx.canManage ? "Masters and researchers change this" : !onlyGroup && own.groupN === 0 ? "Add your channels first" : undefined}
            />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">Only videos from your channels</p>
              <p className="text-[12.5px] text-ink-soft">
                {onlyGroup
                  ? `${own.name} shows only the ${own.groupN} channel${own.groupN === 1 ? "" : "s"} you picked. Nothing found by keywords counts.`
                  : own.groupN
                    ? `Your ${own.groupN} channel${own.groupN === 1 ? "" : "s"} always count. Channels found by the keywords count too when they fit.`
                    : "Pick the channels this niche is about: they always count. Channels found by its keywords count too when they fit."}
              </p>
            </div>
          </div>
          {ctx.canManage && (
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {onEditNiche && (
                <button type="button" onClick={() => onEditNiche(own)} className={`${BTN} whitespace-nowrap`} title="Change the languages and countries its creators are from">
                  <span className="sm:hidden">Languages</span>
                  <span className="hidden sm:inline">Languages and countries</span>
                </button>
              )}
              <button type="button" onClick={() => setAdding(true)} className={`${BTN_MAIN} whitespace-nowrap`}>
                <PlusIcon className="w-4 h-4" />
                Add channels
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(q);
          }}
          className="flex items-center gap-2 flex-1 min-w-[min(100%,18rem)] max-w-lg"
        >
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Find a channel</span>
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a channel: name, @handle or link" className="w-full rounded-lg border border-line/15 bg-surface pl-9 pr-9 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber" />
            {(q || data.q) && (
              <button type="button" onClick={clear} aria-label="Clear" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </label>
          <button type="submit" className={`${BTN} text-ink`} disabled={looking}>
            {looking ? "Finding…" : "Search"}
          </button>
        </form>
        <div className="w-[12rem]">
          <Select value={data.sort} onChange={(v) => go({ sort: (v as ChannelSort) ?? "rate" })} options={CHANNEL_SORTS.map((s) => ({ value: s.id, label: s.label }))} ariaLabel="Sort channels" size="bar" />
        </div>
        <LayoutSwitch value={layout} onChange={setLayout} className="hidden sm:inline-flex" />
        {!own && ctx.canManage && (
          <>
            <span className="flex-1" />
            <button type="button" onClick={() => setAdding(true)} className={BTN_MAIN}>
              <PlusIcon className="w-4 h-4" />
              Track a channel
            </button>
          </>
        )}
      </div>
      <div className="mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
        <Segmented ariaLabel="Which channels" size="sm" value={data.only} onChange={(v) => go({ only: v })} options={modes} />
      </div>

      {extra.length > 0 && (
        <section className="mb-6" aria-label="Other channels by that name">
          <p className="mb-2 text-[12.5px] font-semibold text-ink-soft">{own ? `Not in ${own.name} yet` : "More channels"} called &ldquo;{look?.q}&rdquo;</p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {extra.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface px-3 py-2.5">
                <button type="button" onClick={() => ctx.openChannel(c.id, c)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  <ChannelAvatar src={c.avatar} title={c.title} size={38} />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold truncate hover:underline">{c.title}</span>
                    <span className="block text-[11.5px] text-ink-faint truncate">{[c.handle, c.subs !== null ? `${compact(c.subs)} subscribers` : null, countryName(c.country) || null].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
                {own && ctx.canManage && (
                  <button type="button" onClick={() => addOne(c).then(() => setLook((l) => (l ? { ...l, rows: l.rows.filter((x) => x.id !== c.id) } : l)))} className={`${BTN} !h-8 px-2.5 text-[12.5px]`} title={`One of ${own.name}'s channels: it always counts`}>
                    <PlusIcon className="w-3.5 h-3.5" />
                    Add
                  </button>
                )}
                <TrackButton channelId={c.id} label={false} size="sm" />
              </li>
            ))}
          </ul>
          {!look?.searched && (
            <button type="button" onClick={searchYouTube} disabled={looking} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber hover:underline disabled:opacity-60">
              <SearchIcon className="w-3.5 h-3.5" />
              Not the one? Search YouTube for &ldquo;{look?.q}&rdquo;
            </button>
          )}
        </section>
      )}
      {look && look.q === data.q && !extra.length && !visible.length && !look.searched && (
        <p className="mb-4 text-[12.5px] text-ink-soft">
          Not collected yet.{" "}
          <button type="button" onClick={searchYouTube} disabled={looking} className="font-semibold text-amber hover:underline disabled:opacity-60">
            {looking ? "Searching YouTube…" : `Search YouTube for “${look.q}”`}
          </button>
        </p>
      )}

      <p className="mb-3 text-[13px] text-ink-soft" role="status">
        <span className="font-semibold text-ink tabular-nums">{total.toLocaleString("en-US")}</span> channels {n ? (data.only === "tracked" ? "tracked by your team" : `in ${n.name}`) : "in every niche"}
        {reading && <span className="ml-2 text-ink-faint">Reading new ones: scores show within a few minutes.</span>}
        {nav.busy && <span className="ml-2 inline-block w-3.5 h-3.5 align-[-2px] rounded-full border-2 border-amber/30 border-t-amber animate-spin" aria-label="Loading" />}
      </p>

      {visible.length ? (
        <>
          {layout === "table" ? (
            <>
              {/* Phones: cards (a table doesn't fit). */}
              <div className="sm:hidden">
                <ChannelCards rows={visible} showFit={data.only !== "tracked"} itemsFor={itemsFor} />
              </div>
              <div className="hidden sm:block">
                <ChannelTable rows={visible} showFit={data.only !== "tracked"} itemsFor={itemsFor} />
              </div>
            </>
          ) : (
            <ChannelCards rows={visible} showFit={data.only !== "tracked"} itemsFor={itemsFor} />
          )}
          {rows.length < total && (
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={showMore} disabled={more} className={BTN}>
                {more ? "Loading…" : `Show more (${(total - rows.length).toLocaleString("en-US")} left)`}
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyNote
          title={empty.title}
          finding={data.only === "all" && !data.q}
          action={
            ctx.canManage && (data.only === "all" || data.only === "group") && !data.q ? (
              <button type="button" onClick={() => setAdding(true)} className={BTN_MAIN}>
                {own ? "Add channels" : "Track a channel"}
              </button>
            ) : undefined
          }
        >
          {empty.body}
        </EmptyNote>
      )}
      <SourceNote className="mt-8" />
      <AddChannelsDialog open={adding} onClose={() => setAdding(false)} niche={own} have={new Set(rows.filter((r) => r.group).map((r) => r.id))} />
    </div>
  );
}

function Rate({ c }: { c: ChannelRowData }) {
  const rate = c.stored ? c.outliers / c.stored : null;
  if (rate === null) return <span className="text-ink-faint">–</span>;
  return (
    <span className="inline-flex items-center gap-2 w-full" title={`${c.outliers} of ${c.stored} stored videos hit 3×`}>
      <span className="flex-1 h-1.5 rounded-[2px] bg-line/[0.08] overflow-hidden min-w-[3rem]">
        <span className="block h-full rounded-[2px] bg-violet" style={{ width: `${Math.min(100, rate * 250)}%` }} />
      </span>
      <span className="tabular-nums text-[12.5px] w-9 text-right">{Math.round(rate * 100)}%</span>
    </span>
  );
}

/** Under a channel's name: its handle, where it's from, the language it speaks when that's not English. */
function subLine(c: ChannelRowData): string {
  const where = countryName(c.region);
  const lang = c.mainLang && c.mainLang !== "en" ? langName(c.mainLang) : "";
  return [c.handle, where, lang].filter(Boolean).join(" · ");
}

function ChannelTable({ rows, showFit, itemsFor }: { rows: ChannelRowData[]; showFit: boolean; itemsFor: (c: ChannelRowData) => MenuItem[] }) {
  const ctx = useOutliers();
  const th = "px-3 py-2.5 text-left text-[11.5px] font-semibold text-ink-faint whitespace-nowrap";
  const short = ctx.kind === "short";
  return (
    <div className="relative rounded-2xl border border-line/10 bg-surface overflow-x-auto overscroll-x-contain styled-scroll">
      <table className="w-full text-[13px]">
        <thead className="border-b border-line/10">
          <tr>
            <th className={th}>Channel</th>
            {showFit && <th className={th}>In the niche</th>}
            <th className={`${th} text-right`}>Subscribers</th>
            <th className={`${th} text-right`}>Usual views</th>
            <th className={`${th} w-[10rem]`}>Hit 3×</th>
            <th className={`${th} text-right`}>Best</th>
            <th className={`${th} text-right hidden lg:table-cell`}>Uploads a week</th>
            <th className={`${th} text-right hidden xl:table-cell`}>Last upload</th>
            <th className={`${th} text-right hidden 2xl:table-cell`}>Videos</th>
            <th className={`${th} text-right`}>
              <span className="sr-only">Track and more</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/[0.07]">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-surface-2/40">
              <td className="px-3 py-2 min-w-[220px]">
                <button type="button" onClick={() => ctx.openChannel(c.id, c)} className="flex items-center gap-2.5 text-left min-w-0">
                  <ChannelAvatar src={c.avatar} title={c.title || "?"} size={34} />
                  <span className="min-w-0">
                    <span className="block font-semibold truncate max-w-[18rem] hover:underline">{c.title || "A channel"}</span>
                    <span className="block text-[11.5px] text-ink-faint truncate max-w-[18rem]">{subLine(c)}</span>
                  </span>
                </button>
              </td>
              {showFit && (
                <td className="px-3 py-2">
                  <FitChip c={c} />
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums">{c.pending && c.subs === null ? "…" : compact(c.subs)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{compact(short ? c.shortMedian : c.longMedian)}</td>
              <td className="px-3 py-2">
                <Rate c={c} />
              </td>
              <td className="px-3 py-2 text-right">
                {c.best !== null ? (
                  <button type="button" onClick={() => c.bestVideo && ctx.openVideo(c.bestVideo)} disabled={!c.bestVideo} title="Open its biggest outlier" className="inline-flex items-center gap-2 align-middle">
                    {c.bestVideo && (
                      <span className="hidden 2xl:block relative w-[72px] aspect-video rounded-md overflow-hidden bg-surface-2 ring-1 ring-line/10">
                        <Thumb id={c.bestVideo} kind={short ? "short" : "long"} sizes="72px" />
                      </span>
                    )}
                    <Mult score={c.best} size="sm" />
                  </button>
                ) : (
                  <span className="text-ink-faint">–</span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-soft hidden lg:table-cell">{c.uploadsWeek === null ? "–" : c.uploadsWeek >= 10 ? Math.round(c.uploadsWeek) : c.uploadsWeek.toFixed(1)}</td>
              <td className="px-3 py-2 text-right text-ink-soft whitespace-nowrap hidden xl:table-cell">
                <TimeAgo iso={c.lastUploadAt} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-soft hidden 2xl:table-cell">{compact(c.videoCount)}</td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1">
                  <TrackButton channelId={c.id} label={false} size="sm" />
                  <ChannelMenu c={c} items={itemsFor(c)} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChannelCards({ rows, showFit, itemsFor }: { rows: ChannelRowData[]; showFit: boolean; itemsFor: (c: ChannelRowData) => MenuItem[] }) {
  const ctx = useOutliers();
  const short = ctx.kind === "short";
  return (
    <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((c) => (
        <li key={c.id} className="rounded-2xl border border-line/10 bg-surface p-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => ctx.openChannel(c.id, c)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
              <ChannelAvatar src={c.avatar} title={c.title || "?"} size={44} />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold truncate">{c.title || "A channel"}</span>
                <span className="block text-[12px] text-ink-faint truncate">
                  {compact(c.subs)} subs · usual {compact(short ? c.shortMedian : c.longMedian)}
                </span>
              </span>
            </button>
            <TrackButton channelId={c.id} label={false} size="sm" />
            <ChannelMenu c={c} items={itemsFor(c)} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            {showFit && <FitChip c={c} />}
            <div className="flex-1">
              <Rate c={c} />
            </div>
            {c.best !== null && (
              <button type="button" onClick={() => c.bestVideo && ctx.openVideo(c.bestVideo)} title="Its biggest outlier">
                <Mult score={c.best} size="sm" />
              </button>
            )}
          </div>
          {subLine(c) && <p className="mt-2 text-[11.5px] text-ink-faint truncate">{subLine(c)}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Adding channels: to the niche (one of its own: they always count), or,
 * with no niche of the team's picked, tracked. Found by a Search button.
 */
function AddChannelsDialog({ open, onClose, niche, have }: { open: boolean; onClose: () => void; niche: NicheInfo | null; have: Set<string> }) {
  const ctx = useOutliers();
  const toast = useToast();
  const [picked, setPicked] = useState<Map<string, FoundChannel>>(new Map());
  const [track, setTrack] = useState(!niche);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPicked(new Map());
    setTrack(!niche);
  }, [open, niche]);
  const toggle = (c: FoundChannel) =>
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  const ids = [...picked.keys()];
  const submit = async () => {
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      if (niche) {
        const r = await addChannelsToNiche(ctx.teamId, niche.id, ids);
        if (r.error !== undefined) return toast.error(r.error);
      }
      if (track || !niche) {
        for (const id of ids) {
          const r = await setTrackedAction(ctx.teamId, id, true);
          if (r.error === undefined) ctx.setTracked(id, true);
        }
      }
      const one = picked.get(ids[0])?.title ?? "The channel";
      toast.success(niche ? `${ids.length === 1 ? one : `${ids.length} channels`} added to ${niche.name}. Their videos are read now.` : `Tracking ${ids.length === 1 ? one : `${ids.length} channels`}. Their videos are read now.`);
      onClose();
    } catch {
      toast.error("Couldn't add them right now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={niche ? `Add channels to ${niche.name}` : "Track a channel"}
      description={niche ? "The channels this niche is about. They always count, and their videos are read right away." : "Its new videos are read every few hours, and you hear when one takes off."}
      width="sm:max-w-xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy || !ids.length} className={BTN_MAIN}>
            {busy ? "Adding…" : niche ? (ids.length > 1 ? `Add ${ids.length} channels` : "Add channel") : ids.length > 1 ? `Track ${ids.length} channels` : "Track channel"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {picked.size > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Picked">
            {[...picked.values()].map((c) => (
              <li key={c.id} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 pl-1 pr-1 h-8 text-[12.5px] font-semibold">
                <ChannelAvatar src={c.avatar} title={c.title} size={22} />
                <span className="max-w-[10rem] truncate">{c.title}</span>
                <button type="button" onClick={() => toggle(c)} aria-label={`Leave out ${c.title}`} className="w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface">
                  <CloseIcon className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ChannelFinder picked={new Set(picked.keys())} onPick={toggle} have={niche ? have : undefined} autoFocus pickLabel={niche ? "Add" : "Pick"} />
        {niche && (
          <label className="flex items-center gap-2.5 cursor-pointer text-[13px]">
            <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} className="w-4 h-4 accent-[rgb(var(--amber))]" />
            Track them too (alerts when one of their videos takes off)
          </label>
        )}
      </div>
    </Dialog>
  );
}
