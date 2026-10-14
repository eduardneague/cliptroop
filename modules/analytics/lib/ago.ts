/** "just now", "4 min ago", "2 h ago", "3 days ago" (from `now`: call it after the first paint, never on the server). */
export function ago(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
