"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { CheckIcon, CloseIcon, EditIcon, FrameIcon, GridIcon, MoreIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import { imageFiles } from "@/modules/scripts/lib/paste-images";
import { wordColor } from "@/lib/word-color";
import { createCategory, createCollection, deleteCategory, deleteCollection, deleteFrames, moveFrames, updateCategory, updateCollection, updateFrame } from "../actions";
import { cleanColor, COLOR_CSS, customKey, type CustomCategory, type FrameColor, FRAME_COLORS } from "../lib/categories";
import { categoryCounts, filterGroups, findFrames, frameHref, frameName, mayDeleteFrame, type FilterGroup, type FrameCollection, type FrameGuide, type FrameLibrary, type FrameSort } from "../lib/model";
import { CategoryChip, ColorChoice, ColorDot, FrameMark, FrameNumber, FramePicture } from "./frame-bits";
import { FrameDetails, type FramePatch } from "./frame-details";
import { useFrameUploads, type PendingFrame } from "./use-frame-uploads";

/*
 * Frame Guides (1.54.0). The owner (Nov 18 2026): "a page called Frame Guides … a group / collection of guide frames.
 * A guide frame is an example of how we can shoot a frame for a certain video … a number automatically, a screenshot
 * … a search bar or a way of getting to those guide frames as fast as possible … keywords … categories … custom
 * categories".
 *
 *   Collections on the left (a strip on phones), then the frames: the search box finds by anything about a frame
 *   (and "#12" by its number), the categories narrow it (within a group any of them, across groups all), newest first.
 *   Adding is as quick as it gets: paste a screenshot (Ctrl+V) anywhere on the page, drop pictures on it, or pick
 *   them; they go into the collection on show, numbered, and the first one opens to be named and tagged (→ goes on to
 *   the next). Everyone on the team adds and tags; whoever added a frame, or a master, deletes it.
 */

type Size = "s" | "m" | "l";
const SIZE_KEY = "vp:frames-size";
const LAST_KEY = "vp:frames-last-collection";
const TILE: Record<Size, string> = { s: "142px", m: "188px", l: "280px" };

/** A server action that couldn't be reached (offline, a deploy). */
const OFFLINE = "Couldn't reach ClipTroop. Check your connection and try again.";
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function readUrl() {
  if (typeof window === "undefined") return { c: null as string | null, frame: null as string | null };
  const p = new URLSearchParams(window.location.search);
  return { c: p.get("c"), frame: p.get("frame") };
}
function writeUrl(next: { c?: string | null; frame?: string | null }) {
  try {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(next)) {
      if (v) u.searchParams.set(k, v);
      else u.searchParams.delete(k);
    }
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  } catch {}
}

