"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressImage, IMAGE_PRESETS } from "@/lib/image/compress";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { CheckIcon, CloseIcon, PlusIcon, RetryIcon, TrashIcon } from "@/components/ui/icons";
import { bgFileProblem, bgKind, bgPathFor, clampDim, DASH_BG_ACCEPT, DASH_BG_BUCKET, DASH_BG_MAX_DIM, isAnimatedPng } from "@/lib/dashboard-bg";
import { WALLPAPER_MAX } from "@/lib/wallpapers";
import { measureFile } from "@/lib/wallpapers-measure";
import { startUpload, UploadError } from "@/lib/upload/resumable";
import { updateDashboardBackground } from "./actions";
import { addWallpaper, pickWallpaper, removeWallpaper, replaceWallpaper } from "./wallpaper-actions";

/**
 * Settings → Preferences → Dashboard background (1.27.5; saved wallpapers in
 * 1.28.0): up to three pictures, GIFs or short looping videos, one click to
 * switch, like a profile background. Off by default; only you see it.
 * Uploading shows its progress; replacing or removing one deletes the old
 * file for good, after a confirmation. The words over each are shown in the
 * colour the dashboard will use (dark or white, whichever reads best).
 */

export type WallpaperItem = { id: string; path: string; url: string; luma: number | null };

type Job = {
  /** The wallpaper being replaced, or "new". */
  slot: string;
  phase: "preparing" | "uploading" | "saving";
  share: number;
  preview: string;
  video: boolean;
  cancel?: () => void;
};

const toneStyle = (luma: number | null, dim: number): CSSProperties =>
  ({ ...(luma === null ? {} : { "--bg-luma": luma / 100 }), "--bg-dim": dim / 100 }) as CSSProperties;

