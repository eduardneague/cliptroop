"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { ArrowLeftIcon, CloseIcon, ExpandIcon, PlusIcon, StarIcon } from "@/components/ui/icons";
import type { LibraryVideo, StudioData, Variant } from "../lib/queries";
import { deleteVariant, importLibrary, pickWinner, registerVariant, renameVariant } from "@/app/(dashboard)/videos/[id]/studio/actions";
import { HomeMock, MobileMock, ScaleFrame, SearchMock, TabletMock, TvMock, UpNextMock, VIEW_SIZE, type MockCard, type MockTheme, type MockView } from "./mockups";

const VIEWS: { id: MockView; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "search", label: "Search" },
  { id: "upnext", label: "Up next" },
  { id: "mobile", label: "Mobile" },
  { id: "tablet", label: "Tablet" },
  { id: "tv", label: "TV" },
];
const REGIONS = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["RO", "Romania"],
  ["CA", "Canada"],
  ["DE", "Germany"],
] as const;
const MAX_BYTES = 2 * 1024 * 1024;

// ---- helpers ----------------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(list: T[], seed: number) {
  const r = rng(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const compact = (n: number | null) =>
  n === null ? "" : n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
function ago(iso: string | null) {
  if (!iso) return "1 week ago";
  const d = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  if (d < 30) return `${Math.round(d / 7)} week${Math.round(d / 7) === 1 ? "" : "s"} ago`;
  if (d < 365) return `${Math.round(d / 30)} month${Math.round(d / 30) === 1 ? "" : "s"} ago`;
  return `${Math.round(d / 365)} year${Math.round(d / 365) === 1 ? "" : "s"} ago`;
}
const dur = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
function warnings(v: Variant) {
  const w: string[] = [];
  if (v.width && v.height && Math.abs(v.width / v.height - 16 / 9) > 0.02) w.push("Not 16:9");
  if (v.width && v.width < 1280) w.push("Under 1280px wide");
  if (v.size && v.size > MAX_BYTES) w.push("Over 2 MB (YouTube's limit)");
  if (v.path && /\.webp$/i.test(v.path)) w.push("WebP: YouTube needs JPG or PNG");
  return w;
}
function readSize(file: File) {
  return new Promise<{ w: number; h: number }>((res) => {
    const img = new Image();
    img.onload = () => {
      res({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => res({ w: 0, h: 0 });
    img.src = URL.createObjectURL(file);
  });
}
const libCard = (v: LibraryVideo): MockCard => ({
  key: v.id,
  thumb: v.thumb,
  title: v.title,
  channel: v.channel,
  avatar: v.avatar,
  views: `${compact(v.views)} views`,
  age: ago(v.publishedAt),
  duration: dur(v.duration),
});
const FILLER: MockCard[] = Array.from({ length: 16 }, (_, i) => ({
  key: `f${i}`,
  thumb: null,
  title: "Import popular videos to see real competition here",
  channel: "Channel",
  avatar: null,
  views: "1.2M views",
  age: `${i + 1} days ago`,
  duration: "12:34",
}));

// ---- the studio -----------------------------------------------------------
export function Studio({ data }: { data: StudioData }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);
  const { project, canEdit } = data;

  const [variants, setVariants] = useState<Variant[]>(data.variants);
  useEffect(() => setVariants(data.variants), [data.variants]);
  const [activeId, setActiveId] = useState<string | null>(data.variants.find((v) => v.winner)?.id ?? data.variants[0]?.id ?? null);
  useEffect(() => {
    if (!activeId || !variants.some((v) => v.id === activeId)) setActiveId(variants[0]?.id ?? null);
  }, [variants, activeId]);
  const active = variants.find((v) => v.id === activeId) ?? null;

  const [view, setView] = useState<MockView>("home");
  const [theme, setTheme] = useState<"light" | "dark" | "both">("dark");
  const [compare, setCompare] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [seed, setSeed] = useState(7);
  const [meta, setMeta] = useState({ views: "24K views", age: "2 days ago", duration: "14:32", query: project.title.split(" ").slice(0, 4).join(" ").toLowerCase() });
  const [panel, setPanel] = useState<null | "details" | "library">(null);
  const [uploads, setUploads] = useState<{ id: string; name: string; state: "uploading" | "saving" | "error" }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [region, setRegion] = useState("US");
  const [importing, setImporting] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A fresh arrangement on each visit (after hydration).
  useEffect(() => setSeed(Math.floor(Math.random() * 1e9)), []);

  const others = useMemo(() => {
    const lib = data.library.length ? shuffled(data.library, seed).map(libCard) : FILLER;
    return lib;
  }, [data.library, seed]);

  const mineFor = useCallback(
    (v: Variant | null): MockCard => ({
      key: `mine-${v?.id ?? "none"}`,
      thumb: v?.url ?? null,
      title: v?.title ?? data.defaultTitle,
      channel: data.channel.name,
      avatar: data.channel.avatar,
      views: meta.views,
      age: meta.age,
      duration: meta.duration,
      mine: true,
    }),
    [data.channel, data.defaultTitle, meta]
  );

  /** Your video placed among the others, at a seeded spot near the top. */
  const cardsFor = useCallback(
    (v: Variant | null, spots: number) => {
      const pos = rng(seed + 11)() * spots;
      const at = Math.floor(pos);
      return [...others.slice(0, at), mineFor(v), ...others.slice(at)];
    },
    [others, seed, mineFor]
  );

  const renderView = (v: Variant | null, t: MockTheme) => {
    const width = VIEW_SIZE[view];
    const inner =
      view === "home" ? (
        <HomeMock cards={cardsFor(v, 8)} theme={t} />
      ) : view === "search" ? (
        <SearchMock cards={cardsFor(v, 3)} theme={t} query={meta.query} />
      ) : view === "upnext" ? (
        <UpNextMock cards={cardsFor(v, 5).slice(0)} theme={t} playing={others[others.length - 1] ?? null} />
      ) : view === "mobile" ? (
        <MobileMock cards={cardsFor(v, 3)} theme={t} />
      ) : view === "tablet" ? (
        <TabletMock cards={cardsFor(v, 4)} theme={t} />
      ) : (
        <TvMock cards={cardsFor(v, 4)} />
      );
    return (
      <div className={view === "mobile" ? "mx-auto w-full max-w-[390px]" : view === "tablet" ? "mx-auto w-full max-w-[834px]" : "w-full"}>
        <ScaleFrame width={width}>{inner}</ScaleFrame>
      </div>
    );
  };
  const themes: MockTheme[] = view === "tv" ? ["dark"] : theme === "both" ? ["light", "dark"] : [theme];

  // ---- actions ------------------------------------------------------------
  async function addFiles(files: FileList | File[]) {
    if (!canEdit) return;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return toast.error("Pick image files (JPG or PNG).");
    for (const file of list) {
      const tmp = `up-${Math.random().toString(36).slice(2)}`;
      setUploads((u) => [...u, { id: tmp, name: file.name, state: "uploading" }]);
      const { w, h } = await readSize(file);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${project.teamId}/${project.id}/${crypto.randomUUID()}.${ext}`;
      // Show it immediately while it uploads.
      const localUrl = URL.createObjectURL(file);
      setVariants((vs) => [...vs, { id: tmp, title: data.defaultTitle, url: localUrl, path, width: w, height: h, size: file.size, winner: false }]);
      setActiveId((a) => a ?? tmp);
      const { error } = await supabase.storage.from("package-thumbs").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (error) {
        setUploads((u) => u.map((x) => (x.id === tmp ? { ...x, state: "error" } : x)));
        setVariants((vs) => vs.filter((v) => v.id !== tmp));
        toast.error(`${file.name}: upload failed`);
        continue;
      }
      setUploads((u) => u.map((x) => (x.id === tmp ? { ...x, state: "saving" } : x)));
      const r = await registerVariant(project.id, { path, width: w, height: h, size: file.size, title: data.defaultTitle });
      if (r.error !== undefined) {
        toast.error(r.error);
        setVariants((vs) => vs.filter((v) => v.id !== tmp));
      } else {
        setVariants((vs) => vs.map((v) => (v.id === tmp ? { ...v, id: r.id } : v)));
        setActiveId((a) => (a === tmp ? r.id : a));
      }
      setUploads((u) => u.filter((x) => x.id !== tmp));
    }
    router.refresh();
  }

  async function rename(v: Variant, title: string) {
    if (title === v.title || v.id.startsWith("up-")) return;
    setVariants((vs) => vs.map((x) => (x.id === v.id ? { ...x, title } : x)));
    const r = await renameVariant(v.id, title);
    if (r.error !== undefined) {
      toast.error(r.error);
      setVariants((vs) => vs.map((x) => (x.id === v.id ? { ...x, title: v.title } : x)));
    }
  }
  async function remove(v: Variant) {
    if (!(await confirm({ title: "Delete this thumbnail?", description: v.title, confirmLabel: "Delete", danger: true }))) return;
    setVariants((vs) => vs.filter((x) => x.id !== v.id));
    const r = await deleteVariant(v.id);
    if (r.error !== undefined) {
      toast.error(r.error);
      router.refresh();
    }
  }
  async function crown(v: Variant) {
    setVariants((vs) => vs.map((x) => ({ ...x, winner: x.id === v.id })));
    const r = await pickWinner(v.id, project.id);
    if (r.error !== undefined) {
      toast.error(r.error);
      router.refresh();
    } else toast.success("Winner picked");
  }
  async function runImport() {
    setImporting(true);
    const r = await importLibrary(project.teamId, region);
    setImporting(false);
    if (r.error !== undefined) toast.error(r.error);
    else {
      toast.success(`Imported ${r.count} popular videos`);
      setPanel(null);
      router.refresh();
    }
  }
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.current?.requestFullscreen?.();
  };

  // ---- keyboard ------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = variants.findIndex((v) => v.id === activeId);
      if (e.key === "ArrowRight" && variants.length) setActiveId(variants[(i + 1) % variants.length].id);
      else if (e.key === "ArrowLeft" && variants.length) setActiveId(variants[(i - 1 + variants.length) % variants.length].id);
      else if (e.key === "r" || e.key === "R") setSeed(Math.floor(Math.random() * 1e9));
      else if (e.key === "f" || e.key === "F") fullscreen();
      else if (e.key === "d" || e.key === "D") setTheme((th) => (th === "dark" ? "light" : "dark"));
      else if (e.key === "c" || e.key === "C") setCompare((c) => !c);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const compareList = variants.filter((v) => compareIds.includes(v.id));

  // ---- UI -----------------------------------------------------------------
  const seg = (on: boolean) =>
    `px-3 h-8 rounded-md text-[12.5px] font-semibold whitespace-nowrap transition-colors ${on ? "bg-surface-2 text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`;

  return (
    <div className="px-3 sm:px-6 py-4 space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={`/videos/${project.id}?tab=package`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink mr-1">
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span className="font-mono">#{project.number}</span>
        </Link>
        <h1 className="text-[20px] sm:text-[24px] font-display font-semibold mr-2">Thumbnail Studio</h1>
        <span className="flex-1" />
        <div className="flex items-center rounded-lg border border-line/15 p-0.5 overflow-x-auto no-scrollbar max-w-full" role="radiogroup" aria-label="Layout">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)} className={seg(view === v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-lg border border-line/15 p-0.5" role="radiogroup" aria-label="Theme">
          {(["light", "dark", "both"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} disabled={view === "tv"} className={`${seg(theme === t)} capitalize disabled:opacity-40`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setCompare((c) => !c);
            if (!compareIds.length) setCompareIds(variants.slice(0, 3).map((v) => v.id));
          }}
          aria-pressed={compare}
          className={`rounded-lg border px-3 h-9 text-[13px] font-semibold transition-colors ${compare ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
        >
          Compare
        </button>
        <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 1e9))} className="rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold hover:border-line/40" title="Shortcut: R">
          Randomize
        </button>
        <button type="button" onClick={fullscreen} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold hover:border-line/40" title="Shortcut: F">
          <ExpandIcon className="w-3.5 h-3.5" />
          Fullscreen
        </button>
        <div className="relative">
          <button type="button" onClick={() => setPanel((p) => (p === "details" ? null : "details"))} className="rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold hover:border-line/40">
            Details
          </button>
          {panel === "details" && (
            <div className="absolute z-40 left-0 top-[calc(100%+6px)] w-[280px] rounded-2xl border border-line/15 bg-surface shadow-2xl p-3.5 space-y-2.5 animate-[modalin_.15s_var(--ease-out)]">
              {(
                [
                  ["views", "Views"],
                  ["age", "Uploaded"],
                  ["duration", "Length"],
                  ["query", "Search phrase"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="block text-[11.5px] font-semibold text-ink-soft mb-1">{label}</span>
                  <input value={meta[k]} onChange={(e) => setMeta((m) => ({ ...m, [k]: e.target.value }))} className="w-full rounded-lg border border-line/15 bg-surface px-3 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber" />
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" onClick={() => setPanel((p) => (p === "library" ? null : "library"))} className="rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold hover:border-line/40">
            Library · {data.library.length}
          </button>
          {panel === "library" && (
            <div className="absolute z-40 right-0 sm:left-0 sm:right-auto top-[calc(100%+6px)] w-[300px] rounded-2xl border border-line/15 bg-surface shadow-2xl p-3.5 space-y-3 animate-[modalin_.15s_var(--ease-out)]">
              <p className="text-[12.5px] text-ink-soft">
                {data.library.length ? `${data.library.length} popular videos, stored in VPlanner so previews load instantly.` : "No placeholder videos yet."} Import YouTube&rsquo;s current most popular videos, including Science &amp; Tech.
              </p>
              <select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full rounded-lg border border-line/15 bg-surface px-3 h-9 text-[13px]">
                {REGIONS.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              {data.canImport ? (
                <button type="button" onClick={() => void runImport()} disabled={importing} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber text-white font-bold h-10 text-[13.5px] disabled:opacity-60">
                  {importing && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  {importing ? "Importing… (about a minute)" : data.library.length ? "Refresh from YouTube" : "Import from YouTube"}
                </button>
              ) : (
                <p className="text-[12px] text-ink-soft">Only the master or a packager can import.</p>
              )}
            </div>
          )}
        </div>
        <span className="hidden lg:inline text-[12px] text-ink-faint ml-1">← → switch · R randomize · F fullscreen · D dark/light · C compare</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
        {/* Variations */}
        <aside
          onDragOver={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={`rounded-2xl border bg-surface p-2.5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto transition-colors ${dragOver ? "border-amber bg-amber/5" : "border-line/10"}`}
        >
          <div className="flex items-center justify-between px-1.5 pb-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Variations · {variants.length}</span>
            {compare && <span className="text-[11px] text-amber font-semibold">Tick to compare</span>}
          </div>
          <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible no-scrollbar pb-1">
            {variants.map((v, i) => {
              const w = warnings(v);
              const on = v.id === activeId;
              return (
                <div
                  key={v.id}
                  className={`flex-shrink-0 w-[220px] lg:w-auto rounded-xl border p-2 transition-colors ${on ? "border-amber bg-amber/[0.07]" : "border-line/10 hover:border-line/25"}`}
                >
                  <button type="button" onClick={() => setActiveId(v.id)} className="relative block w-full aspect-video rounded-lg overflow-hidden bg-surface-2" aria-label={`Show variation ${i + 1}`}>
                    {v.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.url} alt="" className="w-full h-full object-cover" />
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 text-white text-[11px] font-bold px-1.5 py-0.5">{i + 1}</span>
                    {v.winner && <span className="absolute right-1.5 top-1.5 rounded-md bg-amber text-white text-[11px] font-bold px-1.5 py-0.5">★ Winner</span>}
                    {v.id.startsWith("up-") && (
                      <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="w-6 h-6 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      </span>
                    )}
                    {compare && (
                      <span
                        role="checkbox"
                        aria-checked={compareIds.includes(v.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompareIds((ids) => (ids.includes(v.id) ? ids.filter((x) => x !== v.id) : [...ids, v.id]));
                        }}
                        className={`absolute right-1.5 bottom-1.5 w-6 h-6 rounded-md border-2 flex items-center justify-center text-[13px] font-bold ${
                          compareIds.includes(v.id) ? "bg-amber border-amber text-white" : "bg-black/50 border-white/70 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                  <input
                    defaultValue={v.title}
                    key={`${v.id}-${v.title}`}
                    readOnly={!canEdit}
                    maxLength={100}
                    onBlur={(e) => void rename(v, e.target.value.trim() || v.title)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="mt-2 w-full bg-transparent text-[13px] font-semibold outline-none rounded-md px-1 py-0.5 focus:bg-surface-2"
                    aria-label={`Title for variation ${i + 1}`}
                  />
                  {w.length > 0 && <div className="px-1 mt-0.5 text-[11px] font-semibold text-amber">{w.join(" · ")}</div>}
                  {canEdit && !v.id.startsWith("up-") && (
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => void crown(v)}
                        disabled={v.winner}
                        className={`inline-flex items-center gap-1 rounded-md px-2 h-7 text-[11.5px] font-semibold ${v.winner ? "text-amber" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
                      >
                        <StarIcon className="w-3.5 h-3.5" />
                        {v.winner ? "Winner" : "Make winner"}
                      </button>
                      <span className="flex-1" />
                      <button type="button" onClick={() => void remove(v)} className="rounded-md w-7 h-7 flex items-center justify-center text-ink-soft hover:text-red hover:bg-red/10" aria-label="Delete">
                        <CloseIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {canEdit && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex-shrink-0 w-[220px] lg:w-auto min-h-[120px] rounded-xl border-2 border-dashed border-line/25 hover:border-amber text-ink-soft hover:text-ink flex flex-col items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors"
              >
                <PlusIcon className="w-5 h-5" />
                Add thumbnails
                <span className="text-[11.5px] font-normal">or drop them here · 1280×720 JPG/PNG</span>
              </button>
            )}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden onChange={(e) => e.target.files && void addFiles(e.target.files)} />
          </div>
          {uploads.length > 0 && <p className="px-1.5 pt-2 text-[12px] text-ink-soft">Uploading {uploads.length}…</p>}
        </aside>

        {/* Preview */}
        <div ref={stage} className="min-w-0 rounded-2xl border border-line/10 bg-paper overflow-auto [&:fullscreen]:p-6 [&:fullscreen]:bg-paper">
          {!variants.length ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-[15px] font-semibold">Add your thumbnails to see them on YouTube.</p>
              <p className="text-[13px] text-ink-soft">Each one gets its own title. Drop 10 to 15 variations and compare them.</p>
            </div>
          ) : compare ? (
            <div className={`grid gap-4 p-3 ${compareList.length >= 3 ? "xl:grid-cols-3 md:grid-cols-2" : compareList.length === 2 ? "md:grid-cols-2" : ""}`}>
              {compareList.length === 0 && <p className="p-6 text-[13.5px] text-ink-soft">Tick the variations you want to compare.</p>}
              {compareList.map((v) => (
                <div key={v.id} className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono">{variants.indexOf(v) + 1}</span>
                    <span className="truncate">{v.title}</span>
                    {v.winner && <span className="text-amber">★</span>}
                  </div>
                  {themes.map((t) => (
                    <div key={t} className="rounded-xl overflow-hidden border border-line/10">
                      {renderView(v, t)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className={`grid gap-3 p-3 ${themes.length === 2 ? "2xl:grid-cols-2" : ""}`}>
              {themes.map((t) => (
                <div key={t} className="rounded-xl overflow-hidden border border-line/10">
                  {renderView(active, t)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
