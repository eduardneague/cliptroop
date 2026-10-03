import { ROLES, type RoleId } from "@/lib/permissions/roles";

/** A teammate you can @mention, with what they do on this particular video. */
export type MentionPerson = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  roles: RoleId[];
  /** Their jobs on this video ("Editor", "Scripter", …), shown as a hint. */
  onVideo: string[];
};

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.id, r.name]));

/** Teammates + what each one does on this video (keyed by team member id). */
export function mentionPeople(
  people: { userId: string; name: string; avatarUrl: string | null; color: string; memberId: string; roles: RoleId[] }[],
  jobs: Record<string, string[]>
): MentionPerson[] {
  return people.map((p) => ({ userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, color: p.color, roles: p.roles, onVideo: jobs[p.memberId] ?? [] }));
}

/**
 * Who to suggest first depends on what you're writing:
 *   editing idea → this video's editor, other editors, schedulers, master
 *   comment      → this video's scripters, master, the rest of this video's people
 */
export function rankPeople(list: MentionPerson[], kind: "comment" | "edit_idea"): MentionPerson[] {
  const score = (p: MentionPerson) => {
    if (kind === "edit_idea") {
      if (p.onVideo.includes("Editor")) return 0;
      if (p.roles.includes("editor")) return 1;
      if (p.onVideo.includes("Scheduler") || p.roles.includes("publisher")) return 2;
      if (p.roles.includes("master")) return 3;
      return p.onVideo.length ? 4 : 5;
    }
    if (p.onVideo.includes("Scripter")) return 0;
    if (p.roles.includes("master")) return 1;
    if (p.onVideo.length) return 2;
    if (p.roles.includes("scripter")) return 3;
    return 4;
  };
  return [...list].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

/** Role mentions in the same spirit (@Editor, @Scheduler …). */
export function rankRoles(kind: "comment" | "edit_idea"): RoleId[] {
  return kind === "edit_idea" ? ["editor", "publisher", "master", "scripter", "filmer", "packager", "researcher"] : ["scripter", "master", "editor", "publisher", "researcher", "filmer", "packager"];
}
