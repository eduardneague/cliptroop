"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inviteExistingUser } from "@/app/(dashboard)/team/actions";
import { useAction } from "@/lib/hooks/use-action";
import { ROLES, defaultRoleColor, type RoleId } from "@/lib/permissions/roles";
import { ArrowLeftIcon, CheckIcon } from "@/components/ui/icons";
import { displayName } from "@/lib/avatar";
import type { PersonResult, SearchTeamRef } from "./types";
import { TeamBadge } from "./visuals";

const INVITABLE_ROLES = ROLES.filter((r) => r.id !== "master");

type TeamStatus = "member" | "invited" | "available";

/**
 * "Invite <person> to…" — pick one of the teams you're a Master of, pick
 * their roles, send. Lives inside the search palette so finding someone
 * and inviting them is one flow, not two separate screens.
 */
export function InvitePanel({
  person,
  masterTeams,
  onBack,
  onSent,
  registerKeyHandler,
}: {
  person: PersonResult;
  masterTeams: SearchTeamRef[];
  onBack: () => void;
  onSent: (teamId: string) => void;
  /** Lets the palette forward ↑/↓/Enter here while this view is open. */
  registerKeyHandler: (handler: ((e: React.KeyboardEvent) => boolean) | null) => void;
}) {
  const name = displayName(person.username, person.full_name, person.email_name);

  const teams = useMemo(
    () =>
      masterTeams.map((t) => ({
        ...t,
        status: (person.member_of.includes(t.id)
          ? "member"
          : person.invited_to.includes(t.id)
            ? "invited"
            : "available") as TeamStatus,
      })),
    [masterTeams, person]
  );
  const available = teams.filter((t) => t.status === "available");

  const [teamId, setTeamId] = useState<string | null>(available[0]?.id ?? null);
  const [roles, setRoles] = useState<RoleId[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Take keyboard focus from the search box, so 1–6 / ↑↓ / Enter drive
  // this panel instead of typing into the query.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const send = useAction(inviteExistingUser, {
    success: () => `Invite sent to ${name}`,
    onSuccess: (_r, sentTeamId) => onSent(sentTeamId),
  });

  function toggleRole(id: RoleId) {
    setRoles((cur) => (cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id]));
  }

  function submit() {
    if (!teamId || send.pending) return;
    send.run(teamId, person.id, roles);
  }

  // Keyboard: ↑/↓ choose the team, 1–6 toggle roles, Enter sends.
  useEffect(() => {
    registerKeyHandler((e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (available.length === 0) return true;
        const i = Math.max(0, available.findIndex((t) => t.id === teamId));
        const next = e.key === "ArrowDown" ? (i + 1) % available.length : (i - 1 + available.length) % available.length;
        setTeamId(available[next].id);
        return true;
      }
      if (/^[1-9]$/.test(e.key)) {
        const role = INVITABLE_ROLES[Number(e.key) - 1];
        if (role) {
          toggleRole(role.id);
          return true;
        }
      }
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        submit();
        return true;
      }
      if (e.key === "ArrowLeft") {
        onBack();
        return true;
      }
      return false;
    });
    return () => registerKeyHandler(null);
  });

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="p-3 sm:p-4 outline-none animate-[modalin_.14s_ease]"
    >
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
          aria-label="Back to results"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold truncate">Invite {name}</div>
          <div className="text-[11.5px] text-ink-faint">They&rsquo;ll get a notification to accept or decline.</div>
        </div>
      </div>

      <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint px-1 mb-1.5">Team</div>
      <div className="space-y-1 mb-4" role="radiogroup" aria-label="Team">
        {teams.map((t) => {
          const selected = t.id === teamId;
          const disabled = t.status !== "available";
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => setTeamId(t.id)}
              className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                selected
                  ? "border-amber bg-amber/10"
                  : disabled
                    ? "border-line/10 opacity-55 cursor-not-allowed"
                    : "border-line/10 hover:bg-surface-2"
              }`}
            >
              <TeamBadge team={t} />
              <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{t.name}</span>
              {t.status === "member" && <span className="text-[11px] font-semibold text-ink-faint">Already a member</span>}
              {t.status === "invited" && <span className="text-[11px] font-semibold text-ink-faint">Invite pending</span>}
              {selected && <CheckIcon className="w-4 h-4 text-amber" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between px-1 mb-1.5">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Roles</span>
        <span className="text-[10.5px] text-ink-faint hidden sm:inline">optional · press 1–6</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {INVITABLE_ROLES.map((r, i) => {
          const active = roles.includes(r.id);
          const c = defaultRoleColor(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => toggleRole(r.id)}
              aria-pressed={active}
              className="rounded-md px-3 py-1.5 text-[12px] font-semibold border transition-colors"
              style={
                active
                  ? { background: c, borderColor: c, color: "#fff" }
                  : { borderColor: "rgb(var(--line) / 0.18)", color: "rgb(var(--ink-soft))" }
              }
            >
              <span className="hidden sm:inline opacity-50 mr-1 tabular-nums">{i + 1}</span>
              {r.name}
            </button>
          );
        })}
      </div>

      {available.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint text-center py-2">
          {name} is already in (or invited to) every team you manage.
        </p>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!teamId || send.pending}
          className="w-full rounded-xl bg-amber text-white font-bold py-3 text-[14px] shadow-[0_3px_0_0_rgb(var(--amber)/0.5)] hover:brightness-105 active:translate-y-[2px] active:shadow-none disabled:opacity-50 transition-all"
        >
          {send.pending ? "Sending…" : `Send invite to ${teams.find((t) => t.id === teamId)?.name ?? "team"}`}
        </button>
      )}
    </div>
  );
}
