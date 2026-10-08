"use client";

import Link from "next/link";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { BottomNavItems } from "./sidebar-nav";
import type { TeamSummary } from "@/lib/teams";
import { initialsFor } from "@/lib/avatar";

export function MobileTopBar({
  teams,
  currentTeam,
  userDisplayName,
  userAvatarUrl,
  userColor,
}: {
  teams: TeamSummary[];
  currentTeam: TeamSummary | null;
  userDisplayName: string;
  userAvatarUrl: string | null;
  userColor: string;
}) {
  return (
    <div className="md:hidden border-b border-line/10 px-4 py-2.5 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <WorkspaceSwitcher teams={teams} currentTeam={currentTeam} />
      </div>
      <Link
        href="/settings"
        data-tour="settings"
        aria-label="Settings"
        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 overflow-hidden"
        style={{ background: userColor }}
      >
        {userAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initialsFor(userDisplayName)
        )}
      </Link>
    </div>
  );
}

export function MobileBottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur border-t border-line/10 flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <BottomNavItems />
    </nav>
  );
}
