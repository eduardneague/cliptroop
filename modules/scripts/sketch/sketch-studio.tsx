"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { sounds } from "@/lib/sounds";
import {
  COLORS,
  FILLS,
  INK,
  PAPER,
  setPaper,
  shownOn,
  STAMPS,
  STICKY_COLORS,
  bounds,
  drawEl,
  exportPng,
  font,
  hit,
  insideRect,
  isLine,
  isText,
  moved,
  resizedBox,
  scaled,
  setFont,
  textHeight,
  toWorld,
  uid,
  unionBounds,
  type BoxEl,
  type El,
  type Handle,
  type LineEl,
  type Paper,
  type Pt,
  type Rect,
  type Scene,
  type ShapeKind,
  type StickyEl,
  type StrokeEl,
  type TextEl,
} from "./engine";

/**
 * Sketch Studio: a quick drawing board for editing ideas. Pen, marker,
 * eraser, shapes, lines and arrows, text, sticky notes, stamps and images;
 * select, move, resize, rotate; undo / redo; zoom and pan (pinch on
 * touch). Never closes by accident: leaving with a drawing asks first.
 */

type Tool = "select" | "hand" | "pen" | "marker" | "eraser" | "shape" | "line" | "arrow" | "text" | "sticky" | "stamp";
type Cam = { ox: number; oy: number; z: number };
type Style = { color: string; size: number; fill: string | null; dash: boolean; fs: number; bold: boolean; sticky: string; stamp: string; shape: ShapeKind };

const PEN_SIZES = [2, 4, 7, 12];
const TEXT_SIZES = [16, 24, 36, 56];
const DRAW_TOOLS: Tool[] = ["pen", "marker", "eraser", "shape", "line", "arrow"];

type Drag =
  | { mode: "draw"; pts: Pt[] }
  | { mode: "erase"; ids: Set<string> }
  | { mode: "create"; sx: number; sy: number; x: number; y: number }
  | { mode: "move"; sx: number; sy: number; base: El[]; ids: string[]; movedAny: boolean }
  | { mode: "resize"; handle: Handle; base: El[]; ids: string[]; box: Rect }
  | { mode: "rotate"; base: El[]; id: string }
  | { mode: "endpoint"; handle: "p1" | "p2"; base: El[]; id: string }
  | { mode: "marquee"; sx: number; sy: number; x: number; y: number; add: boolean }
  | { mode: "pan"; px: number; py: number };

export type SketchResult = { scene: Scene; blob: Blob; w: number; h: number };

