/*
 * A thumbnail's numbers from its pixels (1.27.0). Pure: the collector runs
 * it on the decoded picture; the tests on made-up pixels.
 *
 *   - a fingerprint: the picture shrunk to 9×8 greys, each pixel compared
 *     with the one to its right (64 bits as 16 hex characters). Similar
 *     pictures differ in few bits, even at other sizes or qualities.
 *   - main colours: up to 5, most of the picture first (k-means on a small copy).
 *   - brightness and colourfulness: averages, 0–255.
 */

export type Pixels = { width: number; height: number; data: Uint8Array | Uint8ClampedArray | number[]; channels: 3 | 4 };
export type Crop = { x: number; y: number; w: number; h: number };
export type ThumbNumbers = { hash: string; colors: string[]; lum: number; sat: number };

/** The average colour of each cell when the (cropped) picture is shrunk to w×h. */
export function shrink(p: Pixels, w: number, h: number, crop?: Crop): [number, number, number][] {
  const c = crop ?? { x: 0, y: 0, w: p.width, h: p.height };
  const out: [number, number, number][] = [];
  for (let gy = 0; gy < h; gy++) {
    const y0 = c.y + Math.floor((gy * c.h) / h);
    const y1 = Math.max(y0 + 1, c.y + Math.floor(((gy + 1) * c.h) / h));
    for (let gx = 0; gx < w; gx++) {
      const x0 = c.x + Math.floor((gx * c.w) / w);
      const x1 = Math.max(x0 + 1, c.x + Math.floor(((gx + 1) * c.w) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      // Every other pixel is plenty for an average.
      for (let y = y0; y < y1; y += y1 - y0 > 4 ? 2 : 1) {
        for (let x = x0; x < x1; x += x1 - x0 > 4 ? 2 : 1) {
          const i = (y * p.width + x) * p.channels;
          r += p.data[i];
          g += p.data[i + 1];
          b += p.data[i + 2];
          n++;
        }
      }
      out.push(n ? [r / n, g / n, b / n] : [0, 0, 0]);
    }
  }
  return out;
}

const luma = ([r, g, b]: [number, number, number]) => 0.299 * r + 0.587 * g + 0.114 * b;

/** The 64-bit difference hash as 16 hex characters. */
export function dHash(p: Pixels, crop?: Crop): string {
  const cells = shrink(p, 9, 8, crop).map(luma);
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let nibbleBits = 0;
    let bits = 0;
    for (let col = 0; col < 8; col++) {
      const left = cells[row * 9 + col];
      const right = cells[row * 9 + col + 1];
      bits = (bits << 1) | (left > right ? 1 : 0);
      nibbleBits++;
      if (nibbleBits === 4) {
        hex += bits.toString(16);
        bits = 0;
        nibbleBits = 0;
      }
    }
  }
  return hex;
}

const toHex = (c: [number, number, number]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

/** Up to `k` main colours (k-means on a 32×18 copy, started from spread-out picks: the same picture, the same colours). */
export function palette(p: Pixels, k = 5, crop?: Crop): string[] {
  const pts = shrink(p, 32, 18, crop);
  if (!pts.length) return [];
  // Start from colours far apart: the first pixel, then each time the one farthest from those chosen.
  const centers: [number, number, number][] = [pts[0]];
  const dist = (a: [number, number, number], b: [number, number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  while (centers.length < k) {
    let best = -1;
    let bestD = -1;
    pts.forEach((pt, i) => {
      const d = Math.min(...centers.map((c) => dist(pt, c)));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    });
    if (bestD < 400) break; // all the rest is the same colour already
    centers.push(pts[best]);
  }
  let assign: number[] = new Array(pts.length).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    assign = pts.map((pt) => {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = dist(pt, c);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      return bi;
    });
    const sums = centers.map(() => [0, 0, 0, 0]);
    pts.forEach((pt, i) => {
      const s = sums[assign[i]];
      s[0] += pt[0];
      s[1] += pt[1];
      s[2] += pt[2];
      s[3]++;
    });
    sums.forEach((s, i) => {
      if (s[3]) centers[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
  }
  const counts = centers.map((_, i) => assign.filter((a) => a === i).length);
  return centers
    .map((c, i) => ({ c, n: counts[i] }))
    .filter((x) => x.n >= pts.length * 0.04)
    .sort((a, b) => b.n - a.n)
    .map((x) => toHex(x.c));
}

/** Average brightness and colourfulness (0–255). */
export function lumSat(p: Pixels, crop?: Crop): { lum: number; sat: number } {
  const pts = shrink(p, 32, 18, crop);
  let l = 0;
  let s = 0;
  for (const [r, g, b] of pts) {
    l += luma([r, g, b]);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    s += max ? ((max - min) / max) * 255 : 0;
  }
  return { lum: Math.round(l / pts.length), sat: Math.round(s / pts.length) };
}

/** Everything at once. For a Short's 4:3 picture, only its tall middle (`crop`). */
export function thumbNumbers(p: Pixels, crop?: Crop): ThumbNumbers {
  const { lum, sat } = lumSat(p, crop);
  return { hash: dHash(p, crop), colors: palette(p, 5, crop), lum, sat };
}

/** The tall middle of a 4:3 picture of a vertical video (YouTube's hqdefault for a Short). */
export function shortCrop(width: number, height: number): Crop {
  const w = Math.round((height * 9) / 16);
  return { x: Math.max(0, Math.round((width - w) / 2)), y: 0, w: Math.min(width, w), h: height };
}
