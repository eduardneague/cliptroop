// 1.55.3: the owner, Nov 19 2026 (12:49): "i want to modify the way we can scale images within scripts, its not great the
// way it is right now with that corner thing, i want to make it more natural in a way".
//   * The corner square is gone. The side that moves has a slim handle (the right one of a picture on the left, the left
//     one of a picture on the right, both of one in the middle), on hover and while the picture is selected, the whole
//     height of the side (wider to a finger on a touch screen).
//   * The edge follows the pointer (in the middle both sides move, so the one you hold stays under it), the height with
//     it. It settles on a quarter, a third, a half, two thirds, three quarters or the whole page when it comes close
//     (the handle turns amber), and says how wide it is.
//   * Saved once, as it's let go: one undo (the script is focused, so Ctrl+Z works straight away), one change for the
//     others writing with you. Escape while dragging: back as it was. Double-click a side: the whole width. The keyboard
//     works too (the handle is a slider).
//   * A picture narrower than its bar has the bar above it, from its side (it hung off the page and over the handle).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { draggedWidth, growth, keyedWidth, movingSides, narrowest, PICTURE_MIN_PCT, PICTURE_SNAPS } from "../modules/scripts/lib/picture-width";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// ---- which sides move, and which way -----------------------------------------------------------------------------------------
ok(JSON.stringify(movingSides("left")) === '["right"]' && JSON.stringify(movingSides("right")) === '["left"]' && JSON.stringify(movingSides("center")) === '["left","right"]', "the right side of a picture on the left, the left of one on the right, both in the middle");
ok(growth("right", "left") === 1 && growth("left", "right") === -1, "out from its side is wider (right on the right side, left on the left)");
ok(growth("right", "center") === 2 && growth("left", "center") === -2, "in the middle both sides move: twice as much, so the side you hold stays under the pointer");

// ---- dragging -------------------------------------------------------------------------------------------------------------------
const FULL = 800;
ok(JSON.stringify(PICTURE_SNAPS) === "[25,33,50,66,75,100]", "it settles on a quarter, a third, a half, two thirds, three quarters, the whole page");
{
  const r = draggedWidth(400, -96, FULL, 1); // 304 px = 38%
  ok(r.pct === 38 && !r.snapped, `between snaps it's where the pointer is (${JSON.stringify(r)})`);
}
for (const p of PICTURE_SNAPS) {
  for (const off of [-1.5, 0, 1.5]) {
    const px = ((p + off) / 100) * FULL;
    const r = draggedWidth(px, 0, FULL, 1);
    ok(r.pct === p && r.snapped, `${p + off}% settles on ${p}% (${JSON.stringify(r)})`);
  }
}
{
  const r = draggedWidth((53 / 100) * FULL, 0, FULL, 1);
  ok(r.pct === 53 && !r.snapped, "3% from a half: left where it is");
}
ok(draggedWidth(400, 5000, FULL, 1).pct === 100, "never wider than the page");
ok(draggedWidth(400, -5000, FULL, 1).pct === PICTURE_MIN_PCT, "never narrower than 15% of it…");
ok(draggedWidth(300, -5000, 400, 1).pct === 20, "…and never under 80 px (on a narrow page: 80 of 400 px is 20%)");
ok(draggedWidth(400, -100, FULL, growth("right", "left")).pct === 38 && draggedWidth(400, 100, FULL, growth("left", "right")).pct === 38, "the left side of a picture on the right: dragging it right narrows it, as the right side's left does");
ok(draggedWidth(400, -50, FULL, growth("left", "center")).pct === 63, "in the middle: 50 px out on one side is 100 px wider");
ok(narrowest(800) === 15 && narrowest(400) === 20 && narrowest(0) === 15, "the narrowest it can be, in percent, on a page this wide");

