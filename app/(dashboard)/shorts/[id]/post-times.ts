/**
 * When a short's posts go out (1.34.3): the Posting card's choices, in this
 * device's time zone. Pure, so the tests can check them.
 */

/** Posts must be at least 15 minutes ahead (the server checks this too). */
export const MIN_LEAD_MS = 15 * 60_000;

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Today on this device, "2026-10-26". */
export const todayStr = (now = Date.now()) => ymd(new Date(now));

/** "2026-10-27" + n days. */
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** "17:07" → "17:00" (the time picker's steps are quarter hours). */
export function quarter(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${pad2(h || 0)}:${pad2(Math.floor((m || 0) / 15) * 15)}`;
}

/** 30 minutes from now (this device), rounded up to the next quarter hour. */
export function soonSlot(now = Date.now()) {
  const d = new Date(now + 30 * 60_000);
  const m = Math.ceil(d.getMinutes() / 15) * 15;
  d.setMinutes(m, 0, 0);
  return { date: ymd(d), time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
}

/**
 * The team's time for a platform (Team → Short videos) on the short's
 * planned day (today if that's gone or there's none); a time already gone
 * or under 15 minutes away moves to the next day.
 */
export function teamSlot(planned: string | null, time: string, now = Date.now()) {
  const t = quarter(time || "17:00");
  const today = todayStr(now);
  let date = planned && planned > today ? planned : today;
  for (let i = 0; i < 2 && new Date(`${date}T${t}:00`).getTime() < now + MIN_LEAD_MS; i++) date = addDays(date, 1);
  return { date, time: t };
}

/** The choice the card starts on: a short planned for a later day goes at the team's times that day; else in 30 minutes. */
export function firstWhen(planned: string | null, now = Date.now()): "soon" | "team" {
  return planned && planned > todayStr(now) ? "team" : "soon";
}

/** "Today", "Tomorrow", "Wed, Oct 28". */
export function fmtDay(date: string, now = Date.now()) {
  const t = todayStr(now);
  return date === t ? "Today" : date === addDays(t, 1) ? "Tomorrow" : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "Today 11:45", "Tomorrow 17:00", "Wed, Oct 28 18:00". */
export function fmtWhen(v: { date: string; time: string }, now = Date.now()) {
  return `${fmtDay(v.date, now)} ${v.time}`;
}

/** A moment (an ISO time) as this device's day and time. */
export function slotOf(iso: string) {
  const d = new Date(iso);
  return { date: ymd(d), time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
}
