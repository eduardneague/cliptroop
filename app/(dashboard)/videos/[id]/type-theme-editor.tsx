"use client";

import { useState, useTransition } from "react";
import { updateTypeTheme } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { EditIcon } from "@/components/ui/icons";

const VIDEO_TYPES = ["Hub", "Help", "Hero"];

export function TypeThemeEditor({
  projectId,
  teamId,
  videoType,
  theme,
  subtheme,
  canEdit,
  color,
}: {
  projectId: string;
  teamId: string;
  videoType: string[];
  theme: string;
  subtheme: string | null;
  canEdit: boolean;
  color: string;
}) {
  const [editing, setEditing] = useState(false);
  const [typeDraft, setTypeDraft] = useState<string[]>(videoType);
  const [themeDraft, setThemeDraft] = useState(theme);
  const [subthemeDraft, setSubthemeDraft] = useState(subtheme ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggleType(t: string) {
    setTypeDraft((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
    );
  }

  function save() {
    startTransition(async () => {
      const result = await updateTypeTheme(
        projectId,
        teamId,
        typeDraft,
        themeDraft,
        subthemeDraft
      );
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Updated");
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <div
        className="rounded-lg border px-3.5 py-3 space-y-2.5"
        style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
      >
        <div className="flex gap-1.5">
          {VIDEO_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-bold border transition-colors ${
                typeDraft.includes(t)
                  ? "text-white"
                  : "border-line/15 text-ink-soft"
              }`}
              style={typeDraft.includes(t) ? { background: color, borderColor: color } : undefined}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={themeDraft}
            onChange={(e) => setThemeDraft(e.target.value)}
            placeholder="Theme"
            className="flex-1 rounded-lg border border-line/15 bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-amber"
          />
          <input
            value={subthemeDraft}
            onChange={(e) => setSubthemeDraft(e.target.value)}
            placeholder="Subtheme (optional)"
            className="flex-1 rounded-lg border border-line/15 bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-amber"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-amber text-white text-[12px] font-semibold px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setTypeDraft(videoType);
              setThemeDraft(theme);
              setSubthemeDraft(subtheme ?? "");
              setEditing(false);
            }}
            className="rounded-lg border border-line/15 text-ink-soft text-[12px] font-semibold px-3 py-1.5"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Low-key metadata: reads as a quiet line of text; the edit affordance
  // only appears on hover (always visible on touch screens).
  return (
    <button
      onClick={() => canEdit && setEditing(true)}
      disabled={!canEdit}
      className={`group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-ink-soft transition-colors ${
        canEdit ? "cursor-pointer hover:bg-surface-2 hover:text-ink" : "cursor-default"
      }`}
    >
      <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: color }} aria-hidden />
      <span>
        {videoType.join(" + ")} · {theme}
        {subtheme ? ` · ${subtheme}` : ""}
      </span>
      {canEdit && (
        <EditIcon className="w-3 h-3 text-ink-faint sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}
