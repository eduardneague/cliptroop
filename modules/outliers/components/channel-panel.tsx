"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { loadChannelDetail, setChannelHidden } from "@/app/(dashboard)/outliers/actions";
import { median } from "../lib/corpus";
import { compact } from "../lib/filters";
import { formatName } from "../lib/formats";
import { multText } from "../lib/scores";
import type { ChannelDetail, ChannelRowData, OutlierVideo } from "../lib/types";
import { ChannelAvatar, heat, Mult, NicheDot, SourceNote, Tile, TimeAgo, youtubeChannel } from "./bits";
import { BarsChart, PostingHeat, ShareBar } from "./charts";
import { useOutliers } from "./context";
import { PanelSection, PanelShell } from "./panel";
import { SaveButton } from "./save-menu";
import { TrackButton } from "./track-button";
import { VideoGrid, VideoRow } from "./video-card";

/*
 * A channel's panel (1.27.0): its numbers, every stored video against its
 * usual, its biggest outliers and latest uploads, the formats it uses and
 * how they do, when it posts, the team's niches it's in, and channels like
 * it.
 */

const details = new Map<string, ChannelDetail>();

const yearsSince = (iso: string | null) => (iso ? Math.max(0, (Date.now() - Date.parse(iso)) / (365.25 * 86_400_000)) : null);

export function ChannelPanel({ id, initial }: { id: string; initial: ChannelDetail | null }) {
  const ctx = useOutliers();
  if (initial && !details.has(initial.channel.id)) details.set(initial.channel.id, initial);
  const [state, setState] = useState<{ id: string; detail: ChannelDetail | null; error: string | null }>(() => ({ id, detail: details.get(id) ?? null, error: null }));
  useEffect(() => {
    const have = details.get(id);
    if (have) {
      setState({ id, detail: have, error: null });
      return;
    }
    setState({ id, detail: null, error: null });
    let live = true;
    loadChannelDetail(ctx.teamId, id)
      .then((r) => {
        if (!live) return;
        if (r.error !== undefined) setState({ id, detail: null, error: r.error });
        else {
          details.set(id, r.detail);
          setState({ id, detail: r.detail, error: null });
        }
      })
      .catch(() => live && setState({ id, detail: null, error: "Couldn't open the channel. Check your connection and try again." }));
    return () => {
      live = false;
    };
  }, [id, ctx.teamId]);
  const d = state.id === id ? state.detail : null;
  const error = state.id === id ? state.error : null;
  const c = d?.channel;

  return (
    <PanelShell
      label={c ? c.title : "Channel"}
      onClose={ctx.closePanel}
      onBack={ctx.trail.length ? ctx.panelBack : null}
      backLabel="Back to the last one"
      bodyKey={id}
      header={
        c ? (
          <>
            <span className="text-[13.5px] font-semibold truncate min-w-0">{c.title}</span>
            <span className="flex-1" />
            <div className="flex items-center gap-1.5">
              <TrackButton channelId={c.id} />
              <SaveButton channelId={c.id} menu />
              <a href={youtubeChannel(c.id, c.handle)} target="_blank" rel="noopener noreferrer" aria-label="Open on YouTube" title="Open on YouTube" className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line/15 text-ink-soft hover:text-ink hover:border-line/30">
                <ExternalIcon className="w-4 h-4" />
              </a>
            </div>
          </>
        ) : (
          <span className="text-[13.5px] font-semibold text-ink-soft">{error ? "Channel" : "Opening…"}</span>
        )
      }
    >
      {error ? (
        <div className="p-6">
          <p className="text-[14px] font-semibold">This channel can&rsquo;t be shown.</p>
          <p className="mt-1 text-[13px] text-ink-soft">{error}</p>
        </div>
      ) : !d ? (
        <div className="p-4 sm:p-6 space-y-4" aria-busy="true">
          <div className="flex items-center gap-4">
            <div className="skeleton w-16 h-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-6 w-1/2 rounded-md" />
              <div className="skeleton h-4 w-1/3 rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[72px] rounded-xl" />
            ))}
          </div>
          <div className="skeleton h-48 rounded-2xl" />
        </div>
      ) : (
        <ChannelBody d={d} />
      )}
    </PanelShell>
  );
}

