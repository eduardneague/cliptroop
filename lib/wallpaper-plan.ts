/**
 * Wallpapers are always made small before they're uploaded (1.29.4): 2 MB at
 * most, so a dashboard or a profile never waits for a big file. Pictures
 * become WebP (sized for a big screen), videos and anything that moves (GIF,
 * animated PNG / WebP / AVIF) become a WebM video, and a video keeps its
 * first 30 seconds. The work happens in the browser
 * (lib/wallpaper-convert.ts); these are the pure parts: what to do with a
 * file, how big the result may be, the bitrate that fits, and the WebM's
 * length (browsers record WebM without it). Shared by the upload and the
 * tests.
 */

/** What's stored, at most (the bucket's own limit too, 0098). */
export const WALL_MAX_BYTES = 2 * 1024 * 1024;
/** What we take in to make smaller. */
export const WALL_INPUT_MAX_BYTES = 200 * 1024 * 1024;
/** A video (or a moving picture) keeps this much. */
export const WALL_MAX_SECONDS = 30;
/** Pictures: the sizes tried, biggest first (sharp on a big screen), and the qualities at each. */
export const WALL_IMAGE_SIZES: readonly (readonly [number, number])[] = [
  [2560, 1600],
  [1920, 1200],
  [1600, 1000],
  [1280, 800],
];
export const WALL_IMAGE_QUALITIES = [0.86, 0.78, 0.7, 0.6, 0.5] as const;

/** The kinds of file we take in (the picker's accept). */
export const WALL_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "video/mp4", "video/webm", "video/quicktime"] as const;

export type WallPlan =
  | { action: "image" }
  | { action: "animated" }
  | { action: "video" }
  | { action: "keep" }
  | { action: "refuse"; problem: string };

const latin1 = new TextDecoder("latin1");
const ascii = (b: Uint8Array, from: number, len: number) => latin1.decode(b.subarray(from, from + len));

/**
 * A GIF's frames and how long one loop lasts (ms), read from its blocks.
 * Delays of 0 or 1 hundredths are shown as 10 by browsers, so they count as
 * 100 ms here too. Null when it isn't a GIF we can read.
 */
export function gifTiming(b: Uint8Array): { frames: number; ms: number } | null {
  if (b.length < 13 || !/^GIF8[79]a$/.test(ascii(b, 0, 6))) return null;
  let pos = 13;
  const packed = b[10];
  if (packed & 0x80) pos += 3 * 2 ** ((packed & 7) + 1);
  let frames = 0;
  let ms = 0;
  let delay = 0;
  const skipBlocks = () => {
    while (pos < b.length) {
      const n = b[pos++];
      if (n === 0) return true;
      pos += n;
    }
    return false;
  };
  while (pos < b.length) {
    const kind = b[pos++];
    if (kind === 0x3b) break;
    if (kind === 0x21) {
      const label = b[pos++];
      if (label === 0xf9 && pos + 4 < b.length) delay = b[pos + 2] | (b[pos + 3] << 8);
      if (!skipBlocks()) break;
    } else if (kind === 0x2c) {
      if (pos + 9 > b.length) break;
      const p = b[pos + 8];
      pos += 9;
      if (p & 0x80) pos += 3 * 2 ** ((p & 7) + 1);
      pos += 1; // LZW minimum code size
      if (!skipBlocks()) break;
      frames++;
      ms += (delay <= 1 ? 10 : delay) * 10;
      delay = 0;
    } else {
      break;
    }
  }
  return frames ? { frames, ms } : null;
}

/** An animated WebP: the VP8X chunk's animation flag. */
export function isAnimatedWebp(b: Uint8Array): boolean {
  return b.length >= 21 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP" && ascii(b, 12, 4) === "VP8X" && (b[20] & 0x02) !== 0;
}

/** An animated AVIF: its file type says "avis" (an image sequence). */
export function isAnimatedAvif(b: Uint8Array): boolean {
  return b.length >= 12 && ascii(b, 4, 4) === "ftyp" && ascii(b, 0, Math.min(b.length, 64)).includes("avis");
}

/** An animated PNG (APNG) has an acTL chunk before its first IDAT. */
export function isAnimatedPngBytes(b: Uint8Array): boolean {
  const s = ascii(b, 0, Math.min(b.length, 64 * 1024));
  const ac = s.indexOf("acTL");
  const idat = s.indexOf("IDAT");
  return ac >= 0 && (idat < 0 || ac < idat);
}

/** What happens to a picked file: `head` is its first bytes (64 KB is plenty; a whole GIF for its length). */
export function planFor(type: string, size: number, head: Uint8Array): WallPlan {
  const t = type.toLowerCase();
  if (!(WALL_INPUT_TYPES as readonly string[]).includes(t)) return { action: "refuse", problem: "Pick a picture (JPG, PNG, WebP, AVIF), a GIF or a video (MP4, WebM, MOV)." };
  if (size > WALL_INPUT_MAX_BYTES) return { action: "refuse", problem: "That file is too big to make smaller here. Pick one under 200 MB." };
  if (t.startsWith("video/")) return t === "video/webm" && size <= WALL_MAX_BYTES ? { action: "keep" } : { action: "video" };
  if (t === "image/gif") return (gifTiming(head)?.frames ?? 1) > 1 ? { action: "animated" } : { action: "image" };
  if (t === "image/png" && isAnimatedPngBytes(head)) return { action: "animated" };
  if (t === "image/webp" && isAnimatedWebp(head)) return { action: "animated" };
  if (t === "image/avif" && isAnimatedAvif(head)) return { action: "animated" };
  return { action: "image" };
}

