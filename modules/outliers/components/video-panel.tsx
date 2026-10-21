"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalIcon, PlayIcon } from "@/components/ui/icons";
import { LineChart } from "@/modules/analytics/components/charts";
import { loadVideoDetail, loadVideos, similarOutliers } from "@/app/(dashboard)/outliers/actions";
import { compact, duration } from "../lib/filters";
import { traitsOf } from "../lib/formats";
import { ideasFromVideo } from "../lib/ideas";
import { modelInsights } from "../lib/insights";
import { BAND_LABEL, band, multText } from "../lib/scores";
import { similarThumbs } from "../lib/similar";
import { scoreTitle } from "../lib/titles";
import type { OutlierVideo, VideoDetail } from "../lib/types";
import { BRIGHTNESS_HELP, ChannelAvatar, COLOURFUL_HELP, EyeOffIcon, FormatChip, heat, Mult, pct255, SourceNote, Thumb, Tile, TimeAgo, youtubeVideo } from "./bits";
import { BarsChart, ScoreDial, Swatches } from "./charts";
import { previews, useOutliers, useOutliersBlocked } from "./context";
import { IdeaCard, useIdeaMarks } from "./idea-card";
import { PanelSection, PanelShell } from "./panel";
import { SaveButton } from "./save-menu";
import { TrackButton } from "./track-button";
import { useNicheModel } from "./use-model";
import { VideoRow } from "./video-card";

/*
 * A video's panel (1.27.0): the player, every public number, how it did
 * next to its channel's other videos, views over time, ideas made from it
 * for your niche, what its title does, its thumbnail's colours, thumbnails
 * and titles like it, its tags, title changes, and what it would have
 * earned at the team's own revenue per 1,000 views.
 */

const details = new Map<string, VideoDetail>();

const CATEGORY: Record<number, string> = {
  1: "Film & Animation",
  2: "Cars & Vehicles",
  10: "Music",
  15: "Pets & Animals",
  17: "Sports",
  19: "Travel & Events",
  20: "Gaming",
  22: "People & Blogs",
  23: "Comedy",
  24: "Entertainment",
  25: "News & Politics",
  26: "How-to & Style",
  27: "Education",
  28: "Science & Technology",
  29: "Nonprofits & Activism",
};

