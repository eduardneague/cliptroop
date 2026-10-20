import type { Insights, KindInsights } from "./insights";

/*
 * What the Outliers pages pass around (1.27.0): the database's rows in the
 * app's own shape. Shared by the server (queries.ts) and the browser.
 */

export type Kind = "long" | "short";

export type ChannelLite = { title: string; handle: string | null; avatar: string | null; subs: number | null; usual: number | null; publishedAt: string | null };

export type OutlierVideo = {
  id: string;
  channelId: string;
  title: string;
  publishedAt: string;
  durationS: number | null;
  kind: "long" | "short" | "live";
  views: number | null;
  likes: number | null;
  comments: number | null;
  score: number | null;
  projected: number | null;
  vph: number | null;
  formats: string[];
  lang: string | null;
  colors: string[] | null;
  /** The thumbnail's fingerprint (similar thumbnails). */
  thumbHash: string | null;
  statsAt: string | null;
  channel: ChannelLite;
  /** The channel's videos around this one (views, oldest first) and where this one is. */
  peers: number[] | null;
  peerI: number | null;
};

export type VideoPage = { rows: OutlierVideo[]; total: number };

export type NicheCounts = { videos: number; channels: number; outliers: number } | null;
export type NicheInfo = {
  id: string;
  name: string;
  color: string;
  keywords: string[];
  excludeWords: string[];
  lang: string | null;
  region: string | null;
  kinds: Kind[];
  position: number;
  crawledAt: string | null;
  insightsAt: string | null;
  createdAt: string | null;
  counts: NicheCounts;
  note: string | null;
  phase: string | null;
  explore: boolean;
  slug: string | null;
};

export type Folder = { id: string; name: string; color: string; position: number; createdBy: string | null; count: number };
export type OutlierSettings = { alertMin: number; alertTo: "managers" | "everyone" | "off"; watchWords: string[]; digest: boolean };

/** One save of a video or channel: what, in which folder (null: no folder), and the save's id. */
export type SaveRef = { ref: string; folderId: string | null; id: string };

export type Overview = {
  niches: NicheInfo[];
  explore: NicheInfo[];
  tracked: string[];
  folders: Folder[];
  saved: number;
  unsorted: number;
  saves: SaveRef[];
  settings: OutlierSettings;
};

/** A video in a few words (examples next to formats, keywords, ideas). */
export type MiniVideo = { id: string; title: string; channel: string; channelId: string; avatar: string | null; score: number | null; views: number | null; kind: "long" | "short" | "live"; publishedAt: string; durationS: number | null; tint?: string | null };

export type ChannelRowData = {
  id: string;
  title: string;
  handle: string | null;
  avatar: string | null;
  country: string | null;
  publishedAt: string | null;
  subs: number | null;
  views: number | null;
  videoCount: number | null;
  longMedian: number | null;
  shortMedian: number | null;
  uploadsWeek: number | null;
  lastUploadAt: string | null;
  stored: number;
  outliers: number;
  best: number | null;
  bestVideo: string | null;
  tracked: boolean;
  source: string | null;
  relevance: number | null;
  hidden: boolean;
};

export type VideoDetail = {
  video: OutlierVideo & {
    description: string | null;
    tags: string[] | null;
    category: number | null;
    hd: boolean | null;
    captions: boolean | null;
    licensed: boolean | null;
    kids: boolean | null;
    chapters: number | null;
    bits: number;
    thumbHash: string | null;
    lum: number | null;
    sat: number | null;
    fetchedAt: string | null;
  };
  channel: ChannelRowData & { description: string | null; keywords: string | null; longN: number; shortN: number };
  peers: { id: string; title: string; views: number | null; score: number | null; publishedAt: string }[];
  stats: { at: string; views: number | null; likes: number | null; comments: number | null }[];
  changes: { at: string; field: string; before: string | null; after: string | null; views: number | null }[];
  saves: { id: string; folderId: string | null }[];
  tracked: boolean;
  niches: string[];
  /** What it would have earned at the team's own revenue per 1,000 views (only for people who see revenue). */
  earnings: { rpm: number; currency: string; estimate: number } | null;
};

export type ChannelDetail = {
  channel: VideoDetail["channel"];
  videos: { id: string; title: string; views: number | null; likes: number | null; comments: number | null; score: number | null; projected: number | null; publishedAt: string; durationS: number | null; kind: "long" | "short" | "live"; formats: string[]; vph: number | null }[];
  tracked: boolean;
  saves: { id: string; folderId: string | null }[];
  niches: { id: string; name: string; team: boolean; source: string; relevance: number | null; hidden: boolean }[];
  similar: ChannelRowData[];
};

export type SavedItem = {
  id: string;
  kind: "video" | "idea" | "channel";
  folderId: string | null;
  note: string | null;
  savedAt: string;
  savedBy: { name: string; avatar: string | null } | null;
  projectId: string | null;
  shortId: string | null;
  video: OutlierVideo | null;
  channel: ChannelRowData | null;
  idea: SavedIdea | null;
};

/** An idea as it's saved (and handed to New long video / New short). */
export type SavedIdea = {
  key: string;
  titles: string[];
  hook: string;
  topic: string;
  formatId: string | null;
  type: "Hub" | "Help" | "Hero";
  sources: { id: string; title: string }[];
  niche: string | null;
  kind: Kind;
  why: string[];
};

export type IdeasData = {
  local: KindInsights | null;
  cross: KindInsights | null;
  examples: Record<string, MiniVideo>;
  mine: string[];
  dismissed: string[];
  /** Ideas the team saved (by the idea's key), with the save's id. */
  saved: { key: string; id: string }[];
};

export type { Insights, KindInsights };
