"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { formatTime } from "../lib/limits";

export type Marker = {
  id: string;
  time: number;
  resolved: boolean;
  label: string;
  /** Who wrote the note: shown as their picture on the timeline. */
  author?: { name: string; avatarUrl: string | null; color: string } | null;
};
export type PlayerHandle = { seek: (t: number) => void; pause: () => void; time: () => number };

const FRAME = 1 / 30;
const SPEEDS = [0.5, 1, 1.5, 2];

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT");
}

/**
 * Review player. Keyboard (when not typing): Space/K play, J/L ±5s,
 * ←/→ ±1s, , and . one frame, F fullscreen, M mute.
 */
export const ReviewPlayer = forwardRef<
  PlayerHandle,
  {
    src: string | null;
    error?: string | null;
    markers: Marker[];
    onTime?: (t: number) => void;
    onMarker?: (id: string) => void;
    /** Fired when a jump finishes (the new frame is ready). */
    onSeeked?: () => void;
  }
>(function ReviewPlayer({ src, error, markers, onTime, onMarker, onSeeked }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [seeking, setSeeking] = useState(false);

  // Jumps feel instant: move the playhead right away, show a small
  // spinner until the browser has the new frame.
  const seek = useCallback(
    (t: number) => {
      const v = video.current;
      if (!v) return;
      const target = Math.min(Math.max(0, t), v.duration || t);
      setTime(target);
      onTime?.(target);
      setSeeking(true);
      v.currentTime = target;
    },
    [onTime]
  );

  useImperativeHandle(ref, () => ({
    seek,
    pause: () => video.current?.pause(),
    time: () => video.current?.currentTime ?? 0,
  }));

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  useEffect(() => {
    setReady(false);
    setTime(0);
    setPlaying(false);
    // A cached video can finish loading before React attaches its
    // listeners; read the state directly so we never miss it.
    const v = video.current;
    if (v && v.readyState >= 1) {
      setDuration(v.duration || 0);
      setReady(true);
    }
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = video.current;
      if (!v) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") {
        e.preventDefault();
        toggle();
      } else if (k === "j") seek(v.currentTime - 5);
      else if (k === "l") seek(v.currentTime + 5);
      else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(v.currentTime - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(v.currentTime + 1);
      } else if (e.key === ",") {
        v.pause();
        seek(v.currentTime - FRAME);
      } else if (e.key === ".") {
        v.pause();
        seek(v.currentTime + FRAME);
      } else if (k === "f") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void box.current?.requestFullscreen?.();
      } else if (k === "m") {
        v.muted = !v.muted;
        setMuted(v.muted);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, toggle]);

  function scrubTo(clientX: number) {
    const r = bar.current?.getBoundingClientRect();
    if (!r || !duration) return;
    seek(((clientX - r.left) / r.width) * duration);
  }

  const pct = duration ? (time / duration) * 100 : 0;
  const btn = "w-9 h-9 rounded-lg flex items-center justify-center text-white/85 hover:text-white hover:bg-white/10 transition-colors";

  return (
    <div ref={box} className="group relative w-full rounded-2xl overflow-hidden bg-black select-none">
      {/* Shorter on phones so the controls clear the floating Notes / + buttons. */}
      <div className="relative flex items-center justify-center bg-black h-[50vh] lg:h-[min(72vh,780px)]">
        {src ? (
          <video
            ref={video}
            key={src}
            src={src}
            playsInline
            preload="metadata"
            className="max-h-full max-w-full"
            onClick={toggle}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0);
              setReady(true);
            }}
            onTimeUpdate={(e) => {
              setTime(e.currentTarget.currentTime);
              onTime?.(e.currentTarget.currentTime);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onSeeked={() => {
              setSeeking(false);
              onSeeked?.();
            }}
            onWaiting={() => setSeeking(true)}
            onPlaying={() => setSeeking(false)}
          />
        ) : error ? (
          <p className="text-white/70 text-[13.5px] px-6 text-center">{error}</p>
        ) : null}
        {/* Skeleton while the video loads. */}
        {(!src || !ready) && !error && (
          <div className="absolute inset-0 flex items-center justify-center" aria-label="Loading the video" role="status">
            <div className="h-[86%] aspect-[9/16] rounded-xl bg-white/[0.06] animate-pulse" />
            <span className="absolute w-8 h-8 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          </div>
        )}
        {ready && seeking && (
          <span className="absolute top-3 right-3 w-6 h-6 rounded-full border-2 border-white/25 border-t-white animate-spin" aria-label="Loading" />
        )}
      </div>

      {/* Controls */}
      <div className="bg-[#0d0c0a] px-3 pt-5 pb-2">
        <div
          ref={bar}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            scrubTo(e.clientX);
          }}
          onPointerMove={(e) => e.buttons === 1 && scrubTo(e.clientX)}
          className="relative h-6 cursor-pointer flex items-center"
        >
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/15" />
          <div className="absolute left-0 h-1.5 rounded-full bg-amber" style={{ width: `${pct}%` }} />
          {duration > 0 &&
            markers.map((m) => (
              <button
                key={m.id}
                type="button"
                title={`${formatTime(m.time)} · ${m.author?.name ?? ""}: ${m.label}`}
                aria-label={`Note at ${formatTime(m.time)}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  seek(m.time);
                  onMarker?.(m.id);
                }}
                className={`absolute -translate-x-1/2 -top-[15px] z-10 rounded-full ring-2 transition-transform duration-200 hover:scale-125 hover:z-20 ${
                  m.resolved ? "ring-white/30 opacity-50 grayscale" : "ring-amber"
                }`}
                style={{ left: `${(m.time / duration) * 100}%` }}
              >
                {m.author ? (
                  <span className="block w-5 h-5 rounded-full overflow-hidden text-[8.5px] font-bold text-white flex items-center justify-center" style={{ background: m.author.color }}>
                    {m.author.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      m.author.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                ) : (
                  <span className={`block w-2.5 h-2.5 rounded-full ${m.resolved ? "bg-white/40" : "bg-amber"}`} />
                )}
              </button>
            ))}
          <div className="absolute -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow" style={{ left: `${pct}%` }} />
        </div>

        <div className="flex items-center gap-1 mt-1">
          <button type="button" className={btn} onClick={toggle} aria-label={playing ? "Pause" : "Play"} title="Play / pause (Space)">
            {playing ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
            )}
          </button>
          <button type="button" className={btn} onClick={() => { video.current?.pause(); seek(time - FRAME); }} aria-label="Back one frame" title="Back one frame (,)">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button type="button" className={btn} onClick={() => { video.current?.pause(); seek(time + FRAME); }} aria-label="Forward one frame" title="Forward one frame (.)">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <span className="ml-1 text-[12.5px] tabular-nums text-white/85">
            {formatTime(time, true)} <span className="text-white/45">/ {formatTime(duration)}</span>
          </span>
          <span className="flex-1" />
          <div className="flex items-center rounded-lg bg-white/5 p-0.5" role="radiogroup" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={speed === s}
                onClick={() => {
                  setSpeed(s);
                  if (video.current) video.current.playbackRate = s;
                }}
                className={`px-1.5 h-7 rounded-md text-[11.5px] font-semibold ${speed === s ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            type="button"
            className={btn}
            onClick={() => {
              if (!video.current) return;
              video.current.muted = !video.current.muted;
              setMuted(video.current.muted);
            }}
            aria-label={muted ? "Unmute" : "Mute"}
            title="Mute (M)"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 9v6h4l5 4V5L8 9H4Z" />
              {muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />}
            </svg>
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void box.current?.requestFullscreen?.())}
            aria-label="Fullscreen"
            title="Fullscreen (F)"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});