function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString("en-US")} ${currency}`;
  }
}

export function VideoPanel({ id, initial }: { id: string; initial: VideoDetail | null }) {
  const ctx = useOutliers();
  if (initial && !details.has(initial.video.id)) details.set(initial.video.id, initial);
  const [state, setState] = useState<{ id: string; detail: VideoDetail | null; error: string | null }>(() => ({ id, detail: details.get(id) ?? null, error: null }));
  useEffect(() => {
    const have = details.get(id);
    if (have) {
      setState({ id, detail: have, error: null });
      return;
    }
    setState({ id, detail: null, error: null });
    let live = true;
    loadVideoDetail(ctx.teamId, id)
      .then((r) => {
        if (!live) return;
        if (r.error !== undefined) setState({ id, detail: null, error: r.error });
        else {
          details.set(id, r.detail);
          setState({ id, detail: r.detail, error: null });
        }
      })
      .catch(() => live && setState({ id, detail: null, error: "Couldn't open the video. Check your connection and try again." }));
    return () => {
      live = false;
    };
  }, [id, ctx.teamId]);
  const d = state.id === id ? state.detail : null;
  const error = state.id === id ? state.error : null;
  const v = d?.video;
  // What the card knew: shown at once while the rest loads (1.29.0: no blank panel first).
  const preview = !d && !error ? previews.get(id) ?? null : null;
  const { blocked, hide } = useOutliersBlocked();
  const head = d ? { channelId: d.video.channelId, title: d.channel.title, avatar: d.channel.avatar, subs: d.channel.subs } : preview ? { channelId: preview.channelId, title: preview.channel.title, avatar: preview.channel.avatar, subs: preview.channel.subs } : null;

  return (
    <PanelShell
      label={v ? v.title : "Video"}
      onClose={ctx.closePanel}
      onBack={ctx.trail.length ? ctx.panelBack : null}
      backLabel="Back to the last one"
      bodyKey={id}
      header={
        head ? (
          <>
            <button type="button" onClick={() => ctx.openChannel(head.channelId)} className="flex items-center gap-2.5 min-w-0 rounded-lg pr-2 hover:bg-surface-2 py-1 pl-1 -ml-1">
              <ChannelAvatar src={head.avatar} title={head.title} size={32} />
              <span className="min-w-0 text-left">
                <span className="block text-[13.5px] font-semibold truncate">{head.title}</span>
                <span className="block text-[11.5px] text-ink-faint truncate">{head.subs !== null ? `${compact(head.subs)} subscribers` : "Subscribers hidden"}</span>
              </span>
            </button>
            <span className="flex-1" />
            <div className="flex items-center gap-1.5">
              <TrackButton channelId={head.channelId} label={false} />
              {d && <SaveButton videoId={d.video.id} menu />}
              {!blocked.has(head.channelId) && (
                <button
                  type="button"
                  onClick={() => {
                    hide(head.channelId, head.title, head.avatar);
                    ctx.closePanel();
                  }}
                  aria-label={`Hide ${head.title}`}
                  title="Hide this channel: its videos never show in Outliers again"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line/15 text-ink-soft hover:text-red hover:border-red/40"
                >
                  <EyeOffIcon className="w-4 h-4" />
                </button>
              )}
              <a href={youtubeVideo(id)} target="_blank" rel="noopener noreferrer" aria-label="Open on YouTube" title="Open on YouTube" className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line/15 text-ink-soft hover:text-ink hover:border-line/30">
                <ExternalIcon className="w-4 h-4" />
              </a>
            </div>
          </>
        ) : (
          <span className="text-[13.5px] font-semibold text-ink-soft">{error ? "Video" : "Opening…"}</span>
        )
      }
    >
      {error ? (
        <div className="p-6">
          <p className="text-[14px] font-semibold">This video can&rsquo;t be shown.</p>
          <p className="mt-1 text-[13px] text-ink-soft">{error}</p>
          <a href={youtubeVideo(id)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber hover:underline">
            Open it on YouTube <ExternalIcon className="w-3.5 h-3.5" />
          </a>
        </div>
      ) : !d || !v ? (
        preview ? <PreviewBody v={preview} /> : <PanelSkeleton />
      ) : (
        <VideoBody d={d} />
      )}
    </PanelShell>
  );
}

/** The panel's first picture, from what the card knew: the video, its title and headline numbers. */
function PreviewBody({ v }: { v: OutlierVideo }) {
  const short = v.kind === "short";
  const h = heat(v.score);
  return (
    <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-7" aria-busy="true">
      <div className={short ? "grid gap-5 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] items-start" : "space-y-4"}>
        <Player id={v.id} short={short} title={v.title} />
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="font-display text-[21px] sm:text-[24px] leading-[1.18] font-semibold text-balance">{v.title}</h2>
            <p className="mt-1.5 text-[12.5px] text-ink-soft flex items-center gap-x-2 gap-y-1 flex-wrap">
              <TimeAgo iso={v.publishedAt} />
              {v.durationS ? <span>· {duration(v.durationS)}</span> : null}
              {short && <span>· Short</span>}
            </p>
          </div>
          <div className={`grid gap-2.5 ${short ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
            <div className="rounded-xl px-3.5 py-3 min-w-0" style={{ background: h.soft }}>
              <div className="text-[11.5px] font-semibold text-ink-soft truncate">× its usual</div>
              <div className="mt-1 font-display text-[28px] leading-none font-semibold mult" style={{ color: h.text }}>
                {multText(v.score)}
              </div>
              <div className="mt-1 text-[11.5px] text-ink-soft truncate">{BAND_LABEL[band(v.score)]}</div>
            </div>
            <Tile label="Views" value={compact(v.views)} sub={v.channel.usual ? `usual ${compact(v.channel.usual)}` : undefined} />
            <Tile label="Views per hour" value={v.vph ? compact(v.vph) : "–"} />
            <Tile label="Likes" value={compact(v.likes)} />
          </div>
        </div>
      </div>
      <div className="skeleton h-44 w-full rounded-2xl" />
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-4" aria-busy="true">
      <div className="skeleton w-full aspect-video rounded-2xl" />
      <div className="skeleton h-6 w-3/4 rounded-md" />
      <div className="skeleton h-4 w-1/2 rounded-md" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[72px] rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-44 w-full rounded-2xl" />
    </div>
  );
}

