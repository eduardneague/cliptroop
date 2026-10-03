"use client";

import { useEffect, useState } from "react";
import { setShortScripter } from "@/app/(dashboard)/shorts/actions";
import { useAction } from "@/lib/hooks/use-action";
import { Dialog } from "@/components/ui/dialog";
import type { TeamPerson } from "../lib/queries";
import { PersonAvatar } from "./person-chip";
import { ScripterPicker } from "./scripter-picker";

/**
 * Script page top bar: the short's scripters as a small avatar stack.
 * Masters and schedulers can open it to add or remove scripters.
 */
export function ScriptersButton({
  shortId,
  number,
  people,
  scripterIds,
  canManage,
  action = setShortScripter,
}: {
  /** The short's (or long video's) id. */
  shortId: string;
  number: number;
  /** How to save a change: shorts by default; long videos pass their own. */
  action?: (id: string, memberId: string, add: boolean) => Promise<{ error?: string } | object>;
  people: TeamPerson[];
  scripterIds: string[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState(scripterIds);
  useEffect(() => setIds(scripterIds), [scripterIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(action as typeof setShortScripter, {
    success: (_id, _m, add) => (add ? "Scripter added. They've been notified." : "Scripter removed."),
    onError: () => setIds(scripterIds),
  });
  function change(memberId: string, add: boolean) {
    setIds((cur) => (add ? [...cur.filter((x) => x !== memberId), memberId] : cur.filter((x) => x !== memberId)));
    save.run(shortId, memberId, add);
  }

  const shown = ids.map((id) => people.find((p) => p.memberId === id)).filter(Boolean) as TeamPerson[];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={shown.length ? `Scripters: ${shown.map((p) => p.name).join(", ")}` : "No scripters yet"}
        className="inline-flex items-center gap-2 rounded-lg border border-line/15 pl-2 pr-2.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 flex-shrink-0"
      >
        <span className="flex -space-x-1.5">
          {shown.slice(0, 3).map((p) => (
            <span key={p.memberId} className="rounded-full ring-2 ring-paper">
              <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} />
            </span>
          ))}
        </span>
        {/* Always a label (an empty button is just a sliver on phones). */}
        <span className={shown.length ? "hidden sm:inline" : ""}>
          {shown.length === 0 ? (canManage ? "+ Add scripters" : "No scripters") : shown.length > 3 ? `+${shown.length - 3}` : "Scripters"}
        </span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Scripters for #${number}`}
        description="Only these people (and masters) can edit this script."
      >
        {canManage ? (
          <ScripterPicker people={people} value={ids} onAdd={(m) => change(m, true)} onRemove={(m) => change(m, false)} />
        ) : shown.length ? (
          <div className="flex flex-wrap gap-2">
            {shown.map((p) => (
              <span key={p.memberId} className="inline-flex items-center gap-1.5 rounded-full border border-line/15 bg-surface-2 pl-1 pr-3 h-8">
                <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} />
                <span className="text-[13px] font-semibold">{p.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-soft">No scripters yet. A master or scheduler can add them.</p>
        )}
      </Dialog>
    </>
  );
}
