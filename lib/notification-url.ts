/**
 * Where a notification leads (the bell and push notifications agree).
 * Only paths inside the app: never another site.
 */
export function notificationUrl(n: {
  metadata?: { href?: unknown } | null;
  short_id?: string | null;
  project_id?: string | null;
  stage?: string | null;
}): string | null {
  const href = n.metadata?.href;
  if (typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) return href;
  if (n.short_id) return `/shorts/${n.short_id}`;
  if (n.project_id) return n.stage ? `/videos/${n.project_id}?tab=${n.stage}` : `/videos/${n.project_id}`;
  return null;
}