export function FrameGuidesApp({
  initial,
  teamName,
  initialCollection = null,
  initialFrame = null,
}: {
  initial: FrameLibrary;
  teamName: string | null;
  /** ?c= and ?frame= (read on the server, so the first drawing is the same on both sides). */
  initialCollection?: string | null;
  initialFrame?: string | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [lib, setLib] = useState(initial);
  const teamId = lib.teamId;
  const [collection, setCollectionState] = useState<string | null>(() => (initialCollection && initial.collections.some((x) => x.id === initialCollection) ? initialCollection : null));
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [sort, setSort] = useState<FrameSort>("newest");
  const [size, setSizeState] = useState<Size>("m");
  const [open, setOpenState] = useState<string | null>(() => (initialFrame && initial.frames.some((f) => f.id === initialFrame) ? initialFrame : null));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<
    | { kind: "new-collection"; files?: File[] }
    | { kind: "edit-collection"; c: FrameCollection }
    | { kind: "delete-collection"; c: FrameCollection }
    | { kind: "pick-collection"; files: File[] }
    | { kind: "categories" }
    | { kind: "filters" }
    | null
  >(null);
  const [dragging, setDragging] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const uploads = useFrameUploads({ teamId, onError: (m) => toast.error(m) });

  useEffect(() => {
    try {
      const s = localStorage.getItem(SIZE_KEY);
      if (s === "s" || s === "m" || s === "l") setSizeState(s);
    } catch {}
  }, []);
  const setSize = (s: Size) => {
    setSizeState(s);
    try {
      localStorage.setItem(SIZE_KEY, s);
    } catch {}
  };
  const setCollection = (c: string | null) => {
    setCollectionState(c);
    writeUrl({ c });
    setSelected(new Set());
  };
  const setOpen = useCallback((id: string | null) => {
    setOpenState(id);
    writeUrl({ frame: id });
  }, []);
  // ?frame=<id> of a frame that's gone (or another team's).
  useEffect(() => {
    const id = readUrl().frame;
    if (id && !initial.frames.some((f) => f.id === id)) {
      writeUrl({ frame: null });
      if (!initial.missing) toast.error("That frame guide isn't here: it was deleted, or it's another team's (switch team to see it).");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(() => ({ q, collection, categories: cats, sort }), [q, collection, cats, sort]);
  const list = useMemo(() => findFrames(lib, query), [lib, query]);
  const counts = useMemo(() => categoryCounts(lib, query), [lib, query]);
  const perCollection = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of lib.frames) m.set(f.collectionId, (m.get(f.collectionId) ?? 0) + 1);
    return m;
  }, [lib.frames]);
  const current = collection ? lib.collections.find((c) => c.id === collection) ?? null : null;
  const openFrame = open ? lib.frames.find((f) => f.id === open) ?? null : null;
  // The arrows go through what's on show (or the whole library, for a frame opened from elsewhere).
  const navList = openFrame && list.some((f) => f.id === openFrame.id) ? list : lib.frames;
  const filtering = !!q.trim() || cats.length > 0;

  // ---- changing frames ---------------------------------------------------------
  const patchLocal = (id: string, fn: (f: FrameGuide) => FrameGuide) => setLib((l) => ({ ...l, frames: l.frames.map((f) => (f.id === id ? fn(f) : f)) }));
  const saveFrame = useCallback(
    async (id: string, patch: FramePatch): Promise<string | null> => {
      const before = lib.frames.find((f) => f.id === id);
      if (!before) return "That frame was deleted meanwhile.";
      patchLocal(id, (f) => ({
        ...f,
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.creator !== undefined ? { creator: patch.creator.trim() } : {}),
        ...(patch.sourceUrl !== undefined ? { sourceUrl: patch.sourceUrl } : {}),
        ...(patch.keywords !== undefined ? { keywords: patch.keywords } : {}),
        ...(patch.categories !== undefined ? { categories: patch.categories } : {}),
        ...(patch.collectionId !== undefined ? { collectionId: patch.collectionId } : {}),
      }));
      const r = await updateFrame(id, patch).catch(() => ({ error: "Couldn't save the change. Check your connection." }) as const);
      if (r.error !== undefined) {
        patchLocal(id, () => before);
        toast.error(r.error);
        return r.error;
      }
      patchLocal(id, () => r.frame);
      return null;
    },
    [lib.frames, toast]
  );

  async function removeFrames(ids: string[]) {
    const fs = lib.frames.filter((f) => ids.includes(f.id));
    if (!fs.length) return;
    const ok = await confirm({
      title: fs.length === 1 ? `Delete ${frameName(fs[0])}?` : `Delete ${fs.length} frames?`,
      description: `${fs.length === 1 ? "Its picture goes" : "Their pictures go"} too, and scripts that use ${fs.length === 1 ? "it" : "them"} show "deleted" instead. This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const r = await deleteFrames(ids).catch(() => ({ error: OFFLINE }) as const);
    if (r.error !== undefined) return toast.error(r.error);
    const gone = new Set(r.deleted);
    if (open && gone.has(open)) {
      const i = navList.findIndex((f) => f.id === open);
      const next = navList.slice(i + 1).find((f) => !gone.has(f.id)) ?? navList.slice(0, i).reverse().find((f) => !gone.has(f.id));
      setOpen(next ? next.id : null);
    }
    setLib((l) => ({ ...l, frames: l.frames.filter((f) => !gone.has(f.id)) }));
    setSelected((s) => new Set([...s].filter((x) => !gone.has(x))));
    if (r.kept) toast.error(`${plural(r.kept, "frame")} stayed: only whoever added a frame, or a master, can delete it.`);
    else toast.success(r.deleted.length === 1 ? "Deleted." : `Deleted ${r.deleted.length} frames.`);
  }

  async function move(ids: string[], to: string) {
    const r = await moveFrames(ids, to).catch(() => ({ error: OFFLINE }) as const);
    if (r.error !== undefined) return toast.error(r.error);
    const moved = new Set(r.moved);
    setLib((l) => ({ ...l, frames: l.frames.map((f) => (moved.has(f.id) ? { ...f, collectionId: to } : f)) }));
    toast.success(`Moved ${plural(r.moved.length, "frame")} to ${lib.collections.find((c) => c.id === to)?.name ?? "the collection"}.`);
    setSelected(new Set());
    setSelecting(false);
  }

  function copyLink(f: FrameGuide) {
    void navigator.clipboard
      ?.writeText(frameHref(f.id, window.location.origin))
      .then(() => toast.success(`Link to ${frameName(f)} copied.`))
      .catch(() => toast.error("Couldn't copy the link."));
  }

  // ---- adding frames -------------------------------------------------------------
  const rememberLast = (id: string) => {
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {}
  };
  const upload = useCallback(
    async (files: File[], to: string) => {
      rememberLast(to);
      const made = await uploads.add(files, to);
      if (!made.length) return;
      setLib((l) => ({ ...l, frames: [...[...made].reverse(), ...l.frames.filter((f) => !made.some((m) => m.id === f.id))] }));
      setFresh((s) => new Set([...s, ...made.map((m) => m.id)]));
      const name = lib.collections.find((c) => c.id === to)?.name ?? "the collection";
      if (collection && collection !== to) setCollection(to);
      // Straight on to naming and tagging the first one (→ goes on to the next).
      setOpen(made[0].id);
      if (made.length > 1) toast.success(`Added ${made.length} frames to ${name}. Name and tag them: → goes on to the next.`);
    },
    [uploads, lib.collections, collection, setOpen, toast] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      if (lib.missing) return toast.error("Frame Guides isn't set up on this database yet (migration 0133).");
      if (collection) return void upload(files, collection);
      if (!lib.collections.length) return setDialog({ kind: "new-collection", files });
      if (lib.collections.length === 1) return void upload(files, lib.collections[0].id);
      setDialog({ kind: "pick-collection", files });
    },
    [collection, lib.collections, lib.missing, upload, toast]
  );
  const fileRef = useRef<HTMLInputElement>(null);

  // Paste a screenshot anywhere on the page (not while typing); drop pictures on it.
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      const files = imageFiles(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      addRef.current(files.map((f, i) => (f.name && f.name !== "image.png" ? f : new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type }))));
    };
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (document.querySelector("[role=dialog]")) return;
      addRef.current(imageFiles(e.dataTransfer));
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  // "/" to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || isTyping(e.target) || e.metaKey || e.ctrlKey || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ---- collections and categories ------------------------------------------------------
  async function saveCollection(input: { id?: string; name: string; color: FrameColor; about: string }, files?: File[]) {
    if (input.id) {
      const r = await updateCollection(input.id, { name: input.name, color: input.color, about: input.about }).catch(() => ({ error: OFFLINE }) as const);
      if (r.error !== undefined) return r.error;
      setLib((l) => ({ ...l, collections: l.collections.map((c) => (c.id === r.collection.id ? r.collection : c)) }));
      return null;
    }
    const r = await createCollection(teamId, input).catch(() => ({ error: OFFLINE }) as const);
    if (r.error !== undefined) return r.error;
    setLib((l) => ({ ...l, collections: [...l.collections, r.collection] }));
    setCollection(r.collection.id);
    if (files?.length) void upload(files, r.collection.id);
    return null;
  }
  async function removeCollection(c: FrameCollection, moveTo: string | null) {
    const r = await deleteCollection(c.id, moveTo).catch(() => ({ error: OFFLINE }) as const);
    if (r.error !== undefined) return r.error;
    setLib((l) => ({
      ...l,
      collections: l.collections.filter((x) => x.id !== c.id),
      frames: moveTo ? l.frames.map((f) => (f.collectionId === c.id ? { ...f, collectionId: moveTo } : f)) : l.frames.filter((f) => f.collectionId !== c.id),
    }));
    if (collection === c.id) setCollection(moveTo);
    toast.success(moveTo ? `Deleted ${c.name}; ${plural(r.moved, "frame")} moved.` : r.deleted ? `Deleted ${c.name} and its ${plural(r.deleted, "frame")}.` : `Deleted ${c.name}.`);
    return null;
  }
  const newCategory = useCallback(
    async (name: string, color?: FrameColor): Promise<string | null> => {
      const r = await createCategory(teamId, { name, color: color ?? FRAME_COLORS[(lib.categories.length + 3) % FRAME_COLORS.length] }).catch(() => ({ error: OFFLINE }) as const);
      if (r.error !== undefined) {
        toast.error(r.error);
        return null;
      }
      setLib((l) => ({ ...l, categories: [...l.categories, r.category] }));
      return customKey(r.category.id);
    },
    [teamId, lib.categories.length, toast]
  );

  const groups = useMemo(() => filterGroups(lib.categories), [lib.categories]);
  const catNames = useMemo(() => new Map(groups.flatMap((g) => g.items.map((it) => [it.key, it.name] as const))), [groups]);
  const collById = useMemo(() => new Map(lib.collections.map((c) => [c.id, c] as const)), [lib.collections]);
  const toggleCat = (k: string) => setCats((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const clearFilters = () => {
    setQ("");
    setCats([]);
  };

  const pending = uploads.pending;
  const empty = !lib.frames.length && !pending.length;

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 w-full max-w-[1520px] mx-auto">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          addFiles(files);
        }}
      />
      <div className="flex items-start justify-between gap-4 sm:gap-6 mb-5 sm:mb-7 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5 flex items-center gap-3">
            Frame Guides
            <FrameMark className="w-9 h-9 hidden sm:inline-flex" />
          </h1>
          <p className="text-[14.5px] text-ink-soft max-w-2xl">
            Shots to aim for: references from other creators, in {teamName ? `${teamName}'s` : "your"} own collections. Pick one in any script to show what a shot should look like.
          </p>
        </div>
        {!lib.missing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (lib.collections.length ? fileRef.current?.click() : setDialog({ kind: "new-collection" }))}
              className="inline-flex items-center gap-2 rounded-xl bg-frame text-white font-bold px-4 sm:px-5 h-11 text-[14.5px] shadow-[0_3px_0_0_rgb(var(--frame)/0.45)] hover:brightness-110 active:translate-y-[2px] active:shadow-none transition-all"
            >
              <UploadIcon className="w-4 h-4" />
              Add frames
            </button>
          </div>
        )}
      </div>

      {lib.missing ? (
        <NotSetUp />
      ) : empty && !lib.collections.length ? (
        <Welcome onNew={() => setDialog({ kind: "new-collection" })} />
      ) : (
        <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8 items-start">
          {/* Collections and categories: a side column on a computer. */}
          <aside className="hidden lg:block lg:sticky lg:top-[calc(var(--shell-top,3.5rem)+1.25rem)] lg:max-h-[calc(100dvh-var(--shell-top,3.5rem)-2.5rem)] overflow-y-auto overflow-x-hidden styled-scroll pr-1 -mr-1 pb-4">
            <Collections
              lib={lib}
              counts={perCollection}
              current={collection}
              onPick={setCollection}
              onNew={() => setDialog({ kind: "new-collection" })}
              onEdit={(c) => setDialog({ kind: "edit-collection", c })}
              onDelete={(c) => setDialog({ kind: "delete-collection", c })}
            />
            <div className="mt-7">
              <CategoryFilters groups={groups} counts={counts} picked={cats} onToggle={toggleCat} onManage={() => setDialog({ kind: "categories" })} />
            </div>
          </aside>

          <main className="min-w-0">
            {/* Search, then how they're shown. */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <SearchIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  ref={searchRef}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && q) {
                      e.preventDefault();
                      setQ("");
                    }
                    if (e.key === "Enter" && list[0]) setOpen(list[0].id);
                  }}
                  placeholder={current ? `Search ${current.name}…` : "Search frames: words, keywords, who made it, #12…"}
                  aria-label="Search frames"
                  className="w-full h-11 rounded-xl border border-line/15 bg-surface pl-10 pr-12 text-[14px] text-ink placeholder:text-ink-faint outline-none focus:border-frame/60 focus:ring-2 focus:ring-frame/20 transition-colors"
                />
                {q ? (
                  <button type="button" onClick={() => setQ("")} aria-label="Clear the search" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
                    <CloseIcon className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md border border-line/20 text-[12px] font-semibold text-ink-faint items-center justify-center" aria-hidden>
                    /
                  </kbd>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDialog({ kind: "filters" })}
                className={`lg:hidden inline-flex items-center gap-1.5 rounded-xl border px-3.5 h-11 text-[13.5px] font-semibold ${cats.length ? "border-frame/50 text-frame bg-frame/[0.06]" : "border-line/15 text-ink bg-surface"}`}
              >
                Filters
                {cats.length > 0 && <span className="rounded-md bg-frame text-white px-1.5 h-5 inline-flex items-center text-[11.5px] font-bold">{cats.length}</span>}
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <div className="w-[118px]">
                  <Select
                    value={sort}
                    onChange={(v) => v && setSort(v as FrameSort)}
                    options={[
                      { value: "newest", label: "Newest" },
                      { value: "oldest", label: "Oldest" },
                      { value: "title", label: "A to Z" },
                    ]}
                    ariaLabel="Order"
                    size="bar"
                    menuMinWidth={150}
                  />
                </div>
                <div className="hidden sm:flex rounded-xl bg-surface-2 p-0.5" role="radiogroup" aria-label="Frame size">
                  {(["s", "m", "l"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={size === s}
                      aria-label={s === "s" ? "Small" : s === "m" ? "Medium" : "Large"}
                      title={s === "s" ? "Small" : s === "m" ? "Medium" : "Large"}
                      onClick={() => setSize(s)}
                      className={`w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors ${size === s ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.18)]" : "text-ink-soft hover:text-ink"}`}
                    >
                      <GridIcon className={s === "s" ? "w-3 h-3" : s === "m" ? "w-3.5 h-3.5" : "w-4 h-4"} />
                    </button>
                  ))}
                </div>
                {lib.frames.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelecting((v) => !v);
                      setSelected(new Set());
                    }}
                    aria-pressed={selecting}
                    className={`rounded-xl px-3 h-9 text-[13px] font-semibold ${selecting ? "bg-ink text-paper" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
                  >
                    {selecting ? "Done" : "Select"}
                  </button>
                )}
              </div>
            </div>

            {/* Phones: the collections as a strip. */}
            <div className="lg:hidden mt-3 -mx-4 px-4 flex gap-1.5 overflow-x-auto no-scrollbar">
              <CollectionPill on={!collection} onClick={() => setCollection(null)} label="All" count={lib.frames.length} />
              {lib.collections.map((c) => (
                <CollectionPill key={c.id} on={collection === c.id} onClick={() => setCollection(c.id)} label={c.name} count={perCollection.get(c.id) ?? 0} color={c.color} />
              ))}
              <button type="button" onClick={() => setDialog({ kind: "new-collection" })} className="flex-shrink-0 inline-flex items-center gap-1 rounded-full border border-dashed border-line/30 px-3 h-8 text-[12.5px] font-semibold text-ink-soft">
                <PlusIcon className="w-3.5 h-3.5" />
                New
              </button>
            </div>

            {/* What's picked, to take off again. */}
            {cats.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                {cats.map((k) => {
                  const it = groups.flatMap((g) => g.items).find((x) => x.key === k);
                  return it ? <CategoryChip key={k} name={it.name} color={it.color} on size="sm" onClick={() => toggleCat(k)} title="Take this filter off" /> : null;
                })}
                <button type="button" onClick={() => setCats([])} className="text-[12px] font-semibold text-ink-soft hover:text-ink px-1.5">
                  Clear
                </button>
              </div>
            )}

            {current && (
              <CollectionHead
                c={current}
                count={perCollection.get(current.id) ?? 0}
                mayDelete={!!lib.me && (lib.me.master || current.createdBy === lib.me.userId)}
                onEdit={() => setDialog({ kind: "edit-collection", c: current })}
                onDelete={() => setDialog({ kind: "delete-collection", c: current })}
              />
            )}

            <div className="mt-4 flex items-center justify-between gap-3 text-[12.5px] text-ink-soft min-h-[20px]">
              <span aria-live="polite">
                {filtering ? `${plural(list.length, "frame")} found` : `${plural(list.length, "frame")}`}
                {filtering && list.length === 0 && lib.frames.length > 0 ? "" : ""}
              </span>
              <span className="hidden md:inline text-ink-faint">Paste a screenshot anywhere here (Ctrl+V) or drop pictures to add them.</span>
            </div>

            {list.length === 0 && !pending.length ? (
              filtering ? (
                <NoMatch onClear={clearFilters} />
              ) : (
                <DropHere name={current?.name ?? null} onPick={() => (lib.collections.length ? fileRef.current?.click() : setDialog({ kind: "new-collection" }))} />
              )
            ) : (
              <div
                className="mt-3 grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(var(--tile),1fr))] gap-x-3 sm:gap-x-4 gap-y-4 sm:gap-y-5"
                style={{ ["--tile" as string]: TILE[size] }}
              >
                {!filtering && pending.map((p) => <PendingTile key={p.key} p={p} />)}
                {list.map((f) => (
                  <Tile
                    key={f.id}
                    f={f}
                    collection={collById.get(f.collectionId)}
                    names={catNames}
                    big={size === "l"}
                    fresh={fresh.has(f.id)}
                    selecting={selecting}
                    selected={selected.has(f.id)}
                    onOpen={() => {
                      if (selecting) {
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(f.id)) n.delete(f.id);
                          else n.add(f.id);
                          return n;
                        });
                      } else setOpen(f.id);
                    }}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {selecting && selected.size > 0 && (
        <BulkBar
          n={selected.size}
          collections={lib.collections}
          mayDelete={[...selected].every((id) => {
            const f = lib.frames.find((x) => x.id === id);
            return !!f && mayDeleteFrame(lib, f);
          })}
          onMove={(to) => void move([...selected], to)}
          onDelete={() => void removeFrames([...selected])}
          onAll={() => setSelected(new Set(list.map((f) => f.id)))}
          onNone={() => setSelected(new Set())}
        />
      )}

      {dragging && (
        <div className="no-print fixed inset-0 z-[130] pointer-events-none flex items-center justify-center p-6 bg-black/35 backdrop-blur-[1px] pop-fade">
          <div className="rounded-3xl border-2 border-dashed border-frame bg-surface/95 px-10 py-9 text-center shadow-2xl">
            <FrameMark className="w-14 h-14 mx-auto" icon="w-7 h-7" />
            <p className="mt-3 text-[17px] font-semibold">Drop to add {current ? `to ${current.name}` : "frames"}</p>
            <p className="mt-1 text-[13px] text-ink-soft">Screenshots and pictures, up to 40 at a time.</p>
          </div>
        </div>
      )}

      {openFrame && (
        <FrameDetails
          lib={lib}
          f={openFrame}
          list={navList}
          onPick={setOpen}
          onClose={() => setOpen(null)}
          onSave={saveFrame}
          onDelete={mayDeleteFrame(lib, openFrame) ? (f) => void removeFrames([f.id]) : undefined}
          onCreateCategory={(name) => newCategory(name)}
          onCopyLink={copyLink}
        />
      )}

      <CollectionDialog
        open={dialog?.kind === "new-collection" || dialog?.kind === "edit-collection"}
        c={dialog?.kind === "edit-collection" ? dialog.c : null}
        withFiles={dialog?.kind === "new-collection" ? dialog.files?.length ?? 0 : 0}
        first={!lib.collections.length}
        onClose={() => setDialog(null)}
        onSave={async (input) => {
          const files = dialog?.kind === "new-collection" ? dialog.files : undefined;
          const err = await saveCollection(input, files);
          if (!err) setDialog(null);
          return err;
        }}
      />
      <DeleteCollectionDialog
        c={dialog?.kind === "delete-collection" ? dialog.c : null}
        count={dialog?.kind === "delete-collection" ? perCollection.get(dialog.c.id) ?? 0 : 0}
        others={lib.collections.filter((x) => dialog?.kind === "delete-collection" && x.id !== dialog.c.id)}
        onClose={() => setDialog(null)}
        onDelete={async (moveTo) => {
          if (dialog?.kind !== "delete-collection") return null;
          const err = await removeCollection(dialog.c, moveTo);
          if (!err) setDialog(null);
          return err;
        }}
      />
      <PickCollectionDialog
        files={dialog?.kind === "pick-collection" ? dialog.files : null}
        collections={lib.collections}
        counts={perCollection}
        onClose={() => setDialog(null)}
        onPick={(id) => {
          if (dialog?.kind !== "pick-collection") return;
          const files = dialog.files;
          setDialog(null);
          void upload(files, id);
        }}
        onNew={() => dialog?.kind === "pick-collection" && setDialog({ kind: "new-collection", files: dialog.files })}
      />
      <CategoriesDialog
        open={dialog?.kind === "categories"}
        lib={lib}
        onClose={() => setDialog(null)}
        onCreate={async (name, color) => !!(await newCategory(name, color))}
        onUpdate={async (c) => {
          const r = await updateCategory(c.id, { name: c.name, color: c.color }).catch(() => ({ error: OFFLINE }) as const);
          if (r.error !== undefined) {
            toast.error(r.error);
            return false;
          }
          setLib((l) => ({ ...l, categories: l.categories.map((x) => (x.id === c.id ? r.category : x)) }));
          return true;
        }}
        onDelete={async (c) => {
          const ok = await confirm({
            title: `Delete “${c.name}”?`,
            description: "It comes off every frame that has it. The frames stay.",
            confirmLabel: "Delete",
            danger: true,
          });
          if (!ok) return;
          const r = await deleteCategory(c.id).catch(() => ({ error: OFFLINE }) as const);
          if (r.error !== undefined) return toast.error(r.error);
          const key = customKey(c.id);
          setLib((l) => ({ ...l, categories: l.categories.filter((x) => x.id !== c.id), frames: l.frames.map((f) => (f.categories.includes(key) ? { ...f, categories: f.categories.filter((k) => k !== key) } : f)) }));
          setCats((cs) => cs.filter((k) => k !== key));
        }}
      />
      <Dialog open={dialog?.kind === "filters"} onClose={() => setDialog(null)} title="Filters" description={`${plural(list.length, "frame")} with these`}>
        <CategoryFilters groups={groups} counts={counts} picked={cats} onToggle={toggleCat} onManage={() => setDialog({ kind: "categories" })} roomy />
        {cats.length > 0 && (
          <button type="button" onClick={() => setCats([])} className="mt-4 text-[13px] font-semibold text-ink-soft hover:text-ink">
            Clear the filters
          </button>
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The side column
// ---------------------------------------------------------------------------

function Collections({
  lib,
  counts,
  current,
  onPick,
  onNew,
  onEdit,
  onDelete,
}: {
  lib: FrameLibrary;
  counts: Map<string, number>;
  current: string | null;
  onPick: (id: string | null) => void;
  onNew: () => void;
  onEdit: (c: FrameCollection) => void;
  onDelete: (c: FrameCollection) => void;
}) {
  return (
    <nav aria-label="Collections">
      <div className="flex items-center justify-between px-2.5 pb-1.5">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Collections</span>
        <button type="button" onClick={onNew} aria-label="New collection" title="New collection" className="w-7 h-7 -mr-1.5 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-0.5">
        <CollectionRow on={current === null} onClick={() => onPick(null)} label="All frames" count={lib.frames.length} icon={<FrameIcon className="w-4 h-4 text-frame" />} />
        {lib.collections.map((c) => (
          <CollectionRow
            key={c.id}
            on={current === c.id}
            onClick={() => onPick(c.id)}
            label={c.name}
            count={counts.get(c.id) ?? 0}
            icon={<ColorDot color={c.color} />}
            menu={{
              onEdit: () => onEdit(c),
              onDelete: lib.me && (lib.me.master || c.createdBy === lib.me.userId) ? () => onDelete(c) : undefined,
            }}
          />
        ))}
      </div>
      <button type="button" onClick={onNew} className="mt-1.5 w-full flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
        <PlusIcon className="w-4 h-4" />
        New collection
      </button>
    </nav>
  );
}

function CollectionRow({
  on,
  onClick,
  label,
  count,
  icon,
  menu,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon: React.ReactNode;
  menu?: { onEdit: () => void; onDelete?: () => void };
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className={`group relative flex items-center rounded-lg transition-colors ${on ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
      <button type="button" onClick={onClick} aria-current={on ? "true" : undefined} className={`flex-1 min-w-0 flex items-center gap-2.5 pl-2.5 pr-2 h-9 text-[13.5px] text-left ${on ? "font-semibold text-ink" : "text-ink-soft hover:text-ink"}`}>
        <span className="w-4 flex items-center justify-center flex-shrink-0">{icon}</span>
        <span className="truncate flex-1">{label}</span>
        <span className={`tabular-nums text-[12px] ${menu ? "group-hover:opacity-0 group-focus-within:opacity-0" : ""} ${on ? "text-ink-soft" : "text-ink-faint"}`}>{count}</span>
      </button>
      {menu && (
        <>
          <button
            ref={btn}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={`More for ${label}`}
            aria-expanded={open}
            className={`absolute right-1 w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
          >
            <MoreIcon className="w-4 h-4" />
          </button>
          <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={200} align="left" label={label}>
            <div className="p-1">
              <button type="button" role="menuitem" onClick={() => { setOpen(false); menu.onEdit(); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-[13px] font-semibold text-ink hover:bg-surface-2">
                <EditIcon className="w-4 h-4 text-ink-soft" />
                Rename or recolour
              </button>
              {menu.onDelete && (
                <button type="button" role="menuitem" onClick={() => { setOpen(false); menu.onDelete?.(); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-[13px] font-semibold text-red hover:bg-red/10">
                  <TrashIcon className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          </AnchoredMenu>
        </>
      )}
    </div>
  );
}

function CollectionPill({ on, onClick, label, count, color }: { on: boolean; onClick: () => void; label: string; count: number; color?: FrameColor }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${on ? "bg-ink text-paper" : "bg-surface-2 text-ink-soft"}`}
    >
      {color && <ColorDot color={color} className="w-2 h-2" />}
      <span className="max-w-[10rem] truncate">{label}</span>
      <span className={`tabular-nums text-[11.5px] ${on ? "opacity-70" : "text-ink-faint"}`}>{count}</span>
    </button>
  );
}

/**
 * The categories to narrow by (a short list, 1.54.0): A-roll and B-roll side by side, then the shots, then the team's
 * own, each with how many frames it would show.
 */
function CategoryFilters({
  groups,
  counts,
  picked,
  onToggle,
  onManage,
  roomy = false,
}: {
  groups: FilterGroup[];
  counts: Map<string, number>;
  picked: string[];
  onToggle: (k: string) => void;
  onManage: () => void;
  roomy?: boolean;
}) {
  const [roll, ...rest] = groups;
  return (
    <div>
      <div className="flex items-center justify-between px-2.5 pb-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Categories</span>
        <button type="button" onClick={onManage} className="text-[11.5px] font-semibold text-ink-soft hover:text-ink" title="Your team's own categories">
          Manage
        </button>
      </div>
      {/* A-roll and B-roll: the first thing to tell apart. */}
      <div className="grid grid-cols-2 gap-1.5 px-1">
        {roll.items.map((it) => {
          const on = picked.includes(it.key);
          const c = COLOR_CSS[it.color];
          return (
            <button
              key={it.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(it.key)}
              title={it.hint}
              className={`rounded-xl px-3 py-2 text-left transition-colors ring-1 ring-inset ${on ? "" : "ring-line/15 hover:ring-line/30 bg-surface"}`}
              style={on ? { background: `color-mix(in srgb, ${c} 14%, transparent)`, ["--tw-ring-color" as string]: `color-mix(in srgb, ${c} 55%, transparent)` } : undefined}
            >
              <span className="flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: wordColor(c) }}>
                {on ? <CheckIcon className="w-3.5 h-3.5" /> : <span className="w-2 h-2 rounded-full" style={{ background: c }} aria-hidden />}
                {it.name}
              </span>
              <span className="block mt-0.5 text-[11.5px] text-ink-soft tabular-nums">{plural(counts.get(it.key) ?? 0, "frame")}</span>
            </button>
          );
        })}
      </div>
      <div className={roomy ? "mt-4 space-y-4" : "mt-3 space-y-3"}>
        {rest.map((g) => {
          if (!g.items.length) return null;
          return (
            <div key={g.id}>
              <div className="px-2.5 text-[11.5px] font-semibold text-ink-soft mb-0.5">{g.name}</div>
              <div className={roomy ? "flex flex-wrap gap-1.5 px-1" : "space-y-px"}>
                {g.items.map((it) => {
                  const on = picked.includes(it.key);
                  const n = counts.get(it.key) ?? 0;
                  return roomy ? (
                    <CategoryChip key={it.key} name={it.name} color={it.color} on={on} count={n} onClick={() => onToggle(it.key)} />
                  ) : (
                    <button
                      key={it.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onToggle(it.key)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-[13px] text-left transition-colors ${on ? "bg-surface-2 text-ink font-semibold" : n ? "text-ink-soft hover:text-ink hover:bg-surface-2/60" : "text-ink-faint hover:text-ink-soft hover:bg-surface-2/60"}`}
                    >
                      <span
                        className="w-4 h-4 rounded-[5px] flex items-center justify-center flex-shrink-0 transition-colors"
                        style={on ? { background: COLOR_CSS[it.color] } : { boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${wordColor(COLOR_CSS[it.color])} 80%, transparent)` }}
                        aria-hidden
                      >
                        {on && <CheckIcon className="w-3 h-3 text-white" />}
                      </span>
                      <span className="truncate flex-1">{it.name}</span>
                      <span className="tabular-nums text-[11.5px] text-ink-faint">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The frames
// ---------------------------------------------------------------------------

function Tile({
  f,
  collection: c,
  names,
  big,
  fresh,
  selecting,
  selected,
  onOpen,
}: {
  f: FrameGuide;
  collection: FrameCollection | undefined;
  /** Every category's name, by key. */
  names: Map<string, string>;
  big: boolean;
  fresh: boolean;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  // A-roll or B-roll first, then the shot, then the team's own (the order of the filters).
  const keys = [...names.keys()];
  const cats = [...f.categories]
    .sort((a, b) => (keys.indexOf(a) + 1 || 999) - (keys.indexOf(b) + 1 || 999))
    .map((k) => names.get(k))
    .filter((x): x is string => !!x);
  return (
    <div className="group relative min-w-0 animate-[rise-in_.28s_var(--ease-out)]">
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selecting ? selected : undefined}
        aria-label={selecting ? `${selected ? "Unselect" : "Select"} ${frameName(f)}` : `Open ${frameName(f)}`}
        className="block w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-frame focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <div className={`relative rounded-xl transition-[transform,box-shadow] duration-200 ${selecting ? "" : "group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_32px_-16px_rgb(0_0_0/0.55)]"} ${selected ? "ring-[3px] ring-frame ring-offset-2 ring-offset-paper" : ""}`}>
          <FramePicture f={f} className="aspect-video" />
          <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/10" aria-hidden />
          <FrameNumber n={f.number} className="absolute top-1.5 left-1.5" />
          {fresh && !selecting && <span className="absolute top-1.5 right-1.5 rounded-md bg-frame text-white px-1.5 h-[22px] inline-flex items-center text-[11px] font-bold shadow-sm">New</span>}
          {selecting && (
            <span className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow ${selected ? "bg-frame text-white" : "bg-black/45 ring-2 ring-white/80"}`} aria-hidden>
              {selected && <CheckIcon className="w-3.5 h-3.5" />}
            </span>
          )}
        </div>
        <div className="mt-2 px-0.5 min-w-0">
          <div className={`text-[13px] font-semibold truncate ${f.title ? "text-ink" : "text-ink-faint"}`}>{f.title || "Untitled shot"}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-soft min-w-0">
            {c && <ColorDot color={c.color} className="w-2 h-2" />}
            <span className="truncate">
              {c?.name ?? ""}
              {cats.length ? ` · ${cats.slice(0, big ? 3 : 1).join(", ")}${cats.length > (big ? 3 : 1) ? ` +${cats.length - (big ? 3 : 1)}` : ""}` : ""}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

function PendingTile({ p }: { p: PendingFrame }) {
  return (
    <div className="min-w-0" aria-busy="true">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.preview} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 blur-[1px] scale-105" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-lg bg-black/70 text-white px-2.5 h-8 text-[12px] font-semibold shadow-lg">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden />
            {p.state === "making" ? "Getting it ready…" : p.state === "uploading" ? "Uploading…" : "Adding…"}
          </span>
        </span>
      </div>
      <div className="mt-2 px-0.5 h-[34px]">
        <div className="text-[13px] font-semibold text-ink-faint truncate">{p.name || "Pasted picture"}</div>
      </div>
    </div>
  );
}

function CollectionHead({ c, count, mayDelete, onEdit, onDelete }: { c: FrameCollection; count: number; mayDelete: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="mt-5 rounded-2xl border border-line/10 bg-surface px-4 sm:px-5 py-3.5 flex items-center gap-3.5" style={{ boxShadow: `inset 4px 0 0 ${COLOR_CSS[c.color]}` }}>
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-semibold leading-tight truncate">{c.name}</h2>
        <p className="text-[12.5px] text-ink-soft mt-0.5 truncate">{c.about || plural(count, "frame")}</p>
      </div>
      {c.about && <span className="hidden sm:inline text-[12.5px] text-ink-soft tabular-nums whitespace-nowrap">{plural(count, "frame")}</span>}
      <button type="button" onClick={onEdit} aria-label={`Rename or recolour ${c.name}`} title="Rename or recolour" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
        <EditIcon className="w-4 h-4" />
      </button>
      {mayDelete && (
        <button type="button" onClick={onDelete} aria-label={`Delete ${c.name}`} title="Delete the collection" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-red hover:bg-red/10">
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function BulkBar({ n, collections, mayDelete, onMove, onDelete, onAll, onNone }: { n: number; collections: FrameCollection[]; mayDelete: boolean; onMove: (to: string) => void; onDelete: () => void; onAll: () => void; onNone: () => void }) {
  return (
    <div className="no-print fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] lg:bottom-6 w-[min(36rem,calc(100vw-1.5rem))] rounded-2xl border border-line/15 bg-surface shadow-2xl px-3 py-2.5 flex items-center gap-2 flex-wrap pop-sheet">
      <span className="text-[13.5px] font-semibold px-1.5">{n} selected</span>
      <button type="button" onClick={onAll} className="text-[12px] font-semibold text-ink-soft hover:text-ink px-1">
        All
      </button>
      <button type="button" onClick={onNone} className="text-[12px] font-semibold text-ink-soft hover:text-ink px-1">
        None
      </button>
      <span className="flex-1" />
      <div className="w-[150px]">
        <Select value={null} onChange={(v) => v && onMove(v)} options={collections.map((c) => ({ value: c.id, label: c.name, icon: <ColorDot color={c.color} /> }))} placeholder="Move to…" ariaLabel="Move to a collection" size="bar" />
      </div>
      {mayDelete && (
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[13px] font-semibold text-red hover:bg-red/10">
          <TrashIcon className="w-4 h-4" />
          Delete
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty, and not set up
// ---------------------------------------------------------------------------

function Welcome({ onNew }: { onNew: () => void }) {
  const steps = [
    { t: "Make a collection", d: "A creator you love, a style, a set: “Vlog openers”, “Talking heads”, “Product b-roll”." },
    { t: "Paste or drop screenshots", d: "Ctrl+V a screenshot right here, or drop pictures. Each one gets its number." },
    { t: "Name and tag them", d: "A-roll or B-roll, the shot, a few keywords: found again in a second." },
    { t: "Use them in a script", d: "Select words, then Frame guide: as a note, linked to the words, or the picture in the script." },
  ];
  return (
    <div className="rounded-3xl border border-line/10 bg-surface overflow-hidden">
      <div className="px-6 sm:px-10 pt-9 sm:pt-12 pb-8 text-center relative">
        <div aria-hidden className="absolute inset-x-0 top-0 h-40 opacity-60" style={{ background: "radial-gradient(60% 100% at 50% 0%, rgb(var(--frame) / 0.18), transparent)" }} />
        <div className="relative">
          <FrameMark className="w-16 h-16 rounded-2xl mx-auto" icon="w-8 h-8" />
          <h2 className="mt-4 text-[22px] sm:text-[26px] font-semibold leading-tight">Collect the shots you want to copy</h2>
          <p className="mt-2 text-[14px] text-ink-soft max-w-lg mx-auto">Screenshots of frames other creators nailed, sorted the way your team thinks, so a script can say exactly what a shot should look like.</p>
          <button type="button" onClick={onNew} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-frame text-white font-bold px-5 h-11 text-[14.5px] shadow-[0_3px_0_0_rgb(var(--frame)/0.45)] hover:brightness-110 active:translate-y-[2px] active:shadow-none transition-all">
            <PlusIcon className="w-4 h-4" />
            Make your first collection
          </button>
        </div>
      </div>
      <ol className="grid sm:grid-cols-2 lg:grid-cols-4 border-t border-line/10">
        {steps.map((s, i) => (
          <li key={s.t} className="px-6 py-5 border-line/10 border-b sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0">
            <span className="inline-flex w-6 h-6 rounded-full bg-frame/12 text-frame text-[12px] font-bold items-center justify-center">{i + 1}</span>
            <div className="mt-2 text-[14px] font-semibold">{s.t}</div>
            <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">{s.d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DropHere({ name, onPick }: { name: string | null; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="mt-3 w-full rounded-2xl border-2 border-dashed border-line/20 hover:border-frame/50 hover:bg-frame/[0.03] transition-colors px-6 py-14 text-center">
      <FrameMark className="w-12 h-12 mx-auto" icon="w-6 h-6" />
      <p className="mt-3 text-[15px] font-semibold">{name ? `Nothing in ${name} yet` : "No frames yet"}</p>
      <p className="mt-1 text-[13px] text-ink-soft">Paste a screenshot (Ctrl+V), drop pictures here, or click to pick them.</p>
    </button>
  );
}

function NoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="mt-3 rounded-2xl border border-line/10 bg-surface px-6 py-12 text-center">
      <SearchIcon className="w-7 h-7 mx-auto text-ink-faint" />
      <p className="mt-3 text-[15px] font-semibold">No frames match</p>
      <p className="mt-1 text-[13px] text-ink-soft">Try fewer words, another category, or all collections.</p>
      <button type="button" onClick={onClear} className="mt-4 rounded-lg border border-line/20 px-3.5 h-9 text-[13px] font-semibold hover:border-line/40">
        Clear the search and filters
      </button>
    </div>
  );
}

function NotSetUp() {
  return (
    <div className="rounded-2xl border border-amber/40 bg-amber/[0.06] px-5 py-4 text-[13.5px]">
      <p className="font-semibold">Frame Guides needs a database update first.</p>
      <p className="mt-1 text-ink-soft">Migration 0133 hasn&rsquo;t run on this database yet. App setup shows how to run it; then this page fills in.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function CollectionDialog({
  open,
  c,
  withFiles,
  first,
  onClose,
  onSave,
}: {
  open: boolean;
  c: FrameCollection | null;
  withFiles: number;
  first: boolean;
  onClose: () => void;
  onSave: (input: { id?: string; name: string; color: FrameColor; about: string }) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<FrameColor>("teal");
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(c?.name ?? "");
    setColor(c?.color ?? FRAME_COLORS[Math.floor(Math.random() * 6)]);
    setAbout(c?.about ?? "");
    setErr(null);
  }, [open, c]);
  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const e = await onSave({ id: c?.id, name, color, about });
    setBusy(false);
    setErr(e);
  }
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={c ? "Collection" : first ? "Your first collection" : "New collection"}
      description={withFiles ? `Your ${withFiles === 1 ? "picture goes" : `${withFiles} pictures go`} in it.` : c ? undefined : "A creator, a style, a set of shots: whatever your team looks for."}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !name.trim()} className="rounded-lg bg-frame text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-50">
            {busy ? "Saving…" : c ? "Save" : withFiles ? "Make it and add" : "Make it"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">Name</span>
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Vlog openers, Talking heads, Product b-roll…"
            className="w-full rounded-lg border border-line/15 bg-surface-2/60 px-3 h-10 text-[14px] outline-none focus:border-frame/60 focus:ring-2 focus:ring-frame/20"
          />
        </label>
        <div>
          <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">Colour</span>
          <ColorChoice value={color} onChange={setColor} />
        </div>
        <label className="block">
          <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">About it (optional)</span>
          <input
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            maxLength={300}
            placeholder="What these frames have in common"
            className="w-full rounded-lg border border-line/15 bg-surface-2/60 px-3 h-10 text-[14px] outline-none focus:border-frame/60 focus:ring-2 focus:ring-frame/20"
          />
        </label>
        {err && <p className="text-[13px] text-red">{err}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function DeleteCollectionDialog({
  c,
  count,
  others,
  onClose,
  onDelete,
}: {
  c: FrameCollection | null;
  count: number;
  others: FrameCollection[];
  onClose: () => void;
  onDelete: (moveTo: string | null) => Promise<string | null>;
}) {
  const [how, setHow] = useState<"move" | "delete">("move");
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!c) return;
    setHow(others.length ? "move" : "delete");
    setTo(others[0]?.id ?? null);
    setErr(null);
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  const moving = count > 0 && how === "move" && !!to;
  return (
    <Dialog
      open={!!c}
      onClose={() => !busy && onClose()}
      title={`Delete ${c?.name ?? "the collection"}?`}
      description={count ? `It has ${plural(count, "frame")}.` : "It's empty."}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (count > 0 && how === "move" && !to)}
            onClick={async () => {
              setBusy(true);
              const e = await onDelete(moving ? to : null);
              setBusy(false);
              setErr(e);
            }}
            className="rounded-lg bg-red text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-50"
          >
            {busy ? "Deleting…" : count && how === "delete" ? `Delete it and ${count === 1 ? "its frame" : `its ${count} frames`}` : "Delete it"}
          </button>
        </>
      }
    >
      {count > 0 ? (
        <div className="space-y-2.5" role="radiogroup" aria-label="Its frames">
          {others.length > 0 && (
            <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${how === "move" ? "border-frame/50 bg-frame/[0.05]" : "border-line/15"}`}>
              <input type="radio" name="how" checked={how === "move"} onChange={() => setHow("move")} className="mt-1 accent-[rgb(var(--frame))]" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold">Move its frames to another collection</span>
                <span className="block mt-2">
                  <Select value={to} onChange={setTo} options={others.map((o) => ({ value: o.id, label: o.name, icon: <ColorDot color={o.color} /> }))} ariaLabel="Move them to" size="bar" />
                </span>
              </span>
            </label>
          )}
          <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${how === "delete" ? "border-red/50 bg-red/[0.05]" : "border-line/15"}`}>
            <input type="radio" name="how" checked={how === "delete"} onChange={() => setHow("delete")} className="mt-1 accent-[rgb(var(--red))]" />
            <span>
              <span className="block text-[13.5px] font-semibold">Delete its frames too</span>
              <span className="block text-[12.5px] text-ink-soft mt-0.5">Their pictures go; scripts that use them show “deleted”. This can&rsquo;t be undone.</span>
            </span>
          </label>
        </div>
      ) : (
        <p className="text-[13px] text-ink-soft">Nothing in it, so nothing else goes.</p>
      )}
      {err && <p className="mt-3 text-[13px] text-red">{err}</p>}
    </Dialog>
  );
}

function PickCollectionDialog({ files, collections, counts, onClose, onPick, onNew }: { files: File[] | null; collections: FrameCollection[]; counts: Map<string, number>; onClose: () => void; onPick: (id: string) => void; onNew: () => void }) {
  let last: string | null = null;
  try {
    last = typeof window !== "undefined" ? localStorage.getItem(LAST_KEY) : null;
  } catch {}
  const ordered = [...collections].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0));
  return (
    <Dialog open={!!files} onClose={onClose} title={`Add ${files?.length === 1 ? "it" : `${files?.length ?? 0} frames`} to…`} description="Which collection?">
      <div className="space-y-1">
        {ordered.map((c, i) => (
          <button
            key={c.id}
            type="button"
            data-autofocus={i === 0 ? "" : undefined}
            onClick={() => onPick(c.id)}
            className="w-full flex items-center gap-3 rounded-xl px-3 h-12 text-left hover:bg-surface-2 focus-visible:bg-surface-2 outline-none"
          >
            <ColorDot color={c.color} className="w-3 h-3" />
            <span className="flex-1 min-w-0 truncate text-[14px] font-semibold">{c.name}</span>
            {c.id === last && <span className="text-[11px] font-semibold text-ink-faint">Last used</span>}
            <span className="tabular-nums text-[12.5px] text-ink-faint">{counts.get(c.id) ?? 0}</span>
          </button>
        ))}
        <button type="button" onClick={onNew} className="w-full flex items-center gap-3 rounded-xl px-3 h-12 text-left text-ink-soft hover:text-ink hover:bg-surface-2">
          <PlusIcon className="w-4 h-4" />
          <span className="text-[14px] font-semibold">A new collection</span>
        </button>
      </div>
    </Dialog>
  );
}

function CategoriesDialog({
  open,
  lib,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  lib: FrameLibrary;
  onClose: () => void;
  onCreate: (name: string, color: FrameColor) => Promise<boolean>;
  onUpdate: (c: CustomCategory) => Promise<boolean>;
  onDelete: (c: CustomCategory) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<FrameColor>("pink");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CustomCategory | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of lib.frames) for (const k of f.categories) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, [lib.frames]);
  async function add() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate(name.trim(), color);
    setBusy(false);
    if (ok) setName("");
  }
  return (
    <Dialog open={open} onClose={onClose} title="Your team's categories" description="Beside the built-in ones (shot size, angle, movement, light…), for every frame of the team." width="sm:max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex items-center gap-2"
      >
        <input
          data-autofocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="A new category: Hero shot, Cold open…"
          aria-label="New category"
          className="flex-1 min-w-0 rounded-lg border border-line/15 bg-surface-2/60 px-3 h-10 text-[14px] outline-none focus:border-frame/60 focus:ring-2 focus:ring-frame/20"
        />
        <button type="submit" disabled={busy || !name.trim()} className="rounded-lg bg-frame text-white font-bold px-3.5 h-10 text-[13.5px] disabled:opacity-50">
          Add
        </button>
      </form>
      <div className="mt-2.5">
        <ColorChoice value={color} onChange={setColor} label="The new category's colour" />
      </div>
      <div className="mt-5 space-y-1">
        {!lib.categories.length && <p className="text-[13px] text-ink-faint">None yet.</p>}
        {[...lib.categories].sort((a, b) => a.name.localeCompare(b.name)).map((c) =>
          editing?.id === c.id ? (
            <div key={c.id} className="rounded-xl border border-line/15 p-3 space-y-2.5">
              <input
                autoFocus
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                maxLength={40}
                aria-label="Name"
                className="w-full rounded-lg border border-line/15 bg-surface-2/60 px-3 h-9 text-[13.5px] outline-none focus:border-frame/60"
              />
              <ColorChoice value={editing.color} onChange={(col) => setEditing({ ...editing, color: cleanColor(col, "slate") })} />
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:bg-surface-2">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (await onUpdate(editing)) setEditing(null);
                  }}
                  className="rounded-lg bg-frame text-white font-bold px-3 h-8 text-[12.5px]"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div key={c.id} className="group flex items-center gap-2.5 rounded-lg px-2 h-10 hover:bg-surface-2/60">
              <span className="w-3 h-3 rounded-[4px] flex-shrink-0" style={{ background: COLOR_CSS[c.color] }} aria-hidden />
              <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold">{c.name}</span>
              <span className="text-[12px] text-ink-faint tabular-nums">{plural(counts.get(customKey(c.id)) ?? 0, "frame")}</span>
              <button type="button" onClick={() => setEditing(c)} aria-label={`Change ${c.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface">
                <EditIcon className="w-3.5 h-3.5" />
              </button>
              {lib.me && (
                <button type="button" onClick={() => void onDelete(c)} aria-label={`Delete ${c.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-red hover:bg-red/10">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        )}
      </div>
    </Dialog>
  );
}
