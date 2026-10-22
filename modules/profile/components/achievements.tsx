"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { shortDate, TIER_LABEL, type AchievementIcon, type AchievementState } from "@/lib/profile/progress";
import {
  AppsIcon,
  ArchiveIcon,
  BookIcon,
  CameraIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  FlameIcon,
  LockIcon,
  MoonIcon,
  PostingIcon,
  ScissorsIcon,
  SearchIcon,
  StarIcon,
  SunIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
  VideoIcon,
} from "@/components/ui/icons";

/*
 * Achievements as medallions (1.28.0), and since 1.29.6 a card for each:
 * point at a medal (or tap it, or Tab to it) and a card pops up beside it
 * with what it is, what it means and how far along you are, while the
 * medal spins in with a shine (or its ring fills, when it's still locked).
 *
 * One card for the whole page (AchievementCards, round the profile), not one
 * per medal: a medal only says "show me" and where it is. Scrolling, Esc or
 * a tap elsewhere puts the card away. Animations stop with animations off.
 */

const ICONS: Record<AchievementIcon, (p: { className?: string }) => React.ReactNode> = {
  check: CheckIcon,
  flame: FlameIcon,
  trophy: TrophyIcon,
  clock: ClockIcon,
  book: BookIcon,
  scissors: ScissorsIcon,
  camera: CameraIcon,
  search: SearchIcon,
  eye: EyeIcon,
  archive: ArchiveIcon,
  posting: PostingIcon,
  target: TargetIcon,
  star: StarIcon,
  users: UsersIcon,
  apps: AppsIcon,
  moon: MoonIcon,
  sun: SunIcon,
  video: VideoIcon,
};

const statusOf = (a: AchievementState) => (a.unlocked ? (a.at ? `reached ${shortDate(a.at)}` : "reached") : `${a.have} of ${a.goal}`);

type Shown = { a: AchievementState; el: Element; rect: DOMRect; key: number; pinned: boolean };
type Api = {
  show: (a: AchievementState, el: Element, pinned?: boolean) => void;
  /** Keeps the one showing (a click or a tap): it stays when the pointer leaves. */
  pin: () => void;
  hide: (pinnedToo?: boolean) => void;
  current: () => Shown | null;
};
const Cards = createContext<Api | null>(null);

/** Round a page whose medals show a card (the profile). */
export function AchievementCards({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const ref = useRef<Shown | null>(null);
  ref.current = shown;
  const n = useRef(0);
  const id = useId();
  const api = useMemo<Api>(
    () => ({
      show: (a, el, pinned = false) => setShown({ a, el, rect: el.getBoundingClientRect(), key: ++n.current, pinned }),
      pin: () => setShown((s) => (s ? { ...s, pinned: true } : s)),
      hide: (pinnedToo = false) => setShown((s) => (s && (pinnedToo || !s.pinned) ? null : s)),
      current: () => ref.current,
    }),
    [],
  );
  // The medal showing its card points screen readers at it.
  useEffect(() => {
    const el = shown?.el;
    if (!el) return;
    el.setAttribute("aria-describedby", id);
    return () => el.removeAttribute("aria-describedby");
  }, [shown?.el, id]);
  useEffect(() => {
    if (!shown) return;
    const close = () => setShown(null);
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-medal]")) close();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [shown]);
  return (
    <Cards.Provider value={api}>
      {children}
      {shown && createPortal(<Card key={shown.key} s={shown} id={id} />, document.body)}
    </Cards.Provider>
  );
}

/** The card: above the medal (below it when there's no room), inside the window, with a little arrow at the medal. */
function Card({ s, id }: { s: Shown; id: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number; arrow: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    const r = s.rect;
    const below = r.top - h - 14 < 8;
    const top = below ? Math.min(window.innerHeight - h - 8, r.bottom + 12) : r.top - h - 12;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    setAt({ top, left, arrow: Math.max(16, Math.min(w - 16, r.left + r.width / 2 - left)), below });
  }, [s]);
  const a = s.a;
  const share = a.goal ? a.have / a.goal : 0;
  return (
    <div
      ref={box}
      id={id}
      role="tooltip"
      className="pf-card"
      data-below={at?.below ? "" : undefined}
      data-tier={a.tier}
      style={at ? ({ top: at.top, left: at.left, "--ax": `${at.arrow}px` } as CSSProperties) : { top: 0, left: 0, visibility: "hidden" }}
    >
      <div className="flex items-center gap-3">
        <span className="pf-card-medal">
          <Medal a={a} size={54} />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[16px] font-semibold leading-tight">{a.name}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-soft">
            <span className="pf-tier font-bold" data-tier={a.tier}>
              {TIER_LABEL[a.tier]}
            </span>
            {a.unlocked ? (a.at ? ` · Reached ${shortDate(a.at)}` : " · Reached") : " · Not yet"}
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-[12.5px] font-semibold leading-snug">{a.text}</p>
      <p className="mt-1 text-[12px] text-ink-soft leading-snug">{a.why}</p>
      {!a.unlocked && (
        <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-ink-soft tabular-nums">
          <span className="flex-1 h-1.5 rounded-full bg-line/15 overflow-hidden">
            <span className="pf-card-bar block h-full rounded-full" style={{ width: `${Math.max(3, share * 100)}%` }} />
          </span>
          {a.have.toLocaleString("en-US")} / {a.goal.toLocaleString("en-US")}
        </div>
      )}
    </div>
  );
}

/** A medallion: the tier's colours when reached; grey with a ring of how far along when not. */
function Medal({ a, size }: { a: AchievementState; size: number }) {
  const Icon = ICONS[a.icon];
  return (
    <span className="pf-medal" data-tier={a.tier} data-locked={a.unlocked ? undefined : ""} style={{ "--ms": `${size}px`, "--mp": `${(a.have / a.goal) * 360}deg` } as CSSProperties}>
      <span className="pf-medal-face">
        <Icon className="w-[45%] h-[45%]" />
      </span>
      {!a.unlocked && (
        <span className="pf-medal-lock" aria-hidden>
          <LockIcon className="w-2.5 h-2.5" />
        </span>
      )}
    </span>
  );
}

/**
 * One achievement as a medallion. `interactive` (1.29.6): it shows its card
 * (inside AchievementCards); leave it off where the medal sits in a button.
 */
export function AchievementBadge({ a, size = 44, interactive = false }: { a: AchievementState; size?: number; interactive?: boolean }) {
  const cards = useContext(Cards);
  const label = `${a.name}: ${a.text}. ${TIER_LABEL[a.tier]}, ${statusOf(a)}.`;
  if (!interactive || !cards) {
    return (
      <span title={label} role="img" aria-label={label} className="inline-flex">
        <Medal a={a} size={size} />
      </span>
    );
  }
  const mine = (el: Element) => cards.current()?.el === el;
  return (
    <span
      data-medal
      role="button"
      tabIndex={0}
      aria-label={label}
      className="pf-medal-hit"
      onPointerEnter={(e) => e.pointerType === "mouse" && !mine(e.currentTarget) && cards.show(a, e.currentTarget)}
      onPointerLeave={(e) => e.pointerType === "mouse" && mine(e.currentTarget) && cards.hide()}
      onFocus={(e) => !mine(e.currentTarget) && cards.show(a, e.currentTarget)}
      onBlur={(e) => mine(e.currentTarget) && cards.hide(true)}
      onClick={(e) => {
        const c = cards.current();
        if (c?.el !== e.currentTarget) cards.show(a, e.currentTarget, true);
        else if (c.pinned) cards.hide(true);
        else cards.pin();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
    >
      <Medal a={a} size={size} />
    </span>
  );
}
