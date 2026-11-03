"use client";

import { renameLongVideo } from "./actions";
import { useAction } from "@/lib/hooks/use-action";
import { FORM_LIMITS } from "@/lib/form-limits";
import { EditableTitle } from "@/components/ui/editable-title";

/** The long video's name as the page's heading: click to rename it there (1.33.1, Save and Cancel, a toast once saved). */
export function LongTitle({ projectId, number, title, canEdit }: { projectId: string; number: number; title: string; canEdit: boolean }) {
  const rename = useAction(renameLongVideo, { success: (_id, next) => `Renamed to “${next}”` });
  return <EditableTitle number={number} title={title} canEdit={canEdit} max={FORM_LIMITS.videoTitle} label="Video name" onSave={(next) => rename.run(projectId, next)} />;
}
