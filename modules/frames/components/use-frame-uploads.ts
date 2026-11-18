"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage, IMAGE_PRESETS, isPictureType, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { pictureTooBig } from "@/lib/image/limits";
import { addFrames, prepareFrameUploads } from "../actions";
import { hexOf, type FrameGuide } from "../lib/model";

/*
 * New guide frames from pictures (1.54.0): picked, dropped or pasted. Each shows at once (from the device), is made
 * small in the browser (the full picture at 1920 px, a small one at 640 px for the grids, its size and main colour
 * read), goes up through one-time links the server signs for this team, and becomes a frame (numbered in the order
 * they came). A picture that can't go up is said so, and the rest go on.
 */

export type PendingFrame = { key: string; name: string; preview: string; state: "making" | "uploading" | "saving" | "failed" };

const BUCKET = "frame-guides";
const OFFLINE = "Couldn't reach ClipTroop. Check your connection and try again.";
const MAX_AT_ONCE = 40;

const extOf = (type: string) => (type === "image/webp" ? "webp" : type === "image/png" ? "png" : type === "image/gif" ? "gif" : type === "image/avif" ? "avif" : "jpg");

/** A picture's size and main colour (an 8×8 average). */
async function readPicture(file: File): Promise<{ w: number; h: number; tint: string | null }> {
  try {
    const bmp = await createImageBitmap(file);
    const w = bmp.width;
    const h = bmp.height;
    let tint: string | null = null;
    try {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(bmp, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
        }
        const n = d.length / 4;
        tint = hexOf(r / n, g / n, b / n);
      }
    } catch {
      /* a picture the canvas can't read: no tint */
    }
    bmp.close();
    return { w, h, tint };
  } catch {
    return { w: 1920, h: 1080, tint: null };
  }
}

/** One at a time per lane (compressing is heavy: two lanes keep the page smooth). */
async function lanes<T, R>(items: T[], n: number, f: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await f(items[i], i);
      }
    })
  );
  return out;
}

export function useFrameUploads({ teamId, onError }: { teamId: string; onError: (message: string) => void }) {
  const [pending, setPending] = useState<PendingFrame[]>([]);
  const errRef = useRef(onError);
  errRef.current = onError;
  const blobs = useRef(new Set<string>());
  useEffect(
    () => () => {
      for (const u of blobs.current) URL.revokeObjectURL(u);
    },
    []
  );

  /** Pictures into a collection; the new frames (oldest first), or [] when none could go up. */
  const add = useCallback(
    async (input: File[], collectionId: string): Promise<FrameGuide[]> => {
      const pictures = input.filter((f) => f.type.startsWith("image/"));
      if (!pictures.length) {
        if (input.length) errRef.current("Only pictures can be frame guides (a screenshot, a PNG, a JPEG…).");
        return [];
      }
      const fine = pictures.filter((f) => {
        const big = pictureTooBig(f);
        if (big) errRef.current(big);
        return !big;
      });
      if (pictures.length > MAX_AT_ONCE) errRef.current(`${MAX_AT_ONCE} at a time: the first ${MAX_AT_ONCE} are going in.`);
      const files = fine.slice(0, MAX_AT_ONCE);
      if (!files.length) return [];
      const batch = files.map((f, i) => {
        const preview = URL.createObjectURL(f);
        blobs.current.add(preview);
        return { key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, preview, state: "making" as const };
      });
      setPending((p) => [...batch, ...p]);
      const setState = (keys: string[], state: PendingFrame["state"]) => setPending((p) => p.map((x) => (keys.includes(x.key) ? { ...x, state } : x)));
      const finish = (keys: string[]) => {
        setPending((p) => p.filter((x) => !keys.includes(x.key)));
        for (const b of batch) if (keys.includes(b.key)) setTimeout(() => {
          URL.revokeObjectURL(b.preview);
          blobs.current.delete(b.preview);
        }, 4000);
      };

      // 1. Made small, in the browser.
      const made = await lanes(files, 2, async (original) => {
        try {
          const full = await compressImage(original, IMAGE_PRESETS.attachment);
          if (!isPictureType(full.type)) return null;
          const gif = full.type === "image/gif";
          const small = gif ? null : await compressImage(full, IMAGE_PRESETS.frameThumb);
          const info = await readPicture(small ?? full);
          const size = small ? await readPicture(full) : info;
          return { full, small: small && isPictureType(small.type) ? small : null, w: size.w, h: size.h, tint: info.tint };
        } catch {
          return null;
        }
      });
      const ready = batch.map((b, i) => ({ b, m: made[i], name: files[i].name })).filter((x) => {
        if (!x.m) errRef.current(`${x.name || "That picture"} can't be read here. Try a PNG or a JPEG.`);
        return !!x.m;
      });
      const failedKeys = batch.filter((b) => !ready.some((r) => r.b.key === b.key)).map((b) => b.key);
      if (failedKeys.length) finish(failedKeys);
      if (!ready.length) return [];
      const keys = ready.map((r) => r.b.key);
      setState(keys, "uploading");

      // 2. Where they go, and up.
      const target = await prepareFrameUploads(teamId, ready.map((r) => extOf(r.m!.full.type))).catch(() => ({ error: OFFLINE }) as const);
      if (target.error !== undefined) {
        errRef.current(target.error);
        finish(keys);
        return [];
      }
      const bucket = createClient().storage.from(BUCKET);
      const sent = await lanes(ready, 3, async (r, i) => {
        const t = target.items[i];
        const m = r.m!;
        const [full, small] = await Promise.all([
          bucket.uploadToSignedUrl(t.full.path, t.full.token, m.full, { contentType: m.full.type, cacheControl: UPLOAD_CACHE_CONTROL }),
          m.small ? bucket.uploadToSignedUrl(t.small.path, t.small.token, m.small, { contentType: m.small.type, cacheControl: UPLOAD_CACHE_CONTROL }) : Promise.resolve({ error: null }),
        ]);
        if (full.error) return null;
        return { id: t.id, path: t.full.path, thumb: m.small && !small.error ? t.small.path : null, w: m.w, h: m.h, tint: m.tint, title: "" };
      });
      const up = sent.filter((x): x is NonNullable<typeof x> => !!x);
      if (up.length < sent.length) errRef.current(up.length ? `${sent.length - up.length} of them couldn't go up. Try those again.` : "Couldn't upload them. Try again.");
      if (!up.length) {
        finish(keys);
        return [];
      }
      setState(keys, "saving");

      // 3. The frames themselves.
      const res = await addFrames(teamId, collectionId, up).catch(() => ({ error: OFFLINE }) as const);
      finish(keys);
      if (res.error !== undefined) {
        errRef.current(res.error);
        return [];
      }
      return res.frames;
    },
    [teamId]
  );

  return { pending, add };
}
