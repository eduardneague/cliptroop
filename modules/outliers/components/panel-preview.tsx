"use client";

import { useEffect, useState } from "react";
import { PlayIcon } from "@/components/ui/icons";
import { compact, duration } from "../lib/filters";
import { BAND_LABEL, band, multText, usualThen } from "../lib/scores";
import type { OutlierVideo } from "../lib/types";
import { ChannelAvatar, heat, Thumb, Tile, TimeAgo } from "./bits";
import { channelPreviews, previews, type Panel } from "./context";
import { PanelContent } from "./panel";

/*
 * What a panel shows before its own code and numbers are there (1.31.8). It's in the page's own code (the panels'
 * code comes in its own piece), so the first click on a video opens the panel at once with what the card knew:
 * the player, the title, the headline numbers. Before, the page itself went back to its loading screen until the
 * panels' code arrived, and only then did the panel slide in.
 *
 * The video and channel panels show the same pictures while their numbers load, so nothing jumps when they arrive.
 */

/** Stand-in while the panels' code arrives: the same frame contents a video's or channel's panel starts with. */
export function PanelLoading({ panel }: { panel: Panel }) {
  if (panel.type === "video") {
    const v = previews.get(panel.id) ?? null;
    return (
      <PanelContent
        label={v ? v.title : "Video"}
        bodyKey={`v:${panel.id}`}
        header={
          v ? (
            <span className="flex items-center gap-2.5 min-w-0 py-1 pl-1">
              <ChannelAvatar src={v.channel.avatar} title={v.channel.title} size={32} />
              <span className="min-w-0 text-left">
                <span className="block text-[13.5px] font-semibold truncate">{v.channel.title}</span>
                <span className="block text-[11.5px] text-ink-faint truncate">{v.channel.subs !== null ? `${compact(v.channel.subs)} subscribers` : "Subscribers hidden"}</span>
              </span>
            </span>
          ) : (
            <span className="text-[13.5px] font-semibold text-ink-soft">Opening…</span>
          )
        }
      >
        {v ? <VideoPreviewBody v={v} /> : <VideoSkeleton />}
      </PanelContent>
    );
  }
  const pre = channelPreviews.get(panel.id) ?? null;
  return (
    <PanelContent label={pre ? pre.title : "Channel"} bodyKey={`c:${panel.id}`} header={<span className="text-[13.5px] font-semibold truncate min-w-0">{pre ? pre.title : "Opening…"}</span>}>
      <ChannelLoadingBody pre={pre} />
    </PanelContent>
  );
}

/**
 * A video's panel, top to bottom: the player, what's beside it (a Short) or under it, then the rest. The video's
 * panel draws this in the same place while its numbers load and once they're in, so a video started straight away
 * goes on playing (1.34.5, the owner: "the video tries to play, then doesnt play and then you have to click it
 * again": the player used to be built anew when the numbers arrived).
 */
export function VideoTop({ video, busy = false, side, children }: { video: Pick<OutlierVideo, "id" | "kind" | "title">; busy?: boolean; side: React.ReactNode; children: React.ReactNode }) {
  const short = video.kind === "short";
  return (
    <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-7" aria-busy={busy || undefined}>
      <div className={short ? "grid gap-5 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] items-start" : "space-y-4"}>
        <Player id={video.id} short={short} title={video.title} />
        <div className="min-w-0 space-y-4">{side}</div>
      </div>
      {children}
    </div>
  );
}

/** Beside the player before the numbers are in: what the card knew (the title, the headline numbers). */
export function PreviewSide({ v }: { v: OutlierVideo }) {
  const short = v.kind === "short";
  const h = heat(v.score);
  const then = usualThen(v);
  const usual = then ?? v.channel.usual;
  return (
    <>
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
          <div className="mt-1 text-[11.5px] text-ink-soft truncate">{then && v.views ? `${compact(v.views)} ÷ ${compact(then)}` : BAND_LABEL[band(v.score)]}</div>
        </div>
        <Tile label="Views" value={compact(v.views)} sub={usual ? `usual ${compact(usual)}` : undefined} />
        <Tile label="Views per hour" value={v.vph ? compact(v.vph) : "–"} />
        <Tile label="Likes" value={compact(v.likes)} />
      </div>
    </>
  );
}

/** Under it, until the rest is in. */
export function PreviewRest() {
  return <div className="skeleton h-44 w-full rounded-2xl" />;
}

/** The panel's first picture of a video, from what the card knew, while the panels' own code arrives. */
function VideoPreviewBody({ v }: { v: OutlierVideo }) {
  return (
    <VideoTop video={v} busy side={<PreviewSide v={v} />}>
      <PreviewRest />
    </VideoTop>
  );
}

/** A video opened from a link (nothing known yet): the panel's shape. */
export function VideoSkeleton() {
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

/** A channel's panel while it loads: its name and picture when the button that opened it knew them. */
export function ChannelLoadingBody({ pre }: { pre: { title: string; avatar: string | null; subs: number | null } | null }) {
  return (
    <div className="px-4 sm:px-6 py-5 space-y-7" aria-busy="true">
      {pre ? (
        // Where the loaded header will be, so nothing moves when it arrives.
        <div className="flex items-start gap-4">
          <ChannelAvatar src={pre.avatar} title={pre.title} size={68} />
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-[23px] sm:text-[26px] leading-tight font-semibold">{pre.title}</h2>
            <p className="mt-1 text-[12.5px] text-ink-soft">{pre.subs !== null ? `${compact(pre.subs)} subscribers` : "Opening its videos…"}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="skeleton w-16 h-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-6 w-1/2 rounded-md" />
            <div className="skeleton h-4 w-1/3 rounded-md" />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[72px] rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-48 rounded-2xl" />
    </div>
  );
}

/*
 * Play pressed, by video (1.34.5). A player built anew in the same moment (the panels' own code arriving puts a new
 * panel where the stand-in was) starts playing at once instead of showing its picture again; once a video's player
 * has been gone a moment (the panel closed, another video opened), it starts from its picture again.
 */
const pressed = new Map<string, ReturnType<typeof setTimeout> | null>();

/** The video: its thumbnail with a play button, then YouTube's player once pressed. */
export function Player({ id, short, title }: { id: string; short: boolean; title: string }) {
  const [on, setOn] = useState(() => ({ id, play: pressed.has(id) }));
  // Another video in the same place: its picture first (unless it was just playing).
  if (on.id !== id) setOn({ id, play: pressed.has(id) });
  const play = on.id === id && on.play;
  useEffect(() => {
    if (!play) return;
    const later = pressed.get(id);
    if (later) clearTimeout(later);
    pressed.set(id, null);
    return () => {
      pressed.set(
        id,
        setTimeout(() => pressed.delete(id), 1500)
      );
    };
  }, [play, id]);
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
        <button type="button" onClick={() => setOn({ id, play: true })} className="group/play absolute inset-0" aria-label={`Play “${title}”`}>
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
