/**
 * Which of the kit's pages a change redraws (1.41.0): while a page is being drawn again, the preview says so on that
 * page (media-kit-tab.tsx, kit-page-busy.tsx). The owner: "if i change something in the media kit that will change a
 * PAGE within the media kit presentation and the change takes a while, i want an animation to show that that PAGE
 * from the media kit preview IS BEING MODIFIED".
 *
 * Pages are named by their anchors ("cover", "platform:youtube"; layout.ts), "platform:*" for every platform's. "all":
 * every page changes (the look, the channels and kits, which pages are in it, the kit's name at every page's foot, or a
 * page coming or going, which numbers the others again). Pure: the tab and tests/media-kit.test.ts share it.
 */
import { KIT_PLATFORMS, type MediaKitSettings } from "./settings";

export type Touched = "all" | ReadonlySet<string>;

/** The pages drawn from the numbers (another period, other numbers): all but the rates and the brands. */
export const NUMBER_PAGES: ReadonlySet<string> = new Set(["cover", "about", "glance", "platform:*", "audience:*", "videos", "contact"]);

const NOTHING: ReadonlySet<string> = new Set();
const same = (x: unknown, y: unknown) => x === y || JSON.stringify(x) === JSON.stringify(y);

/**
 * The brands pages' shape (layout.ts brandsPages, 1.44.0): none, the wall (always one page), or the quotes, whose
 * number decides how many pages they take.
 */
const brandsShape = (s: Pick<MediaKitSettings, "brands" | "brandsShow">) => {
  if (s.brandsShow === "logos") return s.brands.some((b) => b.logo || b.name) ? "wall" : "";
  const n = s.brands.filter((b) => b.quote.trim()).length;
  return n ? `quotes:${n}` : "";
};

/** Each part of the setup, and the pages it's drawn on (the ones that touch every page are in `pagesTouched`). */
const KNOWN = new Set<keyof MediaKitSettings>([
  "v", "fromTemplate", "platforms", "split", "extra", "sections", "theme", "accent", "title",
  "period", "from", "to", "cover", "coverPath", "coverPicks", "coverGrid", "tagline", "about", "audienceNote",
  "videos", "videoPicks", "rates", "brands", "brandsShow", "contact", "manual", "titles", "builtWith",
]);

export function pagesTouched(a: MediaKitSettings, b: MediaKitSettings): Touched {
  if (a === b) return NOTHING;
  if (!same(a.platforms, b.platforms) || a.split !== b.split || !same(a.extra, b.extra) || !same(a.sections, b.sections) || a.theme !== b.theme || a.accent !== b.accent || a.title !== b.title) return "all";
  // A page in or out: the others are numbered again.
  if (!!a.about.trim() !== !!b.about.trim() || brandsShape(a) !== brandsShape(b)) return "all";
  // Something this list doesn't know yet (a later version's part): every page, to be safe.
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof MediaKitSettings>) if (!KNOWN.has(k) && !same(a[k], b[k])) return "all";

  const out = new Set<string>();
  const add = (...xs: string[]) => xs.forEach((x) => out.add(x));
  if (a.period !== b.period || a.from !== b.from || a.to !== b.to) add(...NUMBER_PAGES);
  // The cover's picture and videos show on About us too.
  if (a.cover !== b.cover || a.coverPath !== b.coverPath || !same(a.coverPicks, b.coverPicks)) add("cover", "about");
  if (a.coverGrid !== b.coverGrid || a.tagline !== b.tagline) add("cover");
  if (a.about !== b.about) add("about");
  if (a.audienceNote !== b.audienceNote) add("audience:*");
  if (a.videos !== b.videos) add("videos");
  if (!same(a.videoPicks, b.videoPicks)) add("videos");
  if (!same(a.rates, b.rates)) add("rates");
  if (!same(a.brands, b.brands) || a.brandsShow !== b.brandsShow) add("partners");
  if (!same(a.contact, b.contact) || a.builtWith !== b.builtWith) add("contact");
  // 1.44.0: a page's own title: that page (the cover's, the cover).
  for (const k of new Set([...Object.keys(a.titles), ...Object.keys(b.titles)]) as Set<keyof MediaKitSettings["titles"]>) if (!same(a.titles[k], b.titles[k])) add(k);
  // Numbers typed in: their page, and the totals on the cover, At a glance and the last page.
  if (!same(a.manual.glance, b.manual.glance)) add("glance", "cover", "contact");
  for (const p of KIT_PLATFORMS) {
    if (!same(a.manual.platforms[p], b.manual.platforms[p])) add(`platform:${p}`, "glance", "cover", "contact");
    if (!same(a.manual.audience[p], b.manual.audience[p])) add(`audience:${p}`);
  }
  return out;
}

/** Is this page among them? */
export function touches(t: Touched | null | undefined, anchor: string | undefined): boolean {
  if (!t) return false;
  if (t === "all") return true;
  if (!anchor) return false;
  return t.has(anchor) || (anchor.includes(":") && t.has(`${anchor.slice(0, anchor.indexOf(":"))}:*`));
}
