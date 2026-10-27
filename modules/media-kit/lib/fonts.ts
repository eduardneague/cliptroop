"use client";

import { embedPdfFonts, loadPdfLib, type PdfFonts } from "@/lib/pdf-kit";
import type { FontKey, Measure } from "./scene";

/*
 * The kit's fonts for measuring (1.37.0): the PDF's own (Inter and Fraunces, through pdf-lib), loaded once when the
 * builder opens, so the preview breaks its lines exactly where the PDF will.
 */

let ready: Promise<Measure> | null = null;

export function measureOf(F: PdfFonts, clean: (font: PdfFonts[FontKey], s: string) => string): Measure {
  const cache = new Map<string, number>();
  return {
    width(s, f, size) {
      const k = `${f}\u0000${s}`;
      let w = cache.get(k);
      if (w === undefined) {
        w = F[f].widthOfTextAtSize(s, 1000);
        if (cache.size > 20_000) cache.clear();
        cache.set(k, w);
      }
      return (w * size) / 1000;
    },
    clean: (s, f) => clean(F[f], s),
  };
}

/** Measures with the PDF's fonts (pdf-lib and the fonts are fetched the first time). */
export function loadKitMeasure(): Promise<Measure> {
  ready ??= (async () => {
    const { lib, fontkit } = await loadPdfLib();
    const scratch = await lib.PDFDocument.create();
    const { F, clean } = await embedPdfFonts(scratch, fontkit);
    return measureOf(F, clean);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