export function DashboardBackground({
  userId,
  ready,
  listReady,
  on: initialOn,
  current: initialCurrent,
  dim: initialDim,
  wallpapers: initialWallpapers,
}: {
  userId: string;
  /** Migration 0092 is in (the background itself). */
  ready: boolean;
  /** Migration 0093 is in (saved wallpapers). */
  listReady: boolean;
  on: boolean;
  /** The file in use. */
  current: string | null;
  dim: number;
  wallpapers: WallpaperItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const replacing = useRef<WallpaperItem | null>(null);
  const [items, setItems] = useState<WallpaperItem[]>(initialWallpapers);
  const [current, setCurrent] = useState<string | null>(initialCurrent);
  const [on, setOn] = useState(initialOn);
  const [dim, setDim] = useState(initialDim);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState<{ id: string; kind: "use" | "remove" } | null>(null);
  const [, start] = useTransition();
  const dimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (dimTimer.current && clearTimeout(dimTimer.current)), []);

  const refresh = () => start(() => router.refresh());
  const full = items.length >= WALLPAPER_MAX;
  const locked = !ready || !listReady || !!job || !!busy;

  function choose(replace: WallpaperItem | null) {
    replacing.current = replace;
    input.current?.click();
  }

  async function picked(original: File | undefined) {
    const target = replacing.current;
    replacing.current = null;
    if (!original) return;
    const problem = bgFileProblem(original);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (target) {
      const ok = await confirm({
        title: "Replace this wallpaper?",
        description: `“${original.name}” takes its place. The old file is deleted for good as soon as the new one is up.`,
        confirmLabel: "Replace",
        danger: true,
      });
      if (!ok) return;
    } else if (full) {
      toast.error(`You can keep ${WALLPAPER_MAX} wallpapers. Remove or replace one first.`);
      return;
    }
    const video = original.type.startsWith("video/");
    const preview = URL.createObjectURL(original);
    setJob({ slot: target?.id ?? "new", phase: "preparing", share: 0, preview, video });
    const supabase = createClient();
    let path: string | null = null;
    let uploaded = false;
    try {
      // Photos are made a sensible size (sharp on a big screen); GIFs, videos and anything that moves stay as they are.
      let f: File = original;
      if (original.type === "image/jpeg" || (original.type === "image/png" && !isAnimatedPng(new Uint8Array(await original.slice(0, 64 * 1024).arrayBuffer())))) {
        f = await compressImage(original, IMAGE_PRESETS.background);
      }
      const luma = await measureFile(f, video ? "video" : "image");
      path = bgPathFor(userId, f.name, f.type);
      if (!path) throw new UploadError("type", "type");
      const upload = await startUpload({
        bucket: DASH_BG_BUCKET,
        path,
        file: f,
        contentType: f.type,
        onProgress: (share) => setJob((j) => (j ? { ...j, phase: "uploading", share } : j)),
      });
      setJob((j) => (j ? { ...j, phase: "uploading", cancel: upload.cancel } : j));
      await upload.done;
      uploaded = true;
      setJob((j) => (j ? { ...j, phase: "saving", share: 1, cancel: undefined } : j));
      const url = supabase.storage.from(DASH_BG_BUCKET).getPublicUrl(path).data.publicUrl;
      if (target) {
        const r = await replaceWallpaper(target.id, path, luma);
        if (r.error) throw new Error(r.error);
        setItems((list) => list.map((w) => (w.id === target.id ? { ...w, path: path!, url, luma } : w)));
        toast.success("Wallpaper replaced");
      } else {
        const r = await addWallpaper(path, luma);
        if (r.error || !r.id) throw new Error(r.error ?? "Couldn't save. Try again.");
        setItems((list) => [...list, { id: r.id!, path: path!, url, luma }]);
        toast.success("Wallpaper added");
      }
      setCurrent(path);
      setOn(true);
      refresh();
    } catch (e) {
      // Not saved: don't leave the file behind.
      if (uploaded && path) await supabase.storage.from(DASH_BG_BUCKET).remove([path]).then(() => null, () => null);
      if (e instanceof UploadError) {
        if (e.kind !== "cancelled") {
          toast.error(
            e.kind === "too-large"
              ? "Keep it under 25 MB."
              : e.kind === "type"
                ? "Pick a picture, a GIF or a video."
                : e.kind === "bucket"
                  ? "This needs the latest database update (migration 0092)."
                  : e.kind === "session"
                    ? "Your session expired. Sign in again."
                    : e.kind === "forbidden"
                      ? "You can only upload to your own folder. Sign in again."
                      : "The upload stopped. Check your connection and try again.",
          );
        }
      } else {
        toast.error(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
      }
    } finally {
      URL.revokeObjectURL(preview);
      setJob(null);
    }
  }

  async function switchTo(w: WallpaperItem) {
    if (locked || (w.path === current && on)) return;
    setBusy({ id: w.id, kind: "use" });
    const before = { current, on };
    setCurrent(w.path);
    setOn(true);
    const r = await pickWallpaper(w.id);
    setBusy(null);
    if (r.error) {
      setCurrent(before.current);
      setOn(before.on);
      toast.error(r.error);
      return;
    }
    toast.success("Wallpaper changed");
    refresh();
  }

  async function remove(w: WallpaperItem) {
    if (locked) return;
    const inUse = w.path === current;
    const others = items.filter((x) => x.id !== w.id).length;
    const ok = await confirm({
      title: "Remove this wallpaper?",
      description: `Its file is deleted for good right away.${inUse && on ? (others ? " Your dashboard switches to your newest other wallpaper." : " The background turns off.") : ""}`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy({ id: w.id, kind: "remove" });
    const r = await removeWallpaper(w.id);
    setBusy(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setItems((list) => list.filter((x) => x.id !== w.id));
    if (r.current !== undefined) setCurrent(r.current);
    if (r.current === null) setOn(false);
    toast.success("Wallpaper removed");
    refresh();
  }

  async function toggle(next: boolean) {
    if (next === on || locked) return;
    if (next && !items.length) {
      choose(null);
      return;
    }
    if (next && !items.some((w) => w.path === current)) {
      await switchTo(items[items.length - 1]);
      return;
    }
    setOn(next);
    const r = await updateDashboardBackground({ on: next });
    if (r.error) {
      setOn(!next);
      toast.error(r.error);
      return;
    }
    toast.success(next ? "Dashboard background on" : "Dashboard background off");
    refresh();
  }

  function changeDim(v: number) {
    const d = clampDim(v);
    setDim(d);
    if (dimTimer.current) clearTimeout(dimTimer.current);
    dimTimer.current = setTimeout(() => {
      void updateDashboardBackground({ dim: d }).then((r) => {
        if (r.error) toast.error(r.error);
        else refresh();
      });
    }, 450);
  }

  const slots: (WallpaperItem | "new")[] = [...items, ...(items.length < WALLPAPER_MAX ? (["new"] as const) : [])];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold">Dashboard background</div>
          <div className="text-[11.5px] text-ink-faint">
            Pictures, GIFs or short videos behind your dashboard, like a profile background. Keep up to {WALLPAPER_MAX} and switch with a click. Only you see them. With glass on
            (above), the widgets let them show through; with glass off they stay solid.
          </div>
        </div>
        <div role="radiogroup" aria-label="Dashboard background" className="inline-flex rounded-lg border border-line/15 p-0.5 flex-shrink-0">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={on === v}
              data-sound="none"
              disabled={locked}
              onClick={() => void toggle(v)}
              className={`px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${on === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {v ? "On" : "Off"}
            </button>
          ))}
        </div>
      </div>

      {!ready || !listReady ? (
        <p className="mt-3 text-[12.5px] text-ink-soft">This needs the latest database update (migration {ready ? "0093" : "0092"}).</p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3" aria-label="Your wallpapers">
            {slots.map((w) => {
              if (w === "new") {
                const uploading = job?.slot === "new" ? job : null;
                return (
                  <li key="new">
                    {uploading ? (
                      <UploadTile job={uploading} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => choose(null)}
                        disabled={locked}
                        className="group w-full aspect-video rounded-xl border-2 border-dashed border-line/20 hover:border-amber/60 focus-visible:outline-none focus-visible:border-amber flex flex-col items-center justify-center gap-1 text-center px-3 transition-colors disabled:opacity-50"
                      >
                        <span className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-soft group-hover:text-amber transition-colors">
                          <PlusIcon className="w-4 h-4" strokeWidth={2.25} />
                        </span>
                        <span className="text-[12.5px] font-semibold text-ink">{items.length ? "Add another" : "Add a wallpaper"}</span>
                        <span className="text-[11px] text-ink-faint">
                          {items.length}/{WALLPAPER_MAX} saved
                        </span>
                      </button>
                    )}
                  </li>
                );
              }
              const uploading = job?.slot === w.id ? job : null;
              const inUse = w.path === current;
              const video = bgKind(w.path) === "video";
              return (
                <li key={w.id} className="min-w-0">
                  {uploading ? (
                    <UploadTile job={uploading} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => void switchTo(w)}
                      disabled={locked && busy?.id !== w.id}
                      aria-pressed={inUse && on}
                      aria-label={inUse && on ? "In use" : "Use this wallpaper"}
                      className={`wall-tone group relative block w-full aspect-video rounded-xl overflow-hidden text-left transition-shadow focus-visible:outline-none ${
                        inUse ? (on ? "ring-2 ring-amber ring-offset-2 ring-offset-surface" : "ring-2 ring-line/30 ring-offset-2 ring-offset-surface") : "ring-1 ring-line/15 hover:ring-line/35 focus-visible:ring-2 focus-visible:ring-amber"
                      }`}
                      style={toneStyle(w.luma, dim)}
                    >
                      {video ? (
                        <video src={w.url} muted loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" onMouseEnter={(e) => void e.currentTarget.play().catch(() => null)} onMouseLeave={(e) => e.currentTarget.pause()} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      <span className="absolute inset-0" style={{ background: `rgb(var(--paper) / ${dim / 100})` }} aria-hidden />
                      {/* The words in the colour the dashboard will use over it. */}
                      <span className="wall-words absolute left-2.5 top-2 right-2.5 font-display text-[13px] font-semibold leading-tight truncate" aria-hidden>
                        Good morning
                      </span>
                      <span className="absolute left-2.5 right-2.5 bottom-2 grid grid-cols-3 gap-1" aria-hidden>
                        <span className="col-span-2 h-3 rounded-[4px] dash-bg-sample" />
                        <span className="h-3 rounded-[4px] dash-bg-sample" />
                      </span>
                      {inUse && on && (
                        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber text-white text-[10.5px] font-bold pl-1.5 pr-2 h-5 shadow">
                          <CheckIcon className="w-3 h-3" />
                          In use
                        </span>
                      )}
                      {busy?.id === w.id && busy.kind === "remove" && <span className="absolute inset-0 bg-black/45 flex items-center justify-center text-white text-[12px] font-semibold">Removing…</span>}
                    </button>
                  )}
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="text-[11px] text-ink-faint truncate flex-1 min-w-0">{video ? "Video" : /\.gif$/i.test(w.path) ? "GIF" : "Picture"}</span>
                    <button
                      type="button"
                      onClick={() => choose(w)}
                      disabled={locked}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 h-7 text-[11.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50"
                    >
                      <RetryIcon className="w-3.5 h-3.5" />
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(w)}
                      disabled={locked}
                      aria-label="Remove this wallpaper"
                      className="inline-flex items-center rounded-md px-1.5 h-7 text-ink-soft hover:text-red hover:bg-red/10 disabled:opacity-50"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <p className="text-[12px] text-ink-soft flex-1 min-w-[14rem]">
              JPG, PNG, WebP, AVIF, GIF, MP4 or WebM, up to 25 MB each. Videos play muted, on a loop. The greeting over it turns dark or white, whichever reads best.
            </p>
            {on && current && (
              <Link href="/dashboard" className="text-[12.5px] font-semibold text-amber hover:brightness-110">
                See it on your dashboard
              </Link>
            )}
          </div>
          {items.length > 0 && (
            <label className="block mt-3 max-w-md">
              <span className="flex items-center justify-between text-[12.5px] font-semibold mb-1">
                <span>Darken it</span>
                <span className="text-ink-faint font-medium tabular-nums">{dim}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={DASH_BG_MAX_DIM}
                step={5}
                value={dim}
                onChange={(e) => changeDim(Number(e.target.value))}
                className="w-full accent-[rgb(var(--amber))]"
                aria-describedby="dash-bg-dim-hint"
              />
              <span id="dash-bg-dim-hint" className="block text-[11.5px] text-ink-faint">
                More keeps the widgets easy to read over a busy picture.
              </span>
            </label>
          )}
        </>
      )}
      <input ref={input} type="file" accept={DASH_BG_ACCEPT} className="hidden" onChange={(e) => void picked(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
    </div>
  );
}

/** A wallpaper on its way up: the file itself, dimmed, with how far it's got. */
function UploadTile({ job }: { job: Job }) {
  const pct = Math.round(job.share * 100);
  const label = job.phase === "preparing" ? "Getting it ready…" : job.phase === "saving" ? "Saving…" : `Uploading ${pct}%`;
  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden ring-2 ring-amber/60 ring-offset-2 ring-offset-surface" role="status" aria-live="polite" aria-label={label}>
      {job.video ? (
        <video src={job.preview} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={job.preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <span className="absolute inset-0 bg-black/50" aria-hidden />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-white">
        <span className="text-[12.5px] font-semibold tabular-nums drop-shadow">{label}</span>
        <span className="w-full max-w-[11rem] h-1.5 rounded-full bg-white/25 overflow-hidden">
          {job.phase === "uploading" ? (
            <span className="block h-full rounded-full bg-white transition-[width] duration-200 ease-out" style={{ width: `${Math.max(3, pct)}%` }} />
          ) : (
            <span className="block h-full w-1/3 rounded-full bg-white animate-[splash-slide_1.1s_ease-in-out_infinite]" />
          )}
        </span>
      </span>
      {job.cancel && (
        <button
          type="button"
          onClick={job.cancel}
          aria-label="Cancel the upload"
          className="absolute right-1.5 top-1.5 w-7 h-7 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
