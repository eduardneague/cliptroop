import type { Filters, Sort } from "./filters";
import type { ColorStats, FormatStat, KindInsights, NicheModel } from "./insights";
import type { KeywordStat } from "./keywords";
import type { TemplateStat } from "./skeleton";
import type { AudienceData, ChannelRowData, IdeasData, MiniVideo, OutlierVideo, SavedItem, VideoPage } from "./types";

/*
 * The Outliers page's tabs and what each one gets from the server (1.27.0).
 * Shared by the page (server) and the view (browser). Pure.
 */

export type TabId = "home" | "search" | "ideas" | "formats" | "keywords" | "channels" | "audience" | "titles" | "thumbnails" | "saved";

export const TABS: { id: TabId; label: string; short?: string }[] = [
  { id: "home", label: "For you" },
  { id: "search", label: "Search" },
  { id: "ideas", label: "Ideas" },
  { id: "channels", label: "Channels" },
  { id: "audience", label: "Audience" },
  { id: "formats", label: "Formats" },
  { id: "keywords", label: "Keywords" },
  { id: "titles", label: "Title lab" },
  { id: "thumbnails", label: "Thumbnails" },
  { id: "saved", label: "Saved" },
];

const IDS = new Set<string>(TABS.map((t) => t.id));
export const readTab = (v: string | null | undefined): TabId => (v && IDS.has(v) ? (v as TabId) : "home");

export type Period = "week" | "month" | "year";
export const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 365 };
export const readPeriod = (v: string | null | undefined): Period => (v === "week" || v === "year" ? v : "month");

export type ChannelSort = "rate" | "best" | "subs" | "small" | "uploads" | "recent" | "newest";
export const CHANNEL_SORTS: { id: ChannelSort; label: string }[] = [
  { id: "rate", label: "Most outliers" },
  { id: "best", label: "Biggest outlier" },
  { id: "subs", label: "Most subscribers" },
  { id: "small", label: "Smallest first" },
  { id: "uploads", label: "Posts the most" },
  { id: "recent", label: "Posted lately" },
  { id: "newest", label: "Newest channels" },
];
export const readChannelSort = (v: string | null | undefined): ChannelSort => (CHANNEL_SORTS.some((s) => s.id === v) ? (v as ChannelSort) : "rate");

/** What the For you tab shows. */
export type HomeData = {
  tab: "home";
  period: Period;
  /** Too few in the period picked: a longer one is shown instead (null: the one picked). */
  widened: Period | null;
  best: VideoPage;
  rising: OutlierVideo[];
  small: OutlierVideo[];
  tracked: OutlierVideo[];
  formats: FormatStat[];
  keywords: KeywordStat[];
  examples: Record<string, MiniVideo>;
  /** Streamed after the page (ideas need the most). */
  ideas: Promise<IdeasData>;
  /** The same ideas all day (and on the server and in the browser). */
  seed: number;
  year: number;
};

export type SearchData = {
  tab: "search";
  page: VideoPage;
  filters: Filters;
  sort: Sort;
  formatCounts: { id: string; n: number }[];
  langs: [string, number][];
};

export type IdeasTabData = { tab: "ideas"; ideas: IdeasData; lockFormat: string | null; lockTopic: string | null; seed: number; year: number };

export type FormatsData = {
  tab: "formats";
  local: FormatStat[];
  cross: FormatStat[];
  templates: TemplateStat[];
  examples: Record<string, MiniVideo>;
  n: number;
  selected: string | null;
};

export type KeywordsData = { tab: "keywords"; keywords: KeywordStat[]; examples: Record<string, MiniVideo>; n: number; selected: string | null };

/** Which channels the Channels tab lists (1.29.0): the ones that count, the niche's own, found ones that count, found ones left out, tracked, taken out of the niche. */
export type ChannelsOnly = "all" | "group" | "found" | "out" | "tracked" | "hidden";
const ONLY = new Set<string>(["all", "group", "found", "out", "tracked", "hidden"]);
export const readOnly = (v: string | null | undefined): ChannelsOnly => (v && ONLY.has(v) ? (v as ChannelsOnly) : "all");

export type ChannelsData = { tab: "channels"; rows: ChannelRowData[]; total: number; sort: ChannelSort; q: string; only: ChannelsOnly };

export type AudienceTabData = { tab: "audience"; audience: AudienceData; youtube: boolean };

export type TitlesData = { tab: "titles"; local: NicheModel | null; cross: Pick<KindInsights, "formats" | "numbers"> | null; title: string; compare: string[] };

export type ThumbsData = { tab: "thumbnails"; rows: OutlierVideo[]; colors: ColorStats | null; period: Period };

export type SavedData = { tab: "saved"; items: SavedItem[]; folder: string | null };

export type TabData = HomeData | SearchData | IdeasTabData | FormatsData | KeywordsData | ChannelsData | AudienceTabData | TitlesData | ThumbsData | SavedData;
