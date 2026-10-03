"use client";

import { Ago } from "@/components/ui/ago";
import { useEffect, useRef, useState, useTransition } from "react";
import { updateIdeateField } from "./actions";
import { renderLiteMarkdown } from "@/lib/markdown-lite";
import { useToast } from "@/components/ui/toast-provider";
import { EditIcon } from "@/components/ui/icons";

type Field = "hook" | "notes" | "budget_notes";

export function InlineEditable({
  projectId,
  teamId,
  field,
  value,
  canEdit,
  placeholder,
  lastEditedAt,
  lastEditedBy,
  emphasize,
}: {
  projectId: string;
  teamId: string;
  field: Field;
  value: string | null;
  canEdit: boolean;
  placeholder: string;
  lastEditedAt?: string | null;
  lastEditedBy?: string | null;
  emphasize?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(lastEditedAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }

  useEffect(() => {
    if (editing) requestAnimationFrame(autoGrow);
  }, [editing]);

  function insertAround(before: string, after = before) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next =
      draft.slice(0, start) + before + draft.slice(start, end) + after + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = end + before.length;
      autoGrow();
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updateIdeateField(projectId, teamId, field, draft);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      } else {
        setError(null);
        setEditing(false);
        setSavedAt(result?.updatedAt ?? new Date().toISOString());
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex-1 text-[14px] leading-relaxed rounded-lg px-3.5 py-3 ${
              emphasize ? "bg-amber/10 border border-amber/30" : ""
            }`}
          >
            {value ? (
              <span
                dangerouslySetInnerHTML={{ __html: renderLiteMarkdown(value) }}
              />
            ) : (
              <span className="text-ink-soft">
                {canEdit ? placeholder : "Not specified"}
              </span>
            )}
          </div>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="flex-shrink-0 flex items-center gap-1 rounded-md border border-line/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-soft hover:border-amber hover:text-amber transition-colors"
            >
              <EditIcon className="w-3 h-3" />
              Edit
            </button>
          )}
        </div>
        {savedAt && (
          <p className="text-[11px] text-ink-soft mt-1.5">
            Last edited <Ago iso={savedAt} />
            {lastEditedBy ? ` by ${lastEditedBy}` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => insertAround("**")}
          className="w-7 h-7 rounded-md border border-line/15 text-[12px] font-bold hover:bg-surface-2"
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => insertAround("_")}
          className="w-7 h-7 rounded-md border border-line/15 text-[12px] italic hover:bg-surface-2"
          title="Italic"
        >
          i
        </button>
        <button
          type="button"
          onClick={() => insertAround("`")}
          className="w-7 h-7 rounded-md border border-line/15 text-[11px] font-mono hover:bg-surface-2"
          title="Code"
        >
          {"</>"}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          autoGrow();
        }}
        autoFocus
        className="w-full rounded-lg border border-amber/50 bg-surface px-3.5 py-3 text-[14px] leading-relaxed outline-none focus:ring-2 focus:ring-amber resize-none overflow-hidden"
        style={{ minHeight: 120 }}
      />
      {error && <p className="text-[11px] text-red font-medium mt-1">{error}</p>}
      <div className="flex gap-2 mt-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-amber text-white text-[12.5px] font-semibold px-3.5 py-1.5 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => {
            setDraft(value ?? "");
            setEditing(false);
            setError(null);
          }}
          className="rounded-lg border border-line/15 text-ink-soft text-[12.5px] font-semibold px-3.5 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
