"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { AlertIcon } from "@/components/ui/icons";
import { switchTeam } from "@/app/(dashboard)/actions";
import { LeaveTeamButton } from "@/app/(dashboard)/team/leave-team-button";
import { deleteAccount } from "./account-actions";

export type AccountTeam = { id: string; name: string; color: string; logo_url: string | null; owner: boolean };

/**
 * Settings → Account → Delete account (1.28.0). Locked until you're on no
 * team (leave each one here; teams you own: transfer or delete them on their
 * Team page first). Then two steps: what goes, ticked as understood; and your
 * email and password, checked again on the server.
 */
export function DeleteAccount({ email, teams }: { email: string; teams: AccountTeam[] }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState<string | null>(null);
  const emailOk = typed.trim().toLowerCase() === email.toLowerCase();
  const locked = teams.length > 0;

  function close() {
    setStep(0);
    setUnderstood(false);
    setTyped("");
    setPassword("");
  }

  function confirmDelete() {
    if (!emailOk || !password || pending) return;
    start(async () => {
      const r = await deleteAccount({ email: typed, password });
      // Deleted: the server sends you to the sign-in page.
      if (r?.error) {
        toast.error(r.error);
        if (r.blocked) {
          close();
          router.refresh();
        }
        setPassword("");
      }
    });
  }

  async function openTeam(id: string) {
    setOpening(id);
    await switchTeam(id);
    router.push("/team?tab=team");
  }

  return (
    <section id="delete-account" className="rounded-xl border border-red/25 bg-red/5 p-6 scroll-mt-24">
      <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-red">Delete account</h2>
      <p className="text-[12.5px] text-ink-soft mt-1 max-w-2xl leading-relaxed">
        Your profile, picture, wallpapers, to-dos, achievements and settings are deleted for good. What you made on teams (scripts, comments, notes) stays with them, without your name. Bug reports you
        sent stay with the developer. This can&rsquo;t be undone.
      </p>

      {locked && (
        <div className="mt-4 rounded-xl border border-line/15 bg-surface p-4">
          <p className="text-[13px] font-semibold">First, leave your teams</p>
          <p className="text-[12px] text-ink-faint mb-3">You can delete your account once you&rsquo;re on no team. Teams you own: transfer them to someone or delete them on their Team page.</p>
          <ul className="divide-y divide-line/10">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 flex-wrap">
                <span className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" style={{ background: t.color }}>
                  {t.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.logo_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    t.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold truncate">{t.name}</span>
                  <span className="block text-[11.5px] text-ink-faint">{t.owner ? "You own it: transfer it or delete it first" : "You're a member"}</span>
                </span>
                {t.owner ? (
                  <button
                    type="button"
                    onClick={() => void openTeam(t.id)}
                    disabled={!!opening}
                    className="rounded-lg border border-line/20 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 disabled:opacity-50"
                  >
                    {opening === t.id ? "Opening…" : "Open its Team page"}
                  </button>
                ) : (
                  <LeaveTeamButton teamId={t.id} teamName={t.name} className="rounded-lg border border-red/40 text-red font-semibold px-3 h-8 text-[12.5px] hover:bg-red/10 transition-colors disabled:opacity-50" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setStep(1)}
        disabled={locked}
        className="mt-4 rounded-lg bg-red text-white font-semibold px-4 h-10 text-[13.5px] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Delete my account…
      </button>

      <Dialog
        open={step === 1}
        onClose={close}
        title="Delete your account?"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-lg border border-line/15 px-3.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink">
              Keep my account
            </button>
            <button type="button" onClick={() => setStep(2)} disabled={!understood} className="rounded-lg bg-red text-white px-3.5 h-9 text-[13px] font-semibold hover:brightness-110 disabled:opacity-40">
              Continue
            </button>
          </div>
        }
      >
        <div className="flex gap-3 rounded-xl bg-red/10 border border-red/20 p-3.5 mb-4">
          <AlertIcon className="w-5 h-5 text-red flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink leading-relaxed">This is permanent. Nobody can bring the account back, not even the developer.</p>
        </div>
        <ul className="space-y-1.5 text-[13px] text-ink-soft list-disc pl-5">
          <li>Deleted for good: your profile and its page, picture, wallpapers, to-dos, tasks, achievements, notifications, devices and settings.</li>
          <li>Kept by the teams, without your name: scripts, comments, notes and videos you worked on.</li>
          <li>Kept by the developer: bug reports and ideas you sent.</li>
        </ul>
        <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[rgb(var(--red))]" />
          <span className="text-[13px] font-semibold">I understand this can&rsquo;t be undone</span>
        </label>
      </Dialog>

      <Dialog
        open={step === 2}
        onClose={close}
        title="Confirm it's you"
        description="Type your email and password to delete the account."
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={pending} className="rounded-lg border border-line/15 px-3.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink">
              Cancel
            </button>
            <button type="button" onClick={confirmDelete} disabled={!emailOk || !password || pending} className="rounded-lg bg-red text-white px-3.5 h-9 text-[13px] font-semibold hover:brightness-110 disabled:opacity-40">
              {pending ? "Deleting…" : "Delete my account for good"}
            </button>
          </div>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirmDelete();
          }}
          className="space-y-3"
        >
          <label className="block">
            <span className="block text-[12.5px] font-semibold mb-1">
              Your email: <span className="font-normal text-ink-faint">{email}</span>
            </span>
            <input
              type="email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={email}
              className="w-full rounded-lg border border-line/15 bg-surface px-3 h-10 text-[14px] focus:outline-none focus:border-red/60"
            />
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold mb-1">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-line/15 bg-surface px-3 h-10 text-[14px] focus:outline-none focus:border-red/60"
            />
          </label>
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Dialog>
    </section>
  );
}
