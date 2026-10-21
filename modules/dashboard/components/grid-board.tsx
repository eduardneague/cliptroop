"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CloseIcon, GripIcon, ResizeCornerIcon, SettingsIcon } from "@/components/ui/icons";
import { sounds } from "@/lib/sounds";
import { COLS, bottom, fill, preview as previewBoxes, compact, readingOrder, type Box, type Interaction, type Limits } from "../grid";
import type { Stack } from "../layout";
import { BoxContext } from "./widget-box";

/**
 * A board of cards on the 12 column grid (the dashboard's, 1.6; generic in
 * 1.28.0 so profiles use it too): drag a card anywhere, pull any edge or
 * corner to resize, others make room with animation; arrow keys move the
 * focused one, Shift + arrows resize. Below `narrowAt` the cards stack (the
 * container's @container rules) and can't be dragged.
 */

/** A card's place: x/y = column/row of its top-left corner, w/h = columns/rows; `fixed` = sized by hand (Fill leaves it). */
export type GridItem = { id: string; x: number; y: number; w: number; h: number; fixed?: boolean; settings?: Record<string, unknown> };
/** What the board needs to know about a card: its title, whether it draws its own frame, how it stacks, its normal size. */
export type GridCardMeta = { name: string; bare?: boolean; stack: Stack; hasSettings?: boolean; size: { w: number; h: number } };

const boxOf = (w: GridItem): Box => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h });

/** Puts boxes (from the engine) back onto the cards. */
function place<T extends GridItem>(items: T[], boxes: Box[]): T[] {
  const m = new Map(boxes.map((b) => [b.i, b]));
  return items.map((w) => {
    const b = m.get(w.id);
    return b ? { ...w, x: b.x, y: b.y, w: b.w, h: b.h } : w;
  });
}

export const GAP = 12;
/**
 * Below this board width widgets stack, 2 per row (small laptops, tablets) or
 * 1 (phones): no dragging there. Same widths as the @container rules for
 * .dash-board in globals.css. 1.9.6: 1100 (was 960), since 12 columns got
 * too small to read on ~1280px screens.
 */
export const NARROW = 1100;

/** Board size in px, same formula as .dash-board in globals.css. */
type Metrics = { W: number; col: number; row: number; narrow: boolean };
const metricsFor = (W: number, narrowAt = NARROW): Metrics => {
  const rowh = Math.min(80, Math.max(56, W / 24));
  return { W, col: (W + GAP) / COLS, row: rowh + GAP, narrow: W < narrowAt };
};

// ---------------------------------------------------------------------------
// Board: placement, drag, resize
// ---------------------------------------------------------------------------

/** Which edge or corner a widget is pulled by (1.27.5: every one): l(eft) r(ight) t(op) b(ottom). */
type Edge = "l" | "r" | "t" | "b" | "lt" | "rt" | "lb" | "rb";

type Grab = {
  id: string;
  kind: "move" | "resize";
  edge: Edge;
  pointerId: number;
  el: HTMLElement;
  sx: number;
  sy: number;
  /** Pointer position inside the card, as a share of its size. */
  fx: number;
  fy: number;
  /** Card size in px when grabbed (resize starts from it). */
  w0: number;
  h0: number;
  /** Its place on the grid when grabbed (1.28.0: the preview moving it can't shift where the pull started). */
  box0: Box | null;
  started: boolean;
};

