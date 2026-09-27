"use client";

import { Select } from "@/components/ui/select";
import { CloseIcon } from "@/components/ui/icons";
import type { TeamPerson } from "../lib/queries";
import { PersonAvatar } from "./person-chip";
import { personOptions } from "./person-select";

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
}: {
  people: TeamPerson[];
  value: string[];
  onAdd: (memberId: string) => void;
  onRemove: (memberId: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const chosen = value.map((id) => people.find((p) => p.memberId === id)).filter(Boolean) as TeamPerson[];
  const options = personOptions("scripter", people, null).filter((o) => !value.includes(o.value));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chosen.map((p) => (
        <span
          key={p.memberId}
          className={`inline-flex items-center gap-1.5 rounded-full border border-line/15 bg-surface-2 pl-1 pr-1 ${size === "sm" ? "h-7" : "h-8"}`}
        >
          <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} />
          <span className={`${size === "sm" ? "text-[12px]" : "text-[13px]"} font-semibold`}>{p.name}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(p.memberId)}
            aria-label={`Remove ${p.name} as a scripter`}
            className="w-6 h-6 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface disabled:opacity-40"
          >
            <CloseIcon className="w-3 h-3" />
          </button>
        </span>
      ))}
      {options.length > 0 && (
        <Select
          variant="pill"
          value={null}
          disabled={disabled}
          onChange={(m) => m && onAdd(m)}
          options={options}
          renderValue={() => <span>+ Add scripter</span>}
          ariaLabel="Add a scripter"
        />
      )}
      {chosen.length === 0 && options.length === 0 && (
        <span className="text-[12.5px] text-ink-soft">Nobody on the team has the Scripter role yet.</span>
      )}
    </div>
  );
}
