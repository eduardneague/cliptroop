"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { UsersIcon } from "@/components/ui/icons";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { setMediaKitAccess } from "@/app/(dashboard)/analytics/media-kit-actions";
import type { KitPerson } from "../lib/access";

/*
 * Who opens the media kit (1.40.0, Masters only), as revenue's "Who can see revenue". The owner: "as the master, i can
 * set people who can see and create the media kit, i dont want it through a role, i want it as a separate thing".
 * Masters always can; a switch for everyone else on the team. The kit has the team's rates, so giving it and taking it
 * away asks first; whoever's let in is told.
 */

export function KitAccess({ teamId, me, ready, people: initial }: { teamId: string; me: string; /** Migration 0117 has run. */ ready: boolean; people: KitPerson[] }) {
  const [people, setPeople] = useState(initial);
  const [open, setOpen] = useState(false);
  const inside = people.filter((p) => !p.master && p.granted);
  const said = inside.length === 0 ? "Masters only" : inside.length === 1 ? `Masters and ${inside[0].name}` : `Masters and ${inside.length} others`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Who can open the media kit: ${said}`}
        className="inline-flex items-center gap-2 rounded-lg border border-line/15 bg-surface pl-3 pr-2 h-9 text-[13px] font-semibold hover:bg-surface-2 min-w-0"
      >
        <UsersIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />
        <span className="truncate">Who can open it</span>
        {inside.length ? (
          <span className="flex items-center -space-x-1.5 pl-0.5" aria-hidden>
            {inside.slice(0, 3).map((p) => (
              <PersonAvatar key={p.userId} name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-5 h-5 text-[8px] ring-2 ring-surface" />
            ))}
            {inside.length > 3 && <span className="w-5 h-5 rounded-full bg-surface-2 ring-2 ring-surface text-[9px] font-bold text-ink-soft flex items-center justify-center">{`+${inside.length - 3}`}</span>}
          </span>
        ) : (
          <span className="text-[12px] font-normal text-ink-faint whitespace-nowrap">Masters only</span>
        )}
      </button>
      {open && <AccessDialog teamId={teamId} me={me} ready={ready} people={people} onChange={(userId, granted) => setPeople((l) => l.map((p) => (p.userId === userId ? { ...p, granted } : p)))} onClose={() => setOpen(false)} />}
    </>
  );
}

function AccessDialog({
  teamId,
  me,
  ready,
  people,
  onChange,
  onClose,
}: {
  teamId: string;
  me: string;
  ready: boolean;
  people: KitPerson[];
  onChange: (userId: string, granted: boolean) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);

  async function flip(p: KitPerson) {
    const on = p.granted;
    const ok = await confirm(
      on
        ? { title: `Stop ${p.name} opening the media kit?`, description: "The Media kit tab locks for them. The kit and its templates stay as they are. You can turn it back on any time.", confirmLabel: "Take it away", danger: true }
        : {
            title: `Let ${p.name} make the media kit?`,
            description: "They'll open Analytics → Media kit: the team's numbers and rates, the setup and its templates. They can change them and download the kit. They get a notification.",
            confirmLabel: "Let them in",
          }
    );
    if (!ok) return;
    setBusy(p.userId);
    try {
      const r = await setMediaKitAccess(teamId, p.userId, !on);
      if (r.error !== undefined) return void toast.error(r.error);
      onChange(p.userId, !on);
      toast.success(on ? `${p.name} no longer opens the media kit` : `${p.name} can make the media kit now`);
    } catch {
      toast.error("Couldn't change it. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Who can open the media kit" description="Masters always can. Turn it on for anyone else who works with sponsors: they make the kit, change the setup and its templates, and download it.">
      {!ready ? (
        <p className="rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5">Run migration 0117 to let others in.</p>
      ) : (
        <ul className="space-y-0.5 max-h-[min(24rem,55dvh)] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll -mx-1 px-1">
          {people.map((p) => (
            <li key={p.userId} className="flex items-center gap-2.5 py-1.5">
              <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-8 h-8 text-[11px]" />
              <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">
                {p.name}
                {p.userId === me && <span className="font-normal text-ink-faint"> (you)</span>}
              </span>
              {p.master ? (
                <span className="text-[12px] text-ink-faint">Master</span>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.granted}
                  aria-label={`${p.name} can make the media kit`}
                  disabled={busy === p.userId}
                  onClick={() => void flip(p)}
                  className={`w-10 h-6 rounded-lg relative transition-colors disabled:opacity-60 flex-shrink-0 ${p.granted ? "bg-amber" : "bg-line/20"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-md bg-white shadow transition-all ${p.granted ? "left-[18px]" : "left-0.5"}`} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
