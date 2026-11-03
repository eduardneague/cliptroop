import { safeFileName } from "./image/compress";
import {
  WALL_IMAGE_QUALITIES,
  WALL_IMAGE_SIZES,
  WALL_MAX_BYTES,
  WALL_MAX_SECONDS,
  bitrateFor,
  fitSize,
  gifTiming,
  planFor,
  videoBox,
  webmWithDuration,
} from "./wallpaper-plan";

/*
 * Making a wallpaper small in the browser before it's uploaded (1.29.4;
 * the rules are in lib/wallpaper-plan.ts). Pictures are drawn into a canvas
 * and saved as WebP at the first size and quality that fit in 2 MB. Videos
 * and moving pictures are played into a canvas and recorded as WebM
 * (MediaRecorder: it takes as long as the video plays, up to 30 seconds),
 * at the bitrate that fits, then the WebM gets its length written in.
 * Browser only.
 */

export type ConvertPhase = "image" | "video";
export type ConvertProgress = (p: { phase: ConvertPhase; share: number }) => void;
export class ConvertError extends Error {
  constructor(
    public kind: "refused" | "unsupported" | "too-big" | "failed" | "cancelled",
    message: string,
  ) {
    super(message);
  }
}
export type Prepared = { file: File; video: boolean; trimmed: boolean };

const cancelled = () => new ConvertError("cancelled", "Cancelled.");

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), type, quality));

/** Saving a canvas as WebP (JPEG where the browser can't write WebP: it would hand back a PNG). */
async function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await encode(canvas, "image/webp", quality);
  if (webp?.type === "image/webp") return webp;
  return encode(canvas, "image/jpeg", quality);
}

async function shrinkPicture(file: File, onProgress: ConvertProgress, signal?: AbortSignal): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ConvertError("unsupported", "This browser can't open that picture. Try a JPG or PNG.");
  }
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ConvertError("unsupported", "This browser can't make the picture smaller.");
    const steps = WALL_IMAGE_SIZES.length * WALL_IMAGE_QUALITIES.length;
    let step = 0;
    let smallest: Blob | null = null;
    for (const [maxW, maxH] of WALL_IMAGE_SIZES) {
      const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const q of WALL_IMAGE_QUALITIES) {
        if (signal?.aborted) throw cancelled();
        const blob = await toBlob(canvas, q);
        onProgress({ phase: "image", share: ++step / steps });
        if (!blob) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= WALL_MAX_BYTES) {
          // Already small and no bigger than it needs to be: keep the original as it is.
          const fits = bitmap.width <= WALL_IMAGE_SIZES[0][0] && bitmap.height <= WALL_IMAGE_SIZES[0][1];
          if (fits && file.size <= blob.size && /^image\/(jpeg|webp)$/.test(file.type)) return file;
          const ext = blob.type === "image/webp" ? "webp" : "jpg";
          return new File([blob], safeFileName(file.name, ext), { type: blob.type, lastModified: Date.now() });
        }
      }
    }
    throw new ConvertError("too-big", "Couldn't get this picture under 2 MB. Try a smaller one.");
  } finally {
    bitmap.close();
  }
}

/** The best WebM the browser can record (VP9, then VP8), or null. */
function webmType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

/** Records what `draw` paints on the canvas for `seconds`; resolves with the WebM. */
async function record(canvas: HTMLCanvasElement, seconds: number, draw: (t: number) => boolean, onProgress: ConvertProgress, signal?: AbortSignal): Promise<Blob> {
  const type = webmType();
  if (!type) throw new ConvertError("unsupported", "This browser can't make videos smaller. Try Chrome or Firefox.");
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitrateFor(seconds) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  rec.start(500);
  const started = performance.now();
  await new Promise<void>((resolve, reject) => {
    let timer = 0;
    const tick = () => {
      if (signal?.aborted) return reject(cancelled());
      const t = (performance.now() - started) / 1000;
      const more = draw(t) && t < seconds;
      onProgress({ phase: "video", share: Math.min(1, t / seconds) });
      if (!more) return resolve();
      // A timer, not animation frames: it keeps going if the tab is in the background for a moment.
      timer = window.setTimeout(tick, 1000 / 30);
    };
    tick();
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(cancelled());
    });
  }).finally(() => {
    if (rec.state !== "inactive") rec.stop();
  });
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: "video/webm" });
  return withDuration(blob, Math.round(Math.min(seconds, (performance.now() - started) / 1000) * 1000));
}

/** The recording with its length written in (players can tell how long it is). */
async function withDuration(blob: Blob, ms: number): Promise<Blob> {
  try {
    const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
    const fixed = webmWithDuration(head, ms);
    if (!fixed) return blob;
    return new Blob([new Uint8Array(fixed.before), new Uint8Array(fixed.info), blob.slice(fixed.skip)], { type: "video/webm" });
  } catch {
    return blob;
  }
}

function loadVideo(src: string, signal?: AbortSignal): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const timer = window.setTimeout(() => reject(new ConvertError("unsupported", "This browser can't play that video. Try a WebM, or another browser.")), 20_000);
    v.onloadeddata = () => {
      window.clearTimeout(timer);
      resolve(v);
    };
    v.onerror = () => {
      window.clearTimeout(timer);
      reject(new ConvertError("unsupported", "This browser can't play that video. Try a WebM, or another browser."));
    };
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(cancelled());
    });
    v.src = src;
  });
}

