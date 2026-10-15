/**
 * Where a notification leads (the bell and push notifications agree).
 * Only paths inside the app: never another site.
 *
 * Work on a script goes straight to the script (1.23.0): "you're a scripter
 * on #12" and a long video moving into Script or Research open the editor,
 * not the video's page first.
 */
export function notificationUrl(n: {
  kind?: string | null;
  metadata?: { href?: unknown; roleLabel?: unknown } | null;
  short_id?: string | null;
  project_id?: string | null;
  stage?: string | null;
}): string | null {
  const href = n.metadata?.href;
  if (typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) return href;
  if (n.short_id) return n.metadata?.roleLabel === "scripter" ? `/shorts/${n.short_id}/script` : `/shorts/${n.short_id}`;
  if (n.project_id) {
    if (n.stage === "script") return `/videos/${n.project_id}/script`;
    if (n.stage === "research") return `/videos/${n.project_id}/script?kind=research`;
    return n.stage ? `/videos/${n.project_id}?tab=${n.stage}` : `/videos/${n.project_id}`;
  }
  return null;
}
