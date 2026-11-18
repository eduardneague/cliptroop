"use client";

import { useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { pictureSrc } from "../lib/paste-images";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ChevronDownIcon,
  DownloadIcon,
  ExpandIcon,
  FrameIcon,
  TrashIcon,
} from "@/components/ui/icons";

type Align = "left" | "center" | "right";

/** Download a (cross-origin) image as a file. Only a picture's web address (1.31.15: never javascript: or the like). */
export async function downloadImage(raw: string, name = "script-image") {
  const src = pictureSrc(raw);
  if (!src) return;
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    if (/^https?:\/\//i.test(src)) window.open(src, "_blank", "noopener");
  }
}

/** A frame guide's picture (1.54.0): opening it is the script's (it knows the frame library). */
export const FRAME_OPEN_EVENT = "vp-frame-open";

function ImageView({ node, updateAttributes, deleteNode, selected, editor, getPos }: ReactNodeViewProps) {
  const { src: raw, alt, align, width, frame, frameN, frameTitle } = node.attrs as { src: string; alt: string | null; align: Align; width: number | null; frame: string | null; frameN: number | null; frameTitle: string | null };
  // What the picture knows of its frame shows at once (the rest comes with the library).
  const openFrame = () =>
    frame &&
    editor.view.dom.dispatchEvent(
      new CustomEvent(FRAME_OPEN_EVENT, {
        detail: { id: frame, ref: { id: frame, number: Number(frameN) || 0, title: frameTitle ?? "", url: src, thumb: src, w: 1920, h: 1080, tint: null, collection: null } },
        bubbles: true,
      })
    );
  // Only a web address or this device's upload is shown (1.31.15); anything else stays a blank frame.
  const src = pictureSrc(raw) ?? "";
  const [viewing, setViewing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const editable = editor.isEditable;
  // Shown from the device while it uploads (1.27.5: pasted and dropped pictures).
  const uploading = typeof src === "string" && src.startsWith("blob:");
  // Someone else's, still on its way up from their device (1.55.0, writing live): a blank frame until it's up.
  const [unseen, setUnseen] = useState<string | null>(null);
  const away = uploading && unseen === src;

  /** Swap this image with the block above (-1) or below (+1). */
  function move(dir: -1 | 1) {
    const from = typeof getPos === "function" ? getPos() : undefined;
    if (typeof from !== "number") return;
    const { state, view } = editor;
    const $pos = state.doc.resolve(from);
    const parent = $pos.parent;
    const index = $pos.index();
    const neighbour = parent.maybeChild(index + dir);
    if (!neighbour) return;
    const size = node.nodeSize;
    const tr = state.tr.delete(from, from + size);
    const target = dir < 0 ? from - neighbour.nodeSize : from + neighbour.nodeSize;
    tr.insert(target, node);
    tr.setSelection(NodeSelection.create(tr.doc, target));
    view.dispatch(tr.scrollIntoView());
    view.focus();
  }

  const index = (() => {
    const from = typeof getPos === "function" ? getPos() : undefined;
    if (typeof from !== "number") return { first: true, last: true };
    const $pos = editor.state.doc.resolve(from);
    return { first: $pos.index() === 0, last: $pos.index() === $pos.parent.childCount - 1 };
  })();

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current;
    const container = box?.parentElement;
    if (!box || !container) return;
    const startX = e.clientX;
    const startW = box.getBoundingClientRect().width;
    const full = container.getBoundingClientRect().width;
    const sign = align === "right" ? -1 : 1;
    const move = (ev: PointerEvent) => {
      const w = Math.min(full, Math.max(full * 0.15, startW + sign * (ev.clientX - startX) * (align === "center" ? 2 : 1)));
      updateAttributes({ width: Math.round((w / full) * 100) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const btn =
    "w-8 h-8 rounded-md flex items-center justify-center text-white/85 hover:text-white hover:bg-white/15 transition-colors";
  const on = "bg-white/20 text-white";

  return (
    <NodeViewWrapper
      className="script-image my-4 flex"
      style={{ justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}
    >
      <div
        ref={boxRef}
        // 1.54.1: a picture is never dragged (dragging one dropped a copy of it: the owner, "i dont want to be able to do
        // this"). It moves with the arrows on its bar.
        onDragStart={(e) => e.preventDefault()}
        className={`group relative inline-block max-w-full rounded-lg ${selected && editable ? `ring-2 ${frame ? "ring-frame" : "ring-amber"} ring-offset-2 ring-offset-transparent` : ""}`}
        style={{ width: width ? `${width}%` : undefined }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src || undefined}
          alt={alt ?? ""}
          draggable={false}
          loading="lazy"
          decoding="async"
          className={`block w-full h-auto rounded-lg transition-opacity ${uploading ? "opacity-70" : ""} ${frame ? "script-frame-pic" : ""} ${away ? "hidden" : ""}`}
          onError={() => uploading && setUnseen(src)}
          onDoubleClick={() => (frame ? openFrame() : setViewing(true))}
        />
        {away && <span aria-hidden className="block w-full aspect-[16/10] rounded-lg bg-surface-2" />}
        {/* A frame guide's picture says which one it is (fixed colours: it sits on the picture). */}
        {frame && (
          <button
            type="button"
            contentEditable={false}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openFrame}
            title="Open the frame guide"
            className="script-frame-tag absolute left-2 bottom-2 max-w-[calc(100%-1rem)] inline-flex items-center gap-1.5 rounded-md bg-black/70 text-white pl-1.5 pr-2 h-7 text-[12px] font-semibold shadow-lg backdrop-blur-[2px] hover:bg-black/85"
          >
            <FrameIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-bold tabular-nums">#{frameN ?? "?"}</span>
            {frameTitle ? <span className="truncate opacity-90">{frameTitle}</span> : null}
          </button>
        )}
        {uploading && (
          <span contentEditable={false} className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="polite">
            <span className="inline-flex items-center gap-2 rounded-lg bg-black/70 text-white px-2.5 h-8 text-[12.5px] font-semibold shadow-lg">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden />
              Uploading…
            </span>
          </span>
        )}

        {/* Toolbar: always for editors when selected; view/download on hover for readers. */}
        <div
          contentEditable={false}
          className={`absolute left-1/2 -translate-x-1/2 top-2 z-10 flex flex-nowrap max-w-[calc(100vw-2rem)] overflow-x-auto no-scrollbar items-center gap-0.5 rounded-lg bg-black/80 backdrop-blur px-1 py-1 shadow-lg transition-opacity ${
            selected && editable ? "opacity-100" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
          }`}
        >
          {editable && (
            <>
              <button type="button" title="Move up" aria-label="Move image up" disabled={index.first} className={`${btn} disabled:opacity-30`} onClick={() => move(-1)}>
                <ChevronDownIcon className="w-4 h-4 rotate-180" />
              </button>
              <button type="button" title="Move down" aria-label="Move image down" disabled={index.last} className={`${btn} disabled:opacity-30`} onClick={() => move(1)}>
                <ChevronDownIcon className="w-4 h-4" />
              </button>
              <span className="w-px h-5 bg-white/20 mx-0.5" />
              {([
                ["left", AlignLeftIcon, "Align left"],
                ["center", AlignCenterIcon, "Center"],
                ["right", AlignRightIcon, "Align right"],
              ] as const).map(([a, Icon, label]) => (
                <button key={a} type="button" title={label} aria-label={label} className={`${btn} ${align === a ? on : ""}`} onClick={() => updateAttributes({ align: a })}>
                  <Icon className="w-4 h-4" />
                </button>
              ))}
              <span className="w-px h-5 bg-white/20 mx-0.5" />
              {([
                [33, "S"],
                [60, "M"],
                [100, "L"],
              ] as const).map(([w, label]) => (
                <button key={w} type="button" title={`${w}% wide`} className={`${btn} text-[12px] font-bold ${width === w ? on : ""}`} onClick={() => updateAttributes({ width: w })}>
                  {label}
                </button>
              ))}
              <span className="w-px h-5 bg-white/20 mx-0.5" />
            </>
          )}
          {src && (
            <>
              {frame && (
                <button type="button" title="Open the frame guide" aria-label="Open the frame guide" className={btn} onClick={openFrame}>
                  <FrameIcon className="w-4 h-4" />
                </button>
              )}
              <button type="button" title="View full size" aria-label="View full size" className={btn} onClick={() => setViewing(true)}>
                <ExpandIcon className="w-4 h-4" />
              </button>
              <button type="button" title="Download" aria-label="Download image" className={btn} onClick={() => downloadImage(src)}>
                <DownloadIcon className="w-4 h-4" />
              </button>
            </>
          )}
          {editable && (
            <button type="button" title="Remove" aria-label="Remove image" className={`${btn} hover:!bg-red/70`} onClick={() => deleteNode()}>
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {editable && selected && (
          <span
            contentEditable={false}
            onPointerDown={startResize}
            title="Drag to resize"
            className={`absolute bottom-1.5 ${align === "right" ? "left-1.5 cursor-nesw-resize" : "right-1.5 cursor-nwse-resize"} w-4 h-4 rounded-sm bg-amber border-2 border-white shadow`}
          />
        )}
      </div>
      {viewing && src && <ImageLightbox url={src} alt={alt ?? ""} onClose={() => setViewing(false)} />}
    </NodeViewWrapper>
  );
}

/** Image block with alignment and width (percent of the page). 1.54.1: on the left unless moved; never dragged. */
export const ScriptImage = Image.extend({
  draggable: false,
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "left",
        parseHTML: (el) => (el.getAttribute("data-align") as Align) || "left",
        renderHTML: (attrs) => ({ "data-align": attrs.align }),
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute("data-width");
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { "data-width": attrs.width } : {}),
      },
      // 1.54.0: a frame guide's picture: the frame's id, its number and name (as when it was put in). An older page
      // that doesn't know these keeps the picture and drops them.
      frame: {
        default: null,
        parseHTML: (el) => (/^[0-9a-f-]{36}$/i.test(el.getAttribute("data-frame") ?? "") ? el.getAttribute("data-frame") : null),
        renderHTML: (attrs) => (attrs.frame ? { "data-frame": attrs.frame } : {}),
      },
      frameN: {
        default: null,
        parseHTML: (el) => {
          const n = Number(el.getAttribute("data-frame-n"));
          return n > 0 ? n : null;
        },
        renderHTML: (attrs) => (attrs.frameN ? { "data-frame-n": attrs.frameN } : {}),
      },
      frameTitle: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-frame-title"),
        renderHTML: (attrs) => (attrs.frameTitle ? { "data-frame-title": attrs.frameTitle } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
}).configure({ inline: false, allowBase64: false });
