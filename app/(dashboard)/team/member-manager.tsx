"use client";

import { StarIcon, LockIcon } from "@/components/ui/icons";

import { useState, useTransition } from "react";
import { setMemberRoles, kickMember } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { MemberAvatarLink, MemberNameLink } from "@/components/ui/member-identity";

export type MemberRow = {
  teamMemberId: string;
  userId: string | null;
  username: string | null;
  avatarUrl: string | null;
  name: string;
  email: string;
  status: "invited" | "active";
  roles: RoleId[];
  isOwner: boolean;
  color: string;
};

export function MemberManager({
  teamId,
  member,
  roleColors,
  isSelf,
  viewerIsOwner,
  readOnly = false,
}: {
  teamId: string;
  member: MemberRow;
  roleColors: Record<RoleId, string>;
  isSelf: boolean;
  viewerIsOwner: boolean;
  /** Non-masters see the card without the edit buttons. */
  readOnly?: boolean;
}) {
  const memberIsMaster = member.roles.includes("master");
  // Only the owner can remove a Master from the team.
  const canKick = !member.isOwner && (viewerIsOwner || !memberIsMaster);
  const [open, setOpen] = useState(false);
  const [draftRoles, setDraftRoles] = useState<RoleId[]>(member.roles);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();

  function toggleRole(r: RoleId) {
    setDraftRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function saveRoles() {
    startTransition(async () => {
      const result = await setMemberRoles(teamId, member.teamMemberId, draftRoles);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`${member.name}'s roles updated`);
        setOpen(false);
      }
    });
  }

  async function handleKick() {
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      description: "They'll lose access to this team immediately and be unassigned from any active projects.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await kickMember(teamId, member.teamMemberId);
      if (result?.error) toast.error(result.error);
      else toast.success(`${member.name} removed`);
    });
  }

  const dirty = draftRoles.length !== member.roles.length || draftRoles.some((r) => !member.roles.includes(r));
  return (
    <div className={`px-4 sm:px-5 py-4 transition-colors ${open ? "bg-amber/[0.04]" : "hover:bg-surface-2/40"}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-3 min-w-0 w-full sm:w-72 sm:flex-none">
        <MemberAvatarLink userId={member.userId} username={member.username} name={member.name} avatarUrl={member.avatarUrl} color={member.color} size="w-11 h-11 text-[14px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[15px] font-semibold truncate">
              <MemberNameLink userId={member.userId} username={member.username} name={member.name} />
            </span>
            {member.isOwner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber/12 text-amber px-2 h-5 text-[10.5px] font-bold">
                <StarIcon filled className="w-3 h-3" /> Owner
              </span>
            )}
            {isSelf && <span className="rounded-full bg-surface-2 text-ink-soft px-2 h-5 inline-flex items-center text-[10.5px] font-bold">You</span>}
            {member.status === "invited" && <span className="rounded-full bg-surface-2 text-ink-soft px-2 h-5 inline-flex items-center text-[10.5px] font-bold uppercase">Invited</span>}
          </div>
          <div className="text-[12.5px] text-ink-soft truncate">{member.email}</div>
        </div>
        </div>

      {/* Roles, each in its colour */}
      <div className="flex flex-wrap gap-1.5 order-3 sm:order-none w-full sm:w-auto sm:flex-1">
        {member.roles.length === 0 ? (
          <span className="text-[12px] text-ink-faint">No roles yet</span>
        ) : (
          member.roles.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 h-7 text-[12px] font-semibold"
              style={{ background: `color-mix(in srgb, ${roleColors[r]} 14%, transparent)`, color: roleColors[r] }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: roleColors[r] }} />
              {ROLES.find((x) => x.id === r)?.name ?? r}
            </span>
          ))
        )}
      </div>

      {!isSelf && !readOnly && (
        <div className="flex items-center gap-2 order-4 sm:order-none w-full sm:w-auto justify-end sm:ml-auto">
          <button
            type="button"
            onClick={() => {
              setDraftRoles(member.roles);
              setOpen((o) => !o);
            }}
            aria-expanded={open}
            className="rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold hover:border-line/40 hover:bg-surface-2"
          >
            {open ? "Close" : "Edit roles"}
          </button>
          {canKick && (
            <button
              type="button"
              onClick={() => void handleKick()}
              disabled={pending}
              className="rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-red hover:border-red/40 hover:bg-red/10 disabled:opacity-40"
            >
              Remove
            </button>
          )}
        </div>
      )}

      </div>
      {open && (
        <div className="mt-3 rounded-xl bg-surface-2/50 p-3 animate-[modalin_.15s_var(--ease-out)]">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-2">Roles</div>
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => {
              const active = draftRoles.includes(r.id);
              const ownerLocked = r.id === "master" && member.isOwner;
              const locked = ownerLocked || (r.id === "master" && !viewerIsOwner);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={locked}
                  aria-pressed={active}
                  onClick={() => !locked && toggleRole(r.id)}
                  title={ownerLocked ? "The team owner is always Master" : locked ? "Only the team owner can grant or remove Master" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12.5px] font-semibold border transition-all ${
                    active ? "text-white shadow-sm" : "border-line/20 text-ink-soft hover:text-ink hover:border-line/40"
                  } ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
                  style={active ? { background: roleColors[r.id], borderColor: roleColors[r.id] } : undefined}
                >
                  {!active && <span className="w-1.5 h-1.5 rounded-full" style={{ background: roleColors[r.id] }} />}
                  {r.name}
                  {locked && <LockIcon className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink">
              Cancel
            </button>
            <button
              type="button"
              onClick={saveRoles}
              disabled={pending || !dirty}
              className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px] disabled:opacity-45"
            >
              {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Save roles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
