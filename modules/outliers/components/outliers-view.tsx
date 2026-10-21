"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditIcon, RetryIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { startNavProgress } from "@/components/ui/nav-progress";
import { collectNow, exploreNow, randomOutlier } from "@/app/(dashboard)/outliers/actions";
import { compact } from "../lib/filters";
import { FIT_VERSION } from "../lib/fit";
import type { BlockedChannel, ChannelDetail, Folder, Kind, NicheInfo, OutlierSettings, SaveRef, VideoDetail } from "../lib/types";
import { TABS, type TabData, type TabId } from "../lib/view";
import dynamic from "next/dynamic";
import { BTN_MAIN, DiceIcon, GearIcon, ICON_BTN, OutliersIcon, TimeAgo } from "./bits";
import { OutliersProvider, useOutliers } from "./context";
import { NichePicker } from "./niche-picker";
import { shallowParam, ShellNavCtx, type ShellNav, type ShellTarget } from "./shell-nav";
import type { SettingsTab } from "./settings-dialog";
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
  audience: () => import("./tabs/audience-tab"),
  titles: () => import("./tabs/titles-tab"),
  thumbnails: () => import("./tabs/thumbs-tab"),
  saved: () => import("./tabs/saved-tab"),
  video: () => import("./video-panel"),
  channel: () => import("./channel-panel"),
  niche: () => import("./niche-dialog"),
  settings: () => import("./settings-dialog"),
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
const AudienceTab = dynamic(() => CHUNKS.audience().then((m) => m.AudienceTab), { loading: TabLoading });
const TitlesTab = dynamic(() => CHUNKS.titles().then((m) => m.TitlesTab), { loading: TabLoading });
const ThumbsTab = dynamic(() => CHUNKS.thumbnails().then((m) => m.ThumbsTab), { loading: TabLoading });
const SavedTab = dynamic(() => CHUNKS.saved().then((m) => m.SavedTab), { loading: TabLoading });
const VideoPanel = dynamic(() => CHUNKS.video().then((m) => m.VideoPanel));
const ChannelPanel = dynamic(() => CHUNKS.channel().then((m) => m.ChannelPanel));
const NicheDialog = dynamic(() => CHUNKS.niche().then((m) => m.NicheDialog));
const SettingsDialog = dynamic(() => CHUNKS.settings().then((m) => m.SettingsDialog));

/*
 * The Outliers page (1.27.0, 1.29.0): the niche (all the team's, one of
 * them, or an explore niche) in one picker, long videos or Shorts, the tabs,
 * and the video and channel panels over everything. The picker, the switch
 * and the tabs stay at the top while the page scrolls. Moving between tabs
 * keeps the niche and kind; the tab clicked shows as picked at once.
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
  /** The team's own language (a new niche's languages start from it). */
  teamLang: string | null;
  blocked: BlockedChannel[];
  audienceN: number;
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
      blocked={props.blocked}
      initialVideo={props.initialVideoId}
      initialChannel={props.initialChannelId}
    >
      <Shell {...props} />
    </OutliersProvider>
  );
}

type NicheDialogState = { open: boolean; niche: NicheInfo | null };

