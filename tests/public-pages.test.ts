// Brand pages keep the brand colours; link previews carry og:url, og:type and the picture;
// the video-file choices are exactly 1, 2, 3 weeks or 1 month.
import { BRAND_PAGES_RE, isBrandPage, OG_IMAGE, publicMetadata } from "../lib/public-pages";
import { DEFAULT_MEDIA_KEEP_DAYS, dueForCleanup, isMediaKeepDays, MEDIA_KEEP_CHOICES, mediaKeepLabel } from "../lib/media-keep";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

for (const p of ["/", "/login", "/login/", "/status", "/privacy", "/terms", "/data-deletion", "/welcome", "/set-password", "/reset-password"]) ok(isBrandPage(p), `${p} wears the brand colours`);
for (const p of ["/dashboard", "/settings", "/statusx", "/shorts/1", "/developer", "/team"]) ok(!isBrandPage(p), `${p} follows the colour theme`);
ok(BRAND_PAGES_RE.startsWith("^/"), "the pattern is anchored (the first-paint script uses it)");

const env = process.env as Record<string, string | undefined>;
env.FACEBOOK_APP_ID = "1234567890";
const m = publicMetadata("/privacy", "Privacy policy");
const og = m.openGraph as { type?: string; url?: string; images?: { url: string; width: number; height: number }[]; title?: string };
ok(og.type === "website", "og:type website");
ok(og.url === "/privacy", "og:url is the page");
ok(og.title === "Privacy policy · ClipTroop", "og:title has the app name");
ok(og.images?.[0]?.url === OG_IMAGE.url && og.images?.[0]?.width === 1200 && og.images?.[0]?.height === 630, "og:image is the static 1200x630 picture");
ok((m.facebook as { appId?: string } | undefined)?.appId === "1234567890", "fb:app_id from FACEBOOK_APP_ID");
delete env.FACEBOOK_APP_ID;
ok(publicMetadata("/", null).facebook === undefined, "no fb:app_id without FACEBOOK_APP_ID");

ok(MEDIA_KEEP_CHOICES.map((c) => c.days).join() === "7,14,21,30", "1, 2, 3 weeks or 1 month");
ok(DEFAULT_MEDIA_KEEP_DAYS === 14, "2 weeks by default");
ok(isMediaKeepDays(21) && !isMediaKeepDays(2) && !isMediaKeepDays("14"), "only those four numbers");
ok(mediaKeepLabel(30) === "1 month", "labels");
const D = 86_400_000;
const NOW = Date.parse("2026-10-20T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * D).toISOString();
ok(!dueForCleanup([], 14, NOW), "never posted: files stay");
ok(!dueForCleanup([ago(13.9)], 14, NOW), "posted 13.9 days ago, 2 weeks: stays");
ok(dueForCleanup([ago(14)], 14, NOW), "posted 14 days ago, 2 weeks: goes");
ok(!dueForCleanup([ago(20), ago(3)], 7, NOW), "counted from the LAST platform");
ok(dueForCleanup([ago(31), ago(30)], 30, NOW), "1 month after the last platform");
ok(!dueForCleanup(["not a date"], 7, NOW), "bad dates never delete");

if (fails) process.exit(1);
console.log("public pages ok");
