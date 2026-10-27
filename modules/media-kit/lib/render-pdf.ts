"use client";

import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";
import { embedPdfFonts, fetchJpeg, loadPdfLib, type PdfFonts, type PdfLib } from "@/lib/pdf-kit";
import { roundRect, type Color, type Op, type Page } from "./scene";
import type { Kit } from "./layout";

/*
 * A media kit as a PDF (1.37.0), drawn from the same pages as the preview: vector shapes and real text (selectable,
 * searchable), the fonts embedded, the pictures as JPEGs cropped to their boxes, links that open (videos, profiles,
 * email, website). Made in the browser with pdf-lib, like the export for Claude.
 */

export type KitPdfProgress = (step: string, done?: number, total?: number) => void;

const K = 0.5522847498;

/** The largest box each picture is drawn in (points), so it's fetched at a size that stays sharp there. */
function pictureSizes(pages: Page[]) {
  const sizes = new Map<string, { w: number; h: number }>();
  for (const p of pages)
    for (const op of p.ops)
      if (op.t === "image") {
        const cur = sizes.get(op.src);
        sizes.set(op.src, { w: Math.max(cur?.w ?? 0, op.w), h: Math.max(cur?.h ?? 0, op.h) });
      }
  return sizes;
}

export async function renderKitPdf(kit: Kit, meta: { author: string; generatedAt: string }, progress: KitPdfProgress = () => {}): Promise<Uint8Array> {
  progress("Loading the PDF maker…");
  const { lib, fontkit } = await loadPdfLib();
  const pdf = await lib.PDFDocument.create();
  const { F } = await embedPdfFonts(pdf, fontkit);
  pdf.setTitle(`${kit.title}: media kit`);
  pdf.setAuthor(meta.author);
  pdf.setSubject("Media kit");
  pdf.setKeywords(["media kit", ...kit.platforms]);
  pdf.setCreator("ClipTroop");
  pdf.setProducer("ClipTroop");
  pdf.setCreationDate(new Date(meta.generatedAt));

  // Every picture once, at twice its biggest box (sharp on screens and in print), at most 1600 px.
  const sizes = pictureSizes(kit.pages);
  const images = new Map<string, PDFImage | null>();
  const list = [...sizes.entries()];
  let done = 0;
  progress("Adding pictures…", 0, list.length);
  await Promise.all(
    list.map(async ([src, box]) => {
      const pic = await fetchJpeg(src, Math.min(1600, Math.ceil(box.w * 2.2)), Math.min(1600, Math.ceil(box.h * 2.2)), 0.86);
      images.set(src, pic ? await pdf.embedJpg(pic.bytes) : null);
      progress("Adding pictures…", ++done, list.length);
    })
  );

  progress("Drawing the pages…");
  kit.pages.forEach((p) => drawPage(lib, pdf, pdf.addPage([p.w, p.h]), p, F, images));
  progress("Saving…");
  return pdf.save({ useObjectStreams: true });
}

const col = (lib: PdfLib, c: Color) => lib.rgb(c[0] / 255, c[1] / 255, c[2] / 255);

