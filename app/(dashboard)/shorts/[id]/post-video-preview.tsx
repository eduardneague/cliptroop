"use client";

import { useEffect, useState } from "react";
import { ReviewPlayer } from "@/modules/review/components/player";
import { LengthNotes } from "@/modules/review/components/video-card";
import { clock } from "@/lib/short-length";
import { getPlaybackUrl } from "./review/actions";

export type PreviewVideo = { id: string; number: number; duration: number | null; width: number | null; height: number | null; deleted: boolean };

/**
 * The exact file that gets posted, at the top of the Posting card, always
 * (before, during and after posting): the same player as the review page,
 * a bit shorter, its keys only while it has focus. Below it, anything that
 * makes it too long for a platform it's planned for. (TikTok and Meta both
 * ask that people can see what they post.)
 */
export function PostVideoPreview({ video, platforms }: { video: PreviewVideo | null; platforms: readonly string[] }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h3 className="text-[13.5px] font-semibold">The video that gets posted</h3>
        <span className="text-[12px] text-ink-soft tabular-nums">{facts.join(" · ")}</span>
      </div>
      {video.deleted ? (
        <p className="rounded-2xl border border-dashed border-line/20 px-4 py-8 text-center text-[13px] text-ink-soft">
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
      <LengthNotes duration={video.duration} platforms={platforms} className="" />
    </div>
  );
}
