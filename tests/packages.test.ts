// 1.31.2: packages. Every package the app lists is really used; every package comes from npm's own registry with a
// checksum; only the known few run an install script (a new one has to be looked at first); the versions in
// package.json and the lock agree; Dependabot keeps them up to date (into staging), and CI flags a known high or
// critical vulnerability in what the app ships.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === "node_modules" || name === ".next" || name === "vendor") continue;
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

type Pkg = { version: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const pkg = JSON.parse(read("package.json")) as Pkg;
const lock = JSON.parse(read("package-lock.json")) as { lockfileVersion: number; version: string; packages: Record<string, { version?: string; resolved?: string; integrity?: string; hasInstallScript?: boolean; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }> };

// --- Every listed package is used ------------------------------------------------------------------------------------
const source = ["app", "lib", "modules", "components", "scripts", "types"]
  .flatMap((d) => walk(d))
  .filter((f) => /\.(ts|tsx|mjs|js|cjs)$/.test(f))
  .concat(["middleware.ts", "next.config.ts", "instrumentation.ts", "instrumentation-client.ts", "tailwind.config.ts"])
  .map((f) => read(f))
  .join("\n");
// Used without an import: the build's own tools, the CSS pipeline (postcss.config.js), the libraries copied into
// public/vendor after install (scripts/copy-vendor.mjs, loaded in the browser at run time) and the type packages.
const postcss = read("postcss.config.js");
const vendor = read("scripts/copy-vendor.mjs");
const TOOLS = new Set(["next", "react", "react-dom", "typescript", "eslint", "@types/node", "@types/react", "@types/react-dom"]);
const used = (name: string) =>
  TOOLS.has(name) ||
  (name === "eslint-config-next" && /"extends": "next\//.test(read(".eslintrc.json"))) ||
  // The CSS pipeline itself (tailwindcss and autoprefixer run inside it).
  (name === "postcss" && /plugins:/.test(postcss)) ||
  new RegExp(`\\b${name}:\\s*\\{`).test(postcss) ||
  vendor.includes(`node_modules/${name}/`) ||
  new RegExp(`(from |import |import\\(|require\\()"${name.replace("/", "\\/")}(\\/[^"]*)?"`).test(source);
for (const name of [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]) ok(used(name), `${name} is listed in package.json but nothing uses it`);
ok(Object.keys(pkg.dependencies ?? {}).length > 15, "read package.json");

// --- The lock --------------------------------------------------------------------------------------------------------
ok(lock.lockfileVersion === 3, "lockfile version 3");
ok(lock.version === pkg.version && lock.packages[""]?.version === pkg.version, "package-lock.json has the app's version");
const root = lock.packages[""];
ok(JSON.stringify(root.dependencies) === JSON.stringify(pkg.dependencies) && JSON.stringify(root.devDependencies) === JSON.stringify(pkg.devDependencies), "the lock lists the same packages and ranges as package.json (npm ci would refuse otherwise)");
const entries = Object.entries(lock.packages).filter(([k]) => k);
for (const [k, v] of entries) {
  ok(!!v.resolved && v.resolved.startsWith("https://registry.npmjs.org/"), `${k}: comes from somewhere other than npm's registry (${v.resolved})`);
  ok(!!v.integrity && /^sha512-/.test(v.integrity), `${k}: no checksum`);
}
// Packages that run a script when installed: only these, reviewed (a new one shows up here first).
const SCRIPTS = new Set(["fsevents", "unrs-resolver"]);
for (const [k, v] of entries) if (v.hasInstallScript) ok(SCRIPTS.has(k.replace(/^.*node_modules\//, "")), `${k} runs a script when installed: look at it, then add it to the list`);
for (const name of Object.keys(pkg.dependencies ?? {})) ok(!!lock.packages[`node_modules/${name}`], `${name} is in the lock`);

// --- Kept up to date -------------------------------------------------------------------------------------------------
const dependabot = read(".github/dependabot.yml");
ok(/package-ecosystem: npm[\s\S]*?target-branch: staging/.test(dependabot) && /package-ecosystem: github-actions[\s\S]*?target-branch: staging/.test(dependabot), "Dependabot: packages and actions, into staging");
ok(/update-types: \["version-update:semver-major"\]/.test(dependabot), "Dependabot: big jumps are done by hand");
const ci = read(".github/workflows/ci.yml");
ok(/run: npm audit --omit=dev --audit-level=high/.test(ci), "CI: a known high or critical vulnerability in what the app ships shows as a red ✗");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("packages: all passed");
