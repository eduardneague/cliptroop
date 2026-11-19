"use client";

import { useEffect, useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { pictureSrc } from "../lib/paste-images";
import { draggedWidth, growth, keyedWidth, movingSides, narrowest, type PictureSide } from "../lib/picture-width";
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
  const barRef = useRef<HTMLDivElement>(null);
  // Its width while a side is dragged (shown at once, saved once, as it's let go: 1.55.3).
  const [drag, setDrag] = useState<{ pct: number; snapped: boolean; side: PictureSide } | null>(null);
  const editable = editor.isEditable;
  // How it sits on the page now: how wide it shows (one never resized shows as it came), the narrowest it can go, and
  // whether it's narrower than its bar (then the bar sits above it, from its side, not over it and its handles, and
  // no wider than the room from there to the screen's edge).
  const [fit, setFit] = useState({ pct: null as number | null, floor: narrowest(0), narrow: false, room: 0 });
  useEffect(() => {
    const box = boxRef.current;
    const page = box?.parentElement;
    if (!box || !page || typeof ResizeObserver === "undefined") return;
    const check = () => {
      const r = box.getBoundingClientRect();
      const full = page.getBoundingClientRect().width;
      const screen = document.documentElement.clientWidth;
      const next = {
        pct: r.width > 0 && full > 0 ? Math.round((r.width / full) * 100) : null,
        floor: narrowest(full),
        narrow: r.width > 0 && r.width < (barRef.current?.scrollWidth ?? 0) + 24,
        room: Math.max(160, Math.round(align === "right" ? r.right - 16 : align === "center" ? screen - 32 : screen - 16 - r.left)),
      };
      setFit((f) => (f.pct === next.pct && f.floor === next.floor && f.narrow === next.narrow && f.room === next.room ? f : next));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(box);
    ro.observe(page);
    return () => ro.disconnect();
  }, [editable, frame, src, align]);
  const shown = drag?.pct ?? width ?? fit.pct ?? 100;
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

  /**
   * Resizing (1.55.3; the owner: "its not great the way it is right now with that corner thing, i want to make it more
   * natural"): a handle on each side that moves (the right one of a picture on the left, the left one of a picture on
   * the right, both of one in the middle), the edge following the pointer and the height with it. It settles on a
   * quarter, a third, a half, two thirds, three quarters or the whole page when it's close, says how wide it is, and
   * is saved once, as it's let go (one undo, one change for the others writing with you).
   */
  function startResize(e: React.PointerEvent, side: PictureSide) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current;
    const container = box?.parentElement;
    if (!box || !container) return;
    selectMe();
    const startX = e.clientX;
    const startW = box.getBoundingClientRect().width;
    const full = container.getBoundingClientRect().width;
    const grow = growth(side, align);
    let last: { pct: number; snapped: boolean } | null = null;
    const html = document.documentElement;
    const was = { cursor: html.style.cursor, select: html.style.userSelect };
    html.style.cursor = "ew-resize";
    html.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      const next = draggedWidth(startW, ev.clientX - startX, full, grow);
      if (last?.pct === next.pct && last.snapped === next.snapped) return;
      last = next;
      setDrag({ ...next, side });
    };
    const done = (keep: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", esc, true);
      html.style.cursor = was.cursor;
      html.style.userSelect = was.select;
      setDrag(null);
      if (keep && last && last.pct !== width) updateAttributes({ width: last.pct });
    };
    const up = () => done(true);
    const cancel = () => done(false);
    // Escape: back to how it was.
    const esc = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      done(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", esc, true);
  }

  /** The picture selected (its bar shows) and the script focused (Ctrl+Z undoes the resize), as a click on it does. */
  function selectMe() {
    const at = typeof getPos === "function" ? getPos() : undefined;
    if (typeof at !== "number") return;
    const { state, view } = editor;
    if (!(state.selection instanceof NodeSelection && state.selection.from === at)) view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, at)));
    if (!view.hasFocus()) view.focus();
  }

  /** A handle from the keyboard (lib/picture-width.ts), from the width it shows. */
  function keyResize(e: React.KeyboardEvent, side: PictureSide) {
    const next = keyedWidth(width ?? fit.pct ?? 100, e.key, e.shiftKey, side, fit.floor);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (next !== width) updateAttributes({ width: next });
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
        className={`group relative inline-block max-w-full rounded-lg ${(selected || drag) && editable ? `ring-2 ${frame ? "ring-frame" : "ring-amber"} ring-offset-2 ring-offset-transparent` : ""}`}
        style={{ width: drag ? `${drag.pct}%` : width ? `${width}%` : undefined }}
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

        {/* Toolbar: always for editors when selected; view/download on hover for readers. Over the picture's top; above
            it, from its side, when the picture is narrower than the bar (1.55.3: it hung off the page and over the
            handle), its gap below counting as the bar so the pointer can cross it. */}
        <div
          contentEditable={false}
          className={`absolute z-10 ${
            fit.narrow ? `bottom-full pb-2 ${align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"}` : "top-2 left-1/2 -translate-x-1/2"
          } ${drag ? "pointer-events-none" : selected && editable ? "" : "pointer-events-none group-hover:pointer-events-auto"}`}
        >
          <div
            ref={barRef}
            style={fit.narrow ? { maxWidth: fit.room } : undefined}
            className={`flex flex-nowrap max-w-[calc(100vw-2rem)] overflow-x-auto no-scrollbar items-center gap-0.5 rounded-lg bg-black/80 backdrop-blur px-1 py-1 shadow-lg transition-opacity ${
              drag ? "opacity-0" : selected && editable ? "opacity-100" : "opacity-0 group-hover:opacity-100"
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
        </div>

        {/* The sides that move: a slim handle on each, on hover and while it's selected (on a touch screen: selected,
            and wider to the finger). */}
        {editable &&
          movingSides(align).map((side) => (
            <span
              key={side}
              contentEditable={false}
              role="slider"
              tabIndex={0}
              aria-label={`Picture width (drag the ${side} side)`}
              aria-orientation="horizontal"
              aria-valuemin={fit.floor}
              aria-valuemax={100}
              aria-valuenow={shown}
              aria-valuetext={`${shown}% of the page`}
              title="Drag to resize · double-click: the whole width"
              onPointerDown={(e) => startResize(e, side)}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (width !== 100) updateAttributes({ width: 100 });
              }}
              onKeyDown={(e) => keyResize(e, side)}
              className={`script-image-handle absolute top-0 bottom-0 ${side === "left" ? "-left-2 [@media(pointer:coarse)]:-left-4" : "-right-2 [@media(pointer:coarse)]:-right-4"} z-[5] w-4 [@media(pointer:coarse)]:w-8 flex items-center justify-center cursor-ew-resize touch-none outline-none transition-opacity ${
                drag?.side === side ? "opacity-100" : selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              }`}
            >
              <span
                aria-hidden
                className={`block w-1.5 [@media(pointer:coarse)]:w-2 h-[min(3rem,40%)] min-h-[1.25rem] rounded-full shadow-[0_1px_4px_rgb(0_0_0/0.45)] ring-1 transition-colors ${
                  drag?.side === side && drag.snapped ? "bg-amber ring-white/80" : "bg-white ring-black/25"
                }`}
              />
            </span>
          ))}
        {/* How wide, while it's dragged. */}
        {drag && (
          <span contentEditable={false} className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 z-10 rounded-md bg-black/80 text-white px-2 h-7 inline-flex items-center text-[12px] font-bold tabular-nums shadow-lg" aria-hidden>
            {drag.pct === 100 ? "Whole width" : `${drag.pct}%`}
          </span>
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