export function SketchStudio({ initial, onCancel, onConfirm, title = "Sketch your idea" }: { initial: Scene | null; onCancel: () => void; onConfirm: (r: SketchResult) => void; title?: string }) {
  const confirm = useConfirm();
  const toast = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const measureCtx = useRef<CanvasRenderingContext2D | null>(null);

  // The drawing lives in refs (drawn every frame without re-rendering React);
  // `tick` re-renders the panels when something they show changes.
  const elsRef = useRef<El[]>(initial?.els ?? []);
  const past = useRef<El[][]>([]);
  const future = useRef<El[][]>([]);
  const [sel, setSelState] = useState<string[]>([]);
  const selRef = useRef<string[]>([]);
  const cam = useRef<Cam>({ ox: 0, oy: 0, z: 1 });
  const [zoom, setZoom] = useState(1);
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);
  const [tool, setToolState] = useState<Tool>("pen");
  const toolRef = useRef<Tool>("pen");
  const [style, setStyle] = useState<Style>({ color: COLORS[0], size: 4, fill: null, dash: false, fs: 24, bold: false, sticky: STICKY_COLORS[0], stamp: STAMPS[0], shape: "rect" });
  const styleRef = useRef(style);
  styleRef.current = style;
  const [grid, setGrid] = useState(true);
  // White or black paper: the drawing's own choice, else what you used last.
  const [paper, setPaperState] = useState<Paper>(() => {
    if (initial?.paper) return initial.paper;
    try {
      return localStorage.getItem("vp-sketch-paper") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const paperRef = useRef(paper);
  paperRef.current = paper;
  const togglePaper = () => {
    const next: Paper = paper === "dark" ? "light" : "dark";
    setPaperState(next);
    try {
      localStorage.setItem("vp-sketch-paper", next);
    } catch {}
  };
  const [editing, setEditing] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) return;
    const t = requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(t);
  }, [editing]);
  const [menu, setMenu] = useState<"shape" | "stamp" | null>(null);
  const [busy, setBusy] = useState(false);

  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const pinch = useRef<{ d: number; mx: number; my: number; cam: Cam } | null>(null);
  const penSeen = useRef(false);
  const spaceDown = useRef(false);
  const frame = useRef(0);
  const clipboard = useRef<El[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const setSel = useCallback((ids: string[]) => {
    selRef.current = ids;
    setSelState(ids);
  }, []);
  const setTool = useCallback((t: Tool) => {
    toolRef.current = t;
    setToolState(t);
    setMenu(null);
    if (t !== "select") setSel([]);
  }, [setSel]);

  const dirty = () => past.current.length > 0 || elsRef.current !== (initial?.els ?? elsRef.current);

  // ---- coordinates -----------------------------------------------------------
  const toWorldPt = (sx: number, sy: number): [number, number] => [(sx - cam.current.ox) / cam.current.z, (sy - cam.current.oy) / cam.current.z];
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  // ---- drawing ---------------------------------------------------------------
  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const { ox, oy, z } = cam.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sheet = PAPER[paperRef.current];
    setPaper(paperRef.current);
    ctx.fillStyle = sheet.bg;
    ctx.fillRect(0, 0, W, H);
    if (grid) {
      // Dot grid that follows the camera.
      const step = 24 * z;
      if (step > 6) {
        ctx.fillStyle = sheet.dots;
        const sx = ((ox % step) + step) % step;
        const sy = ((oy % step) + step) % step;
        for (let x = sx; x < W; x += step) for (let y = sy; y < H; y += step) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
    const d = drag.current;
    const erasing = d?.mode === "erase" ? d.ids : null;
    for (const e of elsRef.current) {
      if (erasing?.has(e.id)) ctx.globalAlpha = 0.2;
      drawEl(ctx, e, () => schedule(), { hideText: e.id === editingRef.current });
      ctx.globalAlpha = 1;
    }
    // In progress: a stroke being drawn, a shape being dragged out.
    if (d?.mode === "draw" && d.pts.length) {
      const el = strokeFrom(d.pts, toolRef.current === "marker" ? "marker" : "pen", styleRef.current);
      if (el) drawEl(ctx, el, () => {});
    }
    if (d?.mode === "create") {
      const el = createdEl(d, toolRef.current, styleRef.current, false);
      if (el) drawEl(ctx, el, () => {});
    }
    // Selection.
    const chosen = elsRef.current.filter((e) => selRef.current.includes(e.id));
    const hs = 1 / z;
    ctx.lineWidth = 1.5 * hs;
    ctx.strokeStyle = "#E8630D";
    ctx.fillStyle = "#FFFFFF";
    const handleAt = (x: number, y: number, round = false) => {
      ctx.beginPath();
      if (round) ctx.arc(x, y, 5.5 * hs, 0, Math.PI * 2);
      else ctx.rect(x - 4.5 * hs, y - 4.5 * hs, 9 * hs, 9 * hs);
      ctx.fill();
      ctx.stroke();
    };
    if (chosen.length === 1 && !editingRef.current) {
      const e = chosen[0];
      if (isLine(e)) {
        handleAt(e.x1, e.y1, true);
        handleAt(e.x2, e.y2, true);
      } else {
        ctx.save();
        ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
        ctx.rotate(e.rot);
        ctx.strokeRect(-e.w / 2, -e.h / 2, e.w, e.h);
        ctx.beginPath();
        ctx.moveTo(0, -e.h / 2);
        ctx.lineTo(0, -e.h / 2 - 22 * hs);
        ctx.stroke();
        ctx.restore();
        for (const [h, [x, y]] of boxHandles(e, z)) handleAt(x, y, h === "rot");
      }
    } else if (chosen.length > 1) {
      const b = unionBounds(chosen)!;
      ctx.setLineDash([5 * hs, 4 * hs]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
      for (const [x, y] of [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w, b.y + b.h],
        [b.x, b.y + b.h],
      ])
        handleAt(x, y);
    }
    if (d?.mode === "marquee") {
      ctx.fillStyle = "rgba(232,99,13,0.08)";
      ctx.strokeStyle = "rgba(232,99,13,0.7)";
      const r = norm(d.sx, d.sy, d.x, d.y);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, paper]);
  const editingRef = useRef<string | null>(null);
  editingRef.current = editing;
  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);
  useEffect(() => schedule(), [schedule, sel, editing, grid, paper]);

  // Canvas size follows the window (sharp on high-DPI screens).
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    setFont(getComputedStyle(document.body).fontFamily);
    measureCtx.current = document.createElement("canvas").getContext("2d");
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(wrap.clientWidth * dpr);
      canvas.height = Math.round(wrap.clientHeight * dpr);
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
      schedule();
    };
    fit();
    // Start centred on the existing drawing (or the middle).
    const b = unionBounds(elsRef.current);
    if (b) zoomToFit(b, false);
    else cam.current = { ox: wrap.clientWidth / 2 - 300, oy: wrap.clientHeight / 2 - 200, z: 1 };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- history ---------------------------------------------------------------
  const commit = useCallback(
    (next: El[], before: El[] = elsRef.current) => {
      if (next === before) return;
      past.current.push(before);
      if (past.current.length > 120) past.current.shift();
      future.current = [];
      elsRef.current = next;
      rerender();
      schedule();
    },
    [schedule]
  );
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(elsRef.current);
    elsRef.current = prev;
    setSel(selRef.current.filter((id) => prev.some((e) => e.id === id)));
    rerender();
    schedule();
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(elsRef.current);
    elsRef.current = next;
    setSel(selRef.current.filter((id) => next.some((e) => e.id === id)));
    rerender();
    schedule();
  };

  // ---- camera ----------------------------------------------------------------
  const setCam = (c: Cam) => {
    cam.current = c;
    setZoom(c.z);
    schedule();
  };
  const zoomAt = (sx: number, sy: number, factor: number) => {
    const { ox, oy, z } = cam.current;
    const nz = Math.max(0.1, Math.min(8, z * factor));
    setCam({ z: nz, ox: sx - ((sx - ox) / z) * nz, oy: sy - ((sy - oy) / z) * nz });
  };
  function zoomToFit(b: Rect | null = unionBounds(elsRef.current), update = true) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (!b) return setCam({ ox: wrap.clientWidth / 2 - 300, oy: wrap.clientHeight / 2 - 200, z: 1 });
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const z = Math.max(0.1, Math.min(2, Math.min((W - 120) / Math.max(b.w, 1), (H - 160) / Math.max(b.h, 1))));
    const c = { z, ox: W / 2 - (b.x + b.w / 2) * z, oy: H / 2 - (b.y + b.h / 2) * z };
    if (update) setCam(c);
    else {
      cam.current = c;
      setZoom(z);
    }
  }

  // ---- elements ----------------------------------------------------------------
  const add = (el: El, select = true) => {
    commit([...elsRef.current, el]);
    if (select) {
      toolRef.current = "select";
      setToolState("select");
      setSel([el.id]);
    }
    sounds.pop();
  };
  const fixTextHeight = (e: TextEl): TextEl => (measureCtx.current ? { ...e, h: textHeight(measureCtx.current, e) } : e);

  const startText = (wx: number, wy: number) => {
    const s = styleRef.current;
    const el: TextEl = fixTextHeight({ id: uid(), t: "text", x: wx, y: wy - s.fs * 0.65, w: 260, h: s.fs * 1.3, rot: 0, text: "", color: s.color === "#FFFFFF" ? COLORS[0] : s.color, fs: s.fs, bold: s.bold });
    commit([...elsRef.current, el]);
    toolRef.current = "select";
    setToolState("select");
    setSel([el.id]);
    setEditing(el.id);
  };
  const startSticky = (wx: number, wy: number) => {
    const el: StickyEl = { id: uid(), t: "sticky", x: wx - 90, y: wy - 90, w: 180, h: 180, rot: 0, text: "", color: styleRef.current.sticky };
    commit([...elsRef.current, el]);
    toolRef.current = "select";
    setToolState("select");
    setSel([el.id]);
    setEditing(el.id);
    sounds.pop();
  };

  /** Apply a style change to the selection (and remember it for the next things you draw). */
  const applyStyle = (patch: Partial<Style>) => {
    setStyle((s) => ({ ...s, ...patch }));
    const ids = selRef.current;
    if (!ids.length) return;
    const next = elsRef.current.map((e) => {
      if (!ids.includes(e.id)) return e;
      let n: El = e;
      if (patch.color !== undefined && "color" in e && e.t !== "sticky") n = { ...n, color: patch.color } as El;
      if (patch.sticky !== undefined && e.t === "sticky") n = { ...n, color: patch.sticky } as El;
      if (patch.size !== undefined && "size" in e) n = { ...n, size: patch.size } as El;
      if (patch.fill !== undefined && "fill" in e) n = { ...n, fill: patch.fill } as El;
      if (patch.dash !== undefined && "dash" in e) n = { ...n, dash: patch.dash } as El;
      if (patch.shape !== undefined && "fill" in e) n = { ...n, t: patch.shape } as El;
      if (e.t === "text" && (patch.fs !== undefined || patch.bold !== undefined)) n = fixTextHeight({ ...(n as TextEl), fs: patch.fs ?? e.fs, bold: patch.bold ?? e.bold });
      return n;
    });
    commit(next);
  };

  const removeSelected = () => {
    const ids = selRef.current;
    if (!ids.length) return;
    commit(elsRef.current.filter((e) => !ids.includes(e.id)));
    setSel([]);
  };
  const duplicate = (els: El[] = elsRef.current.filter((e) => selRef.current.includes(e.id)), offset = 24) => {
    if (!els.length) return;
    const copies = els.map((e) => ({ ...moved(e, offset, offset), id: uid() }));
    commit([...elsRef.current, ...copies]);
    setSel(copies.map((c) => c.id));
  };
  const reorder = (front: boolean) => {
    const ids = selRef.current;
    if (!ids.length) return;
    const chosen = elsRef.current.filter((e) => ids.includes(e.id));
    const rest = elsRef.current.filter((e) => !ids.includes(e.id));
    commit(front ? [...rest, ...chosen] : [...chosen, ...rest]);
  };

  async function insertImage(file: File) {
    if (!file.type.startsWith("image/")) return;
    const src = await downscale(file, 1400);
    if (!src) return toast.error("Couldn't read that image.");
    const img = new Image();
    img.onload = () => {
      const wrap = wrapRef.current!;
      const { z } = cam.current;
      const maxW = (wrap.clientWidth * 0.6) / z;
      const maxH = (wrap.clientHeight * 0.6) / z;
      const k = Math.min(1, maxW / img.width, maxH / img.height);
      const w = img.width * k;
      const h = img.height * k;
      const [cx, cy] = toWorldPt(wrap.clientWidth / 2, wrap.clientHeight / 2);
      add({ id: uid(), t: "image", x: cx - w / 2, y: cy - h / 2, w, h, rot: 0, src });
    };
    img.src = src;
  }

  // ---- pointer input -------------------------------------------------------------
  function selectedHandle(sx: number, sy: number): Handle | null {
    const chosen = elsRef.current.filter((e) => selRef.current.includes(e.id));
    const z = cam.current.z;
    const near = (wx: number, wy: number) => Math.hypot(wx * z + cam.current.ox - sx, wy * z + cam.current.oy - sy) <= 13;
    if (chosen.length === 1) {
      const e = chosen[0];
      if (isLine(e)) return near(e.x1, e.y1) ? "p1" : near(e.x2, e.y2) ? "p2" : null;
      for (const [h, [x, y]] of boxHandles(e, z)) if (near(x, y)) return h;
      return null;
    }
    if (chosen.length > 1) {
      const b = unionBounds(chosen)!;
      const corners: [Handle, number, number][] = [
        ["nw", b.x, b.y],
        ["ne", b.x + b.w, b.y],
        ["se", b.x + b.w, b.y + b.h],
        ["sw", b.x, b.y + b.h],
      ];
      for (const [h, x, y] of corners) if (near(x, y)) return h;
    }
    return null;
  }
  const topHit = (wx: number, wy: number) => {
    const tol = 6 / cam.current.z;
    for (let i = elsRef.current.length - 1; i >= 0; i--) if (hit(elsRef.current[i], wx, wy, tol)) return elsRef.current[i];
    return null;
  };

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (editingRef.current) {
      commitText();
      return;
    }
    setMenu(null);
    const canvas = e.currentTarget;
    canvas.setPointerCapture(e.pointerId);
    const [sx, sy] = local(e);
    pointers.current.set(e.pointerId, { x: sx, y: sy, type: e.pointerType });
    if (e.pointerType === "pen") penSeen.current = true;
    // Two fingers: pinch to zoom and pan.
    if (pointers.current.size === 2) {
      drag.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: { ...cam.current } };
      schedule();
      return;
    }
    if (pointers.current.size > 2) return;
    const t = toolRef.current;
    const [wx, wy] = toWorldPt(sx, sy);
    const touchPans = e.pointerType === "touch" && penSeen.current && DRAW_TOOLS.includes(t);
    if (t === "hand" || spaceDown.current || e.button === 1 || touchPans) {
      drag.current = { mode: "pan", px: sx, py: sy };
      return;
    }
    if (e.button === 2) return;
    if (t === "pen" || t === "marker") {
      drag.current = { mode: "draw", pts: [[wx, wy, e.pointerType === "pen" ? e.pressure || 0.5 : 0.5]] };
      schedule();
      return;
    }
    if (t === "eraser") {
      const ids = new Set<string>();
      const h = topHit(wx, wy);
      if (h) ids.add(h.id);
      drag.current = { mode: "erase", ids };
      schedule();
      return;
    }
    if (t === "shape" || t === "line" || t === "arrow") {
      drag.current = { mode: "create", sx: wx, sy: wy, x: wx, y: wy };
      return;
    }
    // The text box opens right away; stop the browser from taking focus back on this press.
    if (t === "text" || t === "sticky") {
      e.preventDefault();
      return t === "text" ? startText(wx, wy) : startSticky(wx, wy);
    }
    if (t === "stamp") {
      const s = 72 / Math.max(0.5, cam.current.z);
      return add({ id: uid(), t: "stamp", x: wx - s / 2, y: wy - s / 2, w: s, h: s, rot: 0, char: styleRef.current.stamp }, false);
    }
    // Select tool.
    const handle = selectedHandle(sx, sy);
    if (handle) {
      const base = elsRef.current;
      const ids = selRef.current;
      if (handle === "rot") drag.current = { mode: "rotate", base, id: ids[0] };
      else if (handle === "p1" || handle === "p2") drag.current = { mode: "endpoint", handle, base, id: ids[0] };
      else drag.current = { mode: "resize", handle, base, ids, box: unionBounds(base.filter((x) => ids.includes(x.id)))! };
      return;
    }
    const target = topHit(wx, wy);
    if (target) {
      let ids = selRef.current;
      if (e.shiftKey) ids = ids.includes(target.id) ? ids.filter((x) => x !== target.id) : [...ids, target.id];
      else if (!ids.includes(target.id)) ids = [target.id];
      setSel(ids);
      drag.current = { mode: "move", sx: wx, sy: wy, base: elsRef.current, ids, movedAny: false };
    } else {
      if (!e.shiftKey) setSel([]);
      drag.current = { mode: "marquee", sx: wx, sy: wy, x: wx, y: wy, add: e.shiftKey };
    }
    schedule();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const [sx, sy] = local(e);
    pointers.current.set(e.pointerId, { x: sx, y: sy, type: e.pointerType });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const nz = Math.max(0.1, Math.min(8, p.cam.z * (d / Math.max(p.d, 1))));
      const wx = (p.mx - p.cam.ox) / p.cam.z;
      const wy = (p.my - p.cam.oy) / p.cam.z;
      setCam({ z: nz, ox: mx - wx * nz, oy: my - wy * nz });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const [wx, wy] = toWorldPt(sx, sy);
    switch (d.mode) {
      case "pan":
        setCam({ ...cam.current, ox: cam.current.ox + sx - d.px, oy: cam.current.oy + sy - d.py });
        d.px = sx;
        d.py = sy;
        return;
      case "draw": {
        const last = d.pts[d.pts.length - 1];
        // A little smoothing for mice and fingers; pens are already smooth.
        const k = e.pointerType === "pen" ? 1 : 0.55;
        const nx = last[0] + (wx - last[0]) * k;
        const ny = last[1] + (wy - last[1]) * k;
        if (Math.hypot(nx - last[0], ny - last[1]) * cam.current.z < 1) return;
        d.pts.push([nx, ny, e.pointerType === "pen" ? e.pressure || 0.5 : 0.5]);
        break;
      }
      case "erase": {
        const tol = 8 / cam.current.z;
        for (const el of elsRef.current) if (!d.ids.has(el.id) && hit(el, wx, wy, tol)) d.ids.add(el.id);
        break;
      }
      case "create":
        d.x = wx;
        d.y = wy;
        if (e.shiftKey) {
          if (toolRef.current === "shape") {
            const s = Math.max(Math.abs(wx - d.sx), Math.abs(wy - d.sy));
            d.x = d.sx + Math.sign(wx - d.sx || 1) * s;
            d.y = d.sy + Math.sign(wy - d.sy || 1) * s;
          } else [d.x, d.y] = snap45(d.sx, d.sy, wx, wy);
        }
        break;
      case "move": {
        const dx = wx - d.sx;
        const dy = wy - d.sy;
        if (!d.movedAny && Math.hypot(dx, dy) * cam.current.z < 3) return;
        d.movedAny = true;
        elsRef.current = d.base.map((el) => (d.ids.includes(el.id) ? moved(el, dx, dy) : el));
        break;
      }
      case "resize": {
        if (d.ids.length === 1) {
          const base = d.base.find((x) => x.id === d.ids[0]) as BoxEl;
          let n = resizedBox(base, d.handle, wx, wy, e.shiftKey || base.t === "image" || base.t === "stamp");
          if (n.t === "text") n = fixTextHeight(n);
          elsRef.current = d.base.map((x) => (x.id === n.id ? n : x));
        } else {
          const b = d.box;
          const ax = d.handle.includes("w") ? b.x + b.w : b.x;
          const ay = d.handle.includes("n") ? b.y + b.h : b.y;
          let sxk = Math.max(0.05, Math.abs(wx - ax) / Math.max(b.w, 1));
          let syk = Math.max(0.05, Math.abs(wy - ay) / Math.max(b.h, 1));
          if (e.shiftKey) sxk = syk = Math.max(sxk, syk);
          elsRef.current = d.base.map((x) => (d.ids.includes(x.id) ? scaled(x, ax, ay, sxk, syk) : x));
        }
        break;
      }
      case "rotate": {
        const base = d.base.find((x) => x.id === d.id) as BoxEl;
        let a = Math.atan2(wy - (base.y + base.h / 2), wx - (base.x + base.w / 2)) + Math.PI / 2;
        if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        elsRef.current = d.base.map((x) => (x.id === d.id ? ({ ...base, rot: a } as El) : x));
        break;
      }
      case "endpoint": {
        const base = d.base.find((x) => x.id === d.id) as LineEl;
        const fixed = d.handle === "p1" ? [base.x2, base.y2] : [base.x1, base.y1];
        const [px, py] = e.shiftKey ? snap45(fixed[0], fixed[1], wx, wy) : [wx, wy];
        const n = d.handle === "p1" ? { ...base, x1: px, y1: py } : { ...base, x2: px, y2: py };
        elsRef.current = d.base.map((x) => (x.id === d.id ? n : x));
        break;
      }
      case "marquee":
        d.x = wx;
        d.y = wy;
        break;
    }
    schedule();
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    switch (d.mode) {
      case "draw": {
        const el = strokeFrom(d.pts, toolRef.current === "marker" ? "marker" : "pen", styleRef.current);
        if (el) commit([...elsRef.current, el]);
        break;
      }
      case "erase":
        if (d.ids.size) {
          commit(elsRef.current.filter((x) => !d.ids.has(x.id)));
          sounds.tick();
        }
        break;
      case "create": {
        const el = createdEl(d, toolRef.current, styleRef.current, true);
        if (el) add(el);
        break;
      }
      case "move":
        if (d.movedAny) commit(elsRef.current, d.base);
        break;
      case "resize":
      case "rotate":
      case "endpoint":
        commit(elsRef.current, d.base);
        break;
      case "marquee": {
        const r = norm(d.sx, d.sy, d.x, d.y);
        if (r.w * cam.current.z > 4 || r.h * cam.current.z > 4) {
          const inside = elsRef.current.filter((x) => insideRect(x, r)).map((x) => x.id);
          setSel(d.add ? [...new Set([...selRef.current, ...inside])] : inside);
        }
        break;
      }
    }
    schedule();
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (toolRef.current !== "select") return;
    const [sx, sy] = local(e);
    const [wx, wy] = toWorldPt(sx, sy);
    const target = topHit(wx, wy);
    if (target && isText(target)) {
      setSel([target.id]);
      setEditing(target.id);
    } else if (!target) startText(wx, wy);
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    const [sx, sy] = local(e);
    // Pinch on a trackpad (and Ctrl + wheel) zooms; scrolling pans.
    if (e.ctrlKey || e.metaKey) zoomAt(sx, sy, Math.exp(-e.deltaY * 0.01));
    else setCam({ ...cam.current, ox: cam.current.ox - e.deltaX, oy: cam.current.oy - e.deltaY });
  }

  // ---- text editing ------------------------------------------------------------------
  const textBefore = useRef<El[] | null>(null);
  useEffect(() => {
    if (editing) textBefore.current = elsRef.current;
  }, [editing]);
  const setText = (id: string, text: string) => {
    elsRef.current = elsRef.current.map((x) => (x.id !== id ? x : x.t === "text" ? fixTextHeight({ ...x, text }) : x.t === "sticky" ? { ...x, text } : x));
    rerender();
    schedule();
  };
  function commitText() {
    const id = editingRef.current;
    if (!id) return;
    setEditing(null);
    const el = elsRef.current.find((x) => x.id === id);
    const before = textBefore.current ?? elsRef.current;
    textBefore.current = null;
    // An empty text box disappears (an empty sticky note stays, it's still a note).
    if (el && el.t === "text" && !el.text.trim()) {
      const next = elsRef.current.filter((x) => x.id !== id);
      elsRef.current = before;
      commit(next, before);
      setSel([]);
      return;
    }
    const after = elsRef.current;
    elsRef.current = before;
    commit(after, before);
  }

  // ---- keyboard, paste, leaving ------------------------------------------------------
  const requestClose = useCallback(async () => {
    if (!dirty() || !elsRef.current.length) return onCancel();
    if (await confirm({ title: "Discard this sketch?", description: "Your drawing will be lost.", confirmLabel: "Discard", danger: true })) onCancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel, confirm]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = editingRef.current || (e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT";
      // The confirm popup handles its own keys.
      if (document.querySelector('[role="alertdialog"]')) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (editingRef.current) return commitText();
        if (menu) return setMenu(null);
        if (selRef.current.length) return setSel([]);
        if (toolRef.current !== "select" && toolRef.current !== "pen") return setTool("select");
        void requestClose();
        return;
      }
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      let handled = true;
      if (mod && k === "z") (e.shiftKey ? redo : undo)();
      else if (mod && k === "y") redo();
      else if (mod && k === "d") duplicate();
      else if (mod && k === "a") {
        setTool("select");
        setSel(elsRef.current.map((x) => x.id));
      } else if (mod && k === "c") clipboard.current = elsRef.current.filter((x) => selRef.current.includes(x.id));
      else if (mod && k === "x") {
        clipboard.current = elsRef.current.filter((x) => selRef.current.includes(x.id));
        removeSelected();
      } else if (mod && k === "v") handled = false; // paste event below
      else if (mod && (k === "=" || k === "+")) zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25);
      else if (mod && k === "-") zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.8);
      else if (mod && k === "0") zoomToFit();
      else if (mod) handled = false;
      else if (k === "delete" || k === "backspace") removeSelected();
      else if (k === " ") spaceDown.current = true;
      else if (k === "[") reorder(false);
      else if (k === "]") reorder(true);
      else if (k.startsWith("arrow") && selRef.current.length) {
        const step = e.shiftKey ? 10 : 1;
        const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
        const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
        commit(elsRef.current.map((x) => (selRef.current.includes(x.id) ? moved(x, dx, dy) : x)));
      } else {
        const map: Record<string, Tool> = { v: "select", h: "hand", p: "pen", m: "marker", e: "eraser", r: "shape", l: "line", a: "arrow", t: "text", n: "sticky", s: "stamp" };
        if (map[k]) setTool(map[k]);
        else if (k === "o") {
          setStyle((s) => ({ ...s, shape: "ellipse" }));
          setTool("shape");
        } else if (k === "i") fileRef.current?.click();
        else handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceDown.current = false;
    };
    const onPaste = (e: ClipboardEvent) => {
      if (editingRef.current) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void insertImage(file);
      } else if (clipboard.current.length) {
        e.preventDefault();
        duplicate(clipboard.current, 32);
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (elsRef.current.length && dirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("paste", onPaste);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("beforeunload", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, requestClose]);

  // No page scrolling underneath while the studio is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function finish() {
    if (editingRef.current) commitText();
    const els = elsRef.current;
    if (!els.length) return toast.error("Draw something first.");
    setBusy(true);
    const png = await exportPng(els, 1600, paper);
    setBusy(false);
    if (!png) return toast.error("Couldn't make the picture. Try again.");
    sounds.success();
    onConfirm({ scene: { v: 1, els, paper }, ...png });
  }

  // ---- the panels ------------------------------------------------------------------
  const chosen = elsRef.current.filter((e) => sel.includes(e.id));
  const one = chosen.length === 1 ? chosen[0] : null;
  const kindNow: string = one ? one.t : tool === "shape" ? style.shape : tool;
  const showsColor = one ? one.t !== "image" && one.t !== "stamp" : chosen.length > 1 || ["pen", "marker", "shape", "line", "arrow", "text"].includes(tool);
  const showsSize = one ? "size" in one : ["pen", "marker", "shape", "line", "arrow"].includes(tool);
  const showsFill = one ? "fill" in one : tool === "shape";
  const showsDash = one ? "dash" in one : ["shape", "line", "arrow"].includes(tool);
  const showsText = one ? one.t === "text" : tool === "text";
  const showsSticky = one ? one.t === "sticky" : tool === "sticky";
  const cur = {
    color: one && "color" in one && one.t !== "sticky" ? one.color : style.color,
    size: one && "size" in one ? one.size : style.size,
    fill: one && "fill" in one ? one.fill : style.fill,
    dash: one && "dash" in one ? one.dash : style.dash,
    fs: one && one.t === "text" ? one.fs : style.fs,
    bold: one && one.t === "text" ? one.bold : style.bold,
    sticky: one && one.t === "sticky" ? one.color : style.sticky,
  };
  const editingEl = editing ? (elsRef.current.find((x) => x.id === editing) as TextEl | StickyEl | undefined) : undefined;
  const { ox, oy, z } = cam.current;

  const toolBtn = (t: Tool, label: string, icon: React.ReactNode, key?: string, extra?: () => void) => (
    <button
      key={t}
      type="button"
      onClick={() => {
        setTool(t);
        extra?.();
      }}
      aria-label={label}
      aria-pressed={tool === t}
      title={key ? `${label} (${key.toUpperCase()})` : label}
      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${tool === t ? "bg-amber text-white shadow-sm" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
    >
      {icon}
    </button>
  );

  const tools = (
    <>
      {toolBtn("select", "Select", <I.Select />, "v")}
      {toolBtn("hand", "Move around", <I.Hand />, "h")}
      <span className="w-px h-7 lg:w-7 lg:h-px bg-line/15 mx-0.5 lg:mx-0 lg:my-0.5 flex-shrink-0" />
      {toolBtn("pen", "Pen", <I.Pen />, "p")}
      {toolBtn("marker", "Marker", <I.Marker />, "m")}
      {toolBtn("eraser", "Eraser", <I.Eraser />, "e")}
      <span className="w-px h-7 lg:w-7 lg:h-px bg-line/15 mx-0.5 lg:mx-0 lg:my-0.5 flex-shrink-0" />
      <div className="relative flex-shrink-0">
        {toolBtn("shape", "Shapes", <ShapeIcon kind={style.shape} />, "r", () => setMenu((m) => (m === "shape" ? null : "shape")))}
        {menu === "shape" && (
          <Pop className="lg:left-12 lg:top-0 bottom-12 lg:bottom-auto left-0">
            <div className="grid grid-cols-3 gap-1">
              {(["rect", "round", "ellipse", "triangle", "diamond", "star"] as ShapeKind[]).map((k) => (
                <button key={k} type="button" aria-label={k} onClick={() => { applyStyle({ shape: k }); setTool("shape"); }} className={`w-10 h-10 rounded-lg flex items-center justify-center ${style.shape === k ? "bg-amber/15 text-amber" : "hover:bg-surface-2"}`}>
                  <ShapeIcon kind={k} />
                </button>
              ))}
            </div>
          </Pop>
        )}
      </div>
      {toolBtn("line", "Line", <I.Line />, "l")}
      {toolBtn("arrow", "Arrow", <I.Arrow />, "a")}
      {toolBtn("text", "Text", <I.Text />, "t")}
      {toolBtn("sticky", "Sticky note", <I.Sticky />, "n")}
      <div className="relative flex-shrink-0">
        {toolBtn("stamp", "Stamps", <span className="text-[18px] leading-none">{style.stamp}</span>, "s", () => setMenu((m) => (m === "stamp" ? null : "stamp")))}
        {menu === "stamp" && (
          <Pop className="lg:left-12 lg:top-0 bottom-12 lg:bottom-auto right-0 lg:right-auto">
            <div className="grid grid-cols-5 gap-1">
              {STAMPS.map((c) => (
                <button key={c} type="button" onClick={() => { setStyle((s) => ({ ...s, stamp: c })); setTool("stamp"); }} className={`w-10 h-10 rounded-lg text-[20px] ${style.stamp === c ? "bg-amber/15" : "hover:bg-surface-2"}`}>
                  {c}
                </button>
              ))}
            </div>
          </Pop>
        )}
      </div>
      <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add an image" title="Add an image (I)" className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-ink-soft hover:text-ink hover:bg-surface-2">
        <I.Image />
      </button>
    </>
  );

  const swatch = (c: string, on: boolean, onClick: () => void, label: string) => (
    <button key={c} type="button" onClick={onClick} aria-label={label} aria-pressed={on} className={`w-6 h-6 rounded-full flex-shrink-0 transition-transform hover:scale-110 ${on ? "ring-2 ring-amber ring-offset-2 ring-offset-surface" : ""}`} style={{ background: shownOn(c, paper), boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />
  );
  const props = (
    <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden no-scrollbar px-1 py-1">
      {showsColor && <div className="flex items-center gap-1.5">{COLORS.map((c) => swatch(c, cur.color === c, () => applyStyle({ color: c }), c === INK ? "Ink (dark on white paper, light on black)" : `Colour ${c}`))}</div>}
      {showsSticky && <div className="flex items-center gap-1.5">{STICKY_COLORS.map((c) => swatch(c, cur.sticky === c, () => applyStyle({ sticky: c }), `Note colour ${c}`))}</div>}
      {showsSize && (
        <Seg>
          {PEN_SIZES.map((s) => (
            <button key={s} type="button" aria-label={`Thickness ${s}`} aria-pressed={cur.size === s} onClick={() => applyStyle({ size: s })} className={`w-8 h-8 rounded-md flex items-center justify-center ${cur.size === s ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
              <span className="rounded-full bg-ink" style={{ width: Math.min(16, s + 2), height: Math.min(16, s + 2) }} />
            </button>
          ))}
        </Seg>
      )}
      {showsFill && (
        <div className="flex items-center gap-1.5" aria-label="Fill">
          {FILLS.map((f) =>
            f === null ? (
              <button key="none" type="button" onClick={() => applyStyle({ fill: null })} aria-label="No fill" aria-pressed={cur.fill === null} className={`w-6 h-6 rounded-md flex-shrink-0 border border-line/30 overflow-hidden ${cur.fill === null ? "ring-2 ring-amber ring-offset-2 ring-offset-surface" : ""}`}>
                <svg viewBox="0 0 24 24" className="w-full h-full block" aria-hidden>
                  <path d="M3 21 21 3" stroke="#E5484D" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
            ) : (
              <button key={f} type="button" onClick={() => applyStyle({ fill: f })} aria-label={`Fill ${f}`} aria-pressed={cur.fill === f} className={`w-6 h-6 rounded-md flex-shrink-0 ${cur.fill === f ? "ring-2 ring-amber ring-offset-2 ring-offset-surface" : ""}`} style={{ background: f, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)" }} />
            )
          )}
        </div>
      )}
      {showsDash && (
        <button type="button" onClick={() => applyStyle({ dash: !cur.dash })} aria-pressed={cur.dash} title="Dashed" className={`h-8 px-2 rounded-md text-[12px] font-semibold ${cur.dash ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}>
          - - -
        </button>
      )}
      {showsText && (
        <Seg>
          {TEXT_SIZES.map((s, i) => (
            <button key={s} type="button" onClick={() => applyStyle({ fs: s })} aria-pressed={cur.fs === s} className={`h-8 px-2 rounded-md text-[12px] font-bold ${cur.fs === s ? "bg-surface-2" : "hover:bg-surface-2/60 text-ink-soft"}`}>
              {["S", "M", "L", "XL"][i]}
            </button>
          ))}
          <button type="button" onClick={() => applyStyle({ bold: !cur.bold })} aria-pressed={cur.bold} className={`h-8 w-8 rounded-md text-[13px] font-black ${cur.bold ? "bg-surface-2" : "text-ink-soft hover:bg-surface-2/60"}`}>
            B
          </button>
        </Seg>
      )}
      {chosen.length > 0 && (
        <Seg>
          <button type="button" onClick={() => reorder(true)} title="Bring to front (])" className="h-8 px-2 rounded-md text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2/60">Front</button>
          <button type="button" onClick={() => reorder(false)} title="Send to back ([)" className="h-8 px-2 rounded-md text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2/60">Back</button>
          <button type="button" onClick={() => duplicate()} title="Duplicate (Ctrl+D)" className="h-8 px-2 rounded-md text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2/60">Copy</button>
          <button type="button" onClick={removeSelected} title="Delete" className="h-8 px-2 rounded-md text-[12px] font-semibold text-ink-soft hover:text-red hover:bg-red/10">Delete</button>
        </Seg>
      )}
      {!showsColor && !showsSize && !showsSticky && !chosen.length && <span className="text-[12px] text-ink-soft px-2 whitespace-nowrap">{HINTS[kindNow] ?? ""}</span>}
    </div>
  );

  return createPortal(
    // Black paper turns the whole studio dark (the app's dark colours, just in here).
    <div className={`fixed inset-0 z-[150] flex flex-col bg-paper text-ink animate-[modalin_.18s_var(--ease-out)] ${paper === "dark" ? "dark" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      {/* Top bar */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 h-14 border-b border-line/10 bg-surface flex-shrink-0 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={() => void requestClose()} aria-label="Close" title="Close (Esc)" className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <I.X />
        </button>
        <div className="min-w-0">
          <div className="text-[14px] font-bold truncate">{title}</div>
          <div className="hidden sm:block text-[11px] text-ink-faint truncate">Draw, then use it in your editing idea. Pinch or Ctrl + scroll to zoom.</div>
        </div>
        <span className="flex-1" />
        <button type="button" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (Ctrl+Z)" className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-35">
          <I.Undo />
        </button>
        <button type="button" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-35">
          <I.Redo />
        </button>
        <div className="hidden md:flex items-center rounded-xl border border-line/15 ml-1">
          <button type="button" onClick={() => zoomAt((wrapRef.current?.clientWidth ?? 0) / 2, (wrapRef.current?.clientHeight ?? 0) / 2, 0.8)} aria-label="Zoom out" className="w-9 h-9 flex items-center justify-center text-ink-soft hover:text-ink">−</button>
          <button type="button" onClick={() => zoomToFit()} title="Fit the drawing (Ctrl+0)" className="min-w-[3.5rem] h-9 text-[12px] font-semibold tabular-nums text-ink-soft hover:text-ink">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => zoomAt((wrapRef.current?.clientWidth ?? 0) / 2, (wrapRef.current?.clientHeight ?? 0) / 2, 1.25)} aria-label="Zoom in" className="w-9 h-9 flex items-center justify-center text-ink-soft hover:text-ink">+</button>
        </div>
        <button
          type="button"
          onClick={togglePaper}
          aria-pressed={paper === "dark"}
          aria-label={paper === "dark" ? "White paper" : "Black paper"}
          title={paper === "dark" ? "White paper" : "Black paper"}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
        >
          <span className="w-[18px] h-[18px] rounded-[5px] border-[1.5px] border-current overflow-hidden flex" aria-hidden>
            <span className={`w-1/2 h-full ${paper === "dark" ? "bg-current" : ""}`} />
            <span className={`w-1/2 h-full ${paper === "dark" ? "" : "bg-current"}`} />
          </span>
        </button>
        <button type="button" onClick={() => setGrid((g) => !g)} aria-pressed={grid} title="Dot grid" className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center ${grid ? "text-ink" : "text-ink-faint"} hover:bg-surface-2`}>
          <I.Grid />
        </button>
        {elsRef.current.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              if (await confirm({ title: "Clear the whole drawing?", description: "You can still undo it.", confirmLabel: "Clear", danger: true })) {
                commit([]);
                setSel([]);
              }
            }}
            className="hidden sm:inline-flex h-10 px-3 rounded-xl items-center text-[13px] font-semibold text-ink-soft hover:text-red hover:bg-red/10"
          >
            Clear
          </button>
        )}
        <button type="button" onClick={() => void finish()} disabled={busy} data-sound="none" className="h-10 px-4 rounded-xl bg-amber text-white text-[13.5px] font-bold disabled:opacity-60 whitespace-nowrap">
          {busy ? "Saving…" : "Use sketch"}
        </button>
      </div>

      {/* Board */}
      <div ref={wrapRef} className="relative flex-1 min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 touch-none select-none ${tool === "hand" ? "cursor-grab active:cursor-grabbing" : tool === "select" ? "cursor-default" : tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
        {editingEl && (
          <textarea
            ref={textRef}
            autoFocus
            value={editingEl.text}
            onChange={(e) => setText(editingEl.id, e.target.value)}
            onBlur={commitText}
            placeholder={editingEl.t === "sticky" ? "Write on the note…" : "Type…"}
            className="absolute bg-transparent outline-none resize-none overflow-hidden p-0 border-0"
            style={
              editingEl.t === "text"
                ? { left: editingEl.x * z + ox, top: editingEl.y * z + oy, width: Math.max(40, editingEl.w * z), height: Math.max(editingEl.h, editingEl.fs * 1.3) * z + 4, font: font(editingEl.fs * z, editingEl.bold), lineHeight: 1.3, color: shownOn(editingEl.color, paper), transform: `rotate(${editingEl.rot}rad)`, transformOrigin: "center" }
                : { left: (editingEl.x + 12) * z + ox, top: (editingEl.y + 12) * z + oy, width: (editingEl.w - 24) * z, height: (editingEl.h - 24) * z, font: font(Math.min(28, editingEl.h / 4) * z * 0.8, true), color: "#2B2118", textAlign: "center", transform: `rotate(${editingEl.rot}rad)`, transformOrigin: "center" }
            }
          />
        )}
        {!elsRef.current.length && !drag.current && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
            <p className={`text-center text-[13.5px] max-w-xs ${paper === "dark" ? "text-white/45" : "text-ink-faint"}`}>Draw your idea here. Pen, shapes, arrows, sticky notes, text, stamps and images are in the toolbar.</p>
          </div>
        )}
        {/* Desktop: tools on the left, options on top */}
        <div className="hidden lg:flex absolute left-3 top-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-line/15 bg-surface p-1.5 shadow-[0_16px_40px_-18px_rgb(0_0_0/0.35)]">{tools}</div>
        <div className="hidden lg:block absolute left-1/2 -translate-x-1/2 top-3 max-w-[calc(100%-10rem)] rounded-2xl border border-line/15 bg-surface shadow-[0_16px_40px_-18px_rgb(0_0_0/0.35)] px-1.5">{props}</div>
      </div>

      {/* Phones and tablets: options, then tools, at the bottom */}
      <div className="lg:hidden flex-shrink-0 border-t border-line/10 bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="px-2 pt-1.5">{props}</div>
        <div className="flex items-center gap-1 overflow-x-auto overflow-y-visible no-scrollbar px-2 py-2">{tools}</div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void insertImage(f);
        }}
      />
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HINTS: Record<string, string> = {
  select: "Click to select, drag to move. Shift adds to the selection.",
  hand: "Drag to move around. Pinch or Ctrl + scroll to zoom.",
  eraser: "Drag over anything to erase it.",
  sticky: "Click to add a sticky note.",
  stamp: "Click to stamp. Pick another in the toolbar.",
};

const norm = (x1: number, y1: number, x2: number, y2: number): Rect => ({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });

function snap45(x0: number, y0: number, x: number, y: number): [number, number] {
  const a = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 4)) * (Math.PI / 4);
  const d = Math.hypot(x - x0, y - y0);
  return [x0 + Math.cos(a) * d, y0 + Math.sin(a) * d];
}

