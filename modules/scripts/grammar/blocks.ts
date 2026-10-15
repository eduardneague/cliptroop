import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * The document as blocks of plain text (each paragraph, heading, list item
 * line…), with where every character sits in the document. Suggestions are
 * found per block and placed back with `map`.
 */
export type TextBlock = {
  text: string;
  /** map[i] = the document position of text[i]. */
  map: number[];
  heading: boolean;
  /** The block's first and last positions (its content). */
  from: number;
  to: number;
};

type DocLike = Pick<PMNode, "descendants">;
type NodeLike = {
  isTextblock: boolean;
  isText: boolean;
  text?: string | null;
  type: { name: string };
  nodeSize: number;
  forEach: (fn: (child: NodeLike, offset: number) => void) => void;
};

/** One text block's characters and their positions (`pos` = where the block node starts). */
function blockOf(node: NodeLike, pos: number): TextBlock {
  let text = "";
  const map: number[] = [];
  node.forEach((child, offset) => {
    if (child.isText && child.text) {
      for (let i = 0; i < child.text.length; i++) {
        text += child.text[i];
        map.push(pos + 1 + offset + i);
      }
    } else {
      // A line break is a line break; anything else inline is a word gap.
      text += child.type.name === "hardBreak" ? "\n" : " ";
      map.push(pos + 1 + offset);
    }
  });
  return { text, map, heading: node.type.name === "heading", from: pos + 1, to: pos + node.nodeSize - 1 };
}

export function textBlocks(doc: DocLike): TextBlock[] {
  const out: TextBlock[] = [];
  (doc as unknown as { descendants: (fn: (node: NodeLike, pos: number) => boolean | void) => void }).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    out.push(blockOf(node, pos));
    return false;
  });
  return out;
}

/** The text block a document position is in. */
export function blockAt(doc: { resolve: (pos: number) => { parent: unknown; start: () => number } }, pos: number): TextBlock | null {
  try {
    const $p = doc.resolve(pos);
    const parent = $p.parent as NodeLike;
    if (!parent.isTextblock) return null;
    return blockOf(parent, $p.start() - 1);
  } catch {
    return null;
  }
}

/** Document positions of a stretch of a block's text. */
export function placeIn(b: TextBlock, offset: number, length: number): { from: number; to: number } | null {
  if (length <= 0 || offset < 0 || offset + length > b.text.length) return null;
  return { from: b.map[offset], to: b.map[offset + length - 1] + 1 };
}

/** Blocks worth sending: something to read, not just a number or a link. */
export function worthChecking(text: string) {
  const t = text.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-zÀ-ÿĀ-ž]{2}/.test(t)) return false;
  return !/^(https?:\/\/|www\.)\S+$/i.test(t);
}

export type Batch = { text: string; parts: { key: string; start: number; length: number }[] };

/**
 * Many blocks in one request (LanguageTool reads them as paragraphs),
 * at most `max` characters each. A block longer than that goes alone.
 */
export function batches(blocks: { key: string; text: string }[], max = 6000): Batch[] {
  const out: Batch[] = [];
  let cur: Batch | null = null;
  for (const b of blocks) {
    const sep = cur && cur.text ? "\n\n" : "";
    if (!cur || (cur.text.length + sep.length + b.text.length > max && cur.parts.length)) {
      cur = { text: "", parts: [] };
      out.push(cur);
    }
    const s = cur.text ? "\n\n" : "";
    cur.parts.push({ key: b.key, start: cur.text.length + s.length, length: b.text.length });
    cur.text += s + b.text;
  }
  return out;
}

/** A batch's answers, given back to each block (offsets inside the block). Ones across two blocks are dropped. */
export function splitBack<T extends { offset: number; length: number }>(batch: Batch, found: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>(batch.parts.map((p) => [p.key, []]));
  for (const f of found) {
    const part = batch.parts.find((p) => f.offset >= p.start && f.offset < p.start + p.length);
    if (!part || f.offset + f.length > part.start + part.length) continue;
    out.get(part.key)!.push({ ...f, offset: f.offset - part.start });
  }
  return out;
}

/** Spans of a text that are web addresses (never checked). */
export function urlSpans(text: string): [number, number][] {
  const out: [number, number][] = [];
  const rx = /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[\w.-]+@[\w-]+\.[\w.]+\b/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** A short, stable fingerprint of a string (for keys, not security). */
export function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** What "Dismiss" remembers: the rule, the words and a little around them (so edits elsewhere don't bring it back). */
export function signature(rule: string, text: string, offset: number, length: number): string {
  const before = text.slice(Math.max(0, offset - 24), offset).toLowerCase().replace(/\s+/g, " ");
  const after = text.slice(offset + length, offset + length + 24).toLowerCase().replace(/\s+/g, " ");
  return `${rule}|${hash(before)}|${text.slice(offset, offset + length).toLowerCase()}|${hash(after)}`;
}
