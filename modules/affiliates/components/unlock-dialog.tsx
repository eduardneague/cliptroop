"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { LockIcon } from "@/components/ui/icons";
import { unlockLogins } from "@/app/(dashboard)/affiliates/actions";
import { UNLOCK_MINUTES } from "../lib/rules";

/**
 * Logins open only after your password (1.56.0): the same check as signing in (too many wrong ones wait), then 15
 * minutes on this sign-in. So someone at an open laptop, or holding a copied cookie, still can't read them.
 */
export function UnlockDialog({ teamId, onDone, onCancel }: { teamId: string; onDone: (until: number) => void; onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const t = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  async function submit() {
    if (!password || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const r = await unlockLogins(teamId, password);
      if (r.error !== undefined) {
        setProblem(r.error);
        setPassword("");
        requestAnimationFrame(() => field.current?.focus());
        return;
      }
      setPassword("");
      onDone(r.until);
    } catch {
      setProblem("Couldn't check it. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !pending && onCancel()}
      title="Unlock logins"
      description={`Logins open only after your password. They stay unlocked for ${UNLOCK_MINUTES} minutes on this device, and each one you open is written down for the team's masters.`}
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={pending} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={!password || pending} className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-45">
            {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
            {pending ? "Checking…" : "Unlock"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={id} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft mb-1.5">
          <LockIcon className="w-3.5 h-3.5" />
          Your password
        </label>
        <input
          ref={field}
          id={id}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setProblem(null);
          }}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-hint`}
          className={`w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-amber ${problem ? "border-red/60" : "border-line/15"}`}
        />
        <p id={`${id}-hint`} className={`text-[12px] mt-1.5 ${problem ? "text-red" : "text-ink-faint"}`} role={problem ? "alert" : undefined}>
          {problem ?? "The one you sign in here with, not the affiliate platform's."}
        </p>
      </form>
    </Dialog>
  );
}
