// 1.31.8: Outliers, as the owner asked on Oct 24 2026.
//   * The × against the usual it's really measured against: 14M views next to "usual 5.6M" read as 3.3×, which
//     looked wrong (14 ÷ 5.6 = 2.5). The score is views ÷ the median of the channel's videos just before it (4.2M
//     then); the panel and the cards now show that number, and the panel says both when the channel moved since.
//   * A video's panel opens at once on the first click (the page used to go back to its loading screen until the
//     panels' code arrived); each tab, niche and kind starts at the top of the page.
//   * "Your viewers watch it" says which videos: pairs kept per video of yours (once each, at the bigger count),
//     listed in the channel's panel in a box that wraps on a phone.
//   * Engaged views on the team's own videos (YouTube gives them to a channel's owner only).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { channelNumbers, multText, usualsDiffer, usualThen } from "../modules/outliers/lib/scores";
import { audienceRows, AudienceReads, MAX_PAIRS } from "../modules/outliers/lib/audience-pairs";
import { compact } from "../modules/outliers/lib/filters";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// --- The usual a score is measured against ------------------------------------------------------------------------------
// Marques Brownlee's iPhone 17 video (the owner's screenshot): 14M views, 3.3×, "usual 5.6M" (the channel now).
const iphone = { views: 14_000_000, score: 3.3 };
const then = usualThen(iphone);
ok(then !== null && Math.abs(then - 4_242_424) < 2, `the usual it's measured against: 14M ÷ 3.3 = 4.24M (${then})`);
ok(compact(then) === "4.2M" && multText(iphone.score) === "3.3×", `shown as 4.2M and 3.3× (${compact(then)})`);
ok(usualsDiffer(then, 5_600_000), "4.2M then and 5.6M now are far enough apart to say both");
ok(!usualsDiffer(1_000_000, 1_100_000) && !usualsDiffer(null, 5) && !usualsDiffer(5, null), "close ones (or one missing): just one");
// Kinoko's card: 55K views, 30×, "vs 18K usual" (its usual now): it was 1.8K before that video.
ok(compact(usualThen({ views: 55_000, score: 30 })) === "1.8K", "Kinoko's 30× card says vs 1.8K usual");
ok(usualThen({ views: null, score: 3 }) === null && usualThen({ views: 10, score: null }) === null && usualThen({ views: 10, score: 0 }) === null, "no score, no views or a zero score: no usual of its own");

// The score really is views ÷ the median before it, and that median stays when only the views move (the collector
// scales the score with the views between full recounts).
const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000 * 7).toISOString();
const vids = [100, 120, 80, 110, 90, 130, 95, 400].map((views, i) => ({ id: `v${i}`, kind: "long", publishedAt: day(i), views }));
const nums = channelNumbers(vids, Date.UTC(2026, 0, 1));
const s7 = nums.scores.get("v7") ?? null;
ok(s7 !== null && Math.abs(s7 - 400 / 100) < 1e-9, `the 8th video: 400 ÷ the median of the 7 before it (100) = 4× (${s7})`);
ok(usualThen({ views: 400, score: s7 }) === 100, "and its usual then is 100");
const later = { views: 800, score: (s7 ?? 0) * (800 / 400) };
ok(usualThen(later) === 100, "twice the views later: twice the score, the same usual then");
ok(nums.longMedian !== null && nums.longMedian !== 100, `the channel's usual now is another number (${nums.longMedian})`);

