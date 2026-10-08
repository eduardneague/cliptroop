"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Mascot } from "@/components/ui/mascot";
import { quietWhatsNewCard } from "@/components/ui/whats-new";
import { APP_NAME, MASCOT_NAME } from "@/lib/brand";
import { sounds } from "@/lib/sounds";
import { minWidth } from "@/lib/breakpoints";
import { setTutorialDone } from "./actions";

/*
 * Clip's tour of the app.
 *
 *  - Starts once per person, on the dashboard, a moment after it opens
 *    (profiles.tutorial_done_at is null). Finishing or skipping it sets
 *    that date, so it never starts by itself again, on any device.
 *  - Settings -> Account -> "Show me around again" starts it on purpose
 *    (<ReplayTutorialButton/>), as does /dashboard?tour=1.
 *  - Each step lights up part of the app (anything marked data-tour="…")
 *    and Clip explains it in a bubble beside it. Phones get their own
 *    steps (the bottom bar and More instead of the sidebar).
 *  - Keyboard: ← / → to move, Esc to skip (asks first).
 *
 * localStorage only backs up the profile (if saving it fails, this device
 * still won't show the tour twice).
 */

const DONE_KEY = "vp-tour-done";
const START_EVENT = "vp:tour-start";

type Step = {
  id: string;
  title: string;
  text: string;
  /** data-tour names to light up (all of them, as one box). None: Clip in the middle. */
  targets?: string[];
  /** Only on a computer, or only on a phone. */
  only?: "desktop" | "phone";
};

function steps(phone: boolean, mac: boolean): Step[] {
  const all: Step[] = [
    {
      id: "hello",
      title: `Hi, I'm ${MASCOT_NAME}!`,
      text: `Let me show you around ${APP_NAME}. It takes about a minute.`,
    },
    {
      id: "home",
      targets: ["nav-dashboard"],
      title: "Home",
      text: "Your day at a glance: what's yours to do, what's coming up and what the team is working on.",
    },
    {
      id: "videos",
      targets: ["nav-shorts", "nav-videos"],
      title: "Your videos",
      text: "Short and long videos live here. Each one goes step by step: script, filming, editing, review, posting. Mark your part done and the next person is told it's their turn.",
    },
    {
      id: "schedule",
      only: "desktop",
      targets: ["nav-calendar", "nav-meetings", "nav-posting"],
      title: "Plan and post",
      text: "The calendar shows what's due and when each video goes out. Meetings keep your calls in one place. Posting sends videos to YouTube, Instagram and TikTok on time.",
    },
    {
      id: "insights",
      only: "desktop",
      targets: ["nav-analytics", "nav-team"],
      title: "How it's going",
      text: "Analytics shows views and growth on every platform. Team is who's on it and what each person can do.",
    },
    {
      id: "calendar",
      only: "phone",
      targets: ["nav-calendar"],
      title: "Calendar",
      text: "What's due and when each video goes out, day by day.",
    },
    {
      id: "more",
      only: "phone",
      targets: ["nav-more"],
      title: "Everything else",
      text: "Meetings, posting to YouTube, Instagram and TikTok, analytics and your team are under More.",
    },
    {
      id: "search",
      targets: ["search"],
      title: "Find anything",
      text: phone ? "Search any video, script or person." : `Search any video, script or person. Press ${mac ? "⌘ K" : "Ctrl K"} from anywhere.`,
    },
    {
      id: "bell",
      targets: ["bell"],
      title: "Your turn",
      text: "When it's your turn, or someone mentions you, it shows up here. Turn on phone notifications in Settings to hear about it anywhere.",
    },
    {
      id: "settings",
      targets: ["settings"],
      title: "Settings",
      text: "Your profile, notifications, colours and animations. This tour lives here too, under Account.",
    },
    {
      id: "done",
      title: "You're all set",
      text: "That's the tour. Watch it again any time from Settings → Account.",
    },
  ];
  return all.filter((s) => !s.only || s.only === (phone ? "phone" : "desktop"));
}

