"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { PlusIcon, SearchIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { LayoutSwitch, LAYOUTS, useStoredView } from "@/components/ui/table-bits";
import { useToast } from "@/components/ui/toast-provider";
import { addChannel, loadChannels } from "@/app/(dashboard)/outliers/actions";
import { compact } from "../../lib/filters";
import type { ChannelRowData } from "../../lib/types";
import { CHANNEL_SORTS, type ChannelSort, type ChannelsData } from "../../lib/view";
import { BTN, BTN_MAIN, ChannelAvatar, EmptyNote, FIELD, LABEL, Mult, SourceNote, Thumb, TimeAgo } from "../bits";
import { useOutliers } from "../context";
import { useShellNav } from "../shell-nav";
import { TrackButton } from "../track-button";

/*
 * Channels (1.27.0): the niche's channels with their size, usual views, how
 * often they hit 3×, their biggest outlier and how much they post. Track
 * the ones to watch (alerts when one of their videos takes off), add one by
 * its link, or take one out of the niche (from its panel).
 */

export function ChannelsTab({ data }: { data: ChannelsData }) {
  const ctx = useOutliers();
  const nav = useShellNav();
  const toast = useToast();
  const [rows, setRows] = useState(data.rows);
  const [total, setTotal] = useState(data.total);
  const [q, setQ] = useState(data.q);
  const [layout, setLayout] = useStoredView("vp-outliers-channels-layout", LAYOUTS, "table");
  const [more, startMore] = useTransition();
  const [adding, setAdding] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    setRows(data.rows);
    setTotal(data.total);
    setQ(data.q);
  }, [data]);

  const params = (p: { sort?: ChannelSort; q?: string; only?: string }) => ({ csort: (p.sort ?? data.sort) === "rate" ? null : p.sort ?? data.sort, cq: (p.q ?? q).trim() || null, only: (p.only ?? data.only) === "all" ? null : p.only ?? data.only });
  const go = (p: { sort?: ChannelSort; q?: string; only?: string }) => nav.go({ tab: "channels", params: params(p) }, { replace: true });
  const typed = (text: string) => {
    setQ(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go({ q: text }), 380);
  };
  const f = { ...(data.q ? { q: data.q } : {}), ...(data.only === "tracked" ? { tracked: true } : {}), ...(data.only === "hidden" ? { hidden: true } : {}) };
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

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <label className="relative flex-1 min-w-[min(100%,14rem)] max-w-md">
          <span className="sr-only">Find a channel</span>
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
          <input value={q} onChange={(e) => typed(e.target.value)} placeholder="Find a channel" className="w-full rounded-lg border border-line/15 bg-surface pl-9 pr-3 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber" />
        </label>
        <Segmented
          ariaLabel="Which channels"
          size="sm"
          value={data.only}
          onChange={(v) => go({ only: v })}
          options={[
            { value: "all", label: "All" },
            { value: "tracked", label: "Tracked", count: ctx.tracked.size },
            ...(ctx.canManage && ctx.niche && !ctx.niche.explore ? [{ value: "hidden" as const, label: "Taken out" }] : []),
          ]}
        />
        <div className="w-[12rem]">
          <Select value={data.sort} onChange={(v) => go({ sort: (v as ChannelSort) ?? "rate" })} options={CHANNEL_SORTS.map((s) => ({ value: s.id, label: s.label }))} ariaLabel="Sort channels" />
        </div>
        <LayoutSwitch value={layout} onChange={setLayout} className="hidden sm:inline-flex" />
        <span className="flex-1" />
        {ctx.canManage && (
          <button type="button" onClick={() => setAdding(true)} className={BTN_MAIN}>
            <PlusIcon className="w-4 h-4" />
            Add a channel
          </button>
        )}
      </div>
      <p className="mb-3 text-[13px] text-ink-soft" role="status">
        <span className="font-semibold text-ink tabular-nums">{total.toLocaleString("en-US")}</span> channels {ctx.niche ? `in ${ctx.niche.name}` : "in every niche"}
        {nav.busy && <span className="ml-2 inline-block w-3.5 h-3.5 align-[-2px] rounded-full border-2 border-amber/30 border-t-amber animate-spin" aria-label="Loading" />}
      </p>

      {rows.length ? (
        <>
          {layout === "table" ? <ChannelTable rows={rows} /> : <ChannelCards rows={rows} />}
          {rows.length < total && (
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={showMore} disabled={more} className={BTN}>
                {more ? "Loading…" : `Show more (${(total - rows.length).toLocaleString("en-US")} left)`}
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyNote title={data.only === "tracked" ? "No tracked channels here" : data.q ? "No channel by that name" : "No channels yet"} action={ctx.canManage ? <button type="button" onClick={() => setAdding(true)} className={BTN_MAIN}>Add a channel</button> : undefined}>
          {data.only === "tracked" ? "Track a channel from its panel or this list." : "Channels come in from the niche's keywords. You can also add one by its link."}
        </EmptyNote>
      )}
      <SourceNote className="mt-8" />
      <AddChannelDialog open={adding} onClose={() => setAdding(false)} />
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

function ChannelTable({ rows }: { rows: ChannelRowData[] }) {
  const ctx = useOutliers();
  const th = "px-3 py-2.5 text-left text-[11.5px] font-semibold text-ink-faint whitespace-nowrap";
  const short = ctx.kind === "short";
  return (
    <div className="relative rounded-2xl border border-line/10 bg-surface overflow-x-auto styled-scroll">
      <table className="w-full text-[13px]">
        <thead className="border-b border-line/10">
          <tr>
            <th className={th}>Channel</th>
            <th className={`${th} text-right`}>Subscribers</th>
            <th className={`${th} text-right`}>Usual views</th>
            <th className={`${th} w-[10rem]`}>Hit 3×</th>
            <th className={`${th} text-right`}>Best</th>
            <th className={`${th} text-right hidden lg:table-cell`}>Uploads a week</th>
            <th className={`${th} text-right hidden xl:table-cell`}>Last upload</th>
            <th className={`${th} text-right hidden 2xl:table-cell`}>Videos</th>
            <th className={`${th} text-right hidden 2xl:table-cell`}>Started</th>
            <th className={`${th} text-right`}>
              <span className="sr-only">Track</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/[0.07]">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-surface-2/40">
              <td className="px-3 py-2 min-w-[220px]">
                <button type="button" onClick={() => ctx.openChannel(c.id)} className="flex items-center gap-2.5 text-left min-w-0">
                  <ChannelAvatar src={c.avatar} title={c.title} size={34} />
                  <span className="min-w-0">
                    <span className="block font-semibold truncate max-w-[18rem] hover:underline">{c.title}</span>
                    <span className="block text-[11.5px] text-ink-faint truncate">{c.handle ?? c.country ?? ""}</span>
                  </span>
                </button>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{compact(c.subs)}</td>
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
              <td className="px-3 py-2 text-right text-ink-soft whitespace-nowrap hidden 2xl:table-cell">{c.publishedAt ? <TimeAgo iso={c.publishedAt} /> : "–"}</td>
              <td className="px-3 py-2 text-right">
                <TrackButton channelId={c.id} label={false} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChannelCards({ rows }: { rows: ChannelRowData[] }) {
  const ctx = useOutliers();
  const short = ctx.kind === "short";
  return (
    <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((c) => (
        <li key={c.id} className="rounded-2xl border border-line/10 bg-surface p-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => ctx.openChannel(c.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
              <ChannelAvatar src={c.avatar} title={c.title} size={44} />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold truncate">{c.title}</span>
                <span className="block text-[12px] text-ink-faint truncate">
                  {compact(c.subs)} subs · usual {compact(short ? c.shortMedian : c.longMedian)}
                </span>
              </span>
            </button>
            <TrackButton channelId={c.id} label={false} size="sm" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <Rate c={c} />
            </div>
            {c.best !== null && (
              <button type="button" onClick={() => c.bestVideo && ctx.openVideo(c.bestVideo)} title="Its biggest outlier">
                <Mult score={c.best} size="sm" />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AddChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useOutliers();
  const toast = useToast();
  const [input, setInput] = useState("");
  const [track, setTrack] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setInput("");
      setError(null);
    }
  }, [open]);
  const niche = ctx.niche && !ctx.niche.explore ? ctx.niche : null;
  const submit = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await addChannel(ctx.teamId, input.trim(), { nicheId: niche?.id ?? null, track });
      if (r.error !== undefined) return setError(r.error);
      if (track) ctx.setTracked(r.id, true);
      toast.success(`${r.title} added${niche ? ` to ${niche.name}` : ""}${track ? " and tracked" : ""}`);
      onClose();
      ctx.openChannel(r.id);
    } catch {
      setError("Couldn't add the channel right now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a channel"
      description={niche ? `It joins ${niche.name}, and its videos are read right away.` : "Its videos are read right away."}
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy || !input.trim()} className={BTN_MAIN}>
            {busy ? "Adding…" : "Add channel"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className={LABEL}>The channel&rsquo;s link, @handle, or one of its videos</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="youtube.com/@mkbhd or a video link" className={FIELD} data-autofocus autoComplete="off" />
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer text-[13.5px]">
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} className="w-4 h-4 accent-[rgb(var(--amber))]" />
          Track it (alerts when one of its videos takes off)
        </label>
        {error && (
          <p className="rounded-lg bg-red/10 text-red px-3 py-2 text-[12.5px] font-semibold" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
