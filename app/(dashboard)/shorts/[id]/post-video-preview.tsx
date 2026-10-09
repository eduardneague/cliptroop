"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { PlayIcon } from "@/components/ui/icons";
import { getPlaybackUrl } from "./review/actions";

export type PreviewVideo = { id: string; number: number; duration: number | null; width: number | null; height: number | null; deleted: boolean };

const clock = (secs: number) => {
  const t = Math.round(secs);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * The exact video file that gets posted, before it's posted: a still of
 * its first moment, and a player on tap. (TikTok and Meta both ask that
 * people can see what they're about to post.)
 */
export function PostVideoPreview({ video }: { video: PreviewVideo | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const id = video && !video.deleted ? video.id : null;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setUrl(null);
    setError(null);
    void getPlaybackUrl(id).then((r) => {
      if (!alive) return;
      if (r.error !== undefined) setError(r.error);
      else setUrl(r.url);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!video) return null;
  const facts = [
    `Version ${video.number}`,
    video.duration !== null ? clock(video.duration) : null,
    video.width && video.height ? `${video.width}×${video.height}` : null,
  ].filter(Boolean);
  const problem = video.deleted ? "This video file was cleaned up after posting." : error;

  return (
    <div className="rounded-2xl border border-line/10 bg-surface-2/30 flex items-center gap-3.5 px-3.5 sm:px-4 py-3">
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        disabled={!url}
        aria-label="Play the video that will be posted"
        className="group relative w-[54px] h-24 flex-shrink-0 overflow-hidden rounded-lg bg-ink/90 ring-1 ring-line/15 disabled:cursor-default"
      >
        {url ? (
          // #t=0.1 shows the first frame as a still (Safari draws nothing otherwise).
          <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="absolute inset-0 w-full h-full object-cover" aria-hidden tabIndex={-1} />
        ) : !problem ? (
          <span className="skeleton absolute inset-0" />
        ) : null}
        {url && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors">
            <span className="flex w-7 h-7 rounded-full bg-white/90 text-ink items-center justify-center shadow">
              <PlayIcon className="w-3.5 h-3.5 translate-x-[1px]" />
            </span>
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold leading-tight">The video that gets posted</div>
        <div className="text-[12px] text-ink-soft mt-0.5 tabular-nums">{facts.join(" · ")}</div>
        {problem ? (
          <p className="text-[12px] text-red mt-1">{problem}</p>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!url}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 -ml-2.5 text-[12.5px] font-semibold text-amber hover:bg-amber/10 disabled:opacity-50"
          >
            <PlayIcon className="w-3 h-3" />
            Preview
          </button>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Preview" description={facts.join(" · ")} width="sm:max-w-sm">
        {open && url && (
          <video src={url} controls autoPlay playsInline className="block w-full max-h-[68vh] rounded-xl bg-black object-contain" />
        )}
      </Dialog>
    </div>
  );
}
