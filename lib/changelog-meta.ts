/**
 * The changelog's shape and the rules about versions, without the notes
 * themselves (1.32.2). lib/changelog.ts is the whole list, over 100 KB of
 * text: only the server and the What's new window load it. Everything the
 * app's frame needs on every page (is there an update card to show, the
 * labels) is here, and the server works out the rest (whatsNewFacts).
 */
export type ChangeKind = "new" | "better" | "fixed";
export type Change = { kind: ChangeKind; text: string };
export type Release = {
  version: string;
  /** YYYY-MM-DD (left out when unknown). */
  date?: string;
  /** A few words: the headline of this update. */
  title: string;
  changes: Change[];
};
/** What the frame knows about the version you're on: the update card's words. */
export type ReleaseHeadline = Pick<Release, "version" | "title" | "date">;

export const KIND_LABEL: Record<ChangeKind, string> = { new: "New", better: "Better", fixed: "Fixed" };

/** "1.2.3" → [1, 2, 3] (anything odd counts as 0). */
const parts = (v: string) => v.split(".").map((n) => Number.parseInt(n, 10) || 0);

/** -1 / 0 / 1, like a sort comparator. */
export function compareVersions(a: string, b: string) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}

/** "1.32.2" → "1.32": the feature release a version belongs to. */
export const seriesOf = (v: string) => parts(v).slice(0, 2).join(".");

/**
 * A feature release or milestone happened between `from` and `to` (not just
 * fixes): a new minor/major version, or any release in between that brings
 * something new (e.g. 1.7.5). `newVersions`: the versions that brought
 * something new. Only the ones in `to`'s own series ever matter (a newer
 * series is a feature release by itself), so that's all the frame is sent.
 */
export function isFeatureUpdateIn(from: string | null, to: string, newVersions: readonly string[]) {
  if (!from) return true;
  const [a1, a2] = parts(from);
  const [b1, b2] = parts(to);
  if (b1 > a1 || (b1 === a1 && b2 > a2)) return true;
  return newVersions.some((v) => compareVersions(v, from) > 0 && compareVersions(v, to) <= 0);
}
