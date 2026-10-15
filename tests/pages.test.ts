// Pages and Grid (1.23.1, modules/scripts/lib/pages.ts): every block moved
// onto its page from one long natural layout. Here a page has room for 100
// of text, pages are 140 high and 120 wide, 10 apart.
import { pageAt, pageGeometry, placeBlocks, sameShifts, shiftsOf, type Block } from "../modules/scripts/lib/pages";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const ROOM = 100;
const b = (pos: number, top: number, height: number, o: Partial<Block> = {}): Block => ({ pos, top, height, ...o });

{
  const r = placeBlocks([b(1, 0, 40), b(2, 50, 30)], ROOM);
  ok(r.pages === 1 && r.placed.map((x) => `${x.page}:${x.y}`).join() === "0:0,0:50", `everything fits: one page, the space between kept (got ${JSON.stringify(r.placed)})`);
}
{
  // The third doesn't fit after the second: it goes whole to the next page, at its top.
  const r = placeBlocks([b(1, 0, 40), b(2, 50, 30), b(3, 90, 30), b(4, 130, 20)], ROOM);
  ok(r.pages === 2 && r.placed.map((x) => `${x.page}:${x.y}`).join() === "0:0,0:50,1:0,1:40", `a block that doesn't fit starts the next page, the next one follows with its space (got ${r.placed.map((x) => `${x.page}:${x.y}`).join()})`);
}
{
  // A heading at the bottom with no room for its text: it goes with it.
  const r = placeBlocks([b(1, 0, 60), b(2, 70, 10, { keepWithNext: true }), b(3, 85, 30)], ROOM);
  ok(r.placed.map((x) => x.page).join() === "0,1,1" && r.placed[1].y === 0 && r.placed[2].y === 15, `a heading stays with what follows (got ${r.placed.map((x) => `${x.page}:${x.y}`).join()})`);
  // …but not when what follows is taller than a page anyway.
  const big = placeBlocks([b(1, 0, 60), b(2, 70, 10, { keepWithNext: true }), b(3, 85, 300)], ROOM);
  ok(big.placed[1].page === 0, "a heading before something taller than a page stays");
  // A heading already at the top of a page stays there.
  const top = placeBlocks([b(1, 0, 10, { keepWithNext: true }), b(2, 15, 200)], ROOM);
  ok(top.placed.every((x) => x.page === 0), "a heading at the top of a page stays");
}
{
  // A page break: what follows starts a new page; the break itself never makes an empty page.
  const r = placeBlocks([b(1, 0, 95), b(2, 95, 0, { breakAfter: true }), b(3, 100, 30)], ROOM);
  ok(r.pages === 2 && r.placed.map((x) => `${x.page}:${x.y}`).join() === "0:0,0:95,1:0", `Ctrl+Enter: a new page (got ${r.placed.map((x) => `${x.page}:${x.y}`).join()})`);
  const end = placeBlocks([b(1, 0, 20), b(2, 20, 0, { breakAfter: true })], ROOM);
  ok(end.pages === 2, "a break at the end: a blank page after it");
  const two = placeBlocks([b(1, 0, 20), b(2, 20, 0, { breakAfter: true }), b(3, 20, 0, { breakAfter: true }), b(4, 20, 10)], ROOM);
  ok(two.pages === 3 && two.placed[3].page === 2, "two breaks: a blank page between");
}
{
  // Taller than a page: it starts where it is, its page runs longer, the next block starts a page after it.
  const r = placeBlocks([b(1, 0, 20), b(2, 30, 250), b(3, 290, 10)], ROOM);
  ok(r.placed.map((x) => `${x.page}:${x.y}`).join() === "0:0,0:30,1:0" && r.extra[0] === 180 && r.extra[1] === 0, `a long block makes its page longer (got ${JSON.stringify(r)})`);
}
{
  // One under another; then 2 to a row.
  const r = placeBlocks([b(1, 0, 90), b(2, 100, 90), b(3, 200, 90)], ROOM);
  const one = pageGeometry(r, { width: 120, height: 140, gap: 10, cols: 1 });
  ok(one.sheets.map((s) => `${s.x},${s.y}`).join(" ") === "0,0 0,150 0,300" && one.height === 440 && one.width === 120, `pages one under another (got ${JSON.stringify(one)})`);
  const grid = pageGeometry(r, { width: 120, height: 140, gap: 10, cols: 2 });
  ok(grid.sheets.map((s) => `${s.x},${s.y}`).join(" ") === "0,0 130,0 0,150" && grid.width === 250 && grid.height === 290, `2 to a row (got ${JSON.stringify(grid)})`);
  const shifts = shiftsOf([b(1, 0, 90), b(2, 100, 90), b(3, 200, 90)], r, grid.sheets);
  ok(shifts.map((s) => `${s.dx},${s.dy}`).join(" ") === "0,0 130,-100 0,-50", `each block's move from its natural place (got ${shifts.map((s) => `${s.dx},${s.dy}`).join(" ")})`);
  ok(sameShifts(shifts, shiftsOf([b(1, 0, 90), b(2, 100, 90), b(3, 200, 90)], r, grid.sheets)) && !sameShifts(shifts, shifts.slice(1)), "the same moves: nothing to redraw");
  ok(pageAt(grid.sheets, 120, 140, 10) === 1 && pageAt(grid.sheets, 120, 125, 10) === null && pageAt(grid.sheets, 120, 10, 200) === 2, "which page a point is on (between pages: none)");
}
{
  // A row is as tall as its tallest page.
  const r = placeBlocks([b(1, 0, 20), b(2, 30, 250), b(3, 290, 10)], ROOM);
  const g = pageGeometry(r, { width: 120, height: 140, gap: 10, cols: 2 });
  ok(g.sheets[0].height === 320 && g.sheets[1].y === 0 && g.height === 320, `a longer page makes its row taller (got ${JSON.stringify(g)})`);
  const s1 = pageGeometry(placeBlocks([b(1, 0, 20), b(2, 30, 10), b(3, 50, 250), b(4, 310, 10), b(5, 330, 90), b(6, 430, 20)], ROOM), { width: 120, height: 140, gap: 10, cols: 2 });
  ok(s1.sheets[2].y === s1.sheets[0].height + 10, `the next row starts under the tallest page (got ${JSON.stringify(s1.sheets)})`);
}
{
  const r = placeBlocks([], ROOM);
  ok(r.pages === 1 && r.placed.length === 0, "an empty script is one page");
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("pages: all passed");
