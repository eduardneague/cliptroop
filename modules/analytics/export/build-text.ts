import type { ClaudeExportData } from "../lib/claude-export";
import type { AdvancedData, AdvVideo, Fmt } from "../lib/advanced";
import { METRIC_HELP } from "../lib/advanced-labels";
import { resample } from "../lib/retention";
import { compact, duration } from "../lib/patterns";

/*
 * The text file for Claude (1.16.0): Markdown inside a .txt (Claude reads
 * .txt uploads; the Markdown keeps it tidy). What we'd like Claude to do,
 * what the numbers mean, then each platform: summary, what ClipTroop
 * noticed, retention, traffic, audience, and every video with its numbers,
 * hook and script. Pure: the export dialog builds it in the browser.
 */

const NAME = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" } as const;
/** "filler" → "everyday short"; a long video's types stay ("Hub + Help"). */
export const typeName = (t: string | null) => (t === "filler" ? "everyday short" : t === "sponsorship" ? "sponsored short" : t === "big" ? "big short" : t);
const KIND = { short: "Short", long: "Long video", post: "Post" } as const;

/** The ask, also offered to copy on its own (paste it with the file). */
export function claudePrompt(team: string, platforms: string[]) {
  return [
    `Attached is an export of my video numbers from ClipTroop (the app my team, ${team}, uses to plan and post videos). It covers ${platforms.join(", ")}.`,
    "",
    "Please read all of it, then:",
    "1. Tell me what works and what doesn't on each platform, with examples from my own videos (quote titles and hooks).",
    "2. Look closely at the first 3 seconds: which hooks hold viewers, which lose them, and why.",
    "3. Explain what my best videos have in common, and what my weakest ones do differently (length, topic, title, thumbnail, posting time, retention).",
    "4. Compare the platforms: what does well where, and what I should change per platform.",
    "5. Give me 10 specific ideas to test in my next videos (hooks, titles, formats, lengths), each with how I'll know it worked.",
    "",
    "Be concrete, use my numbers, and say when the evidence is thin. Ask me if you need anything else.",
  ].join("\n");
}

function fmt(f: Fmt, n: number | null, currency: string) {
  if (n === null || !Number.isFinite(n)) return "–";
  switch (f) {
    case "pct":
      return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
    case "seconds":
      return duration(n);
    case "hours":
      return `${n < 10 ? n.toFixed(1) : compact(n)} h`;
    case "money":
      return `${n.toFixed(2)} ${currency}`;
    case "decimal":
      return n.toFixed(2);
    case "int":
      return Math.round(n).toLocaleString("en-US");
    default:
      return Math.abs(n) < 10_000 ? Math.round(n).toLocaleString("en-US") : compact(n);
  }
}

const int = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n).toLocaleString("en-US"));
const pct = (x: number | null | undefined) => (x === null || x === undefined ? null : `${Math.round(x * 100)}%`);
const per1k = (x: number | null, views: number | null) => (x === null || !views ? null : ((x / views) * 1000).toFixed(1));
const md = (s: string) => s.replace(/\s+/g, " ").trim();

