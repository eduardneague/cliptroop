"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { BellIcon, ChevronDownIcon, EditIcon, PlusIcon, RetryIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { startNavProgress } from "@/components/ui/nav-progress";
import { collectNow, randomOutlier } from "@/app/(dashboard)/outliers/actions";
import { compact } from "../lib/filters";
import type { ChannelDetail, Folder, Kind, NicheInfo, OutlierSettings, SaveRef, VideoDetail } from "../lib/types";
import { TABS, type TabData, type TabId } from "../lib/view";
import dynamic from "next/dynamic";
import { BTN_MAIN, DiceIcon, ICON_BTN, NicheDot, OutliersIcon, TimeAgo } from "./bits";
import { OutliersProvider, useOutliers } from "./context";
import { shallowParam, ShellNavCtx, type ShellNav, type ShellTarget } from "./shell-nav";
import { HomeTab } from "./tabs/home-tab";

// For you is in the page's own code; the other tabs, the panels and the dialogs come in their own
// pieces: the one open is in the page, the panels load while the page sits idle, a tab when you
// point at it (or tap it), so the first visit downloads less.
const CHUNKS = {
  search: () => import("./tabs/search-tab"),
  ideas: () => import("./tabs/ideas-tab"),
  formats: () => import("./tabs/formats-tab"),
  keywords: () => import("./tabs/keywords-tab"),
  channels: () => import("./tabs/channels-tab"),
  titles: () => import("./tabs/titles-tab"),
  thumbnails: () => import("./tabs/thumbs-tab"),
  saved: () => import("./tabs/saved-tab"),
  video: () => import("./video-panel"),
  channel: () => import("./channel-panel"),
  niche: () => import("./niche-dialog"),
  alerts: () => import("./alerts-dialog"),
};
const preload = (k: keyof typeof CHUNKS) => void CHUNKS[k]().catch(() => {});
function TabLoading() {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton aspect-video rounded-xl" />
      ))}
    </div>
  );
}
const SearchTab = dynamic(() => CHUNKS.search().then((m) => m.SearchTab), { loading: TabLoading });
const IdeasTab = dynamic(() => CHUNKS.ideas().then((m) => m.IdeasTab), { loading: TabLoading });
const FormatsTab = dynamic(() => CHUNKS.formats().then((m) => m.FormatsTab), { loading: TabLoading });
const KeywordsTab = dynamic(() => CHUNKS.keywords().then((m) => m.KeywordsTab), { loading: TabLoading });
const ChannelsTab = dynamic(() => CHUNKS.channels().then((m) => m.ChannelsTab), { loading: TabLoading });
const TitlesTab = dynamic(() => CHUNKS.titles().then((m) => m.TitlesTab), { loading: TabLoading });
const ThumbsTab = dynamic(() => CHUNKS.thumbnails().then((m) => m.ThumbsTab), { loading: TabLoading });
const SavedTab = dynamic(() => CHUNKS.saved().then((m) => m.SavedTab), { loading: TabLoading });
const VideoPanel = dynamic(() => CHUNKS.video().then((m) => m.VideoPanel));
const ChannelPanel = dynamic(() => CHUNKS.channel().then((m) => m.ChannelPanel));
const NicheDialog = dynamic(() => CHUNKS.niche().then((m) => m.NicheDialog));
const AlertsDialog = dynamic(() => CHUNKS.alerts().then((m) => m.AlertsDialog));

/*
 * The Outliers page (1.27.0): the niche (or every niche, or one of the
 * explore niches), long videos or Shorts, nine tabs, and the video and
 * channel panels over everything. Moving between tabs keeps the niche and
 * kind; the tab clicked shows as picked at once.
 */

export type OutliersViewProps = {
  teamId: string;
  teamName: string;
  niches: NicheInfo[];
  explore: NicheInfo[];
  /** null: every niche. */
  nicheId: string | null;
  kind: Kind;
  canManage: boolean;
  isMaster: boolean;
  folders: Folder[];
  tracked: string[];
  saves: SaveRef[];
  saved: number;
  settings: OutlierSettings;
  access: { youtube: boolean; key: boolean };
  /** Keyword suggestions for a first niche (from the team's own titles). */
  suggest: string[];
  initialVideoId: string | null;
  initialVideo: VideoDetail | null;
  initialChannelId: string | null;
  initialChannel: ChannelDetail | null;
  data: TabData;
};

