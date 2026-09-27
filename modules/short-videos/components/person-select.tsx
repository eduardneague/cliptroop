"use client";

import { Select, type SelectOption } from "@/components/ui/select";
import type { RoleId } from "@/lib/permissions/roles";
import type { TeamPerson } from "../lib/queries";
import { PersonAvatar } from "./person-chip";

export type PersonKind = "editor" | "reviewer" | "scheduler" | "scripter";

const ROLE_FOR: Record<PersonKind, RoleId[]> = {
  editor: ["editor", "master"], // masters can take on any job
  reviewer: ["master"],
  scheduler: ["publisher", "master"],
  scripter: ["scripter", "master"],
};

const EMPTY: Record<PersonKind, string> = {
  editor: "No editor yet",
  reviewer: "Any master",
  scheduler: "Any scheduler",
  scripter: "No default scripter",
};

/** Build the option list for a role picker (shared with the table's editor cell). */
export function personOptions(kind: PersonKind, people: TeamPerson[], currentId: string | null): SelectOption[] {
  const roles = ROLE_FOR[kind];
  // Role holders first (e.g. Editors), then Masters, so each group shows once.
  const primary = people
    .filter((p) => p.roles.some((r) => roles.includes(r)))
    .sort((a, b) => Number(a.roles.includes("master") && !a.roles.includes(roles[0])) - Number(b.roles.includes("master") && !b.roles.includes(roles[0])));
  const others = kind === "reviewer" ? people.filter((p) => !primary.includes(p)) : [];
  const current = currentId ? people.find((p) => p.memberId === currentId) : undefined;
  const orphan = current && !primary.includes(current) && !others.includes(current) ? current : null;

  const toOption = (p: TeamPerson, group?: string): SelectOption => ({
    value: p.memberId,
    label: p.name,
    hint:
      kind === "scheduler" && p.roles.includes("master") && !p.roles.includes("publisher")
        ? "Master"
        : p.username && p.username !== p.name
          ? `@${p.username}`
          : undefined,
    icon: <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} />,
    group,
  });

  return [
    ...(orphan ? [toOption(orphan, "Currently set")] : []),
    ...primary.map((p) =>
      toOption(
        p,
        kind === "reviewer"
          ? "Masters"
          : kind === "editor"
            ? p.roles.includes("editor") ? "Editors" : "Masters"
            : kind === "scripter"
              ? p.roles.includes("scripter") ? "Scripters" : "Masters"
              : p.roles.includes("publisher") ? "Schedulers" : "Masters"
      )
    ),
    ...others.map((p) => toOption(p, "Teammates")),
  ];
}

/**
 *   editor    → only people with the Editor role
 *   scheduler → Schedulers (and Masters)
 *   reviewer  → Masters first, then anyone on the team
 * Whoever is currently set is always listed, even if their roles changed.
 */
export function PersonSelect({
  kind,
  people,
  value,
  onChange,
  disabled,
}: {
  kind: PersonKind;
  people: TeamPerson[];
  value: string | null;
  onChange: (memberId: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onChange={onChange}
      options={personOptions(kind, people, value)}
      emptyOption={EMPTY[kind]}
      disabled={disabled}
      ariaLabel={kind[0].toUpperCase() + kind.slice(1)}
    />
  );
}
