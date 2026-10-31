// 1.47.0: what TikTok's review and its Direct Post audit check. TikTok's Content Sharing Guidelines word the post
// screen's notices, ask for PULL_FROM_URL when the file is already on our servers, and keep posts from an unaudited
// app private; the website says only what the TikTok sign-in asks for (the profile, and posting).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PULL_BUCKET, PULL_FOLDER, PULL_INIT_FALLBACK, PULL_KEEP_HOURS, PULL_STATUS_FALLBACK, isPullPath, pullPath, pullPrefix } from "../lib/social/tiktok-pull";
import { SITE_PLATFORMS } from "../lib/site/platforms";
import { FEATURES } from "../lib/site/features";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// --- Where TikTok fetches from ------------------------------------------------------------------------------------------
ok(pullPrefix("https://abcd.supabase.co") === "https://abcd.supabase.co/storage/v1/object/public/tiktok-pull/", "the URL prefix to verify: the project's public address for the bucket");
ok(pullPrefix("https://abcd.supabase.co/") === "https://abcd.supabase.co/storage/v1/object/public/tiktok-pull/", "a trailing slash is fine");
ok(pullPrefix("http://localhost:54321") === null && pullPrefix("") === null && pullPrefix(undefined) === null && pullPrefix("https://x.co/path") === null && pullPrefix("https://x.co?a=1") === null, "only a plain https address (on a laptop: the file is sent as before)");
ok(PULL_BUCKET === "tiktok-pull" && PULL_FOLDER === "v" && PULL_KEEP_HOURS === 6, "the bucket, its folder, how long a copy may stay");
const p = pullPath("11111111-2222-4333-8444-555555555555", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "team/short/v1.MOV", "video/quicktime");
ok(p === "v/11111111-2222-4333-8444-555555555555-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.mov", `a copy's name: ${p}`);
ok(pullPath("a", "b", "file", "video/webm") === "v/a-b.webm" && pullPath("a", "b", "file", "video/mp4") === "v/a-b.mp4" && pullPath("../x", "b/../", "f.mp4", "video/mp4") === "v/x-b.mp4", "its kind of video, and nothing but letters, digits and dashes");
ok(isPullPath(p) && !isPullPath("tiktokAbc123.txt") && !isPullPath("v/../review-videos/x.mp4") && !isPullPath("v/a.mp4") && !isPullPath(null), "only our copies are ever removed (never TikTok's verification file)");
ok(PULL_INIT_FALLBACK.includes("url_ownership_unverified") && PULL_STATUS_FALLBACK.includes("video_pull_failed"), "when TikTok can't use the address, the file is sent instead");

const m = read("supabase/migrations/0126_tiktok_pull.sql");
ok(/values \('tiktok-pull', 'tiktok-pull', true, 4294967296, array\['video\/mp4', 'video\/quicktime', 'video\/webm', 'text\/plain'\]\)/.test(m) && /on conflict \(id\) do update/.test(m), "0126: a public bucket, 4 GB, videos and TikTok's file only, safe twice");
ok(!/create policy/i.test(m), "0126: no rule opens it to anyone signed in");
ok(read("supabase/tests/tiktok-pull.test.sql").includes("FAIL 2: a rule on storage.objects opens tiktok-pull"), "0126's test");

// --- The publisher ----------------------------------------------------------------------------------------------------
const tt = read("lib/social/publishers/tiktok.ts");
ok(/source_info: \{ source: "PULL_FROM_URL", video_url: staged\.url \}/.test(tt), "TikTok fetches the copy (PULL_FROM_URL)");
ok(/storage\.from\("review-videos"\)\.copy\(file\.path, path, \{ destinationBucket: PULL_BUCKET \}\)/.test(tt), "the copy is made inside Supabase (no bytes through the app)");
ok(/if \(!\(e instanceof TikTokApiError && PULL_INIT_FALLBACK\.includes\(e\.code\)\)\) throw e;/.test(tt) && /source: "FILE_UPLOAD"/.test(tt), "address not verified yet: the file is sent, as before");
ok(/st\.source === "pull" && PULL_STATUS_FALLBACK\.includes\(reason\)/.test(tt) && /state: \{ file: true, again: st\.again \?\? 0 \}/.test(tt), "TikTok couldn't download it: the file is sent");
ok((tt.match(/await dropPull\(st\.pullPath\)/g) ?? []).length >= 3, "the copy goes once TikTok has it, gave up, or a new try starts");
ok(/process\.env\.TIKTOK_UPLOAD === "file"/.test(tt), "TIKTOK_UPLOAD=file: always send the file");
ok(/const RETRY = new Set\(\["rate_limit_exceeded", "internal_error"\]\);/.test(tt), "spam-risk refusals aren't retried (TikTok: retrying makes them worse)");
ok(/throw new PublishError\(FAIL\[reason\][^;]*, false, true\);/.test(tt), "a post TikTok failed for good: Try again starts a new one");
ok(read("lib/social/worker.ts").includes('...(err.restart ? { step: "start", state: {}, progress: 0 } : {})'), "the worker starts it over on Try again");
ok(/privacy === "SELF_ONLY"[\s\S]{0,200}Posted as Only me/.test(tt) && /process\.env\.TIKTOK_AUDITED !== "1"/.test(tt) && /until TikTok has audited/i.test(tt), "the note after posting is true: Only me, or private until TikTok's audit");
ok(read("lib/daily-jobs.ts").includes("const tiktokCopies = await cleanupPullCopies()"), "the daily cleanup removes any copy left behind");

