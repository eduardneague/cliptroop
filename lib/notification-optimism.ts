/*
 * The bell answers at once (1.31.4), like a like on a video: what you do
 * shows straight away and the server catches up behind it. What you did and
 * the server hasn't confirmed yet is kept here (read, cleared, answered), so
 * it stays done even when a fresh list arrives meanwhile (a refresh, a
 * realtime event); if the server says no, it's taken back. Also: how a
 * swipe ends, and the order a "Clear all" leaves in. Pure.
 */

type Rel = { status: string } | { status: string }[] | null;
export type BellRow = {
  id: string;
  is_read: boolean;
  created_at: string;
  team_invite_id: string | null;
  team_invites: Rel;
  ownership_transfer_id: string | null;
  ownership_transfer_requests: Rel;
};

export type Answer = "accepted" | "declined";
export type Overlay = { read: Set<string>; gone: Set<string>; answered: Map<string, Answer> };

export const emptyOverlay = (): Overlay => ({ read: new Set(), gone: new Set(), answered: new Map() });

/** One row as you left it (null: you cleared it). */
export function rowWithOverlay<T extends BellRow>(row: T, o: Overlay): T | null {
  if (o.gone.has(row.id)) return null;
  const answer = o.answered.get(row.id);
  if (!answer && !o.read.has(row.id)) return row;
  const out: T = { ...row, is_read: row.is_read || o.read.has(row.id) || !!answer };
  if (answer) {
    if (row.team_invite_id) out.team_invites = { status: answer };
    else if (row.ownership_transfer_id) out.ownership_transfer_requests = { status: answer };
  }
  return out;
}

/** The list as you left it. */
export function withOverlay<T extends BellRow>(list: T[], o: Overlay): T[] {
  if (!o.read.size && !o.gone.size && !o.answered.size) return list;
  const out: T[] = [];
  for (const row of list) {
    const r = rowWithOverlay(row, o);
    if (r) out.push(r);
  }
  return out;
}

/** Rows put back where they belong (newest first), never twice. */
export function putBack<T extends BellRow>(list: T[], back: T[]): T[] {
  const have = new Set(list.map((r) => r.id));
  const add = back.filter((r) => !have.has(r.id));
  if (!add.length) return list;
  return [...list, ...add].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/**
 * How a swipe on a notification ends: far enough (a third of its width) or
 * fast enough (a flick) and it's cleared, toward where it was swiped;
 * otherwise it springs back. One that can't be cleared always springs back.
 */
export function swipeOutcome(o: { dx: number; width: number; velocity: number; locked?: boolean }): "left" | "right" | "back" {
  if (o.locked || !(o.width > 0)) return "back";
  const far = Math.abs(o.dx) >= o.width / 3;
  const flick = Math.abs(o.velocity) >= 0.55 && Math.abs(o.dx) >= 36 && Math.sign(o.velocity) === Math.sign(o.dx);
  if (!far && !flick) return "back";
  return o.dx > 0 ? "right" : "left";
}

/** "Clear all": each one leaves a moment after the one above it (the first `max` of them; the rest go with the last). */
export function leaveDelays(n: number, step = 40, max = 8): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => Math.min(i, max) * step);
}

/**
 * How a swipe up (or down) on a toast ends (1.31.9: on a phone they sit at the top, and a flick up sends one away,
 * like a phone's own notifications): far enough (two fifths of its height, 24 px at least) or a flick that way
 * sends it; anything else springs back. A pull the other way never does.
 */
export function liftOutcome(o: { dy: number; height: number; velocity: number; dir: "up" | "down" }): "away" | "back" {
  if (!(o.height > 0)) return "back";
  const s = o.dir === "up" ? -1 : 1;
  const d = o.dy * s;
  const v = o.velocity * s;
  if (d >= Math.max(24, o.height * 0.4)) return "away";
  if (v >= 0.45 && d >= 12) return "away";
  return "back";
}

/** How long a toast stays by itself (1.31.9: shorter; one with Undo long enough to use it). Pointing at it waits. */
export function toastDuration(o: { kind: "success" | "error"; action?: boolean; given?: number }): number {
  if (o.given !== undefined && Number.isFinite(o.given) && o.given > 0) return o.given;
  if (o.action) return 6500;
  return o.kind === "error" ? 5500 : 3500;
}

