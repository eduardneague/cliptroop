"use client";

import { useMemo } from "react";
import { compact, duration } from "../lib/filters";
import { multText, usualThen } from "../lib/scores";
import type { OutlierVideo } from "../lib/types";
import { ChannelAvatar, DurationChip, heat, Mult, Spike, Thumb, TimeAgo } from "./bits";
import { CardMenu } from "./card-menu";
import { useOutliersBlocked, useOutliersNav } from "./context";
import { SaveButton } from "./save-menu";

/*
 * Outlier videos as cards, Shorts as tall cards, and rows for lists and
 * tables (1.27.0). Every one opens the video's panel (1.29.0: at once, with
 * what the card already knows); the channel's name and picture open the
 * channel's. A hidden channel's videos leave every list at once.
 */

/** The rows whose channel the team didn't hide. */
export function useVisible<T extends { channelId: string }>(rows: T[]): T[] {
  const { blocked } = useOutliersBlocked();
  return useMemo(() => (blocked.size ? rows.filter((v) => !blocked.has(v.channelId)) : rows), [rows, blocked]);
}

/** A long video's card: the thumbnail with its multiplier, the title, the channel (not on its own channel's panel), the spike. */
export function VideoCard({ v, eager = false, hideChannel = false }: { v: OutlierVideo; eager?: boolean; hideChannel?: boolean }) {
  const { openVideo, openChannel } = useOutliersNav();
  return (
    <article className="group relative flex flex-col min-w-0">
      <div className="relative">
        <button type="button" onClick={() => openVideo(v.id, v)} aria-label={`Open “${v.title}”`} className="relative block w-full aspect-video rounded-xl overflow-hidden bg-surface-2 ring-1 ring-line/10 transition-shadow hover:ring-line/30 focus-visible:ring-2 focus-visible:ring-amber">
          <Thumb id={v.id} kind={v.kind} eager={eager} tint={v.colors?.[0]} />
          <Mult score={v.score} projected={v.projected} on className="absolute top-2 left-2" />
          <DurationChip secs={v.durationS} />
        </button>
        <CardMenu v={v} overlay />
        <SaveButton videoId={v.id} overlay />
      </div>
      <div className="mt-2.5 flex gap-2.5 min-w-0">
        {!hideChannel && (
          <button type="button" onClick={() => openChannel(v.channelId, v.channel)} aria-label={`Open ${v.channel.title}`} className="mt-0.5 rounded-full focus-visible:ring-2 focus-visible:ring-amber">
            <ChannelAvatar src={v.channel.avatar} title={v.channel.title} size={30} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold leading-snug line-clamp-2">
            <button type="button" onClick={() => openVideo(v.id, v)} className="text-left hover:underline decoration-ink/30 underline-offset-2">
              {v.title}
            </button>
          </h3>
          {!hideChannel && (
            <div className="mt-0.5 text-[12px] text-ink-faint truncate">
              <button type="button" onClick={() => openChannel(v.channelId, v.channel)} className="hover:text-ink">
                {v.channel.title}
              </button>
              {v.channel.subs !== null && <span> · {compact(v.channel.subs)} subs</span>}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-2 min-w-0">
            <Spike peers={v.peers} at={v.peerI} score={v.score} width={52} height={18} />
            <span className="text-[12px] text-ink-soft truncate">
              <span className="tabular-nums font-semibold text-ink">{compact(v.views)}</span> views · <TimeAgo iso={v.publishedAt} />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/** A Short's card: tall, like YouTube's Shorts shelf. */
export function ShortCard({ v, eager = false, staged = false }: { v: OutlierVideo; eager?: boolean; /** 1.43.0: centred on a soft wash of its own picture, as wide as the card (Saved). */ staged?: boolean }) {
  const { openVideo, openChannel } = useOutliersNav();
  const thumb = (
    <div className="relative">
      <button type="button" onClick={() => openVideo(v.id, v)} aria-label={`Open “${v.title}”`} className="relative block w-full aspect-[9/16] rounded-xl overflow-hidden bg-surface-2 ring-1 ring-line/10 transition-shadow hover:ring-line/30 focus-visible:ring-2 focus-visible:ring-amber">
        <Thumb id={v.id} kind="short" eager={eager} sizes="(min-width: 1400px) 200px, 40vw" tint={v.colors?.[0]} />
        <Mult score={v.score} projected={v.projected} on className="absolute top-2 left-2" />
        <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent" aria-hidden />
        <span className="absolute left-2 bottom-2 text-[12.5px] font-semibold text-white tabular-nums drop-shadow">{compact(v.views)} views</span>
      </button>
      <CardMenu v={v} overlay />
      <SaveButton videoId={v.id} overlay />
    </div>
  );
  return (
    <article className="group relative flex flex-col min-w-0">
      {staged ? (
        // The card's width, the Short in the middle on a blur of itself (the owner: "it doesnt fill the entire space, at
        // least center the shorts").
        <div className="short-stage relative isolate rounded-xl overflow-hidden bg-surface-2 ring-1 ring-line/10">
          <span aria-hidden className="absolute inset-0 -z-10 pointer-events-none">
            <Thumb id={v.id} kind="short" sizes="120px" tint={v.colors?.[0]} className="scale-[2.6] blur-2xl saturate-150 opacity-70" />
          </span>
          <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/5 via-transparent to-black/20 pointer-events-none" />
          <div className="relative mx-auto w-[58%] max-w-[220px] py-3.5">{thumb}</div>
        </div>
      ) : (
        thumb
      )}
      <h3 className="mt-2 text-[13px] font-semibold leading-snug line-clamp-2">
        <button type="button" onClick={() => openVideo(v.id, v)} className="text-left hover:underline decoration-ink/30 underline-offset-2">
          {v.title}
        </button>
      </h3>
      <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[11.5px] text-ink-faint">
        <button type="button" onClick={() => openChannel(v.channelId, v.channel)} className="truncate hover:text-ink">
          {v.channel.title}
        </button>
        <span aria-hidden>·</span>
        <TimeAgo iso={v.publishedAt} className="flex-shrink-0" />
      </div>
    </article>
  );
}

/**
 * One video in a list: a small thumbnail, the words, the multiplier and spike on the right. Laid out by the room the
 * row has, not the window's width (1.34.5, .vrow in globals.css): with less than 540px (a phone, or a column beside
 * another, like a channel's Latest uploads) the multiplier goes on the picture and the title gets the width; it was
 * squeezed to a word a line there, under the chips. `hideChannel`: in the channel's own panel, where every row is its.
 */
export function VideoRow({ v, rank, compact: tight = false, hideChannel = false, className = "" }: { v: OutlierVideo; rank?: number; compact?: boolean; hideChannel?: boolean; className?: string }) {
  const { openVideo, openChannel } = useOutliersNav();
  const short = v.kind === "short";
  return (
    <li className={`group flex items-center min-w-0 ${tight ? "gap-2.5 py-2" : "vrow gap-3 py-2.5"} ${className}`}>
      {rank !== undefined && <span className="w-5 text-right text-[12px] font-semibold text-ink-faint tabular-nums flex-shrink-0">{rank}</span>}
      <button type="button" onClick={() => openVideo(v.id, v)} aria-label={`Open “${v.title}”`} className={`relative flex-shrink-0 rounded-lg overflow-hidden bg-surface-2 ring-1 ring-line/10 ${short ? (tight ? "w-[44px]" : "w-[54px]") + " aspect-[9/16]" : tight ? "w-[96px] aspect-video" : "vrow-thumb w-[140px] aspect-video"}`}>
        <Thumb id={v.id} kind={v.kind} sizes={short ? "54px" : "140px"} tint={v.colors?.[0]} />
        {!short && !tight && <DurationChip secs={v.durationS} className="!bottom-1 !right-1 !text-[10px]" />}
        {/* A narrow row: the multiplier on the picture, so the words get the width. */}
        {!tight && <Mult score={v.score} size="sm" on className="vrow-narrow absolute top-1 left-1" />}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => openVideo(v.id, v)} className={`block text-left font-semibold leading-snug line-clamp-2 [overflow-wrap:anywhere] hover:underline decoration-ink/30 underline-offset-2 ${tight ? "text-[13px]" : "text-[13.5px]"}`}>
          {v.title}
        </button>
        {!hideChannel && (
          <div className="mt-0.5 text-[12px] text-ink-faint truncate">
            <button type="button" onClick={() => openChannel(v.channelId, v.channel)} className="hover:text-ink">
              {v.channel.title}
            </button>
            {v.channel.subs !== null && <span> · {compact(v.channel.subs)} subs</span>}
          </div>
        )}
        {!tight && (
          <div className="mt-0.5 text-[12px] text-ink-soft truncate">
            <span className="tabular-nums font-semibold text-ink">{compact(v.views)}</span> views · <TimeAgo iso={v.publishedAt} />
            {v.vph !== null && v.vph > 0 && <span className="vrow-wide"> · {compact(v.vph)}/hour</span>}
          </div>
        )}
      </div>
      <div className={`flex-col items-end gap-1.5 flex-shrink-0 flex ${tight ? "" : "vrow-wide"}`}>
        <Mult score={v.score} projected={tight ? null : v.projected} size={tight ? "sm" : "md"} className={tight ? "flex-col !items-end sm:flex-row sm:!items-center" : "!items-center"} />
        {tight ? <span className="text-[11.5px] tabular-nums text-ink-faint">{compact(v.views)}</span> : <Spike peers={v.peers} at={v.peerI} score={v.score} width={46} height={16} reserve />}
      </div>
      {!tight && <CardMenu v={v} className="flex-shrink-0 -mr-1.5 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />}
    </li>
  );
}

/** Videos as a table (computers): every number in its own column. */
export function VideoTable({ rows: all }: { rows: OutlierVideo[] }) {
  const { openVideo, openChannel } = useOutliersNav();
  const rows = useVisible(all);
  const th = "px-3 py-2.5 text-left text-[11.5px] font-semibold text-ink-faint whitespace-nowrap";
  return (
    <div className="relative rounded-2xl border border-line/10 bg-surface overflow-x-auto overscroll-x-contain styled-scroll">
      <table className="w-full text-[13px]">
        <thead className="border-b border-line/10">
          <tr>
            <th className={th}>Video</th>
            <th className={`${th} hidden lg:table-cell`}>Channel</th>
            <th className={`${th} text-right`}>× usual</th>
            <th className={`${th} text-right`}>Views</th>
            <th className={`${th} text-right hidden 2xl:table-cell`}>Views / hour</th>
            <th className={`${th} text-right hidden 2xl:table-cell`}>Engagement</th>
            <th className={`${th} text-right hidden xl:table-cell`}>Length</th>
            <th className={`${th} text-right`}>Posted</th>
            <th className="w-10">
              <span className="sr-only">More</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/[0.07]">
          {rows.map((v) => {
            const eng = v.views ? (((v.likes ?? 0) + (v.comments ?? 0)) / v.views) * 100 : null;
            return (
              <tr key={v.id} className="group hover:bg-surface-2/50">
                <td className="px-3 py-2 min-w-[240px]">
                  <button type="button" onClick={() => openVideo(v.id, v)} className="flex items-center gap-3 text-left min-w-0">
                    <span className={`relative flex-shrink-0 rounded-md overflow-hidden bg-surface-2 ${v.kind === "short" ? "w-[34px] aspect-[9/16]" : "w-[96px] aspect-video"}`}>
                      <Thumb id={v.id} kind={v.kind} sizes="96px" tint={v.colors?.[0]} />
                    </span>
                    <span className="font-semibold leading-snug line-clamp-2 hover:underline decoration-ink/30 underline-offset-2">{v.title}</span>
                  </button>
                </td>
                <td className="px-3 py-2 hidden lg:table-cell max-w-[180px]">
                  <button type="button" onClick={() => openChannel(v.channelId, v.channel)} className="flex items-center gap-2 min-w-0 text-left hover:text-ink text-ink-soft">
                    <ChannelAvatar src={v.channel.avatar} title={v.channel.title} size={22} />
                    <span className="truncate">{v.channel.title}</span>
                  </button>
                  <div className="pl-[30px] text-[11.5px] text-ink-faint">{v.channel.subs !== null ? `${compact(v.channel.subs)} subs` : ""}</div>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex flex-col items-end gap-1">
                    <Mult score={v.score} projected={v.projected} />
                    <Spike peers={v.peers} at={v.peerI} score={v.score} width={44} height={14} reserve />
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{compact(v.views)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-soft hidden 2xl:table-cell">{v.vph ? compact(v.vph) : "–"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-soft hidden 2xl:table-cell">{eng === null ? "–" : `${eng.toFixed(1)}%`}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-soft hidden xl:table-cell">{duration(v.durationS)}</td>
                <td className="px-3 py-2 text-right text-ink-soft whitespace-nowrap">
                  <TimeAgo iso={v.publishedAt} />
                </td>
                <td className="pr-2 py-2 w-10">
                  <CardMenu v={v} className="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Cards in a grid that fills the width (Shorts get tall, narrower tiles). */
export function VideoGrid({ rows: all, kind, eagerFirst = 0, className = "", hideChannel = false }: { rows: OutlierVideo[]; kind: "long" | "short"; eagerFirst?: number; className?: string; hideChannel?: boolean }) {
  const rows = useVisible(all);
  if (kind === "short")
    return (
      <ul className={`grid gap-x-3 gap-y-5 grid-cols-[repeat(auto-fill,minmax(min(46%,150px),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] ${className}`}>
        {rows.map((v, i) => (
          <li key={v.id} className="min-w-0">
            <ShortCard v={v} eager={i < eagerFirst} />
          </li>
        ))}
      </ul>
    );
  return (
    <ul className={`grid gap-x-4 gap-y-6 grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] ${className}`}>
      {rows.map((v, i) => (
        <li key={v.id} className="min-w-0">
          <VideoCard v={v} eager={i < eagerFirst} hideChannel={hideChannel} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A row of cards that scrolls sideways on phones (no long scroll for a
 * shelf) and wraps into a grid on bigger screens, cut to whole rows.
 */
export function Shelf({ rows: all, kind }: { rows: OutlierVideo[]; kind: "long" | "short" }) {
  const rows = useVisible(all);
  const short = kind === "short";
  const list = rows.slice(0, short ? 14 : 10);
  // Two whole rows at every width: 3 / 4 / 5 long videos a row, 4 / 5 / 6 / 7 Shorts.
  const show = (i: number) => (short ? (i >= 12 ? "hidden 2xl:block" : i >= 10 ? "hidden xl:block" : i >= 8 ? "hidden lg:block" : "") : i >= 8 ? "hidden 2xl:block" : i >= 6 ? "hidden lg:block" : "");
  return (
    <>
      <div className="relative md:hidden -mx-4 px-4 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        <ul className="flex gap-3 pb-1">
          {list.map((v) => (
            <li key={v.id} className={`snap-start flex-shrink-0 ${short ? "w-[42vw] max-w-[180px]" : "w-[78vw] max-w-[320px]"}`}>
              {short ? <ShortCard v={v} /> : <VideoCard v={v} />}
            </li>
          ))}
        </ul>
      </div>
      <ul className={`hidden md:grid ${short ? "gap-x-3 gap-y-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7" : "gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"}`}>
        {list.map((v, i) => (
          <li key={v.id} className={`min-w-0 ${show(i)}`}>
            {short ? <ShortCard v={v} /> : <VideoCard v={v} />}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The headline outlier (For you): the biggest one right now, large, with
 * its multiplier big in its heat colour and its spike tall enough to read.
 */
export function FeatureCard({ v }: { v: OutlierVideo }) {
  const { openVideo, openChannel } = useOutliersNav();
  const short = v.kind === "short";
  const h = heat(v.score);
  // The usual its × is measured against (1.31.8), so the line under it adds up.
  const usual = usualThen(v) ?? v.channel.usual;
  if (short) return <FeatureShort v={v} usual={usual} />;
  return (
    <article className="group relative grid rounded-2xl border border-line/10 bg-surface overflow-hidden min-w-0 h-full sm:grid-rows-[auto_1fr]">
      <div className="relative">
        <button type="button" onClick={() => openVideo(v.id, v)} aria-label={`Open “${v.title}”`} className="relative block w-full overflow-hidden bg-surface-2 aspect-video">
          <Thumb id={v.id} kind={v.kind} eager sizes="(min-width: 1180px) 50vw, 100vw" tint={v.colors?.[0]} />
          <DurationChip secs={v.durationS} />
        </button>
        <CardMenu v={v} overlay />
        <SaveButton videoId={v.id} overlay />
      </div>
      <div className="flex flex-col p-4 sm:p-5 min-w-0">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-semibold text-ink-faint">× its channel&rsquo;s usual</div>
            <div className="font-display font-bold leading-none mult text-[52px] sm:text-[64px] tracking-tight" style={{ color: h.text }}>
              {multText(v.score)}
            </div>
          </div>
          <Spike peers={v.peers} at={v.peerI} score={v.score} width={150} height={52} />
        </div>
        <h3 className="mt-3 font-display text-[19px] sm:text-[22px] leading-[1.2] font-semibold line-clamp-3 text-balance">
          <button type="button" onClick={() => openVideo(v.id, v)} className="text-left hover:underline decoration-ink/25 underline-offset-[3px]">
            {v.title}
          </button>
        </h3>
        <div className="mt-auto pt-3 flex items-center gap-2.5 min-w-0">
          <button type="button" onClick={() => openChannel(v.channelId, v.channel)} aria-label={`Open ${v.channel.title}`} className="rounded-full">
            <ChannelAvatar src={v.channel.avatar} title={v.channel.title} size={32} />
          </button>
          <div className="min-w-0 text-[12.5px]">
            <button type="button" onClick={() => openChannel(v.channelId, v.channel)} className="block font-semibold truncate hover:underline">
              {v.channel.title}
            </button>
            <span className="block text-ink-faint truncate">
              <span className="tabular-nums font-semibold text-ink-soft">{compact(v.views)}</span> views
              {usual ? <> vs {compact(usual)} usual</> : null} · <TimeAgo iso={v.publishedAt} />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * The headline Short (1.43.0; the owner: "biggest outlier shorts looks like this, awful design, make it better": a tall
 * picture squeezed into a column and cut at the sides, the words in a narrow strip with empty space under them). From a
 * tablet up it's a poster: the Short fills the two-by-two place, its multiplier as a big badge, the spike, the title
 * and the channel over a dark fade at the foot. On a phone the Short keeps its own shape beside its numbers.
 */
function FeatureShort({ v, usual }: { v: OutlierVideo; usual: number | null }) {
  const { openVideo, openChannel } = useOutliersNav();
  const h = heat(v.score);
  const meta = (
    <>
      <span className="tabular-nums font-semibold">{compact(v.views)}</span> views
      {usual ? <> vs {compact(usual)} usual</> : null} · <TimeAgo iso={v.publishedAt} />
    </>
  );
  return (
    <>
      {/* Phones: the Short beside its numbers, on a soft wash of itself. */}
      <article className="sm:hidden group relative isolate flex gap-3.5 rounded-2xl border border-line/10 bg-surface p-3 overflow-hidden min-w-0">
        <span aria-hidden className="absolute inset-0 -z-10 opacity-[0.16] pointer-events-none">
          <Thumb id={v.id} kind="short" sizes="120px" tint={v.colors?.[0]} className="scale-[2.6] blur-2xl saturate-150" />
        </span>
        <div className="relative w-[42%] max-w-[190px] flex-shrink-0">
          <button type="button" onClick={() => openVideo(v.id, v)} aria-label={`Open “${v.title}”`} className="relative block w-full aspect-[9/16] rounded-xl overflow-hidden bg-surface-2 ring-1 ring-line/10">
            <Thumb id={v.id} kind="short" eager sizes="45vw" tint={v.colors?.[0]} />
          </button>
          <CardMenu v={v} overlay />
          <SaveButton videoId={v.id} overlay />
        </div>
        <div className="min-w-0 flex-1 flex flex-col py-1">
          <div className="text-[11px] font-semibold text-ink-faint leading-tight">× its channel&rsquo;s usual</div>
          <div className="mt-1 font-display font-bold leading-none mult text-[46px] tracking-tight" style={{ color: h.text }}>
            {multText(v.score)}
          </div>
          <Spike peers={v.peers} at={v.peerI} score={v.score} width={104} height={34} className="mt-2" />
          <h3 className="mt-3 font-display text-[17px] leading-[1.22] font-semibold line-clamp-3 [overflow-wrap:anywhere]">
            <button type="button" onClick={() => openVideo(v.id, v)} className="text-left hover:underline decoration-ink/25 underline-offset-[3px]">
              {v.title}
            </button>
          </h3>
          <div className="mt-auto pt-3 min-w-0 text-[12px]">
            <button type="button" onClick={() => openChannel(v.channelId, v.channel)} className="block font-semibold truncate hover:underline max-w-full">
              {v.channel.title}
            </button>
            <span className="block text-ink-faint truncate">{meta}</span>
          </div>
        </div>
      </article>

      {/* From a tablet up: a poster of the Short; its multiplier at the top, where it's seen first, the title and the channel
          at the foot. */}
      <article className="feature-short hidden sm:block group relative isolate h-full min-h-[440px] rounded-2xl overflow-hidden bg-black ring-1 ring-line/10 min-w-0">
        <button type="button" onClick={() => openVideo(v.id, v)} aria-label={`Open “${v.title}”`} className="absolute inset-0 block">
          <Thumb id={v.id} kind="short" eager sizes="(min-width: 1400px) 420px, 50vw" tint={v.colors?.[0]} className="transition-transform duration-500 group-hover:scale-[1.03]" />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/0 via-45% to-black/90" />
        </button>
        <CardMenu v={v} overlay />
        <SaveButton videoId={v.id} overlay />
        <div className="absolute left-0 top-0 p-5 text-white pointer-events-none">
          <div className="text-[11.5px] font-semibold text-white/80 drop-shadow">× its channel&rsquo;s usual</div>
          <span
            className="mult mt-1.5 inline-flex items-center rounded-xl px-3 h-[60px] font-display font-bold text-[48px] leading-none tracking-tight shadow-[0_6px_24px_rgb(0_0_0/0.35)]"
            style={{ background: h.solid, color: h.on }}
          >
            {multText(v.score)}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5 text-white pointer-events-none">
          <h3 className="font-display text-[22px] leading-[1.18] font-semibold line-clamp-3 text-balance drop-shadow-[0_1px_8px_rgb(0_0_0/0.5)]">
            <button type="button" onClick={() => openVideo(v.id, v)} className="pointer-events-auto text-left hover:underline decoration-white/40 underline-offset-[3px]">
              {v.title}
            </button>
          </h3>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 pointer-events-auto">
              <button type="button" onClick={() => openChannel(v.channelId, v.channel)} aria-label={`Open ${v.channel.title}`} className="rounded-full ring-2 ring-white/25 flex-shrink-0">
                <ChannelAvatar src={v.channel.avatar} title={v.channel.title} size={32} />
              </button>
              <div className="min-w-0 text-[12.5px]">
                <button type="button" onClick={() => openChannel(v.channelId, v.channel)} className="block max-w-full font-semibold truncate hover:underline">
                  {v.channel.title}
                </button>
                <span className="block text-white/75 truncate">{meta}</span>
              </div>
            </div>
            <Spike peers={v.peers} at={v.peerI} score={v.score} width={96} height={36} onDark className="flex-shrink-0" />
          </div>
        </div>
      </article>
    </>
  );
}
