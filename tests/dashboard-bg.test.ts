// A dashboard background (1.27.5, lib/dashboard-bg.ts): which files, where they go, how dark.
import { bgExtension, bgFileProblem, bgKind, bgPathFor, clampDim, DASH_BG_ACCEPT, DASH_BG_MAX_BYTES, isAnimatedPng, isOwnBgPath } from "../lib/dashboard-bg";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const YOU = "bbbbbbbb-0000-4000-8000-000000000002";

ok(bgExtension("image/gif") === "gif" && bgExtension("video/webm") === "webm" && bgExtension("IMAGE/JPEG") === "jpg", "pictures, GIFs and videos have an extension");
ok(bgExtension("image/svg+xml") === null && bgExtension("text/html") === null && bgExtension("video/quicktime") === null, "nothing else (an SVG could carry a script; QuickTime doesn't play everywhere)");
ok(DASH_BG_ACCEPT.split(",").length === 7 && DASH_BG_ACCEPT.includes("image/gif"), "the file picker asks for the same seven");
ok(bgKind(`${ME}/1-dusk.webm`) === "video" && bgKind(`${ME}/1-dusk.MP4`) === "video" && bgKind(`${ME}/1-dusk.gif`) === "image", "a video by its name, everything else a picture");

const p = bgPathFor(ME, "My Summer Wallpaper (4K).GIF", "image/gif", 1761000000000);
ok(p === `${ME}/1761000000000-my-summer-wallpaper-4k.gif`, `a storage-safe name in your own folder (got ${p})`);
ok(bgPathFor(ME, "x.mov", "video/quicktime") === null, "an unknown type: nowhere");
ok(bgPathFor(ME, "....", "image/png", 5) === `${ME}/5-background.png`, "a name with nothing left: \"background\"");
ok(isOwnBgPath(p, ME) && !isOwnBgPath(p, YOU), "your own folder only");
ok(!isOwnBgPath(`${ME}/../${YOU}/x.png`, ME) && !isOwnBgPath(`${ME}/sub/x.png`, ME) && !isOwnBgPath(`${ME}/x.html`, ME) && !isOwnBgPath(null, ME), "no climbing out, no folders, no other files");
ok(isOwnBgPath(`${ME.toUpperCase().toLowerCase()}/a.jpeg`, ME) && isOwnBgPath(`${ME}/a.avif`, ME), "jpeg and avif too");

ok(clampDim(55) === 55 && clampDim(-3) === 0 && clampDim(95) === 80 && clampDim(32.6) === 33 && clampDim("40") === 30 && clampDim(NaN) === 30, "darkened 0–80 %, else the default");
ok(bgFileProblem({ type: "image/gif", size: 24 * 1024 * 1024 }) === null, "a 24 MB GIF is fine");
ok(!!bgFileProblem({ type: "image/gif", size: DASH_BG_MAX_BYTES + 1 }) && !!bgFileProblem({ type: "application/pdf", size: 10 }), "too big, or not a picture or video: says why");

const enc = (s: string) => new TextEncoder().encode(s);
ok(isAnimatedPng(enc("\x89PNG....IHDR....acTL....IDAT")) && !isAnimatedPng(enc("\x89PNG....IHDR....IDAT....acTL")) && !isAnimatedPng(enc("\x89PNG....IHDR....IDAT")), "an animated PNG (acTL before the first IDAT) stays as it is");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("dashboard background: all passed");
