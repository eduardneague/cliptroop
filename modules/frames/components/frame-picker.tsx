"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useLatest, useScrollLock } from "@/lib/hooks/use-scroll-lock";
import { Leaves } from "@/components/ui/leaves";
import { useToast } from "@/components/ui/toast-provider";
import { CloseIcon, CommentIcon, ExternalIcon, ImageIcon, LinkIcon, SearchIcon, UploadIcon } from "@/components/ui/icons";
import { imageFiles } from "@/modules/scripts/lib/paste-images";
import { quoteText } from "@/modules/scripts/lib/anchors";
import { categoryInfo } from "../lib/categories";
import { categoryCounts, filterGroups, findFrames, frameName, readRecent, rememberRecent, type FrameGuide } from "../lib/model";
import { CategoryChip, ColorDot, FrameMark, FrameNumber, FramePicture } from "./frame-bits";
import { loadLibrary, updateLibrary, useFrameLibrary } from "./frame-store";
import { useFrameUploads } from "./use-frame-uploads";

/*
 * Picking a frame guide in a script (1.54.0). The owner: "This will add a popup of the frame guide page where you can
 * select a reference frame directly from there, search for one, filter by categories and so on … either put the
 * frame guide like a comment or an editing idea, or … add the image from the frame guide anywhere i want in the
 * script too and also the ability to link the text to the frame guide, but also show the image right below the text".
 *
 * The team's library as on its page: the search (words, keywords, who made it, #12), the collections, the categories
 * in use; the ones you used last first. Pick one and say what it's for:
 *   words picked: as a frame guide on them (like a comment), linked to them (the picture shows under them), or its
 *     picture in the script under them;
 *   no words: its picture where the cursor is.
 * Double-click (or Enter) does what you did last time. A screenshot pasted here (or dropped) becomes a frame of the
 * collection on show and is picked at once.
 */

export type PickHow = "note" | "link" | "insert";
export type PickPurpose = "words" | "insert" | "note" | "general" | "relink";

const HOW_KEY = "vp:frames-pick-how";
const LAST_KEY = "vp:frames-last-collection";
const HOWS: Record<PickHow, { label: string; hint: string; Icon: (p: { className?: string }) => React.ReactNode }> = {
  note: { label: "Add as a frame guide", hint: "On the words, like a comment", Icon: CommentIcon },
  link: { label: "Link the words to it", hint: "Its picture shows under them", Icon: LinkIcon },
  insert: { label: "Put its picture in", hint: "Under the words, as a picture", Icon: ImageIcon },
};

