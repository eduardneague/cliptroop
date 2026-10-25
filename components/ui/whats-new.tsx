"use client";

import { APP_NAME } from "@/lib/brand";
import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "./dialog";
import { Mascot } from "./mascot";
import { CloseIcon } from "./icons";
import { Skeleton, SkeletonLines } from "./skeleton";
import { LaterBoundary, LaterFailed } from "./later-boundary";
import { isFeatureUpdateIn, type ReleaseHeadline } from "@/lib/changelog-meta";
import { APP_VERSION } from "@/lib/version";
import { sounds } from "@/lib/sounds";

/*
 * What's new — the patch notes, without a page.
 *
 *  - <WhatsNewHost/> (once, in the dashboard layout) owns the window, and
 *    after a feature update shows a small card with Clippy: "VPlanner 1.2 is
 *    here" (once per device per update).
 *  - <WhatsNewButton/> opens it from anywhere (sidebar, Settings, Team),
 *    with an amber dot until this device has looked at the current version.
 *  - The content is lib/changelog.ts. 1.32.2: it's over 100 KB of text, so
 *    it isn't part of the page: whats-new-notes.tsx brings it when the window
 *    opens (or when you point at a button, or the card shows). What the
 *    frame needs on every page (this version's headline, whether there's a
 *    card to show) comes from the server (whatsNewFacts in the layout).
 *
 * Remembered per device in localStorage (it's only "have I seen this").
 */

const SEEN = "vp-whats-new-seen";
const TOLD = "vp-whats-new-told";
const OPEN_EVENT = "vp:whats-new-open";
const SEEN_EVENT = "vp:whats-new-seen";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: nothing to remember */
  }
};

const loadNotes = () => import("./whats-new-notes");
const WhatsNewNotes = lazy(loadNotes);
/** Bring the notes ahead of opening them (pointing at a button, the update card showing). */
const warmNotes = () => void loadNotes().catch(() => null);

export function openWhatsNew() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** True when this device hasn't opened What's new since the current version. */
function useUnseen() {
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    // (Every version has its notes: tests/bundle.test.ts checks the newest is package.json's.)
    const check = () => setUnseen(read(SEEN) !== APP_VERSION);
    check();
    window.addEventListener(SEEN_EVENT, check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener(SEEN_EVENT, check);
      window.removeEventListener("storage", check);
    };
  }, []);
  return unseen;
}