function ChannelBody({ d }: { d: ChannelDetail }) {
  const ctx = useOutliers();
  const toast = useToast();
  const c = d.channel;
  const longs = d.videos.filter((v) => v.kind === "long");
  const shorts = d.videos.filter((v) => v.kind === "short");
  const [kind, setKind] = useState<"long" | "short">(() => (ctx.kind === "short" && shorts.length ? "short" : longs.length ? "long" : "short"));
  const [hiddenIn, setHiddenIn] = useState<Set<string>>(() => new Set(d.niches.filter((n) => n.hidden).map((n) => n.id)));
  const vids = kind === "short" ? shorts : longs;
  const usual = kind === "short" ? c.shortMedian : c.longMedian;
  const scored = d.videos.filter((v) => v.score !== null);
  const rate = scored.length ? scored.filter((v) => (v.score ?? 0) >= 3).length / scored.length : null;
  const best = scored.length ? Math.max(...scored.map((v) => v.score ?? 0)) : null;
  const age = yearsSince(c.publishedAt);

  const asVideo = (v: ChannelDetail["videos"][number]): OutlierVideo => ({
    ...v,
    channelId: c.id,
    lang: null,
    colors: null,
    thumbHash: null,
    statsAt: null,
    channel: { title: c.title, handle: c.handle, avatar: c.avatar, subs: c.subs, usual: v.kind === "short" ? c.shortMedian : c.longMedian, publishedAt: c.publishedAt },
    peers: null,
    peerI: null,
  });
  const bars = useMemo(() => [...vids].reverse().map((v) => ({ id: v.id, title: v.title, views: v.views, score: v.score, at: v.publishedAt })), [vids]);
  const top = useMemo(() => [...vids].filter((v) => v.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 6).map(asVideo), [vids]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useMemo(() => vids.slice(0, 5).map(asVideo), [vids]); // eslint-disable-line react-hooks/exhaustive-deps
  const formats = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const v of d.videos) for (const f of v.formats) m.set(f, [...(m.get(f) ?? []), v.score ?? 0]);
    return [...m.entries()]
      .map(([id, scores]) => ({ id, n: scores.length, med: median(scores) ?? 0, hits: scores.filter((s) => s >= 3).length }))
      .filter((f) => f.n >= 2)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
  }, [d.videos]);

  const toggleNiche = async (nicheId: string, hide: boolean) => {
    setHiddenIn((s) => {
      const n = new Set(s);
      if (hide) n.add(nicheId);
      else n.delete(nicheId);
      return n;
    });
    try {
      const r = await setChannelHidden(ctx.teamId, nicheId, c.id, hide);
      if (r.error !== undefined) throw new Error(r.error);
      toast.success(hide ? "Taken out of that niche" : "Back in that niche");
    } catch (e) {
      setHiddenIn((s) => {
        const n = new Set(s);
        if (hide) n.delete(nicheId);
        else n.add(nicheId);
        return n;
      });
      toast.error(e instanceof Error && e.message ? e.message : "Couldn't change it. Try again.");
    }
  };

  return (
    <div className="px-4 sm:px-6 py-5 space-y-7">
      <div className="flex items-start gap-4">
        <ChannelAvatar src={c.avatar} title={c.title} size={68} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[23px] sm:text-[26px] leading-tight font-semibold">{c.title}</h2>
          <p className="mt-1 text-[12.5px] text-ink-soft flex items-center gap-x-2 gap-y-1 flex-wrap">
            {c.handle && <span>{c.handle}</span>}
            {c.country && <span>· {c.country}</span>}
            {age !== null && <span>· started {age < 1 ? `${Math.max(1, Math.round(age * 12))} months` : `${Math.round(age)} year${Math.round(age) === 1 ? "" : "s"}`} ago</span>}
            {c.uploadsWeek !== null && <span>· {c.uploadsWeek >= 10 ? Math.round(c.uploadsWeek) : c.uploadsWeek.toFixed(1)} uploads a week</span>}
            {c.lastUploadAt && (
              <span>
                · last upload <TimeAgo iso={c.lastUploadAt} />
              </span>
            )}
          </p>
          {c.description && <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft line-clamp-3">{c.description}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tile label="Subscribers" value={compact(c.subs)} sub={c.views ? `${compact(c.views)} views in all` : undefined} />
        <Tile label="Usual views" value={compact(usual)} sub={kind === "short" ? "per Short" : "per long video"} title="The median views of its recent videos of this kind" />
        <Tile label="Outlier rate" value={rate === null ? "–" : `${Math.round(rate * 100)}%`} sub={`of ${scored.length} stored videos hit 3×`} />
        <Tile label="Best" value={<span style={{ color: heat(best).text }}>{multText(best)}</span>} sub="its biggest outlier stored" />
      </div>

      {longs.length > 0 && shorts.length > 0 && (
        <Segmented
          ariaLabel="Which videos"
          value={kind}
          onChange={setKind}
          options={[
            { value: "long", label: "Long videos", count: longs.length },
            { value: "short", label: "Shorts", count: shorts.length },
          ]}
        />
      )}

      <PanelSection title="Every video against its usual" sub="Newest on the right. Coloured bars did 2× or more; click one to open it.">
        <div className="rounded-2xl border border-line/10 bg-surface p-4 pt-8">
          <BarsChart bars={bars} usual={usual} onPick={(vid) => ctx.openVideo(vid)} label={`${c.title}'s videos against its usual`} />
        </div>
      </PanelSection>

      {top.length > 0 && (
        <PanelSection title="Its biggest outliers">
          <VideoGrid rows={top} kind={kind} className="!grid-cols-2 sm:!grid-cols-3" hideChannel />
        </PanelSection>
      )}

      <div className="grid gap-7 lg:grid-cols-2">
        {latest.length > 0 && (
          <PanelSection title="Latest uploads">
            <ul className="divide-y divide-line/[0.07] rounded-2xl border border-line/10 bg-surface px-3">
              {latest.map((v) => (
                <VideoRow key={v.id} v={v} />
              ))}
            </ul>
          </PanelSection>
        )}
        <div className="space-y-7 min-w-0">
          {formats.length > 0 && (
            <PanelSection title="Formats it uses" sub="How often, and its median × usual with each">
              <div className="rounded-2xl border border-line/10 bg-surface p-4 space-y-3">
                {formats.map((f) => (
                  <ShareBar
                    key={f.id}
                    label={formatName(f.id)}
                    value={f.n}
                    max={Math.max(...formats.map((x) => x.n))}
                    color={heat(f.med).solid === "rgb(var(--ink-faint))" ? "rgb(var(--ink) / 0.3)" : heat(f.med).solid}
                    sub={
                      <>
                        {f.n} <span className="text-ink-faint font-normal">·</span> <span style={{ color: heat(f.med).text }}>{multText(f.med)}</span>
                      </>
                    }
                  />
                ))}
              </div>
            </PanelSection>
          )}
          <PanelSection title="When it posts">
            <div className="rounded-2xl border border-line/10 bg-surface p-4">
              <PostingHeat dates={d.videos.map((v) => ({ at: v.publishedAt, score: v.score }))} />
            </div>
          </PanelSection>
        </div>
      </div>

      {d.niches.some((n) => n.team) && (
        <PanelSection title="In your niches" sub={ctx.canManage ? "Take it out of a niche if it doesn't belong there." : undefined}>
          <ul className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/[0.07]">
            {d.niches
              .filter((n) => n.team)
              .map((n) => {
                const off = hiddenIn.has(n.id);
                const info = ctx.niches.find((x) => x.id === n.id);
                return (
                  <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                    <NicheDot color={info?.color ?? "blue"} />
                    <span className={`flex-1 min-w-0 truncate text-[13.5px] ${off ? "text-ink-faint line-through" : "font-semibold"}`}>{n.name}</span>
                    <span className="text-[11.5px] text-ink-faint hidden sm:inline">{n.source === "manual" ? "added by hand" : n.source === "seed" ? "from a search" : n.source === "featured" ? "featured by a channel" : "found by search"}</span>
                    {ctx.canManage && (
                      <button type="button" onClick={() => toggleNiche(n.id, !off)} className="rounded-lg border border-line/15 px-2.5 h-8 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
                        {off ? "Put back" : "Take out"}
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </PanelSection>
      )}

      {d.similar.length > 0 && (
        <PanelSection title="Channels like it" sub="The same niche, a similar size, the most outliers first">
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.similar.map((s) => (
              <ChannelMini key={s.id} c={s} />
            ))}
          </ul>
        </PanelSection>
      )}

      <SourceNote />
    </div>
  );
}

/** A channel in a few words (channels like it, small lists). */
export function ChannelMini({ c }: { c: ChannelRowData }) {
  const { openChannel } = useOutliers();
  const rate = c.stored ? c.outliers / c.stored : null;
  return (
    <li>
      <button type="button" onClick={() => openChannel(c.id)} className="w-full flex items-center gap-3 rounded-xl border border-line/10 bg-surface px-3 py-2.5 text-left hover:border-line/25">
        <ChannelAvatar src={c.avatar} title={c.title} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold truncate">{c.title}</span>
          <span className="block text-[11.5px] text-ink-faint truncate">
            {compact(c.subs)} subs{rate !== null ? ` · ${Math.round(rate * 100)}% outliers` : ""}
          </span>
        </span>
        {c.best !== null && <Mult score={c.best} size="sm" />}
      </button>
    </li>
  );
}
