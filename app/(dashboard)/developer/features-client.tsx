"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { AvatarImg } from "@/components/ui/avatar-img";
import { initialsFor } from "@/lib/avatar";
import { setTeamFeature } from "./actions";

/* Developer → Features (1.42.0): every team, a switch for Business, asked before it changes. */

export type FeatureTeam = { id: string; name: string; color: string; logoUrl: string | null; owner: string; ownerEmail: string | null; members: number; business: string | null };

export function FeatureTeams({ teams: initial }: { teams: FeatureTeam[] }) {
  const [teams, setTeams] = useState(initial);
  const [q, setQ] = useState("");
  const [onlyOn, setOnlyOn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return teams.filter((t) => (!onlyOn || t.business) && (!s || [t.name, t.owner, t.ownerEmail, t.id].some((x) => x && x.toLowerCase().includes(s))));
  }, [teams, q, onlyOn]);
  const onCount = teams.filter((t) => t.business).length;

  async function flip(t: FeatureTeam) {
    const turnOn = !t.business;
    const ok = await confirm(
      turnOn
        ? {
            title: `Turn on Business for ${t.name}?`,
            description: `${t.owner} (the owner) sees Business in the menu at once and gets a notification. They choose who else on the team sees it.`,
            confirmLabel: "Turn it on",
          }
        : {
            title: `Turn off Business for ${t.name}?`,
            description: "The menu item goes for everyone on the team. Their registers stay as they are; nobody sees them until it's on again.",
            confirmLabel: "Turn it off",
            danger: true,
          }
    );
    if (!ok) return;
    setBusy(t.id);
    try {
      const r = await setTeamFeature(t.id, "business", turnOn);
      if (r.error) return void toast.error(r.error);
      setTeams((l) => l.map((x) => (x.id === t.id ? { ...x, business: turnOn ? new Date().toISOString() : null } : x)));
      toast.success(turnOn ? `Business is on for ${t.name}` : `Business is off for ${t.name}`);
    } catch {
      toast.error("Couldn't change it. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

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
        <button
          type="button"
          role="switch"
          aria-checked={onlyOn}
          onClick={() => setOnlyOn((v) => !v)}
          className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold transition-colors ${onlyOn ? "border-amber/50 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink"}`}
        >
          Only those with Business ({onCount})
        </button>
      </div>
      {shown.length ? (
        <ul className="mt-3 divide-y divide-line/10 rounded-xl border border-line/10 overflow-hidden">
          {shown.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white overflow-hidden flex-shrink-0" style={{ background: t.color }}>
                <AvatarImg src={t.logoUrl} fallback={initialsFor(t.name)} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold truncate">{t.name}</span>
                <span className="block text-[12px] text-ink-faint truncate">
                  {t.owner}
                  {t.ownerEmail ? ` · ${t.ownerEmail}` : ""} · {t.members === 1 ? "1 person" : `${t.members} people`}
                </span>
              </span>
              <span className="hidden sm:inline text-[12px] text-ink-faint whitespace-nowrap">{t.business ? "Business on" : ""}</span>
              <button
                type="button"
                role="switch"
                aria-checked={!!t.business}
                aria-label={`Business for ${t.name}`}
                disabled={busy === t.id}
                onClick={() => void flip(t)}
                className={`w-10 h-6 rounded-lg relative transition-colors disabled:opacity-60 flex-shrink-0 ${t.business ? "bg-amber" : "bg-line/20"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-md bg-white shadow transition-all ${t.business ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-ink-soft">{teams.length ? "No team like that." : "No teams yet."}</p>
      )}
    </div>
  );
}
