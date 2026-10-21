import { lumaOf } from "./wallpapers";

/**
 * How bright a wallpaper's top is, measured in the browser (1.28.0): from
 * the file before it's uploaded, or from a saved one's address (public
 * files answer with CORS headers, so the picture can be read; when it
 * can't, the answer is "unknown" and the theme's own colours stay).
 * The picture is drawn small (48 px wide) and its top 40 % averaged.
 */

const WIDTH = 48;
const WAIT_MS = 6000;

function read(source: CanvasImageSource, w: number, h: number): number | null {
  if (!w || !h) return null;
  const height = Math.max(1, Math.round((WIDTH * h) / w));
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, WIDTH, height);
    return lumaOf(ctx.getImageData(0, 0, WIDTH, height).data, WIDTH, height);
  } catch {
    // A picture from elsewhere without CORS: can't be read.
    return null;
  }
}

function within<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), WAIT_MS))]);
}

function videoFrame(src: string, cross: boolean): Promise<number | null> {
  return within(
    new Promise<number | null>((resolve) => {
      const v = document.createElement("video");
      if (cross) v.crossOrigin = "anonymous";
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      const finish = (val: number | null) => {
        resolve(val);
        v.removeAttribute("src");
        v.load();
      };
      v.onerror = () => finish(null);
      v.onloadeddata = () => {
        const at = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(0.4, v.duration / 10) : 0;
        if (at <= 0) return finish(read(v, v.videoWidth, v.videoHeight));
        v.onseeked = () => finish(read(v, v.videoWidth, v.videoHeight));
        v.currentTime = at;
      };
      v.src = src;
    }),
    null,
  );
}

function picture(src: string, cross: boolean): Promise<number | null> {
  return within(
    new Promise<number | null>((resolve) => {
      const img = new Image();
      if (cross) img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => resolve(read(img, img.naturalWidth, img.naturalHeight));
      img.onerror = () => resolve(null);
      img.src = src;
    }),
    null,
  );
}

/** A file about to be uploaded. */
export async function measureFile(file: Blob, kind: "image" | "video"): Promise<number | null> {
  if (kind === "image" && typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      const v = read(bmp, bmp.width, bmp.height);
      bmp.close();
      if (v !== null) return v;
    } catch {
      /* not decodable this way (some AVIFs, older Safari): below */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return kind === "video" ? await videoFrame(url, false) : await picture(url, false);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A saved wallpaper (one from before 1.28.0, measured once). */
export const measureUrl = (url: string, kind: "image" | "video"): Promise<number | null> => (kind === "video" ? videoFrame(url, true) : picture(url, true));
