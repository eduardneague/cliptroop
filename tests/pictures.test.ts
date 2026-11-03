// 1.31.3: pictures. Anyone may pick a picture of up to 5 MB (a thumbnail up to 15 MB), everywhere one can be picked;
// each is made as small as it can be where it's shown before it goes up (and a phone photo's hidden data, like where it
// was taken, never goes up); the buckets refuse anything bigger too.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PICTURE_MAX_BYTES, pictureTooBig, sizeText, THUMBNAIL_MAX_BYTES } from "../lib/image/limits";
import { IMAGE_PRESETS, PICTURE_TYPES } from "../lib/image/compress";
import { feedbackFileProblem } from "../lib/feedback";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const MB = 1024 * 1024;

// --- The limits ------------------------------------------------------------------------------------------------------
ok(PICTURE_MAX_BYTES === 5 * MB && THUMBNAIL_MAX_BYTES === 15 * MB, "5 MB, a thumbnail 15 MB");
ok(pictureTooBig({ size: 5 * MB }) === null && pictureTooBig({ size: 15 * MB }, "thumbnail") === null, "exactly the limit is fine");
const msg = pictureTooBig({ name: "beach.jpg", size: 7.3 * MB }) ?? "";
ok(msg === "beach.jpg is 7.3 MB. Pictures can be up to 5 MB.", `what a too big picture says: ${msg}`);
ok(pictureTooBig({ size: 16 * MB }, "thumbnail") === "That picture is 16 MB. Thumbnails can be up to 15 MB.", "and a thumbnail");
ok(pictureTooBig({ size: 5 * MB + 1 }) !== null, "a byte over: refused");
ok(sizeText(820 * 1024) === "820 KB" && sizeText(1.4 * MB) === "1.4 MB", "sizes read well");
ok(![msg, pictureTooBig({ size: 16 * MB }, "thumbnail") ?? ""].some((m) => /[–—]| - /.test(m)), "no dashes in what people read");

