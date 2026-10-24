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
  // 1.29.0
  /** Languages its creators speak (null: the team's own; []: any). */
  langs: string[] | null;
  /** Where its creators are from ([]: anywhere). */
  regions: string[];
  /** Only its own channels count. */
  onlyGroup: boolean;
  /** Made-for-kids videos count. */
  kids: boolean;
  /** Its own channels, found ones that count, found ones left out (or not checked yet). */
  groupN: number;
  foundN: number;
  outN: number;
  /** The team's own language, as the server worked it out (null: not known). */
  teamLang: string | null;
  /** Which version of the fit last checked all its channels (below the current one: being checked). */
  fitV: number;
};

export type Folder = { id: string; name: string; color: string; position: number; createdBy: string | null; count: number };
export type OutlierSettings = { alertMin: number; alertTo: "managers" | "everyone" | "off"; watchWords: string[]; digest: boolean };

/** One save of a video or channel: what, in which folder (null: no folder), and the save's id. */
export type SaveRef = { ref: string; folderId: string | null; id: string };

/** A channel the team hid (it shows nowhere in Outliers). */
export type BlockedChannel = { id: string; title: string; avatar: string | null; at: string | null };

export type Overview = {
  niches: NicheInfo[];
  explore: NicheInfo[];
  tracked: string[];
  folders: Folder[];
  saved: number;
  unsorted: number;
  saves: SaveRef[];
  settings: OutlierSettings;
  blocked: BlockedChannel[];
  audienceN: number;
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
  // 1.29.0
  /** Why a found channel doesn't count (null: not checked yet; "ok": it counts). */
  verdict: Verdict | null;
  /** One of the niche's own channels. */
  group: boolean;
  counted: boolean;
  blocked: boolean;
  /** Its videos aren't read yet. */
  pending: boolean;
  mainLang: string | null;
  region: string | null;
};

export type Verdict = "ok" | "topic" | "lang" | "region" | "kids";

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
  blocked: boolean;
  niches: string[];
  /** What it would have earned at the team's own revenue per 1,000 views (only for people who see revenue). */
  earnings: { rpm: number; currency: string; estimate: number } | null;
  /**
   * One of the team's own videos (1.31.8): its numbers from the team's YouTube Analytics, the only place engaged
   * views exist (YouTube gives them to a channel's owner only). Null for everyone else's videos.
   */
  own: { views: number | null; engaged: number | null; avgPct: number | null } | null;
};

/** A video of the team's that a channel's video sent viewers to (1.31.8): which of theirs, and how many views. */
export type AudiencePair = { ours: string; oursTitle: string | null; oursThumb: string | null; from: string; fromTitle: string | null; views: number };

export type ChannelDetail = {
  channel: VideoDetail["channel"];
  videos: { id: string; title: string; views: number | null; likes: number | null; comments: number | null; score: number | null; projected: number | null; publishedAt: string; durationS: number | null; kind: "long" | "short" | "live"; formats: string[]; vph: number | null }[];
  tracked: boolean;
  blocked: boolean;
  saves: { id: string; folderId: string | null }[];
  niches: { id: string; name: string; team: boolean; source: string; relevance: number | null; hidden: boolean; verdict: Verdict | null; group: boolean; counted: boolean }[];
  similar: ChannelRowData[];
  /** How much the team's viewers watch it (null: not in that list); `pairs` (1.31.8): which of its videos sent viewers to which of the team's. */
  audience: { views: number; videos: number; ours: number; pairs: AudiencePair[] } | null;
  /** Its videos aren't read yet (they're being read now). */
  pending: boolean;
};

/** A channel the team's viewers also watch. */
export type AudienceChannel = {
  id: string;
  title: string;
  handle: string | null;
  avatar: string | null;
  subs: number | null;
  country: string | null;
  lang: string | null;
  longMedian: number | null;
  shortMedian: number | null;
  /** Views YouTube sent the team's videos from this channel's, how many of its videos, next to how many of the team's. */
  views: number;
  videos: number;
  ours: number;
  top: string[];
  tracked: boolean;
  /** The team's niches it's one of the own channels of. */
  niches: string[];
};
export type AudienceData = { at: string | null; note: string | null; rows: AudienceChannel[] };

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
