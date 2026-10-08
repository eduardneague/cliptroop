"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/ui/mascot";
import { motionReduced, useCountUp } from "@/components/ui/count-up";

/**
 * Plays a scene's little demo only while it's on screen (and pauses it
 * when it scrolls away). Sets data-on on the wrapper; landing.css starts
 * every .ld-a animation inside it from there.
 */
export function Play({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} id={id} className={className} data-ld-play="" data-on={on ? "" : undefined}>
      {children}
    </div>
  );
}

/** The slate's running timecode (HH:MM:SS:FF at 25 fps), from when the page opened. */
export function Timecode() {
  const [t, setT] = useState("00:00:00:00");
  useEffect(() => {
    if (motionReduced()) {
      setT("00:00:12:08");
      return;
    }
    const start = performance.now() - 12_320;
    let raf = 0;
    let last = "";
    const tick = (now: number) => {
      const f = Math.floor(((now - start) / 1000) * 25);
      const ff = f % 25;
      const s = Math.floor(f / 25);
      const text = `00:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
      if (text !== last) {
        last = text;
        setT(text);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span className="tabular-nums" aria-hidden>
      {t}
    </span>
  );
}

/** Clip celebrates each time it comes into view (the bottom of the page). */
export function ClipOnView({ size = 160 }: { size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let was = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !was) setRound((r) => r + 1);
        was = e.isIntersecting;
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="inline-block">
      <Mascot key={round} size={size} mood={round > 0 ? "celebrate" : "idle"} />
    </div>
  );
}

/** A number that counts up when its scene is shown. */
export function Count({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState(to);
  useEffect(() => {
    const el = ref.current;
    // Animations off: the real number, always (never the 0 it counts up from).
    if (!el || typeof IntersectionObserver === "undefined" || motionReduced()) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setTarget(to);
        else setTarget(0);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  const shown = useCountUp(target, 1100);
  return (
    <span ref={ref} className="tabular-nums">
      {shown.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

/** The header gets a hairline and a backdrop once the page scrolls. */
export function HeaderScroll() {
  useEffect(() => {
    const h = document.querySelector<HTMLElement>("[data-ld-header]");
    if (!h) return;
    const on = () => h.toggleAttribute("data-scrolled", window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return null;
}