export function GridBoard<T extends GridItem>({
  items,
  fill: fillOn,
  limits,
  editing,
  mounted,
  fresh,
  meta,
  render,
  skeleton,
  onChange,
  onSettings,
  narrowAt = NARROW,
  cq = "dash-cq",
  hints,
}: {
  items: T[];
  /** Grow cards into empty space next to them (display only). */
  fill: boolean;
  limits: Record<string, Limits>;
  editing: boolean;
  /** False on the server and while hydrating: cards show `skeleton`. */
  mounted: boolean;
  /** Just added: it pops in. */
  fresh: string | null;
  meta: (item: T) => GridCardMeta;
  render: (item: T) => React.ReactNode;
  skeleton: React.ReactNode;
  onChange: (items: T[]) => void;
  onSettings: (id: string) => void;
  /** Below this board width cards stack and can't be dragged (match the container's CSS). */
  narrowAt?: number;
  /** The container class (its @container rules stack the cards). */
  cq?: string;
  hints?: { narrow: string; wide: string };
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Metrics>(() => metricsFor(1200, narrowAt));
  const [measured, setMeasured] = useState(false);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      setM(metricsFor(el.clientWidth, narrowAt));
      setMeasured(true);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [narrowAt]);

  const [act, setAct] = useState<Interaction | null>(null);
  // Widgets rise in one after another when the page opens, then never again.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1500);
    return () => clearTimeout(t);
  }, []);
  const [lifted, setLifted] = useState<string | null>(null);
  const [landing, setLanding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [extraRows, setExtraRows] = useState(0);
  const grab = useRef<Grab | null>(null);
  /** Pointer (screen), the card's drawn position (board px, eased toward the pointer), tilt, frame time. */
  const pointer = useRef({ x: 0, y: 0, cx: 0, cy: 0, tilt: 0, t: 0, cellX: -1, cellY: -1, rw: 0, rh: 0, rx: 0, ry: 0 });
  const frame = useRef(0);
  const lastAct = useRef<string>("");
  const scrollAtGrab = useRef(0);
  const [resizing, setResizing] = useState<string | null>(null);

  const widgets = items;
  const base = useMemo(() => compact(widgets.map(boxOf)), [widgets]);
  /** Where things are (saved sizes), with the current drag or resize applied. */
  const placed = useMemo(() => (act ? previewBoxes(base, act, limits) : base), [base, act, limits]);
  /** What's drawn: grown into empty space when "Fill" is on. */
  const shown = useMemo(() => {
    if (!fillOn) return placed;
    const keep = new Set(widgets.filter((w) => w.fixed).map((w) => w.id));
    // The widget in your hand keeps its own size: its slot shows exactly where it lands (1.28.0: with Fill on,
    // the slot grew into the empty space beside it and looked like a different size).
    if (act) keep.add(act.id);
    return fill(placed, limits, keep);
  }, [placed, fillOn, widgets, limits, act]);
  const byId = useMemo(() => new Map(shown.map((b) => [b.i, b])), [shown]);
  // The latest drawn boxes, for the drag loop (which started on an earlier render).
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const order = useMemo(() => new Map(readingOrder(shown).map((id, k) => [id, k])), [shown]);
  const rows = Math.max(1, bottom(shown)) + (editing ? 1 : 0) + extraRows;
  const canDrag = editing && !m.narrow;

  // --- the drag loop: runs every frame while a widget is held -----------------
  const tick = useCallback(() => {
    const g = grab.current;
    const b = board.current;
    if (!g || !g.started || !b) return;
    const p = pointer.current;
    const r = b.getBoundingClientRect();

    // Near the top or bottom of the window: scroll.
    const edge = 72;
    const v = p.y < edge ? -Math.ceil((edge - p.y) / 5) : p.y > window.innerHeight - edge ? Math.ceil((p.y - (window.innerHeight - edge)) / 5) : 0;
    if (v) window.scrollBy(0, v);

    if (g.kind === "move") {
      const me = widgets.find((w) => w.id === g.id)!;
      const wpx = me.w * m.col - GAP;
      const hpx = me.h * m.row - GAP;
      const left = p.x - r.left - g.fx * wpx;
      const top = p.y - r.top - g.fy * hpx;
      // The card glides after the pointer (eased, frame-rate independent),
      // and leans a little into the direction it's moving.
      const now = performance.now();
      const dt = Math.min(48, now - (p.t || now - 16));
      p.t = now;
      const ease = 1 - Math.exp(-dt / 55);
      const px = p.cx;
      p.cx += (left - p.cx) * ease;
      p.cy += (top - p.cy) * ease;
      const speed = ((p.cx - px) / Math.max(dt, 1)) * 16;
      p.tilt += (Math.max(-3, Math.min(3, speed * 0.22)) - p.tilt) * Math.min(1, dt / 90);
      g.el.style.setProperty("--dx", `${p.cx.toFixed(1)}px`);
      g.el.style.setProperty("--dy", `${p.cy.toFixed(1)}px`);
      g.el.style.setProperty("--tilt", `${p.tilt.toFixed(2)}deg`);
      // Target cell with a little stickiness, so it doesn't flip between two
      // cells while the pointer sits near a boundary.
      const fx = left / m.col;
      const fy = top / m.row;
      if (p.cellX < 0 || Math.abs(fx - p.cellX) > 0.62) p.cellX = Math.round(fx);
      if (p.cellY < 0 || Math.abs(fy - p.cellY) > 0.62) p.cellY = Math.round(fy);
      const x = Math.max(0, Math.min(COLS - me.w, p.cellX));
      const y = Math.max(0, p.cellY);
      const key = `m${x},${y}`;
      if (key !== lastAct.current) {
        lastAct.current = key;
        setAct({ kind: "move", id: g.id, x, y });
        setExtraRows(Math.max(0, y + me.h - bottom(base)));
      }
    } else {
      const me = widgets.find((w) => w.id === g.id)!;
      const lim = limits[g.id];
      const startBox = g.box0 ?? byIdRef.current.get(g.id) ?? boxOf(me);
      // Pulled by the left / top edge (or a corner there): that edge moves, the opposite one stays.
      const left = g.edge.includes("l");
      const top = g.edge.includes("t");
      const sideways = left || g.edge.includes("r");
      const upDown = top || g.edge.includes("b");
      // From the right: up to its own maximum; past the board's edge it grows to the left instead (1.28.0).
      const maxW = Math.min(lim.maxW, left ? startBox.x + startBox.w : COLS);
      const maxH = Math.min(lim.maxH, top ? startBox.y + startBox.h : lim.maxH);
      const dx = sideways ? p.x - g.sx : 0;
      const dy = upDown ? p.y - g.sy + (window.scrollY - scrollAtGrab.current) : 0;
      const wantW = g.w0 + (left ? -dx : dx);
      const wantH = g.h0 + (top ? -dy : dy);
      const wpx = Math.max(lim.minW * m.col - GAP, Math.min(maxW * m.col - GAP, wantW));
      const hpx = Math.max(lim.minH * m.row - GAP, Math.min(maxH * m.row - GAP, wantH));
      // Pulled half a cell past what it can be: the size badge says so.
      const over = (sideways && Math.abs(wantW - wpx) > m.col / 2) || (upDown && Math.abs(wantH - hpx) > m.row / 2);
      // The edge stays under the pointer (1.28.0: no easing, it lagged behind).
      p.rw = wpx;
      p.rh = hpx;
      // Where its top-left corner is drawn (it moves with a left or top edge, or when it reaches the board's right edge).
      const x0 = startBox.x * m.col;
      const y0 = startBox.y * m.row;
      const boardW = COLS * m.col - GAP;
      p.rx = left ? x0 + (g.w0 - p.rw) : Math.max(0, Math.min(x0, boardW - p.rw));
      p.ry = top ? y0 + (g.h0 - p.rh) : y0;
      g.el.style.setProperty("--rw", `${p.rw.toFixed(1)}px`);
      g.el.style.setProperty("--rh", `${p.rh.toFixed(1)}px`);
      g.el.style.setProperty("--rx", `${p.rx.toFixed(1)}px`);
      g.el.style.setProperty("--ry", `${p.ry.toFixed(1)}px`);
      const w = Math.round((wpx + GAP) / m.col);
      const h = Math.round((hpx + GAP) / m.row);
      const key = `r${w},${h},${left ? 1 : 0}${top ? 1 : 0}${over ? "o" : ""}`;
      if (key !== lastAct.current) {
        lastAct.current = key;
        setAct({ kind: "resize", id: g.id, w, h, left, top, over });
        setExtraRows(Math.max(0, (top ? startBox.y + startBox.h - h : startBox.y) + h - bottom(base)));
      }
    }
    frame.current = requestAnimationFrame(tick);
  }, [widgets, limits, m, base]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function begin(e: React.PointerEvent<HTMLElement>, id: string, kind: "move" | "resize", edge: Edge = "rb") {
    if (!canDrag || e.button !== 0) return;
    const el = (e.currentTarget.closest("[data-widget]") as HTMLElement) ?? e.currentTarget;
    const rect = el.getBoundingClientRect();
    grab.current = {
      id,
      kind,
      edge,
      pointerId: e.pointerId,
      el,
      sx: e.clientX,
      sy: e.clientY,
      fx: (e.clientX - rect.left) / rect.width,
      fy: (e.clientY - rect.top) / rect.height,
      w0: rect.width,
      h0: rect.height,
      box0: byIdRef.current.get(id) ?? null,
      started: false,
    };
    scrollAtGrab.current = window.scrollY;
    pointer.current = { x: e.clientX, y: e.clientY, cx: 0, cy: 0, tilt: 0, t: 0, cellX: -1, cellY: -1, rw: rect.width, rh: rect.height, rx: 0, ry: 0 };
    el.setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const g = grab.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const p = pointer.current;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!g.started) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
      g.started = true;
      lastAct.current = "";
      const b = board.current!.getBoundingClientRect();
      const r = g.el.getBoundingClientRect();
      if (g.kind === "move") {
        // Start exactly where the card is, then glide after the pointer.
        p.cx = r.left - b.left;
        p.cy = r.top - b.top;
        g.el.style.setProperty("--dx", `${p.cx}px`);
        g.el.style.setProperty("--dy", `${p.cy}px`);
        g.el.style.setProperty("--tilt", "0deg");
        setLifted(g.id);
        sounds.lift();
      } else {
        p.rx = r.left - b.left;
        p.ry = r.top - b.top;
        g.el.style.setProperty("--rw", `${r.width}px`);
        g.el.style.setProperty("--rh", `${r.height}px`);
        g.el.style.setProperty("--rx", `${p.rx}px`);
        g.el.style.setProperty("--ry", `${p.ry}px`);
        setResizing(g.id);
      }
      document.body.style.cursor = g.kind === "move" ? "grabbing" : EDGE_CURSOR[g.edge];
      document.body.style.userSelect = "none";
      frame.current = requestAnimationFrame(tick);
    }
  }

  function finish(e: React.PointerEvent<HTMLElement>, cancel = false) {
    const g = grab.current;
    if (!g || e.pointerId !== g.pointerId) return;
    grab.current = null;
    cancelAnimationFrame(frame.current);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    try {
      g.el.releasePointerCapture(g.pointerId);
    } catch {}
    if (!g.started) return;
    setResizing(null);
    if (!cancel && act) {
      const next = place(widgets, previewBoxes(base, act, limits));
      onChange(act.kind === "resize" ? next.map((w) => (w.id === act.id ? { ...w, fixed: true } : w)) : next);
      sounds.drop();
    }
    setLanding(g.id);
    setTimeout(() => setLanding((l) => (l === g.id ? null : l)), 450);
    setLifted(null);
    setAct(null);
    setExtraRows(0);
  }

  // Keyboard: arrows move, Shift + arrows resize (when a widget is focused in Customize).
  function onKey(e: React.KeyboardEvent<HTMLElement>, id: string) {
    if (!canDrag || e.target !== e.currentTarget) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const b = base.find((x) => x.i === id)!;
    // Step further until it really lands somewhere new (others may be in the way).
    for (let k = 1; k <= 24; k++) {
      const a: Interaction = e.shiftKey ? { kind: "resize", id, w: b.w + d[0] * k, h: b.h + d[1] * k } : { kind: "move", id, x: b.x + d[0] * k, y: Math.max(0, b.y + d[1] * k) };
      const res = previewBoxes(base, a, limits);
      const me = res.find((x) => x.i === id)!;
      if (me.x === b.x && me.y === b.y && me.w === b.w && me.h === b.h) {
        if (e.shiftKey || (d[0] !== 0 && (b.x + d[0] * k < 0 || b.x + b.w + d[0] * k > COLS))) return;
        continue;
      }
      const next = place(widgets, res);
      onChange(a.kind === "resize" ? next.map((w) => (w.id === id ? { ...w, fixed: true } : w)) : next);
      sounds.drop();
      return;
    }
  }

  function remove(id: string) {
    setRemoving(id);
    setTimeout(() => {
      setRemoving(null);
      onChange(place(widgets.filter((w) => w.id !== id), compact(widgets.filter((w) => w.id !== id).map(boxOf))));
    }, 190);
  }

  function resetSize(id: string) {
    const w = widgets.find((x) => x.id === id)!;
    const size = meta(w).size;
    const next = place(widgets, previewBoxes(base, { kind: "resize", id, w: size.w, h: size.h }, limits));
    onChange(next.map((x) => (x.id === id ? { ...x, fixed: undefined } : x)));
  }

  const ghost = act ? byId.get(act.id) : null;

  return (
    <div ref={wrap} className={cq}>
      <div
        ref={board}
        className={`dash-board ${editing ? "dash-anim" : ""} ${intro ? "dash-intro" : ""}`}
        style={{ ["--rows" as string]: rows, ...(measured ? { ["--col-px" as string]: `${m.col}px`, ["--rowh-px" as string]: `${m.row - GAP}px` } : {}) }}
      >
        {/* The grid shows while customizing; it brightens while you move or resize something. */}
        {canDrag && (
          <div className={`dash-cells ${act ? "is-on" : ""}`} aria-hidden>
            {Array.from({ length: rows * COLS }, (_, k) => (
              <span key={k} />
            ))}
          </div>
        )}
        {ghost && <div className="dash-item dash-ghost" style={vars(ghost)} aria-hidden />}
        {widgets.map((w) => {
          const b = byId.get(w.id) ?? boxOf(w);
          const isLifted = lifted === w.id;
          // Picked up: drawn at its own size (it grows back into space when dropped).
          const size = isLifted ? { ...b, w: w.w, h: w.h } : b;
          return (
            <GridCard
              key={w.id}
              item={w}
              meta={meta(w)}
              box={size}
              order={order.get(w.id) ?? 0}
              editing={editing}
              canDrag={canDrag}
              className={[isLifted && "is-lifted", resizing === w.id && "is-resizing", landing === w.id && "is-landing", removing === w.id && "is-removing", fresh === w.id && "is-new"].filter(Boolean).join(" ")}
              onGrab={(e) => begin(e, w.id, "move")}
              onResize={(e, edge) => begin(e, w.id, "resize", edge)}
              onResetSize={() => resetSize(w.id)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => finish(e)}
              onPointerCancel={(e) => finish(e, true)}
              onKey={(e) => onKey(e, w.id)}
              onRemove={() => remove(w.id)}
              onSettings={() => onSettings(w.id)}
              sizing={
                act?.kind === "resize" && act.id === w.id
                  ? {
                      w: b.w,
                      h: b.h,
                      // Pulled past its biggest or smallest size: says so instead of quietly not following.
                      limit: !!act.over,
                    }
                  : null
              }
            >
              {mounted ? render(w) : skeleton}
            </GridCard>
          );
        })}
      </div>
      {editing && hints && <p className="mt-3 text-center text-[12px] text-ink-faint">{m.narrow ? hints.narrow : hints.wide}</p>}
    </div>
  );
}

