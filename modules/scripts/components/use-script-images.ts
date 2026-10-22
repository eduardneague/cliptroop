"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { createClient } from "@/lib/supabase/client";
import { compressImage, IMAGE_PRESETS, isPictureType, safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { decodeDataImage, readyToSave, unkeepableSrc } from "../lib/paste-images";

/**
 * Where a block (like an image) can go near `pos`: right after the
 * paragraph/list/quote it's in, or in place of an empty paragraph. Never
 * inside a line of text (that's what caused "Inserted content deeper
 * than insertion position").
 */
export function blockRange(editor: Editor, pos?: number) {
  const { doc, selection } = editor.state;
  const at = typeof pos === "number" ? Math.min(Math.max(pos, 0), doc.content.size) : selection.from;
  const $pos = doc.resolve(at);
  if ($pos.depth === 0) return { from: at, to: at };
  const top = $pos.node(1);
  const start = $pos.before(1);
  const end = $pos.after(1);
  if (top.type.name === "paragraph" && top.content.size === 0) return { from: start, to: end };
  return { from: end, to: end };
}

const MAX = 25 * 1024 * 1024;

/**
 * Pictures going into a script (1.27.5, lib/paste-images.ts): each shows
 * at once from the device and uploads in the background ("Uploading…" on
 * it); `forSave` gives the document with the real addresses, or null while
 * one is still on its way (the save waits). Pasted, dropped or picked.
 */
export function useScriptImages(
  editorRef: React.RefObject<Editor | null>,
  { teamId, scriptId, onError }: { teamId: string; scriptId: string; onError: (message: string) => void }
) {
  const [uploading, setUploading] = useState(0);
  // blob: link → the real address, once uploaded; the ones still uploading.
  const done = useRef(new Map<string, string>());
  const busy = useRef(new Set<string>());
  const blobs = useRef(new Set<string>());
  const errRef = useRef(onError);
  errRef.current = onError;

  /** Every picture with this address gets that one instead (not an undo step). */
  const swap = useCallback(
    (from: string, to: string | null) => {
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed) return;
      const { state } = editor;
      const tr = state.tr;
      const hits: { pos: number; size: number; attrs: Record<string, unknown> }[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name === "image" && node.attrs.src === from) hits.push({ pos, size: node.nodeSize, attrs: node.attrs });
      });
      if (!hits.length) return;
      // From the end, so the earlier places don't move.
      for (const h of hits.reverse()) {
        if (to) tr.setNodeMarkup(h.pos, undefined, { ...h.attrs, src: to });
        else tr.delete(h.pos, h.pos + h.size);
      }
      editor.view.dispatch(tr.setMeta("addToHistory", false));
    },
    [editorRef]
  );

  /** Starts uploading a picture: its blob: link to show meanwhile (null when it can't go up). */
  const start = useCallback(
    (original: File): string | null => {
      if (!original.type.startsWith("image/")) return null;
      if (original.size > MAX) {
        errRef.current(`${original.name || "That picture"} is too big (25 MB max).`);
        return null;
      }
      const url = URL.createObjectURL(original);
      blobs.current.add(url);
      busy.current.add(url);
      setUploading((n) => n + 1);
      void (async () => {
        try {
          const file = await compressImage(original, IMAGE_PRESETS.attachment);
          if (!isPictureType(file.type)) throw new Error("not a picture");
          const path = `${teamId}/${scriptId}/${crypto.randomUUID()}-${safeFileName(file.name || "pasted-image.png")}`;
          const bucket = createClient().storage.from("script-images");
          const { error } = await bucket.upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type });
          if (error) throw error;
          const real = bucket.getPublicUrl(path).data.publicUrl;
          done.current.set(url, real);
          busy.current.delete(url);
          swap(url, real);
        } catch {
          busy.current.delete(url);
          errRef.current(`Couldn't upload ${original.name && original.name !== "image.png" ? original.name : "the picture"}. Try again.`);
          swap(url, null);
        } finally {
          setUploading((n) => n - 1);
        }
      })();
      return url;
    },
    [teamId, scriptId, swap]
  );

  /** Pictures from files (pasted, dropped, picked) at the caret or near `pos`. */
  const insert = useCallback(
    (files: File[], pos?: number) => {
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed) return;
      let at = pos;
      for (const f of files) {
        const src = start(f);
        if (!src) continue;
        const node = { type: "image", attrs: { src, alt: f.name && f.name !== "image.png" ? f.name : "", align: "center", width: 60 } };
        const range = blockRange(editor, at);
        editor
          .chain()
          .focus()
          .insertContentAt(range, node)
          // The caret goes on after the picture (a new line when nothing follows it), so the
          // next paste or the next words don't replace it.
          .command(({ tr }) => {
            const img = tr.doc.nodeAt(range.from);
            if (!img || img.type.name !== "image") return true;
            const end = range.from + img.nodeSize;
            const next = tr.doc.nodeAt(end);
            if (!next || !next.isTextblock) tr.insert(end, editor.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, end + 1));
            return true;
          })
          .run();
        at = editor.state.selection.from;
      }
    },
    [editorRef, start]
  );

  /** Pasted HTML: its data: pictures upload like files; ones that can't be kept are left out. */
  const fromHtml = useCallback(
    (html: string): string => {
      if (!/<img/i.test(html) || typeof DOMParser === "undefined") return html;
      const doc = new DOMParser().parseFromString(html, "text/html");
      let changed = false;
      doc.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src") ?? "";
        if (/^\s*data:image\//i.test(src)) {
          const d = decodeDataImage(src);
          const url = d ? start(new File([d.bytes as BlobPart], `pasted-image.${d.ext}`, { type: d.type })) : null;
          if (url) img.setAttribute("src", url);
          else img.remove();
          changed = true;
        } else if (unkeepableSrc(src) && !blobs.current.has(src.trim())) {
          img.remove();
          changed = true;
        }
      });
      return changed ? doc.body.innerHTML : html;
    },
    [start]
  );

  /** The document as it's saved (null: a picture is still uploading, wait). */
  const forSave = useCallback(<T extends { type: string }>(json: T): T | null => readyToSave(json as never, done.current, busy.current) as T | null, []);

  /** After undo / redo: pictures that got their device link back show their real one again. */
  const settle = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !done.current.size) return;
    const back = new Set<string>();
    editor.state.doc.descendants((node) => {
      if (node.type.name === "image" && typeof node.attrs.src === "string" && done.current.has(node.attrs.src)) back.add(node.attrs.src);
    });
    for (const src of back) swap(src, done.current.get(src)!);
  }, [editorRef, swap]);

  useEffect(
    () => () => {
      for (const u of blobs.current) URL.revokeObjectURL(u);
    },
    []
  );

  return { uploading, insert, fromHtml, forSave, settle, pending: () => busy.current.size > 0 };
}