function Shell(props: OutliersViewProps) {
  const ctx = useOutliers();
  const router = useRouter();
  const toast = useToast();
  const { data } = props;
  const [navigating, startNav] = useTransition();
  const [pending, setPending] = useState<{ tab?: TabId; niche?: string | null; kind?: Kind } | null>(null);
  const [nicheDialog, setNicheDialog] = useState<NicheDialogState>({ open: false, niche: null });
  const [settings, setSettings] = useState<{ open: boolean; tab: SettingsTab }>({ open: false, tab: "alerts" });
  const [rolling, setRolling] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => setPending(null), [data.tab, props.nicheId, props.kind, data]);
  // The panels and dialogs, while the page sits idle (opening a video is the next thing most people do).
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void) => number; cancelIdleCallback?: (h: number) => void };
    const go = () => {
      preload("video");
      preload("channel");
      preload("niche");
      preload("settings");
    };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(go);
      return () => w.cancelIdleCallback?.(h);
    }
    const t = window.setTimeout(go, 2500);
    return () => window.clearTimeout(t);
  }, []);
  // Links from search and elsewhere: ?open=niche (add one), ?open=alerts, ?open=hidden.
  useEffect(() => {
    const open = new URL(window.location.href).searchParams.get("open");
    if (!open) return;
    if (open === "niche" && ctx.canManage) setNicheDialog({ open: true, niche: null });
    if (open === "alerts" || open === "settings") setSettings({ open: true, tab: "alerts" });
    if (open === "hidden") setSettings({ open: true, tab: "hidden" });
    shallowParam("open", null);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(null), 15_000);
    return () => window.clearTimeout(t);
  }, [pending]);
  // The bar's height, for what sticks under it (Search's filters, Saved's folders).
  useLayoutEffect(() => {
    const el = bar.current;
    const root = page.current;
    if (!el || !root || typeof ResizeObserver === "undefined") return;
    const set = () => root.style.setProperty("--ol-bar", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const n = ctx.niche;
  // A niche still collecting its first videos (or an explore niche filling from its channels): the page looks again by itself.
  const filling = !!n && (n.phase === "new" || !n.counts || n.counts.videos < 30) && (n.explore || (!!n.createdAt && Date.now() - Date.parse(n.createdAt) < 40 * 60_000));
  // A team niche being checked again (which channels really belong), after an update or a change.
  const checking = !!n && !n.explore && n.fitV < FIT_VERSION && n.groupN + n.foundN + n.outN > 0;
  const [exploreKicked, setExploreKicked] = useState(false);
  // An explore niche someone opened that's still filling: its channels are read now.
  useEffect(() => {
    setExploreKicked(false);
    if (!n?.explore || (n.counts?.videos ?? 0) >= 400) return;
    let live = true;
    exploreNow(ctx.teamId, n.id)
      .then((r) => live && r.error === undefined && r.started && setExploreKicked(true))
      .catch(() => {});
    return () => {
      live = false;
    };
    // Once per niche opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n?.id]);
  const watching = filling || collecting || checking || exploreKicked;
  useEffect(() => {
    if (!watching) return;
    const looks = [15, 30, 50, 75, 105, 140, 190, 250].map((s) => window.setTimeout(() => router.refresh(), s * 1000));
    const stop = window.setTimeout(() => {
      setCollecting(false);
      setExploreKicked(false);
    }, 260_000);
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
      if (n?.explore) {
        const r = await exploreNow(ctx.teamId, n.id);
        if (r.error !== undefined) return toast.error(r.error);
        setExploreKicked(true);
        toast.success(r.started ? "Collecting this niche now. New videos show up within a few minutes." : "This niche is already being collected. New videos show up within a few minutes.");
        return;
      }
      const r = await collectNow(ctx.teamId, n ? n.id : null);
      if (r.error !== undefined) return toast.error(r.error);
      setCollecting(true);
      toast.success("Collecting in the background. New videos show up within a few minutes.");
    } catch {
      toast.error("Couldn't start collecting. Try again.");
    }
  };

  const tab = pending?.tab ?? data.tab;
  const currentId = pending?.niche !== undefined ? pending.niche : props.nicheId;
  const current = currentId ? [...props.niches, ...props.explore].find((x) => x.id === currentId) ?? null : null;
  const kind = pending?.kind ?? props.kind;
  const summary = n ? (
    <>
      {n.counts && n.counts.videos ? (
        <>
          {!n.explore && n.groupN > 0 && <>{n.groupN} of your channels · </>}
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
    <>All the niches your team follows</>
  ) : (
    <>What&rsquo;s taking off across YouTube while you set up your niche</>
  );

  return (
    <ShellNavCtx.Provider value={navValue}>
      <div ref={page} className="px-4 sm:px-8 xl:px-10 pt-5 sm:pt-8 pb-8 w-full max-w-[1760px] mx-auto" style={{ ["--ol-bar" as string]: "104px" }}>
        <header className="mb-4">
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
              {(ctx.canManage || n?.explore) && (
                <button type="button" onClick={collect} disabled={collecting} className={`${ICON_BTN} h-10 w-10`} title="Collect now: the next channels and videos, in the background">
                  <RetryIcon className={`w-[18px] h-[18px] ${collecting || exploreKicked ? "animate-spin" : ""}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSettings({ open: true, tab: "alerts" })}
                onPointerEnter={() => preload("settings")}
                className={`${ICON_BTN} h-10 w-10`}
                title="Outlier settings: alerts and hidden channels"
                aria-label="Outlier settings"
              >
                <GearIcon className="w-[18px] h-[18px]" />
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
                <p className="mt-1 text-[13px] text-ink-soft max-w-2xl">The channels you watch and a few keywords for what your videos are about. ClipTroop collects their videos and works out what takes off: formats, keywords, titles and ideas, usually within a few minutes.</p>
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
          {n?.explore && (
            <div className="mt-4 rounded-xl border border-violet/25 bg-violet/[0.05] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="min-w-0 flex-1 text-[13px] text-ink-soft">
                <span className="font-semibold text-ink">Exploring {n.name}.</span> Collected for everyone from well-known channels{n.groupN ? ` (${n.groupN} so far)` : ""} and what they&rsquo;re making now.
                {ctx.canManage && " Want it as your own? You get a copy with the same channels and keywords that you can change."}
              </p>
              {ctx.canManage && (
                <button type="button" onClick={() => setNicheDialog({ open: true, niche: n })} className="flex-shrink-0 self-start sm:self-auto inline-flex items-center rounded-lg border border-violet/40 px-3 h-9 text-[13px] font-semibold text-violet hover:bg-violet/10">
                  Use as my niche
                </button>
              )}
            </div>
          )}
          {(watching || checking) && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-blue/25 bg-blue/[0.06] px-4 py-2.5 text-[13px] text-ink-soft" role="status">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-blue/30 border-t-blue animate-spin flex-shrink-0" aria-hidden />
              {checking
                ? `Checking which channels really belong in ${n?.name ?? "this niche"} (language, where they're from, what they post)… this page updates by itself.`
                : filling || exploreKicked
                  ? `Finding channels and videos for ${n?.name ?? "the niche"}… this page updates by itself.`
                  : "Collecting… new videos show up within a few minutes."}
            </div>
          )}
        </header>

        {/* Stays at the top while the page scrolls (phones and computers). */}
        <div ref={bar} data-shell="subbar" className="ol-bar sticky top-14 z-[15] -mx-4 px-4 sm:-mx-8 sm:px-8 xl:-mx-10 xl:px-10 pt-2.5 bg-paper/90 backdrop-blur-md mb-6">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0 flex items-center gap-1.5 flex-1">
              <NichePicker
                niches={props.niches}
                explore={props.explore}
                current={current}
                canManage={ctx.canManage}
                onPick={(id) => go({ niche: id ?? "all" })}
                onAdd={() => setNicheDialog({ open: true, niche: null })}
                onEdit={(x) => setNicheDialog({ open: true, niche: x })}
              />
              {current && !current.explore && ctx.canManage && (
                <button type="button" onClick={() => setNicheDialog({ open: true, niche: current })} onPointerEnter={() => preload("niche")} aria-label={`Change ${current.name}`} title="Change this niche: keywords, channels, languages" className={`${ICON_BTN} h-10 w-10 flex-shrink-0`}>
                  <EditIcon className="w-4 h-4" />
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
          <nav className="relative mt-1.5 flex items-center gap-0.5 border-b border-line/15 overflow-x-auto no-scrollbar -mx-4 px-3 sm:mx-0 sm:px-0" aria-label="Outliers">
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
                  {t.id === "audience" && props.audienceN > 0 && <span className="text-[11.5px] tabular-nums text-ink-faint">{props.audienceN}</span>}
                  <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-[2px] bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={`transition-opacity duration-200 ${pending ? "opacity-50 pointer-events-none" : ""}`} aria-busy={busy || undefined}>
          {data.tab === "home" && <HomeTab data={data} />}
          {data.tab === "search" && <SearchTab data={data} />}
          {data.tab === "ideas" && <IdeasTab data={data} />}
          {data.tab === "formats" && <FormatsTab data={data} />}
          {data.tab === "keywords" && <KeywordsTab data={data} />}
          {data.tab === "channels" && <ChannelsTab data={data} onEditNiche={(x) => setNicheDialog({ open: true, niche: x })} />}
          {data.tab === "audience" && <AudienceTab data={data} />}
          {data.tab === "titles" && <TitlesTab data={data} />}
          {data.tab === "thumbnails" && <ThumbsTab data={data} />}
          {data.tab === "saved" && <SavedTab data={data} />}
        </div>
      </div>

      {ctx.panel?.type === "video" && <VideoPanel id={ctx.panel.id} initial={props.initialVideo && props.initialVideo.video.id === ctx.panel.id ? props.initialVideo : null} />}
      {ctx.panel?.type === "channel" && <ChannelPanel id={ctx.panel.id} initial={props.initialChannel && props.initialChannel.channel.id === ctx.panel.id ? props.initialChannel : null} />}

      <NicheDialog teamId={ctx.teamId} open={nicheDialog.open} niche={nicheDialog.niche} onClose={() => setNicheDialog({ open: false, niche: null })} suggestions={props.suggest} kind={props.kind} teamLang={props.teamLang} />
      <SettingsDialog teamId={ctx.teamId} open={settings.open} tab={settings.tab} onClose={() => setSettings((s) => ({ ...s, open: false }))} settings={props.settings} canEdit={props.isMaster} />
    </ShellNavCtx.Provider>
  );
}
