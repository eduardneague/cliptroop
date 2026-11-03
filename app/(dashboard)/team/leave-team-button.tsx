"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { leaveTeam } from "./actions";

/** Leave a team (1.28.0), after a confirmation. `then`: where to go afterwards (default: stay and refresh). */
export function LeaveTeamButton({ teamId, teamName, then, className }: { teamId: string; teamName: string; then?: string; className?: string }) {
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  async function leave() {
    const ok = await confirm({
      title: `Leave ${teamName}?`,
      description: "You lose access to its videos, scripts and notes right away. What you made stays with the team. A master can invite you back.",
      confirmLabel: "Leave team",
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      const r = await leaveTeam(teamId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`You left ${teamName}`);
      if (then) router.push(then);
      else router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={() => void leave()}
      disabled={pending}
      className={className ?? "rounded-lg border border-red/40 text-red font-semibold px-3.5 py-2 text-[13px] hover:bg-red/10 transition-colors disabled:opacity-50"}
    >
      {pending ? "Leaving…" : "Leave team"}
    </button>
  );
}