function markSeen() {
  write(SEEN, APP_VERSION);
  write(TOLD, APP_VERSION);
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** "1.6.0" → "1.6", "1.7.5" → "1.7.5" (a patch number only when it isn't 0). */
const short = (v: string) => {
  const [a, b, c] = v.split(".");
  return c && c !== "0" ? `${a}.${b}.${c}` : `${a}.${b ?? 0}`;
};
export const niceDate = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null);

/** Clip's tour is starting: no "is here" card on top of it (the sidebar dot stays). */
export function quietWhatsNewCard() {
  write(TOLD, APP_VERSION);
}

/**
 * `hold`: Clip's tour is about to start, so no update card this time.
 * `current` and `newVersions`: from the server (whatsNewFacts): the version
 * you're on, and the versions of its series that brought something new.
 */
export function WhatsNewHost({ hold = false, current, newVersions }: { hold?: boolean; current: ReleaseHeadline | null; newVersions: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState(false);
  // What they hold, not the objects: the frame drawing again (router.refresh) doesn't start the card over.
  const knownVersion = current?.version ?? null;
  const newKey = newVersions.join(",");

  useEffect(() => {
    const onOpen = () => {
      setCard(false);
      setOpen(true);
      markSeen();
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    // After a feature update (not for small fixes), once per device.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const last = read(TOLD) ?? read(SEEN);
    if (!hold && knownVersion && last !== APP_VERSION && isFeatureUpdateIn(last, APP_VERSION, newKey ? newKey.split(",") : [])) {
      timer = setTimeout(() => {
        setCard(true);
        sounds.pop();
        warmNotes();
      }, 1400);
    }
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      if (timer) clearTimeout(timer);
    };
  }, [hold, knownVersion, newKey]);

  const dismissCard = () => {
    write(TOLD, APP_VERSION);
    setCard(false);
  };

  return (
    <>
      {card && current && <UpdateCard release={current} onOpen={openWhatsNew} onClose={dismissCard} />}
      <Dialog open={open} onClose={() => setOpen(false)} title="What's new" description={`You're on ${APP_NAME} ${APP_VERSION}.`} width="sm:max-w-2xl">
        {open && (
          <LaterBoundary name="What's new" fallback={({ load }) => <LaterFailed load={load} what="The notes" />}>
            <Suspense fallback={<NotesLoading current={current} />}>
              <WhatsNewNotes />
            </Suspense>
          </LaterBoundary>
        )}
      </Dialog>
    </>
  );
}

function UpdateCard({ release, onOpen, onClose }: { release: ReleaseHeadline; onOpen: () => void; onClose: () => void }) {
  return createPortal(
    <div
      role="status"
      className="fixed z-[90] left-3 right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:left-[252px] md:right-auto md:bottom-5 md:w-[360px] rounded-2xl border border-line/15 bg-surface shadow-[0_18px_50px_-18px_rgb(0_0_0/0.45)] p-3.5 pr-10 flex items-center gap-3 animate-[whats-new-in_.5s_var(--ease-spring)_both]"
    >
      <Mascot mood="celebrate" size={58} className="flex-shrink-0 -my-1" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug">{APP_NAME} {short(release.version)} is here</p>
        <p className="text-[12px] text-ink-soft leading-snug mt-0.5 line-clamp-2">{release.title}</p>
        <button type="button" data-sound="none" onClick={onOpen} className="mt-2 rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px] hover:brightness-110">
          See what&rsquo;s new
        </button>
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="absolute top-2 right-2 w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
    </div>,
    document.body
  );
}

/** The newest update's banner, at the top of the notes: also shown while they load (from what the frame knows). */
export function WhatsNewLatest({ release }: { release: ReleaseHeadline }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-amber/[0.07] border border-amber/20 px-4 py-3">
      <Mascot mood="celebrate" size={76} className="flex-shrink-0 -my-2" />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber">Latest · {release.version}</p>
        <p className="font-display text-[19px] font-semibold leading-tight mt-0.5">{release.title}</p>
        {release.date && <p className="text-[12px] text-ink-soft mt-0.5">{niceDate(release.date)}</p>}
      </div>
    </div>
  );
}

/** While the notes arrive (a moment, the first time): the banner and the list's shape. */
function NotesLoading({ current }: { current: ReleaseHeadline | null }) {
  return (
    <div className="space-y-6" aria-busy="true">
      {current ? <WhatsNewLatest release={current} /> : <Skeleton className="h-[86px] rounded-2xl" />}
      <div className="space-y-3">
        {[3, 2, 2].map((lines, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <Skeleton className="w-[52px] h-[18px] flex-shrink-0" />
            <SkeletonLines lines={lines} className="flex-1 pt-0.5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Opens What's new. `variant`:
 *  - "sidebar": a quiet row above your name in the sidebar
 *  - "link": inline text link (Settings, Team footer)
 */
export function WhatsNewButton({ variant = "link", className = "" }: { variant?: "sidebar" | "link"; className?: string }) {
  const unseen = useUnseen();
  if (variant === "sidebar")
    return (
      <button
        type="button"
        onClick={openWhatsNew}
        onPointerEnter={warmNotes}
        onFocus={warmNotes}
        className={`w-full flex items-center gap-2 rounded-lg px-2 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors ${className}`}
      >
        <SparkIcon className="w-4 h-4 text-amber" />
        <span className="flex-1 text-left">What&rsquo;s new</span>
        {unseen ? (
          <span className="w-2 h-2 rounded-[3px] bg-amber animate-[whats-new-dot_2s_ease-in-out_infinite]" aria-label="New update" />
        ) : (
          <span className="text-[10.5px] font-medium text-ink-faint tabular-nums">{APP_VERSION}</span>
        )}
      </button>
    );
  return (
    <button type="button" onClick={openWhatsNew} onPointerEnter={warmNotes} onFocus={warmNotes} className={`relative inline-flex items-center gap-1.5 font-semibold text-amber hover:brightness-110 ${className}`}>
      <SparkIcon className="w-3.5 h-3.5" />
      What&rsquo;s new
      {unseen && <span className="w-1.5 h-1.5 rounded-[2px] bg-amber" aria-label="New update" />}
    </button>
  );
}

export function SparkIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5c.5 3.9 2.1 5.5 6 6-3.9.5-5.5 2.1-6 6-.5-3.9-2.1-5.5-6-6 3.9-.5 5.5-2.1 6-6Z" />
      <path d="M18.5 15.5c.2 1.5.8 2.1 2.3 2.3-1.5.2-2.1.8-2.3 2.3-.2-1.5-.8-2.1-2.3-2.3 1.5-.2 2.1-.8 2.3-2.3Z" />
    </svg>
  );
}
