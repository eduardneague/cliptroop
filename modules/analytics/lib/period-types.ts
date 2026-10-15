import type { SocialPlatform } from "@/lib/social/providers";
import type { VideoKind } from "./kinds";

/*
 * What each video got in one point of a chart (1.22.0): the shapes the
 * route answers with and the dialog shows, and the number a list is sorted
 * by. Shared by the server (lib/period.ts) and the dialog
 * (components/period-videos.tsx).
 */

export const PERIOD_METRICS = ["views", "watch", "followers", "engagement", "likes", "comments", "shares", "impressions", "ctr", "avgView", "revenue"] as const;
export type PeriodMetric = (typeof PERIOD_METRICS)[number];
export const isPeriodMetric = (v: unknown): v is PeriodMetric => PERIOD_METRICS.includes(v as PeriodMetric);

export type PeriodVideo = {
  platform: SocialPlatform;
  id: string;
  title: string | null;
  thumbnail: string | null;
  url: string | null;
  kind: VideoKind;
  publishedAt: string | null;
  ours: { kind: "short" | "long"; id: string; number: number | null } | null;
  views: number | null;
  watchMinutes: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** Subscribers or followers: gained minus lost where the platform says both. */
  subscribers: number | null;
  impressions: number | null;
  /** Click-through rate, %. */
  ctr: number | null;
  avgViewSeconds: number | null;
  avgViewPct: number | null;
  revenue: number | null;
  /** "day": the platform's own numbers for those days; "change": between two copies; "live": the 10-minute counts. */
  how: "day" | "change" | "live";
};
export type PeriodVideos = {
  /** Days (YYYY-MM-DD), or moments (ISO) for an hour. */
  from: string;
  to: string;
  hourly: boolean;
  metric: PeriodMetric;
  currency: string | null;
  videos: PeriodVideo[];
  notes: string[];
};

/** The number a list is sorted by, for one video. */
export function metricOf(v: PeriodVideo, m: PeriodMetric): number | null {
  switch (m) {
    case "views":
      return v.views;
    case "watch":
      return v.watchMinutes === null ? null : v.watchMinutes / 60;
    case "followers":
      return v.subscribers;
    case "engagement":
      return v.likes === null && v.comments === null && v.shares === null ? null : (v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0);
    case "likes":
      return v.likes;
    case "comments":
      return v.comments;
    case "shares":
      return v.shares;
    case "impressions":
      return v.impressions;
    case "ctr":
      return v.ctr;
    case "avgView":
      return v.avgViewSeconds;
    case "revenue":
      return v.revenue;
  }
}
