"use client";

import { useEffect, useState } from "react";

/*
 * Meeting times are stored as moments (UTC) and always shown in the
 * viewer's own time zone, in the browser. (The server's clock is UTC, so
 * formatting there would show the wrong hour.)
 */

export type TimeFormat = "full" | "day" | "time" | "short" | "range";

const fmt = (iso: string, f: TimeFormat, durationMin = 60) => {
  const d = new Date(iso);
  const time = (x: Date) => x.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  switch (f) {
    case "full":
      return `${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · ${time(d)}`;
    case "day":
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    case "time":
      return time(d);
    case "short":
      return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${time(d)}`;
    case "range":
      return `${time(d)} – ${time(new Date(d.getTime() + durationMin * 60_000))}`;
  }
};

/** A time in the viewer's zone (blank on the server, filled in right away). */
export function LocalTime({ iso, format = "full", durationMin, className }: { iso: string; format?: TimeFormat; durationMin?: number; className?: string }) {
  const [text, setText] = useState("");
  useEffect(() => setText(fmt(iso, format, durationMin)), [iso, format, durationMin]);
  return (
    <span className={className} suppressHydrationWarning>
      {text || " "}
    </span>
  );
}

/** "in 3 days", "in 2 h", "in 25 min", "now", "ended". */
export function countdown(iso: string, durationMin: number, now = Date.now()) {
  const start = Date.parse(iso);
  const end = start + durationMin * 60_000;
  if (now >= end) return { label: "Ended", live: false, soon: false };
  if (now >= start) return { label: "Happening now", live: true, soon: true };
  const min = Math.round((start - now) / 60_000);
  if (min < 60) return { label: `in ${Math.max(1, min)} min`, live: false, soon: true };
  const h = Math.round(min / 60);
  if (h < 24) return { label: `in ${h} h`, live: false, soon: h <= 3 };
  const days = Math.round(h / 24);
  return { label: days === 1 ? "tomorrow" : `in ${days} days`, live: false, soon: false };
}

/** The countdown, kept fresh every 30 seconds. */
export function Countdown({ iso, durationMin, className = "" }: { iso: string; durationMin: number; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className={className}>&nbsp;</span>;
  const c = countdown(iso, durationMin, now);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {c.live && <span className="live-dot w-2 h-2 rounded-full bg-red" aria-hidden />}
      {c.label}
    </span>
  );
}