/** The pointer while pulling each edge and corner. */
const EDGE_CURSOR: Record<Edge, string> = { l: "ew-resize", r: "ew-resize", t: "ns-resize", b: "ns-resize", lt: "nwse-resize", rb: "nwse-resize", rt: "nesw-resize", lb: "nesw-resize" };

const vars = (b: Box, extra: Record<string, string | number> = {}) =>
  ({ ["--x" as string]: b.x, ["--y" as string]: b.y, ["--w" as string]: b.w, ["--h" as string]: b.h, ...extra }) as React.CSSProperties;

/** Measures its content box so widgets can adapt to the space they get. */
function Measured({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, h: 280 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      <BoxContext.Provider value={box}>{children}</BoxContext.Provider>
    </div>
  );
}

function GridCard({
  item: w,
  meta,
  box,
  order,
  editing,
  canDrag,
  className,
  onGrab,
  onResize,
  onResetSize,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKey,
  onRemove,
  onSettings,
  sizing = null,
  children,
}: {
  item: GridItem;
  meta: GridCardMeta;
  box: Box;
  order: number;
  editing: boolean;
  canDrag: boolean;
  className: string;
  onGrab: (e: React.PointerEvent<HTMLElement>) => void;
  onResize: (e: React.PointerEvent<HTMLElement>, edge: Edge) => void;
  onResetSize: () => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  onKey: (e: React.KeyboardEvent<HTMLElement>) => void;
  onRemove: () => void;
  onSettings: () => void;
  /** While it's being resized: its size in cells, and whether it's as big (or small) as it goes. */
  sizing?: { w: number; h: number; limit: boolean } | null;
  children: React.ReactNode;
}) {
  const hasSettings = !!meta.hasSettings;
  const bare = meta.bare && !editing;
  // Stacked (small laptops, tablets, phones): each widget's own span and height (layout.ts, Stack).
  const st = meta.stack;
  const rows = Math.max(st.min, Math.min(st.max, w.h));
  const style = vars(box, { ["--o"]: order, ["--mw"]: st.span ?? (w.w >= 6 ? 2 : 1), ["--mh"]: rows, ["--mhp"]: (typeof st.phone === "function" ? st.phone(w.settings) : st.phone) ?? rows });
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <section
      data-widget={w.id}
      style={style}
      tabIndex={canDrag ? 0 : undefined}
      aria-label={canDrag ? `${meta.name}. Drag to move, arrow keys to move, Shift and arrows to resize.` : undefined}
      onPointerDown={canDrag ? onGrab : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onKeyDown={canDrag ? onKey : undefined}
      className={`dash-item group/card flex flex-col rounded-xl border bg-surface p-3 overflow-hidden outline-none ${
        editing ? `border-dashed border-line/30 ${canDrag ? "cursor-grab touch-none select-none focus-visible:ring-2 focus-visible:ring-amber" : ""}` : "border-line/10"
      } ${className}`}
    >
      {bare ? (
        hasSettings && (
          <button type="button" onClick={onSettings} aria-label={`${meta.name} settings`} className="absolute top-2 right-2 z-10 w-6 h-6 rounded-md flex items-center justify-center text-ink-faint opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60 hover:text-ink hover:bg-surface-2 transition-opacity">
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        )
      ) : (
        <div className="flex items-center gap-1.5 h-5 mb-2 flex-shrink-0">
          {canDrag && <GripIcon className="w-3.5 h-3.5 -ml-0.5 text-ink-faint" />}
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-faint flex-1 truncate">{meta.name}</h2>
          {hasSettings && (
            <button
              type="button"
              onPointerDown={stop}
              onClick={onSettings}
              aria-label={`${meta.name} settings`}
              className={`w-6 h-6 -my-0.5 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 transition-opacity ${editing ? "" : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70"}`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {editing && (
            <button type="button" onPointerDown={stop} onClick={onRemove} aria-label={`Remove ${meta.name}`} className="w-6 h-6 -my-0.5 -mr-1 rounded-md flex items-center justify-center text-ink-faint hover:text-red hover:bg-red/10">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <Measured className={`flex-1 min-h-0 flex flex-col ${editing ? "pointer-events-none" : ""}`}>{children}</Measured>
      {sizing && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none rounded-lg bg-ink/85 text-paper px-2.5 h-7 inline-flex items-center gap-1.5 text-[12.5px] font-bold tabular-nums shadow-lg" aria-live="polite">
          {sizing.w} × {sizing.h}
          {sizing.limit && <span className="text-[11px] font-semibold text-paper/70">as far as it goes</span>}
        </span>
      )}
      {canDrag && (
        <>
          {/* Every edge and corner pulls (1.27.5); the bottom-right one shows how. */}
          {/* 1.28.0: wider to grab, and a faint grip on each edge while the pointer is over the widget. */}
          {(["l", "r"] as const).map((edge) => (
            <span key={edge} onPointerDown={(e) => onResize(e, edge)} className={`dash-resize absolute top-4 bottom-4 ${edge === "l" ? "left-0" : "right-0"} w-3.5 cursor-ew-resize group/edge flex items-center justify-center`} aria-hidden>
              <span className="w-[3px] h-8 rounded-[2px] bg-amber/0 group-hover/card:bg-line/25 group-hover/edge:!bg-amber/80 transition-colors" />
            </span>
          ))}
          {(["t", "b"] as const).map((edge) => (
            <span key={edge} onPointerDown={(e) => onResize(e, edge)} className={`dash-resize absolute left-4 right-6 ${edge === "t" ? "top-0" : "bottom-0"} h-3.5 cursor-ns-resize group/edge flex items-center justify-center`} aria-hidden>
              <span className="h-[3px] w-8 rounded-[2px] bg-amber/0 group-hover/card:bg-line/25 group-hover/edge:!bg-amber/80 transition-colors" />
            </span>
          ))}
          {(["lt", "rt", "lb"] as const).map((edge) => (
            <span
              key={edge}
              onPointerDown={(e) => onResize(e, edge)}
              onDoubleClick={onResetSize}
              className={`dash-resize absolute w-4 h-4 ${edge === "lt" ? "left-0 top-0 cursor-nwse-resize" : edge === "rt" ? "right-0 top-0 cursor-nesw-resize" : "left-0 bottom-0 cursor-nesw-resize"}`}
              aria-hidden
            />
          ))}
          <span
            onPointerDown={(e) => onResize(e, "rb")}
            onDoubleClick={onResetSize}
            title="Drag any edge or corner to resize. Double-click a corner for the normal size."
            className="dash-resize absolute right-0 bottom-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 text-ink-faint hover:text-amber"
          >
            <ResizeCornerIcon className="w-4 h-4" />
          </span>
        </>
      )}
    </section>
  );
}
