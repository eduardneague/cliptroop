"use client";

/*
 * Eight frames of a video, read in the browser from the file being
 * uploaded (1.16.0): the first seconds (0, 1, 2, 3 s: the hook) and the
 * story (25%, 50%, 75%, the end), side by side in one JPEG with the time
 * on each. Kept for the PDF made for Claude, after the video itself is
 * cleaned up. Best effort: a file the browser can't decode gives nothing.
 */

const GAP = 4;
const MID_GAP = 14;

function once(el: HTMLVideoElement, event: string, ms: number) {
  return new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      el.removeEventListener(event, on);
      el.removeEventListener("error", off);
      clearTimeout(t);
      resolve(ok);
    };
    const on = () => done(true);
    const off = () => done(false);
    const t = setTimeout(() => done(false), ms);
    el.addEventListener(event, on, { once: true });
    el.addEventListener("error", off, { once: true });
  });
}

const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export async function captureFrames(file: File | Blob): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    if (!(await once(v, "loadeddata", 12_000))) return null;
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!d || !vw || !vh) return null;
    // Some phones only draw frames after playback has started once.
    try {
      await v.play();
      v.pause();
    } catch {}
    const tall = vh >= vw;
    const cellH = tall ? 240 : 108;
    const cellW = Math.round((cellH * vw) / vh);
    const times = [0.05, 1, 2, 3, d * 0.25, d * 0.5, d * 0.75, d * 0.97].map((t) => Math.max(0, Math.min(d - 0.05, t)));
    const canvas = document.createElement("canvas");
    canvas.width = cellW * 8 + GAP * 6 + MID_GAP;
    canvas.height = cellH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let drawn = 0;
    for (let i = 0; i < times.length; i++) {
      const x = i * (cellW + GAP) + (i >= 4 ? MID_GAP - GAP : 0);
      v.currentTime = times[i];
      if (!(await once(v, "seeked", 5_000))) continue;
      try {
        ctx.drawImage(v, x, 0, cellW, cellH);
        drawn++;
      } catch {
        continue;
      }
      // The time, bottom left, on a dark chip.
      const label = stamp(times[i]);
      ctx.font = "600 13px system-ui, sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.beginPath();
      ctx.roundRect?.(x + 5, cellH - 23, tw + 10, 18, 4);
      if (!ctx.roundRect) ctx.rect(x + 5, cellH - 23, tw + 10, 18);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 10, cellH - 9);
    }
    if (drawn < 4) return null;
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.78));
  } catch {
    return null;
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}
