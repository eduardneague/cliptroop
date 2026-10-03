"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "./dialog";
import { Mascot } from "./mascot";
import { CloseIcon } from "./icons";
import { CHANGELOG, KIND_LABEL, isFeatureUpdate, type ChangeKind, type Release } from "@/lib/changelog";
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
 *  - The content is lib/changelog.ts.
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

const current = CHANGELOG.find((r) => r.version === APP_VERSION) ?? null;

export function openWhatsNew() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** True when this device hasn't opened What's new since the current version. */
function useUnseen() {
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    const check = () => setUnseen(!!current && read(SEEN) !== APP_VERSION);
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
const niceDate = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : null);

const KIND_STYLE: Record<ChangeKind, string> = {
  new: "bg-amber/12 text-amber",
  better: "bg-blue/12 text-blue",
  fixed: "bg-green/12 text-green",
};

export function WhatsNewHost() {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState(false);

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
    if (current && last !== APP_VERSION && isFeatureUpdate(last, APP_VERSION)) {
      timer = setTimeout(() => {
        setCard(true);
        sounds.pop();
      }, 1400);
    }
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismissCard = () => {
    write(TOLD, APP_VERSION);
    setCard(false);
  };

  return (
    <>
      {card && current && <UpdateCard release={current} onOpen={openWhatsNew} onClose={dismissCard} />}
      <Dialog open={open} onClose={() => setOpen(false)} title="What's new" description={`You're on VPlanner ${APP_VERSION}.`} width="sm:max-w-2xl">
        {open && <Notes />}
      </Dialog>
    </>
  );
}

function UpdateCard({ release, onOpen, onClose }: { release: Release; onOpen: () => void; onClose: () => void }) {
  return createPortal(
    <div
      role="status"
      className="fixed z-[90] left-3 right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:left-[252px] md:right-auto md:bottom-5 md:w-[360px] rounded-2xl border border-line/15 bg-surface shadow-[0_18px_50px_-18px_rgb(0_0_0/0.45)] p-3.5 pr-10 flex items-center gap-3 animate-[whats-new-in_.5s_var(--ease-spring)_both]"
    >
      <Mascot mood="celebrate" size={58} className="flex-shrink-0 -my-1" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug">VPlanner {short(release.version)} is here</p>
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

/** The changelog: the latest update open, earlier ones folded. */
function Notes() {
  const [latest, ...earlier] = CHANGELOG;
  const [showAll, setShowAll] = useState(false);
  if (!latest) return <p className="text-[13px] text-ink-soft">No notes yet.</p>;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-2xl bg-amber/[0.07] border border-amber/20 px-4 py-3">
        <Mascot mood="celebrate" size={76} className="flex-shrink-0 -my-2" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber">Latest · {latest.version}</p>
          <p className="font-display text-[19px] font-semibold leading-tight mt-0.5">{latest.title}</p>
          {latest.date && <p className="text-[12px] text-ink-soft mt-0.5">{niceDate(latest.date)}</p>}
        </div>
      </div>
      <ChangeList release={latest} />
      {earlier.length > 0 && (
        <div className="border-t border-line/10 pt-4">
          {!showAll ? (
            <button type="button" onClick={() => setShowAll(true)} className="text-[13px] font-semibold text-ink-soft hover:text-ink">
              Earlier updates ({earlier.length})
            </button>
          ) : (
            <div className="space-y-6 animate-[fadein_.2s_ease]">
              {earlier.map((r) => (
                <section key={r.version}>
                  <div className="flex items-baseline gap-2 flex-wrap mb-2.5">
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-bold tabular-nums">{r.version}</span>
                    <h3 className="text-[14.5px] font-semibold">{r.title}</h3>
                    {r.date && <span className="text-[12px] text-ink-faint">{niceDate(r.date)}</span>}
                  </div>
                  <ChangeList release={r} />
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChangeList({ release }: { release: Release }) {
  return (
    <ul className="space-y-2.5">
      {release.changes.map((c, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className={`mt-[1px] flex-shrink-0 w-[52px] text-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${KIND_STYLE[c.kind]}`}>{KIND_LABEL[c.kind]}</span>
          <span className="text-[13.5px] leading-relaxed text-ink">{c.text}</span>
        </li>
      ))}
    </ul>
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
        className={`w-full flex items-center gap-2 rounded-lg px-2 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors ${className}`}
      >
        <SparkIcon className="w-4 h-4 text-amber" />
        <span className="flex-1 text-left">What&rsquo;s new</span>
        {unseen ? (
          <span className="w-2 h-2 rounded-full bg-amber animate-[whats-new-dot_2s_ease-in-out_infinite]" aria-label="New update" />
        ) : (
          <span className="text-[10.5px] font-medium text-ink-faint tabular-nums">{APP_VERSION}</span>
        )}
      </button>
    );
  return (
    <button type="button" onClick={openWhatsNew} className={`relative inline-flex items-center gap-1.5 font-semibold text-amber hover:brightness-110 ${className}`}>
      <SparkIcon className="w-3.5 h-3.5" />
      What&rsquo;s new
      {unseen && <span className="w-1.5 h-1.5 rounded-full bg-amber" aria-label="New update" />}
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
