"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useLatest, useScrollLock } from "@/lib/hooks/use-scroll-lock";
import { Leaves } from "@/components/ui/leaves";
import { Ago } from "@/components/ui/ago";
import { Select } from "@/components/ui/select";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CopyIcon, DownloadIcon, ExpandIcon, ExternalIcon, LinkIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { wordColor } from "@/lib/word-color";
import { COLOR_CSS, categoryInfo, customKey, toggleCategory, type CustomCategory } from "../lib/categories";
import { cleanSourceUrl, filterGroups, frameHref, frameName, parseKeywords, sourceHost, type FrameCollection, type FrameGuide, type FrameLibrary } from "../lib/model";
import { CategoryChip, ColorDot, FrameNumber } from "./frame-bits";

/*
 * One guide frame, big (1.54.0): its picture on a dark stage (the arrows, or ← →, go through the frames on show), and
 * what it is beside it. On the page everything can be changed right there (saved as you go); from a script it's to
 * look at, with the way to its page.
 */

export type FramePatch = Partial<{ title: string; notes: string; creator: string; sourceUrl: string | null; keywords: string[]; categories: string[]; collectionId: string }>;

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Download a frame's picture. */
async function downloadFrame(f: FrameGuide) {
  try {
    const res = await fetch(f.url);
    const blob = await res.blob();
    const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "webp";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `frame-${f.number}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    if (/^https?:\/\//i.test(f.url)) window.open(f.url, "_blank", "noopener");
  }
}

/** The big picture, on a dark stage (pictures read best on dark, in every theme). */
function Stage({ f, index, total, onPrev, onNext, onZoom }: { f: FrameGuide; index: number; total: number; onPrev?: () => void; onNext?: () => void; onZoom: () => void }) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const ready = loaded === f.id;
  return (
    <div className="relative flex-1 min-h-0 min-w-0 flex items-center justify-center bg-[#0d0d0f] overflow-hidden select-none">
      {/* Its own colour, softly, behind it (and while it loads). */}
      {f.tint && <div aria-hidden className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(70% 70% at 50% 50%, ${f.tint}, transparent)` }} />}
      {/* The small one at once, the full one over it when it's here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={`s-${f.id}`} src={f.thumb} alt="" aria-hidden className={`absolute max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] object-contain blur-[2px] transition-opacity duration-300 ${ready ? "opacity-0" : "opacity-100"}`} style={{ aspectRatio: `${f.w} / ${f.h}`, width: f.w >= f.h ? "calc(100% - 2rem)" : undefined, height: f.h > f.w ? "calc(100% - 2rem)" : undefined }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={f.id}
        src={f.url}
        alt={f.title || frameName(f)}
        onLoad={() => setLoaded(f.id)}
        onDoubleClick={onZoom}
        className={`relative max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] object-contain rounded-md shadow-[0_20px_60px_-20px_rgb(0_0_0/0.9)] transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
      />
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <FrameNumber n={f.number} className="h-7 px-2 text-[13px]" />
        {total > 1 && <span className="rounded-md bg-black/55 text-white/85 px-2 h-7 inline-flex items-center text-[12px] font-semibold tabular-nums">{index + 1} of {total}</span>}
      </div>
      <button type="button" onClick={onZoom} aria-label="Full screen" title="Full screen" className="absolute bottom-3 right-3 w-9 h-9 rounded-lg bg-black/55 text-white/90 hover:bg-black/75 hover:text-white flex items-center justify-center">
        <ExpandIcon className="w-4 h-4" />
      </button>
      {onPrev && (
        <button type="button" onClick={onPrev} aria-label="Previous frame" title="Previous (←)" className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 text-white/90 hover:bg-black/80 hover:text-white flex items-center justify-center">
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
      )}
      {onNext && (
        <button type="button" onClick={onNext} aria-label="Next frame" title="Next (→)" className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 text-white/90 hover:bg-black/80 hover:text-white flex items-center justify-center">
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

/** The window itself: the stage and a side for what it is. Esc closes, ← → go through the list. */
function FrameWindow({
  f,
  list,
  onPick,
  onClose,
  label,
  children,
}: {
  f: FrameGuide;
  /** The frames on show (← → go through them). */
  list: FrameGuide[];
  onPick: (id: string) => void;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  useScrollLock();
  const close = useLatest(onClose);
  const [zoom, setZoom] = useState(false);
  const index = Math.max(0, list.findIndex((x) => x.id === f.id));
  const prev = index > 0 ? list[index - 1] : null;
  const next = index < list.length - 1 ? list[index + 1] : null;
  const nav = useLatest({ prev, next, onPick, zoom });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (nav.current.zoom) return;
      if (e.key === "Escape" && !e.defaultPrevented) {
        // A field being typed in lets go first.
        if (isTyping(e.target)) return (e.target as HTMLElement).blur();
        e.preventDefault();
        close.current();
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && nav.current.prev) {
        e.preventDefault();
        nav.current.onPick(nav.current.prev.id);
      }
      if (e.key === "ArrowRight" && nav.current.next) {
        e.preventDefault();
        nav.current.onPick(nav.current.next.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, nav]);

  return createPortal(
    <Leaves lock>
      <div className="fixed inset-0 z-[120] flex items-stretch sm:items-center justify-center sm:p-4 lg:p-6">
        <div className="pop-dim absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="glass-pane glass-lift relative w-full sm:max-w-[1320px] h-full sm:h-[min(880px,94dvh)] flex flex-col lg:flex-row bg-surface text-ink sm:rounded-2xl border border-line/15 shadow-2xl overflow-hidden pop-modal"
        >
          <div className="h-[42dvh] sm:h-[48%] lg:h-auto lg:flex-1 min-h-0 flex">
            <Stage f={f} index={index} total={list.length} onPrev={prev ? () => onPick(prev.id) : undefined} onNext={next ? () => onPick(next.id) : undefined} onZoom={() => setZoom(true)} />
          </div>
          <div className="flex-1 lg:flex-none lg:w-[400px] min-h-0 flex flex-col border-t lg:border-t-0 lg:border-l border-line/10">{children}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 lg:hidden w-9 h-9 rounded-lg bg-black/55 text-white flex items-center justify-center">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      {zoom && <ImageLightbox url={f.url} alt={f.title || frameName(f)} onClose={() => setZoom(false)} />}
    </Leaves>,
    document.body
  );
}

/** Categories on a frame, as chips (read only). */
function CategoryList({ f, custom }: { f: FrameGuide; custom: CustomCategory[] }) {
  const infos = f.categories.map((k) => categoryInfo(k, custom)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!infos.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {infos.map((c) => (
        <CategoryChip key={c.key} name={c.name} color={c.color} on size="sm" />
      ))}
    </div>
  );
}

const LABEL = "block text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5";
const FIELD = "w-full rounded-lg border border-line/15 bg-surface-2/60 px-3 h-10 text-[13.5px] text-ink placeholder:text-ink-faint outline-none focus:border-frame/60 focus:ring-2 focus:ring-frame/20 transition-colors";

/** Keywords as chips you type: Enter or a comma adds one, Backspace on an empty box takes the last one off. */
function KeywordInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const commit = (t = text) => {
    const add = parseKeywords(t);
    setText("");
    if (add.length) onChange(parseKeywords([...value, ...add]));
  };
  return (
    <div className="rounded-lg border border-line/15 bg-surface-2/60 px-2 py-1.5 flex flex-wrap gap-1.5 focus-within:border-frame/60 focus-within:ring-2 focus-within:ring-frame/20 transition-colors">
      {value.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-md bg-surface text-ink pl-2 pr-1 h-7 text-[12.5px] font-semibold ring-1 ring-inset ring-line/15">
          {k}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== k))} aria-label={`Remove ${k}`} className="w-5 h-5 rounded flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
            <CloseIcon className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;\n]/.test(v)) commit(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => commit()}
        placeholder={value.length ? "Add more…" : "desk, window light, slow-mo…"}
        aria-label="Keywords"
        className="flex-1 min-w-[8rem] bg-transparent h-7 px-1 text-[13px] text-ink placeholder:text-ink-faint outline-none"
      />
    </div>
  );
}

