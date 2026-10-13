/**
 * YouTube's "reach" reports (Reporting API, channel_reach_basic_a1, 1.19.0):
 * one CSV per day with each video's thumbnail impressions and click-through
 * rate. Pure (tested in tests/reach.test.ts): lib/reach.ts downloads them.
 *
 *   date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr
 *   20261012,UCx…,abc123,15230,0.0412
 *
 * YouTube calls the CTR a "percentage" computed as clicks ÷ impressions: it
 * comes as a share of 1 (0.0412 = 4.12%). If a report ever sends it out of
 * 100 instead (any value above 1), it's read that way.
 */

export type ReachRow = { day: string; video: string; impressions: number; ctr: number | null };

/** One CSV line into its cells (quotes allowed, "" inside quotes). */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const DATE = /^(\d{4})(\d{2})(\d{2})$/;

/** The rows of one report: impressions per video and day, CTR in % (2 decimals). */
export function parseReachCsv(text: string): ReachRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const head = cells(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const iDate = col("date");
  const iVideo = col("video_id");
  const iImp = col("video_thumbnail_impressions");
  const iCtr = col("video_thumbnail_impressions_ctr");
  if (iDate < 0 || iVideo < 0 || iImp < 0) return [];
  const raw: { day: string; video: string; impressions: number; ctr: number | null }[] = [];
  for (const line of lines.slice(1)) {
    const c = cells(line);
    const m = DATE.exec((c[iDate] ?? "").trim());
    const video = (c[iVideo] ?? "").trim();
    // (An empty cell is unknown, not 0.)
    const cell = (i: number) => {
      const t = i >= 0 ? (c[i] ?? "").trim() : "";
      return t === "" ? NaN : Number(t);
    };
    const impressions = cell(iImp);
    if (!m || !/^[A-Za-z0-9_-]{1,64}$/.test(video) || !Number.isFinite(impressions) || impressions < 0) continue;
    const ctrRaw = cell(iCtr);
    raw.push({ day: `${m[1]}-${m[2]}-${m[3]}`, video, impressions: Math.round(impressions), ctr: Number.isFinite(ctrRaw) && ctrRaw >= 0 ? ctrRaw : null });
  }
  // A share of 1 (the usual), or out of 100 if any value says so.
  const percent = raw.some((r) => r.ctr !== null && r.ctr > 1);
  // The same video and day twice (several channel rows): impressions add, the CTR is weighted.
  const by = new Map<string, { day: string; video: string; impressions: number; clicks: number; known: boolean }>();
  for (const r of raw) {
    const k = `${r.video}|${r.day}`;
    const share = r.ctr === null ? null : percent ? r.ctr / 100 : r.ctr;
    const cur = by.get(k) ?? { day: r.day, video: r.video, impressions: 0, clicks: 0, known: false };
    cur.impressions += r.impressions;
    if (share !== null) {
      cur.clicks += r.impressions * Math.min(1, share);
      cur.known = true;
    }
    by.set(k, cur);
  }
  return [...by.values()].map((r) => ({
    day: r.day,
    video: r.video,
    impressions: r.impressions,
    ctr: r.known && r.impressions > 0 ? Math.round((r.clicks / r.impressions) * 10000) / 100 : r.known ? 0 : null,
  }));
}

/** A day's totals (or a group of videos'): impressions add up, the CTR is weighted by impressions. */
export function sumReach(rows: { impressions: number | null; ctr: number | null }[]): { impressions: number; ctr: number | null } {
  let impressions = 0;
  let clicks = 0;
  let weighted = 0;
  for (const r of rows) {
    if (r.impressions === null || !(r.impressions >= 0)) continue;
    impressions += r.impressions;
    if (r.ctr !== null && Number.isFinite(r.ctr)) {
      clicks += (r.impressions * r.ctr) / 100;
      weighted += r.impressions;
    }
  }
  return { impressions, ctr: weighted > 0 ? Math.round((clicks / weighted) * 10000) / 100 : null };
}
