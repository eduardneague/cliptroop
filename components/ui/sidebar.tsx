import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { TeamSummary } from "@/lib/teams";
import { initialsFor } from "@/lib/avatar";
import { SidebarNav } from "./sidebar-nav";
import { SettingsIcon } from "./icons";
import { WhatsNewButton } from "./whats-new";
import { Brand } from "./clip-logo";

export function Sidebar({
  teams,
  currentTeam,
  userDisplayName,
  userEmail,
  userAvatarUrl,
  userColor,
  username,
}: {
  teams: TeamSummary[];
  currentTeam: TeamSummary | null;
  userDisplayName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  userColor: string;
  username: string | null;
}) {
  return (
    <aside className="hidden md:flex w-[236px] flex-shrink-0 border-r border-line/10 bg-surface flex-col p-3.5 gap-1 h-screen sticky top-0 overflow-y-auto overflow-x-hidden styled-scroll">
      <Link href="/dashboard" aria-label={`${APP_NAME} home`} className="flex items-center px-1.5 pt-0.5 pb-3 rounded-lg">
        <Brand />
      </Link>
      <div className="mb-5">
        <WorkspaceSwitcher teams={teams} currentTeam={currentTeam} />
      </div>

      <SidebarNav />

      <div className="mt-auto">
        <WhatsNewButton variant="sidebar" className="mb-2" />
      </div>
      <div className="pt-3 border-t border-line/10">
        <div className="flex items-center gap-1">
          <Link
            href={username ? `/u/${username}` : "/settings"}
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2 transition-colors flex-1 min-w-0"
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 overflow-hidden"
              style={{ background: userColor }}
            >
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initialsFor(userDisplayName)
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold truncate">
                {userDisplayName}
              </span>
              <span className="block text-[10.5px] text-ink-faint truncate">
                {userEmail}
              </span>
            </span>
          </Link>
          <Link
            href="/settings"
            data-tour="settings"
            aria-label="Settings"
            title="Settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink transition-colors flex-shrink-0"
          >
            <SettingsIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
