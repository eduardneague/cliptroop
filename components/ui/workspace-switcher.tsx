"use client";

import { ChevronDownIcon, CheckIcon } from "./icons";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { switchTeam } from "../../app/(dashboard)/actions";
import type { TeamSummary } from "@/lib/teams";
import { AvatarImg } from "@/components/ui/avatar-img";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function TeamAvatar({ team, size }: { team: TeamSummary; size: "sm" | "md" }) {
  const dim = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  const text = size === "sm" ? "text-[9px]" : "text-[11px]";
  // The logo as it is (a see-through one stays see-through); the team's colour and initials without one, or when
  // it can't load (1.31.9: it used to stay an empty square).
  const plain = (
    <span className={`w-full h-full flex items-center justify-center ${text} font-bold text-white`} style={{ background: team.color }}>
      {initials(team.name)}
    </span>
  );
  return (
    <span className={`${dim} rounded-md flex-shrink-0 overflow-hidden flex`}>
      <AvatarImg src={team.logoUrl} fallback={plain} />
    </span>
  );
}

export function WorkspaceSwitcher({
  teams,
  currentTeam,
}: {
  teams: TeamSummary[];
  currentTeam: TeamSummary | null;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!currentTeam) {
    return (
      <Link
        href="/teams/new"
        className="w-full flex items-center gap-2.5 rounded-lg border border-dashed border-line/25 px-2.5 py-2 text-left hover:border-amber transition-colors"
      >
        <span className="w-7 h-7 rounded-md flex items-center justify-center text-[15px] font-bold text-ink-faint flex-shrink-0 border border-dashed border-line/25">
          +
        </span>
        <span className="text-[13px] font-semibold text-ink-soft">
          Create your team
        </span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 rounded-lg border border-line/10 bg-surface-2 px-2.5 py-2 text-left hover:border-line/20 transition-colors"
      >
        <TeamAvatar team={currentTeam} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold truncate">
            {currentTeam.name}
          </span>
        </span>
        <ChevronDownIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 rounded-lg border border-line/10 bg-surface shadow-lg p-1.5 z-40">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setOpen(false);
                startTransition(() => {
                  switchTeam(t.id);
                });
              }}
              className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 transition-colors"
            >
              <TeamAvatar team={t} size="sm" />
              <span className="text-[13px] font-medium flex-1 truncate">
                {t.name}
              </span>
              {t.id === currentTeam.id && (
                <CheckIcon className="w-4 h-4 text-amber" />
              )}
            </button>
          ))}
          <div className="border-t border-line/10 mt-1 pt-1">
            <Link
              href="/teams/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2 transition-colors text-[13px] font-medium text-ink-soft"
            >
              <span className="w-5 h-5 rounded border border-dashed border-ink-faint flex items-center justify-center text-[11px] flex-shrink-0">
                +
              </span>
              Create team
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
