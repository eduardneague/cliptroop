"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { quietWhatsNewCard } from "@/components/ui/whats-new";
import { sounds } from "@/lib/sounds";
import { minWidth } from "@/lib/breakpoints";
import { setTutorialDone } from "./actions";
import { LaterBoundary } from "@/components/ui/later-boundary";

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
 *
 * 1.32.2: this part, on every page, only decides when the tour starts; the
 * tour itself (its steps and bubbles, tour.tsx) loads when it's about to.
 */

const DONE_KEY = "vp-tour-done";
const START_EVENT = "vp:tour-start";

const loadTour = () => import("./tour");
const TourRun = lazy(loadTour);

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

/** Once, in the dashboard layout. `pending`: this person hasn't seen the tour yet. */
export function TutorialHost({ pending }: { pending: boolean }) {
  const pathname = usePathname();
  const [want, setWant] = useState(false);
  // The tour running: which steps (phone or computer, Mac or not).
  const [run, setRun] = useState<{ phone: boolean; mac: boolean } | null>(null);

  // Should it start? Not seen yet, ?tour=1, or "Show me around again".
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("tour") === "1";
    if (forced || (pending && !store.done())) setWant(true);
    const onStart = () => setWant(true);
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [pending]);

  // Only on the dashboard, once it has had a moment to appear (the tour's code arrives meanwhile).
  useEffect(() => {
    if (!want || run || pathname !== "/dashboard") return;
    void loadTour().catch(() => null);
    const t = setTimeout(() => {
      // The sidebar shows from md up; below that it's the phone bar + More.
      const phone = !window.matchMedia(minWidth("md")).matches;
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      setWant(false);
      setRun({ phone, mac });
      quietWhatsNewCard();
      window.scrollTo(0, 0);
      const url = new URL(window.location.href);
      if (url.searchParams.has("tour")) {
        url.searchParams.delete("tour");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [want, run, pathname]);

  const end = useCallback((finished: boolean) => {
    setRun(null);
    store.set(true);
    if (finished) sounds.celebrate();
    void setTutorialDone().catch(() => {});
  }, []);

  if (!run) return null;
  // Its code didn't come (offline): no tour this time; it starts again on the next visit.
  return (
    <LaterBoundary name="Tour">
      <Suspense fallback={null}>
        <TourRun phone={run.phone} mac={run.mac} onEnd={end} />
      </Suspense>
    </LaterBoundary>
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
