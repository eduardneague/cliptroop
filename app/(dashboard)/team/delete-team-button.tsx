"use client";

import { useState, useTransition } from "react";
import { deleteTeam } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { Leaves } from "@/components/ui/leaves";

export function DeleteTeamButton({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const expected = `team/${teamName}`;
  const matches = confirmText === expected;

  function handleDelete() {
    if (!matches) return;
    startTransition(async () => {
      const result = await deleteTeam(teamId);
      if (result?.error) {
        toast.error(result.error);
        setOpen(false);
        setConfirmText("");
      }
    });
  }

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red/40 text-red font-semibold px-3.5 py-2 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red/10 transition-colors"
      >
        Delete this team
      </button>

      {open && (
        <Leaves>
          <div
            className="pop-fade fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-5"
            onClick={() => {
              setOpen(false);
              setConfirmText("");
            }}
          >
            <div
              className="pop-modal w-full max-w-sm rounded-2xl bg-surface border border-red/30 p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-lg font-semibold mb-1.5 text-red">
                Delete &ldquo;{teamName}&rdquo;?
              </h2>
              <p className="text-[13px] text-ink-soft leading-relaxed mb-4">
                This is <b>permanent</b>. Every project, comment, thumbnail, and
                member on this team is wiped along with it. There&rsquo;s no
                undo and no recovering it afterward.
              </p>

              <label className="block text-[12px] font-semibold text-ink-soft mb-1.5">
                Type <code className="text-red font-mono">{expected}</code> to confirm
              </label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-red mb-5"
                placeholder={expected}
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setOpen(false);
                    setConfirmText("");
                  }}
                  className="rounded-lg border border-line/15 px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:text-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!matches || pending}
                  className="rounded-lg bg-red px-3.5 py-2 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
                >
                  {pending ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </div>
          </div>
        </Leaves>
      )}
    </div>
  );
}