// --- Made small --------------------------------------------------------------------------------------------------------
ok(IMAGE_PRESETS.avatar.maxWidth <= 320 && IMAGE_PRESETS.avatar.maxHeight <= 320 && IMAGE_PRESETS.avatar.cover === true, "an avatar: its short side 320 px (shown cropped to a circle, 104 px at most)");
ok(IMAGE_PRESETS.logo.maxWidth <= 256 && IMAGE_PRESETS.logo.preserveAlpha === true && IMAGE_PRESETS.logo.cover === true, "a logo: its short side 256 px, see-through kept");
ok(/const scale = opts\.cover \? Math\.min\(1, Math\.max\(opts\.maxWidth \/ bitmap\.width, opts\.maxHeight \/ bitmap\.height\)\)/.test(read("lib/image/compress.ts")), "cropped to a square: the short side counts");
ok(IMAGE_PRESETS.thumbnail.maxWidth === 1280 && IMAGE_PRESETS.thumbnail.maxHeight === 1280, "a thumbnail: YouTube's 1280 px (either way: a Short's cover is tall)");
ok(IMAGE_PRESETS.attachment.maxWidth <= 1920, "a picture in a comment, script or report: 1920 px at most");
ok(Object.values(IMAGE_PRESETS).every((p) => (p.quality ?? 0.85) <= 0.86), "every preset compresses (quality 0.86 at most)");
const compress = read("lib/image/compress.ts");
ok(/if \(blob\.size >= file\.size && scale === 1 && file\.type !== "image\/jpeg"\) return file;/.test(compress), "a JPEG always goes up redrawn (its hidden data, like where a photo was taken, never does)");
ok(!/background: \{/.test(compress), "no unused preset left");

// --- Every place a picture is picked ------------------------------------------------------------------------------------
const pickers: [string, RegExp][] = [
  ["app/(dashboard)/settings/use-avatar-upload.tsx", /pictureTooBig\(original\)/],
  ["app/set-password/page.tsx", /pictureTooBig\(file\)/],
  ["app/(dashboard)/team/team-logo-uploader.tsx", /pictureTooBig\(original\)/],
  ["app/(dashboard)/videos/[id]/thumbnail-uploader.tsx", /pictureTooBig\(original, "thumbnail"\)/],
  ["modules/studio/components/studio.tsx", /pictureTooBig\(file, "thumbnail"\)/],
  ["modules/scripts/components/use-script-images.ts", /pictureTooBig\(original\)/],
  ["components/ui/mention-input.tsx", /f\.type\.startsWith\("image\/"\) \? pictureTooBig\(f\)/],
  ["modules/scripts/sketch/sketch-studio.tsx", /pictureTooBig\(file\)/],
  ["app/(dashboard)/settings/dashboard-background.tsx", /!lighten && plan\.action === "image" \? pictureTooBig\(original\)/],
  ["lib/feedback.ts", /pictureTooBig\(file\)/],
];
for (const [f, re] of pickers) {
  const s = read(f);
  ok(re.test(s), `${f}: checks the picture's size`);
  ok(!/25 \* 1024 \* 1024/.test(s) || f === "lib/feedback.ts" || f === "components/ui/mention-input.tsx", `${f}: no 25 MB picture limit left`);
}
// Made small before it goes up.
const studio = read("modules/studio/components/studio.tsx");
ok(/const small = await compressImage\(file, IMAGE_PRESETS\.thumbnail\);/.test(studio) && /\.upload\(path, small,/.test(studio), "Thumbnail Studio: the small copy goes up");
ok(/registerVariant\(project\.id, \{ path, width: w, height: h, size: file\.size/.test(studio), "and the checks against YouTube's limits stay about the file you made");
const feedback = read("app/(dashboard)/settings/feedback-form.tsx");
ok(/file = await compressImage\(it\.file, IMAGE_PRESETS\.attachment\);/.test(feedback) && /new Upload\(file, \{/.test(feedback), "a report's pictures go up small");
ok(/type: sentAs\.get\(it\.id\)\?\.type \?\? it\.type, size: sentAs\.get\(it\.id\)\?\.size \?\? it\.file\.size/.test(feedback), "and the report records what went up");
const sketch = read("modules/scripts/sketch/sketch-studio.tsx");
ok(/downscale\(file, 1200\)/.test(sketch) && /c\.toDataURL\("image\/webp", 0\.82\)/.test(sketch), "a picture in a drawing: 1200 px, WebP");

// Reports: a picture up to 5 MB, a video up to 25 MB.
ok(/Pictures can be up to 5 MB/.test(feedbackFileProblem({ name: "shot.png", type: "image/png", size: 6 * MB }) ?? ""), "a report's 6 MB screenshot: refused");
ok(feedbackFileProblem({ name: "clip.mp4", type: "video/mp4", size: 20 * MB }) === null, "a report's 20 MB video: fine");
ok(/Pictures can be up to 5 MB/.test(feedbackFileProblem({ name: "IMG_1.HEIC", type: "", size: 8 * MB }) ?? ""), "a HEIC without a type is a picture too");

// --- The buckets say the same ----------------------------------------------------------------------------------------------
const m = read("supabase/migrations/0104_smaller_pictures.sql");
ok(new RegExp(`set file_size_limit = ${PICTURE_MAX_BYTES}\\s+where id in \\('avatars', 'team-logos', 'script-images'\\)`).test(m), "avatars, logos, script pictures: 5 MB in storage too");
ok(new RegExp(`set file_size_limit = ${THUMBNAIL_MAX_BYTES}\\s+where id = 'thumbnails'`).test(m), "thumbnails: 15 MB in storage too");
const listed = /allowed_mime_types = array\[([^\]]+)\]/.exec(m)?.[1].split(",").map((x) => x.trim().replace(/'/g, "")) ?? [];
ok(JSON.stringify(listed) === JSON.stringify([...PICTURE_TYPES]) && /where id = 'package-thumbs'/.test(m), "Thumbnail Studio: pictures only, 15 MB");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("pictures: all passed");
