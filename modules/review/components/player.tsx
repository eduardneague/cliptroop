"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { formatTime } from "../lib/limits";
import {
  Back5Icon,
  ExpandIcon2,
  Forward5Icon,
  FrameBackIcon,
  FrameForwardIcon,
  PauseIcon,
  PlayIcon,
  SoundIcon,
} from "./player-icons";

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

/** Shared control-bar button. */
export function CtrlButton({
  label,
  shortcut,
  onClick,
  children,
  primary = false,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={
        primary
          ? "w-10 h-10 rounded-full bg-amber text-white flex items-center justify-center shadow-[0_4px_14px_-4px_rgb(var(--amber)/0.8)] hover:brightness-110 transition-[filter,scale] duration-150"
          : "w-9 h-9 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10 transition-colors"
      }
    >
      {children}
    </button>
  );
}

/** Shared speed pills. */
export function SpeedPills({ speed, onChange }: { speed: number; onChange: (s: number) => void }) {
  return (
    <div className="flex items-center rounded-full bg-white/[0.06] p-0.5" role="radiogroup" aria-label="Speed">
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={speed === s}
          onClick={() => onChange(s)}
          className={`px-2 h-7 rounded-full text-[11px] font-bold tabular-nums transition-colors ${
            speed === s ? "bg-white text-black" : "text-white/55 hover:text-white"
          }`}
        >
          {s}×
        </button>
      ))}
    </div>
  );
}

/**
 * The timeline: thickens on hover, shows the time under the cursor, the
 * buffered part, and (optionally) note markers with the author's picture.
 * `glide` animates the playhead to a new spot after a click.
 */
