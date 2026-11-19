// 1.55.7: the owner, Nov 19 2026 (19:58): "skeletons across the app have a flickering bug, they appear and then
// disappear and then appear again as if the page tried to load twice, this is happening randomly all across the app".
//
// Next shows a loading screen per level as a page comes in parts: the app's own (app/(dashboard)/loading.tsx) when you
// move to another part of it, then that part's, then the page's (videos → the video → its script). Each one took the
// last one's place and rose in again from nothing (globals.css .motion-page), and the app's own was a neutral page
// everywhere but shorts and videos: skeletons appeared, vanished and appeared again, sometimes in another shape. Now
// skeletons don't rise in, and every level shows exactly the same thing at a given address: this renders each level's
// loading screen at each kind of address and wants the same markup from all of them.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

// (The pages' TSX is compiled for the classic runtime here, which looks for React by name.)
(globalThis as unknown as { React: typeof React }).React = React;

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

type Loader = () => React.ReactElement | Promise<React.ReactElement>;
const load = async (rel: string): Promise<Loader> => (await import(join("..", "app/(dashboard)", rel, "loading"))).default as Loader;
const at = async (path: string, Loading: Loader) => {
  // (Business's is an async server component: what it returns is drawn; the rest are drawn as components.)
  const el = Loading.constructor.name === "AsyncFunction" ? await Loading() : createElement(Loading as () => React.ReactElement);
  return renderToStaticMarkup(createElement(PathnameContext.Provider, { value: path }, createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, el)));
};

// Each kind of address, and the folders whose loading screens show on the way to it (outermost first).
const ROUTES: [string, string[]][] = [
  ["/dashboard", ["", "dashboard"]],
  ["/todo", ["", "todo"]],
  ["/calendar", ["", "calendar"]],
  ["/meetings", ["", "meetings"]],
  ["/meetings/m1", ["", "meetings", "meetings/[id]"]],
  ["/posting", ["", "posting"]],
  ["/outliers", ["", "outliers"]],
  ["/frame-guides", ["", "frame-guides"]],
  ["/analytics", ["", "analytics"]],
  ["/analytics/video/youtube/v1", ["", "analytics", "analytics/video/[platform]/[id]"]],
  ["/objectives", ["", "objectives"]],
  ["/team", ["", "team"]],
  ["/teams/new", ["", "teams/new"]],
  ["/settings", ["", "settings"]],
  ["/setup", ["", "setup"]],
  ["/developer", ["", "developer"]],
  ["/business", ["", "business"]],
  ["/u/eduard", ["", "u/[username]"]],
  ["/word", ["", "word"]],
  ["/shorts", ["", "shorts"]],
  ["/shorts/new", ["", "shorts", "shorts/new"]],
  ["/shorts/s1", ["", "shorts", "shorts/[id]"]],
  ["/shorts/s1/script", ["", "shorts", "shorts/[id]", "shorts/[id]/script"]],
  ["/shorts/s1/review", ["", "shorts", "shorts/[id]", "shorts/[id]/review"]],
  ["/videos", ["", "videos"]],
  ["/videos/new", ["", "videos", "videos/new"]],
  ["/videos/v1", ["", "videos", "videos/[id]"]],
  ["/videos/v1/script", ["", "videos", "videos/[id]", "videos/[id]/script"]],
  ["/videos/v1/review", ["", "videos", "videos/[id]", "videos/[id]/review"]],
  ["/videos/v1/studio", ["", "videos", "videos/[id]", "videos/[id]/studio"]],
];

void (async () => {
  for (const [path, levels] of ROUTES) {
    const html = await Promise.all(levels.map(async (l) => at(path, await load(l))));
    const deepest = html[html.length - 1];
    html.forEach((h, i) => ok(h === deepest, `${path}: ${levels[i] || "the app's"} loading screen is the page's own (${levels[levels.length - 1]})`));
    ok(/^<div[^>]*aria-busy="true"/.test(deepest), `${path}: it's marked as loading (so it doesn't rise in: globals.css)`);
  }
  // Every loading screen of the dashboard is in the table above.
  const listed = new Set(ROUTES.flatMap(([, l]) => l));
  const all = readdirSync(join(__dirname, "..", "app/(dashboard)"), { recursive: true }) as string[];
  for (const f of all.filter((f) => f.endsWith("loading.tsx"))) {
    const dir = f.replace(/\/?loading\.tsx$/, "");
    ok(listed.has(dir), `${dir || "the app's"} loading screen is checked here`);
  }

  // Skeletons stay still; the page itself rises in.
  const css = readFileSync(join(__dirname, "..", "app/globals.css"), "utf8");
  const rise = css.indexOf(".motion-page > * { animation: page-in");
  const still = css.indexOf('.motion-page > [aria-busy="true"] { animation: none; }');
  ok(rise > 0 && still > rise && still > css.indexOf(".motion-page > [data-dash-bg]"), "skeletons don't rise in (the rule after the page's)");

  if (fails) {
    console.log(`${fails} failed`);
    process.exit(1);
  }
  console.log(`loading levels ok (${ROUTES.length} addresses)`);
})();
