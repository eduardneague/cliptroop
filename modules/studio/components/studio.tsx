"use client";

import { APP_NAME } from "@/lib/brand";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { AlertIcon, ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ExpandIcon, GridIcon, ImageIcon, PlusIcon, SettingsIcon, StarIcon, TrashIcon } from "@/components/ui/icons";

function ShuffleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}
import type { LibraryVideo, StudioData, Variant } from "../lib/queries";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Select } from "@/components/ui/select";
import { deleteVariant, importLibrary, registerVariant, renameVariant, toggleWinner } from "@/app/(dashboard)/videos/[id]/studio/actions";
import { HomeMock, MobileMock, ScaleFrame, SearchMock, TabletMock, TvMock, UpNextMock, VIEW_SIZE, type MockCard, type MockTheme, type MockView } from "./mockups";
import { belowWidth, minWidth } from "@/lib/breakpoints";

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
/** What YouTube won't like about an image: a short label and the full reason. */
function warnings(v: Variant) {
  const w: { short: string; long: string }[] = [];
  if (v.width && v.height && Math.abs(v.width / v.height - 16 / 9) > 0.02) w.push({ short: "Not 16:9", long: "Not 16:9: YouTube crops it" });
  if (v.width && v.width < 1280) w.push({ short: "Under 1280px", long: "Under 1280px wide: it can look soft" });
  if (v.size && v.size > MAX_BYTES) w.push({ short: "Over 2 MB", long: "Over 2 MB: YouTube won't take it" });
  if (v.path && /\.webp$/i.test(v.path)) w.push({ short: "WebP", long: "WebP: YouTube needs JPG or PNG" });
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
  // Compare starts with the winners (A/B candidates) when there are any.
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
  const detailsBtn = useRef<HTMLButtonElement>(null);
  const libraryBtn = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLUListElement>(null);

  // A fresh arrangement on each visit (after hydration). Phones open on the Mobile layout.
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1e9));
    if (window.matchMedia(belowWidth("sm")).matches) setView("mobile");
    setCanFullscreen(!!document.fullscreenEnabled);
  }, []);
  // The list (xl) and the strip + editor (smaller) swap at xl: re-render then so the titles re-measure.
  const [, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(minWidth("xl"));
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

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
  /** Up to 3 winners, for A/B testing. */
  async function crown(v: Variant) {
    if (!v.winner && variants.filter((x) => x.winner).length >= 3) {
      return toast.error("Pick up to 3 winners (for A/B testing). Unpick one first.");
    }
    setVariants((vs) => vs.map((x) => (x.id === v.id ? { ...x, winner: !x.winner } : x)));
    const r = await toggleWinner(v.id, project.id);
    if (r.error !== undefined) {
      toast.error(r.error);
      router.refresh();
    } else toast.success(r.winner ? "Marked as a winner" : "Unpicked");
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

  // Keep the one that's showing in view inside the strip / list (without moving the page).
  useEffect(() => {
    const ul = strip.current;
    const li = ul?.querySelector<HTMLElement>(`[data-variant="${activeId}"]`);
    if (!ul || !li) return;
    if (ul.scrollWidth > ul.clientWidth + 1) {
      const left = li.offsetLeft - (ul.clientWidth - li.offsetWidth) / 2;
      ul.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    } else if (ul.scrollHeight > ul.clientHeight + 1) {
      if (li.offsetTop < ul.scrollTop || li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTo({ top: Math.max(0, li.offsetTop - 8), behavior: "smooth" });
    }
  }, [activeId]);

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
      else if (e.key === "c" || e.key === "C") toggleCompare();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- A/B test: 2 or 3 winners are tested against each other on YouTube ---
  const testers = variants.filter((v) => v.winner);
  const abOn = testers.length >= 2;
  const letterOf = (v: Variant) => (abOn && v.winner ? ("ABC"[testers.indexOf(v)] ?? null) : null);
  const compareList = variants.filter((v) => compareIds.includes(v.id));
  const comparingTest = abOn && compare && compareList.length === testers.length && compareList.every((v) => v.winner);
  const activeIndex = active ? variants.indexOf(active) : -1;
  const step = (d: number) => variants.length && setActiveId(variants[(activeIndex + d + variants.length) % variants.length].id);

  function toggleCompare() {
    setCompare((c) => !c);
    if (!compareIds.length) {
      const w = variants.filter((v) => v.winner).map((v) => v.id);
      setCompareIds(w.length > 1 ? w : variants.slice(0, 3).map((v) => v.id));
    }
  }
  function compareTest() {
    setCompareIds(testers.map((v) => v.id));
    setCompare(true);
  }
  const tick = (id: string) => setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // ---- UI -----------------------------------------------------------------
  const seg = (on: boolean) =>
    `px-2.5 sm:px-3 h-8 rounded-md text-[12.5px] font-semibold whitespace-nowrap transition-colors ${on ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`;
  const tool = (on = false) =>
    `inline-flex items-center justify-center gap-1.5 rounded-lg border h-9 min-w-9 px-2.5 text-[13px] font-semibold transition-colors ${on ? "border-amber bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"}`;

  /** The little marks on a thumbnail: its number, and A/B/C or ★ when it's picked. */
  const marks = (v: Variant, i: number) => {
    const letter = letterOf(v);
    return (
      <>
        <span className="absolute left-1 top-1 rounded bg-black/70 text-white text-[10.5px] font-bold leading-none px-1.5 py-1">{i + 1}</span>
        {letter ? (
          <span className="absolute right-1 top-1 rounded bg-amber text-white text-[11px] font-bold leading-none px-1.5 py-1 shadow-sm" title={`In the A/B test as ${letter}`}>
            {letter}
          </span>
        ) : v.winner ? (
          <span className="absolute right-1 top-1 rounded bg-amber text-white leading-none p-1 shadow-sm" title="Winner">
            <StarIcon className="w-3 h-3" filled />
          </span>
        ) : null}
        {v.id.startsWith("up-") && (
          <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          </span>
        )}
        {compare && (
          <span
            role="checkbox"
            aria-checked={compareIds.includes(v.id)}
            aria-label={`Compare variation ${i + 1}`}
            onClick={(e) => {
              e.stopPropagation();
              tick(v.id);
            }}
            className={`absolute right-1 bottom-1 w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center ${
              compareIds.includes(v.id) ? "bg-amber border-amber text-white" : "bg-black/50 border-white/70 text-transparent"
            }`}
          >
            <CheckIcon className="w-3.5 h-3.5" />
          </span>
        )}
      </>
    );
  };

  /** Grows with the title (1 to 3 lines), so short titles stay on one line. */
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    // Hidden (the list on small screens, the editor on big ones): measure again once it shows.
    if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`;
  };
  const titleField = (v: Variant, i: number, className = "") => (
    <textarea
      defaultValue={v.title}
      key={`${v.id}-${v.title}`}
      ref={fit}
      onInput={(e) => fit(e.currentTarget)}
      readOnly={!canEdit}
      maxLength={100}
      rows={1}
      onBlur={(e) => void rename(v, e.target.value.replace(/\s+/g, " ").trim() || v.title)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className={`w-full resize-none bg-transparent text-[13px] font-semibold leading-snug outline-none rounded-md px-1 py-0.5 focus:bg-surface-2 ${className}`}
      aria-label={`Title for variation ${i + 1}`}
    />
  );

  const winnerButton = (v: Variant, withLabel: boolean) => {
    const letter = letterOf(v);
    const label = letter ? `Test ${letter}` : v.winner ? "Winner" : "Make winner";
    return (
      <button
        type="button"
        onClick={() => void crown(v)}
        aria-pressed={v.winner}
        title={v.winner ? "Unpick" : "Pick the best one, or up to 3 for an A/B test"}
        aria-label={withLabel ? undefined : label}
        className={`inline-flex items-center gap-1 rounded-md border h-7 text-[12px] font-semibold transition-colors ${withLabel ? "px-2" : "w-7 justify-center"} ${
          v.winner ? "border-amber/50 bg-amber/10 text-amber hover:bg-amber/20" : "border-line/20 bg-surface text-ink hover:border-line/40 hover:bg-surface-2"
        }`}
      >
        <StarIcon className="w-4 h-4" filled={v.winner} />
        {withLabel && label}
      </button>
    );
  };
  const deleteButton = (v: Variant) => (
    <button type="button" onClick={() => void remove(v)} className="rounded-md border border-line/20 bg-surface w-7 h-7 flex items-center justify-center text-ink hover:text-red hover:border-red/40 hover:bg-red/10 transition-colors" aria-label={`Delete variation ${variants.indexOf(v) + 1}`}>
      <TrashIcon className="w-3.5 h-3.5" />
    </button>
  );

  /** Says what's picked, and makes an A/B test impossible to miss. */
  const status = !variants.length ? null : abOn ? (
    <div className="rounded-xl border border-amber/45 bg-amber/10 px-2.5 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-md bg-amber text-white text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5">A/B test on</span>
        <span className="flex items-center gap-1 text-[12.5px] font-semibold">
          {testers.map((v, i) => (
            <button key={v.id} type="button" onClick={() => setActiveId(v.id)} className="inline-flex items-center gap-1 rounded-md px-1 hover:bg-amber/15" title={v.title}>
              <span className="text-amber">{"ABC"[i]}</span>
              <span className="font-mono text-ink-soft">#{variants.indexOf(v) + 1}</span>
            </button>
          ))}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={compareTest} className="text-[12.5px] font-semibold text-amber hover:underline">
          Compare
        </button>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-soft">
        Upload {testers.length === 2 ? "both" : "all 3"} to YouTube Studio&rsquo;s Test &amp; compare. It keeps the one people watch most.
      </p>
    </div>
  ) : (
    <p className="text-[12px] text-ink-soft px-0.5">
      {testers.length ? (
        <>
          <span className="text-amber font-semibold">★ #{variants.indexOf(testers[0]) + 1} is the winner.</span> Star 1 or 2 more to A/B test them.
        </>
      ) : (
        <>No winner yet. Star the best one, or up to 3 to A/B test them.</>
      )}
    </p>
  );

  return (
    <div className="px-3 sm:px-6 py-3 sm:py-4 space-y-3">
      {/* Header */}
      <header className="flex items-center gap-2.5">
        <Link
          href={`/videos/${project.id}?tab=package`}
          className="flex-shrink-0 w-9 h-9 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink hover:border-line/30"
          aria-label={`Back to #${project.number}`}
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] sm:text-[22px] font-display font-semibold leading-tight">Thumbnail Studio</h1>
          <p className="text-[12.5px] text-ink-soft truncate">
            <span className="font-mono">#{project.number}</span> · {project.title}
          </p>
        </div>
        <div className="relative">
          <button ref={detailsBtn} type="button" onClick={() => setPanel((p) => (p === "details" ? null : "details"))} className={tool(panel === "details")} aria-label="Details" title="Views, upload date and length shown on your video">
            <SettingsIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Details</span>
          </button>
          <AnchoredMenu open={panel === "details"} onClose={() => setPanel(null)} anchor={detailsBtn} width={280} label="details">
            <div className="p-3.5 space-y-2.5">
              <p className="text-[12px] text-ink-soft">What the previews show under your video.</p>
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
          </AnchoredMenu>
        </div>
        <div className="relative">
          <button ref={libraryBtn} type="button" onClick={() => setPanel((p) => (p === "library" ? null : "library"))} className={tool(panel === "library")} aria-label={`Library: ${data.library.length} videos`} title="The popular videos around yours">
            <ImageIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Library</span>
            <span className="text-ink-faint font-normal">{data.library.length}</span>
          </button>
          <AnchoredMenu open={panel === "library"} onClose={() => setPanel(null)} anchor={libraryBtn} width={300} label="library">
            <div className="p-3.5 space-y-2.5">
              <p className="text-[12.5px] text-ink-soft">
                {data.library.length ? `${data.library.length} popular videos, stored in ${APP_NAME} so previews load instantly.` : "No placeholder videos yet."} Import YouTube&rsquo;s current most popular videos, including Science &amp; Tech.
              </p>
              <Select value={region} onChange={(v) => v && setRegion(v)} options={REGIONS.map(([code, name]) => ({ value: code, label: name }))} ariaLabel="Region" menuMinWidth={200} />
              {data.canImport ? (
                <button type="button" onClick={() => void runImport()} disabled={importing} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber text-white font-bold h-10 text-[13.5px] disabled:opacity-60">
                  {importing && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  {importing ? "Importing… (about a minute)" : data.library.length ? "Refresh from YouTube" : "Import from YouTube"}
                </button>
              ) : (
                <p className="text-[12px] text-ink-soft">Only the master or a packager can import.</p>
              )}
            </div>
          </AnchoredMenu>
        </div>
      </header>

      {/* minmax(0, 1fr): the swipeable strip must never widen the column past the screen. */}
      <div className="grid gap-3 xl:gap-4 grid-cols-[minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] items-start">
        {/* Thumbnails: a strip on phones and tablets, a list on big screens */}
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
          className={`min-w-0 rounded-2xl border bg-surface flex flex-col xl:sticky xl:top-20 xl:max-h-[calc(100dvh-7rem)] transition-colors ${dragOver ? "border-amber bg-amber/5" : "border-line/10"}`}
        >
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
            <h2 className="text-[13.5px] font-semibold">
              Thumbnails <span className="text-ink-faint font-normal">{variants.length}</span>
            </h2>
            {uploads.length > 0 && <span className="text-[12px] text-ink-soft">· uploading {uploads.length}…</span>}
            <span className="flex-1" />
            {compare && <span className="text-[11.5px] font-semibold text-amber">Tick to compare</span>}
            {canEdit && (
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-amber text-white h-8 px-2.5 text-[12.5px] font-bold hover:brightness-110">
                <PlusIcon className="w-3.5 h-3.5" />
                Add
              </button>
            )}
          </div>
          {status && <div className="px-3 pb-2">{status}</div>}

          <ul ref={strip} className="relative flex xl:flex-col gap-2.5 xl:gap-1.5 overflow-x-auto xl:overflow-x-visible xl:overflow-y-auto xl:min-h-0 no-scrollbar px-3 pt-1.5 pb-3 xl:pb-3">
            {variants.map((v, i) => {
              const w = warnings(v);
              const on = v.id === activeId;
              return (
                <li key={v.id} data-variant={v.id} className={`flex-shrink-0 w-[128px] xl:w-auto xl:flex xl:gap-3 xl:rounded-xl xl:p-2 transition-colors ${on ? "xl:bg-amber/[0.08] xl:ring-1 xl:ring-inset xl:ring-amber/50" : "xl:hover:bg-surface-2/60"}`}>
                  <button
                    type="button"
                    onClick={() => setActiveId(v.id)}
                    className={`relative block w-full xl:w-[120px] flex-shrink-0 aspect-video rounded-lg overflow-hidden bg-surface-2 ring-2 ring-offset-2 ring-offset-surface xl:ring-0 xl:ring-offset-0 ${on ? "ring-amber" : "ring-transparent"}`}
                    aria-label={`Show variation ${i + 1}`}
                    aria-current={on || undefined}
                  >
                    {v.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.url} alt="" className="w-full h-full object-cover" />
                    )}
                    {marks(v, i)}
                    {w.length > 0 && (
                      <span className="xl:hidden absolute left-1 bottom-1 rounded bg-black/70 text-amber p-0.5" title={w.map((x) => x.long).join(" · ")}>
                        <AlertIcon className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                  <div className="hidden xl:flex min-w-0 flex-1 flex-col">
                    {titleField(v, i)}
                    <div className="mt-auto flex items-center gap-0.5 min-w-0">
                      {w.length > 0 && (
                        <span className="min-w-0 truncate inline-flex items-center gap-1 px-1 text-[11px] font-semibold text-amber" title={w.map((x) => x.long).join(" · ")}>
                          <AlertIcon className="w-3.5 h-3.5 flex-shrink-0" />
                          {w[0].short}
                          {w.length > 1 && <span className="text-ink-faint">+{w.length - 1}</span>}
                        </span>
                      )}
                      <span className="flex-1" />
                      {canEdit && !v.id.startsWith("up-") && (
                        <>
                          {winnerButton(v, false)}
                          {deleteButton(v)}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {canEdit && (
              <li className="flex-shrink-0 w-[128px] xl:w-auto">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="w-full aspect-video xl:aspect-auto xl:min-h-[64px] rounded-lg border-2 border-dashed border-line/25 hover:border-amber text-ink-soft hover:text-ink flex flex-col items-center justify-center gap-0.5 px-2 text-[12.5px] font-semibold transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    <PlusIcon className="w-4 h-4" />
                    Add thumbnails
                  </span>
                  <span className="hidden xl:inline text-[11.5px] font-normal">or drop them here · 1280×720 JPG/PNG</span>
                </button>
              </li>
            )}
          </ul>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden onChange={(e) => e.target.files && void addFiles(e.target.files)} />

          {/* Phones and tablets: edit the one that's showing */}
          {active && (
            <div className="xl:hidden border-t border-line/10 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-mono font-bold">#{activeIndex + 1}</span>
                <div className="min-w-0 flex-1">{titleField(active, activeIndex)}</div>
                {canEdit && !active.id.startsWith("up-") && (
                  <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                    {winnerButton(active, true)}
                    {deleteButton(active)}
                  </div>
                )}
              </div>
              {warnings(active).length > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[11.5px] font-semibold text-amber">
                  <AlertIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  {warnings(active)
                    .map((x) => x.long)
                    .join(" · ")}
                </p>
              )}
              {canEdit && !active.id.startsWith("up-") && (
                <div className="sm:hidden mt-1.5 flex items-center gap-1">
                  {winnerButton(active, true)}
                  <span className="flex-1" />
                  {deleteButton(active)}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Preview */}
        <section ref={stage} className="min-w-0 rounded-2xl border border-line/10 bg-surface overflow-hidden [&:fullscreen]:overflow-auto [&:fullscreen]:bg-paper">
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 border-b border-line/10">
            <div className="flex items-center rounded-lg bg-surface-2/70 p-0.5 overflow-x-auto no-scrollbar w-full sm:w-auto" role="radiogroup" aria-label="Layout">
              {VIEWS.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)} className={`${seg(view === v.id)} flex-1 sm:flex-none`}>
                  {v.label}
                </button>
              ))}
            </div>
            <div className="flex items-center rounded-lg bg-surface-2/70 p-0.5" role="radiogroup" aria-label="Theme">
              {(["light", "dark", "both"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} disabled={view === "tv"} className={`${seg(theme === t)} capitalize disabled:opacity-40`}>
                  {t}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <button type="button" onClick={toggleCompare} aria-pressed={compare} className={tool(compare)} title="Shortcut: C" aria-label="Compare">
              <GridIcon className="w-4 h-4" />
              <span className="hidden 2xl:inline">Compare</span>
            </button>
            <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 1e9))} className={tool()} title="Shuffle the videos around yours (R)" aria-label="Shuffle">
              <ShuffleIcon className="w-4 h-4" />
              <span className="hidden 2xl:inline">Shuffle</span>
            </button>
            {canFullscreen && (
              <button type="button" onClick={fullscreen} className={tool()} title="Fullscreen (F)" aria-label="Fullscreen">
                <ExpandIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          {!variants.length ? (
            <div className="px-6 py-14 text-center space-y-2">
              <p className="text-[15px] font-semibold">Add your thumbnails to see them on YouTube.</p>
              <p className="text-[13px] text-ink-soft">Each one gets its own title. Add 10 to 15, compare them, then star the best (or up to 3 for an A/B test).</p>
              {canEdit && (
                <button type="button" onClick={() => fileInput.current?.click()} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber text-white h-10 px-4 text-[13.5px] font-bold hover:brightness-110">
                  <PlusIcon className="w-4 h-4" />
                  Add thumbnails
                </button>
              )}
            </div>
          ) : compare ? (
            <div className="p-2 sm:p-3 space-y-3">
              <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                {comparingTest ? (
                  <>
                    <span className="rounded-md bg-amber text-white text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5">A/B test</span>
                    <span className="font-semibold">{testers.map((_, i) => "ABC"[i]).join(" vs ")}</span>
                  </>
                ) : (
                  <span className="font-semibold">Comparing {compareList.length}</span>
                )}
                <span className="hidden sm:inline text-ink-soft">· tick thumbnails to add or remove</span>
                <span className="flex-1" />
                {abOn && !comparingTest && (
                  <button type="button" onClick={compareTest} className="font-semibold text-amber hover:underline">
                    Compare the A/B test
                  </button>
                )}
                <button type="button" onClick={() => setCompare(false)} className="font-semibold text-ink-soft hover:text-ink">
                  Done
                </button>
              </div>
              {compareList.length === 0 ? (
                <p className="py-8 text-center text-[13.5px] text-ink-soft">Tick the thumbnails you want to compare.</p>
              ) : (
                <div className={`grid gap-3 ${compareList.length >= 3 ? "xl:grid-cols-3 md:grid-cols-2" : compareList.length === 2 ? "md:grid-cols-2" : ""}`}>
                  {compareList.map((v) => {
                    const letter = letterOf(v);
                    return (
                      <div key={v.id} className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                          {letter && <span className="rounded bg-amber text-white text-[11px] font-bold px-1.5 py-0.5">{letter}</span>}
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px]">#{variants.indexOf(v) + 1}</span>
                          <span className="truncate">{v.title}</span>
                          {!letter && v.winner && <StarIcon className="w-3.5 h-3.5 text-amber flex-shrink-0" filled />}
                        </div>
                        {themes.map((t) => (
                          <div key={t} className={`rounded-xl overflow-hidden border ${letter ? "border-amber/50" : "border-line/10"}`}>
                            {renderView(v, t)}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-2 sm:p-3 space-y-2">
              {active && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <button type="button" onClick={() => step(-1)} className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2" aria-label="Previous variation">
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  <span className="flex-shrink-0 text-[12px] font-mono text-ink-soft">
                    {activeIndex + 1}/{variants.length}
                  </span>
                  {letterOf(active) ? (
                    <span className="flex-shrink-0 rounded bg-amber text-white text-[11px] font-bold px-1.5 py-0.5">Test {letterOf(active)}</span>
                  ) : active.winner ? (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-amber">
                      <StarIcon className="w-3.5 h-3.5" filled />
                      Winner
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate text-[13px] font-semibold">{active.title}</span>
                  <span className="flex-1" />
                  <button type="button" onClick={() => step(1)} className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2" aria-label="Next variation">
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className={`grid gap-3 ${themes.length === 2 ? "2xl:grid-cols-2" : ""}`}>
                {themes.map((t) => (
                  <div key={t} className="rounded-xl overflow-hidden border border-line/10">
                    {renderView(active, t)}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="hidden lg:block px-3 pb-2.5 text-[11.5px] text-ink-faint">← → switch · R shuffle · F fullscreen · D light/dark · C compare</p>
        </section>
      </div>
    </div>
  );
}
