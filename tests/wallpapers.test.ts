// Saved wallpapers (1.28.0): how bright a picture's top is, and whether the words over it go dark or white.
import { clampLuma, effectiveLuma, lumaOf, wallpaperError, wordsDark, WORDS_SPLIT, PAPER_LUMA } from "../lib/wallpapers";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// A picture: w × h, the top `topRows` rows one colour, the rest another.
function pic(w: number, h: number, top: [number, number, number], rest: [number, number, number], topRows: number, alpha = 255): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = y < topRows ? top : rest;
      d.set([...c, alpha], (y * w + x) * 4);
    }
  return d;
}

ok(lumaOf(pic(10, 10, [255, 255, 255], [0, 0, 0], 4), 10, 10) === 100, "white sky, black ground: the top 40 % is measured → 100");
ok(lumaOf(pic(10, 10, [0, 0, 0], [255, 255, 255], 4), 10, 10) === 0, "black sky, white ground → 0");
ok(lumaOf(pic(10, 10, [0, 0, 0], [255, 255, 255], 2), 10, 10) === 50, "half the band dark, half light → 50");
ok(lumaOf(pic(4, 4, [0, 255, 0], [0, 0, 0], 4), 4, 4) === 72, "pure green: Rec. 709 weight → 72");
ok(lumaOf(pic(4, 4, [255, 255, 255], [0, 0, 0], 4, 0), 4, 4) === null, "all transparent → unknown");
ok(lumaOf(pic(1, 1, [128, 128, 128], [0, 0, 0], 1), 1, 1) === 50, "a single pixel picture still counts");

ok(clampLuma(130) === 100 && clampLuma(-4) === 0 && clampLuma(41.6) === 42, "luma kept to 0–100, whole");
ok(clampLuma("50") === null && clampLuma(Number.NaN) === null && clampLuma(null) === null, "not a number → unknown");

// The darkening mixes in the paper: light paper in light mode, dark paper in dark mode.
ok(Math.abs(effectiveLuma(20, 30, false) - (0.2 * 0.7 + PAPER_LUMA.light * 0.3)) < 1e-9, "light mode: picture and light paper");
ok(Math.abs(effectiveLuma(20, 30, true) - (0.2 * 0.7 + PAPER_LUMA.dark * 0.3)) < 1e-9, "dark mode: picture and dark paper");
ok(effectiveLuma(null, 30, false) === PAPER_LUMA.light && effectiveLuma(null, 0, true) === PAPER_LUMA.dark, "unknown: as bright as the paper");
ok(effectiveLuma(50, 200, false) === effectiveLuma(50, 80, false), "darkening is at most 80 %");

// Words.
ok(!wordsDark(22, 30, false), "a dusk (22) in light mode: white words");
ok(wordsDark(88, 30, false), "a bright sky (88) in light mode: dark words");
ok(wordsDark(88, 30, true), "a bright sky in dark mode: dark words too (the picture decides)");
ok(!wordsDark(22, 30, true), "a dusk in dark mode: white words");
ok(wordsDark(null, 30, false) && !wordsDark(null, 30, true), "unknown: the theme's own (dark words in light mode, white in dark)");
ok(wordsDark(30, 80, false), "heavily darkened with light paper: dark words even over a darkish picture");
ok(!wordsDark(70, 80, true), "heavily darkened with dark paper: white words even over a brightish picture");
ok(WORDS_SPLIT > 0.46 && WORDS_SPLIT < 0.6, "the split sits a little above WCAG's crossover");

// Errors.
ok(/0093/.test(wallpaperError({ code: "42P01", message: 'relation "profile_wallpapers" does not exist' })), "no table yet → needs 0093");
ok(/3 wallpapers/.test(wallpaperError({ code: "P0001", message: "You can keep 3 wallpapers. Remove or replace one first." })), "the limit");
ok(/can't be used/.test(wallpaperError({ code: "23514", message: "violates check constraint" })), "someone else's folder → can't be used");
ok(wallpaperError(null) === "Couldn't save. Try again.", "anything else");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("wallpapers: ok");