export function OutliersView(props: OutliersViewProps) {
  const niche = props.nicheId ? [...props.niches, ...props.explore].find((n) => n.id === props.nicheId) ?? null : null;
  return (
    <OutliersProvider
      teamId={props.teamId}
      teamName={props.teamName}
      nicheId={props.nicheId}
      niche={niche}
      niches={props.niches}
      explore={props.explore}
      kind={props.kind}
      canManage={props.canManage}
      isMaster={props.isMaster}
      folders={props.folders}
      tracked={props.tracked}
      saves={props.saves}
      initialVideo={props.initialVideoId}
      initialChannel={props.initialChannelId}
    >
      <Shell {...props} />
    </OutliersProvider>
  );
}

function Shell(props: OutliersViewProps) {
  const ctx = useOutliers();
  const router = useRouter();
  const toast = useToast();
  const { data } = props;
  const [navigating, startNav] = useTransition();
  const [pending, setPending] = useState<{ tab?: TabId; niche?: string | null; kind?: Kind } | null>(null);
  const [nicheDialog, setNicheDialog] = useState<{ open: boolean; niche: NicheInfo | null }>({ open: false, niche: null });
  const [alerts, setAlerts] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [collecting, setCollecting] = useState(false);
  useEffect(() => setPending(null), [data.tab, props.nicheId, props.kind, data]);
  // The panels and dialogs, while the page sits idle (opening a video is the next thing most people do).
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void) => number; cancelIdleCallback?: (h: number) => void };
    const go = () => {
      preload("video");
      preload("channel");
      preload("niche");
      preload("alerts");
    };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(go);
      return () => w.cancelIdleCallback?.(h);
    }
    const t = window.setTimeout(go, 2500);
    return () => window.clearTimeout(t);
  }, []);
  // Links from search and elsewhere: ?open=niche (add one) and ?open=alerts.
  useEffect(() => {
    const open = new URL(window.location.href).searchParams.get("open");
    if (!open) return;
    if (open === "niche" && ctx.canManage) setNicheDialog({ open: true, niche: null });
    if (open === "alerts") setAlerts(true);
    shallowParam("open", null);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(null), 15_000);
    return () => window.clearTimeout(t);
  }, [pending]);

  const nicheParam = props.nicheId ?? "all";
  const href = useCallback(
    (t: ShellTarget) => {
      const q = new URLSearchParams();
      const tab = t.tab ?? data.tab;
      if (tab !== "home") q.set("tab", tab);
      const n = t.niche === undefined ? nicheParam : t.niche ?? "all";
      q.set("niche", n);
      const k = t.kind ?? props.kind;
      if (k === "short") q.set("kind", "short");
      for (const [key, v] of Object.entries(t.params ?? {})) if (v !== null && v !== undefined && v !== "") q.set(key, String(v));
      return `/outliers?${q}`;
    },
    [data.tab, nicheParam, props.kind]
  );
  const go = useCallback(
    (t: ShellTarget, opts?: { replace?: boolean }) => {
      const h = href(t);
      if (t.tab || t.niche !== undefined || t.kind) setPending({ ...(t.tab ? { tab: t.tab } : {}), ...(t.niche !== undefined ? { niche: t.niche } : {}), ...(t.kind ? { kind: t.kind } : {}) });
      startNavProgress(h);
      startNav(() => (opts?.replace ? router.replace(h, { scroll: false }) : router.push(h, { scroll: false })));
    },
    [href, router]
  );
  const busy = navigating || !!pending;
  const navValue = useMemo<ShellNav>(() => ({ href, go, busy }), [href, go, busy]);

  // A niche still collecting its first videos: the page looks again by itself.
  const n = ctx.niche;
  const filling = !!n && !n.explore && (n.phase === "new" || !n.counts || n.counts.videos < 30) && !!n.createdAt && Date.now() - Date.parse(n.createdAt) < 40 * 60_000;
  const watching = filling || collecting;
  useEffect(() => {
    if (!watching) return;
    const looks = [15, 30, 50, 75, 105, 140, 190, 250].map((s) => window.setTimeout(() => router.refresh(), s * 1000));
    const stop = window.setTimeout(() => setCollecting(false), 260_000);
    return () => {
      looks.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(stop);
    };
  }, [watching, router]);

  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    try {
      const r = await randomOutlier(ctx.teamId, ctx.nicheId, ctx.kind);
      if (r.error !== undefined) toast.error(r.error);
      else if (!r.id) toast.error("No outliers here yet.");
      else ctx.openVideo(r.id);
    } catch {
      toast.error("Couldn't pick one. Try again.");
    } finally {
      setRolling(false);
    }
  };
  const collect = async () => {
    try {
      const r = await collectNow(ctx.teamId, ctx.niche && !ctx.niche.explore ? ctx.niche.id : null);
      if (r.error !== undefined) return toast.error(r.error);
      setCollecting(true);
      toast.success("Collecting in the background. New videos show up within a few minutes.");
    } catch {
      toast.error("Couldn't start collecting. Try again.");
    }
  };

  const tab = pending?.tab ?? data.tab;
  const summary = n ? (
    <>
      {n.explore && <span className="text-violet font-semibold">Explore · </span>}
      {n.counts ? (
        <>
          {compact(n.counts.channels)} channels · {compact(n.counts.videos)} videos · {compact(n.counts.outliers)} outliers
        </>
      ) : (
        "Collecting the first videos"
      )}
      {n.crawledAt && (
        <>
          {" "}
          · updated <TimeAgo iso={n.crawledAt} />
        </>
      )}
    </>
  ) : props.niches.length ? (
    <>Every niche your team follows{props.explore.length ? ", plus Explore" : ""}</>
  ) : (
    <>What&rsquo;s taking off across YouTube while you set up your niche</>
  );

  return (
    <ShellNavCtx.Provider value={navValue}>
      <div className="px-4 sm:px-8 xl:px-10 py-5 sm:py-8 w-full max-w-[1760px] mx-auto">
        <header className="mb-5">
          <div className="flex items-start justify-between gap-x-6 gap-y-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5 flex items-center gap-3">
                Outliers
                <OutliersIcon className="w-7 h-7 text-amber hidden sm:block" strokeWidth={1.9} />
              </h1>
              <p className="text-[14px] text-ink-soft">{summary}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={roll} disabled={rolling} className={`${ICON_BTN} sm:w-auto sm:px-3 sm:gap-1.5 h-10 text-[13px] font-semibold`} title="Open a random big outlier">
                <DiceIcon className={`w-[18px] h-[18px] ${rolling ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Random</span>
              </button>
              {ctx.canManage && (
                <button type="button" onClick={collect} disabled={collecting} className={`${ICON_BTN} h-10 w-10`} title="Collect now: the next searches and channels, in the background">
                  <RetryIcon className={`w-[18px] h-[18px] ${collecting ? "animate-spin" : ""}`} />
                </button>
              )}
              <button type="button" onClick={() => setAlerts(true)} className={`${ICON_BTN} h-10 w-10`} title="Outlier alerts">
                <BellIcon className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
          {!props.access.youtube && !props.access.key && (
            <div className="mt-4 rounded-xl border border-amber/30 bg-amber/[0.07] px-4 py-3 text-[13px] text-ink-soft">
              <span className="font-semibold text-ink">Outliers needs a way to read YouTube.</span>{" "}
              {props.isMaster ? (
                <>
                  Connect the team&rsquo;s YouTube channel in{" "}
                  <Link href="/team?tab=accounts" className="font-semibold text-amber hover:underline">
                    Team → Connected accounts
                  </Link>{" "}
                  (or add a YouTube API key; see /setup). Nothing is posted or changed on it.
                </>
              ) : (
                "Ask a master to connect the team's YouTube channel in Team → Connected accounts."
              )}
            </div>
          )}
          {!props.niches.length && (
            <div className="mt-4 rounded-2xl border border-amber/30 bg-amber/[0.06] p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[19px] font-semibold leading-snug">Set up your team&rsquo;s niche</h2>
                <p className="mt-1 text-[13px] text-ink-soft max-w-2xl">
                  A few keywords for what your channel is about. ClipTroop finds the channels making those videos, collects them and works out what takes off: formats, keywords, titles and ideas for you, usually within a few minutes.
                </p>
                {props.suggest.length > 0 && (
                  <p className="mt-2.5 text-[12.5px] text-ink-faint">
                    From your own titles: <span className="text-ink-soft font-semibold">{props.suggest.slice(0, 6).join(", ")}</span>
                  </p>
                )}
              </div>
              {ctx.canManage ? (
                <button type="button" onClick={() => setNicheDialog({ open: true, niche: null })} className={`${BTN_MAIN} h-10 px-5 self-start md:self-auto flex-shrink-0`}>
                  Add your niche
                </button>
              ) : (
                <p className="text-[12.5px] text-ink-faint md:max-w-[14rem]">A master or researcher on your team adds it from here.</p>
              )}
            </div>
          )}
          {watching && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-blue/25 bg-blue/[0.06] px-4 py-2.5 text-[13px] text-ink-soft" role="status">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-blue/30 border-t-blue animate-spin flex-shrink-0" aria-hidden />
              {filling ? `Finding channels and videos for ${n?.name ?? "the niche"}… this page updates by itself.` : "Collecting… new videos show up within a few minutes."}
            </div>
          )}
        </header>

        <NicheBar props={props} pending={pending} setPending={setPending} go={go} href={href} onAdd={() => setNicheDialog({ open: true, niche: null })} onEdit={(x) => setNicheDialog({ open: true, niche: x })} />

        <nav className="relative flex items-center gap-0.5 border-b border-line/15 overflow-x-auto no-scrollbar -mx-4 px-3 sm:mx-0 sm:px-0 mb-6" aria-label="Outliers">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <Link
                key={t.id}
                href={href({ tab: t.id })}
                scroll={false}
                aria-current={on ? "page" : undefined}
                onPointerEnter={() => t.id !== "home" && preload(t.id)}
                onFocus={() => t.id !== "home" && preload(t.id)}
                onTouchStart={() => t.id !== "home" && preload(t.id)}
                onClick={() => {
                  if (on) return;
                  if (t.id !== "home") preload(t.id);
                  setPending({ tab: t.id });
                  startNavProgress(href({ tab: t.id }));
                }}
                className={`relative px-2.5 sm:px-3.5 h-11 inline-flex items-center gap-1.5 text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {t.label}
                {t.id === "saved" && props.saved > 0 && <span className="text-[11.5px] tabular-nums text-ink-faint">{props.saved}</span>}
                <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-[2px] bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
              </Link>
            );
          })}
        </nav>

        <div className={`transition-opacity duration-200 ${pending ? "opacity-50 pointer-events-none" : ""}`} aria-busy={busy || undefined}>
          {data.tab === "home" && <HomeTab data={data} />}
          {data.tab === "search" && <SearchTab data={data} />}
          {data.tab === "ideas" && <IdeasTab data={data} />}
          {data.tab === "formats" && <FormatsTab data={data} />}
          {data.tab === "keywords" && <KeywordsTab data={data} />}
          {data.tab === "channels" && <ChannelsTab data={data} />}
          {data.tab === "titles" && <TitlesTab data={data} />}
          {data.tab === "thumbnails" && <ThumbsTab data={data} />}
          {data.tab === "saved" && <SavedTab data={data} />}
        </div>
      </div>

      {ctx.panel?.type === "video" && <VideoPanel id={ctx.panel.id} initial={props.initialVideo && props.initialVideo.video.id === ctx.panel.id ? props.initialVideo : null} />}
      {ctx.panel?.type === "channel" && <ChannelPanel id={ctx.panel.id} initial={props.initialChannel && props.initialChannel.channel.id === ctx.panel.id ? props.initialChannel : null} />}

      <NicheDialog teamId={ctx.teamId} open={nicheDialog.open} niche={nicheDialog.niche} onClose={() => setNicheDialog({ open: false, niche: null })} suggestions={props.suggest} kind={props.kind} />
      <AlertsDialog teamId={ctx.teamId} open={alerts} onClose={() => setAlerts(false)} settings={props.settings} canEdit={props.isMaster} />
    </ShellNavCtx.Provider>
  );
}