const store = {
  done: () => {
    try {
      return localStorage.getItem(DONE_KEY) === "1";
    } catch {
      return false;
    }
  },
  set: (on: boolean) => {
    try {
      if (on) localStorage.setItem(DONE_KEY, "1");
      else localStorage.removeItem(DONE_KEY);
    } catch {
      /* private mode: the profile still remembers */
    }
  },
};

/** Start the tour again (Settings -> Account). The host starts it on the dashboard. */
export function startTutorial() {
  store.set(false);
  window.dispatchEvent(new Event(START_EVENT));
}

type Box = { top: number; left: number; width: number; height: number };

/** One box around every visible element for these names (null: none on screen). */
function measure(names: string[] | undefined): Box | null {
  if (!names?.length) return null;
  let t = Infinity, l = Infinity, b = -Infinity, r = -Infinity;
  for (const name of names) {
    for (const el of Array.from(document.querySelectorAll(`[data-tour="${name}"]`))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue; // the phone/computer twin that's hidden
      t = Math.min(t, rect.top);
      l = Math.min(l, rect.left);
      b = Math.max(b, rect.bottom);
      r = Math.max(r, rect.right);
      break;
    }
  }
  if (!Number.isFinite(t)) return null;
  const pad = 6;
  return { top: t - pad, left: l - pad, width: r - l + pad * 2, height: b - t + pad * 2 };
}

type Spot = { top: number; left: number; side: "below" | "above" | "right" | "center"; tail: number };

/** Where the bubble goes: under things at the top, beside the sidebar, over the phone bar. */
function place(box: Box | null, w: number, h: number, vw: number, vh: number): Spot {
  const m = 12;
  const gap = 14;
  const center: Spot = { left: (vw - w) / 2, top: Math.max(m, (vh - h) / 2), side: "center", tail: 0 };
  if (!box) return center;
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const x = (v: number) => Math.min(Math.max(m, v), vw - w - m);
  const y = (v: number) => Math.min(Math.max(m, v), vh - h - m);
  const under = (): Spot => {
    const left = x(cx - w / 2);
    return { left, top: bottom + gap, side: "below", tail: Math.min(Math.max(22, cx - left), w - 22) };
  };
  const over = (): Spot => {
    const left = x(cx - w / 2);
    return { left, top: box.top - gap - h, side: "above", tail: Math.min(Math.max(22, cx - left), w - 22) };
  };
  const roomBelow = vh - bottom - gap >= h + m;
  // The sidebar: beside it. The top bar: under it. The phone's bottom bar: over it.
  if (vw - right - gap >= w + m && right < vw * 0.4) {
    const top = y(cy - h / 2);
    return { left: right + gap, top, side: "right", tail: Math.min(Math.max(22, cy - top), h - 22) };
  }
  if (box.top < vh * 0.3 && roomBelow) return under();
  if (box.top - gap >= h + m) return over();
  if (roomBelow) return under();
  return center;
}