function drawPage(lib: PdfLib, pdf: PDFDocument, page: PDFPage, p: Page, F: PdfFonts, images: Map<string, PDFImage | null>) {
  const H = p.h;
  page.drawRectangle({ x: 0, y: 0, width: p.w, height: p.h, color: col(lib, p.bg) });
  // A rounded box as path steps in the PDF's own coordinates (y up), for clipping.
  const boxPath = (x: number, y: number, w: number, h: number, r = 0) => {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    const k = rr * K;
    const X = (v: number) => v;
    const Y = (v: number) => H - v;
    if (!rr) return [lib.moveTo(X(x), Y(y)), lib.lineTo(X(x + w), Y(y)), lib.lineTo(X(x + w), Y(y + h)), lib.lineTo(X(x), Y(y + h)), lib.closePath()];
    return [
      lib.moveTo(X(x + rr), Y(y)),
      lib.lineTo(X(x + w - rr), Y(y)),
      lib.appendBezierCurve(X(x + w - rr + k), Y(y), X(x + w), Y(y + rr - k), X(x + w), Y(y + rr)),
      lib.lineTo(X(x + w), Y(y + h - rr)),
      lib.appendBezierCurve(X(x + w), Y(y + h - rr + k), X(x + w - rr + k), Y(y + h), X(x + w - rr), Y(y + h)),
      lib.lineTo(X(x + rr), Y(y + h)),
      lib.appendBezierCurve(X(x + rr - k), Y(y + h), X(x), Y(y + h - rr + k), X(x), Y(y + h - rr)),
      lib.lineTo(X(x), Y(y + rr)),
      lib.appendBezierCurve(X(x), Y(y + rr - k), X(x + rr - k), Y(y), X(x + rr), Y(y)),
      lib.closePath(),
    ];
  };
  const clipTo = (x: number, y: number, w: number, h: number, r?: number) => page.pushOperators(lib.pushGraphicsState(), ...boxPath(x, y, w, h, r), lib.clip(), lib.endPath());

  for (const op of p.ops as Op[]) {
    switch (op.t) {
      case "rect": {
        const fill = op.fill ? col(lib, op.fill) : undefined;
        const stroke = op.stroke ? col(lib, op.stroke) : undefined;
        if (op.r) {
          page.drawSvgPath(roundRect(op.x, op.y, op.w, op.h, op.r), {
            x: 0,
            y: H,
            ...(fill ? { color: fill, opacity: op.o ?? 1 } : {}),
            ...(stroke ? { borderColor: stroke, borderWidth: op.sw ?? 1, borderOpacity: op.o ?? 1 } : {}),
          });
        } else {
          page.drawRectangle({
            x: op.x,
            y: H - op.y - op.h,
            width: op.w,
            height: op.h,
            ...(fill ? { color: fill, opacity: op.o ?? 1 } : {}),
            ...(stroke ? { borderColor: stroke, borderWidth: op.sw ?? 1, borderOpacity: op.o ?? 1 } : { borderWidth: 0 }),
          });
        }
        break;
      }
      case "text":
        page.drawText(op.s, { x: op.x, y: H - op.y, size: op.size, font: F[op.f], color: col(lib, op.c), opacity: op.o ?? 1 });
        break;
      case "image": {
        const img = images.get(op.src);
        if (!img) {
          // A picture that couldn't be had: its box, quietly.
          page.drawSvgPath(roundRect(op.x, op.y, op.w, op.h, op.r ?? 0), { x: 0, y: H, color: col(lib, [128, 128, 128]), opacity: 0.12 });
          break;
        }
        // Cover the box: scaled to fill it, centred, the rest cut off.
        const scale = Math.max(op.w / img.width, op.h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        clipTo(op.x, op.y, op.w, op.h, op.r);
        page.drawImage(img, { x: op.x + (op.w - dw) / 2, y: H - (op.y + (op.h - dh) / 2) - dh, width: dw, height: dh });
        page.pushOperators(lib.popGraphicsState());
        break;
      }
      case "path": {
        const fill = op.fill ? col(lib, op.fill) : undefined;
        const stroke = op.stroke ? col(lib, op.stroke) : undefined;
        // Round joins and ends (a chart's line), as the preview draws them.
        page.pushOperators(lib.pushGraphicsState(), lib.setLineJoin(lib.LineJoinStyle.Round));
        page.drawSvgPath(op.d, {
          x: 0,
          y: H,
          ...(fill ? { color: fill, opacity: op.o ?? 1 } : {}),
          ...(stroke ? { borderColor: stroke, borderWidth: op.sw ?? 1, borderOpacity: op.so ?? (fill ? 1 : (op.o ?? 1)), borderLineCap: lib.LineCapStyle.Round } : {}),
        });
        page.pushOperators(lib.popGraphicsState());
        break;
      }
      case "circle":
        page.drawCircle({
          x: op.cx,
          y: H - op.cy,
          size: op.r,
          ...(op.fill ? { color: col(lib, op.fill), opacity: op.o ?? 1 } : {}),
          ...(op.stroke ? { borderColor: col(lib, op.stroke), borderWidth: op.sw ?? 1, borderOpacity: op.o ?? 1 } : {}),
        });
        break;
      case "clip":
        clipTo(op.x, op.y, op.w, op.h, op.r);
        break;
      case "unclip":
        page.pushOperators(lib.popGraphicsState());
        break;
      case "link": {
        const annot = pdf.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [op.x, H - op.y - op.h, op.x + op.w, H - op.y],
          Border: [0, 0, 0],
          A: { Type: "Action", S: "URI", URI: lib.PDFString.of(op.url) },
        });
        page.node.addAnnot(pdf.context.register(annot));
        break;
      }
    }
  }
}
