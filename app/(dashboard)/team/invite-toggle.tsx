"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/ui/icons";

/** Members header: the count, and "Invite people" which expands the invite panel. */
export function MembersHeader({ count, canInvite, children }: { count: number; canInvite: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">Members</h2>
        <span className="rounded-full bg-surface-2 px-2 h-5 inline-flex items-center text-[11.5px] font-bold text-ink-soft tabular-nums">{count}</span>
        <span className="flex-1" />
        {canInvite && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 h-9 text-[13px] font-bold transition-colors ${open ? "border border-line/20 text-ink-soft hover:text-ink" : "bg-amber text-white hover:brightness-110"}`}
          >
            {!open && <PlusIcon className="w-4 h-4" />}
            {open ? "Close" : "Invite people"}
          </button>
        )}
      </div>
      {open && (
        <div className="mb-4 rounded-2xl border border-amber/40 bg-surface p-4 sm:p-5 space-y-4 animate-[modalin_.15s_var(--ease-out)]">
          <p className="text-[13px] text-ink-soft">Find someone with a VPlanner account and invite them to this team.</p>
          {children}
        </div>
      )}
    </>
  );
}
