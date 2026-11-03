"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { useToast } from "@/components/ui/toast-provider";
import { inviteExistingUser } from "@/app/(dashboard)/team/actions";
import { ROLES, defaultRoleColor, type RoleId } from "@/lib/permissions/roles";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";
import { TeamBadge } from "@/components/search/visuals";

export type InviteTeam = { id: string; name: string; color: string; logo_url: string | null; status: "member" | "invited" | "available" };

const INVITABLE_ROLES = ROLES.filter((r) => r.id !== "master");

/**
 * Profile: invite this person to one of your teams (where you're master).
 * 1.27.5: always there for a master (it used to hide when there was no team
 * left to invite them to, so it looked missing); the teams they're already
 * in, or invited to, are listed and say so.
 */
export function InviteToTeam({ userId, name, teams }: { userId: string; name: string; teams: InviteTeam[] }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Sent from here just now (the page catches up on refresh).
  const [sent, setSent] = useState<string[]>([]);
  const list = teams.map((t) => (sent.includes(t.id) && t.status === "available" ? { ...t, status: "invited" as const } : t));
  const available = list.filter((t) => t.status === "available");
  const [team, setTeam] = useState(available[0]?.id ?? "");
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [pending, start] = useTransition();
  const btn = useRef<HTMLButtonElement>(null);
  const picked = available.find((t) => t.id === team) ?? available[0] ?? null;
  if (!teams.length) return null;

  const send = () => {
    if (!picked) return;
    start(async () => {
      const r = await inviteExistingUser(picked.id, userId, roles);
      if (r && "error" in r && r.error) toast.error(r.error);
      else {
        toast.success(`Invited ${name} to ${picked.name}. They'll get a notification to accept or decline.`);
        setSent((s) => [...s, picked.id]);
        setRoles([]);
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="relative" data-invite-menu>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded-lg font-bold px-3.5 h-9 text-[13px] transition-[filter,background-color] ${
          available.length ? "bg-amber text-white hover:brightness-110" : "border border-line/20 text-ink-soft hover:text-ink hover:bg-surface-2"
        }`}
      >
        <PlusIcon className="w-4 h-4" />
        Invite to team
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={320} label="Invite to team">
        <div className="p-3.5">
          <div className="text-[13.5px] font-semibold">Invite {name}</div>
          <p className="text-[11.5px] text-ink-faint mb-3">They&rsquo;ll get a notification to accept or decline.</p>

          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5">Team</div>
          <div className="space-y-1 mb-3.5" role="radiogroup" aria-label="Team">
            {list.map((t) => {
              const on = picked?.id === t.id;
              const off = t.status !== "available";
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={off}
                  onClick={() => setTeam(t.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    on ? "border-amber bg-amber/10" : off ? "border-line/10 opacity-60 cursor-not-allowed" : "border-line/10 hover:bg-surface-2"
                  }`}
                >
                  <TeamBadge team={t} size="w-7 h-7 text-[10px]" />
                  <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">{t.name}</span>
                  {t.status === "member" && <span className="text-[11px] font-semibold text-ink-faint whitespace-nowrap">Already in it</span>}
                  {t.status === "invited" && <span className="text-[11px] font-semibold text-ink-faint whitespace-nowrap">Invite sent</span>}
                  {on && <CheckIcon className="w-4 h-4 text-amber flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {available.length > 0 ? (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5">Roles (optional)</div>
              <div className="flex flex-wrap gap-1 mb-4">
                {INVITABLE_ROLES.map((r) => {
                  const active = roles.includes(r.id);
                  const c = defaultRoleColor(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRoles((cur) => (cur.includes(r.id) ? cur.filter((x) => x !== r.id) : [...cur, r.id]))}
                      className="rounded-lg px-2.5 h-7 text-[12px] font-semibold border transition-colors"
                      style={active ? { background: c, borderColor: c, color: "#fff" } : { borderColor: "rgb(var(--line) / 0.2)", color: "rgb(var(--ink-soft))" }}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
              <button type="button" disabled={pending || !picked} onClick={send} className="w-full rounded-lg bg-amber text-white font-bold h-10 text-[13.5px] hover:brightness-110 disabled:opacity-50">
                {pending ? "Sending…" : `Send invite to ${picked?.name ?? "team"}`}
              </button>
            </>
          ) : (
            <p className="text-[12.5px] text-ink-soft leading-snug">
              {name} is already in (or invited to) every team you manage. New teams you make show up here.
            </p>
          )}
        </div>
      </AnchoredMenu>
    </div>
  );
}
