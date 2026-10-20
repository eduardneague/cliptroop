"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressImage, IMAGE_PRESETS, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { bgFileProblem, bgKind, bgPathFor, clampDim, DASH_BG_ACCEPT, DASH_BG_BUCKET, DASH_BG_MAX_DIM, isAnimatedPng } from "@/lib/dashboard-bg";
import { updateDashboardBackground } from "./actions";

/**
 * Settings → Preferences → Dashboard background (1.27.5): a picture, a GIF
 * or a short looping video behind your own dashboard, like a profile
 * background. Off by default; only you see it. Widgets turn frosted over it.
 */
export function DashboardBackground({
  userId,
  ready,
  on: initialOn,
  url: initialUrl,
  path: initialPath,
  dim: initialDim,
}: {
  userId: string;
  /** Migration 0092 is in. */
  ready: boolean;
  on: boolean;
  url: string | null;
  path: string | null;
  dim: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [on, setOn] = useState(initialOn);
  const [file, setFile] = useState<{ url: string; path: string } | null>(initialUrl && initialPath ? { url: initialUrl, path: initialPath } : null);
  const [dim, setDim] = useState(initialDim);
  const [busy, setBusy] = useState<null | "upload" | "save">(null);
  const [, start] = useTransition();
  const dimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (dimTimer.current && clearTimeout(dimTimer.current)), []);

  async function save(patch: Parameters<typeof updateDashboardBackground>[0], done?: string) {
    setBusy("save");
    const r = await updateDashboardBackground(patch);
    setBusy(null);
    if (r.error) {
      toast.error(r.error);
      return false;
    }
    if (done) toast.success(done);
    start(() => router.refresh());
    return true;
  }

  async function pick(original: File | undefined) {
    if (!original) return;
    const problem = bgFileProblem(original);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy("upload");
    // Photos are made a sensible size (sharp on a big screen); GIFs, videos and anything that moves stay as they are.
    let f = original;
    if (original.type === "image/jpeg" || (original.type === "image/png" && !isAnimatedPng(new Uint8Array(await original.slice(0, 64 * 1024).arrayBuffer())))) {
      f = await compressImage(original, IMAGE_PRESETS.background);
    }
    const path = bgPathFor(userId, f.name, f.type);
    if (!path) {
      setBusy(null);
      toast.error("Pick a picture, a GIF or a video.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.storage.from(DASH_BG_BUCKET).upload(path, f, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: f.type });
    if (error) {
      setBusy(null);
      toast.error(/size|large|exceed/i.test(error.message) ? "Keep it under 25 MB." : /bucket|not found/i.test(error.message) ? "This needs the latest database update (migration 0092)." : "Couldn't upload it. Try again.");
      return;
    }
    const url = supabase.storage.from(DASH_BG_BUCKET).getPublicUrl(path).data.publicUrl;
    if (await save({ path, on: true }, "Dashboard background on")) {
      setFile({ url, path });
      setOn(true);
    } else {
      // Not saved: don't leave the file behind.
      await supabase.storage.from(DASH_BG_BUCKET).remove([path]).catch(() => null);
    }
  }

  async function toggle(next: boolean) {
    if (next === on) return;
    if (next && !file) {
      input.current?.click();
      return;
    }
    setOn(next);
    if (!(await save({ on: next }, next ? "Dashboard background on" : "Dashboard background off"))) setOn(!next);
  }

  async function remove() {
    if (!file) return;
    const ok = await confirm({ title: "Remove the background?", description: "The file is deleted. You can upload another one any time.", confirmLabel: "Remove", danger: true });
    if (!ok) return;
    if (await save({ path: null, on: false }, "Background removed")) {
      setFile(null);
      setOn(false);
    }
  }

  function changeDim(v: number) {
    const d = clampDim(v);
    setDim(d);
    if (dimTimer.current) clearTimeout(dimTimer.current);
    dimTimer.current = setTimeout(() => void save({ dim: d }), 450);
  }

  const video = file ? bgKind(file.path) === "video" : false;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold">Dashboard background</div>
          <div className="text-[11.5px] text-ink-faint">
            A picture, a GIF or a short video behind your dashboard, like a profile background. Only you see it; the widgets turn frosted so it shows through.
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
              disabled={!ready || !!busy}
              onClick={() => void toggle(v)}
              className={`px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${on === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {v ? "On" : "Off"}
            </button>
          ))}
        </div>
      </div>

      {!ready ? (
        <p className="mt-3 text-[12.5px] text-ink-soft">This needs the latest database update (migration 0092).</p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,17rem)_1fr] items-start">
          {/* The preview: the file, darkened as set, with a few frosted cards on it like the widgets. */}
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={!!busy}
            aria-label={file ? "Choose another file" : "Choose a file"}
            className={`group relative aspect-video w-full rounded-xl overflow-hidden text-left ${file ? "border border-line/15" : "border-2 border-dashed border-line/20 hover:border-amber/60"} transition-colors`}
          >
            {file ? (
              <>
                {video ? (
                  <video key={file.url} src={file.url} muted loop autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )}
                <span className="absolute inset-0" style={{ background: `rgb(var(--paper) / ${dim / 100})` }} aria-hidden />
                <span className="absolute inset-3 grid grid-cols-3 grid-rows-2 gap-1.5" aria-hidden>
                  <span className="col-span-2 rounded-md dash-bg-sample" />
                  <span className="rounded-md dash-bg-sample" />
                  <span className="rounded-md dash-bg-sample" />
                  <span className="col-span-2 rounded-md dash-bg-sample" />
                </span>
                <span className={`absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[12.5px] font-semibold transition-opacity ${busy === "upload" ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
                  {busy === "upload" ? "Uploading…" : "Choose another file"}
                </span>
              </>
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-4">
                <span className="text-[13px] font-semibold text-ink">{busy === "upload" ? "Uploading…" : "Choose a file"}</span>
                <span className="text-[11.5px] text-ink-faint">A picture, a GIF or a video</span>
              </span>
            )}
          </button>

          <div className="space-y-3 min-w-0">
            <p className="text-[12px] text-ink-soft">JPG, PNG, WebP, AVIF, GIF, MP4 or WebM, up to 25 MB. Videos play muted, on a loop.</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={!!busy}
                className="rounded-lg border border-line/15 px-3.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:border-amber hover:text-amber transition-colors disabled:opacity-50"
              >
                {busy === "upload" ? "Uploading…" : file ? "Choose another" : "Choose a file"}
              </button>
              {file && (
                <button type="button" onClick={() => void remove()} disabled={!!busy} className="rounded-lg px-3 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-red hover:bg-red/10 disabled:opacity-50">
                  Remove
                </button>
              )}
              {file && on && (
                <Link href="/dashboard" className="text-[12.5px] font-semibold text-amber hover:brightness-110 ml-auto">
                  See it on your dashboard
                </Link>
              )}
            </div>
            {file && (
              <label className="block">
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
                <span id="dash-bg-dim-hint" className="block text-[11.5px] text-ink-faint">More keeps the words easy to read over a busy picture.</span>
              </label>
            )}
          </div>
        </div>
      )}
      <input ref={input} type="file" accept={DASH_BG_ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
    </div>
  );
}