/** "Mon 2026-09-01 18:04" in the team's time zone. */
function when(iso: string | null, tz: string) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.weekday} ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function videoBlock(v: AdvVideo, i: number, data: ClaudeExportData, a: AdvancedData): string {
  const out: string[] = [];
  const meta = [KIND[v.kind], v.durationSec ? duration(v.durationSec) : null, v.publishedAt ? `posted ${when(v.publishedAt, data.tz)}` : null, v.ours ? `ClipTroop #${v.ours.number ?? "?"}${v.ours.type ? ` (${typeName(v.ours.type)})` : ""}` : null].filter(Boolean);
  out.push(`#### ${i}. "${md(v.title || "Untitled")}"`);
  out.push(`${meta.join(" · ")}`);
  const nums = [
    v.views !== null ? `${int(v.views)} views` : null,
    v.engagedViews !== null ? `${int(v.engagedViews)} engaged views` : null,
    v.reach !== null ? `reach ${int(v.reach)}` : null,
    v.watchMinutes !== null ? `${fmt("hours", v.watchMinutes / 60, a.currency)} watched` : null,
    v.avgViewSeconds !== null ? `average view ${duration(v.avgViewSeconds)}` : null,
    v.avgViewPct !== null ? `${Math.round(v.avgViewPct)}% watched on average` : null,
    v.skipRate !== null ? `${Math.round(v.skipRate)}% swiped away in the first 3 s` : null,
    v.likes !== null ? `${int(v.likes)} likes (${per1k(v.likes, v.views) ?? "–"} per 1K views)` : null,
    v.comments !== null ? `${int(v.comments)} comments` : null,
    v.shares !== null ? `${int(v.shares)} shares` : null,
    v.saves !== null ? `${int(v.saves)} saves` : null,
    v.reposts !== null ? `${int(v.reposts)} reposts` : null,
    v.subscribersGained !== null ? `+${int(v.subscribersGained)} subscribers` : null,
  ].filter(Boolean);
  if (nums.length) out.push(`- Numbers: ${nums.join(" · ")}`);
  const extra = Object.entries(v.metrics)
    .filter(([k]) => !["shares"].includes(k))
    .map(([k, val]) => `${k.replace(/_/g, " ")} ${int(val)}`);
  if (extra.length) out.push(`- More: ${extra.join(" · ")}`);
  if (v.revenue && data.revenueIncluded) out.push(`- Money: revenue ${fmt("money", v.revenue.revenue, a.currency)} · RPM ${fmt("money", v.revenue.rpm, a.currency)} · CPM ${fmt("money", v.revenue.cpm, a.currency)} · ${int(v.revenue.adImpressions) ?? "–"} ad impressions`);
  if (v.curve && v.retention) {
    const pts = v.curve.length === 51 ? Array.from({ length: 11 }, (_, k) => v.curve![k * 5]) : resample(v.curve.map((y, k, arr) => [k / (arr.length - 1), y ?? 0, null]), 11);
    out.push(
      `- Retention (still watching at 0%, 10% … 100% of the video): ${pts.map((y) => (y === null ? "–" : `${Math.round(y * 100)}`)).join(" · ")}` +
        [
          v.kind === "long" ? (v.retention.at30s !== null ? `; after 30 s: ${pct(v.retention.at30s)}` : "") : v.retention.at3s !== null ? `; after 3 s: ${pct(v.retention.at3s)}` : "",
          v.retention.relative !== null ? `; vs similar videos ${Math.round(v.retention.relative * 100)}/100 (50 = typical)` : "",
          v.retention.biggestDrop ? `; steepest drop around ${Math.round(v.retention.biggestDrop.at * 100)}%` : "",
          v.retention.rewatchPeak ? `; rewatched around ${Math.round(v.retention.rewatchPeak.at * 100)}%` : "",
        ].join("")
    );
  }
  const sp = data.splits[`${v.platform}:${v.id}`];
  if (sp?.traffic.length) {
    const total = sp.traffic.reduce((t, x) => t + x.views, 0);
    out.push(`- Where its views came from: ${sp.traffic.slice(0, 6).map((x) => `${x.label} ${Math.round((x.views / total) * 100)}%`).join(" · ")}`);
  }
  if (sp?.searches.length) out.push(`- Searched to find it: ${sp.searches.slice(0, 8).map((x) => `"${md(x.label)}" (${int(x.views)})`).join(", ")}`);
  if (v.hook) out.push(`- Hook (from our script): "${md(v.hook)}"`);
  const script = v.ours ? data.scripts[`${v.ours.kind === "short" ? "s" : "l"}:${v.ours.id}`] : null;
  if (script && md(script) !== md(v.hook ?? "")) out.push(`- Script:\n\n${script.trim().split("\n").map((l) => `    ${l}`).join("\n")}\n`);
  if (v.url) out.push(`- Link: ${v.url}`);
  return out.join("\n");
}

