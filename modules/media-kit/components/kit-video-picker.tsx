"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { searchKitVideos } from "@/app/(dashboard)/analytics/media-kit-actions";
import { isVertical, type KitVideo } from "../lib/numbers";
import { toPicked } from "../lib/manual";
import { big } from "../lib/scene";
import { KIT_PLATFORM_NAME, videoKey, type KitCoverGrid, type PickedVideo, type VideoPicks } from "../lib/settings";

/*
 * Picking the kit's videos by hand (1.39.0). The owner: "pick which videos i want to feature manually as well, not
 * just the best videos"; "for the cover, i want to be able to select what videos i want in the first page, long videos
 * too, and a hybrid between longs and shorts, a cool grid". The best (most viewed) by default; picked ones show in the
 * order they're picked, and can be moved and taken out. Any video the team has posted can be found by its title.
 */

/** The best, or the ones picked: the choice, what's picked (moved, taken out), and the window to pick more. */
export function VideoPicksField({
  picks,
  onChange,
  max,
  pool,
  teamId,
  title,
  bestLabel,
  emptyHint,
  columns = 3,
  ariaLabel,
}: {
  /** The choice's name (the cover's and the videos page's are told apart). */
  ariaLabel: string;
  picks: VideoPicks;
  onChange: (p: VideoPicks) => void;
  max: number;
  /** The videos to pick from before searching (the period's and the most viewed ever). */
  pool: KitVideo[];
  teamId: string;
  /** The window's title. */
  title: string;
  bestLabel: string;
  /** Said while nothing's picked. */
  emptyHint: string;
  columns?: 3 | 4;
}) {
  const [open, setOpen] = useState(false);
  const list = picks.list;
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...picks, list: next });
  };
  const drag = useRef<number | null>(null);
  return (
    <div className="space-y-2.5">
      <Segmented
        ariaLabel={ariaLabel}
        value={picks.on ? "pick" : "best"}
        onChange={(v) => {
          onChange({ ...picks, on: v === "pick" });
          if (v === "pick" && !list.length) setOpen(true);
        }}
        options={[
          { value: "best", label: bestLabel },
          { value: "pick", label: "Pick them" },
        ]}
      />
      {picks.on &&
        (list.length ? (
          <>
            <ol className={`grid gap-2 ${columns === 4 ? "grid-cols-4" : "grid-cols-3"}`} aria-label="Picked videos, in their order">
              {list.map((v, i) => (
                <li
                  key={videoKey(v)}
                  draggable
                  onDragStart={(e) => {
                    drag.current = i;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (drag.current !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = drag.current;
                    drag.current = null;
                    if (from === null || from === i) return;
                    const next = [...list];
                    const [item] = next.splice(from, 1);
                    next.splice(i, 0, item);
                    onChange({ ...picks, list: next });
                  }}
                  onDragEnd={() => (drag.current = null)}
                  className="group relative min-w-0 cursor-grab active:cursor-grabbing"
                >
                  <Thumb v={v} className="rounded-lg" />
                  <span className="absolute top-1 left-1 min-w-5 h-5 px-1 rounded-md bg-black/65 text-white text-[11px] font-bold tabular-nums flex items-center justify-center">{i + 1}</span>
                  <span className="absolute inset-x-1 bottom-1 flex items-center justify-between opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                    <span className="flex">
                      <TileButton label={`Move ${v.title || "this video"} earlier`} onClick={() => move(i, -1)} disabled={i === 0}>
                        <ChevronLeftIcon className="w-3.5 h-3.5" />
                      </TileButton>
                      <TileButton label={`Move ${v.title || "this video"} later`} onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                        <ChevronRightIcon className="w-3.5 h-3.5" />
                      </TileButton>
                    </span>
                    <TileButton label={`Take ${v.title || "this video"} out`} onClick={() => onChange({ ...picks, list: list.filter((x) => videoKey(x) !== videoKey(v)) })}>
                      <CloseIcon className="w-3.5 h-3.5" />
                    </TileButton>
                  </span>
                  <span className="sr-only">{v.title || "Untitled"}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-9 text-[13px] font-semibold hover:bg-surface-2">
                <PlusIcon className="w-4 h-4" />
                {list.length < max ? "Pick more" : "Change"}
              </button>
              <span className="text-[12px] text-ink-faint">{`${list.length} of ${max}. Drag or use the arrows to change the order.`}</span>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="w-full rounded-xl border border-dashed border-line/25 px-4 py-4 text-left hover:border-line/45 hover:bg-surface-2/40 transition-colors">
            <span className="flex items-center gap-2 text-[13.5px] font-semibold">
              <PlusIcon className="w-4 h-4" />
              Pick videos
            </span>
            <span className="block text-[12px] text-ink-faint mt-0.5">{emptyHint}</span>
          </button>
        ))}
      <PickVideosDialog open={open} onClose={() => setOpen(false)} title={title} max={max} picked={list} pool={pool} teamId={teamId} onDone={(next) => onChange({ on: true, list: next })} />
    </div>
  );
}

function TileButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="w-6 h-6 rounded-md bg-black/65 text-white flex items-center justify-center hover:bg-black/80 disabled:opacity-30">
      {children}
    </button>
  );
}

/** A thumbnail in a wide tile: a vertical video upright in the middle of it, on a tint (as the kit draws it). */
function Thumb({ v, className = "" }: { v: Pick<KitVideo, "platform" | "kind" | "thumb">; className?: string }) {
  const tall = isVertical(v);
  return (
    <span className={`relative block aspect-video overflow-hidden bg-surface-2 ${className}`}>
      {v.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.thumb} alt="" loading="lazy" decoding="async" draggable={false} className={tall ? "absolute inset-y-0 left-1/2 -translate-x-1/2 h-full aspect-[9/16] object-cover" : "absolute inset-0 w-full h-full object-cover"} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <PlatformIcon platform={v.platform} className="w-6 h-6 opacity-70" />
        </span>
      )}
    </span>
  );
}

