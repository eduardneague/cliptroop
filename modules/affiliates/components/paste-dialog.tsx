"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { importAffiliates } from "@/app/(dashboard)/affiliates/actions";
import { LIMITS, parsePasted } from "../lib/rules";

/**
 * Affiliates from a spreadsheet (1.56.0): the owner keeps them in one (Name, Product Link, Code, Percentage). Its rows
 * are copied and pasted here, shown as they'll be added (with what's wrong with any), then added at once. Logins and
 * videos are added afterwards, on each one.
 */
export function PasteDialog({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const toast = useToast();
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const parsed = useMemo(() => parsePasted(text), [text]);
  const good = parsed.rows.filter((r) => r.fields);
  const bad = parsed.rows.filter((r) => !r.fields);

  useEffect(() => {
    const t = requestAnimationFrame(() => box.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  async function add() {
    if (!good.length || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const r = await importAffiliates(
        teamId,
        good.map((g) => g.fields)
      );
      if (r.error !== undefined) return void setProblem(r.error);
      toast.success(r.added === 1 ? "1 affiliate added" : `${r.added} affiliates added`);
      onClose();
    } catch {
      setProblem("Couldn't add them. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      width="sm:max-w-2xl"
      title="Paste from a spreadsheet"
      description="Select the rows in your sheet (the heading row too, if it has one), copy them, and paste them here. Columns: name, product link, code, percentage; a platform link and notes if you have them."
      footer={
        <>
          <button type="button" onClick={onClose} disabled={pending} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => void add()} disabled={!good.length || pending} className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-45">
            {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
            {pending ? "Adding…" : good.length ? `Add ${good.length} affiliate${good.length === 1 ? "" : "s"}` : "Add"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label htmlFor={id} className="sr-only">
          Rows from a spreadsheet
        </label>
        <textarea
          ref={box}
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={"Name\tProduct Link\tCode\tPercentage\nGravastar.com\thttps://www.gravastar.com/…\tVIVERRO\t10%"}
          className="w-full rounded-xl border border-line/15 bg-surface px-3.5 py-2.5 text-[12.5px] font-mono outline-none focus:ring-2 focus:ring-amber resize-y min-h-[7rem] placeholder:text-ink-faint/60"
        />
        {parsed.rows.length > 0 && (
          <div className="rounded-xl border border-line/15 overflow-hidden">
            <div className="px-3 py-2 bg-surface-2 text-[11.5px] font-semibold text-ink-soft flex items-center gap-2">
              <span className="flex-1">
                {good.length} to add{bad.length ? `, ${bad.length} with something to fix` : ""}
                {parsed.header ? " · the first row was the headings" : ""}
              </span>
              {parsed.rows.length >= LIMITS.import && <span className="text-coral">At most {LIMITS.import} at once</span>}
            </div>
            <ul className="max-h-64 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll divide-y divide-line/10" aria-label="What will be added">
              {parsed.rows.map((r) => (
                <li key={r.line} className="px-3 py-2 text-[12.5px] grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3 items-center">
                  <span className="font-semibold truncate">{r.name}</span>
                  {r.fields ? (
                    <span className="truncate text-ink-faint">{r.fields.productUrl ?? "No link"}</span>
                  ) : (
                    <span className="truncate text-red" role="note">
                      Line {r.line}: {r.error}
                    </span>
                  )}
                  <span className="font-mono text-[11.5px] text-ink-soft whitespace-nowrap">{r.fields ? [r.fields.code, r.fields.percentage].filter(Boolean).join(" · ") : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {problem && (
          <p role="alert" className="rounded-xl bg-red/10 text-red text-[13px] px-3.5 py-2.5">
            {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