export function Timeline({
  time,
  duration,
  buffered = 0,
  glide,
  markers = [],
  pingId,
  onSeek,
  onMarker,
}: {
  time: number;
  duration: number;
  buffered?: number;
  glide: boolean;
  markers?: Marker[];
  pingId?: string | null;
  onSeek: (t: number) => void;
  onMarker?: (m: Marker) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const pct = duration ? (time / duration) * 100 : 0;
  const at = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (!r || !duration) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
  };
  const move = glide ? "transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" : "";

  return (
    <div
      ref={bar}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      tabIndex={0}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        onSeek(at(e.clientX));
      }}
      onPointerMove={(e) => {
        setHover(at(e.clientX));
        if (e.buttons === 1) onSeek(at(e.clientX));
      }}
      onPointerLeave={() => setHover(null)}
      className="group/bar relative h-7 cursor-pointer flex items-center touch-none"
    >
      <div className="absolute inset-x-0 h-1.5 group-hover/bar:h-2.5 rounded-full bg-white/12 transition-[height] duration-150 overflow-hidden" style={{ background: "rgb(255 255 255 / 0.12)" }}>
        <div className="absolute inset-y-0 left-0 bg-white/15" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
        <div className={`absolute inset-y-0 left-0 rounded-full bg-amber ${move}`} style={{ width: `${pct}%` }} />
      </div>

      {hover !== null && duration > 0 && (
        <span
          className="pointer-events-none absolute -top-[46px] -translate-x-1/2 rounded-md bg-white text-black text-[11px] font-bold tabular-nums px-1.5 py-0.5 shadow z-30"
          style={{ left: `${(hover / duration) * 100}%` }}
        >
          {formatTime(hover, true)}
        </span>
      )}

      {duration > 0 &&
        markers.map((m) => (
          <button
            key={m.id}
            type="button"
            title={`${formatTime(m.time)} · ${m.author?.name ?? ""}: ${m.label}`}
            aria-label={`Note at ${formatTime(m.time)}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onMarker?.(m)}
            className={`absolute -translate-x-1/2 -top-[17px] z-10 rounded-full ring-2 transition-[scale,opacity] duration-200 hover:scale-125 hover:z-20 ${
              m.resolved ? "ring-white/30 opacity-50 grayscale" : "ring-amber"
            }`}
            style={{ left: `${(m.time / duration) * 100}%`, animation: pingId === m.id ? "marker-ping .6s var(--ease-out)" : undefined }}
          >
            {m.author ? (
              <span className="flex w-5 h-5 rounded-full overflow-hidden text-[8.5px] font-bold text-white items-center justify-center" style={{ background: m.author.color }}>
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

      <div
        className={`absolute -translate-x-1/2 w-3.5 h-3.5 group-hover/bar:w-4 group-hover/bar:h-4 rounded-full bg-white shadow-[0_0_0_4px_rgb(var(--amber)/0.25)] transition-[width,height] duration-150 ${move}`}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
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
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [glide, setGlide] = useState(false);
  const [pingId, setPingId] = useState<string | null>(null);
  const glideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Jumps feel instant: the playhead glides there right away, and a small
  // spinner shows until the browser has the new frame.
  const seek = useCallback(
    (t: number, animate = false) => {
      const v = video.current;
      if (!v) return;
      const target = Math.min(Math.max(0, t), v.duration || t);
      if (animate) {
        setGlide(true);
        if (glideTimer.current) clearTimeout(glideTimer.current);
        glideTimer.current = setTimeout(() => setGlide(false), 320);
      }
      setTime(target);
      onTime?.(target);
      setSeeking(true);
      v.currentTime = target;
    },
    [onTime]
  );

  useImperativeHandle(ref, () => ({
    seek: (t: number) => seek(t, true),
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
    setBuffered(0);
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
      } else if (k === "j") seek(v.currentTime - 5, true);
      else if (k === "l") seek(v.currentTime + 5, true);
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

  return (
    <div ref={box} className="relative w-full rounded-2xl overflow-hidden bg-black select-none ring-1 ring-white/5">
      {/* Shorter on phones so the controls clear the floating Notes / + buttons. */}
      <div className="relative flex items-center justify-center bg-black h-[50vh] lg:h-[min(72vh,780px)]">
        {src ? (
          <video
            ref={video}
            key={src}
            src={src}
            playsInline
            preload="auto"
            className="max-h-full max-w-full"
            onClick={toggle}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration || 0;
              setDuration(d);
              setReady(true);
            }}
            onProgress={(e) => {
              const b = e.currentTarget.buffered;
              if (b.length) setBuffered(b.end(b.length - 1));
            }}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              if (!glide) setTime(t);
              onTime?.(t);
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
        {(!src || !ready) && !error && (
          <div className="absolute inset-0 flex items-center justify-center" aria-label="Loading the video" role="status">
            <div className="h-[86%] aspect-[9/16] rounded-xl bg-white/[0.06] animate-pulse" />
            <span className="absolute w-8 h-8 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          </div>
        )}
        {ready && seeking && (
          <span className="absolute top-3 right-3 w-6 h-6 rounded-full border-2 border-white/25 border-t-white animate-spin" aria-label="Loading" />
        )}
        {/* Big soft play button when paused. */}
        {ready && !playing && !seeking && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Play"
            className="absolute w-16 h-16 rounded-full bg-black/45 backdrop-blur-md text-white flex items-center justify-center ring-1 ring-white/15 hover:bg-black/60 transition-colors animate-[modalin_.2s_var(--ease-out)]"
          >
            <PlayIcon className="w-7 h-7 translate-x-[2px]" />
          </button>
        )}
      </div>

      <div className="bg-[#100e0c] px-3 sm:px-4 pt-5 pb-2.5 border-t border-white/5">
        <Timeline
          time={time}
          duration={duration}
          buffered={buffered}
          glide={glide}
          markers={markers}
          pingId={pingId}
          onSeek={(t) => seek(t)}
          onMarker={(m) => {
            setPingId(m.id);
            setTimeout(() => setPingId((p) => (p === m.id ? null : p)), 650);
            seek(m.time, true);
            onMarker?.(m.id);
          }}
        />
        <div className="flex items-center gap-1 sm:gap-1.5 mt-1.5">
          <CtrlButton label={playing ? "Pause" : "Play"} shortcut="Space" onClick={toggle} primary>
            {playing ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 translate-x-[1px]" />}
          </CtrlButton>
          <CtrlButton label="Back 5 seconds" shortcut="J" onClick={() => seek((video.current?.currentTime ?? 0) - 5, true)}>
            <Back5Icon className="w-[19px] h-[19px]" />
          </CtrlButton>
          <CtrlButton label="Forward 5 seconds" shortcut="L" onClick={() => seek((video.current?.currentTime ?? 0) + 5, true)}>
            <Forward5Icon className="w-[19px] h-[19px]" />
          </CtrlButton>
          <span className="hidden sm:flex">
            <CtrlButton label="Back one frame" shortcut="," onClick={() => { video.current?.pause(); seek((video.current?.currentTime ?? 0) - FRAME); }}>
              <FrameBackIcon className="w-4 h-4" />
            </CtrlButton>
            <CtrlButton label="Forward one frame" shortcut="." onClick={() => { video.current?.pause(); seek((video.current?.currentTime ?? 0) + FRAME); }}>
              <FrameForwardIcon className="w-4 h-4" />
            </CtrlButton>
          </span>
          <span className="ml-1 rounded-full bg-white/[0.06] px-2.5 h-7 inline-flex items-center text-[12px] font-semibold tabular-nums text-white/90">
            {formatTime(time, true)}
            <span className="text-white/40 ml-1">/ {formatTime(duration)}</span>
          </span>
          <span className="flex-1" />
          <span className="hidden sm:block">
            <SpeedPills
              speed={speed}
              onChange={(s) => {
                setSpeed(s);
                if (video.current) video.current.playbackRate = s;
              }}
            />
          </span>
          <CtrlButton
            label={muted ? "Unmute" : "Mute"}
            shortcut="M"
            onClick={() => {
              if (!video.current) return;
              video.current.muted = !video.current.muted;
              setMuted(video.current.muted);
            }}
          >
            <SoundIcon className="w-[18px] h-[18px]" muted={muted} />
          </CtrlButton>
          <CtrlButton
            label="Fullscreen"
            shortcut="F"
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void box.current?.requestFullscreen?.())}
          >
            <ExpandIcon2 className="w-[17px] h-[17px]" />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
});
