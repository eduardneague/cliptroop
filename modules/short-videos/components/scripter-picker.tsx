"use client";

import { Select } from "@/components/ui/select";
import { CloseIcon } from "@/components/ui/icons";
import type { TeamPerson } from "../lib/queries";
import { PersonAvatar } from "./person-chip";
import { type PersonKind, personOptions } from "./person-select";

/**
 * The short's scripters as removable chips, plus "+ Add scripter" (people
 * with the Scripter role, and masters). Used when creating a short, in
 * the Settings window and on the script page.
 */
export function ScripterPicker({
  people,
  value,
  onAdd,
  onRemove,
  disabled,
  size = "md",
  kind = "scripter",
  noun,
  readOnly = false,
  max,
  emptyHint,
}: {
  people: TeamPerson[];
  value: string[];
  onAdd: (memberId: string) => void;
  onRemove: (memberId: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  /** Which role this picks (filters the list); the same picker everywhere. */
  kind?: PersonKind;
  /** "scripter", "editor"… (defaults from the kind). */
  noun?: string;
  /** Show the chips only (no add / remove). */
  readOnly?: boolean;
  /** At most this many (1 = a single person: remove, then add someone else). */
  max?: number;
  /** Shown next to the add button when nobody is picked (e.g. "Any master"). */
  emptyHint?: string;
}) {
  const word = noun ?? (kind === "scheduler" ? "scheduler" : kind === "reviewer" ? "reviewer" : kind);
  const chosen = value.map((id) => people.find((p) => p.memberId === id)).filter(Boolean) as TeamPerson[];
  const options = personOptions(kind, people, null).filter((o) => !value.includes(o.value));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chosen.map((p) => (
        <span
          key={p.memberId}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-line/15 bg-surface-2 pl-1 pr-1 ${size === "sm" ? "h-7" : "h-8"}`}
        >
          <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} />
          <span className={`${size === "sm" ? "text-[12px]" : "text-[13px]"} font-semibold`}>{p.name}</span>
          {!readOnly && <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(p.memberId)}
            aria-label={`Remove ${p.name} as ${word}`}
            className="w-6 h-6 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface disabled:opacity-40"
          >
            <CloseIcon className="w-3 h-3" />
          </button>}
        </span>
      ))}
      {!readOnly && options.length > 0 && (max === undefined || chosen.length < max) && (
        <Select
          variant="pill"
          value={null}
          disabled={disabled}
          onChange={(m) => m && onAdd(m)}
          options={options}
          renderValue={() => <span>+ Add {word}</span>}
          ariaLabel={`Add a ${word}`}
        />
      )}
      {chosen.length === 0 && emptyHint && !readOnly && options.length > 0 && <span className="text-[12px] text-ink-faint">{emptyHint}</span>}
      {chosen.length === 0 && (readOnly || options.length === 0) && (
        <span className="text-[12.5px] text-ink-soft">{readOnly ? "Nobody yet." : `Nobody on the team can be a ${word} yet.`}</span>
      )}
    </div>
  );
}
