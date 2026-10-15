"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReviewPlayer } from "@/modules/review/components/player";
import { ChevronDownIcon, DownloadIcon, PlayIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { formatBytes, formatTime } from "@/modules/review/lib/limits";
import { playbackUrl } from "@/modules/review/lib/playback";
import { getLongDownloadUrl, setLongKeepMedia } from "./review/actions";

export type LongFile = {
  id: string;
  number: number;
  fileName: string;
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  deleted: boolean;
};

/**
 * Post step (1.25.0): the edit that gets posted (the approved version, else
 * the latest), to watch or download for uploading to YouTube. Its file is
 * deleted a while after posting (Team → Defaults); masters and schedulers can
 * keep it.
 */
export function LongVideoFile({
  projectId,
  video,
  approved,
  keepDays,
  keep,
  canKeep,
}: {
  projectId: string;
  video: LongFile;
  approved: boolean;
  keepDays: number;
  keep: boolean;
  canKeep: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [saving, start] = useTransition();
  const bodyId = useId();

  // The file is only fetched once it's opened.
  useEffect(() => {
    if (!open || video.deleted) return;
    let alive = true;
    setError(null);
    void playbackUrl(video.id, "long").then((r) => {
      if (!alive) return;
      if (r.url) setUrl(r.url);
      else setError(r.error ?? "Couldn't open the video.");
    });
    return () => {
      alive = false;
    };
  }, [open, video.id, video.deleted]);

  async function download() {
    setDownloading(true);
    const r = await getLongDownloadUrl(video.id);
    setDownloading(false);
    if (r.error !== undefined) {
      toast.error(r.error);
      return;
    }
    window.location.assign(r.url);
  }

  const facts = [
    `v${video.number}`,
    video.duration !== null ? formatTime(video.duration) : null,
    video.width && video.height ? `${video.width}×${video.height}` : null,
    formatBytes(video.size),
  ].filter(Boolean);

  return (
    <section className="rounded-2xl border border-line/10 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
        <span className="w-9 h-9 rounded-lg bg-black/85 text-white flex items-center justify-center flex-shrink-0" aria-hidden>
          <PlayIcon className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[13.5px] font-semibold">{approved ? "The approved edit" : "The latest edit"}</span>
          <span className="block text-[12px] text-ink-soft tabular-nums truncate">{facts.join(" · ")}</span>
        </span>
        {!video.deleted && (
          <span className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={bodyId}
              className="inline-flex items-center gap-1 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30"
            >
              {open ? "Hide" : "Watch"}
              <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => void download()}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white px-3 h-8 text-[12.5px] font-bold hover:brightness-110 disabled:opacity-60"
            >
              {downloading ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />
              ) : (
                <DownloadIcon className="w-4 h-4" strokeWidth={2} />
              )}
              Download
            </button>
          </span>
        )}
      </div>

      {open && !video.deleted && (
        <div id={bodyId} className="border-t border-line/10 p-2 sm:p-2.5">
          <ReviewPlayer
            // #t: Safari only draws the first frame as a still when asked for a moment.
            src={url ? `${url}#t=0.001` : null}
            error={error}
            markers={[]}
            shortcuts="focus"
            preload="metadata"
            wide
            stageClass="aspect-video max-h-[min(58vh,560px)]"
          />
        </div>
      )}

      <div className="border-t border-line/10 bg-surface-2/30 px-3.5 py-2.5 flex items-center gap-3 flex-wrap text-[12.5px]">
        <span className="text-ink-soft flex-1 min-w-0">
          {video.deleted
            ? "The file was deleted after posting. The posts themselves stay."
            : keep
              ? "This file is kept after posting."
              : `The file is deleted ${keepDays} day${keepDays === 1 ? "" : "s"} after posting (Team → Defaults).`}
        </span>
        {canKeep && !video.deleted && (
          <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={keep}
              disabled={saving}
              onChange={(e) => {
                const next = e.target.checked;
                start(async () => {
                  const r = await setLongKeepMedia(projectId, next);
                  if (r.error !== undefined) toast.error(r.error);
                  else {
                    toast.success(next ? "The file will be kept" : "The file will be deleted after posting");
                    router.refresh();
                  }
                });
              }}
              className="accent-[rgb(var(--amber))]"
            />
            Keep the file
          </label>
        )}
      </div>
    </section>
  );
}
