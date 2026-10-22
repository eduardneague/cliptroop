// Clip's "new look" screen (1.29.8, lib/look-screen.ts): with the screen in the app shell the change goes to it; without
// (sign in, the landing page, the server) it just happens.
import { changeLook, LOOK_SCREEN_EVENT, LOOK_SCREEN_FLAG, LOOK_WORDS, type LookRequest } from "../lib/look-screen";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

let applied = 0;
changeLook("theme", () => applied++);
ok(applied === 1, "no window: applied at once");

const target = new EventTarget();
const g = globalThis as unknown as Record<string, unknown>;
g.window = Object.assign(target, {} as Record<string, unknown>);
changeLook("dark", () => applied++);
ok(applied === 2, "no screen in the page: applied at once");

let got: LookRequest | null = null;
target.addEventListener(LOOK_SCREEN_EVENT, (e) => (got = (e as CustomEvent<LookRequest>).detail));
(g.window as Record<string, unknown>)[LOOK_SCREEN_FLAG] = true;
changeLook("glass", () => applied++);
ok(applied === 2 && got !== null && (got as LookRequest).what === "glass", "with the screen: handed to it, not applied yet");
(got as unknown as LookRequest).apply();
ok(applied === 3, "the screen applies it");
ok(Object.values(LOOK_WORDS).every((w) => w.length > 5 && !/[–—]/.test(w)), "Clip has words for each, without dashes");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("look screen: all passed");
