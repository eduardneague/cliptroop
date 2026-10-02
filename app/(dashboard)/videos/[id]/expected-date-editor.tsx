"use client";

import { useEffect, useState } from "react";
import { updateExpectedDate } from "./actions";
import { useAction } from "@/lib/hooks/use-action";
import { formatDate } from "@/modules/long-videos/lib/stages";
import { EditIcon, CalendarIcon } from "@/components/ui/icons";
import { DatePicker } from "@/components/ui/date-picker";

/**
 * Click the date → calendar opens → pick a day (saved instantly), or
 * click outside / press Esc to cancel. Dots mark days that already have
 * another long video planned.
 */
export function ExpectedDateEditor({
  projectId,
  teamId,
  date,
  canEdit,
}: {
  projectId: string;
  teamId: string;
  date: string | null;
  canEdit: boolean;
}) {
  const [shown, setShown] = useState(date);
  useEffect(() => setShown(date), [date]);

  const save = useAction(updateExpectedDate, {
    optimistic: (_p, _t, d) => setShown(d || null),
    success: (_p, _t, d) => (d ? `Expected date set to ${formatDate(d)}` : "Expected date cleared"),
    onError: () => setShown(date),
  });

  const face = (
    <>
      <CalendarIcon className="w-3.5 h-3.5 text-ink-soft" />
      <span>{shown ? formatDate(shown) : canEdit ? "Add expected date" : "No expected date"}</span>
      {canEdit && (
        <EditIcon className="w-3 h-3 text-ink-soft sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
      )}
    </>
  );

  const cls = `group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium transition-colors ${
    shown ? "text-ink-soft" : "text-ink-faint"
  }`;

  if (!canEdit) return <span className={cls}>{face}</span>;

  return (
    <DatePicker
      value={shown}
      onChange={(d) => d !== shown && save.run(projectId, teamId, d)}
      onClear={() => save.run(projectId, teamId, "")}
      ariaLabel="Expected date"
      disabled={save.pending}
      triggerClassName={`${cls} cursor-pointer hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber`}
    >
      {face}
    </DatePicker>
  );
}