// --- Where it shows ---------------------------------------------------------------------------------------------------------
const panel = read("modules/outliers/components/video-panel.tsx");
ok(/const then = usualThen\(v\)/.test(panel) && /sub=\{usual \? `usual \$\{compact\(usual\)\}`/.test(panel), "the video panel's Views tile shows the usual it's measured against");
ok(/function ScoreMath/.test(panel) && /the median views of the \{kind\} the channel posted just before it/.test(panel), "and says how the × is worked out");
// 1.43.0 (the owner: "i dont want to see the mathematical equation, i want to only be able to see it if i like hover over
// an icon there, i'd like the usual views to be in () -> so x its usual (1.5M) above and make the multiplier number
// bigger"): the tile says "× its usual (…)" with an ⓘ, the × is bigger, and the sum shows on hover (or focus) only.
ok(/× its usual\{usual \? <span className="tabular-nums font-medium"> \(\{compact\(usual\)\}\)<\/span> : null\}/.test(panel), "the tile: × its usual (the usual in brackets)");
ok(/tip=\{<ScoreMath /.test(panel) && /<HoverTip/.test(panel), "the sum behind a hover card, not under the tiles");
ok(/text-\[40px\] sm:text-\[44px\]/.test(panel), "and the × bigger");
ok(/usualsDiffer\(then, now\)/.test(panel), "with the usual now too when it moved");
ok(/<BarsChart bars=\{bars\} usual=\{usual\}/.test(panel), "the bars' dashed line is that same usual");
const card = read("modules/outliers/components/video-card.tsx");
ok(/const usual = usualThen\(v\) \?\? v\.channel\.usual/.test(card) && /vs \{compact\(usual\)\} usual/.test(card), "cards: \"55K views vs 1.8K usual\"");
const preview = read("modules/outliers/components/panel-preview.tsx");
ok(/usualThen\(v\)/.test(preview), "and the panel's first picture, before its numbers load");

// --- Engaged views on the team's own videos --------------------------------------------------------------------------------
const queries = read("modules/outliers/lib/queries.ts");
ok(/from\("analytics_content"\)\.select\("views, engaged_views, avg_view_pct"\)/.test(queries), "a video of the team's own: its engaged views from the team's analytics");
ok(/earnings: !own &&/.test(queries), "your own video gets no \"would have earned\" estimate (Analytics has the real number)");
ok(/label="Engaged views"/.test(panel) && /d\.own \?/.test(panel), "the panel shows Engaged views for your own videos");
ok(/YouTube shares engaged views only with a channel's owner/.test(panel), "and says why other channels' videos don't have them");

// --- The panel opens at once -------------------------------------------------------------------------------------------------
const view = read("modules/outliers/components/outliers-view.tsx");
ok(/import \{ PanelFrame \} from "\.\/panel"/.test(view), "the panel's frame is in the page's own code");
ok(/const PanelBody = lazy\(/.test(view) && !/const Panels = dynamic\(/.test(view), "only what's inside comes in its own piece");
ok(/<PanelFrame[^>]*>\s*<Suspense fallback=\{<PanelLoading panel=\{ctx\.panel\} \/>\}>\s*<PanelBody/.test(view), "with what the card knew in its place meanwhile (never the page's loading screen)");
ok(/export function PanelBody/.test(read("modules/outliers/components/panels.tsx")) && !/PanelFrame/.test(read("modules/outliers/components/panels.tsx").replace(/\/\*[\s\S]*?\*\//g, "")), "panels.tsx no longer draws a frame of its own");
const video = read("modules/outliers/components/video-panel.tsx");
ok(/from "\.\/panel-preview"/.test(video) && !/function PreviewBody/.test(video), "the video panel and the stand-in share the same first picture");

// --- Each tab starts at the top -------------------------------------------------------------------------------------------------
ok(/const toTop = \(\) => \{[\s\S]*?window\.scrollTo\(\{ top: 0, left: 0, behavior: "instant" \}\)/.test(view), "back to the top, at once");
ok(/setPending\(\{ tab: t\.id \}\);\s*\/\/[^\n]*\n\s*toTop\(\);/.test(view), "on a tab's click (and under More, which clicks the tab)");
ok(/setPending\(\{ \.\.\.\(t\.tab[\s\S]{0,400}?toTop\(\);/.test(view), "and on another niche or kind");

// --- Which videos "Your viewers watch it" is about ----------------------------------------------------------------------------------
const yt = (n: number) => `vid${String(n).padStart(8, "0")}`; // 11 characters, like a YouTube id
const r = new AudienceReads();
ok(r.empty, "nothing read yet");
// Their video A sent 30 views to our X (the video's own copy since it was posted) and 25 (the last 90 days): the
// two overlap, so 30, not 55.
r.add(yt(1), 30, yt(100));
r.add(yt(1), 25, yt(100));
r.add(yt(1), 7, yt(101));
r.add(yt(2), 5, yt(100));
// The channel-wide list says A sent 40 in all (more than its pairs together): 40.
r.add(yt(1), 40);
// Their video C only shows in the channel-wide list.
r.add(yt(3), 9);
// Not video ids: ignored.
r.add("nope", 999, yt(100));
r.add(yt(4), 3, "bad");
const sent = r.bySource();
ok(!r.empty && sent.size === 4, `four of their videos (${sent.size})`);
ok(sent.get(yt(1))?.ours.get(yt(100)) === 30, "a pair counts once, at its bigger number (30, not 55)");
ok(sent.get(yt(1))?.views === 40, "a video's views: its channel-wide count when that's bigger than its pairs (40 > 37)");
ok(sent.get(yt(2))?.views === 5 && sent.get(yt(3))?.views === 9 && sent.get(yt(3))?.ours.size === 0, "pairs alone, or the channel-wide count alone");
ok(sent.get(yt(4))?.views === 3 && sent.get(yt(4))?.ours.size === 0, "a pair with a broken id of ours counts for the channel only");

const chanOf = new Map([
  [yt(1), "UCtheirs"],
  [yt(2), "UCtheirs"],
  [yt(3), "UCother"],
  [yt(4), "UCours"],
]);
const rows = audienceRows(sent, chanOf, new Set(["UCours"]));
ok(rows.length === 2 && rows[0].channel_id === "UCtheirs" && rows[1].channel_id === "UCother", "one row per channel, most views first, never the team's own");
const theirs = rows[0];
ok(theirs.views === 45 && theirs.videos === 2 && theirs.ours === 2, `45 views from 2 of its videos, next to 2 of ours (${theirs.views}, ${theirs.videos}, ${theirs.ours})`);
ok(JSON.stringify(theirs.pairs) === JSON.stringify([{ ours: yt(100), from: yt(1), views: 30 }, { ours: yt(101), from: yt(1), views: 7 }, { ours: yt(100), from: yt(2), views: 5 }]), `its pairs, most views first: ${JSON.stringify(theirs.pairs)}`);
ok(theirs.top[0] === yt(1), "its video that sent the most first");
ok(rows[1].pairs.length === 0 && rows[1].ours === 0, "a channel only in the channel-wide list: no pairs");
const many = new AudienceReads();
for (let i = 0; i < 20; i++) many.add(yt(500 + i), 100 - i, yt(900 + i));
const big = audienceRows(many.bySource(), new Map(Array.from({ length: 20 }, (_, i) => [yt(500 + i), "UCbig"])), new Set());
ok(big[0].pairs.length === MAX_PAIRS && MAX_PAIRS === 12 && big[0].pairs[0].views === 100, "at most 12 pairs kept (the database allows 12), the biggest");

// The database and the panel.
const sql = read("supabase/migrations/0106_outliers_audience_pairs.sql");
ok(/add column if not exists pairs jsonb not null default '\[\]'::jsonb/.test(sql) && /jsonb_array_length\(pairs\) <= 12/.test(sql), "0106: pairs on outlier_audience, at most 12");
ok(/'pairs', coalesce\(/.test(sql) && /left join analytics_content ac on ac\.team_id = p_team/.test(sql) && /left join yt_videos yv on yv\.id = p\.src/.test(sql), "outliers_channel lists them with both titles");
ok(/if p_team is null or not is_team_member\(p_team\) then/.test(sql) && /grant execute on function outliers_channel\(uuid, text\) to authenticated, service_role/.test(sql), "still only for the team's own people");
ok(/update outlier_settings set audience_at = null/.test(sql), "every team's audience is read again on the next run");
const collector = read("modules/outliers/lib/collector.ts");
ok(/outlier_audience: \["pairs"\]/.test(collector), "a database without 0106 still gets the rest");
ok(/const reads = new AudienceReads\(\)/.test(collector) && /audienceRows\(sent, chanOf, own\)/.test(collector), "the daily read keeps the pairs");
const channel = read("modules/outliers/components/channel-panel.tsx");
ok(/function AudienceNote/.test(channel) && /\/analytics\/video\/youtube\/\$\{p\.ours\}/.test(channel) && /ctx\.openVideo\(p\.from\)/.test(channel) && /href=\{youtubeVideo\(p\.from\)\}/.test(channel), "the channel's panel lists them: yours opens in Analytics, theirs in the panel");
const note = channel.slice(channel.indexOf("function AudienceNote"));
ok(!/\bh-7\b/.test(note) && /flex items-start gap-1\.5/.test(note), "a box that wraps (it had a fixed height, so its words spilled out on a phone)");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("outliers usual, panel and audience: all passed");
