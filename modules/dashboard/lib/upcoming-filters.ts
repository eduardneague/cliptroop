/**
 * Upcoming shorts' and Upcoming longs' filters on the dashboard (1.35.1, the owner: "i want to be able to filter by
 * editor and filter by only instagram or only 1 platform in particular … same for longs too, but its only youtube
 * basically"). Pure, so the tests run them.
 *
 *   a platform    the shorts that go there (and maybe elsewhere too); with "only", the ones that go there and
 *                 nowhere else
 *   an editor     the shorts or long videos they edit; "none", the ones nobody edits yet
 */
import { PLATFORMS, type Platform } from "@/modules/short-videos/lib/constants";

/** Someone on a widget: their team membership's id (what a filter saves), name, picture and colour. */
export type Person = { id: string; name: string; avatarUrl: string | null; color: string };
export type PlatformPick = "all" | Platform;
/** "all", "none" or a team member's id. */
export type EditorPick = string;

export const isPlatform = (v: unknown): v is Platform => PLATFORMS.includes(v as Platform);

/** Does a short with these platforms pass the platform filter? */
export function goesTo(platforms: readonly string[], pick: PlatformPick, only = false) {
  if (pick === "all") return true;
  const ps = [...new Set(platforms.filter(isPlatform))];
  return only ? ps.length === 1 && ps[0] === pick : ps.includes(pick);
}

/** Does something with these editors pass the editor filter? */
export const editedBy = (editors: readonly { id: string }[], pick: EditorPick) =>
  pick === "all" || (pick === "none" ? editors.length === 0 : editors.some((e) => e.id === pick));

/** Everyone who edits one of these, the busiest first (then by name), and how many have nobody yet. */
export function editorsOf(lists: readonly (readonly Person[])[]) {
  const seen = new Map<string, { person: Person; n: number }>();
  let none = 0;
  for (const es of lists) {
    if (!es.length) none++;
    for (const e of new Map(es.map((x) => [x.id, x])).values()) {
      const x = seen.get(e.id);
      if (x) x.n++;
      else seen.set(e.id, { person: e, n: 1 });
    }
  }
  const people = [...seen.values()].sort((a, b) => b.n - a.n || a.person.name.localeCompare(b.person.name)).map((x) => x.person);
  return { people, none };
}

/** The saved editor, if it still means something here (they edit one of these; "none" while some have nobody); else every editor. */
export function editorPick(saved: unknown, people: readonly Person[], none: number): EditorPick {
  if (saved === "none") return none ? "none" : "all";
  return typeof saved === "string" && people.some((p) => p.id === saved) ? saved : "all";
}

/** The editor filter is worth showing: there's a choice (two people, or someone and nobody), or one is picked. */
export const editorChoice = (people: readonly Person[], none: number, pick: EditorPick) => people.length + (none ? 1 : 0) > 1 || pick !== "all";

/**
 * What an empty list says: "No upcoming shorts for Instagram edited by Mara.", "No upcoming shorts without an editor
 * that go only to TikTok.", "No upcoming long videos edited by Dan."
 */
export function nothingFor(what: string, platform: { name: string; only: boolean } | null, editor: { name: string } | "none" | null) {
  const by = editor === null ? "" : editor === "none" ? " without an editor" : ` edited by ${editor.name}`;
  if (!platform) return `No upcoming ${what}${by}.`;
  return platform.only ? `No upcoming ${what}${by} that go only to ${platform.name}.` : `No upcoming ${what} for ${platform.name}${by}.`;
}
