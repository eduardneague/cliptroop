// 1.51.0: next/font and Google Fonts' addresses with no file extension.
//
// The CI build of 1.50.1 (Nov 4 2026) stopped in app/layout.tsx: "An error occurred in `next/font`. TypeError: Cannot
// read properties of null (reading '1') at …/@next/font/dist/google/loader.js:122". Google Fonts sometimes answers with
// a font file address like https://fonts.gstatic.com/l/font?kit=… instead of …/name.woff2, and Next.js reads the file's
// type from the address's extension: no extension, no build. Next.js's own fix (vercel/next.js#99132: use the CSS's
// format('…') hint, else woff2) isn't in 15.5.x, so this applies the same fallback to the installed copy: woff2, the
// format Google serves to the browser Next.js says it is.
//
// Run after every install (package.json "postinstall") and before every build ("build"). It changes one line, only
// when it finds exactly that line, says what it did, and never fails the install or the build. Once a Next.js release
// carries the fix, the line isn't there any more and this does nothing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BROKEN = "const ext = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1];";
export const FIXED =
  'const ext = (/\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl) || [null, "woff2"])[1]; /* ClipTroop: scripts/patch-next-font.mjs */';

/** The loader's text with the fallback in, and what happened. */
export function patchLoader(src) {
  if (src.includes(FIXED)) return { src, result: "already" };
  const n = src.split(BROKEN).length - 1;
  if (n !== 1) return { src, result: "not-found" };
  return { src: src.replace(BROKEN, FIXED), result: "patched" };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const file = join(root, "node_modules/next/dist/compiled/@next/font/dist/google/loader.js");
  if (!existsSync(file)) {
    console.log("[patch-next-font] next/font's Google loader isn't installed: nothing to do");
    return;
  }
  const { src, result } = patchLoader(readFileSync(file, "utf8"));
  if (result === "patched") writeFileSync(file, src);
  console.log(
    result === "patched"
      ? "[patch-next-font] Google font addresses without an extension are read as woff2"
      : result === "already"
        ? "[patch-next-font] already in place"
        : "[patch-next-font] this Next.js has a different loader (probably fixed): nothing changed"
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (e) {
    console.warn(`[patch-next-font] skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
}
