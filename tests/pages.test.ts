// Pages view (1.23.0, modules/scripts/lib/pages.ts): every page keeps its
// top and bottom margin; where a page is full, the text goes on at the top
// of the next. Pages here: 100 high, 10 apart, 10 margin (text from 10 to 90,
// then from 120 to 200, from 230 to 310…).
import { pageBottom, pageBreaks, pageTop, sameBreaks, type Line, type Unit } from "../modules/scripts/lib/pages";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const P = { height: 100, gap: 10, padTop: 10, padBottom: 10 };
const u = (top: number, bottom: number, pos: number, o: Partial<Unit> & { lineList?: Line[] } = {}): Unit => ({ top, bottom, pos, marginTop: o.marginTop ?? 0, heading: o.heading, lines: o.lineList ? () => o.lineList! : undefined });
const lines = (from: number, n: number, h: number, pos0: number) => Array.from({ length: n }, (_, i) => ({ top: from + i * h, bottom: from + (i + 1) * h, pos: pos0 + i * 10 }));

ok(pageTop(P, 1) === 120 && pageBottom(P, 1) === 200, "where each page's text starts and ends");

{
  const r = pageBreaks([u(10, 50, 1), u(55, 85, 20)], P);
  ok(r.breaks.length === 0 && r.pages === 1, "everything fits: one page, no breaks");
}
{
  // The second block's first line fits, the second doesn't.
  const r = pageBreaks([u(10, 50, 1), u(60, 100, 20, { marginTop: 5, lineList: [{ top: 60, bottom: 80, pos: 20 }, { top: 80, bottom: 100, pos: 30 }] })], P);
  ok(r.breaks.length === 1 && r.breaks[0].pos === 30 && r.breaks[0].height === 40 && r.pages === 2, `split between its lines (got ${JSON.stringify(r)})`);
}
{
  const r = pageBreaks([u(10, 50, 1), u(60, 100, 20, { marginTop: 5 })], P);
  ok(r.breaks[0]?.pos === 20 && r.breaks[0].height === 65 && r.pages === 2, `no lines to split: the whole block moves, its margin replaced (got ${JSON.stringify(r)})`);
}
{
  // A heading at the bottom with its text not fitting: both go.
  const r = pageBreaks([u(10, 60, 1), u(70, 85, 40, { heading: true, marginTop: 8 }), u(90, 130, 50, { lineList: [{ top: 90, bottom: 105, pos: 50 }, { top: 105, bottom: 130, pos: 60 }] })], P);
  ok(r.breaks.length === 1 && r.breaks[0].pos === 40 && r.breaks[0].height === 58, `the heading goes with its text (got ${JSON.stringify(r)})`);
}
{
  // A long paragraph over three pages, lines 20 high.
  const r = pageBreaks([u(10, 250, 1, { lineList: lines(10, 12, 20, 100) })], P);
  ok(r.breaks.length === 2 && r.breaks[0].pos === 140 && r.breaks[0].height === 30 && r.breaks[1].pos === 180 && r.pages === 3, `a long paragraph splits page after page (got ${JSON.stringify(r)})`);
}
{
  // An image taller than a page: on its own page, running on.
  const r = pageBreaks([u(10, 30, 1), u(40, 270, 5)], P);
  ok(r.breaks.length === 1 && r.breaks[0].pos === 5 && r.pages >= 3, `taller than a page: a page of its own, running on (got ${JSON.stringify(r)})`);
}
{
  // Text after the moved block keeps flowing on the new page.
  const r = pageBreaks([u(10, 80, 1), u(85, 100, 2), u(105, 130, 3)], P);
  ok(r.breaks.length === 1 && r.breaks[0].pos === 2 && r.pages === 2, `what follows a break stays on the new page (got ${JSON.stringify(r)})`);
}
ok(sameBreaks([{ pos: 1, height: 10 }], [{ pos: 1, height: 10.4 }]) && !sameBreaks([{ pos: 1, height: 10 }], [{ pos: 2, height: 10 }]), "the same breaks (under a pixel) aren't drawn again");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("pages: all passed");