// --- The post screen: TikTok's words ------------------------------------------------------------------------------------
// The card (its own file since 1.47.0) and the Posting card around it.
const panel = read("app/(dashboard)/shorts/[id]/tiktok-fields.tsx") + read("app/(dashboard)/shorts/[id]/schedule-panel.tsx");
ok(panel.includes('export const TT_DISCLOSE_NEEDED = "You need to indicate if your content promotes yourself, a third party, or both.";'), "TikTok's words when no kind of commercial content is ticked");
ok(panel.includes('export const TT_BRANDED_NOT_PRIVATE = "Branded content visibility cannot be set to private.";'), "TikTok's words for Only me with branded content");
ok(panel.includes("Your video will be labeled as “Paid partnership”.") && panel.includes("Your video will be labeled as “Promotional content”."), "the label TikTok will show");
ok(/disabled=\{pending \|\| chosen\.length === 0 \|\| disclosureMissing\}/.test(panel) && (panel.match(/disclosureMissing \? TT_DISCLOSE_NEEDED/g) ?? []).length >= 3, "Post now and Schedule stay off until a kind is ticked, and say why on hover");
ok(/const off = o === "SELF_ONLY" && branded;/.test(panel) && /hint: TT_BRANDED_NOT_PRIVATE, title: TT_BRANDED_NOT_PRIVATE/.test(panel), "Only me is off for branded content, with the reason on it");
ok(/privacy: on && s\.privacy === "SELF_ONLY" \? "" : s\.privacy/.test(panel), "ticking branded content while Only me is picked clears it (choose again, no default)");
ok(/Branded Content Policy\s*<\/a>\{" "\}\s*and \{music\}/.test(panel), "the declaration in TikTok's order: Branded Content Policy and Music Usage Confirmation");
ok((panel.match(/<TikTokDeclaration branded=/g) ?? []).length === 2, "the declaration on the card and again right before the button that sends it");
ok(panel.includes('export const TT_PROCESSING = "It may take a few minutes for the video to process and be visible on your profile.";') && (panel.match(/TT_PROCESSING/g) ?? []).length >= 4, "it says TikTok can take a few minutes");
ok(/onRetry=\{askTikTokAgain\}/.test(panel) && /Try again/.test(panel), "an account TikTok won't take a post from right now: stop, and try again later");
ok(/title=\{o\.title\}/.test(read("components/ui/select.tsx")), "a menu option can say why it's off");
const actions = read("app/(dashboard)/shorts/[id]/schedule-actions.ts");
ok(/const CANT_POST_NOW: Record<string, string> = \{/.test(actions) && (actions.match(/CANT_POST_NOW\[e\.code\]/g) ?? []).length >= 4, "the post screen and the checks say 'try again later'");

// --- The website says what the sign-in asks for --------------------------------------------------------------------------
const tiktok = SITE_PLATFORMS.find((x) => x.id === "tiktok")!;
ok(tiktok.numbers === false && /doesn't read your TikTok videos or numbers/.test(tiktok.reads), "TikTok: only the profile's name and picture are read");
ok(SITE_PLATFORMS.filter((x) => x.id !== "tiktok").every((x) => x.numbers), "the others read numbers");
ok(tiktok.posts.some((t) => /fetches the video from a private copy/.test(t)) && tiktok.posts.some((t) => /never adds a watermark/.test(t)), "how the video gets there, and no watermark");
const analytics = FEATURES.find((f) => f.slug === "analytics")!;
ok(!/TikTok,|every TikTok|all four/.test(`${analytics.line} ${analytics.lead} ${analytics.sections.map((s) => s.text).join(" ")}`), "Analytics doesn't claim TikTok's numbers");
ok(!read("components/site/scenes.tsx").includes('label="Views on TikTok"'), "nor does its picture");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("tiktok review: ok");
