"use client";

import { useEffect, useId, useState } from "react";
import { ReviewPlayer } from "@/modules/review/components/player";
import { LengthNotes } from "@/modules/review/components/video-card";
import { ChevronDownIcon, PlayIcon } from "@/components/ui/icons";
import { clock } from "@/lib/short-length";
import { getPlaybackUrl } from "./review/actions";

export type PreviewVideo = { id: string; number: number; duration: number | null; width: number | null; height: number | null; deleted: boolean };

/**
 * The exact file that gets posted, at the top of the Posting card, always
 * (before, during and after posting). Closed by default: one bar with the
 * version and its length; open it to watch in the same player as the review
 * page (its keys only while it has focus). The file is only fetched once it's
 * opened. Below it, always, anything that makes it too long for a platform
 * it's planned for. (TikTok and Meta both ask that people can see what they
 * post: it's one click away.)
 */
export function PostVideoPreview({ video, platforms }: { video: PreviewVideo | null; platforms: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyId = useId();

  const id = video && !video.deleted ? video.id : null;
  // Fetched the first time it's opened (and again for a new version).
  useEffect(() => {
    if (!id || !open) return;
    let alive = true;
    setError(null);
    void getPlaybackUrl(id).then((r) => {
      if (!alive) return;
      if (r.error !== undefined) setError(r.error);
      else setUrl(r.url);
    });
    return () => {
      alive = false;
    };
  }, [id, open]);
  useEffect(() => setUrl(null), [id]);

  if (!video) return null;
  const facts = [
    `Version ${video.number}`,
    video.duration !== null ? clock(video.duration) : null,
    video.width && video.height ? `${video.width}×${video.height}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-2.5">
      <div className={`rounded-2xl border overflow-hidden transition-colors ${open ? "border-line/15" : "border-line/10 bg-surface-2/30"}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber"
        >
          <span className="w-9 h-9 rounded-lg bg-black/85 text-white flex items-center justify-center flex-shrink-0" aria-hidden>
            <PlayIcon className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[13.5px] font-semibold">The video that gets posted</span>
            <span className="block text-[12px] text-ink-soft tabular-nums truncate">{facts.join(" · ")}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft flex-shrink-0">
            {open ? "Hide" : "Watch"}
            <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
        {open && (
          <div id={bodyId} className="border-t border-line/10 p-2 sm:p-2.5">
            {video.deleted ? (
              <p className="rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-[13px] text-ink-soft">
                This video&rsquo;s file was cleaned up after posting (Team → Defaults → Video files). The posts themselves stay.
              </p>
            ) : (
              <ReviewPlayer
                // #t: Safari only draws the first frame as a still when asked for a moment.
                src={url ? `${url}#t=0.001` : null}
                error={error}
                markers={[]}
                shortcuts="focus"
                preload="metadata"
                stageClass="h-[48vh] sm:h-[min(58vh,560px)]"
              />
            )}
          </div>
        )}
      </div>
      <LengthNotes duration={video.duration} platforms={platforms} className="" />
    </div>
  );
}
