// 1.31.4: the bell and toasts. What you do shows at once, like a like on a video (read, cleared, answered), stays done
// while the server catches up, and is taken back exactly if it says no. A card that goes slides out and the ones under
// it move up into its place; a new one slides in. Swipe one away, or use its X, or the keyboard. Glass with the glass look.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyOverlay, leaveDelays, putBack, rowWithOverlay, swipeOutcome, withOverlay, type BellRow } from "../lib/notification-optimism";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

const row = (id: string, minutesAgo: number, extra: Partial<BellRow> = {}): BellRow => ({
  id,
  is_read: false,
  created_at: new Date(Date.UTC(2026, 9, 23, 9, 0) - minutesAgo * 60_000).toISOString(),
  team_invite_id: null,
  team_invites: null,
  ownership_transfer_id: null,
  ownership_transfer_requests: null,
  ...extra,
});

// --- What you did, on top of any list -----------------------------------------------------------------------------------
{
  const o = emptyOverlay();
  const a = row("a", 1);
  ok(rowWithOverlay(a, o) === a, "nothing done: the very same row");
  o.read.add("a");
  const r = rowWithOverlay(a, o);
  ok(r !== null && r.is_read === true && a.is_read === false, "read: shown read (the original isn't touched)");
  o.gone.add("a");
  ok(rowWithOverlay(a, o) === null, "cleared: not shown");

  const invite = row("i", 5, { team_invite_id: "inv1", team_invites: { status: "pending" } });
  const transfer = row("t", 6, { ownership_transfer_id: "tr1", ownership_transfer_requests: [{ status: "pending" }] });
  const o2 = emptyOverlay();
  o2.answered.set("i", "accepted");
  o2.answered.set("t", "declined");
  const ri = rowWithOverlay(invite, o2);
  const rt = rowWithOverlay(transfer, o2);
  ok(JSON.stringify(ri?.team_invites) === JSON.stringify({ status: "accepted" }) && ri?.is_read === true, "an invite you accepted: Accepted at once, and read");
  ok(JSON.stringify(rt?.ownership_transfer_requests) === JSON.stringify({ status: "declined" }), "a transfer you declined: Declined at once");
  ok(ri?.team_invites !== invite.team_invites, "the server's row isn't changed");
}
{
  const list = [row("a", 1), row("b", 2), row("c", 3)];
  const o = emptyOverlay();
  ok(withOverlay(list, o) === list, "nothing pending: the list itself (no new render)");
  o.gone.add("b");
  o.read.add("c");
  const shown = withOverlay(list, o);
  ok(shown.map((r) => r.id).join() === "a,c" && shown[1].is_read && !shown[0].is_read, "a fresh list can't bring back what you cleared or unread what you read");
}

// --- Taken back -----------------------------------------------------------------------------------------------------------
{
  const list = [row("a", 1), row("d", 4)];
  const back = putBack(list, [row("c", 3), row("b", 2), row("a", 1)]);
  ok(back.map((r) => r.id).join() === "a,b,c,d", "put back where they were, newest first, never twice");
  ok(putBack(list, [row("a", 1)]) === list, "nothing missing: the list itself");
}

// --- How a swipe ends ------------------------------------------------------------------------------------------------------
ok(swipeOutcome({ dx: -120, width: 360, velocity: 0 }) === "left" && swipeOutcome({ dx: 120, width: 360, velocity: 0 }) === "right", "a third of the way: it goes, the way it was swiped");
ok(swipeOutcome({ dx: -80, width: 360, velocity: 0 }) === "back", "not far, not fast: springs back");
ok(swipeOutcome({ dx: -48, width: 360, velocity: -0.8 }) === "left", "a flick is enough");
ok(swipeOutcome({ dx: -48, width: 360, velocity: 0.8 }) === "back", "a flick back the other way isn't");
ok(swipeOutcome({ dx: -20, width: 360, velocity: -2 }) === "back", "a twitch isn't a flick");
ok(swipeOutcome({ dx: -300, width: 360, velocity: -2, locked: true }) === "back", "an invite waiting for your answer never goes");
ok(swipeOutcome({ dx: -300, width: 0, velocity: 0 }) === "back", "no width (not drawn): nothing happens");