/** Once, in the dashboard layout. `pending`: this person hasn't seen the tour yet. */
export function TutorialHost({ pending }: { pending: boolean }) {
  const pathname = usePathname();
  const [want, setWant] = useState(false);
  const [list, setList] = useState<Step[] | null>(null);
  const [i, setI] = useState(0);
  const [asking, setAsking] = useState(false);

  // Should it start? Not seen yet, ?tour=1, or "Show me around again".
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("tour") === "1";
    if (forced || (pending && !store.done())) setWant(true);
    const onStart = () => setWant(true);
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [pending]);

  // Only on the dashboard, once it has had a moment to appear.
  useEffect(() => {
    if (!want || list || pathname !== "/dashboard") return;
    const t = setTimeout(() => {
      // The sidebar shows from md up; below that it's the phone bar + More.
      const phone = !window.matchMedia(minWidth("md")).matches;
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      setWant(false);
      setI(0);
      setAsking(false);
      setList(steps(phone, mac));
      sounds.pop();
      quietWhatsNewCard();
      window.scrollTo(0, 0);
      const url = new URL(window.location.href);
      if (url.searchParams.has("tour")) {
        url.searchParams.delete("tour");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [want, list, pathname]);

  const end = useCallback((finished: boolean) => {
    setList(null);
    setAsking(false);
    store.set(true);
    if (finished) sounds.celebrate();
    void setTutorialDone().catch(() => {});
  }, []);

  if (!list) return null;
  return (
    <Tour
      list={list}
      i={i}
      asking={asking}
      onGo={(n) => {
        setAsking(false);
        setI(Math.min(Math.max(0, n), list.length - 1));
      }}
      onAsk={setAsking}
      onEnd={end}
    />
  );
}

function Tour({
  list,
  i,
  asking,
  onGo,
  onAsk,
  onEnd,
}: {
  list: Step[];
  i: number;
  asking: boolean;
  onGo: (n: number) => void;
  onAsk: (on: boolean) => void;
  onEnd: (finished: boolean) => void;
}) {
  const step = list[i];
  const first = i === 0;
  const last = i === list.length - 1;
  const middle = !first && !last;
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  // Glide between steps, but appear in place the first time.
  const [glide, setGlide] = useState(false);
  useEffect(() => {
    if (!spot || glide) return;
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setGlide(true)));
    return () => cancelAnimationFrame(f);
  }, [spot, glide]);

  // Keep up with resizing (and the phone's toolbar coming and going).
  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = prev;
    };
  }, []);

  // Light up this step's part of the app and put the bubble beside it.
  useLayoutEffect(() => {
    if (!view.w) return;
    const target = step.targets?.length ? document.querySelector(`[data-tour="${step.targets[0]}"]`) : null;
    target?.scrollIntoView?.({ block: "nearest" });
    const b = measure(step.targets);
    setBox(b);
    const el = card.current;
    const w = Math.min(352, view.w - 24);
    setSpot(place(b, w, el?.offsetHeight ?? 220, view.w, view.h));
  }, [step, view, asking]);

  // Focus the main button on every step (keyboard and screen readers follow along).
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [i, asking]);

  // ← / → move, Esc asks to skip, Tab stays inside the bubble.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onAsk(!asking);
      } else if (e.key === "ArrowRight" && !asking) {
        e.preventDefault();
        if (last) onEnd(true);
        else onGo(i + 1);
      } else if (e.key === "ArrowLeft" && !asking && i > 0) {
        e.preventDefault();
        onGo(i - 1);
      } else if (e.key === "Tab" && card.current) {
        const items = Array.from(card.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1;
        items[next].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [i, last, asking, onGo, onAsk, onEnd]);

  const w = Math.min(352, (view.w || 400) - 24);
  const ready = !!spot;
  const hole = box ?? { top: view.h / 2, left: view.w / 2, width: 0, height: 0 };
  const count = list.length - 2; // the steps between hello and done

  return createPortal(
    <div className="fixed inset-0 z-[200] animate-[fadein_.3s_ease-out]" data-tour-active="">
      {/* Clicks wait until the tour is over. */}
      <div className="absolute inset-0" aria-hidden onClick={() => primary.current?.focus()} />

      {/* The dim, with a hole over this step's part of the app. */}
      <div
        aria-hidden
        className={`fixed rounded-[14px] pointer-events-none ${glide ? "transition-[top,left,width,height,box-shadow] duration-[450ms] ease-[var(--ease-out)]" : ""}`}
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          boxShadow: box
            ? "0 0 0 2px rgb(var(--amber)), 0 0 0 9999px rgb(14 10 6 / 0.62)"
            : "0 0 0 0 rgb(var(--amber) / 0), 0 0 0 9999px rgb(14 10 6 / 0.62)",
        }}
      >
        {box && <span key={step.id} className="absolute inset-0 rounded-[14px] animate-[tour-ping_1.8s_var(--ease-out)_0.45s_infinite]" />}
      </div>

      {/* Clip's bubble. */}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        className={`fixed rounded-2xl border border-line/15 bg-surface text-ink shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)] ${glide ? "transition-[top,left,opacity] duration-[450ms] ease-[var(--ease-out)]" : ""} ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: w, top: spot?.top ?? -9999, left: spot?.left ?? 0 }}
      >
        {spot && spot.side !== "center" && !asking && (
          <span
            aria-hidden
            className="absolute w-3.5 h-3.5 rotate-45 bg-surface border-line/15"
            style={
              spot.side === "below"
                ? { top: -7.5, left: spot.tail - 7, borderTopWidth: 1, borderLeftWidth: 1 }
                : spot.side === "above"
                  ? { bottom: -7.5, left: spot.tail - 7, borderBottomWidth: 1, borderRightWidth: 1 }
                  : { left: -7.5, top: spot.tail - 7, borderBottomWidth: 1, borderLeftWidth: 1 }
            }
          />
        )}

        {asking ? (
          <div className="p-5">
            <div className="flex items-center gap-3">
              <Mascot size={52} className="flex-shrink-0 -my-1" />
              <h2 id="tour-title" className="font-display text-[19px] font-semibold leading-tight">
                Skip the tour?
              </h2>
            </div>
            <p id="tour-text" className="text-[14px] text-ink-soft leading-relaxed mt-3">
              It won&rsquo;t start again by itself. You can watch it any time from Settings &rarr; Account.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                ref={primary}
                type="button"
                onClick={() => onAsk(false)}
                className="rounded-xl bg-amber text-white font-bold px-4 h-10 text-[14px] hover:brightness-110"
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={() => onEnd(false)}
                className="order-first rounded-xl border border-line/15 px-4 h-10 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
              >
                Skip tour
              </button>
            </div>
          </div>
        ) : !middle ? (
          <div className="p-6 text-center" key={step.id}>
            <div className="flex justify-center -mt-1">
              <Mascot mood="celebrate" size={104} />
            </div>
            <h2 id="tour-title" className="font-display text-[24px] font-semibold leading-tight mt-2">
              {step.title}
            </h2>
            <p id="tour-text" className="text-[14.5px] text-ink-soft leading-relaxed mt-2">
              {step.text}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                ref={primary}
                type="button"
                data-sound="none"
                onClick={() => (last ? onEnd(true) : onGo(1))}
                className="w-full rounded-xl bg-amber text-white font-bold h-11 text-[15px] hover:brightness-110"
              >
                {last ? `Start using ${APP_NAME}` : "Show me around"}
              </button>
              {first && (
                <button type="button" onClick={() => onAsk(true)} className="w-full rounded-xl h-10 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
                  Skip tutorial
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 pt-3.5">
            <div className="flex items-start gap-3">
              <Mascot key={step.id} size={50} className="flex-shrink-0 -ml-1 -mt-0.5" />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 id="tour-title" className="font-display text-[18px] font-semibold leading-tight">
                    {step.title}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onAsk(true)}
                    className="-mr-1.5 -mt-0.5 rounded-lg px-2 h-7 text-[12.5px] font-semibold text-ink-faint hover:text-ink hover:bg-surface-2 flex-shrink-0"
                  >
                    Skip
                  </button>
                </div>
                <p id="tour-text" aria-live="polite" className="text-[14px] text-ink-soft leading-relaxed mt-1">
                  {step.text}
                </p>
              </div>
            </div>
            <div className="mt-3.5 flex items-center gap-3">
              <span className="flex items-center gap-1.5 mr-auto" aria-label={`Step ${i} of ${count}`}>
                {Array.from({ length: count }, (_, k) => (
                  <span
                    key={k}
                    aria-hidden
                    className={`h-1.5 rounded-full transition-all duration-300 ${k + 1 === i ? "w-4 bg-amber" : k + 1 < i ? "w-1.5 bg-amber/50" : "w-1.5 bg-line/25"}`}
                  />
                ))}
              </span>
              <button type="button" onClick={() => onGo(i - 1)} className="rounded-xl px-3 h-9 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
                Back
              </button>
              <button
                ref={primary}
                type="button"
                onClick={() => onGo(i + 1)}
                className="rounded-xl bg-amber text-white font-bold px-4 h-9 text-[13.5px] hover:brightness-110"
              >
                {i === list.length - 2 ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Settings -> Account: watch the tour again (on the dashboard). */
export function ReplayTutorialButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        startTutorial();
        router.push("/dashboard");
      }}
      className={className}
    >
      Show me around again
    </button>
  );
}