type Shape = "all" | "short" | "long";

/** What a video is, as people say it. */
function kindWord(v: Pick<KitVideo, "platform" | "kind">): string {
  if (v.kind === "post") return "post";
  if (v.kind === "live") return "live";
  if (!isVertical(v)) return "long video";
  return v.platform === "youtube" ? "Short" : v.platform === "tiktok" ? "TikTok" : "Reel";
}

/** The window: what's picked numbered in its order; search any video by its title. */
function PickVideosDialog({ open, onClose, title, max, picked, pool, teamId, onDone }: { open: boolean; onClose: () => void; title: string; max: number; picked: PickedVideo[]; pool: KitVideo[]; teamId: string; onDone: (list: PickedVideo[]) => void }) {
  const [draft, setDraft] = useState<PickedVideo[]>(picked);
  const [query, setQuery] = useState("");
  const [shape, setShape] = useState<Shape>("all");
  const [found, setFound] = useState<{ q: string; videos: KitVideo[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  // A mouse: straight into the search. A phone: no keyboard over the videos until you tap the search.
  const fine = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;

  // Each opening starts from what's picked now.
  useEffect(() => {
    if (!open) return;
    setDraft(picked);
    setQuery("");
    setFound(null);
    setProblem(null);
    setFull(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The search: a moment after typing stops; the latest one wins.
  const q = query.trim();
  useEffect(() => {
    if (!open || q.length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    let gone = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchKitVideos(teamId, q);
        if (gone) return;
        if (r.error !== undefined) setProblem(r.error);
        else {
          setFound({ q, videos: r.videos });
          setProblem(null);
        }
      } catch {
        if (!gone) setProblem("Couldn't search. Check your connection and try again.");
      } finally {
        if (!gone) setSearching(false);
      }
    }, 350);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [open, q, teamId]);

  // What shows: the pool (filtered by the words as you type), then the search's own finds.
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const local = words.length ? pool.filter((v) => words.every((w) => (v.title ?? "").toLowerCase().includes(w))) : pool;
    const extra = q && found?.q === q ? found.videos : [];
    const seen = new Set<string>();
    const out: KitVideo[] = [];
    for (const v of [...local, ...extra]) {
      const k = videoKey(v);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
    return out;
  }, [pool, found, q]);
  const counts = { all: shown.length, short: shown.filter(isVertical).length, long: shown.filter((v) => !isVertical(v)).length };
  const list = shape === "all" ? shown : shown.filter((v) => (shape === "short") === isVertical(v));

  const order = new Map(draft.map((v, i) => [videoKey(v), i]));
  const toggle = (v: KitVideo) => {
    const k = videoKey(v);
    if (order.has(k)) {
      setDraft(draft.filter((x) => videoKey(x) !== k));
      setFull(false);
    } else if (draft.length >= max) setFull(true);
    else setDraft([...draft, toPicked(v)]);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={`Up to ${max}, shown in the order you pick them. Search finds any video you've posted.`}
      width="sm:max-w-3xl"
      footer={
        <div className="w-full flex items-center gap-3 flex-wrap">
          <p className={`flex-1 min-w-0 text-[12.5px] ${full ? "text-coral" : "text-ink-soft"}`} role="status">
            {full ? `That's ${max}, the most it shows. Take one out to pick another.` : draft.length ? `${draft.length} of ${max} picked` : "Nothing picked yet"}
          </p>
          {draft.length > 0 && (
            <button type="button" onClick={() => (setDraft([]), setFull(false))} className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-line/15 px-3.5 h-9 text-[13px] font-semibold hover:bg-surface-2">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onDone(draft);
              onClose();
            }}
            className="rounded-lg bg-amber text-white px-3.5 h-9 text-[13px] font-bold hover:brightness-110"
          >
            {draft.length ? `Use ${draft.length === 1 ? "this video" : `these ${draft.length}`}` : "Use none"}
          </button>
        </div>
      }
    >
      {/* Stuck to the window's top edge: a sticky box keeps clear of its scroller's padding, so -top-4 takes the -mt-4 back. */}
      <div className="sticky -top-4 z-10 -mx-5 -mt-4 px-5 pt-4 pb-3 bg-surface space-y-2.5">
        <label className="flex items-center gap-2 rounded-xl border border-line/15 bg-surface px-3 h-10 focus-within:ring-2 focus-within:ring-amber">
          <SearchIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your videos by title or #number" aria-label="Search your videos" className="flex-1 min-w-0 bg-transparent outline-none text-[14px] placeholder:text-ink-faint" data-autofocus={fine ? "" : undefined} />
          {searching && <span className="w-3.5 h-3.5 rounded-full border-2 border-line/30 border-t-ink-soft animate-spin flex-shrink-0" aria-label="Searching" />}
          {query && !searching && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear the search" className="w-6 h-6 rounded-md text-ink-faint hover:text-ink flex items-center justify-center">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
        <Segmented
          size="sm"
          ariaLabel="Which kind"
          value={shape}
          onChange={setShape}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "short", label: "Shorts and Reels", count: counts.short },
            { value: "long", label: "Long videos", count: counts.long },
          ]}
        />
      </div>
      {problem && <p className="rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5 mb-3">{problem}</p>}
      {list.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 gap-y-4 pt-1">
          {list.map((v) => {
            const n = order.get(videoKey(v));
            const on = n !== undefined;
            return (
              <button
                key={videoKey(v)}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(v)}
                className="group text-left min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <span className={`relative block rounded-lg transition-shadow ${on ? "shadow-[0_0_0_2.5px_rgb(var(--amber))]" : "group-hover:shadow-[0_0_0_1.5px_rgb(var(--line)/0.35)]"}`}>
                  <Thumb v={v} className="rounded-lg" />
                  <PlatformIcon platform={v.platform} className="absolute left-1.5 bottom-1.5 w-4 h-4 drop-shadow" />
                  <span className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold tabular-nums transition-colors ${on ? "bg-amber text-white" : "bg-black/35 text-transparent border border-white/70"}`} aria-hidden>
                    {on ? n + 1 : ""}
                  </span>
                </span>
                <span className="block mt-1.5 text-[12.5px] font-semibold leading-snug line-clamp-2">{v.title || "Untitled"}</span>
                <span className="block text-[11.5px] text-ink-faint mt-0.5">{`${v.views !== null ? `${big(v.views)} views` : "No views yet"}, ${kindWord(v)}`}</span>
                <span className="sr-only">{`on ${KIT_PLATFORM_NAME[v.platform]}`}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[13px] text-ink-soft py-8 text-center">
          {searching ? "Searching…" : q ? `No ${shape === "short" ? "Shorts or Reels" : shape === "long" ? "long videos" : "videos"} match “${q}”.` : shape === "all" ? "No videos with numbers yet. Connect a channel in Team → Connected accounts." : `No ${shape === "short" ? "Shorts or Reels" : "long videos"} here yet. Search for one by its title.`}
        </p>
      )}
    </Dialog>
  );
}

// ---- The cover's wall ------------------------------------------------------------------------------------------------

/** The wall's shapes, drawn small (the right side of the cover, as the kit lays it out). */
function WallGlyph({ grid }: { grid: "shorts" | "longs" | "mixed" }) {
  const tiles: { x: number; y: number; w: number; h: number }[] = [];
  const col = (x: number, start: number, sizes: number[], w: number) => {
    let y = start;
    for (let k = 0; y < 40; k++) {
      const h = sizes[k % sizes.length];
      tiles.push({ x, y, w, h });
      y += h + 2;
    }
  };
  if (grid === "shorts") [-2, -7, -4].forEach((off, i) => col(4 + i * 13, off, [15], 11));
  else if (grid === "longs") [-3, -8].forEach((off, i) => col(4 + i * 20, off, [10.5], 18.5));
  else {
    col(4, -3, [10.5, 25], 18.5);
    col(24.5, -10, [25, 10.5], 18.5);
  }
  return (
    <svg viewBox="0 0 48 36" className="w-12 h-9 rounded-md bg-surface-2" aria-hidden>
      <defs>
        <clipPath id={`wall-${grid}`}>
          <rect width="48" height="36" rx="5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#wall-${grid})`} className="fill-current">
        {tiles.map((t, i) => (
          <rect key={i} x={t.x} y={t.y} width={t.w} height={t.h} rx="1.6" />
        ))}
      </g>
    </svg>
  );
}

const GRID_LABEL: Record<KitCoverGrid, string> = { auto: "Auto", shorts: "Shorts", longs: "Long videos", mixed: "Both" };

/** The cover's wall: as its videos are (Auto), Shorts, long videos, or both in one grid. */
export function CoverGridPicker({ value, onChange, auto }: { value: KitCoverGrid; onChange: (g: KitCoverGrid) => void; auto: "shorts" | "longs" | "mixed" }) {
  const opts: KitCoverGrid[] = ["auto", "shorts", "longs", "mixed"];
  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const by = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!by) return;
    e.preventDefault();
    const next = opts[(opts.indexOf(value) + by + opts.length) % opts.length];
    onChange(next);
    const box = e.currentTarget;
    requestAnimationFrame(() => box.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus());
  };
  return (
    <div role="radiogroup" aria-label="The wall of videos" onKeyDown={move} className="grid grid-cols-4 gap-2">
      {opts.map((g) => {
        const on = g === value;
        return (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-value={g}
            onClick={() => onChange(g)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 pt-2 pb-1.5 transition-colors ${on ? "border-amber/60 bg-amber/[0.08] text-amber" : "border-line/15 text-ink-faint hover:text-ink-soft hover:border-line/30"}`}
          >
            <WallGlyph grid={g === "auto" ? auto : g} />
            <span className={`text-[11.5px] font-semibold leading-tight text-center ${on ? "text-ink" : "text-ink-soft"}`}>
              {GRID_LABEL[g]}
              {g === "auto" && <span className="block font-normal text-[10.5px] text-ink-faint">{`now ${GRID_LABEL[auto].toLowerCase()}`}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
