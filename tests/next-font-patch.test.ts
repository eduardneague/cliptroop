// 1.51.0: next/font and Google Fonts' addresses with no file extension (the CI build of 1.50.1, Nov 4 2026: "An error
// occurred in `next/font`. TypeError: Cannot read properties of null (reading '1')"). scripts/patch-next-font.mjs gives
// the installed loader Next.js's own fallback (vercel/next.js#99132, not in 15.5.x): no extension → woff2.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BROKEN, FIXED, patchLoader } from "../scripts/patch-next-font.mjs";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

const sample = `x();\n            ${BROKEN}\n            y();`;
const once = patchLoader(sample);
ok(once.result === "patched" && once.src.includes(FIXED) && !once.src.includes(BROKEN), "the line is replaced");
ok(patchLoader(once.src).result === "already" && patchLoader(once.src).src === once.src, "twice changes nothing");
ok(patchLoader("const ext = getExt(url);").result === "not-found", "another loader (a fixed Next.js): left alone");
ok(patchLoader(`${BROKEN}\n${BROKEN}`).result === "not-found", "only exactly one such line is ever changed");

// What the new line works out, for the addresses Google gives.
const ext = (googleFontFileUrl: string) => new Function("googleFontFileUrl", `${FIXED.replace(/\/\*.*\*\//, "")} return ext;`)(googleFontFileUrl) as string;
ok(ext("https://fonts.gstatic.com/s/fraunces/v32/abc.woff2") === "woff2" && ext("https://fonts.gstatic.com/s/x/y.ttf") === "ttf", "an address with its extension: that one");
ok(ext("https://fonts.gstatic.com/l/font?kit=abc&skey=def&v=v32") === "woff2", "no extension: woff2 (it was a crash)");

// The installed one (this machine's node_modules) matches one of the two, so the script knows it.
const installed = read("node_modules/next/dist/compiled/@next/font/dist/google/loader.js");
ok(installed.includes(BROKEN) || installed.includes(FIXED), "the script knows this Next.js's loader");

const pkg = JSON.parse(read("package.json"));
ok(/node scripts\/patch-next-font\.mjs/.test(pkg.scripts.postinstall) && /node scripts\/patch-next-font\.mjs && next build$/.test(pkg.scripts.build), "after every install and before every build");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("next/font patch: ok");