// ---- the keyboard ---------------------------------------------------------------------------------------------------------------
ok(keyedWidth(50, "ArrowRight", false, "right") === 52 && keyedWidth(50, "ArrowLeft", false, "right") === 48, "the right side: → wider, ← narrower, by 2");
ok(keyedWidth(50, "ArrowLeft", false, "left") === 52 && keyedWidth(50, "ArrowRight", false, "left") === 48, "the left side: ← wider, → narrower");
ok(keyedWidth(50, "ArrowUp", false, "left") === 52 && keyedWidth(50, "ArrowDown", false, "right") === 48, "↑ wider, ↓ narrower on either (as a slider goes)");
ok(keyedWidth(50, "ArrowRight", true, "right") === 60 && keyedWidth(50, "PageDown", false, "right") === 40 && keyedWidth(50, "PageUp", false, "left") === 60, "Shift, Page Up, Page Down: by 10");
ok(keyedWidth(98, "ArrowRight", true, "right") === 100 && keyedWidth(16, "ArrowLeft", true, "right") === PICTURE_MIN_PCT && keyedWidth(30, "ArrowDown", true, "left", 25) === 25, "within its limits (the narrowest on this page)");
ok(keyedWidth(50, "Home", false, "right") === PICTURE_MIN_PCT && keyedWidth(50, "Home", false, "right", 20) === 20 && keyedWidth(50, "End", false, "left") === 100, "Home the narrowest, End the whole page");
ok(keyedWidth(50, "a", false, "right") === null && keyedWidth(50, "Enter", false, "left") === null && keyedWidth(50, "Tab", false, "left") === null, "other keys aren't its");
ok(keyedWidth(37.6, "ArrowRight", false, "right") === 40, "from a width it shows (rounded)");

