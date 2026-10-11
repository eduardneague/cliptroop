// Copies browser-ready library builds into public/vendor after every
// `npm install` (locally and on Vercel), so they always match the
// installed version. These files are loaded at runtime instead of being
// bundled (the Word and PDF libraries are big, and the Word one breaks
// under Turbopack's dev bundler).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["node_modules/docx/dist/index.iife.js", "public/vendor/docx.iife.js"],
  // The PDF made for Claude (Analytics → Advanced).
  ["node_modules/pdf-lib/dist/pdf-lib.min.js", "public/vendor/pdf-lib.min.js"],
  ["node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js", "public/vendor/fontkit.umd.min.js"],
];

for (const [from, to] of files) {
  const src = join(root, from);
  const dest = join(root, to);
  if (!existsSync(src)) {
    console.warn(`[copy-vendor] missing ${from}, skipped`);
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`[copy-vendor] ${from} -> ${to}`);
}
