"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPlaybackUrl } from "@/app/(dashboard)/shorts/[id]/review/actions";
import { Select } from "@/components/ui/select";
import { formatTime } from "../lib/limits";
import type { VideoVersion } from "../lib/queries";

const FRAME = 1 / 30;
const SPEEDS = [0.5, 1, 1.5, 2];

function useSignedUrl(versionId: string | null) {
  const [state, setState] = useState<{ url: string | null; error: string | null }>({ url: null, error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ url: null, error: null });
    if (!versionId) return;
    void getPlaybackUrl(versionId).then((res) => {
      if (cancelled) return;
      setState(res.error !== undefined ? { url: null, error: res.error } : { url: res.url, error: null });
    });
    return () => {
      cancelled = true;
    };
  }, [versionId]);
  return state;
}

/**
 * Two versions side by side. One set of controls drives both: play,
 * pause, scrub, frame step and speed stay in sync. Keyboard: Space/K,
 * J/L, , and .
 */
export function CompareView({ versions, onClose }: { versions: VideoVersion[]; onClose: () => void }) {
  const live = versions.filter((v) => !v.deleted).sort((a, b) => a.number - b.number);
  const [leftId, setLeftId] = useState(live[live.length - 2]?.id ?? live[0]?.id ?? null);
  const [rightId, setRightId] = useState(live[live.length - 1]?.id ?? null);
  const left = useSignedUrl(leftId);
  const right = useSignedUrl(rightId);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loaded, setLoaded] = useState({ a: false, b: false });

  const both = useCallback((fn: (v: HTMLVideoElement) => void) => {
    [a.current, b.current].forEach((v) => v && fn(v));
  }, []);

  const seek = useCallback(
    (t: number) => {
      const target = Math.max(0, Math.min(t, duration || t));
      setTime(target);
      both((v) => {
        v.currentTime = Math.min(target, v.duration || target);
      });
    },
    [both, duration]
  );

  const toggle = useCallback(() => {
    if (playing) {
      both((v) => v.pause());
      setPlaying(false);
    } else {
      // Line them up before playing so they stay in step.
      const t = a.current?.currentTime ?? 0;
      both((v) => {
        v.currentTime = Math.min(t, v.duration || t);
        void v.play();
      });
      setPlaying(true);
    }
  }, [both, playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") {
        e.preventDefault();
        toggle();
      } else if (k === "j") seek(time - 5);
      else if (k === "l") seek(time + 5);
      else if (e.key === ",") {
        both((v) => v.pause());
        setPlaying(false);
        seek(time - FRAME);
      } else if (e.key === ".") {
        both((v) => v.pause());
        setPlaying(false);
        seek(time + FRAME);
      } else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seek, time, both, onClose]);

  const options = live.map((v) => ({ value: v.id, label: `v${v.number}`, hint: v.fileName }));
  const pct = duration ? (time / duration) * 100 : 0;

  const side = (
    ref: React.RefObject<HTMLVideoElement | null>,
    src: { url: string | null; error: string | null },
    id: string | null,
    setId: (v: string) => void,
    key: "a" | "b"
  ) => (
    <div className="min-w-0 flex flex-col gap-2">
      <div className="w-40">
        <Select value={id} onChange={(v) => v && setId(v)} options={options} ariaLabel={key === "a" ? "Left version" : "Right version"} />
      </div>
      <div className="relative flex items-center justify-center rounded-2xl bg-black overflow-hidden" style={{ height: "min(62vh, 700px)" }}>
        {src.url && (
          <video
            ref={ref}
            key={src.url}
            src={src.url}
            playsInline
            muted={key === "b"}
            preload="auto"
            className="max-h-full max-w-full"
            onLoadedMetadata={(e) => {
              setLoaded((l) => ({ ...l, [key]: true }));
              setDuration((d) => Math.max(d, e.currentTarget.duration || 0));
              e.currentTarget.currentTime = Math.min(time, e.currentTarget.duration || time);
              e.currentTarget.playbackRate = speed;
            }}
            onTimeUpdate={(e) => key === "a" && setTime(e.currentTarget.currentTime)}
            onEnded={() => setPlaying(false)}
          />
        )}
        {src.error && <p className="text-white/70 text-[13px] px-6 text-center">{src.error}</p>}
        {!src.error && (!src.url || !loaded[key]) && (
          <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Loading">
            <div className="h-[86%] aspect-[9/16] rounded-xl bg-white/[0.06] animate-pulse" />
            <span className="absolute w-7 h-7 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 animate-[modalin_.2s_ease]">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {side(a, left, leftId, (v) => { setLeftId(v); setLoaded((l) => ({ ...l, a: false })); }, "a")}
        {side(b, right, rightId, (v) => { setRightId(v); setLoaded((l) => ({ ...l, b: false })); }, "b")}
      </div>

      <div className="rounded-2xl bg-[#0d0c0a] px-3 pt-3 pb-2">
        <div
          ref={bar}
          role="slider"
          aria-label="Seek both"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          onPointerDown={(e) => {
            const r = bar.current!.getBoundingClientRect();
            seek(((e.clientX - r.left) / r.width) * duration);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            const r = bar.current!.getBoundingClientRect();
            seek(((e.clientX - r.left) / r.width) * duration);
          }}
          className="relative h-5 cursor-pointer flex items-center"
        >
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/15" />
          <div className="absolute left-0 h-1.5 rounded-full bg-amber" style={{ width: `${pct}%` }} />
          <div className="absolute -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow" style={{ left: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-1 mt-1 text-white">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause both" : "Play both"} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10">
            {playing ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
            )}
          </button>
          <span className="ml-1 text-[12.5px] tabular-nums text-white/85">
            {formatTime(time, true)} <span className="text-white/45">/ {formatTime(duration)}</span>
          </span>
          <span className="hidden sm:inline ml-3 text-[11.5px] text-white/45">Sound from the left video</span>
          <span className="flex-1" />
          <div className="flex items-center rounded-lg bg-white/5 p-0.5" role="radiogroup" aria-label="Speed">
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                type="button"
                role="radio"
                aria-checked={speed === sp}
                onClick={() => {
                  setSpeed(sp);
                  both((v) => (v.playbackRate = sp));
                }}
                className={`px-1.5 h-7 rounded-md text-[11.5px] font-semibold ${speed === sp ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
              >
                {sp}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