/**
 * Picking a frame's categories (a short list, 1.54.0): A-roll or B-roll, the shot, the team's own (and a new one of
 * those right there).
 */
export function CategoryPicker({
  value,
  onChange,
  custom,
  onCreate,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  custom: CustomCategory[];
  /** A new category of the team's own (its key, or null when it couldn't be made). */
  onCreate?: (name: string) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [making, setMaking] = useState(false);
  const groups = useMemo(() => filterGroups(custom), [custom]);
  const toggle = (k: string) => onChange(toggleCategory(value, k));
  async function create() {
    const n = name.trim();
    if (!n || !onCreate || making) return;
    const existing = custom.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      if (!value.includes(customKey(existing.id))) onChange([...value, customKey(existing.id)]);
      setName("");
      setAdding(false);
      return;
    }
    setMaking(true);
    const key = await onCreate(n);
    setMaking(false);
    if (key) {
      setName("");
      setAdding(false);
      onChange([...value, key]);
    }
  }
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="text-[11px] font-semibold text-ink-faint mb-1.5">{g.name}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((it) => (
              <CategoryChip key={it.key} name={it.name} color={it.color} on={value.includes(it.key)} onClick={() => toggle(it.key)} size={g.id === "roll" ? "md" : "sm"} title={it.hint} />
            ))}
            {g.id === "yours" &&
              onCreate &&
              (adding ? (
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void create();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setAdding(false);
                      setName("");
                    }
                  }}
                  onBlur={() => (name.trim() ? void create() : setAdding(false))}
                  maxLength={40}
                  disabled={making}
                  placeholder="Its name, then Enter"
                  aria-label="A new category"
                  className="h-6 w-40 rounded-lg border border-frame/50 bg-surface px-2 text-[12px] text-ink outline-none focus:ring-2 focus:ring-frame/20"
                />
              ) : (
                <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line/30 px-2 h-6 text-[11.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/50">
                  <PlusIcon className="w-3 h-3" />
                  New
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The page's: everything about a frame, changed right there. Words save when you leave the box (or pause), choices at
 * once; the arrows go on to the next frame (tagging a batch is: type, →, type).
 */
export function FrameDetails({
  lib,
  f,
  list,
  onPick,
  onClose,
  onSave,
  onDelete,
  onCreateCategory,
  onCopyLink,
}: {
  lib: FrameLibrary;
  f: FrameGuide;
  list: FrameGuide[];
  onPick: (id: string) => void;
  onClose: () => void;
  /** Saves; null when it's saved, else what went wrong. */
  onSave: (id: string, patch: FramePatch) => Promise<string | null>;
  onDelete?: (f: FrameGuide) => void;
  onCreateCategory: (name: string) => Promise<string | null>;
  onCopyLink: (f: FrameGuide) => void;
}) {
  return (
    <FrameWindow f={f} list={list} onPick={onPick} onClose={onClose} label={frameName(f)}>
      <Editor key={f.id} lib={lib} f={f} onClose={onClose} onSave={onSave} onDelete={onDelete} onCreateCategory={onCreateCategory} onCopyLink={onCopyLink} />
    </FrameWindow>
  );
}

function Editor({
  lib,
  f,
  onClose,
  onSave,
  onDelete,
  onCreateCategory,
  onCopyLink,
}: {
  lib: FrameLibrary;
  f: FrameGuide;
  onClose: () => void;
  onSave: (id: string, patch: FramePatch) => Promise<string | null>;
  onDelete?: (f: FrameGuide) => void;
  onCreateCategory: (name: string) => Promise<string | null>;
  onCopyLink: (f: FrameGuide) => void;
}) {
  const [title, setTitle] = useState(f.title);
  const [creator, setCreator] = useState(f.creator);
  const [source, setSource] = useState(f.sourceUrl ?? "");
  const [notes, setNotes] = useState(f.notes);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saving = useRef(0);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // The title box grows with a long title (two lines, three) instead of cutting it off.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  // A frame just added (no title yet): straight to its title, so tagging a batch is quick.
  useEffect(() => {
    if (!f.title && !f.keywords.length && !f.categories.length && Date.now() - new Date(f.createdAt).getTime() < 10 * 60_000) titleRef.current?.focus({ preventScroll: true });
  }, [f.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(patch: FramePatch) {
    const n = ++saving.current;
    setStatus("saving");
    const err = await onSave(f.id, patch);
    if (n !== saving.current) return;
    setStatus(err ? "error" : "saved");
  }
  // Words: saved a moment after you stop typing (and when you leave the box).
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const later = (key: "title" | "creator" | "notes" | "sourceUrl", value: string) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => void flush(key, value), 900);
  };
  const latest = useLatest({ title, creator, notes, source, f });
  async function flush(key: "title" | "creator" | "notes" | "sourceUrl", value: string) {
    clearTimeout(timers.current[key]);
    const was = key === "sourceUrl" ? latest.current.f.sourceUrl ?? "" : latest.current.f[key];
    if (value.trim() === was.trim()) return;
    if (key === "sourceUrl") {
      if (value.trim() && !cleanSourceUrl(value)) return setStatus("error");
      return save({ sourceUrl: value.trim() ? cleanSourceUrl(value) : null });
    }
    return save({ [key]: value } as FramePatch);
  }
  // Leaving the frame (the arrows, closing) keeps what was typed.
  useEffect(
    () => () => {
      const l = latest.current;
      for (const k of Object.keys(timers.current)) clearTimeout(timers.current[k]);
      const patch: FramePatch = {};
      if (l.title.trim() !== l.f.title.trim()) patch.title = l.title;
      if (l.creator.trim() !== l.f.creator.trim()) patch.creator = l.creator;
      if (l.notes.trim() !== l.f.notes.trim()) patch.notes = l.notes;
      if (l.source.trim() !== (l.f.sourceUrl ?? "").trim() && (!l.source.trim() || cleanSourceUrl(l.source))) patch.sourceUrl = l.source.trim() ? cleanSourceUrl(l.source) : null;
      if (Object.keys(patch).length) void onSave(l.f.id, patch);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const collection = lib.collections.find((c) => c.id === f.collectionId) ?? null;
  const by = f.createdBy ? lib.people[f.createdBy] : null;
  const host = sourceHost(cleanSourceUrl(source));
  return (
    <>
      <div className="px-5 pt-4 pb-3 border-b border-line/10 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-ink-soft mb-1">
            <span className="font-bold text-frame tabular-nums">#{f.number}</span>
            {collection && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <ColorDot color={collection.color} className="w-2 h-2" />
                <span className="truncate">{collection.name}</span>
              </span>
            )}
            <span className="ml-auto text-[11.5px] whitespace-nowrap" aria-live="polite">
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? <span className="text-red">Not saved</span> : ""}
            </span>
          </div>
          <textarea
            ref={titleRef}
            rows={1}
            value={title}
            onChange={(e) => {
              const v = e.target.value.replace(/\s*\n\s*/g, " ");
              setTitle(v);
              later("title", v);
            }}
            onBlur={() => void flush("title", title)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.currentTarget.blur();
            }}
            maxLength={120}
            placeholder="Name this shot…"
            aria-label="Title"
            className="block w-full resize-none overflow-hidden bg-transparent text-[19px] font-semibold leading-tight text-ink placeholder:text-ink-faint outline-none rounded-md -mx-1 px-1 py-0.5 focus:bg-surface-2/60"
          />
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="hidden lg:flex w-8 h-8 -mr-1.5 rounded-lg items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0">
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll px-5 py-4 space-y-5">
        <div>
          <span className={LABEL}>Collection</span>
          <Select
            value={f.collectionId}
            onChange={(v) => v && v !== f.collectionId && void save({ collectionId: v })}
            options={lib.collections.map((c) => ({ value: c.id, label: c.name, icon: <ColorDot color={c.color} /> }))}
            ariaLabel="Collection"
            size="bar"
          />
        </div>
        <div>
          <span className={LABEL}>Categories</span>
          <CategoryPicker value={f.categories} onChange={(v) => void save({ categories: v })} custom={lib.categories} onCreate={onCreateCategory} />
        </div>
        <div>
          <span className={LABEL}>Keywords</span>
          <KeywordInput value={f.keywords} onChange={(v) => void save({ keywords: v })} />
          <p className="mt-1 text-[11.5px] text-ink-faint">Anything you&rsquo;d search for it by. Enter or a comma adds one.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <label className="block">
            <span className={LABEL}>From</span>
            <input
              value={creator}
              onChange={(e) => {
                setCreator(e.target.value);
                later("creator", e.target.value);
              }}
              onBlur={() => void flush("creator", creator)}
              maxLength={80}
              placeholder="Who made it (a channel, a creator)"
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Link to it</span>
            <div className="flex gap-1.5">
              <input
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  later("sourceUrl", e.target.value);
                }}
                onBlur={() => void flush("sourceUrl", source)}
                inputMode="url"
                placeholder="youtube.com/watch?v=…&t=95"
                className={`${FIELD} ${source.trim() && !cleanSourceUrl(source) ? "!border-red/60" : ""}`}
              />
              {host && (
                <a href={cleanSourceUrl(source)!} target="_blank" rel="noopener noreferrer" title={`Open on ${host}`} aria-label={`Open on ${host}`} className="w-10 h-10 flex-shrink-0 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink hover:border-line/35">
                  <ExternalIcon className="w-4 h-4" />
                </a>
              )}
            </div>
          </label>
        </div>
        <label className="block">
          <span className={LABEL}>How to shoot it</span>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              later("notes", e.target.value);
            }}
            onBlur={() => void flush("notes", notes)}
            rows={4}
            maxLength={2000}
            placeholder="The lens, where the light comes from, where the camera is…"
            className={`${FIELD} !h-auto py-2.5 leading-relaxed resize-y min-h-[96px]`}
          />
        </label>
      </div>
      <div className="px-5 py-3 border-t border-line/10 flex items-center gap-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="flex-1 min-w-0 flex items-center gap-2 text-[11.5px] text-ink-soft">
          {by && <PersonAvatar name={by.name} avatarUrl={by.avatarUrl} color={by.color} className="w-5 h-5 text-[8.5px] flex-shrink-0" />}
          <span className="truncate">
            {by ? `${by.name} · ` : ""}
            <Ago iso={f.createdAt} />
          </span>
        </div>
        <button type="button" onClick={() => onCopyLink(f)} title="Copy a link to it" aria-label="Copy a link to it" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <LinkIcon className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => void downloadFrame(f)} title="Download" aria-label="Download the picture" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <DownloadIcon className="w-4 h-4" />
        </button>
        {onDelete && (
          <button type="button" onClick={() => onDelete(f)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-red hover:bg-red/10">
            <TrashIcon className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>
    </>
  );
}

/**
 * From a script (a frame guide on words, linked words, a frame's picture): the frame to look at, what it is, and the
 * way to its page. `actions`: what the script lets you do with it (change it, unlink it…).
 */
export function FrameViewer({
  f,
  lib,
  list,
  onPick,
  onClose,
  actions,
}: {
  f: FrameGuide;
  lib: Pick<FrameLibrary, "collections" | "categories" | "people"> | null;
  list?: FrameGuide[];
  onPick?: (id: string) => void;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const collection: FrameCollection | null = lib?.collections.find((c) => c.id === f.collectionId) ?? null;
  const host = sourceHost(f.sourceUrl);
  const [copied, setCopied] = useState(false);
  return (
    <FrameWindow f={f} list={list ?? [f]} onPick={onPick ?? (() => {})} onClose={onClose} label={frameName(f)}>
      <div className="px-5 pt-4 pb-3 border-b border-line/10 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-ink-soft mb-1">
            <span className="font-bold text-frame tabular-nums">Frame guide #{f.number}</span>
            {collection && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <ColorDot color={collection.color} className="w-2 h-2" />
                <span className="truncate">{collection.name}</span>
              </span>
            )}
          </div>
          <h2 className="text-[19px] font-semibold leading-tight">{f.title || <span className="text-ink-faint">Untitled shot</span>}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="hidden lg:flex w-8 h-8 -mr-1.5 rounded-lg items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0">
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden styled-scroll px-5 py-4 space-y-4">
        <CategoryList f={f} custom={lib?.categories ?? []} />
        {f.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {f.keywords.map((k) => (
              <span key={k} className="rounded-md bg-surface-2 text-ink-soft px-2 h-6 inline-flex items-center text-[12px] font-semibold">
                {k}
              </span>
            ))}
          </div>
        )}
        {(f.creator || host) && (
          <div className="text-[13px] text-ink-soft">
            {f.creator && (
              <>
                From <span className="font-semibold text-ink">{f.creator}</span>
              </>
            )}
            {host && (
              <a href={f.sourceUrl!} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 font-semibold text-frame hover:underline ${f.creator ? "ml-2" : ""}`}>
                {host}
                <ExternalIcon className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
        {f.notes && (
          <div>
            <span className={LABEL}>How to shoot it</span>
            <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{f.notes}</p>
          </div>
        )}
        {!f.notes && !f.keywords.length && !f.categories.length && !f.creator && <p className="text-[13px] text-ink-faint">Nothing else about it yet. Its page in Frame Guides is where it gets its categories and notes.</p>}
      </div>
      <div className="px-5 py-3 border-t border-line/10 flex items-center gap-2 flex-wrap pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        {actions}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(frameHref(f.id, window.location.origin)).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          title="Copy a link to it"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
        >
          <CopyIcon className="w-3.5 h-3.5" />
          {copied ? "Copied" : "Copy link"}
        </button>
        <Link href={frameHref(f.id)} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[12.5px] font-bold text-white bg-frame hover:brightness-110" style={{ color: "#fff" }}>
          Open in Frame Guides
          <ExternalIcon className="w-3.5 h-3.5" />
        </Link>
      </div>
    </FrameWindow>
  );
}

/** A frame's small card for lists (a script's frame guide, linked words): its picture, number and name. */
export function FrameCardLine({ f, collection, onOpen, size = "md" }: { f: FrameGuide; collection?: FrameCollection | null; onOpen?: () => void; size?: "sm" | "md" }) {
  const c = collection ? COLOR_CSS[collection.color] : null;
  return (
    <button type="button" onClick={onOpen} className="group/fc w-full flex items-center gap-2.5 rounded-lg p-1.5 -m-1.5 text-left hover:bg-surface-2/70 transition-colors">
      <div className={`relative flex-shrink-0 ${size === "sm" ? "w-[72px]" : "w-[104px]"} aspect-video`}>
        <FramePictureLite f={f} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-bold text-frame tabular-nums">#{f.number}</div>
        <div className="text-[13px] font-semibold text-ink truncate">{f.title || "Untitled shot"}</div>
        {collection && (
          <div className="text-[11.5px] truncate" style={{ color: c ? wordColor(c) : undefined }}>
            {collection.name}
          </div>
        )}
      </div>
    </button>
  );
}

/** A frame's small picture (no loading state: a list's). */
function FramePictureLite({ f }: { f: Pick<FrameGuide, "thumb" | "url" | "tint" | "title" | "number"> }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={f.thumb || f.url} alt={f.title || `Frame #${f.number}`} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover rounded-md ring-1 ring-black/10" style={{ background: f.tint ?? "rgb(var(--surface-2))" }} />
  );
}