/** The bitrate (bits a second) a recording of `seconds` may use to land under the limit, with room for the file's own overhead. */
export function bitrateFor(seconds: number, budget = WALL_MAX_BYTES * 0.72): number {
  const s = Math.max(1, Math.min(WALL_MAX_SECONDS, seconds || WALL_MAX_SECONDS));
  return Math.round(Math.max(250_000, Math.min(2_500_000, (budget * 8) / s)));
}

/** A video's size that fits in max × max (never bigger than it is), in even numbers (encoders want them). */
export function fitSize(w: number, h: number, maxW: number, maxH: number): [number, number] {
  if (!(w > 0 && h > 0)) return [Math.min(maxW, 1280) & ~1, Math.min(maxH, 720) & ~1];
  const scale = Math.min(1, maxW / w, maxH / h);
  return [Math.max(2, Math.round(w * scale) & ~1), Math.max(2, Math.round(h * scale) & ~1)];
}

/** The size a video is recorded at: a long one smaller, so its bitrate goes further. */
export const videoBox = (seconds: number): [number, number] => (seconds > 15 ? [1280, 720] : [1920, 1080]);

/** "1.6 MB", "740 KB". */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------
// The WebM's length. MediaRecorder writes a WebM without its duration (and
// with an unknown segment size), so players can't tell how long it is. This
// adds the Duration element to its Info, the way fix-webm-duration does.
// ---------------------------------------------------------------------------

const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;

/** An EBML element ID at `pos` (its leading bits say how long it is). */
function readId(b: Uint8Array, pos: number): { id: number; len: number } | null {
  const first = b[pos];
  if (first === undefined) return null;
  const len = first & 0x80 ? 1 : first & 0x40 ? 2 : first & 0x20 ? 3 : first & 0x10 ? 4 : 0;
  if (!len || pos + len > b.length) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + b[pos + i];
  return { id, len };
}

/** An EBML size at `pos`: its value (null when "unknown", all ones) and how many bytes it takes. */
function readSize(b: Uint8Array, pos: number): { value: number | null; len: number } | null {
  const first = b[pos];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (!(first & (0x80 >> (len - 1)))) len++;
  if (pos + len > b.length) return null;
  let value = first & (0xff >> len);
  let allOnes = value === 0xff >> len;
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[pos + i];
    if (b[pos + i] !== 0xff) allOnes = false;
  }
  return { value: allOnes ? null : value, len };
}

/** An 8-byte EBML size. */
function size8(n: number): Uint8Array {
  const out = new Uint8Array(8);
  out[0] = 0x01;
  let v = n;
  for (let i = 7; i >= 1; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

/**
 * The same WebM with its duration written in (ms of playing time). Its
 * start (the header up to the Info) is `head`, the rest follows unchanged;
 * null when it already has one or isn't a WebM we can read.
 */
export function webmWithDuration(head: Uint8Array, ms: number): { before: Uint8Array; info: Uint8Array; skip: number } | null {
  // EBML header, then the Segment.
  const top = readId(head, 0);
  if (!top || top.id !== 0x1a45dfa3) return null;
  const topSize = readSize(head, top.len);
  if (!topSize || topSize.value === null) return null;
  let pos = top.len + topSize.len + topSize.value;
  const seg = readId(head, pos);
  if (!seg || seg.id !== ID_SEGMENT) return null;
  const segSize = readSize(head, pos + seg.len);
  // A recording's Segment has no size of its own ("unknown"): only then can the Info grow without rewriting it.
  if (!segSize || segSize.value !== null) return null;
  pos += seg.len + segSize.len;
  // The Segment's children, to its Info.
  while (pos < head.length) {
    const el = readId(head, pos);
    if (!el) return null;
    const sz = readSize(head, pos + el.len);
    if (!sz || sz.value === null) return null;
    const bodyAt = pos + el.len + sz.len;
    if (el.id !== ID_INFO) {
      pos = bodyAt + sz.value;
      continue;
    }
    if (bodyAt + sz.value > head.length) return null;
    const body = head.subarray(bodyAt, bodyAt + sz.value);
    // Already has a duration, or no timecode scale to count it in: leave it.
    let scale = 1_000_000;
    let p = 0;
    while (p < body.length) {
      const c = readId(body, p);
      if (!c) return null;
      const cs = readSize(body, p + c.len);
      if (!cs || cs.value === null) return null;
      if (c.id === ID_DURATION) return null;
      if (c.id === ID_TIMECODE_SCALE) {
        let v = 0;
        for (let i = 0; i < cs.value; i++) v = v * 256 + body[p + c.len + cs.len + i];
        if (v > 0) scale = v;
      }
      p += c.len + cs.len + cs.value;
    }
    const duration = new Uint8Array(11);
    duration[0] = 0x44;
    duration[1] = 0x89;
    duration[2] = 0x88; // 8 bytes follow
    new DataView(duration.buffer).setFloat64(3, (ms * 1_000_000) / scale);
    const info = new Uint8Array(4 + 8 + body.length + duration.length);
    info.set([0x15, 0x49, 0xa9, 0x66], 0);
    info.set(size8(body.length + duration.length), 4);
    info.set(body, 12);
    info.set(duration, 12 + body.length);
    return { before: head.subarray(0, pos), info, skip: bodyAt + sz.value };
  }
  return null;
}