function Player({ id, short, title }: { id: string; short: boolean; title: string }) {
  const [play, setPlay] = useState(false);
  useEffect(() => setPlay(false), [id]);
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-black ring-1 ring-line/10 ${short ? "aspect-[9/16] w-full max-w-[300px] mx-auto sm:mx-0" : "aspect-video w-full"}`}>
      {play ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 w-full h-full"
        />
      ) : (
        <button type="button" onClick={() => setPlay(true)} className="group/play absolute inset-0" aria-label={`Play “${title}”`}>
          <Thumb id={id} kind={short ? "short" : "long"} eager sizes="(min-width: 900px) 800px, 100vw" />
          <span className="absolute inset-0 bg-black/10 group-hover/play:bg-black/25 transition-colors" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-11 rounded-xl bg-[#ff0033] flex items-center justify-center shadow-lg transition-transform group-hover/play:scale-105">
            <PlayIcon className="w-6 h-6 text-white" />
          </span>
        </button>
      )}
    </div>
  );
}

function VideoBody({ d }: { d: VideoDetail }) {
  const ctx = useOutliers();
  const v = d.video;
  const short = v.kind === "short";
  const usual = v.channel.usual ?? (short ? d.channel.shortMedian : d.channel.longMedian);
  const eng = v.views ? (((v.likes ?? 0) + (v.comments ?? 0)) / v.views) * 100 : null;
  const vps = v.views && d.channel.subs ? v.views / d.channel.subs : null;
  const h = heat(v.score);
  const model = useNicheModel(ctx.teamId, ctx.nicheId, short ? "short" : "long");

  const bars = useMemo(() => d.peers.map((p) => ({ id: p.id, title: p.title, views: p.views, score: p.score, at: p.publishedAt })), [d.peers]);
  const stats = d.stats.filter((s) => s.views !== null);

  return (
    <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-7">
      {/* The video and its headline numbers (a Short stands beside them). */}
      <div className={short ? "grid gap-5 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] items-start" : "space-y-4"}>
        <Player id={v.id} short={short} title={v.title} />
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="font-display text-[21px] sm:text-[24px] leading-[1.18] font-semibold text-balance">{v.title}</h2>
            <p className="mt-1.5 text-[12.5px] text-ink-soft flex items-center gap-x-2 gap-y-1 flex-wrap">
              <TimeAgo iso={v.publishedAt} />
              {v.durationS ? <span>· {duration(v.durationS)}</span> : null}
              {short && <span>· Short</span>}
              {v.formats.slice(0, 3).map((f) => (
                <FormatChip key={f} id={f} />
              ))}
            </p>
          </div>
          <div className={`grid gap-2.5 ${short ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
            <div className="rounded-xl px-3.5 py-3 min-w-0" style={{ background: h.soft }} title={BAND_LABEL[band(v.score)]}>
              <div className="text-[11.5px] font-semibold text-ink-soft truncate">× its usual</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-display text-[28px] leading-none font-semibold mult" style={{ color: h.text }}>
                  {multText(v.score)}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-ink-soft truncate">{v.projected !== null && v.score !== null && v.projected > v.score * 1.15 ? `heading for ${multText(v.projected)}` : BAND_LABEL[band(v.score)]}</div>
            </div>
            <Tile label="Views" value={compact(v.views)} sub={usual ? `usual ${compact(usual)}` : undefined} />
            <Tile label="Views per hour" value={v.vph ? compact(v.vph) : "–"} sub={v.statsAt ? <>counted <TimeAgo iso={v.statsAt} /></> : undefined} />
            <Tile label="Engagement" value={eng === null ? "–" : `${eng.toFixed(1)}%`} sub="likes + comments per view" title="(Likes + comments) ÷ views" />
            <Tile label="Likes" value={compact(v.likes)} />
            <Tile label="Comments" value={compact(v.comments)} />
            <Tile label="Views per subscriber" value={vps === null ? "–" : vps >= 10 ? Math.round(vps).toString() : vps.toFixed(2)} sub={d.channel.subs ? `${compact(d.channel.subs)} subscribers` : "subscribers hidden"} />
            {d.earnings ? (
              <Tile label="Would have earned" value={money(d.earnings.estimate, d.earnings.currency)} sub={`at your ${money(d.earnings.rpm, d.earnings.currency)} per 1,000 views`} title="Its views at your team's own revenue per 1,000 views over the last 90 days. An estimate." />
            ) : (
              <Tile label="Posted" value={<span className="text-[18px]"><TimeAgo iso={v.publishedAt} /></span>} sub={new Date(v.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} />
            )}
          </div>
        </div>
      </div>

      <PanelSection title="Next to the channel's other videos" sub={`Each bar is one of its ${short ? "Shorts" : "videos"}, oldest on the left; this one is outlined. The dashed line is its usual.`}>
        <div className="rounded-2xl border border-line/10 bg-surface p-4 pt-8">
          <BarsChart bars={bars} usual={usual} focus={v.id} onPick={(pid) => pid !== v.id && ctx.openVideo(pid)} label={`${v.title} against the channel's other videos`} />
        </div>
      </PanelSection>

      {stats.length >= 2 && (
        <PanelSection title="Views over time" sub={`${stats.length} readings since ClipTroop found it`}>
          <div className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-4">
            <LineChart
              labels={stats.map((s) => new Date(s.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}
              tips={stats.map((s) => new Date(s.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}
              series={[{ key: "views", label: "Views", color: h.solid === "rgb(var(--ink-faint))" ? "rgb(var(--blue))" : h.solid, values: stats.map((s) => s.views) }]}
              area
              height={190}
              ariaLabel="Views over time"
            />
          </div>
        </PanelSection>
      )}

      <Remix d={d} model={model} />

      <TitleBreakdown d={d} model={model} />

      {d.changes.length > 0 && (
        <PanelSection title="Title and thumbnail changes" sub="What the channel changed after posting, and the views at the time">
          <ol className="space-y-2.5">
            {d.changes.map((c, i) => (
              <li key={i} className="rounded-xl border border-line/10 bg-surface px-3.5 py-3">
                <div className="text-[11.5px] text-ink-faint">
                  {c.field === "title" ? "Title" : c.field === "thumbnail" ? "Thumbnail" : c.field} changed <TimeAgo iso={c.at} />
                  {c.views !== null && <> at {compact(c.views)} views</>}
                </div>
                {c.field === "title" ? (
                  <div className="mt-1 text-[13px] leading-snug">
                    <span className="line-through text-ink-faint">{c.before}</span>
                    <span className="block font-semibold">{c.after}</span>
                  </div>
                ) : (
                  <div className="mt-1 text-[12.5px] text-ink-soft">A new thumbnail went up.</div>
                )}
              </li>
            ))}
          </ol>
        </PanelSection>
      )}

      <ThumbnailSection d={d} />

      <SimilarTitles d={d} />

      <Details d={d} />

      <SourceNote />
    </div>
  );
}

/** Ideas made from this video for the niche: its title as a template with the niche's topics, and its format. */
function Remix({ d, model }: { d: VideoDetail; model: ReturnType<typeof useNicheModel> }) {
  const ctx = useOutliers();
  const marks = useIdeaMarks([], []);
  const short = d.video.kind === "short";
  const niche = ctx.niche ?? ctx.niches[0] ?? null;
  const [seed, setSeed] = useState(1);
  const ideas = useMemo(() => {
    if (!model && !niche) return [];
    return ideasFromVideo(d.video.title, d.video.formats, {
      seed: seed * 7919,
      kind: short ? "short" : "long",
      niche: niche ? { name: niche.name, keywords: niche.keywords } : null,
      local: modelInsights(model),
      cross: null,
      videoId: d.video.id,
      count: 4,
    }).filter((i) => !marks.hidden.has(i.key));
  }, [d.video.title, d.video.formats, d.video.id, model, niche, short, seed, marks.hidden]);
  if (!ideas.length) return null;
  return (
    <PanelSection
      title="Ideas from this video"
      sub={niche ? `Its shape, with topics from ${niche.name}` : "Its shape, with your niche's topics"}
      right={
        <button type="button" onClick={() => setSeed((s) => s + 1)} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
          Shuffle
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 deal" key={seed}>
        {ideas.map((idea, i) => (
          <IdeaCard key={idea.key} idea={idea} index={i} teamId={ctx.teamId} nicheName={niche?.name ?? null} kind={short ? "short" : "long"} savedId={marks.savedMap.get(idea.key) ?? null} onSaved={marks.markSaved} onHide={marks.hide} thumb={false} examples={{}} />
        ))}
      </div>
    </PanelSection>
  );
}

function TitleBreakdown({ d, model }: { d: VideoDetail; model: ReturnType<typeof useNicheModel> }) {
  const v = d.video;
  const traits = traitsOf(v.bits);
  const s = useMemo(() => (model && model.n >= 40 ? scoreTitle(v.title, model.title) : null), [model, v.title]);
  return (
    <PanelSection
      title="Its title"
      sub={s ? `Scored against ${model!.n.toLocaleString("en-US")} titles in this niche: 50 is typical` : `${v.title.length} characters`}
      right={
        <Link href={`/outliers?tab=titles&t=${encodeURIComponent(v.title)}`} className="text-[12.5px] font-semibold text-amber hover:underline">
          Open in Title lab
        </Link>
      }
    >
      <div className="rounded-2xl border border-line/10 bg-surface p-4">
        {s && (
          <div className="flex items-center gap-4 mb-3.5">
            <ScoreDial score={s.score} />
            <p className="text-[13px] text-ink-soft leading-snug">
              Titles built like this do about <span className="font-semibold text-ink">{multText(s.effect)}</span> their channel&rsquo;s usual in this niche.
            </p>
          </div>
        )}
        {s && s.parts.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {s.parts.map((p) => (
              <li key={p.label} className={`inline-flex items-center gap-1.5 rounded-lg px-2 h-7 text-[12px] font-semibold ${p.effect >= 1 ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>
                {p.label}
                <span className="font-display tabular-nums">{multText(p.effect)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {traits.map((t) => (
              <li key={t.id} className="inline-flex items-center rounded-lg bg-surface-2 px-2 h-7 text-[12px] font-semibold text-ink-soft">
                {t.name}
              </li>
            ))}
            {!traits.length && <li className="text-[12.5px] text-ink-faint">A plain title: no numbers, prices, questions or brackets.</li>}
          </ul>
        )}
      </div>
    </PanelSection>
  );
}

function ThumbnailSection({ d }: { d: VideoDetail }) {
  const ctx = useOutliers();
  const v = d.video;
  const [similar, setSimilar] = useState<(OutlierVideo & { sim: number })[] | null>(null);
  useEffect(() => {
    setSimilar(null);
    if (!v.thumbHash && !v.colors?.length) return;
    let live = true;
    loadVideos(ctx.teamId, ctx.nicheId, { kind: v.kind === "short" ? "short" : "long", min_score: 1.5 }, "score", 0, 120)
      .then((r) => {
        if (!live || r.error !== undefined) return;
        const docs = r.rows.filter((x) => x.id !== v.id).map((x) => ({ id: x.id, hash: x.thumbHash, colors: x.colors }));
        const ranked = similarThumbs({ id: v.id, hash: v.thumbHash, colors: v.colors }, docs, 8);
        const byId = new Map(r.rows.map((x) => [x.id, x]));
        setSimilar(ranked.map((x) => ({ ...(byId.get(x.id) as OutlierVideo), sim: x.sim })).filter((x) => x.id));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ctx.teamId, ctx.nicheId, v.id, v.kind, v.thumbHash, v.colors]);
  if (!v.colors?.length && !v.thumbHash) return null;
  return (
    <PanelSection title="Its thumbnail" sub="The main colours, and outlier thumbnails that look like it">
      <div className="rounded-2xl border border-line/10 bg-surface p-4 space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Swatches colors={v.colors} />
          <dl className="flex gap-5 text-[12px]">
            {pct255(v.lum) !== null && (
              <div title={BRIGHTNESS_HELP}>
                <dt className="text-ink-faint underline decoration-dotted decoration-line/40 underline-offset-2 cursor-help">Brightness</dt>
                <dd className="font-semibold tabular-nums">{pct255(v.lum)}%</dd>
              </div>
            )}
            {pct255(v.sat) !== null && (
              <div title={COLOURFUL_HELP}>
                <dt className="text-ink-faint underline decoration-dotted decoration-line/40 underline-offset-2 cursor-help">Colourfulness</dt>
                <dd className="font-semibold tabular-nums">{pct255(v.sat)}%</dd>
              </div>
            )}
          </dl>
        </div>
        {similar === null ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton aspect-video rounded-lg" />
            ))}
          </div>
        ) : similar.length ? (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {similar.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => ctx.openVideo(s.id)} className="group/t block w-full text-left">
                  <span className={`relative block rounded-lg overflow-hidden bg-surface-2 ring-1 ring-line/10 group-hover/t:ring-line/40 ${s.kind === "short" ? "aspect-[9/16]" : "aspect-video"}`}>
                    <Thumb id={s.id} kind={s.kind} sizes="200px" tint={s.colors?.[0]} />
                    <Mult score={s.score} size="sm" on className="absolute top-1.5 left-1.5" />
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-snug line-clamp-2 text-ink-soft group-hover/t:text-ink">{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-ink-faint">No outlier thumbnails like it here yet.</p>
        )}
      </div>
    </PanelSection>
  );
}

function SimilarTitles({ d }: { d: VideoDetail }) {
  const ctx = useOutliers();
  const v = d.video;
  const [rows, setRows] = useState<(OutlierVideo & { sim: number })[] | null>(null);
  useEffect(() => {
    setRows(null);
    let live = true;
    similarOutliers(ctx.teamId, ctx.nicheId, v.title, v.kind === "short" ? "short" : "long")
      .then((r) => live && setRows(r.error !== undefined ? [] : r.rows.filter((x) => x.id !== v.id).slice(0, 6)))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [ctx.teamId, ctx.nicheId, v.id, v.title, v.kind]);
  if (rows && !rows.length) return null;
  return (
    <PanelSection title="Titles like it" sub="Videos in this niche worded the most like this one">
      {rows === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[70px] rounded-xl" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line/[0.07] rounded-2xl border border-line/10 bg-surface px-3">
          {rows.map((r) => (
            <VideoRow key={r.id} v={r} />
          ))}
        </ul>
      )}
    </PanelSection>
  );
}

function Details({ d }: { d: VideoDetail }) {
  const v = d.video;
  const facts: [string, string][] = [];
  if (v.category && CATEGORY[v.category]) facts.push(["Category", CATEGORY[v.category]]);
  if (v.lang) facts.push(["Language", v.lang.toUpperCase()]);
  if (v.chapters) facts.push(["Chapters", String(v.chapters)]);
  facts.push(["Captions", v.captions ? "Yes" : "No"]);
  if (v.hd !== null) facts.push(["Quality", v.hd ? "HD" : "SD"]);
  if (v.kids) facts.push(["Made for kids", "Yes"]);
  if (v.licensed) facts.push(["Licensed content", "Yes"]);
  return (
    <PanelSection title="Details">
      <div className="rounded-2xl border border-line/10 bg-surface p-4 space-y-3.5">
        {v.description && <p className="text-[12.5px] leading-relaxed text-ink-soft whitespace-pre-line line-clamp-6">{v.description}</p>}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5">
          {facts.map(([k, val]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11.5px] text-ink-faint">{k}</dt>
              <dd className="text-[13px] font-semibold truncate">{val}</dd>
            </div>
          ))}
        </dl>
        {v.tags && v.tags.length > 0 && (
          <div>
            <p className="text-[11.5px] text-ink-faint mb-1.5">Tags</p>
            <ul className="flex flex-wrap gap-1.5">
              {v.tags.slice(0, 30).map((t) => (
                <li key={t}>
                  <Link href={`/outliers?tab=search&q=${encodeURIComponent(t)}`} className="inline-flex items-center rounded-md bg-surface-2 px-2 h-6 text-[11.5px] text-ink-soft hover:text-ink">
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PanelSection>
  );
}
