// Wallpapers made small before upload (1.29.4): what happens to each kind of
// file, GIF timing, animated WebP / AVIF / PNG, the bitrate that fits 2 MB,
// sizes, and writing a recorded WebM's length in.
import {
  WALL_MAX_BYTES,
  bitrateFor,
  fitSize,
  gifTiming,
  isAnimatedAvif,
  isAnimatedPngBytes,
  isAnimatedWebp,
  planFor,
  sizeLabel,
  videoBox,
  webmWithDuration,
} from "../lib/wallpaper-plan";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

// A GIF: header, a 2-colour table, two frames (delays 5 and 0 hundredths), the end.
const frame = (delay: number) => [
  0x21, 0xf9, 0x04, 0x00, delay & 0xff, delay >> 8, 0x00, 0x00, // graphic control: the delay
  0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, // image descriptor 1×1, no local table
  0x02, 0x02, 0x44, 0x01, 0x00, // LZW data
];
const gif = bytes("GIF89a", [1, 0, 1, 0, 0x80, 0, 0], [0, 0, 0, 255, 255, 255], frame(5), frame(0), [0x3b]);
const still = bytes("GIF89a", [1, 0, 1, 0, 0x80, 0, 0], [0, 0, 0, 255, 255, 255], frame(0), [0x3b]);
const t = gifTiming(gif);
ok(!!t && t.frames === 2 && t.ms === 150, `a GIF's frames and length: 2, 50 + 100 ms (a delay of 0 shows as 100) (got ${JSON.stringify(t)})`);
ok(gifTiming(still)?.frames === 1, "a GIF with one frame");
ok(gifTiming(bytes("PNG")) === null && gifTiming(bytes("GIF89a", [1, 0, 1, 0])) === null, "not a GIF, or cut short: null");

// Animated WebP (VP8X with the animation flag), AVIF image sequences, APNG.
const webp = (flags: number) => bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [flags, 0, 0, 0]);
ok(isAnimatedWebp(webp(0x02)) && !isAnimatedWebp(webp(0x10)) && !isAnimatedWebp(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")), "animated WebP by its flag");
ok(isAnimatedAvif(bytes([0, 0, 0, 0x20], "ftypavis", [0, 0, 0, 0], "avifmif1")) && !isAnimatedAvif(bytes([0, 0, 0, 0x1c], "ftypavif", [0, 0, 0, 0], "mif1")), "an AVIF image sequence");
ok(isAnimatedPngBytes(bytes([0x89], "PNG....IHDR....acTL....IDAT")) && !isAnimatedPngBytes(bytes([0x89], "PNG....IHDR....IDAT")), "APNG: acTL before IDAT");

// What happens to each file.
ok(planFor("image/jpeg", 9e6, new Uint8Array()).action === "image", "a photo is made small");
ok(planFor("image/png", 3e6, bytes("....IHDR....acTL....IDAT")).action === "animated", "an animated PNG becomes a video");
ok(planFor("image/gif", 5e6, gif).action === "animated" && planFor("image/gif", 5e4, still).action === "image", "a moving GIF becomes a video, a still one a picture");
ok(planFor("image/webp", 4e6, webp(0x02)).action === "animated" && planFor("image/webp", 4e6, webp(0)).action === "image", "WebP by whether it moves");
ok(planFor("video/mp4", 1e6, new Uint8Array()).action === "video" && planFor("video/quicktime", 5e7, new Uint8Array()).action === "video", "every MP4 or MOV becomes a WebM");
ok(planFor("video/webm", 1_500_000, new Uint8Array()).action === "keep" && planFor("video/webm", 5e6, new Uint8Array()).action === "video", "a small WebM stays, a big one is made smaller");
const no = planFor("application/pdf", 10, new Uint8Array());
ok(no.action === "refuse" && /picture/.test(no.problem), "anything else is refused, with what to pick");
const huge = planFor("video/mp4", 300 * 1024 * 1024, new Uint8Array());
ok(huge.action === "refuse" && /200 MB/.test(huge.problem), "over 200 MB is refused");

// Bitrate and size.
ok(bitrateFor(10) * 10 <= WALL_MAX_BYTES * 8 && bitrateFor(30) * 30 <= WALL_MAX_BYTES * 8, "the bitrate fits 2 MB at 10 and 30 seconds");
ok(bitrateFor(1) === 2_500_000 && bitrateFor(300) >= 250_000, "kept between 250 kb/s and 2.5 Mb/s");
ok(JSON.stringify(fitSize(3840, 2160, 1920, 1080)) === "[1920,1080]" && JSON.stringify(fitSize(641, 359, 1920, 1080)) === "[640,358]", "fits the box, never bigger, even numbers");
ok(JSON.stringify(fitSize(0, 0, 1920, 1080)) === "[1280,720]", "an unknown size gets a sensible one");
ok(videoBox(10)[0] === 1920 && videoBox(25)[0] === 1280, "a long video is recorded smaller");
ok(sizeLabel(1_600_000) === "1.5 MB" && sizeLabel(25 * 1024 * 1024) === "25 MB" && sizeLabel(740 * 1024) === "740 KB", "sizes in words");

// A recorded WebM's length: EBML header, a Segment of unknown size, its Info (timecode scale 1 ms), a Cluster.
const ebml = [0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01];
const segment = [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const infoBody = [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40, 0x4d, 0x80, 0x82, 0x68, 0x69]; // TimecodeScale 1,000,000; MuxingApp "hi"
const info = [0x15, 0x49, 0xa9, 0x66, 0x80 | infoBody.length, ...infoBody];
const cluster = [0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xe7, 0x81, 0x00];
const webm = new Uint8Array([...ebml, ...segment, ...info, ...cluster]);
const fixed = webmWithDuration(webm, 12_500);
ok(!!fixed, "a recording's WebM can take its length");
if (fixed) {
  ok(fixed.before.length === ebml.length + segment.length && fixed.skip === ebml.length + segment.length + info.length, "everything before the Info stays, the old Info is replaced");
  const out = new Uint8Array([...fixed.before, ...fixed.info, ...webm.slice(fixed.skip)]);
  // The new Info: its ID, an 8-byte size, the old body, then Duration (0x4489, 8 bytes, a float).
  const at = fixed.before.length;
  ok(out[at] === 0x15 && out[at + 4] === 0x01, "the Info keeps its ID, with an 8-byte size");
  const size = new DataView(out.buffer).getUint32(at + 8);
  ok(size === infoBody.length + 11, `the Info's size counts the duration (got ${size})`);
  const d = at + 12 + infoBody.length;
  ok(out[d] === 0x44 && out[d + 1] === 0x89 && out[d + 2] === 0x88, "a Duration element follows the old body");
  ok(new DataView(out.buffer).getFloat64(d + 3) === 12_500, "12.5 seconds, in milliseconds (the timecode scale)");
  ok(out.slice(-cluster.length).join() === cluster.join(), "the video itself is untouched");
  ok(webmWithDuration(new Uint8Array([...fixed.before, ...fixed.info]), 1000) === null, "a WebM that has its length already stays as it is");
}
const known = new Uint8Array([...ebml, 0x18, 0x53, 0x80, 0x67, 0x80 | (info.length + cluster.length), ...info, ...cluster]);
ok(webmWithDuration(known, 1000) === null, "a Segment with a size of its own is left alone");
ok(webmWithDuration(bytes("not a webm"), 1000) === null, "not a WebM: left alone");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("wallpaper-plan: ok");