/** Handles for one box element: 8 for resizing + rotation (world coordinates). */
function boxHandles(e: BoxEl, z: number): [Handle, [number, number]][] {
  const w = e.w / 2;
  const h = e.h / 2;
  const list: [Handle, number, number][] =
    e.t === "pen" || e.t === "marker" || e.t === "image" || e.t === "stamp"
      ? [["nw", -w, -h], ["ne", w, -h], ["se", w, h], ["sw", -w, h]]
      : e.t === "text"
        ? [["w", -w, 0], ["e", w, 0], ["nw", -w, -h], ["ne", w, -h], ["se", w, h], ["sw", -w, h]]
        : [["nw", -w, -h], ["n", 0, -h], ["ne", w, -h], ["e", w, 0], ["se", w, h], ["s", 0, h], ["sw", -w, h], ["w", -w, 0]];
  const out: [Handle, [number, number]][] = list.map(([k, x, y]) => [k, toWorld(e, x, y)]);
  out.push(["rot", toWorld(e, 0, -h - 22 / z)]);
  return out;
}

/** A stroke element from world points (box = their bounds). */
function strokeFrom(pts: Pt[], t: "pen" | "marker", s: Style): StrokeEl | null {
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - x);
  const h = Math.max(1, Math.max(...ys) - y);
  return { id: uid(), t, x, y, w, h, ow: w, oh: h, rot: 0, pts: pts.map(([px, py, p]) => [px - x, py - y, p] as Pt), color: t === "marker" && s.color === COLORS[0] ? "#F5B800" : s.color, size: s.size };
}