// --- "Clear all": one after the other --------------------------------------------------------------------------------------
ok(JSON.stringify(leaveDelays(4)) === "[0,40,80,120]", "each a moment after the one above");
ok(Math.max(...leaveDelays(30)) === 320 && leaveDelays(30).length === 30, "a long list doesn't take long (the rest go with the 9th)");
ok(leaveDelays(0).length === 0, "nothing to clear");

// --- The bell --------------------------------------------------------------------------------------------------------------
// The bell owns the list (notification-bell.tsx); its cards and History load later (notification-cards.tsx, 1.32.2).
const bell = `${read("components/ui/notification-bell.tsx")}\n${read("components/ui/notification-cards.tsx")}`;
ok(/useState<NotificationItem\[\]>\(\(\) => withOverlay\(notifications, overlay\.current\)\)/.test(bell) && /setItems\(withOverlay\(notifications, overlay\.current\)\);/.test(bell), "a list from the server keeps what you did");
ok(/const row = rowWithOverlay\(fresh, overlay\.current\);\s+if \(!row\) return;/.test(bell), "and so does a live update");
ok(/if \(!leavingRef\.current\.has\(id\)\) setItems/.test(bell), "one sliding out finishes (a live update doesn't cut it short)");
ok(/const isNew = !itemsRef\.current\.some/.test(bell) && /if \(isNew\) enter\(\[id\]\);/.test(bell), "a new one slides in (once)");
ok(/quick \? 0 : LEAVE_MS \+ gap\[i\]/.test(bell) && /if \(!ids\.length \|\| motionReduced\(\)\) return;/.test(bell), "with motion off: gone and in at once");
ok(/\.catch\(\(e\) => comeBack\(\[n\], /.test(bell) && /const gone = clearable;/.test(bell), "a clear the server refused comes back as it was");
ok(/putBack\(cur\.map\(\(n\) => byId\.get\(n\.id\) \?\? n\), rows\)/.test(bell), "unread again if it was unread (nothing changed on the server)");
ok(/if \(!readBefore\) overlay\.current\.read\.delete\(n\.id\);/.test(bell), "a refused answer takes back only itself");
ok(/toast\.error\(e instanceof Error && e\.message \? e\.message : "Couldn't mark them read\. Try again\."\)/.test(bell), "Mark all read: taken back with a word if it fails");
ok(/useSwipeAway\(\{\s+locked: waitsForAnswer\(n\),/.test(bell), "swiping an invite that waits for an answer: it won't go");
ok(/\{\.\.\.\(swipe && !actionable \? \{ role: "button", tabIndex: 0, onKeyDown: keys \} : \{\}\)\}/.test(bell), "the words are the button (the card holds the X: a button can't hold another)");
ok(!/role: actionable \? undefined : "button"/.test(bell), "the card itself isn't a button");
ok(/aria-label=\{unreadCount \? `Notifications, \$\{unreadCount\} unread` : "Notifications"\}/.test(bell), "the bell says how many are unread");
ok(/className="notif-panel glass-pane /.test(bell), "the panel is glass");
const actions = read("app/(dashboard)/notification-actions.ts");
ok(/export async function markNotificationRead\(id: string\): Promise<\{ error\?: string \}>/.test(actions) && /export async function markAllNotificationsRead\(\): Promise<\{ error\?: string \}>/.test(actions), "marking read says whether it worked");

// --- Swiping ---------------------------------------------------------------------------------------------------------------
const swipe = read("components/ui/use-swipe-away.ts");
ok(/closest\("button, a, input, textarea, select, \[data-no-swipe\]"\)/.test(swipe), "a press on a button inside is the button's");
ok(/if \(Math\.abs\(dy\) > 10 && Math\.abs\(dy\) >= Math\.abs\(dx\)\)/.test(swipe), "up and down first: the list scrolls");
ok(/setPointerCapture\(e\.pointerId\)/.test(swipe), "the card keeps the finger once it moves");
ok(/Math\.sign\(dx\) \* Math\.min\(40, Math\.abs\(dx\) \/ 4\)/.test(swipe), "one that can't go only gives a little");
ok(/const still = e\.timeStamp - d\.lastT > 120;/.test(swipe) && /const velocity = still \? 0 : d\.vx;/.test(swipe), "a pause before letting go isn't a flick");
ok(/onDragStart\(e: React\.DragEvent<HTMLElement>\) \{\s+e\.preventDefault\(\);/.test(swipe), "a picture inside isn't dragged off instead");
ok(/onClickCapture[\s\S]{0,120}swallow\.current = false;\s+e\.preventDefault\(\);\s+e\.stopPropagation\(\);/.test(swipe), "a swipe isn't also a click");

// --- Toasts ----------------------------------------------------------------------------------------------------------------
const toasts = read("components/ui/toast-provider.tsx");
ok(/const api = useMemo<ToastAPI>\(/.test(toasts), "the same toasts object every time (pages don't redo work when one comes or goes)");
ok(/window\.setTimeout\(\(\) => remove\(id\), motionReduced\(\) \? 0 : LEAVE_MS\);/.test(toasts), "a toast slides out before it's gone (at once with motion off)");
ok(/onPointerEnter=\{\(e\) => e\.pointerType === "mouse" && pause\(\)\}/.test(toasts) && /const ms = Math\.max\(1200, d\.left\);/.test(toasts), "they wait while you point at them");
ok(/useSwipeAway\(\{/.test(toasts) && /aria-label=\{t\.closeLabel \?\? "Dismiss"\}/.test(toasts), "swipe one away, or its X");

// --- The look --------------------------------------------------------------------------------------------------------------
const css = read("app/globals.css");
ok(/\.notif-item \{ display: grid; grid-template-rows: 1fr; transition: grid-template-rows 0\.22s var\(--ease-out\) calc\(var\(--leave-delay, 0ms\) \+ 0\.08s\); \}/.test(css), "the gap closes after the card has slid out (1.31.9: quicker)");
ok(/\.notif-item\[data-leaving\] \{ grid-template-rows: 0fr; pointer-events: none; \}/.test(css), "the ones under it move up into its place");
ok(/@keyframes notif-open \{ from \{ grid-template-rows: 0fr; \} to \{ grid-template-rows: 1fr; \} \}/.test(css) && /\.notif-item\[data-entering\] \{ animation: notif-open/.test(css), "a new one opens its place");
ok(/\.notif-clip \{ min-height: 0; overflow: hidden; \}/.test(css), "the slot can close all the way");
ok(/\.notif-card \{[^}]*touch-action: pan-y;/.test(css), "a finger sideways is a swipe, up and down still scrolls the list");
ok(/\.toast-card \{[^}]*touch-action: none;/.test(css), "a toast takes the finger itself (1.31.9: it can be swiped up and away too)");
ok(/\.toast-item\[data-leaving\] \{ grid-template-rows: 0fr; \}/.test(css), "a toast's place closes too");
ok(/html\[data-glass\] \.notif-panel \{ background-color: rgb\(var\(--surface\) \/ var\(--glass-tint\)\); \}/.test(css), "the bell is as clear as the cards (set as the colour: the floating boxes' rule is more specific)");
ok(/html\[data-glass\]:has\(\[data-dash-bg\]\) \.notif-panel \{\s+background-color: rgb\(var\(--surface\) \/ max\(var\(--glass-tint\), var\(--wall-floor\)\)\);/.test(css), "over a wallpaper it keeps the words readable");
ok(/html\[data-glass\] \.glass-toast\.bg-ink \{/.test(css) && !/data-glass-scope="everywhere"\] \.glass-toast/.test(css), "toasts are glass whenever the glass look is on");
ok(/\.notif-card:has\(\.notif-main:focus-visible\) \{ outline:/.test(css), "the keyboard's place is shown on the card");

// --- Words ------------------------------------------------------------------------------------------------------------------
const words = [...`${bell}\n${actions}\n${toasts}`.matchAll(/(?:error|success)\((?:[^"]*)"([^"]+)"/g), ...actions.matchAll(/error: "([^"]+)"/g)].map((m) => m[1]);
ok(words.length > 8, `found what people read (${words.length})`);
ok(!words.some((w) => /[–—]| - /.test(w)), `no dashes in what people read: ${words.filter((w) => /[–—]| - /.test(w)).join(" | ")}`);

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("notifications: all passed");
