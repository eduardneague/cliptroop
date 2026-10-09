/* Shared by the developer pages (server and browser). */

const UNITS = ["B", "KB", "MB", "GB", "TB"];
/** 1536 → "1.5 KB" (1024s, like Supabase's own pages). */
export function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${UNITS[i]}`;
}

/** 12345 → "12,345". */
export const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);