export function buildClaudeText(data: ClaudeExportData): string {
  const names = data.platforms.map((a) => NAME[a.platform]);
  const L: string[] = [];
  L.push(`# ${data.team}: video analytics for Claude`);
  L.push("");
  L.push(`Exported from ClipTroop on ${when(data.exportedAt, data.tz)} (${data.tz}). Platforms: ${names.join(", ")}. Summary numbers cover ${data.range.from} to ${data.range.to} (${data.range.days} days), next to the ${data.range.days} days before. ${data.which === "range" ? "Videos: the ones published in that range." : data.which === "top" ? "Videos: the most viewed ones." : "Videos: every one ClipTroop has numbers for."}`);
  L.push("");
  L.push("## What I'd like from you");
  L.push("");
  L.push(claudePrompt(data.team, names));
  L.push("");
  L.push("## How to read this file");
  L.push("");
  L.push("- Numbers come from each platform's official API, copied every morning. A video's numbers are its totals so far (they keep growing for weeks), so compare videos of a similar age, or ones older than a week.");
  L.push("- \"Retention\" lists the share of viewers still watching at each tenth of a video (100 = everyone who started; above 100 means people rewatched, which Shorts do).");
  L.push("- \"Hook\" is the opening of our own script for that video, when the video was made in ClipTroop.");
  L.push("- Glossary:");
  for (const [k, name] of [
    ["views", "Views"],
    ["engaged_views", "Engaged views"],
    ["avg_view_pct", "Average % viewed"],
    ["watch_hours", "Watch time"],
    ["hold3s", "Hook hold (after 3 s, or 30 s for long videos)"],
    ["engagement_rate", "Engagement rate"],
    ["skip_rate", "Skipped"],
    ["reach", "Reach"],
    ["subs_net", "Net subscribers"],
    ["rpm", "RPM"],
    ["cpm", "CPM"],
  ])
    L.push(`  - ${name}: ${METRIC_HELP[k]}`);
  L.push("");

  for (const a of data.platforms) {
    const acc = data.accounts[a.platform];
    L.push(`## ${NAME[a.platform]}${acc ? ` (${acc})` : ""}`);
    L.push("");
    if (a.groups.length) {
      L.push(`### Summary, ${data.range.from} to ${data.range.to} (before: the ${data.range.days} days before)`);
      L.push("");
      for (const g of a.groups) {
        L.push(`- ${g.title}: ${g.tiles.map((t) => `${t.label} ${fmt(t.format, t.value, a.currency)}${t.prev !== null && t.good !== "none" ? ` (before ${fmt(t.format, t.prev, a.currency)})` : ""}`).join(" · ")}`);
      }
      L.push("");
    }
    const pats = [a.patterns.short, a.patterns.long].filter((p): p is NonNullable<typeof p> => !!p && p.considered > 0);
    if (pats.length) {
      L.push("### What ClipTroop noticed (simple comparisons of medians, no AI)");
      L.push("");
      for (const p of pats) {
        const label = p.kind === "short" ? (a.platform === "youtube" ? "Shorts" : "Short videos") : "Long videos";
        L.push(`${label}: ${p.considered} compared${p.tooNew ? `, ${p.tooNew} too new to count` : ""}.`);
        if (p.findings.length) for (const f of p.findings) L.push(`- ${f.title}. ${f.detail}${f.strength === "strong" ? " (clear)" : " (a hint, small sample)"}`);
        else L.push(p.considered < p.needed ? "- Not enough videos older than a week yet." : "- Nothing stands out: length, timing, titles and hooks do about the same.");
        if (p.topVsRest) {
          L.push("");
          L.push("| | Top fifth by views | The rest |");
          L.push("|---|---|---|");
          for (const r of p.topVsRest) L.push(`| ${r.label} | ${r.top} | ${r.rest} |`);
        }
        L.push("");
      }
    }
    if (a.retention) {
      const r = a.retention;
      L.push("### Retention, averaged");
      L.push("");
      const line = (label: string, curve: typeof r.shorts, s: typeof r.shortsSummary, n: number) => {
        if (!curve.length || !s) return;
        const tenths = Array.from({ length: 11 }, (_, k) => curve[Math.min(curve.length - 1, Math.round((k / 10) * (curve.length - 1)))][1]);
        const hold = label === "Long videos" ? `after 30 s ${pct(s.at30s) ?? "–"}` : `after 3 s ${pct(s.at3s) ?? "–"}`;
        L.push(`- ${label} (${n} videos): ${tenths.map((y) => Math.round(y * 100)).join(" · ")}; ${hold}${s.relative !== null ? `; vs similar videos ${Math.round(s.relative * 100)}/100` : ""}`);
      };
      line("Shorts", r.shorts, r.shortsSummary, r.counts.shorts);
      line("Long videos", r.long, r.longSummary, r.counts.long);
      L.push("");
    }
    if (a.breakdowns.length) {
      L.push("### Traffic and audience");
      L.push("");
      for (const b of a.breakdowns) {
        const total = b.rows.reduce((t, r) => t + ((b.measure === "views" ? r.views : r.value) ?? 0), 0);
        const items = b.rows.slice(0, b.id === "search_term" ? 15 : 10).map((r) => {
          const v = b.measure === "views" ? r.views : r.value;
          const share = total && !b.percent ? ` (${Math.round(((v ?? 0) / total) * 100)}%)` : "";
          return `${md(r.label)} ${b.percent ? `${(v ?? 0).toFixed(1)}%` : int(v) ?? "–"}${share}`;
        });
        L.push(`- ${b.title} (${b.sub[0].toLowerCase()}${b.sub.slice(1)}): ${items.join(" · ")}`);
      }
      L.push("");
    }
    if (a.videos.length) {
      L.push(`### Every video (${a.videos.length}, newest first)`);
      L.push("");
      const sorted = [...a.videos].sort((x, y) => (y.publishedAt ?? "").localeCompare(x.publishedAt ?? ""));
      sorted.forEach((v, i) => {
        L.push(videoBlock(v, i + 1, data, a));
        L.push("");
      });
    }
  }

  // The same shorts on several platforms, side by side.
  const byShort = new Map<string, { title: string | null; per: Partial<Record<string, number | null>> }>();
  for (const a of data.platforms)
    for (const v of a.videos) {
      if (v.ours?.kind !== "short") continue;
      const cur = byShort.get(v.ours.id) ?? { title: v.title, per: {} };
      cur.per[a.platform] = v.views;
      byShort.set(v.ours.id, cur);
    }
  const multi = [...byShort.values()].filter((x) => Object.keys(x.per).length >= 2);
  if (multi.length && data.platforms.length > 1) {
    const ps = data.platforms.map((a) => a.platform);
    L.push("## The same shorts on each platform (views)");
    L.push("");
    L.push(`| Short | ${ps.map((p) => NAME[p]).join(" | ")} |`);
    L.push(`|---|${ps.map(() => "---").join("|")}|`);
    for (const x of multi.slice(0, 80)) L.push(`| ${md(x.title ?? "Untitled").replace(/\|/g, "/")} | ${ps.map((p) => int(x.per[p] ?? null) ?? "–").join(" | ")} |`);
    L.push("");
  }
  const cross = data.platforms.find((a) => a.patterns.cross)?.patterns.cross;
  if (cross) {
    L.push(`${cross.title}. ${cross.detail}`);
    L.push("");
  }
  L.push("---");
  L.push(`Made by ClipTroop. Days and hours are in ${data.tz} time.`);
  return L.join("\n");
}

/** A safe file name: "viverro-claude-2026-10-11". */
export function exportName(team: string, ext: string, at = new Date()) {
  const slug = team
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "team";
  return `${slug}-for-claude-${at.toISOString().slice(0, 10)}.${ext}`;
}
