import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { frameIdOfHref } from "@/modules/frames/lib/model";

/*
 * Frame guides in a script's text (1.54.0), the parts that live in the document itself (a frame guide on words is a
 * comment: anchors.ts):
 *   * words linked to a frame: an ordinary link to the frame's page (/frame-guides?frame=<id>), so every copy of the
 *     editor, the exports and older pages keep it; shown in Frame Guides' colour, with the frame's picture right under
 *     the words (drawn here, not saved: it follows the link, and goes when the link does);
 *   * a frame's picture: an ordinary picture with the frame's id, number and name on it (script-image.tsx).
 * The exports draw the linked frames' pictures under their words too, with a caption (withFramePictures).
 * Pure apart from the plugin: tests/frame-guides.test.ts.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
export type Json = { type: string; attrs?: Record<string, unknown>; content?: Json[]; marks?: Mark[]; text?: string };

/** What the script knows about a frame: undefined while the library loads, null when it's gone (or not the team's). */
export type FrameLook = { id: string; number: number; title: string; url: string; thumb: string; w: number; h: number; tint: string | null } | null | undefined;

export const frameLinkKey = new PluginKey<DecorationSet>("frame-links");

/** The frame a mark links to, else null. */
const markFrame = (m: { type: { name: string } | string; attrs?: Record<string, unknown> }) =>
  (typeof m.type === "string" ? m.type : m.type.name) === "link" ? frameIdOfHref(m.attrs?.href) : null;

/** Each textblock with linked frames: where its words end, and the frames (in order, once each). */
export function linkedFrames(doc: PMNode): { end: number; ids: string[] }[] {
  const out: { end: number; ids: string[] }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const ids: string[] = [];
    node.forEach((child) => {
      for (const m of child.marks) {
        const id = markFrame(m);
        if (id && !ids.includes(id)) ids.push(id);
      }
    });
    if (ids.length) out.push({ end: pos + node.nodeSize - 1, ids });
    return false;
  });
  return out;
}

/**
 * Every frame a document uses (linked words, pictures), once each, in order. Works on the saved JSON too. `only`:
 * just the linked ones (their pictures need the library), or just the pictures.
 */
export function framesInDoc(doc: Json | null | undefined, only?: "links" | "pictures"): string[] {
  const ids: string[] = [];
  const add = (id: string | null) => id && !ids.includes(id) && ids.push(id);
  const walk = (n: Json) => {
    if (only !== "links" && n.type === "image" && typeof n.attrs?.frame === "string") add(n.attrs.frame);
    if (only !== "pictures") for (const m of n.marks ?? []) add(markFrame(m));
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return ids;
}

/** Where each frame is used in the document, in order: linked words (with the words) and pictures. */
export function frameUses(doc: PMNode): { at: number; id: string; how: "link" | "picture"; words: string }[] {
  const out: { at: number; id: string; how: "link" | "picture"; words: string }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "image" && typeof node.attrs.frame === "string") {
      out.push({ at: pos, id: node.attrs.frame, how: "picture", words: "" });
      return false;
    }
    if (!node.isTextblock) return true;
    // Linked words: one run per link (bold or a colour inside it are the same words).
    let run: { id: string; at: number; words: string } | null = null;
    node.forEach((child, offset) => {
      const id = child.isText ? child.marks.map(markFrame).find((x) => !!x) ?? null : null;
      if (run && id === run.id) run.words += child.text ?? "";
      else {
        if (run) out.push({ at: run.at, id: run.id, how: "link", words: run.words });
        run = id ? { id, at: pos + 1 + offset, words: child.text ?? "" } : null;
      }
    });
    if (run) {
      const r = run as { id: string; at: number; words: string };
      out.push({ at: r.at, id: r.id, how: "link", words: r.words });
    }
    return false;
  });
  return out;
}

/** "Frame guide #12 · Over the shoulder", or "Frame guide #12". */
export const frameCaption = (f: { number: number; title: string }) => `Frame guide #${f.number}${f.title.trim() ? ` · ${f.title.trim()}` : ""}`;

