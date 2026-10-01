"use client";

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { inviteExistingUser } from "@/app/(dashboard)/team/actions";
import { ROLES, type RoleId } from "@/lib/permissions/roles";
import { PlusIcon } from "@/components/ui/icons";

/** Profile: invite this person to one of your teams (where you're master). */
export function InviteToTeam({ userId, name, teams }: { userId: string; name: string; teams: { id: string; name: string; color: string }[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState(teams[0]?.id ?? "");
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !(e.target as HTMLElement).closest("[data-invite-menu]") && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  if (!teams.length) return null;
  return (
    <div className="relative" data-invite-menu>
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] hover:brightness-110">
        <PlusIcon className="w-4 h-4" />
        Invite to team
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[290px] rounded-2xl border border-line/15 bg-surface shadow-2xl p-3.5 space-y-3 animate-[modalin_.15s_var(--ease-out)]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5">Team</div>
            <div className="space-y-1">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTeam(t.id)}
                  className={`w-full flex items-center gap-2 rounded-lg px-2.5 h-9 text-[13px] ${team === t.id ? "bg-amber/10 font-bold ring-1 ring-amber/40" : "hover:bg-surface-2"}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5">Roles (optional)</div>
            <div className="flex flex-wrap gap-1">
              {ROLES.filter((r) => r.id !== "master").map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={roles.includes(r.id)}
                  onClick={() => setRoles((cur) => (cur.includes(r.id) ? cur.filter((x) => x !== r.id) : [...cur, r.id]))}
                  className={`rounded-full px-2.5 h-7 text-[12px] font-semibold border ${roles.includes(r.id) ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={pending || !team}
            onClick={() =>
              start(async () => {
                const r = await inviteExistingUser(team, userId, roles);
                if (r && "error" in r && r.error) toast.error(r.error);
                else {
                  toast.success(`Invited ${name} to ${teams.find((t) => t.id === team)?.name}`);
                  setOpen(false);
                }
              })
            }
            className="w-full rounded-lg bg-amber text-white font-bold h-10 text-[13.5px] disabled:opacity-50"
          >
            {pending ? "Inviting…" : "Send invite"}
          </button>
        </div>
      )}
    </div>
  );
}
