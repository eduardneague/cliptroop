"use client";

import { updateShortDetails } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { EditableTitle } from "@/components/ui/editable-title";

/** The short's title as the page's heading: click to rename it there (1.33.1: Save and Cancel, and a toast once saved). */
export function ShortTitle({ id, number, title, canEdit }: { id: string; number: number; title: string; canEdit: boolean }) {
  const rename = useAction(updateShortDetails, { success: (_id, patch) => `Renamed to “${patch.title}”` });
  return <EditableTitle number={number} title={title} canEdit={canEdit} max={200} label="Short title" onSave={(next) => rename.run(id, { title: next })} />;
}