/**
 * The niches: chips on computers (every niche, the team's, an explore one
 * picked, Explore and Add), one button with a menu on phones; long videos or
 * Shorts on the right.
 */
function NicheBar({
  props,
  pending,
  setPending,
  go,
  href,
  onAdd,
  onEdit,
}: {
  props: OutliersViewProps;
  pending: { niche?: string | null; kind?: Kind } | null;
  setPending: (p: { niche?: string | null }) => void;
  go: ShellNav["go"];
  href: ShellNav["href"];
  onAdd: () => void;
  onEdit: (n: NicheInfo) => void;
}) {
  const ctx = useOutliers();
  const [exploreOpen, setExploreOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const exploreRef = useRef<HTMLButtonElement>(null);
  const phoneRef = useRef<HTMLButtonElement>(null);
  const current = pending?.niche !== undefined ? pending.niche : props.nicheId;
  const kind = pending?.kind ?? props.kind;
  const pickedExplore = props.explore.find((e) => e.id === current) ?? null;
  const currentInfo = current ? [...props.niches, ...props.explore].find((x) => x.id === current) ?? null : null;
  const chip = (on: boolean) => `flex-shrink-0 inline-flex items-center gap-2 rounded-lg h-9 px-3 text-[13px] font-semibold border transition-colors ${on ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/35"}`;
  const pick = (id: string | null) => {
    setExploreOpen(false);
    setPhoneOpen(false);
    go({ niche: id ?? "all" });
  };

  const exploreList = (
    <div className="p-1.5 grid sm:grid-cols-2 gap-0.5">
      <p className="sm:col-span-2 px-3 pt-1.5 pb-1 text-[11.5px] font-semibold text-ink-faint">Explore: a little of every corner of YouTube, collected for everyone</p>
      {props.explore.map((e) => (
        <button key={e.id} type="button" role="menuitem" onClick={() => pick(e.id)} className={`flex items-center gap-2.5 rounded-lg px-3 h-10 text-left text-[13px] hover:bg-surface-2 ${current === e.id ? "bg-surface-2 font-semibold" : ""}`}>
          <NicheDot color={e.color} />
          <span className="flex-1 truncate">{e.name}</span>
          {e.counts && <span className="text-[11px] text-ink-faint tabular-nums">{compact(e.counts.videos)}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mb-3 flex items-center gap-2">
      {/* Phones: one button with every niche. */}
      <div className="md:hidden min-w-0 flex-1">
        <button ref={phoneRef} type="button" onClick={() => setPhoneOpen((o) => !o)} aria-haspopup="menu" aria-expanded={phoneOpen} className="w-full inline-flex items-center gap-2 rounded-lg border border-line/15 bg-surface h-10 px-3 text-[13.5px] font-semibold">
          {currentInfo ? <NicheDot color={currentInfo.color} /> : <span className="w-2.5 h-2.5 rounded-[3px] bg-ink" aria-hidden />}
          <span className="flex-1 min-w-0 truncate text-left">{currentInfo ? `${currentInfo.explore ? "Explore: " : ""}${currentInfo.name}` : "Every niche"}</span>
          <ChevronDownIcon className="w-4 h-4 text-ink-faint" />
        </button>
        <AnchoredMenu open={phoneOpen} onClose={() => setPhoneOpen(false)} anchor={phoneRef} label="Niches">
          <div className="p-1.5">
            <button type="button" role="menuitem" onClick={() => pick(null)} className={`w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-left text-[13.5px] hover:bg-surface-2 ${!current ? "bg-surface-2 font-semibold" : ""}`}>
              <span className="w-2.5 h-2.5 rounded-[3px] bg-ink" aria-hidden />
              Every niche
            </button>
            {props.niches.map((x) => (
              <button key={x.id} type="button" role="menuitem" onClick={() => pick(x.id)} className={`w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-left text-[13.5px] hover:bg-surface-2 ${current === x.id ? "bg-surface-2 font-semibold" : ""}`}>
                <NicheDot color={x.color} />
                <span className="flex-1 truncate">{x.name}</span>
                {x.counts && <span className="text-[11px] text-ink-faint tabular-nums">{compact(x.counts.videos)}</span>}
              </button>
            ))}
            {ctx.canManage && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPhoneOpen(false);
                  onAdd();
                }}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-left text-[13.5px] font-semibold text-amber hover:bg-surface-2"
              >
                <PlusIcon className="w-4 h-4" />
                Add a niche
              </button>
            )}
          </div>
          {props.explore.length > 0 && <div className="border-t border-line/10">{exploreList}</div>}
        </AnchoredMenu>
      </div>

      {/* Computers: chips. */}
      <div className="relative hidden md:flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar py-0.5">
        {(props.niches.length > 1 || props.explore.length > 0) && (
          <Link
            href={href({ niche: "all" })}
            scroll={false}
            onClick={() => {
              if (!current) return;
              setPending({ niche: null });
              startNavProgress(href({ niche: "all" }));
            }}
            className={chip(!current)}
          >
            Every niche
          </Link>
        )}
        {props.niches.map((x) => {
          const on = current === x.id;
          return (
            <span key={x.id} className={`${chip(on)} !pr-1 ${on ? "" : "!pr-3"}`}>
              <Link
                href={href({ niche: x.id })}
                scroll={false}
                onClick={() => {
                  if (on) return;
                  setPending({ niche: x.id });
                  startNavProgress(href({ niche: x.id }));
                }}
                className="inline-flex items-center gap-2"
              >
                <NicheDot color={x.color} />
                {x.name}
                {x.counts && <span className={`text-[11px] tabular-nums ${on ? "text-paper/60" : "text-ink-faint"}`}>{compact(x.counts.outliers)}</span>}
              </Link>
              {on && ctx.canManage && (
                <button type="button" onClick={() => onEdit(x)} aria-label={`Change ${x.name}`} title="Change this niche" className="ml-0.5 w-7 h-7 rounded-md flex items-center justify-center text-paper/70 hover:text-paper hover:bg-paper/15">
                  <EditIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          );
        })}
        {pickedExplore && (
          <span className={chip(true)}>
            <NicheDot color={pickedExplore.color} />
            Explore: {pickedExplore.name}
          </span>
        )}
        {props.explore.length > 0 && (
          <>
            <button ref={exploreRef} type="button" onClick={() => setExploreOpen((o) => !o)} aria-haspopup="menu" aria-expanded={exploreOpen} className={chip(false)}>
              Explore
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            <AnchoredMenu open={exploreOpen} onClose={() => setExploreOpen(false)} anchor={exploreRef} width={460} align="left" label="Explore niches">
              {exploreList}
            </AnchoredMenu>
          </>
        )}
        {ctx.canManage && (
          <button type="button" onClick={onAdd} className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-[13px] font-semibold border border-dashed border-line/25 text-ink-soft hover:text-ink hover:border-line/45">
            <PlusIcon className="w-3.5 h-3.5" />
            {props.niches.length ? "Niche" : "Add your niche"}
          </button>
        )}
        {pickedExplore && ctx.canManage && (
          <button type="button" onClick={() => onEdit(pickedExplore)} className="flex-shrink-0 text-[12.5px] font-semibold text-amber hover:underline px-1.5" title="Make a niche of your own from this one">
            Make it ours
          </button>
        )}
      </div>

      <Segmented
        ariaLabel="Long videos or Shorts"
        value={kind}
        onChange={(k) => go({ kind: k })}
        options={[
          { value: "long", label: <span>Long<span className="hidden sm:inline"> videos</span></span> },
          { value: "short", label: "Shorts" },
        ]}
      />
    </div>
  );
}