/** The shape / line being dragged out (or dropped at a default size on a plain click). */
function createdEl(d: { sx: number; sy: number; x: number; y: number }, tool: Tool, s: Style, final: boolean): El | null {
  const tiny = Math.hypot(d.x - d.sx, d.y - d.sy) < 4;
  if (tool === "line" || tool === "arrow") {
    if (tiny && !final) return null;
    const x2 = tiny ? d.sx + 160 : d.x;
    const y2 = tiny ? d.sy : d.y;
    return { id: uid(), t: tool, x1: d.sx, y1: d.sy, x2, y2, color: s.color, size: s.size, dash: s.dash, both: false };
  }
  if (tool !== "shape") return null;
  if (tiny && !final) return null;
  const r = tiny ? { x: d.sx - 70, y: d.sy - 50, w: 140, h: 100 } : norm(d.sx, d.sy, d.x, d.y);
  return { id: uid(), t: s.shape, x: r.x, y: r.y, w: Math.max(4, r.w), h: Math.max(4, r.h), rot: 0, color: s.color, fill: s.fill, size: s.size, dash: s.dash };
}

/** Big photos are shrunk before going into the drawing. */
async function downscale(file: File, max: number): Promise<string | null> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.86);
  } catch {
    return null;
  }
}

function Seg({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center rounded-lg border border-line/15 p-0.5 flex-shrink-0">{children}</div>;
}
function Pop({ children, className }: { children: React.ReactNode; className: string }) {
  return <div className={`absolute z-10 rounded-xl border border-line/15 bg-surface shadow-2xl p-1.5 animate-[modalin_.12s_var(--ease-out)] ${className}`}>{children}</div>;
}

function ShapeIcon({ kind }: { kind: ShapeKind }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      {kind === "rect" && <rect x="4" y="6" width="16" height="12" {...p} />}
      {kind === "round" && <rect x="4" y="6" width="16" height="12" rx="4" {...p} />}
      {kind === "ellipse" && <ellipse cx="12" cy="12" rx="8.5" ry="6.5" {...p} />}
      {kind === "triangle" && <path d="M12 5 20 19H4Z" {...p} />}
      {kind === "diamond" && <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" {...p} />}
      {kind === "star" && <path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6Z" {...p} />}
    </svg>
  );
}

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const I = {
  Select: () => svg(<path d="M5 3.5 18.5 11l-6 1.6L9.4 19Z" />),
  Hand: () => svg(<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V5a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V13c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4L3 12.5a1.5 1.5 0 0 1 2.4-1.8L8 13" />),
  Pen: () => svg(<path d="M4 20l1.2-4.4L16.6 4.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.4 18.8Z M14.5 6.3l3.2 3.2" />),
  Marker: () => svg(<path d="m9 15 6.5-11 4 2.3L13 17.4Z M9 15l-1.8 3.4L9 20l2.6-2.2 M4 21h7" />),
  Eraser: () => svg(<path d="M7.5 19.5h12 M5.2 15.3 14.8 5.7a2 2 0 0 1 2.8 0l1.7 1.7a2 2 0 0 1 0 2.8l-8.3 8.3H8.3l-3.1-3.1a1 1 0 0 1 0-1.4Z M10 10.5l4.5 4.5" />),
  Line: () => svg(<path d="M5 19 19 5" />),
  Arrow: () => svg(<path d="M5 19 19 5 M10 5h9v9" />),
  Text: () => svg(<path d="M5 6.5V5h14v1.5 M12 5v14 M9.5 19h5" />),
  Sticky: () => svg(<path d="M5 5h14v9l-5 5H5Z M14 19v-5h5" />),
  Image: () => svg(<><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17" /></>),
  Undo: () => svg(<path d="M9 7 4.5 11.5 9 16 M5 11.5h9.5a5 5 0 0 1 0 10H12" />),
  Redo: () => svg(<path d="m15 7 4.5 4.5L15 16 M19 11.5H9.5a5 5 0 0 0 0 10H12" />),
  Grid: () => svg(<><circle cx="7" cy="7" r=".9" fill="currentColor" /><circle cx="12" cy="7" r=".9" fill="currentColor" /><circle cx="17" cy="7" r=".9" fill="currentColor" /><circle cx="7" cy="12" r=".9" fill="currentColor" /><circle cx="12" cy="12" r=".9" fill="currentColor" /><circle cx="17" cy="12" r=".9" fill="currentColor" /><circle cx="7" cy="17" r=".9" fill="currentColor" /><circle cx="12" cy="17" r=".9" fill="currentColor" /><circle cx="17" cy="17" r=".9" fill="currentColor" /></>),
  X: () => svg(<path d="M6 6l12 12M18 6 6 18" />),
};

