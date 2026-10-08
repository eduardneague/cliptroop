"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { minWidth } from "@/lib/breakpoints";
import { BAR_COLOR as BAR, uptimeText, type BarView } from "@/lib/status-levels";

/*
 * The status page's pieces (shared by the public /status and /developer):
 * one part's hourly bars with a tooltip per hour (hover, tap, or arrow
 * keys), local times that don't break hydration, and the minute refresh.
 * The public page never passes `detail`: only the developer page has it.
 */

/** Checks again every minute while the page is open. */
export function AutoRefresh({ every = 60_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}

const noop = () => () => {};

/** A date/time in the viewer's time zone (UTC until the page has loaded, so hydration matches). */
export function LocalTime({ iso, time = true, date = true }: { iso: string; time?: boolean; date?: boolean }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const opts: Intl.DateTimeFormatOptions = {
    ...(date ? { day: "numeric", month: "short" } : {}),
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  };
  const d = new Date(iso);
  const text = mounted ? d.toLocaleString("en-US", opts) : `${d.toLocaleString("en-US", { ...opts, timeZone: "UTC" })} UTC`;
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}

const minutes = (n: number) => {
  const m = n * 10;
  return m >= 60 ? "the whole hour" : `about ${m} min`;
};

function hourText(iso: string, last: boolean) {
  const a = new Date(iso);
  const b = new Date(a.getTime() + 3_600_000);
  const day = a.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  const t = (x: Date) => x.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return last ? `${day} · since ${t(a)} (this hour)` : `${day} · ${t(a)}–${t(b)}`;
}

function barSummary(b: BarView) {
  if (b.level === "none") return "No checks recorded";
  if (b.level === "ok") return "No problems";
  const parts = [b.down ? `Not working for ${minutes(b.down)}` : null, b.warn ? `Slow or partly working for ${minutes(b.warn)}` : null].filter(Boolean);
  return parts.join(" · ");
}

/** One part's last hours as bars, oldest on the left. Phones show the newest `phoneHours`. */
export function StatusBars({ name, bars, phoneHours = 36 }: { name: string; bars: BarView[]; phoneHours?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLSpanElement | null)[]>([]);
  const lastPointer = useRef<string>("mouse");
  const pinned = useRef(false);
  const [sel, setSel] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const firstOnPhone = Math.max(0, bars.length - phoneHours);

  // Keep the tooltip inside the box, centred on its bar.
  useEffect(() => {
    if (sel === null) return;
    const bar = els.current[sel];
    const w = box.current?.clientWidth ?? 0;
    const tw = tip.current?.offsetWidth ?? 220;
    if (!bar) return;
    const centre = bar.offsetLeft + bar.offsetWidth / 2;
    setLeft(Math.max(0, Math.min(w - tw, centre - tw / 2)));
  }, [sel]);

  // A tapped tooltip closes on a tap anywhere else.
  useEffect(() => {
    if (sel === null) return;
    const close = (e: PointerEvent) => {
      if (pinned.current && !box.current?.contains(e.target as Node)) {
        pinned.current = false;
        setSel(null);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [sel]);

  const index = (t: EventTarget | null) => {
    const i = (t as HTMLElement | null)?.closest?.("[data-i]")?.getAttribute("data-i");
    return i == null ? null : Number(i);
  };
  const firstVisible = () => (typeof window !== "undefined" && !window.matchMedia(minWidth("sm")).matches ? firstOnPhone : 0);
  const b = sel === null ? null : bars[sel];

  return (
    <div
      ref={box}
      className="relative outline-none rounded-md focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      tabIndex={0}
      role="group"
      aria-label={`${name}: the last ${bars.length} hours, one bar per hour. Use the arrow keys to read each hour.`}
      onPointerDown={(e) => {
        lastPointer.current = e.pointerType;
      }}
      onPointerOver={(e) => {
        if (e.pointerType !== "mouse" || pinned.current) return;
        const i = index(e.target);
        if (i !== null) setSel(i);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && !pinned.current) setSel(null);
      }}
      onClick={(e) => {
        if (lastPointer.current === "mouse") return;
        const i = index(e.target);
        if (i === null) return;
        pinned.current = sel !== i;
        setSel(sel === i ? null : i);
      }}
      onFocus={(e) => {
        if (e.target === box.current && e.currentTarget.matches(":focus-visible")) setSel(bars.length - 1);
      }}
      onBlur={() => {
        pinned.current = false;
        setSel(null);
      }}
      onKeyDown={(e) => {
        lastPointer.current = "keyboard";
        if (e.key === "Escape") {
          setSel(null);
          return;
        }
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();
        const lo = firstVisible();
        const cur = sel ?? bars.length - 1;
        const next = e.key === "Home" ? lo : e.key === "End" ? bars.length - 1 : Math.max(lo, Math.min(bars.length - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
        setSel(next);
      }}
    >
      <div className="flex items-stretch gap-[2px] sm:gap-[3px] h-8 py-0.5" aria-hidden>
        {bars.map((bar, i) => (
          <span
            key={bar.hour}
            data-i={i}
            ref={(el) => {
              els.current[i] = el;
            }}
            className={`flex-1 min-w-0 rounded-[2px] transition-[opacity,transform] ${BAR[bar.level]} ${i < firstOnPhone ? "hidden sm:block" : ""} ${
              sel === i ? "scale-y-110 opacity-100" : sel !== null ? "opacity-60" : ""
            }`}
          />
        ))}
      </div>
      {b && sel !== null && (
        <div
          ref={tip}
          role="tooltip"
          className="absolute bottom-[calc(100%+8px)] z-20 w-[15rem] max-w-full rounded-xl border border-line/15 bg-surface px-3 py-2.5 shadow-lg pointer-events-none"
          style={{ left }}
        >
          <div className="text-[11.5px] text-ink-soft">{hourText(b.hour, sel === bars.length - 1)}</div>
          <div className="mt-1 flex items-start gap-2">
            <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${BAR[b.level]}`} aria-hidden />
            <span className="text-[13px] font-semibold leading-snug">{barSummary(b)}</span>
          </div>
          {b.detail && b.level !== "ok" && b.level !== "none" && <div className="mt-1.5 text-[11.5px] text-ink-soft break-words font-mono leading-snug">{b.detail}</div>}
          {b.samples > 0 && <div className="mt-1 text-[11px] text-ink-faint">{b.samples} check{b.samples === 1 ? "" : "s"} this hour</div>}
        </div>
      )}
      {/* For screen readers: the keyboard tooltip, read out as it changes. */}
      <span className="sr-only" aria-live="polite">
        {b ? `${hourText(b.hour, sel === bars.length - 1)}: ${barSummary(b)}` : ""}
      </span>
    </div>
  );
}

/** The line under the bars: "3 days ago · 99.9% uptime · Now". */
export function BarsAxis({ hours, phoneHours = 36, uptime }: { hours: number; phoneHours?: number; uptime: number | null }) {
  const label = (h: number) => (h % 24 === 0 ? `${h / 24} days ago` : `${h} hours ago`);
  return (
    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
      <span className="hidden sm:inline">{label(hours)}</span>
      <span className="sm:hidden">{label(Math.min(hours, phoneHours))}</span>
      <span className="flex-1 h-px bg-line/10" aria-hidden />
      <span className="font-semibold text-ink-soft">
        {uptimeText(uptime)}
        {uptime !== null && hours > phoneHours && <span className="sm:hidden font-normal"> · {hours % 24 === 0 ? `${hours / 24} days` : `${hours} h`}</span>}
      </span>
      <span className="flex-1 h-px bg-line/10" aria-hidden />
      <span>Now</span>
    </div>
  );
}

/** What the bar colours mean. */
export function BarsLegend() {
  const item = (cls: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-3 rounded-[2px] ${cls}`} aria-hidden />
      {text}
    </span>
  );
  return (
    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-[11.5px] text-ink-soft">
      {item(BAR.ok, "Working")}
      {item(BAR.warn, "Slow or partly working")}
      {item(BAR.down, "Not working")}
      {item(BAR.none, "No data")}
    </div>
  );
}