// ---- the picture --------------------------------------------------------------------------------------------------------------------
const img = read("modules/scripts/components/script-image.tsx");
ok(!/cursor-nwse-resize|cursor-nesw-resize|rounded-sm bg-amber border-2 border-white/.test(img), "no corner square");
ok(/import \{ draggedWidth, growth, keyedWidth, movingSides, narrowest, type PictureSide \} from "\.\.\/lib\/picture-width";/.test(img), "its sizes are lib/picture-width.ts's");
const handles = img.slice(img.indexOf("movingSides(align).map((side) => ("), img.indexOf("{/* How wide, while it's dragged. */}"));
ok(handles.length > 500, "a handle for each side that moves");
ok(/role="slider"/.test(handles) && /tabIndex=\{0\}/.test(handles) && /aria-valuenow=\{shown\}/.test(handles) && /aria-valuemin=\{fit\.floor\}/.test(handles) && /aria-valuetext=\{`\$\{shown\}% of the page`\}/.test(handles), "a slider, from the keyboard too, saying how wide it is");
ok(/onPointerDown=\{\(e\) => startResize\(e, side\)\}/.test(handles) && /onKeyDown=\{\(e\) => keyResize\(e, side\)\}/.test(handles), "dragged, or moved from the keyboard");
ok(/onDoubleClick=\{\(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*if \(width !== 100\) updateAttributes\(\{ width: 100 \}\);/.test(handles), "double-click: the whole width");
ok(/absolute top-0 bottom-0 \$\{side === "left" \? "-left-2 \[@media\(pointer:coarse\)\]:-left-4" : "-right-2 \[@media\(pointer:coarse\)\]:-right-4"\} z-\[5\] w-4 \[@media\(pointer:coarse\)\]:w-8/.test(handles) && /cursor-ew-resize touch-none/.test(handles), "the whole height of the side, across its edge (wider to a finger), a side-to-side cursor, the page not scrolled by it");
ok(/drag\?\.side === side \? "opacity-100" : selected \? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"/.test(handles), "shown on hover, while selected or held, and to the keyboard");
ok(/drag\?\.side === side && drag\.snapped \? "bg-amber ring-white\/80" : "bg-white ring-black\/25"/.test(handles), "amber as it settles on a snap");

const start = img.slice(img.indexOf("function startResize("), img.indexOf("function selectMe("));
ok(/if \(e\.button !== 0\) return;/.test(start) && /selectMe\(\);/.test(start), "the main button only; the picture is selected as it's taken");
ok(/const grow = growth\(side, align\);/.test(start) && /const next = draggedWidth\(startW, ev\.clientX - startX, full, grow\);/.test(start), "the edge follows the pointer");
const move = start.slice(start.indexOf("const move = "), start.indexOf("const done = "));
ok(/setDrag\(\{ \.\.\.next, side \}\);/.test(move) && !/updateAttributes/.test(move), "while dragged it's only shown (nothing saved, nothing sent to the others)");
ok(/if \(keep && last && last\.pct !== width\) updateAttributes\(\{ width: last\.pct \}\);/.test(start) && /const up = \(\) => done\(true\);/.test(start), "saved once, as it's let go (one undo)");
ok(/const cancel = \(\) => done\(false\);/.test(start) && /if \(ev\.key !== "Escape"\) return;[\s\S]*?done\(false\);/.test(start) && /window\.addEventListener\("keydown", esc, true\);/.test(start), "Escape (or a lost pointer): back as it was");
ok(/window\.removeEventListener\("pointermove", move\);/.test(start) && /html\.style\.cursor = was\.cursor;/.test(start) && /setDrag\(null\);/.test(start), "and everything put back after");
const select = img.slice(img.indexOf("function selectMe("), img.indexOf("function keyResize("));
ok(/NodeSelection\.create\(state\.doc, at\)/.test(select) && /if \(!view\.hasFocus\(\)\) view\.focus\(\);/.test(select), "the script focused: Ctrl+Z undoes the resize straight away");
ok(/keyedWidth\(width \?\? fit\.pct \?\? 100, e\.key, e\.shiftKey, side, fit\.floor\)/.test(img), "the keyboard starts from the width it shows (one never resized too)");
ok(/style=\{\{ width: drag \? `\$\{drag\.pct\}%` : width \? `\$\{width\}%` : undefined \}\}/.test(img), "its width while dragged, then its own");
ok(/\{drag\.pct === 100 \? "Whole width" : `\$\{drag\.pct\}%`\}/.test(img), "how wide, while dragged");
ok(/drag \? "opacity-0" : selected && editable \? "opacity-100" : "opacity-0 group-hover:opacity-100"/.test(img), "its bar out of the way while dragged");

// ---- its bar on a narrow picture ------------------------------------------------------------------------------------------------
ok(/narrow: r\.width > 0 && r\.width < \(barRef\.current\?\.scrollWidth \?\? 0\) \+ 24,/.test(img) && /new ResizeObserver\(check\)/.test(img), "a picture narrower than its bar is known as it changes");
ok(/fit\.narrow \? `bottom-full pb-2 \$\{align === "right" \? "right-0" : align === "center" \? "left-1\/2 -translate-x-1\/2" : "left-0"\}` : "top-2 left-1\/2 -translate-x-1\/2"/.test(img), "then the bar sits above it, from its side (the gap below it is the bar's, so the pointer can cross it)");
ok(/style=\{fit\.narrow \? \{ maxWidth: fit\.room \} : undefined\}/.test(img) && /room: Math\.max\(160, Math\.round\(align === "right" \? r\.right - 16 : align === "center" \? screen - 32 : screen - 16 - r\.left\)\),/.test(img), "and stays on the screen");
ok(/selected && editable \? "" : "pointer-events-none group-hover:pointer-events-auto"/.test(img), "hidden, it isn't in the way of the text above it");

// ---- what stays -----------------------------------------------------------------------------------------------------------------------
ok(img.includes("draggable: false") && img.includes("onDragStart={(e) => e.preventDefault()}"), "a picture still isn't dragged about (1.54.1)");
ok(/\[33, "S"\],\s*\[60, "M"\],\s*\[100, "L"\],/.test(img), "S, M and L on its bar");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("1.55.3 fixes ok");
