"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { Ago } from "@/components/ui/ago";
import { CopyIcon, EditIcon, EyeIcon, HistoryIcon, LockIcon, TrashIcon, UsersIcon } from "@/components/ui/icons";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { affiliateLoginActivity, setAffiliateAccess } from "@/app/(dashboard)/affiliates/actions";
import { eventText, type AccessPerson, type LoginEvent } from "../lib/rules";
import { useAffiliates } from "./affiliates-context";

/*
 * Above the list, for the people who manage affiliates (1.56.0): whether logins are unlocked (and for how long), and
 * locking them again. Masters also choose who else manages affiliates and sees their logins (the owner: "the master
 * or … who i choose that can see them from the team"), and see the activity: every look at a login, every change,
 * everyone let in or out.
 */

const PILL = "inline-flex items-center gap-2 rounded-lg border border-line/15 bg-surface px-3 h-9 text-[13px] font-semibold hover:bg-surface-2 min-w-0";

export function LoginsBar({ people, me }: { people: AccessPerson[]; me: string }) {
  const ctx = useAffiliates();
  const [who, setWho] = useState(false);
  const [log, setLog] = useState(false);
  const [list, setList] = useState(people);
  useEffect(() => setList(people), [people]);
  if (!ctx?.manage) return null;
  const left = ctx.unlockedUntil ? Math.max(0, ctx.unlockedUntil - ctx.now) : 0;
  const mins = Math.floor(left / 60_000);
  const secs = Math.floor((left % 60_000) / 1000);
  const inside = list.filter((p) => !p.master && p.granted);
  const said = inside.length === 0 ? "Masters only" : inside.length === 1 ? `Masters and ${inside[0].name}` : `Masters and ${inside.length} others`;

  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      {ctx.vault &&
        (left > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-lg border border-amber/40 bg-amber/10 pl-3 pr-1 h-9 text-[13px] font-semibold text-amber" role="status">
            <EyeIcon className="w-4 h-4" />
            <span className="tabular-nums">
              Logins unlocked · {mins}:{String(secs).padStart(2, "0")}
            </span>
            <button type="button" onClick={() => void ctx.lock()} className="ml-1 rounded-md px-2 h-7 text-[12px] font-bold text-amber hover:bg-amber/15">
              Lock now
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => void ctx.ensureUnlocked()} className={PILL} title="Type your password to show or copy logins for 15 minutes">
            <LockIcon className="w-4 h-4 text-ink-soft" />
            Logins locked
            <span className="text-[12px] font-normal text-ink-faint">Unlock</span>
          </button>
        ))}
      {ctx.master && (
        <>
          <button type="button" onClick={() => setWho(true)} aria-haspopup="dialog" aria-label={`Who manages affiliates: ${said}`} className={PILL}>
            <UsersIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />
            <span className="truncate">Who manages them</span>
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
          <button type="button" onClick={() => setLog(true)} aria-haspopup="dialog" className={PILL}>
            <HistoryIcon className="w-4 h-4 text-ink-soft" />
            Login activity
          </button>
        </>
      )}
      {who && <AccessDialog people={list} me={me} onChange={(userId, granted) => setList((l) => l.map((p) => (p.userId === userId ? { ...p, granted } : p)))} onClose={() => setWho(false)} />}
      {log && <ActivityDialog onClose={() => setLog(false)} />}
    </div>
  );
}

function AccessDialog({ people, me, onChange, onClose }: { people: AccessPerson[]; me: string; onChange: (userId: string, granted: boolean) => void; onClose: () => void }) {
  const ctx = useAffiliates()!;
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);

  async function flip(p: AccessPerson) {
    const on = p.granted;
    const ok = await confirm(
      on
        ? { title: `Take ${p.name}'s access away?`, description: "They'll still see the list (names, links, codes), but can't change it or open a login any more.", confirmLabel: "Take it away", danger: true }
        : {
            title: `Let ${p.name} manage affiliates?`,
            description: "They'll add, change and delete affiliates, and open their logins after typing their own password. Everything they open is written down here. They get a notification.",
            confirmLabel: "Let them in",
          }
    );
    if (!ok) return;
    setBusy(p.userId);
    try {
      const r = await setAffiliateAccess(ctx.teamId, p.userId, !on);
      if (r.error !== undefined) return void toast.error(r.error);
      onChange(p.userId, !on);
      toast.success(on ? `${p.name} no longer manages affiliates` : `${p.name} manages affiliates now`);
    } catch {
      toast.error("Couldn't change it. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Who manages affiliates"
      description="Masters always do. Turn it on for anyone else you trust with the deals: they add and change affiliates and open their logins. Everyone on the team sees the list itself, never the logins."
    >
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
                aria-label={`${p.name} manages affiliates and sees logins`}
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
    </Dialog>
  );
}

const ACTION_ICON: Record<LoginEvent["action"], React.ComponentType<{ className?: string }>> = {
  viewed: EyeIcon,
  copied_username: CopyIcon,
  copied_password: CopyIcon,
  copied_notes: CopyIcon,
  changed: EditIcon,
  cleared: TrashIcon,
  deleted: TrashIcon,
  granted: UsersIcon,
  revoked: UsersIcon,
};

function ActivityDialog({ onClose }: { onClose: () => void }) {
  const ctx = useAffiliates()!;
  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    affiliateLoginActivity(ctx.teamId)
      .then((r) => {
        if (!live) return;
        if (r.error !== undefined) setProblem(r.error);
        else setEvents(r.events);
      })
      .catch(() => live && setProblem("Couldn't read it. Check your connection and try again."));
    return () => {
      live = false;
    };
  }, [ctx.teamId]);

  return (
    <Dialog open onClose={onClose} title="Login activity" description="Every look at a login, every change, and everyone let in or out: the last 150, newest first. Only masters see this.">
      {problem ? (
        <p className="rounded-xl bg-red/10 text-red text-[13px] px-3.5 py-2.5">{problem}</p>
      ) : !events ? (
        <ul className="space-y-2" aria-busy="true" aria-label="Loading the activity">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-9 rounded-lg bg-surface-2 animate-pulse" />
          ))}
        </ul>
      ) : events.length === 0 ? (
        <p className="text-[13px] text-ink-faint py-6 text-center">Nothing yet. Each look at a login, each change, and each person let in shows here.</p>
      ) : (
        <ul className="divide-y divide-line/10 max-h-[min(28rem,60dvh)] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll -mx-1 px-1">
          {events.map((e) => {
            const Icon = ACTION_ICON[e.action];
            return (
              <li key={e.id} className="flex items-center gap-2.5 py-2">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${e.action === "deleted" || e.action === "cleared" || e.action === "revoked" ? "bg-red/10 text-red" : "bg-surface-2 text-ink-soft"}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0 text-[13px] leading-snug">{eventText(e)}</span>
                <Ago iso={e.at} className="text-[11.5px] text-ink-faint whitespace-nowrap" />
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
