// 1.32.3: pictures at the size they're shown, at addresses that don't change, and fonts every page doesn't need.
// Thumbnail Studio's pictures and Ideate's sketches are kept up to 1280 px wide; the dashboard showed them 46 px wide
// from a signed link made on every visit (so downloaded again each time, and one more trip to storage for the page).
// Now /api/package-thumb/<entry>?w= and /api/project-thumb/<id>?w= send a copy that wide (lib/resize-picture.ts, sharp),
// and the browser keeps it. The resizing itself runs in a child with the react-server condition (it's server-only).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const done = () => {
  if (fails) {
    console.log(`${fails} FAILED`);
    process.exit(1);
  }
};

if (process.env.PICTURES_TEST_CHILD) {
  // --- Making the copy (sharp) ---------------------------------------------------------------------------------------------
  (async () => {
    const { resizePicture } = await import("../lib/resize-picture");
    let sharp: (typeof import("sharp"))["default"] | null = null;
    try {
      sharp = (await import("sharp")).default;
    } catch {
      console.log("pictures (resizing): sharp isn't installed here, skipped (npm ci installs it)");
      return;
    }
    type Img = ReturnType<NonNullable<typeof sharp>>;
    const make = (w: number, h: number, extra?: (s: Img) => Img) => {
      let s = sharp!({ create: { width: w, height: h, channels: 3, background: "#e8743b" } });
      s = s.composite([{ input: { create: { width: Math.floor(w / 3), height: Math.floor(h / 3), channels: 3, background: "#1d4ed8" } }, left: 7, top: 5 }]);
      return (extra ? extra(s) : s.jpeg({ quality: 92 })).toBuffer();
    };
    const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const meta = async (b: Uint8Array) => sharp!(Buffer.from(b)).metadata();

    const big = await make(1280, 720);
    const small = await resizePicture(ab(big), 320);
    const m = small ? await meta(small) : null;
    ok(!!small && m?.format === "webp" && m.width === 320 && m.height === 180 && small.byteLength < big.byteLength, `1280×720 → 320×180 WebP, lighter (${m?.width}×${m?.height} ${m?.format}, ${small?.byteLength} < ${big.byteLength} bytes)`);
    ok((await resizePicture(ab(big), 160)) !== null && (await meta((await resizePicture(ab(big), 160))!)).width === 160, "…and 160");
    ok((await resizePicture(ab(await make(300, 169)), 320)) === null, "already that small: the original goes out");
    // A phone photo kept sideways (EXIF 6): turned the right way up, its width is what's shown.
    const sideways = await make(1280, 720, (s) => s.jpeg().withMetadata({ orientation: 6 }));
    const upright = await resizePicture(ab(sideways), 320);
    const um = upright ? await meta(upright) : null;
    ok(!!um && um.width === 320 && (um.height ?? 0) > 500 && (um.orientation ?? 1) === 1, `a sideways photo comes out upright (${um?.width}×${um?.height}, orientation ${um?.orientation})`);
    ok((await resizePicture(ab(await make(500, 300, (s) => s.jpeg().withMetadata({ orientation: 6 }))), 320)) === null, "…and one only 300 px wide once turned is left as it is");
    const frame = (c: string) => sharp!({ create: { width: 400, height: 300, channels: 3, background: c } }).png().toBuffer();
    const gif = await sharp!([await frame("#ff0000"), await frame("#00ff00")], { join: { animated: true } }).gif().toBuffer();
    ok((await resizePicture(ab(gif), 160)) === null, "an animated picture stays as it is (a copy would keep one frame)");
    ok((await resizePicture(new TextEncoder().encode("<svg onload=alert(1)>").buffer as ArrayBuffer, 160)) === null && (await resizePicture(new ArrayBuffer(0), 160)) === null, "not a picture: no copy (the route sends what it has, as the picture type it checked)");
    done();
    console.log("pictures (resizing): all good");
  })().catch((e) => {
    console.log("FAIL", e);
    process.exit(1);
  });
} else {
  (async () => {
    const { PICTURE_WIDTHS, pictureWidth, sketchThumb, studioThumb } = await import("../lib/picture-size");
    // --- The widths -----------------------------------------------------------------------------------------------------
    ok(JSON.stringify(PICTURE_WIDTHS) === "[160,320,640]", "three widths: 160 (lists, 46 to 56 px), 320, 640 (cards, up to 300 px)");
    for (const w of ["160", "320", "640"]) ok(pictureWidth(w) === Number(w), `?w=${w}`);
    for (const w of [null, "", "100", "1280", "abc", "0160", "160.0", "1e3", "-160", " 160", "160px", "99999"]) ok(pictureWidth(w) === null, `?w=${JSON.stringify(w)}: the picture as kept`);
    ok(studioThumb("e1") === "/api/package-thumb/e1" && studioThumb("e1", 160) === "/api/package-thumb/e1?w=160" && sketchThumb("t1", 640) === "/api/project-thumb/t1?w=640", "the addresses");

    // --- The routes -----------------------------------------------------------------------------------------------------
    for (const f of ["app/api/package-thumb/[entry]/route.ts", "app/api/project-thumb/[id]/route.ts"]) {
      const s = read(f);
      ok(/const width = pictureWidth\(new URL\(request\.url\)\.searchParams\.get\("w"\)\);/.test(s) && /const small = width \? await resizePicture\(original, width\) : null;/.test(s), `${f}: ?w= makes a copy that wide`);
      ok(/"Content-Type": small \? "image\/webp" : type/.test(s) && /"Cache-Control": "private, max-age=2592000, immutable"/.test(s) && /"X-Content-Type-Options": "nosniff"/.test(s), `${f}: kept by the browser, never by a shared cache, never sniffed`);
      ok(/const user = await getCachedUser\(\);\s*if \(!user\) return new Response\("Sign in first", \{ status: 401 \}\);/.test(s) && /await createClient\(\)/.test(s) && !/createAdminClient/.test(s), `${f}: signed in, and read as that person (their own team's only)`);
      ok(/if \(!UUID\.test\(/.test(s) && /file\.size > MAX_BYTES/.test(s), `${f}: an id, and a size limit`);
    }
    const resize = read("lib/resize-picture.ts");
    ok(/^import "server-only";/.test(resize) && /limitInputPixels: 40_000_000/.test(resize) && /\.rotate\(\)\.resize\(\{ width, withoutEnlargement: true \}\)\.webp\(/.test(resize), "the copy: server only, at most 40 megapixels in, upright, never bigger, WebP");
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    ok(!!pkg.dependencies.sharp, "sharp is one of the app's own packages (not only Next.js's optional one)");

    // --- Where they're shown --------------------------------------------------------------------------------------------
    const signs = ["app", "modules", "lib", "components"].flatMap((d) => {
      const out: string[] = [];
      const walk = (p: string) => {
        for (const n of require("node:fs").readdirSync(join(root, p), { withFileTypes: true }) as { name: string; isDirectory(): boolean }[]) {
          const q = join(p, n.name);
          if (n.isDirectory()) walk(q);
          else if (/\.tsx?$/.test(n.name) && /from\("package-thumbs"\)\.createSignedUrls?\(/.test(read(q))) out.push(q);
        }
      };
      walk(d);
      return out;
    });
    ok(signs.length === 0, `no signed links for Thumbnail Studio's pictures (a new address every visit): ${signs.join(", ")}`);
    ok(/const thumb = \(id: string\) => \(winner\.has\(id\) \? studioThumb\(winner\.get\(id\)!, 160\) : null\);/.test(read("modules/dashboard/lib/queries.ts")), "the dashboard: 160 px (shown 46 to 52)");
    ok(/studioThumb\(winnerOf\.get\(l\.id as string\)!, 640\)/.test(read("app/(dashboard)/calendar/page.tsx")), "the calendar: 640 px (shown up to 240), loaded when a video's details open");
    ok(/studioThumb\(r\.id as string, 640\)/.test(read("app/(dashboard)/videos/[id]/page.tsx")), "a video's page: 640 px");
    const list = read("app/(dashboard)/videos/page.tsx");
    ok(/const cover = coverOf\(p, 160\);[\s\S]*const cover = coverOf\(p, 640\);/.test(list) && /return first \? sketchThumb\(first\.id, w\) : null;/.test(list) && /project_thumbnails\(id, storage_path, position\)/.test(list), "the long videos list: 160 px in the table, 640 on a card, sketches too");
    ok(/studioThumb\(p\.winner_id, 160\)/.test(read("components/search/build.tsx")), "search: 160 px");
    ok(/url: e\.thumbnail_storage_path \? studioThumb\(e\.id as string\) : null,/.test(read("modules/studio/lib/queries.ts")), "Thumbnail Studio: your variations as kept, at addresses that don't change");

    // --- Fonts ----------------------------------------------------------------------------------------------------------
    const layout = read("app/layout.tsx");
    const upright = /const fraunces = Fraunces\(\{([\s\S]*?)\}\);/.exec(layout)?.[1] ?? "";
    const italic = /const frauncesItalic = Fraunces\(\{([\s\S]*?)\}\);/.exec(layout)?.[1] ?? "";
    ok(upright.length > 0 && !/italic/.test(upright), "Fraunces upright: one call, no italic in it (every file of a call is preloaded on every page)");
    ok(/style: "italic"/.test(italic) && /preload: false/.test(italic) && /variable: "--font-display-italic"/.test(italic), "its italic: a call of its own, not preloaded");
    ok(/\$\{frauncesItalic\.variable\}/.test(layout), "…and its family is on the page");
    const css = read("components/landing/landing.css");
    ok(/\.ld-italic,\s*\.ld-scene-mark \{ font-family: var\(--font-display-italic\), var\(--font-display\); font-style: italic; \}/.test(css), "the home page's italic words use it");
    const italicDisplay = ["app", "components", "modules"].some((d) => {
      let found = false;
      const walk = (p: string) => {
        for (const n of require("node:fs").readdirSync(join(root, p), { withFileTypes: true }) as { name: string; isDirectory(): boolean }[]) {
          const q = join(p, n.name);
          if (n.isDirectory()) walk(q);
          else if (/\.tsx$/.test(n.name) && /className="[^"]*\bfont-display\b[^"]*\bitalic\b|className="[^"]*\bitalic\b[^"]*\bfont-display\b/.test(read(q))) found = true;
        }
      };
      walk(d);
      return found;
    });
    ok(!italicDisplay, "no font-display + italic left (it would be a slanted copy of the upright font): use ld-italic or --font-display-italic");
    done();

    // The resizing, as the server runs it.
    const r = spawnSync("npx", ["--yes", "tsx", "--conditions=react-server", __filename], {
      stdio: "inherit",
      env: { ...process.env, PICTURES_TEST_CHILD: "1" },
      shell: process.platform === "win32",
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
    console.log("pictures size: all good");
  })();
}
