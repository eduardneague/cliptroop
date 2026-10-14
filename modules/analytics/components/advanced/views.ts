/** Advanced's own tabs (1.20.0): one part at a time instead of one long page (`?view=`). */
export const ADV_VIEWS = ["summary", "trends", "best", "retention", "traffic", "audience", "videos"] as const;
export type AdvView = (typeof ADV_VIEWS)[number];
export const ADV_VIEW_LABEL: Record<AdvView, string> = {
  summary: "Summary",
  trends: "Day by day",
  best: "Best performing",
  retention: "Retention",
  traffic: "Traffic",
  audience: "Audience",
  videos: "Videos",
};
export const readAdvView = (v: unknown): AdvView | null => (ADV_VIEWS.includes(v as AdvView) ? (v as AdvView) : null);