function card(look: FrameLook, id: string, onOpen: (id: string) => void): HTMLElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `frame-below-card${look === undefined ? " is-loading" : look === null ? " is-gone" : ""}`;
  b.dataset.frameId = id;
  b.contentEditable = "false";
  const pic = document.createElement("span");
  pic.className = "frame-below-pic";
  if (look) {
    pic.style.background = look.tint ?? "";
    pic.style.aspectRatio = look.w >= look.h ? `${look.w} / ${look.h}` : "16 / 9";
    const img = document.createElement("img");
    img.src = look.thumb || look.url;
    img.alt = look.title || `Frame #${look.number}`;
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    if (look.h > look.w) img.style.objectFit = "contain";
    pic.appendChild(img);
  }
  const cap = document.createElement("span");
  cap.className = "frame-below-cap";
  const strong = document.createElement("b");
  strong.textContent = look ? `#${look.number}` : look === null ? "Frame guide" : "Frame guide";
  cap.appendChild(strong);
  cap.appendChild(document.createTextNode(look ? ` ${look.title || "Untitled shot"}` : look === null ? " not found (deleted, or another team's)" : " loading…"));
  b.append(pic, cap);
  b.title = look ? `${frameCaption(look)}: click to see it big` : look === null ? "This frame guide isn't in your team's Frame Guides any more" : "";
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (look) onOpen(id);
  });
  return b;
}

/**
 * The pictures of the frames linked in a paragraph (or heading, list item…), right under its words. `get` gives what
 * the script knows about each frame and what a click does; dispatch frameLinkKey with true to draw again (the library
 * arrived). Drawn inside the paragraph, after its words, so it moves with them (on Pages too) and is never typed into.
 */
export function FrameLinkPictures(get: () => { look: (id: string) => FrameLook; onOpen: (id: string) => void }) {
  const build = (doc: PMNode) => {
    const { look, onOpen } = get();
    const decos: Decoration[] = [];
    for (const b of linkedFrames(doc)) {
      const looks = b.ids.map((id) => look(id));
      // Drawn again only when what it shows changes (not on every key typed).
      const key = `fl-${b.ids.map((id, i) => `${id}:${looks[i] === undefined ? "?" : looks[i] === null ? "x" : `${looks[i]!.number}|${looks[i]!.title}|${looks[i]!.thumb}`}`).join(",")}`;
      decos.push(
        Decoration.widget(
          b.end,
          () => {
            const box = document.createElement("span");
            box.className = "frame-below no-print";
            box.contentEditable = "false";
            box.setAttribute("aria-label", b.ids.length === 1 ? "The linked frame guide" : "The linked frame guides");
            b.ids.forEach((id, i) => box.appendChild(card(looks[i], id, onOpen)));
            return box;
          },
          { side: 1, key, ignoreSelection: true, stopEvent: () => true }
        )
      );
    }
    return DecorationSet.create(doc, decos);
  };
  return Extension.create({
    name: "frameLinkPictures",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: frameLinkKey,
          state: {
            init: (_, state) => build(state.doc),
            apply: (tr, old, _o, state) => (tr.docChanged || tr.getMeta(frameLinkKey) ? build(state.doc) : old),
          },
          props: {
            decorations: (state) => frameLinkKey.getState(state),
          },
        }),
      ];
    },
  });
}

/**
 * The document as it's exported (Word, PDF, the print): each linked frame's picture under its words, and a caption
 * under every frame's picture. `look`: what's known about each frame (one not known is left out).
 */
export function withFramePictures<T extends Json>(doc: T, look: (id: string) => FrameLook): T {
  const caption = (f: { number: number; title: string }): Json => ({ type: "paragraph", content: [{ type: "text", text: frameCaption(f), marks: [{ type: "italic" }] }] });
  const linksIn = (n: Json): string[] => {
    const ids: string[] = [];
    const walk = (x: Json) => {
      for (const m of x.marks ?? []) {
        const id = markFrame(m);
        if (id && !ids.includes(id)) ids.push(id);
      }
      x.content?.forEach(walk);
    };
    walk(n);
    return ids;
  };
  const isTextblock = (n: Json) => n.type === "paragraph" || n.type === "heading";
  const walk = (n: Json): Json => {
    if (!n.content) return n;
    const kids: Json[] = [];
    for (const child of n.content) {
      if (isTextblock(child)) {
        kids.push(child);
        for (const id of linksIn(child)) {
          const f = look(id);
          if (!f) continue;
          kids.push({ type: "image", attrs: { src: f.url, alt: f.title || `Frame #${f.number}`, align: "left", width: f.h > f.w ? 25 : 50, frame: f.id, frameN: f.number, frameTitle: f.title } });
          kids.push(caption(f));
        }
      } else if (child.type === "image" && typeof child.attrs?.frame === "string") {
        kids.push(child);
        const f = look(child.attrs.frame);
        const n0 = Number(child.attrs.frameN);
        const known = f ?? (n0 > 0 ? { number: n0, title: String(child.attrs.frameTitle ?? "") } : null);
        if (known) kids.push(caption(known));
      } else kids.push(walk(child));
    }
    return { ...n, content: kids };
  };
  return walk(doc) as T;
}
