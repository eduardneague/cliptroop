"use client";

import { useEffect, useRef, useState } from "react";
import { cleanName } from "@/lib/names";
import { EditIcon } from "./icons";

export { cleanName };

/**
 * A video's name as its page's heading (1.33.1): click it (or its pencil) to rename it right there. Save or Enter
 * keeps the new name, Cancel or Esc puts the old one back, and clicking away keeps it too. The new name shows at once;
 * `onSave` saves it and says whether that worked (its toast says so), and if it didn't, the old name comes back and
 * you're left editing what you typed.
 */
export function EditableTitle({
  number,
  title,
  canEdit,
  max,
  label,
  onSave,
}: {
  number: number;
  title: string;
  canEdit: boolean;
  /** The most characters the name may have (the server says the same). */
  max: number;
  /** What it is, for screen readers: "Short title", "Video name". */
  label: string;
  onSave: (next: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [shown, setShown] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  // The saved name (after a save here, in Settings, or by someone else).
  useEffect(() => setShown(title), [title]);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const next = cleanName(draft);

  function start() {
    setDraft(shown);
    setEditing(true);
  }
  function cancel() {
    setDraft(shown);
    setEditing(false);
  }
  async function save() {
    if (!next) return;
    setEditing(false);
    if (next === shown) return;
    const before = shown;
    setShown(next);
    if (!(await onSave(next))) {
      setShown(before);
      setDraft(next);
      setEditing(true);
    }
  }

  const number_ = (
    <span className="font-mono text-[15px] sm:text-[17px] font-semibold text-ink-faint align-middle mr-2 tabular-nums">#{number}</span>
  );

  if (editing)
    return (
      <div className="flex-1 min-w-0">
        <h1 className="sr-only">{shown}</h1>
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          // Clicking away keeps it (not when focus moves to Save or Cancel).
          onBlur={(e) => {
            if (!form.current?.contains(e.relatedTarget as Node | null)) void save();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="font-display text-[26px] sm:text-3xl leading-none" aria-hidden>
            {number_}
          </span>
          <input
            ref={input}
            value={draft}
            maxLength={max}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            aria-label={label}
            aria-invalid={!next || undefined}
            className="flex-1 min-w-[min(100%,14rem)] rounded-xl border border-amber/60 bg-surface px-3 h-11 font-display text-[20px] sm:text-[22px] font-semibold outline-none focus:ring-2 focus:ring-amber"
          />
          <span className="flex items-center gap-2">
            {/* Pressing them doesn't take the focus first (Safari would see "clicking away" and save). */}
            <button
              type="submit"
              disabled={!next}
              onMouseDown={(e) => e.preventDefault()}
              className="rounded-xl bg-amber text-white font-bold px-4 h-11 text-[14px] hover:brightness-110 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancel}
              className="rounded-xl border border-line/20 px-4 h-11 text-[14px] font-semibold text-ink-soft hover:text-ink hover:border-line/40"
            >
              Cancel
            </button>
          </span>
          {!next && <p className="basis-full text-[12.5px] text-red">Give it a name.</p>}
        </form>
      </div>
    );

  return (
    <h1 className="flex-1 min-w-0 font-display text-[26px] sm:text-3xl font-semibold leading-tight">
      {number_}
      {canEdit ? (
        <button
          type="button"
          onClick={start}
          title="Rename"
          className="group text-left rounded-lg hover:text-ink-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          {shown}
          <EditIcon className="inline-block ml-2 w-4 h-4 text-ink-faint sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100 transition-opacity align-middle" />
          <span className="sr-only">, rename</span>
        </button>
      ) : (
        shown
      )}
    </h1>
  );
}

/**
 * The name box in a video's Settings (1.33.1): Save (or Enter) renames it. Controlled, so the window can keep a name
 * that's still being typed when it closes.
 */
export function NameField({
  value,
  saved,
  onChange,
  onSave,
  max,
  pending = false,
}: {
  value: string;
  /** The name as it is now. */
  saved: string;
  onChange: (v: string) => void;
  onSave: () => void;
  max: number;
  pending?: boolean;
}) {
  const next = cleanName(value);
  const changed = !!next && next !== saved;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && !pending) onSave();
      }}
      className="flex flex-wrap gap-2"
    >
      <input
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Name"
        aria-invalid={!next || undefined}
        className="flex-1 min-w-[min(100%,14rem)] rounded-xl border border-line/15 bg-surface px-3.5 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber"
      />
      <button type="submit" disabled={!changed || pending} className="rounded-xl bg-amber text-white font-bold px-4 h-10 text-[13.5px] hover:brightness-110 disabled:opacity-50">
        {pending ? "Saving…" : "Save name"}
      </button>
      {!next && <p className="basis-full text-[12.5px] text-red">Give it a name.</p>}
    </form>
  );
}
