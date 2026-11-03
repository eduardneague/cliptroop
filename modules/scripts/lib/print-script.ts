"use client";

import { DOMSerializer } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";

/*
 * Export as PDF (1.27.5): the browser's own print, of a plain copy of the
 * script. Before, the print showed the page itself with everything but the
 * paper hidden: Firefox then left page after page blank on long scripts
 * (the hidden page kept its size and the paper was laid over it). The copy
 * is just the title and the text, straight under <body>, with nothing else
 * on the page while it prints (app/globals.css, "PDF export"): no comment
 * highlights, writing suggestions or editor controls, the same in every
 * browser. Ctrl+P (or the browser's own Print) prints the same copy.
 */

const ROOT_ID = "script-print-root";
const PRINTING = "vp-printing";

/** The script's text as the page prints it. */
export function buildPrintCopy(editor: Editor, title: string): HTMLElement {
  const root = document.createElement("div");
  root.id = ROOT_ID;
  const paper = document.createElement("div");
  paper.className = "script-paper script-print-copy";
  paper.dataset.paper = "light";
  const h1 = document.createElement("h1");
  h1.className = "print-title";
  h1.textContent = title;
  const body = document.createElement("div");
  body.className = "script-doc";
  // The document itself (what's saved), not the editor's screen: no decorations.
  body.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.doc.content, { document }));
  // Pictures: their size and side, as in the script (the editor draws them with its own controls).
  body.querySelectorAll("img").forEach((img) => {
    const width = Number(img.getAttribute("data-width"));
    const align = img.getAttribute("data-align");
    const box = document.createElement("div");
    box.className = "print-image";
    box.style.textAlign = align === "left" || align === "right" ? align : "center";
    img.loading = "eager";
    img.decoding = "sync";
    img.style.width = width >= 10 && width <= 100 ? `${width}%` : "";
    img.replaceWith(box);
    box.appendChild(img);
  });
  // Nothing on paper can be typed in.
  body.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  body.querySelectorAll("input").forEach((el) => el.setAttribute("disabled", ""));
  paper.append(h1, body);
  root.append(paper);
  return root;
}

/** Takes the copy away again (after printing). */
export function removePrintCopy() {
  document.getElementById(ROOT_ID)?.remove();
  document.documentElement.classList.remove(PRINTING);
}

/** Puts the copy on the page for printing (in place of an older one). */
export function placePrintCopy(editor: Editor, title: string): HTMLElement {
  removePrintCopy();
  const root = buildPrintCopy(editor, title);
  document.body.appendChild(root);
  document.documentElement.classList.add(PRINTING);
  return root;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Export as PDF: the copy, its pictures loaded (a few seconds at most) and
 * the browser's print dialog ("Save as PDF").
 */
export async function printScript(editor: Editor, title: string) {
  const root = placePrintCopy(editor, title);
  const images = Array.from(root.querySelectorAll("img"));
  const loaded = Promise.all(
    images.map((img) =>
      img.complete
        ? null
        : new Promise<void>((r) => {
            img.addEventListener("load", () => r(), { once: true });
            img.addEventListener("error", () => r(), { once: true });
          })
    )
  );
  await Promise.race([Promise.all([loaded, document.fonts?.ready]), wait(images.length ? 4000 : 800)]);
  // (Gone again once the print is done: "afterprint", set up by the editor.)
  window.print();
}

/**
 * Ctrl+P and the browser's own Print: the same copy. `get` gives the editor
 * and title at that moment. Returns the clean-up.
 */
export function watchPrinting(get: () => { editor: Editor | null; title: string }): () => void {
  const before = () => {
    if (document.getElementById(ROOT_ID)) return;
    const { editor, title } = get();
    if (editor && !editor.isDestroyed) placePrintCopy(editor, title);
  };
  // (Firefox copies the page for printing right away; Chrome and Safari after the dialog closes.)
  const after = () => setTimeout(removePrintCopy, 0);
  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", after);
  return () => {
    window.removeEventListener("beforeprint", before);
    window.removeEventListener("afterprint", after);
    removePrintCopy();
  };
}
