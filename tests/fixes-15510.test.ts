// 1.55.10: Next.js 15.5.29. GitHub's advisory database added three Next.js advisories on Nov 19 2026 (published by
// Next.js on Nov 3, fixed in 15.5.29), all for next <= 15.5.28, so the vulnerability gate (scripts/audit.mjs) stopped
// the build of 1.55.9: GHSA-7qx7-33qx-rqx2 (the image optimizer could take an SVG), GHSA-f3mh-rxg3-f5g2 (HttpOnly
// cookies in an internal header on Edge routes), GHSA-pc58-hwjq-p385 (a forwarded fetched response's framing). The
// lock takes next and its own packages at 15.5.29 (as npm wrote them on the Dependabot branch, nothing else of it),
// and the picomatch waiver npm no longer needs is gone.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

type Entry = { version?: string; resolved?: string; integrity?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
const pkg = JSON.parse(read("package.json")) as { version: string; dependencies: Record<string, string>; devDependencies: Record<string, string> };
const lock = JSON.parse(read("package-lock.json")) as { version: string; packages: Record<string, Entry> };
const at = (name: string) => lock.packages[`node_modules/${name}`];

// "15.5.29" ≥ "15.5.29"
const atLeast = (v: string | undefined, min: string) => {
  const a = (v ?? "0").split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

// --- Next.js past the three advisories (all of them: next <= 15.5.28) --------------------------------------------------
const next = at("next");
ok(atLeast(next?.version, "15.5.29"), `next is 15.5.29 or later (${next?.version})`);
ok(/^\^15\.5\.(29|[3-9]\d)$/.test(pkg.dependencies.next) && /^\^15\.5\.(29|[3-9]\d)$/.test(pkg.devDependencies["eslint-config-next"]), "package.json asks for 15.5.29 at least (never back to a version with them)");
ok(lock.packages[""].dependencies?.next === pkg.dependencies.next, "the lock's own entry asks what package.json asks");

// Its own packages move with it: @next/env, every platform's compiler, and the lint config with its plugin.
const same = ["@next/env", "eslint-config-next", "@next/eslint-plugin-next", ...Object.keys(next?.optionalDependencies ?? {}).filter((n) => n.startsWith("@next/swc-"))];
ok(same.length === 11, `next's own packages: ${same.length}`);
for (const n of same) {
  const e = at(n);
  ok(e?.version === next?.version, `${n} is ${next?.version} like next (${e?.version})`);
  ok(!!e?.resolved?.startsWith(`https://registry.npmjs.org/${n}/-/`) && /^sha512-[A-Za-z0-9+/]{86}==$/.test(e?.integrity ?? ""), `${n} comes from npm's registry with its checksum`);
}
ok(next?.dependencies?.["@next/env"] === next?.version && Object.entries(next?.optionalDependencies ?? {}).every(([n, v]) => !n.startsWith("@next/swc-") || v === next?.version), "next asks for exactly those versions");
ok(at("eslint-config-next")?.dependencies?.["@next/eslint-plugin-next"] === at("eslint-config-next")?.version, "the lint config asks for its own plugin's version");
ok(/^https:\/\/registry\.npmjs\.org\/next\/-\/next-15\.5\.\d+\.tgz$/.test(next?.resolved ?? ""), "next itself from the registry");

// Nothing else of the Dependabot branch came along (its other 13 updates are looked at on their own).
for (const [n, v] of [["@supabase/ssr", "0.5.2"], ["@tiptap/core", "3.32.0"], ["docx", "9.14.0"], ["postcss", "8.5.31"], ["cookie", "0.7.2"]] as const) ok(at(n)?.version === v, `${n} stays ${v} (${at(n)?.version})`);

// --- The waiver npm stopped needing is gone ------------------------------------------------------------------------------
const waivers = JSON.parse(read("security/audit-waivers.json")) as { waivers: { id: string }[] };
ok(Array.isArray(waivers.waivers) && !waivers.waivers.some((w) => w.id === "GHSA-fc5q-39xc-vjpf"), "the picomatch waiver is out (npm no longer reports it)");

// --- The version moves together --------------------------------------------------------------------------------------------
ok(atLeast(pkg.version, "1.55.10") && lock.version === pkg.version && lock.packages[""] && (lock.packages[""] as { version?: string }).version === pkg.version, `1.55.10 or later everywhere (${pkg.version})`);
ok(/version: "1\.55\.10"/.test(read("lib/changelog.ts")), "What's new has it");

console.log(fails ? `${fails} failed` : "fixes-15510: all passed");
process.exit(fails ? 1 : 0);
