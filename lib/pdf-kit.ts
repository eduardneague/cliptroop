"use client";

import type * as PdfLibNs from "pdf-lib";
import type { PDFDocument, PDFFont } from "pdf-lib";

/*
 * What the PDFs made in the browser share (1.37.0, from the export for Claude of 1.16.0): pdf-lib and fontkit,
 * loaded from /vendor the first time a PDF is made (copied there from node_modules by scripts/copy-vendor.mjs), the
 * app's PDF fonts (Inter and Fraunces, public/fonts/pdf), and pictures turned into small JPEGs.
 */

export type PdfLib = typeof PdfLibNs;

let loading: Promise<{ lib: PdfLib; fontkit: unknown }> | null = null;
function script(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });
}

export function loadPdfLib(): Promise<{ lib: PdfLib; fontkit: unknown }> {
  const w = window as unknown as { PDFLib?: PdfLib; fontkit?: unknown };
  if (w.PDFLib && w.fontkit) return Promise.resolve({ lib: w.PDFLib, fontkit: w.fontkit });
  loading ??= Promise.all([w.PDFLib ? null : script("/vendor/pdf-lib.min.js"), w.fontkit ? null : script("/vendor/fontkit.umd.min.js")])
    .then(() => {
      if (!w.PDFLib || !w.fontkit) throw new Error("The PDF library didn't load");
      return { lib: w.PDFLib, fontkit: w.fontkit };
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export type PdfFonts = { reg: PDFFont; semi: PDFFont; disp: PDFFont };

let fontBytes: Promise<ArrayBuffer[]> | null = null;
/** The three fonts' files, fetched once. */
function loadFontBytes() {
  fontBytes ??= Promise.all(
    ["/fonts/pdf/Inter-Regular.ttf", "/fonts/pdf/Inter-SemiBold.ttf", "/fonts/pdf/Fraunces-SemiBold.ttf"].map((u) => fetch(u).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`Font ${u} didn't load`)))))
  ).catch((e) => {
    fontBytes = null;
    throw e;
  });
  return fontBytes;
}

/**
 * Inter and Fraunces in a PDF, and `clean`: only what a font can draw (emoji and the like are left out). Inter whole:
 * pdf-lib's subsetting drops some of its letters (the PDF grows by ~0.7 MB). Fraunces the other way round: whole, its
 * spacing comes out wrong; subset, it's right.
 */
export async function embedPdfFonts(pdf: PDFDocument, fontkit: unknown): Promise<{ F: PdfFonts; clean: (font: PDFFont, s: string) => string }> {
  pdf.registerFontkit(fontkit as Parameters<typeof pdf.registerFontkit>[0]);
  const [reg, semi, disp] = await loadFontBytes();
  const F: PdfFonts = { reg: await pdf.embedFont(reg, { subset: false }), semi: await pdf.embedFont(semi, { subset: false }), disp: await pdf.embedFont(disp, { subset: true }) };
  const charsets = new Map<PDFFont, Set<number>>([F.reg, F.semi, F.disp].map((f) => [f, new Set(f.getCharacterSet())]));
  const clean = (font: PDFFont, s: string) => {
    const ok = charsets.get(font)!;
    return Array.from(s.replace(/[\r\t]+/g, " "))
      .filter((c) => c === "\n" || ok.has(c.codePointAt(0)!))
      .join("")
      .replace(/ {2,}/g, " ");
  };
  return { F, clean };
}

/** A picture as a small JPEG (any format the browser can open), at most maxW × maxH. */
export async function toJpeg(blob: Blob, maxW: number, maxH: number, quality = 0.8): Promise<{ bytes: Uint8Array; w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxW / bmp.width, maxH / bmp.height);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    return out ? { bytes: new Uint8Array(await out.arrayBuffer()), w, h } : null;
  } catch {
    return null;
  }
}

/** A picture from an address (ours: with the sign-in cookie), as a small JPEG; null when it can't be had. */
export async function fetchJpeg(url: string, maxW: number, maxH: number, quality = 0.8) {
  try {
    const res = await fetch(url, { credentials: url.startsWith("/") ? "same-origin" : "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream") return null;
    return await toJpeg(blob, maxW, maxH, quality);
  } catch {
    return null;
  }
}

/** Saves the bytes as a file (a link clicked for you). */
export function downloadBytes(bytes: Uint8Array, name: string, type = "application/pdf") {
  const blob = new Blob([bytes as BlobPart], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
