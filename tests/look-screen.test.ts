// Clip's "new look" screen (1.29.8, lib/look-screen.ts): with the screen in the app shell the change goes to it; without
// (sign in, the landing page, the server) it just happens. 1.35.1: the wallpaper too (turned on or off, picked,
// uploaded, removed while showing, on every page or not), a change that takes a while: the screen stays up until it's
// saved, the page has it and its picture has loaded.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changeLook, LOOK_SCREEN_EVENT, LOOK_SCREEN_FLAG, LOOK_WORDS, runChanges, type LookRequest } from "../lib/look-screen";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

async function main() {
  let applied = 0;
  changeLook("theme", () => void applied++);
  ok(applied === 1, "no window: applied at once");

  const target = new EventTarget();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = Object.assign(target, {} as Record<string, unknown>);
  changeLook("dark", () => void applied++);
  ok(applied === 2, "no screen in the page: applied at once");

  let got: LookRequest | null = null;
  target.addEventListener(LOOK_SCREEN_EVENT, (e) => (got = (e as CustomEvent<LookRequest>).detail));
  (g.window as Record<string, unknown>)[LOOK_SCREEN_FLAG] = true;
  changeLook("glass", () => void applied++);
  ok(applied === 2 && got !== null && (got as LookRequest).what === "glass", "with the screen: handed to it, not applied yet");
  (got as unknown as LookRequest).apply();
  ok(applied === 3, "the screen applies it");
  ok(Object.values(LOOK_WORDS).every((w) => w.length > 5 && !/[–—]/.test(w)), "Clip has words for each, without dashes");
  ok(LOOK_WORDS.wallpaper === "Putting up your wallpaper" && LOOK_WORDS["wallpaper-off"] === "Taking your wallpaper down", "and for a wallpaper going up or down");

  // --- Changes that take a while (1.35.1) ---------------------------------------------------------------------------------
  const order: string[] = [];
  await runChanges([() => void order.push("a"), () => void order.push("b")]);
  ok(order.join("") === "ab", "on the spot: in order, settled at once");
  let slowDone = false;
  const t0 = Date.now();
  await runChanges([() => new Promise<void>((r) => setTimeout(() => ((slowDone = true), r()), 60))], 2000);
  ok(slowDone && Date.now() - t0 >= 55, "one that takes a while: the screen waits for it");
  await runChanges([() => Promise.reject(new Error("no")), () => void order.push("c")], 2000);
  ok(order.join("") === "abc", "one that fails: the screen still goes, the others still happen");
  await runChanges([() => { throw new Error("no"); }, () => void order.push("d")], 2000);
  ok(order.join("") === "abcd", "one that throws: skipped, the others still happen");
  const t1 = Date.now();
  const outcome = await Promise.race([runChanges([() => new Promise<void>(() => {})], 40).then(() => "went"), new Promise<string>((r) => setTimeout(() => r("stuck"), 1000))]);
  ok(outcome === "went" && Date.now() - t1 >= 35, "one that never settles: the screen goes after the longest wait");

  // --- The host waits for them --------------------------------------------------------------------------------------------
  const host = read("components/ui/look-screen.tsx");
  ok(/void runChanges\(\[apply\]\)\.then\(finish\);/.test(host) && /void runChanges\(list\)\.then\(finish\);/.test(host) && !/list\.forEach\(\(f\) => f\(\)\);/.test(host), "the screen leaves once the changes are done, both when it's up already and when it has just come");

  // --- The wallpaper ------------------------------------------------------------------------------------------------------
  const bg = read("app/(dashboard)/settings/dashboard-background.tsx");
  const fn = (name: string) => bg.slice(bg.indexOf(`function ${name}(`), bg.indexOf("\n  }\n", bg.indexOf(`function ${name}(`)));
  ok(/const underScreen = \(what: "wallpaper" \| "wallpaper-off", change: \(\) => Promise<boolean>\) =>\s+changeLook\(what, async \(\) => \{\s+if \(!\(await change\(\)\)\) return;\s+await refreshed\(\);\s+if \(what === "wallpaper"\) await wallpaperDrawn\(\);/.test(bg), "under the screen: saved, then the page again, then its picture (a failure: just the screen going)");
  ok(/waiters\.current\.push\(resolve\);/.test(bg) && /if \(refreshing \|\| !waiters\.current\.length\) return;/.test(bg) && /window\.setTimeout\(resolve, 6000\);/.test(bg), "a refresh you can wait for: done when the page has it (at most 6 s)");
  ok(/underScreen\(next \? "wallpaper" : "wallpaper-off", async \(\) => \{\s+setOn\(next\);/.test(fn("toggle")), "turning it on or off");
  ok(/underScreen\("wallpaper", async \(\) => \{\s+setBusy\(\{ id: w\.id, kind: "use" \}\);/.test(fn("switchTo")), "picking one");
  ok(/if \(on && current\) underScreen\(next \? "wallpaper" : "wallpaper-off", change\);/.test(fn("changeEverywhere")), "on every page or not, when it's showing (this page gets it or loses it)");
  ok(/if \(inUse && on\) underScreen\(others \? "wallpaper" : "wallpaper-off", change\);/.test(bg), "removing the one showing (the next goes up, or none)");
  ok(/if \(lighten\) refresh\(\);\s+else underScreen\("wallpaper", async \(\) => true\);/.test(bg), "a new one uploaded goes up under it too (one made lighter looks the same: no screen)");
  ok(!/function changeDim[\s\S]{0,400}underScreen/.test(bg), "not the darkness slider (it changes as you drag)");
  const lib = read("lib/look-screen.ts");
  ok(/document\.querySelector\("\.dash-backdrop > :is\(img, video\)\.opacity-0"\)/.test(lib) && /requestAnimationFrame\(\(\) => requestAnimationFrame\(check\)\)/.test(lib), "its picture: the new layer has loaded (DashboardBackdrop hides it until then)");
  ok(/opacity-0"/.test(read("modules/dashboard/components/backdrop.tsx")) && /l\.ready \? "opacity-100" : "opacity-0"/.test(read("modules/dashboard/components/backdrop.tsx")), "(the backdrop still hides a layer until it has loaded)");

  if (fails) {
    console.log(`${fails} failed`);
    process.exit(1);
  }
  console.log("look screen: all passed");
}
void main();