export function FramePicker({
  teamId,
  purpose,
  words,
  canEdit,
  canNote,
  onPick,
  onClose,
}: {
  teamId: string;
  purpose: PickPurpose;
  /** The words it's for (shown at the top). */
  words?: string;
  /** May change the script (link the words, put the picture in). */
  canEdit: boolean;
  /** May add frame guides on words (the script's people). */
  canNote: boolean;
  onPick: (f: FrameGuide, how: PickHow) => void;
  onClose: () => void;
}) {
  useScrollLock();
  const toast = useToast();
  const entry = useFrameLibrary(teamId, true);
  const lib = entry.lib;
  // Fresh every time it opens (what's here shows at once meanwhile).
  useEffect(() => {
    if (entry.lib) void loadLibrary(teamId);
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState("");
  const [collection, setCollection] = useState<string | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [recent] = useState(() => readRecent(teamId));
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = useLatest(onClose);

  // What it can be for, here.
  const hows: PickHow[] = purpose === "words" ? ([canNote && "note", canEdit && "link", canEdit && "insert"].filter(Boolean) as PickHow[]) : purpose === "insert" ? ["insert"] : purpose === "relink" ? ["link"] : ["note"];
  const [lastHow] = useState<PickHow>(() => {
    try {
      const v = localStorage.getItem(HOW_KEY) as PickHow | null;
      return v && hows.includes(v) ? v : hows[0];
    } catch {
      return hows[0];
    }
  });
  const primary = hows.includes(lastHow) ? lastHow : hows[0];

  const query = useMemo(() => ({ q, collection, categories: cats }), [q, collection, cats]);
  const list = useMemo(() => (lib ? findFrames(lib, query) : []), [lib, query]);
  const counts = useMemo(() => (lib ? categoryCounts(lib, query) : new Map<string, number>()), [lib, query]);
  // The categories to narrow by: A-roll and B-roll always, then the others any frame has.
  const used = useMemo(() => {
    if (!lib || !lib.frames.length) return [];
    const has = new Set(lib.frames.flatMap((f) => f.categories));
    return filterGroups(lib.categories).flatMap((g) => g.items.filter((it) => g.id === "roll" || has.has(it.key)));
  }, [lib]);
  const recentFrames = useMemo(() => (lib && !q.trim() && !cats.length && !collection ? recent.map((id) => lib.frames.find((f) => f.id === id)).filter((f): f is FrameGuide => !!f).slice(0, 6) : []), [lib, recent, q, cats, collection]);
  const pickedFrame = picked ? lib?.frames.find((f) => f.id === picked) ?? null : null;

  function choose(f: FrameGuide, how: PickHow) {
    rememberRecent(teamId, f.id);
    try {
      if (purpose === "words") localStorage.setItem(HOW_KEY, how);
    } catch {}
    onPick(f, how);
  }

  // Esc closes; Enter does the usual with the one picked (or the first found).
  const keys = useLatest({ list, pickedFrame, primary });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        close.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, []);

  // Adding one right here: pasted, dropped or picked; into the collection on show (or the last one used).
  const uploads = useFrameUploads({ teamId, onError: (m) => toast.error(m) });
  const target = () => {
    if (!lib?.collections.length) return null;
    if (collection) return collection;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_KEY);
    } catch {}
    return lib.collections.find((c) => c.id === last)?.id ?? lib.collections[lib.collections.length - 1].id;
  };
  async function add(files: File[]) {
    const to = target();
    if (!to) return toast.error("Make a collection in Frame Guides first: frames live in collections.");
    const made = await uploads.add(files, to);
    if (!made.length) return;
    updateLibrary(teamId, (l) => ({ ...l, frames: [...[...made].reverse(), ...l.frames] }));
    setQ("");
    setCats([]);
    setPicked(made[0].id);
    toast.success(`${made.length === 1 ? `${frameName(made[0])} is` : `${made.length} frames are`} in ${lib?.collections.find((c) => c.id === to)?.name ?? "the collection"} now.`);
  }
  const addRef = useLatest(add);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFiles(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      void addRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addRef]);

  const loading = !lib && (entry.loading || !entry.error);
  const empty = !!lib && !lib.frames.length && !uploads.pending.length;
  const title = purpose === "insert" ? "Put a frame guide's picture in" : purpose === "relink" ? "Link the words to another frame" : purpose === "general" ? "A frame guide for the whole document" : "Pick a frame guide";

  const tile = (f: FrameGuide) => {
    const on = picked === f.id;
    return (
      <button
        key={f.id}
        type="button"
        onClick={() => setPicked(f.id)}
        onDoubleClick={() => choose(f, primary)}
        aria-pressed={on}
        aria-label={frameName(f)}
        className="group text-left min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-frame focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <div className={`relative rounded-xl transition-[transform,box-shadow] duration-150 ${on ? "ring-[3px] ring-frame ring-offset-2 ring-offset-surface" : "group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_26px_-14px_rgb(0_0_0/0.55)]"}`}>
          <FramePicture f={f} className="aspect-video" />
          <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/10" aria-hidden />
          <FrameNumber n={f.number} className="absolute top-1.5 left-1.5" />
        </div>
        <div className={`mt-1.5 px-0.5 text-[12.5px] font-semibold truncate ${f.title ? "text-ink" : "text-ink-faint"}`}>{f.title || "Untitled shot"}</div>
      </button>
    );
  };

  return createPortal(
    <Leaves lock>
      <div className="fixed inset-0 z-[125] flex items-stretch sm:items-center justify-center sm:p-4">
        <div className="pop-dim absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="glass-pane glass-lift relative w-full sm:max-w-[1160px] h-full sm:h-[min(800px,92dvh)] flex flex-col bg-surface text-ink sm:rounded-2xl border border-line/15 shadow-2xl overflow-hidden pop-modal"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
              const f = keys.current.pickedFrame ?? keys.current.list[0];
              if (f) {
                e.preventDefault();
                choose(f, keys.current.primary);
              }
            }
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) void add(files);
            }}
          />
          {/* Head: what it's for, the search, the collections and the categories in use. */}
          <div className="px-4 sm:px-5 pt-3.5 pb-3 border-b border-line/10 space-y-3">
            <div className="flex items-center gap-3 min-w-0">
              <FrameMark className="w-8 h-8 rounded-lg" icon="w-4 h-4" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold leading-tight">{title}</h2>
                {words ? (
                  <p className="text-[12px] text-ink-soft truncate">For &ldquo;{quoteText(words).replace(/\s+/g, " ").slice(0, 120)}&rdquo;</p>
                ) : (
                  <p className="text-[12px] text-ink-soft truncate">{purpose === "insert" ? "Its picture goes where the cursor is." : "From your team's Frame Guides."}</p>
                )}
              </div>
              <Link href="/frame-guides" target="_blank" className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
                Frame Guides
                <ExternalIcon className="w-3.5 h-3.5" />
              </Link>
              <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-1.5 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  ref={searchRef}
                  type="search"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPicked(null);
                  }}
                  placeholder="Search: words, keywords, who made it, #12…"
                  aria-label="Search frame guides"
                  className="w-full h-10 rounded-xl border border-line/15 bg-surface-2/60 pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-faint outline-none focus:border-frame/60 focus:ring-2 focus:ring-frame/20"
                />
              </div>
              <button
                type="button"
                onClick={() => (lib?.collections.length ? fileRef.current?.click() : toast.error("Make a collection in Frame Guides first: frames live in collections."))}
                title="Add a frame (or paste a screenshot here)"
                className="inline-flex items-center gap-1.5 rounded-xl border border-line/15 px-3 h-10 text-[13px] font-semibold text-ink hover:border-line/35 flex-shrink-0"
              >
                <UploadIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
            </div>
            {lib && lib.collections.length > 0 && (
              <div className="-mx-4 sm:-mx-5 px-4 sm:px-5 flex gap-1.5 overflow-x-auto no-scrollbar">
                <Pill on={!collection} onClick={() => setCollection(null)}>
                  All <span className="opacity-60 tabular-nums">{lib.frames.length}</span>
                </Pill>
                {lib.collections.map((c) => (
                  <Pill key={c.id} on={collection === c.id} onClick={() => setCollection(collection === c.id ? null : c.id)}>
                    <ColorDot color={c.color} className="w-2 h-2" />
                    <span className="max-w-[11rem] truncate">{c.name}</span>
                  </Pill>
                ))}
              </div>
            )}
            {used.length > 0 && (
              <div className="-mx-4 sm:-mx-5 px-4 sm:px-5 flex gap-1.5 overflow-x-auto no-scrollbar">
                {used.map((c) => (
                  <CategoryChip key={c.key} name={c.name} color={c.color} size="sm" on={cats.includes(c.key)} count={counts.get(c.key) ?? 0} title={c.hint} onClick={() => setCats((x) => (x.includes(c.key) ? x.filter((k) => k !== c.key) : [...x, c.key]))} />
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 flex">
            {/* The frames. */}
            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll px-4 sm:px-5 py-4">
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
                  {Array.from({ length: 9 }, (_, i) => (
                    <div key={i} className="skeleton aspect-video rounded-xl" />
                  ))}
                </div>
              ) : entry.error && !lib ? (
                <div className="py-16 text-center">
                  <p className="text-[14px] font-semibold">{entry.error}</p>
                  <button type="button" onClick={() => void loadLibrary(teamId)} className="mt-3 rounded-lg border border-line/20 px-3.5 h-9 text-[13px] font-semibold hover:border-line/40">
                    Try again
                  </button>
                </div>
              ) : lib?.missing ? (
                <p className="py-16 text-center text-[13.5px] text-ink-soft">Frame Guides needs a database update first (migration 0133).</p>
              ) : empty ? (
                <div className="py-14 text-center max-w-sm mx-auto">
                  <FrameMark className="w-14 h-14 rounded-2xl mx-auto" icon="w-7 h-7" />
                  <p className="mt-3 text-[15px] font-semibold">No frame guides yet</p>
                  <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
                    {lib?.collections.length ? "Paste a screenshot here (Ctrl+V), or Add one, and it's ready to use." : "Frame Guides is where the team keeps reference shots, in collections. Make one there first."}
                  </p>
                  <Link href="/frame-guides" target="_blank" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-frame text-white font-bold px-3.5 h-9 text-[13px]" style={{ color: "#fff" }}>
                    Open Frame Guides
                    <ExternalIcon className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <>
                  {uploads.pending.length > 0 && (
                    <div className="mb-4 flex items-center gap-2 text-[12.5px] text-ink-soft">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-faint/30 border-t-frame animate-spin" aria-hidden />
                      Adding {uploads.pending.length === 1 ? "your frame" : `${uploads.pending.length} frames`}…
                    </div>
                  )}
                  {recentFrames.length > 0 && (
                    <section className="mb-5">
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">Used lately</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-x-3 gap-y-3.5">{recentFrames.map(tile)}</div>
                    </section>
                  )}
                  {list.length ? (
                    <section>
                      {recentFrames.length > 0 && <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">All frames</h3>}
                      <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-x-3 gap-y-3.5">{list.map(tile)}</div>
                    </section>
                  ) : (
                    <div className="py-14 text-center">
                      <p className="text-[14px] font-semibold">No frames match</p>
                      <button type="button" onClick={() => { setQ(""); setCats([]); setCollection(null); }} className="mt-3 rounded-lg border border-line/20 px-3.5 h-9 text-[13px] font-semibold hover:border-line/40">
                        Show them all
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* The one picked, big, and what to do with it (a computer: the side; a phone: the foot). */}
            <aside className="hidden md:flex w-[340px] flex-shrink-0 border-l border-line/10 flex-col min-h-0">
              {pickedFrame ? (
                <Preview f={pickedFrame} lib={lib} hows={hows} primary={primary} purpose={purpose} onChoose={(how) => choose(pickedFrame, how)} />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8 text-ink-soft">
                  <FrameMark className="w-12 h-12 rounded-2xl" icon="w-6 h-6" />
                  <p className="mt-3 text-[13.5px] font-semibold text-ink">Pick a frame</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed">Click one to see it big, double-click to {HOWS[primary].label.toLowerCase()} at once.</p>
                </div>
              )}
            </aside>
          </div>
          {pickedFrame && (
            <div className="md:hidden border-t border-line/10 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-surface">
              <div className="flex items-center gap-3 mb-2.5">
                <FramePicture f={pickedFrame} className="w-[88px] aspect-video flex-shrink-0" rounded="rounded-lg" />
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-frame tabular-nums">#{pickedFrame.number}</div>
                  <div className="text-[13.5px] font-semibold truncate">{pickedFrame.title || "Untitled shot"}</div>
                </div>
              </div>
              <div className={`grid gap-2 ${hows.length > 1 ? "grid-cols-1" : ""}`}>
                {hows.map((h) => (
                  <HowButton key={h} how={h} main={h === primary} purpose={purpose} onClick={() => choose(pickedFrame, h)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Leaves>,
    document.body
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${on ? "bg-ink text-paper" : "bg-surface-2 text-ink-soft hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function HowButton({ how, main, onClick, purpose }: { how: PickHow; main: boolean; onClick: () => void; purpose: PickPurpose }) {
  const H = HOWS[how];
  // A frame guide for the whole document, or this frame for the one being written.
  const hint = how === "note" && purpose === "general" ? "For the whole document" : how === "note" && purpose === "note" ? "For the frame guide you're writing" : H.hint;
  const label = how === "note" && purpose === "note" ? "Use this frame" : H.label;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl px-3.5 h-12 text-left transition-colors ${main ? "bg-frame text-white hover:brightness-110" : "border border-line/15 text-ink hover:border-line/35 hover:bg-surface-2/60"}`}
    >
      <H.Icon className="w-4 h-4 flex-shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold leading-tight">{label}</span>
        <span className={`block text-[11.5px] leading-tight mt-0.5 ${main ? "text-white/80" : "text-ink-soft"}`}>{hint}</span>
      </span>
    </button>
  );
}

function Preview({ f, lib, hows, primary, purpose, onChoose }: { f: FrameGuide; lib: ReturnType<typeof useFrameLibrary>["lib"]; hows: PickHow[]; primary: PickHow; purpose: PickPurpose; onChoose: (how: PickHow) => void }) {
  const collection = lib?.collections.find((c) => c.id === f.collectionId) ?? null;
  const infos = f.categories.map((k) => (lib ? categoryInfo(k, lib.categories) : null)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden styled-scroll p-4 space-y-3.5">
        <div className="relative rounded-xl overflow-hidden bg-[#0d0d0f]" style={{ aspectRatio: f.w >= f.h ? `${f.w} / ${f.h}` : "4 / 5" }}>
          <FramePicture key={f.id} f={f} big fit="contain" rounded="rounded-none" className="w-full h-full" eager />
          <FrameNumber n={f.number} className="absolute top-2 left-2" />
        </div>
        <div>
          <h3 className="text-[16px] font-semibold leading-snug">{f.title || <span className="text-ink-faint">Untitled shot</span>}</h3>
          <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-soft min-w-0">
            {collection && <ColorDot color={collection.color} className="w-2 h-2" />}
            <span className="truncate">
              {collection?.name}
              {f.creator ? ` · from ${f.creator}` : ""}
            </span>
          </div>
        </div>
        {infos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {infos.map((c) => (
              <CategoryChip key={c.key} name={c.name} color={c.color} on size="sm" />
            ))}
          </div>
        )}
        {f.notes && <p className="text-[12.5px] text-ink-soft leading-relaxed whitespace-pre-wrap line-clamp-6">{f.notes}</p>}
      </div>
      <div className="p-4 border-t border-line/10 space-y-2">
        {hows.map((h) => (
          <HowButton key={h} how={h} main={h === primary} purpose={purpose} onClick={() => onChoose(h)} />
        ))}
        {!hows.length && <p className="text-[12.5px] text-ink-soft">You can look, but only this video&rsquo;s script people can add frame guides here.</p>}
      </div>
    </>
  );
}
