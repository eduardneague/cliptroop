"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { formatTime } from "../lib/limits";
import { playbackUrl, prefetchPlayback } from "../lib/playback";
import type { VideoVersion } from "../lib/queries";
import { CtrlButton, SpeedPills, Timeline } from "./player";
import { Back5Icon, Forward5Icon, FrameBackIcon, FrameForwardIcon, PauseIcon, PlayIcon, SoundIcon } from "./player-icons";

const FRAME = 1 / 30;

function useSignedUrl(versionId: string | null) {
  const [state, setState] = useState<{ url: string | null; error: string | null }>({ url: null, error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ url: null, error: null });
    if (!versionId) return;
    void playbackUrl(versionId).then((res) => {
      if (!cancelled) setState(res.url ? { url: res.url, error: null } : { url: null, error: res.error ?? "Couldn't open the video." });
    });
    return () => {
      cancelled = true;
    };
  }, [versionId]);
  return state;
}

/**
 * Two versions side by side. One set of controls drives both: play,
 * pause, scrub, ±5s, frame step and speed stay in sync. The speaker next
 * to each version picks whose sound you hear (one at a time, or none).
 * Keyboard: Space/K, J/L, , and . — Esc leaves compare.
 */
export function CompareView({ versions, onClose }: { versions: VideoVersion[]; onClose: () => void }) {
  const live = versions.filter((v) => !v.deleted).sort((a, b) => a.number - b.number);
  const [leftId, setLeftId] = useState(live[live.length - 2]?.id ?? live[0]?.id ?? null);
  const [rightId, setRightId] = useState(live[live.length - 1]?.id ?? null);
  const left = useSignedUrl(leftId);
  const right = useSignedUrl(rightId);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [glide, setGlide] = useState(false);
  const [loaded, setLoaded] = useState({ a: false, b: false });
  // Whose sound plays: the left one at first.
  const [sound, setSound] = useState<"a" | "b" | null>("a");
  useEffect(() => {
    if (a.current) a.current.muted = sound !== "a";
    if (b.current) b.current.muted = sound !== "b";
  }, [sound, left.url, right.url, loaded]);
  const timeRef = useRef(0);
  timeRef.current = time;

  // Links for every version, fetched up front: switching is instant.
  useEffect(() => {
    prefetchPlayback(live.map((v) => v.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions]);

  const both = useCallback((fn: (v: HTMLVideoElement) => void) => {
    [a.current, b.current].forEach((v) => v && fn(v));
  }, []);

  const seek = useCallback(
    (t: number, animate = false) => {
      const target = Math.max(0, Math.min(t, duration || t));
      if (animate) {
        setGlide(true);
        setTimeout(() => setGlide(false), 320);
      }
      setTime(target);
      both((v) => {
        v.currentTime = Math.min(target, v.duration || target);
      });
    },
    [both, duration]
  );

  const pause = useCallback(() => {
    both((v) => v.pause());
    setPlaying(false);
  }, [both]);

  const toggle = useCallback(() => {
    if (playing) return pause();
    // Line them up before playing so they stay in step.
    const t = a.current?.currentTime ?? timeRef.current;
    both((v) => {
      v.currentTime = Math.min(t, v.duration || t);
      void v.play();
    });
    setPlaying(true);
  }, [both, playing, pause]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") {
        e.preventDefault();
        toggle();
      } else if (k === "j") seek(timeRef.current - 5, true);
      else if (k === "l") seek(timeRef.current + 5, true);
      else if (e.key === ",") {
        pause();
        seek(timeRef.current - FRAME);
      } else if (e.key === ".") {
        pause();
        seek(timeRef.current + FRAME);
      } else if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seek, pause, onClose]);

  const options = live.map((v) => ({ value: v.id, label: `v${v.number}`, hint: v.fileName }));

  const side = (
    ref: React.RefObject<HTMLVideoElement | null>,
    src: { url: string | null; error: string | null },
    id: string | null,
    setId: (v: string) => void,
    key: "a" | "b"
  ) => (
    <div className="min-w-0 flex flex-col gap-2">
      <div className="flex items-center gap-2">
      <div className="w-40 min-w-0">
        <Select
          value={id}
          onChange={(v) => {
            if (!v || v === id) return;
            pause();
            setLoaded((l) => ({ ...l, [key]: false }));
            setId(v);
          }}
          options={options}
          ariaLabel={key === "a" ? "Left version" : "Right version"}
        />
      </div>
      <button
        type="button"
        onClick={() => setSound((s) => (s === key ? null : key))}
        aria-pressed={sound === key}
        aria-label={sound === key ? `Mute this version` : `Hear this version`}
        title={sound === key ? "You hear this one. Click to mute it." : "Hear this one instead"}
        className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-[12.5px] font-semibold transition-colors ${
          sound === key ? "bg-amber text-white" : "border border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
        }`}
      >
        <SoundIcon className="w-4 h-4" muted={sound !== key} />
        <span className="hidden sm:inline">{sound === key ? "Sound on" : "Hear this"}</span>
      </button>
      </div>
      <div className="relative flex items-center justify-center rounded-2xl bg-black overflow-hidden ring-1 ring-white/5 h-[42vh] sm:h-[min(62vh,700px)]">
        {src.url && (
          <video
            ref={ref}
            key={src.url}
            src={src.url}
            playsInline
            muted={sound !== key}
            preload="auto"
            className={`max-h-full max-w-full transition-opacity duration-300 ${loaded[key] ? "opacity-100" : "opacity-0"}`}
            onLoadedMetadata={(e) => {
              // Read everything now: React clears the event object before
              // a state updater runs (that was the "duration of null" crash).
              const el = e.currentTarget;
              const d = el.duration || 0;
              el.currentTime = Math.min(timeRef.current, d || timeRef.current);
              el.playbackRate = speed;
              setLoaded((l) => ({ ...l, [key]: true }));
              setDuration((prev) => Math.max(prev, d));
            }}
            onTimeUpdate={(e) => {
              if (key === "a" && !glide) setTime(e.currentTarget.currentTime);
            }}
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
    <div className="space-y-3 animate-[modalin_.22s_var(--ease-out)]">
      <div className="grid gap-3 grid-cols-2">
        {side(a, left, leftId, setLeftId, "a")}
        {side(b, right, rightId, setRightId, "b")}
      </div>

      <div className="rounded-2xl bg-[#100e0c] ring-1 ring-white/5 px-3 sm:px-4 pt-3 pb-2.5">
        <Timeline time={time} duration={duration} glide={glide} onSeek={(t) => seek(t)} />
        <div className="flex items-center gap-1 sm:gap-1.5 mt-1.5">
          <CtrlButton label={playing ? "Pause both" : "Play both"} shortcut="Space" onClick={toggle} primary>
            {playing ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 translate-x-[1px]" />}
          </CtrlButton>
          <CtrlButton label="Back 5 seconds" shortcut="J" onClick={() => seek(time - 5, true)}>
            <Back5Icon className="w-[19px] h-[19px]" />
          </CtrlButton>
          <CtrlButton label="Forward 5 seconds" shortcut="L" onClick={() => seek(time + 5, true)}>
            <Forward5Icon className="w-[19px] h-[19px]" />
          </CtrlButton>
          <span className="hidden sm:flex">
            <CtrlButton label="Back one frame" shortcut="," onClick={() => { pause(); seek(time - FRAME); }}>
              <FrameBackIcon className="w-4 h-4" />
            </CtrlButton>
            <CtrlButton label="Forward one frame" shortcut="." onClick={() => { pause(); seek(time + FRAME); }}>
              <FrameForwardIcon className="w-4 h-4" />
            </CtrlButton>
          </span>
          <span className="ml-1 rounded-full bg-white/[0.06] px-2.5 h-7 inline-flex items-center text-[12px] font-semibold tabular-nums text-white/90">
            {formatTime(time, true)}
            <span className="text-white/40 ml-1">/ {formatTime(duration)}</span>
          </span>
          <span className="hidden md:inline ml-2 text-[11px] text-white/40">
            {sound ? `Sound from ${options.find((o) => o.value === (sound === "a" ? leftId : rightId))?.label ?? (sound === "a" ? "the left" : "the right")}` : "Sound off"}
          </span>
          <span className="flex-1" />
          <span className="hidden sm:block">
            <SpeedPills
              speed={speed}
              onChange={(s) => {
                setSpeed(s);
                both((v) => (v.playbackRate = s));
              }}
            />
          </span>
        </div>
      </div>
    </div>
  );
}
