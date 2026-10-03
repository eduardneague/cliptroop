"use client";

import type * as DocxLib from "docx";
import type { IParagraphOptions, ParagraphChild, Paragraph as ParagraphT } from "docx";

type Docx = typeof DocxLib;

/**
 * The Word library is loaded from /vendor/docx.iife.js (copied there on
 * npm install) instead of being bundled: Turbopack's dev bundler breaks
 * on its code. Loaded once, only when someone exports.
 */
let loading: Promise<Docx> | null = null;
function loadDocx(): Promise<Docx> {
  const w = window as unknown as { docx?: Docx };
  if (w.docx) return Promise.resolve(w.docx);
  loading ??= new Promise<Docx>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/docx.iife.js";
    s.async = true;
    s.onload = () => (w.docx ? resolve(w.docx) : reject(new Error("Word export library didn't load")));
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the Word export library"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };

const PAGE_WIDTH_PX = 600; // usable width for images in the document

function alignMap(D: Docx): Record<string, (typeof D.AlignmentType)[keyof typeof D.AlignmentType]> {
  return {
    left: D.AlignmentType.LEFT,
    center: D.AlignmentType.CENTER,
    right: D.AlignmentType.RIGHT,
    justify: D.AlignmentType.JUSTIFIED,
  };
}

function hex(color: unknown) {
  if (typeof color !== "string") return "FDE68A";
  const m = color.match(/^#?([0-9a-f]{6})$/i);
  return m ? m[1].toUpperCase() : "FDE68A";
}

function runs(D: Docx, nodes: Node[] | undefined): ParagraphChild[] {
  const { TextRun, ExternalHyperlink } = D;
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const marks = n.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    const hl = marks.find((m) => m.type === "highlight");
    const link = marks.find((m) => m.type === "link");
    const run = new TextRun({
      text: n.text,
      bold: has("bold"),
      italics: has("italic"),
      underline: has("underline") || link ? {} : undefined,
      strike: has("strike"),
      color: link ? "2563EB" : undefined,
      shading: hl ? { fill: hex(hl.attrs?.color), type: "clear", color: "auto" } : undefined,
    });
    const href = link?.attrs?.href;
    out.push(typeof href === "string" && /^https?:\/\//.test(href) ? new ExternalHyperlink({ link: href, children: [run] }) : run);
  }
  return out;
}

/** Turn any image URL into PNG bytes (Word can't show WebP) + its size. */
async function imageData(src: string): Promise<{ data: ArrayBuffer; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(src)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!png) return null;
    return { data: await png.arrayBuffer(), w: bitmap.width, h: bitmap.height };
  } catch {
    return null;
  }
}