async function shrinkVideo(file: File, onProgress: ConvertProgress, signal?: AbortSignal): Promise<{ blob: Blob; trimmed: boolean }> {
  const src = URL.createObjectURL(file);
  try {
    const v = await loadVideo(src, signal);
    const length = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : WALL_MAX_SECONDS;
    const seconds = Math.min(length, WALL_MAX_SECONDS);
    const [w, h] = fitSize(v.videoWidth, v.videoHeight, ...videoBox(seconds));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ConvertError("unsupported", "This browser can't make videos smaller. Try Chrome or Firefox.");
    ctx.drawImage(v, 0, 0, w, h);
    await v.play().catch(() => {
      throw new ConvertError("unsupported", "This browser can't play that video. Try a WebM, or another browser.");
    });
    const blob = await record(
      canvas,
      seconds,
      () => {
        ctx.drawImage(v, 0, 0, w, h);
        return !v.ended;
      },
      onProgress,
      signal,
    ).finally(() => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
    return { blob, trimmed: length > WALL_MAX_SECONDS + 0.5 };
  } finally {
    URL.revokeObjectURL(src);
  }
}

type Frames = { width: number; height: number; at: (t: number) => CanvasImageSource | null; seconds: number; close: () => void };

/** A moving picture's frames: WebCodecs' ImageDecoder where there is one (exact frames and timing), else the picture itself animating. */
async function framesOf(file: File, head: Uint8Array): Promise<Frames> {
  const Decoder = (globalThis as { ImageDecoder?: typeof ImageDecoder }).ImageDecoder;
  if (Decoder && (await Decoder.isTypeSupported(file.type).catch(() => false))) {
    const dec = new Decoder({ data: await file.arrayBuffer(), type: file.type });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack?.frameCount ?? 1;
    const frames: { img: VideoFrame; end: number }[] = [];
    let end = 0;
    for (let i = 0; i < count && end < WALL_MAX_SECONDS * 1000; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      const ms = image.duration ? image.duration / 1000 : 100;
      end += ms < 20 ? 100 : ms;
      frames.push({ img: image, end });
    }
    dec.close();
    const first = frames[0]?.img;
    return {
      width: first?.displayWidth ?? 1,
      height: first?.displayHeight ?? 1,
      seconds: Math.max(1, end / 1000),
      at: (t) => (frames.find((f) => t * 1000 < f.end) ?? frames[frames.length - 1])?.img ?? null,
      close: () => frames.forEach((f) => f.img.close()),
    };
  }
  // No ImageDecoder: let the browser animate it (on the page, too small to see, or it may stand still).
  const url = URL.createObjectURL(file);
  const img = document.createElement("img");
  img.decoding = "sync";
  img.alt = "";
  img.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new ConvertError("unsupported", "This browser can't open that picture."));
    img.src = url;
    document.body.appendChild(img);
  });
  const ms = gifTiming(head)?.ms ?? 6000;
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    seconds: Math.max(1, Math.min(WALL_MAX_SECONDS, ms / 1000)),
    at: () => img,
    close: () => {
      img.remove();
      URL.revokeObjectURL(url);
    },
  };
}

async function shrinkAnimated(file: File, onProgress: ConvertProgress, signal?: AbortSignal): Promise<{ blob: Blob; trimmed: boolean }> {
  const head = new Uint8Array(await file.arrayBuffer());
  const frames = await framesOf(file, head);
  try {
    const seconds = Math.min(frames.seconds, WALL_MAX_SECONDS);
    const [w, h] = fitSize(frames.width, frames.height, ...videoBox(seconds));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ConvertError("unsupported", "This browser can't make videos smaller. Try Chrome or Firefox.");
    const blob = await record(
      canvas,
      seconds,
      (t) => {
        const f = frames.at(t);
        if (f) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(f, 0, 0, w, h);
        }
        return true;
      },
      onProgress,
      signal,
    );
    return { blob, trimmed: frames.seconds > WALL_MAX_SECONDS + 0.5 };
  } finally {
    frames.close();
  }
}

/**
 * A wallpaper made small enough to upload: a WebP picture, or a WebM video
 * (a GIF too), 2 MB at most. A WebM that's already small stays as it is. A
 * moving GIF the browser can't turn into a video stays a GIF when it's
 * already under 2 MB.
 */
export async function prepareWallpaper(file: File, onProgress: ConvertProgress, signal?: AbortSignal): Promise<Prepared> {
  const head = new Uint8Array(await file.slice(0, file.type === "image/gif" ? Math.min(file.size, 8 * 1024 * 1024) : 64 * 1024).arrayBuffer());
  const plan = planFor(file.type, file.size, head);
  if (plan.action === "refuse") throw new ConvertError("refused", plan.problem);
  if (plan.action === "keep") return { file, video: true, trimmed: false };
  if (plan.action === "image") return { file: await shrinkPicture(file, onProgress, signal), video: false, trimmed: false };
  try {
    const { blob, trimmed } = plan.action === "video" ? await shrinkVideo(file, onProgress, signal) : await shrinkAnimated(file, onProgress, signal);
    if (blob.size > WALL_MAX_BYTES) throw new ConvertError("too-big", "Couldn't get it under 2 MB. Try a shorter or smaller one.");
    if (!blob.size) throw new ConvertError("failed", "The video came out empty. Keep this tab open while it's being made, and try again.");
    return { file: new File([blob], safeFileName(file.name, "webm"), { type: "video/webm", lastModified: Date.now() }), video: true, trimmed };
  } catch (e) {
    // A small moving GIF on a browser that can't record video: as it is.
    if (e instanceof ConvertError && e.kind === "unsupported" && plan.action === "animated" && file.type === "image/gif" && file.size <= WALL_MAX_BYTES) {
      return { file, video: false, trimmed: false };
    }
    throw e;
  }
}
