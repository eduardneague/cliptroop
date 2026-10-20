"use client";

import { compact, duration } from "../lib/filters";
import { multText } from "../lib/scores";
import type { OutlierVideo } from "../lib/types";
import { ChannelAvatar, DurationChip, heat, Mult, Spike, Thumb, TimeAgo } from "./bits";
import { useOutliersNav } from "./context";
import { SaveButton } from "./save-menu";

/*
 * Outlier videos as cards, Shorts as tall cards, and rows for lists and
 * tables (1.27.0). Every one opens the video's panel; the channel's name
 * and picture open the channel's.
 */

/** A long video's card: the thumbnail with its multiplier, the title, the channel (not on its own channel's panel), the spike. */
export function VideoCard({ v, eager = false, hideChannel = false }: { v: OutlierVideo; eager?: boolean; hideChannel?: boolean }) {
  const { openVideo, openChannel } = useOutliersNav();
  return (
    <article className="group relative flex flex-col min-w-0">
      <div className="relative">
        <button type="button" onClick={() => openVideo(v.id)} aria-label={`Open “${v.title}”`} className="relative block w-full aspect-video rounded-xl overflow-hidden bg-surface-2 ring-1 ring-line/10 transition-shadow hover:ring-line/30 focus-visible:ring-2 focus-visible:ring-amber">
          <Thumb id={v.id} kind={v.kind} eager={eager} tint={v.colors?.[0]} />
          <Mult score={v.score} projected={v.projected} on className="absolute top-2 left-2" />
          <DurationChip secs={v.durationS} />
        </button>
        <SaveButton videoId={v.id} overlay />
      </div>
      <div className="mt-2.5 flex gap-2.5 min-w-0">
        {!hideChannel && (
          <button type="button" onClick={() => openChannel(v.channelId)} aria-label={`Open ${v.channel.title}`} className="mt-0.5 rounded-full focus-visible:ring-2 focus-visible:ring-amber">
            <ChannelAvatar src={v.channel.avatar} title={v.channel.title} size={30} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold leading-snug line-clamp-2">
            <button type="button" onClick={() => openVideo(v.id)} className="text-left hover:underline decoration-ink/30 underline-offset-2">
              {v.title}
            </button>
          </h3>
          {!hideChannel && (
            <div className="mt-0.5 text-[12px] text-ink-faint truncate">
              <button type="button" onClick={() => openChannel(v.channelId)} className="hover:text-ink">
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
export function ShortCard({ v, eager = false }: { v: OutlierVideo; eager?: boolean }) {
  const { openVideo, openChannel } = useOutliersNav();
  return (
    <article className="group relative flex flex-col min-w-0">
      <div className="relative">
        <button type="button" onClick={() => openVideo(v.id)} aria-label={`Open “${v.title}”`} className="relative block w-full aspect-[9/16] rounded-xl overflow-hidden bg-surface-2 ring-1 ring-line/10 transition-shadow hover:ring-line/30 focus-visible:ring-2 focus-visible:ring-amber">
          <Thumb id={v.id} kind="short" eager={eager} sizes="(min-width: 1400px) 200px, 40vw" tint={v.colors?.[0]} />
          <Mult score={v.score} projected={v.projected} on size="sm" className="absolute top-2 left-2" />
          <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent" aria-hidden />
          <span className="absolute left-2 bottom-2 text-[12.5px] font-semibold text-white tabular-nums drop-shadow">{compact(v.views)} views</span>
        </button>
        <SaveButton videoId={v.id} overlay />
      </div>
      <h3 className="mt-2 text-[13px] font-semibold leading-snug line-clamp-2">
        <button type="button" onClick={() => openVideo(v.id)} className="text-left hover:underline decoration-ink/30 underline-offset-2">
          {v.title}
        </button>
      </h3>
      <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[11.5px] text-ink-faint">
        <button type="button" onClick={() => openChannel(v.channelId)} className="truncate hover:text-ink">
          {v.channel.title}
        </button>
        <span aria-hidden>·</span>
        <TimeAgo iso={v.publishedAt} className="flex-shrink-0" />
      </div>
    </article>
  );
}

/** One video in a list: a small thumbnail, the words, the multiplier and spike on the right. */
export function VideoRow({ v, rank, compact: tight = false, className = "" }: { v: OutlierVideo; rank?: number; compact?: boolean; className?: string }) {
  const { openVideo, openChannel } = useOutliersNav();
  const short = v.kind === "short";
  return (
    <li className={`group flex items-center min-w-0 ${tight ? "gap-2.5 py-2" : "gap-3 py-2.5"} ${className}`}>
      {rank !== undefined && <span className="w-5 text-right text-[12px] font-semibold text-ink-faint tabular-nums flex-shrink-0">{rank}</span>}
      <button type="button" onClick={() => openVideo(v.id)} aria-label={`Open “${v.title}”`} className={`relative flex-shrink-0 rounded-lg overflow-hidden bg-surface-2 ring-1 ring-line/10 ${short ? (tight ? "w-[44px]" : "w-[54px]") + " aspect-[9/16]" : tight ? "w-[96px] aspect-video" : "w-[124px] sm:w-[140px] aspect-video"}`}>
        <Thumb id={v.id} kind={v.kind} sizes={short ? "54px" : "140px"} tint={v.colors?.[0]} />
        {!short && !tight && <DurationChip secs={v.durationS} className="!bottom-1 !right-1 !text-[10px]" />}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => openVideo(v.id)} className={`block text-left font-semibold leading-snug line-clamp-2 hover:underline decoration-ink/30 underline-offset-2 ${tight ? "text-[13px]" : "text-[13.5px]"}`}>
          {v.title}
        </button>
        <div className="mt-0.5 text-[12px] text-ink-faint truncate">
          <button type="button" onClick={() => openChannel(v.channelId)} className="hover:text-ink">
            {v.channel.title}
          </button>
          {v.channel.subs !== null && <span> · {compact(v.channel.subs)} subs</span>}
        </div>
        {!tight && (
          <div className="mt-0.5 text-[12px] text-ink-soft truncate">
            <span className="tabular-nums font-semibold text-ink">{compact(v.views)}</span> views · <TimeAgo iso={v.publishedAt} />
            {v.vph !== null && v.vph > 0 && <span className="hidden sm:inline"> · {compact(v.vph)}/hour</span>}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <Mult score={v.score} projected={tight ? null : v.projected} size="sm" className="flex-col !items-end sm:flex-row sm:!items-center" />
        {tight ? <span className="text-[11.5px] tabular-nums text-ink-faint">{compact(v.views)}</span> : <Spike peers={v.peers} at={v.peerI} score={v.score} width={46} height={16} reserve />}
      </div>
    </li>
  );
}

/** Videos as a table (computers): every number in its own column. */
export function VideoTable({ rows }: { rows: OutlierVideo[] }) {
  const { openVideo, openChannel } = useOutliersNav();
  const th = "px-3 py-2.5 text-left text-[11.5px] font-semibold text-ink-faint whitespace-nowrap";
  return (
    <div className="relative rounded-2xl border border-line/10 bg-surface overflow-x-auto styled-scroll">
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
          </tr>
        </thead>
        <tbody className="divide-y divide-line/[0.07]">
          {rows.map((v) => {
            const eng = v.views ? (((v.likes ?? 0) + (v.comments ?? 0)) / v.views) * 100 : null;
            return (
              <tr key={v.id} className="hover:bg-surface-2/50">
                <td className="px-3 py-2 min-w-[240px]">
                  <button type="button" onClick={() => openVideo(v.id)} className="flex items-center gap-3 text-left min-w-0">
                    <span className={`relative flex-shrink-0 rounded-md overflow-hidden bg-surface-2 ${v.kind === "short" ? "w-[34px] aspect-[9/16]" : "w-[96px] aspect-video"}`}>
                      <Thumb id={v.id} kind={v.kind} sizes="96px" tint={v.colors?.[0]} />
                    </span>
                    <span className="font-semibold leading-snug line-clamp-2 hover:underline decoration-ink/30 underline-offset-2">{v.title}</span>
                  </button>
                </td>
                <td className="px-3 py-2 hidden lg:table-cell max-w-[180px]">
                  <button type="button" onClick={() => openChannel(v.channelId)} className="flex items-center gap-2 min-w-0 text-left hover:text-ink text-ink-soft">
                    <ChannelAvatar src={v.channel.avatar} title={v.channel.title} size={22} />
                    <span className="truncate">{v.channel.title}</span>
                  </button>
                  <div className="pl-[30px] text-[11.5px] text-ink-faint">{v.channel.subs !== null ? `${compact(v.channel.subs)} subs` : ""}</div>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex flex-col items-end gap-1">
                    <Mult score={v.score} projected={v.projected} size="sm" />
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Cards in a grid that fills the width (Shorts get tall, narrower tiles). */
export function VideoGrid({ rows, kind, eagerFirst = 0, className = "", hideChannel = false }: { rows: OutlierVideo[]; kind: "long" | "short"; eagerFirst?: number; className?: string; hideChannel?: boolean }) {
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
export function Shelf({ rows, kind }: { rows: OutlierVideo[]; kind: "long" | "short" }) {
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
  return (
    <article className={`group relative grid rounded-2xl border border-line/10 bg-surface overflow-hidden min-w-0 h-full ${short ? "grid-cols-[minmax(0,42%)_minmax(0,1fr)]" : "sm:grid-rows-[auto_1fr]"}`}>
      <div className="relative">
        <button type="button" onClick={() => openVideo(v.id)} aria-label={`Open “${v.title}”`} className={`relative block w-full overflow-hidden bg-surface-2 ${short ? "h-full aspect-[9/16]" : "aspect-video"}`}>
          <Thumb id={v.id} kind={v.kind} eager sizes="(min-width: 1180px) 50vw, 100vw" tint={v.colors?.[0]} />
          {!short && <DurationChip secs={v.durationS} />}
        </button>
        <SaveButton videoId={v.id} overlay />
      </div>
      <div className="flex flex-col p-4 sm:p-5 min-w-0">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-semibold text-ink-faint">× its channel&rsquo;s usual</div>
            <div className="font-display font-semibold leading-none mult text-[46px] sm:text-[56px]" style={{ color: h.text }}>
              {multText(v.score)}
            </div>
          </div>
          <Spike peers={v.peers} at={v.peerI} score={v.score} width={short ? 96 : 150} height={short ? 40 : 52} />
        </div>
        <h3 className="mt-3 font-display text-[19px] sm:text-[22px] leading-[1.2] font-semibold line-clamp-3 text-balance">
          <button type="button" onClick={() => openVideo(v.id)} className="text-left hover:underline decoration-ink/25 underline-offset-[3px]">
            {v.title}
          </button>
        </h3>
        <div className="mt-auto pt-3 flex items-center gap-2.5 min-w-0">
          <button type="button" onClick={() => openChannel(v.channelId)} aria-label={`Open ${v.channel.title}`} className="rounded-full">
            <ChannelAvatar src={v.channel.avatar} title={v.channel.title} size={32} />
          </button>
          <div className="min-w-0 text-[12.5px]">
            <button type="button" onClick={() => openChannel(v.channelId)} className="block font-semibold truncate hover:underline">
              {v.channel.title}
            </button>
            <span className="block text-ink-faint truncate">
              <span className="tabular-nums font-semibold text-ink-soft">{compact(v.views)}</span> views
              {v.channel.usual ? <> vs {compact(v.channel.usual)} usual</> : null} · <TimeAgo iso={v.publishedAt} />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
