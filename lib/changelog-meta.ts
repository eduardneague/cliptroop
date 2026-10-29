/**
 * The changelog's shape and the rules about versions, without the notes
 * themselves (1.32.2). lib/changelog.ts is the whole list, over 100 KB of
 * text: only the server and the What's new window load it. Everything the
 * app's frame needs on every page (is there an update card to show, the
 * labels) is here, and the server works out the rest (whatsNewFacts).
 */
export type ChangeKind = "new" | "better" | "fixed";
/**
 * A feature only some teams get, turned on team by team in Developer → Features (1.42.0: Business). Notes about it are
 * only for the people who have it: not in anyone else's What's new, and not on the site's changelog.
 */
export type Gated = "business";
export type Change = {
  kind: ChangeKind;
  text: string;
  /** Only for the people who have this feature. */
  only?: Gated;
};
export type Release = {
  version: string;
  /** YYYY-MM-DD (left out when unknown). */
  date?: string;
  /** A few words: the headline of this update. */
  title: string;
  changes: Change[];
  /** The whole update is about a feature only some teams have: nobody else sees it. */
  only?: Gated;
};
/** What someone has, of the features only some teams get (left out: they don't). */
export type Audience = Partial<Record<Gated, boolean>>;

/**
 * The notes as someone sees them: an update or a line about a feature they don't have is left out, and an update with
 * nothing left goes too. `{}` is everyone's view (the site's changelog).
 */
export function forAudience(list: readonly Release[], audience: Audience): Release[] {
  const out: Release[] = [];
  for (const r of list) {
    if (r.only && !audience[r.only]) continue;
    const changes = r.changes.filter((c) => !c.only || !!audience[c.only]);
    if (changes.length) out.push(changes.length === r.changes.length ? r : { ...r, changes });
  }
  return out;
}
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
