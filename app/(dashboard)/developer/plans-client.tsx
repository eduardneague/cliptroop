"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { AvatarImg } from "@/components/ui/avatar-img";
import { initialsFor } from "@/lib/avatar";
import { GB, PLAN_FACTS, gbLabel, storageGbFor, storageState, type PlanId } from "@/lib/plans";
import { fmtBytes } from "./format";
import { setTeamPlan } from "./actions";

/* Developer → Plans (1.45.0): every team's plan and storage, set here; the teams asking first. */

export type PlanTeam = {
  id: string;
  name: string;
  color: string;
  logoUrl: string | null;
  createdAt: string;
  owner: string;
  ownerEmail: string | null;
  members: number;
  plan: PlanId | null;
  /** The team's own storage (GB), when it isn't its plan's. */
  storageOverride: number | null;
  storageGb: number | null;
  usedBytes: number | null;
  setAt: string | null;
  requested: PlanId | null;
  requestedAt: string | null;
  note: string | null;
  askedBy: string | null;
  askedByEmail: string | null;
};

type Filter = "asking" | "none" | "all";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const asking = (t: PlanTeam) => !!t.requested && t.requested !== t.plan;

export function PlanTeams({ teams: initial }: { teams: PlanTeam[] }) {
  const [teams, setTeams] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>(initial.some(asking) ? "asking" : "all");
  const counts = { asking: teams.filter(asking).length, none: teams.filter((t) => !t.plan).length, all: teams.length };
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return teams
      .filter((t) => (filter === "asking" ? asking(t) : filter === "none" ? !t.plan : true))
      .filter((t) => !s || [t.name, t.owner, t.ownerEmail, t.askedByEmail, t.id].some((x) => x && x.toLowerCase().includes(s)))
      .sort((a, b) => Number(asking(b)) - Number(asking(a)) || (b.requestedAt ?? "").localeCompare(a.requestedAt ?? ""));
  }, [teams, q, filter]);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-[12rem] max-w-sm">
          <span className="sr-only">Find a team</span>
          <SearchIcon className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a team, an owner or an email"
            className="w-full h-9 rounded-lg border border-line/15 bg-paper pl-9 pr-8 text-[13px] outline-none focus:border-amber/60"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear the search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-ink">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
        <div role="radiogroup" aria-label="Show" className="flex gap-1.5 flex-wrap">
          {(
            [
              ["asking", `Asking (${counts.asking})`],
              ["none", `Without a plan (${counts.none})`],
              ["all", `All (${counts.all})`],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={filter === id}
              onClick={() => setFilter(id)}
              className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold transition-colors ${filter === id ? "border-amber/50 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {shown.length ? (
        <ul className="mt-3 divide-y divide-line/10 rounded-xl border border-line/10 overflow-hidden">
          {shown.map((t) => (
            <TeamRow key={t.id} team={t} onSaved={(next) => setTeams((l) => l.map((x) => (x.id === t.id ? next : x)))} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-ink-soft">{filter === "asking" ? "Nobody is asking for a plan." : teams.length ? "No team like that." : "No teams yet."}</p>
      )}
    </div>
  );
}

function TeamRow({ team: t, onSaved }: { team: PlanTeam; onSaved: (t: PlanTeam) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [plan, setPlan] = useState<PlanId | "">(t.plan ?? (t.requested ?? ""));
  const [gb, setGb] = useState(t.storageOverride ? String(t.storageOverride) : "");
  const [busy, setBusy] = useState(false);
  const chosen = plan || null;
  const gbNum = gb.trim() ? Number(gb) : null;
  const gbBad = gbNum !== null && (!Number.isInteger(gbNum) || gbNum < 1 || gbNum > 100000);
  const changed = chosen !== t.plan || (gbNum ?? null) !== t.storageOverride;
  const allowance = storageGbFor(t.plan, t.storageOverride);
  const state = t.usedBytes === null ? "none" : storageState(t.usedBytes, allowance);
  const pct = allowance && t.usedBytes !== null ? Math.min(100, (t.usedBytes / (allowance * GB)) * 100) : 0;

  async function save() {
    if (gbBad || busy) return;
    const ok = await confirm(
      chosen
        ? {
            title: t.plan ? `Change ${t.name} to ${PLAN_FACTS[chosen].name}?` : `Put ${t.name} on ${PLAN_FACTS[chosen].name}?`,
            description: `${gbLabel(storageGbFor(chosen, gbNum) ?? 0)} of storage. ${t.plan ? "Its masters are told." : "The team opens at once and its masters are told (with an email to whoever asked)."}`,
            confirmLabel: t.plan ? "Change it" : "Open the team",
          }
        : {
            title: `Take ${t.name}'s plan away?`,
            description: "Its pages show the plans again for everyone on it, and it can't add files or connect accounts. Nothing it has is deleted.",
            confirmLabel: "Take it away",
            danger: true,
          },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await setTeamPlan(t.id, chosen, gbNum);
      if (r.error) return void toast.error(r.error);
      onSaved({ ...t, plan: chosen, storageOverride: gbNum, storageGb: storageGbFor(chosen, gbNum), setAt: new Date().toISOString(), requested: null, requestedAt: null, note: null });
      toast.success(chosen ? `${t.name} is on ${PLAN_FACTS[chosen].name}` : `${t.name} has no plan now`);
    } catch {
      toast.error("Couldn't change it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white overflow-hidden flex-shrink-0" style={{ background: t.color }}>
          <AvatarImg src={t.logoUrl} fallback={initialsFor(t.name)} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold truncate">{t.name}</span>
            <span className={`text-[11px] font-bold uppercase tracking-wide ${t.plan ? "text-green" : "text-ink-faint"}`}>{t.plan ? PLAN_FACTS[t.plan].name : "No plan"}</span>
          </div>
          <div className="text-[12px] text-ink-faint truncate">
            {t.owner}
            {t.ownerEmail ? ` · ${t.ownerEmail}` : ""} · {t.members === 1 ? "1 person" : `${t.members} people`} · made {day(t.createdAt)}
          </div>
          {asking(t) && t.requested ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed">
              <b className="text-amber">Asking for {PLAN_FACTS[t.requested].name}</b>
              {t.askedBy ? ` · ${t.askedBy}${t.askedByEmail ? ` (${t.askedByEmail})` : ""}` : ""}
              {t.requestedAt ? ` · ${day(t.requestedAt)}` : ""}
              {t.note ? <span className="block text-ink-soft">&ldquo;{t.note}&rdquo;</span> : null}
            </p>
          ) : null}
          {t.usedBytes !== null ? (
            <div className="mt-2 max-w-xs">
              <div className="flex justify-between text-[11.5px] tabular-nums text-ink-faint">
                <span>{fmtBytes(t.usedBytes)}</span>
                <span>{allowance ? `of ${gbLabel(allowance)}` : "no storage without a plan"}</span>
              </div>
              {allowance ? (
                <div className="mt-1 h-1.5 rounded-[3px] bg-line/10 overflow-hidden">
                  <span className={`block h-full ${state === "over" ? "bg-red" : state === "near" ? "bg-gold" : "bg-green"}`} style={{ width: `${Math.max(t.usedBytes > 0 ? 1.5 : 0, pct)}%` }} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2.5 sm:ml-11 flex items-center gap-2 flex-wrap">
        <label className="sr-only" htmlFor={`plan-${t.id}`}>
          Plan for {t.name}
        </label>
        <select
          id={`plan-${t.id}`}
          value={plan}
          onChange={(e) => setPlan(e.target.value as PlanId | "")}
          className="h-8 rounded-lg border border-line/15 bg-paper px-2 text-[12.5px] outline-none focus:border-amber/60"
        >
          <option value="">No plan</option>
          <option value="studio">Studio</option>
          <option value="network">Network</option>
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          <input
            inputMode="numeric"
            value={gb}
            onChange={(e) => setGb(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
            placeholder={chosen ? String(PLAN_FACTS[chosen].storageGb) : "—"}
            aria-label={`Storage for ${t.name}, in GB (empty: the plan's)`}
            aria-invalid={gbBad || undefined}
            className={`h-8 w-20 rounded-lg border bg-paper px-2 text-[12.5px] tabular-nums outline-none focus:border-amber/60 ${gbBad ? "border-red/60" : "border-line/15"}`}
          />
          GB
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!changed || gbBad || busy}
          className="h-8 px-3 rounded-lg bg-amber text-white text-[12.5px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {busy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden /> : null}
          Save
        </button>
        {t.setAt && t.plan ? <span className="text-[11.5px] text-ink-faint">since {day(t.setAt)}</span> : null}
      </div>
    </li>
  );
}