async function blocks(
  D: Docx,
  nodes: Node[] | undefined,
  ctx: { list?: { kind: "bullet" | "number"; level: number }; quote?: boolean } = {}
): Promise<ParagraphT[]> {
  const { Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType } = D;
  const ALIGN = alignMap(D);
  const out: ParagraphT[] = [];
  for (const n of nodes ?? []) {
    const align = ALIGN[(n.attrs?.textAlign as string) ?? ""];
    const base: Partial<IParagraphOptions> = {
      alignment: align,
      ...(ctx.quote ? { indent: { left: 480 }, border: { left: { style: "single", size: 12, color: "BBBBBB", space: 8 } } } : {}),
    };
    switch (n.type) {
      case "paragraph":
        out.push(
          new Paragraph({
            ...base,
            children: runs(D, n.content),
            ...(ctx.list
              ? ctx.list.kind === "bullet"
                ? { bullet: { level: ctx.list.level } }
                : { numbering: { reference: "script-numbers", level: ctx.list.level } }
              : {}),
            spacing: { after: 120 },
          })
        );
        break;
      case "heading": {
        const level = (n.attrs?.level as number) ?? 2;
        out.push(
          new Paragraph({
            ...base,
            heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            children: runs(D, n.content),
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      }
      case "bulletList":
      case "orderedList":
        for (const item of n.content ?? []) {
          out.push(
            ...(await blocks(D, item.content, {
              ...ctx,
              list: { kind: n.type === "bulletList" ? "bullet" : "number", level: ctx.list ? Math.min(ctx.list.level + 1, 5) : 0 },
            }))
          );
        }
        break;
      case "taskList":
        for (const item of n.content ?? []) {
          const checked = !!item.attrs?.checked;
          const [first, ...rest] = item.content ?? [];
          out.push(
            new Paragraph({
              children: [new TextRun({ text: checked ? "☑ " : "☐ " }), ...runs(D, first?.content)],
              spacing: { after: 80 },
            })
          );
          out.push(...(await blocks(D, rest, ctx)));
        }
        break;
      case "blockquote":
        out.push(...(await blocks(D, n.content, { ...ctx, quote: true })));
        break;
      case "horizontalRule":
        out.push(new Paragraph({ border: { bottom: { style: "single", size: 6, color: "CCCCCC", space: 4 } }, children: [] }));
        break;
      case "image": {
        const src = n.attrs?.src as string | undefined;
        const img = src ? await imageData(src) : null;
        if (!img) break;
        const pct = Math.min(100, Math.max(15, Number(n.attrs?.width) || 100));
        const w = Math.min(img.w, Math.round((PAGE_WIDTH_PX * pct) / 100));
        const h = Math.round((img.h / img.w) * w);
        out.push(
          new Paragraph({
            alignment: ALIGN[(n.attrs?.align as string) ?? "center"] ?? AlignmentType.CENTER,
            children: [new ImageRun({ type: "png", data: img.data, transformation: { width: w, height: h } })],
            spacing: { before: 120, after: 120 },
          })
        );
        break;
      }
      default:
        if (n.content) out.push(...(await blocks(D, n.content, ctx)));
    }
  }
  return out;
}

/** Build and download a .docx of the script. */
export async function exportScriptDocx(doc: Node, title: string, fileName: string) {
  const D = await loadDocx();
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType } = D;
  const body = await blocks(D, doc.content);
  const document = new Document({
    title,
    numbering: {
      config: [
        {
          reference: "script-numbers",
          levels: Array.from({ length: 6 }, (_, i) => ({
            level: i,
            format: LevelFormat.DECIMAL,
            text: `%${i + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }), ...body],
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = `${fileName}.docx`;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One editing idea: the script text it's about, and the idea. */
/** One editing idea: the quoted script text, the idea, and its drawing (if any). */
export type IdeaExport = { quote: string; idea: string; sketch?: string | null };

/**
 * Editing ideas as Word:
 *   TITLE / Editing Ideas / #1 "quote" (bold) / (idea) (italic) …
 */
export async function exportIdeasDocx(ideas: IdeaExport[], title: string, fileName: string) {
  const D = await loadDocx();
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType } = D;
  // Drawings: fetched and turned into PNGs (all at once), placed right under their idea.
  const pictures = await Promise.all(ideas.map((x) => (x.sketch ? imageData(x.sketch) : Promise.resolve(null))));
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Editing Ideas")] }),
    ...ideas.flatMap((x, i) => {
      const out = [new Paragraph({ spacing: { before: 280 }, children: [new TextRun({ text: `#${i + 1} "${x.quote}"`, bold: true })] })];
      if (x.idea.trim()) out.push(new Paragraph({ children: [new TextRun({ text: `(${x.idea})`, italics: true })] }));
      const img = pictures[i];
      if (img) {
        const w = Math.min(PAGE_WIDTH_PX * 0.8, img.w);
        const h = Math.round((img.h / img.w) * w);
        out.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 120 }, children: [new ImageRun({ type: "png", data: img.data, transformation: { width: Math.round(w), height: h } })] }));
      }
      return out;
    }),
  ];
  const blob = await Packer.toBlob(new Document({ title: `${title} · Editing Ideas`, sections: [{ children }] }));
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = `${fileName}.docx`;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Editing ideas as PDF: a clean page in a new window, printed to PDF. */
export function exportIdeasPdf(ideas: IdeaExport[], title: string) {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · Editing Ideas</title>
<style>body{font-family:Georgia,'Times New Roman',serif;max-width:680px;margin:48px auto;padding:0 24px;color:#111;line-height:1.5}
h1{font-size:28px;margin:0 0 4px}h2{font-size:18px;font-weight:600;color:#555;margin:0 0 28px}
.q{font-weight:700;margin:22px 0 2px}.i{font-style:italic;margin:0}.s{display:block;max-width:80%;max-height:420px;margin:10px 0 4px;border:1px solid #ddd;border-radius:6px;break-inside:avoid}@page{margin:18mm}</style></head><body>
<h1>${esc(title)}</h1><h2>Editing Ideas</h2>
${ideas.map((x, i) => `<p class="q">#${i + 1} "${esc(x.quote)}"</p>${x.idea.trim() ? `<p class="i">(${esc(x.idea)})</p>` : ""}${x.sketch ? `<img class="s" src="${esc(x.sketch)}" alt="Sketch">` : ""}`).join("\n")}
<script>window.onload=()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>window.print())}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
