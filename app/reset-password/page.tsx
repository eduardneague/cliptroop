"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/ui/clip-logo";
import { Mascot } from "@/components/ui/mascot";
import { ArrowRightIcon } from "@/components/ui/icons";
import { NewPasswordFields, newPasswordState } from "@/components/ui/new-password";
import { fromEmailLink, passwordSaveError } from "@/lib/auth/password-rules";
import { sounds } from "@/lib/sounds";
import { forgetOtherDevicesNow } from "@/app/(dashboard)/settings/account-actions";

/*
 * Choosing a new password from a reset email (1.31.10). It says whose
 * password it is (the link signed that account in on this device), uses
 * the same rules as everywhere else (lib/auth/password-rules.ts), and once
 * it's saved every other device signed in to the account is signed out
 * (Supabase does that with any password change), which it says.
 *
 * Only a sign-in that came from an email link may choose a password here
 * without the current one. Someone already signed in with their password
 * (who opened this page some other way) changes it in Settings, where the
 * current one is asked for.
 */

const input =
  "w-full rounded-xl border border-line/15 bg-transparent px-3.5 h-11 text-[15px] outline-none focus:ring-2 focus:ring-amber focus:border-transparent";
const label = "block text-[12.5px] font-semibold text-ink-soft mb-1.5";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-semibold text-[15px] h-12 px-6 hover:brightness-110 disabled:opacity-60";

type Who = { id: string; email: string; names: string[]; link: boolean };

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  // undefined: still checking; null: nobody signed in (the link expired or was used).
  const [who, setWho] = useState<Who | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!alive) return;
      if (!user) return setWho(null);
      const [{ data: aal }, { data: profile }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.from("profiles").select("full_name, username").eq("id", user.id).maybeSingle(),
      ]);
      if (!alive) return;
      setWho({
        id: user.id,
        email: user.email ?? "",
        names: [profile?.full_name as string | null, profile?.username as string | null].filter((n): n is string => !!n),
        link: fromEmailLink(aal?.currentAuthenticationMethods),
      });
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!who) return;
    setError(null);
    const state = newPasswordState(password, confirm, { email: who.email, names: who.names });
    if (!state.ready) return setError(state.error);
    setPending(true);
    const { error: saveError } = await supabase.auth.updateUser({ password });
    setPending(false);
    const problem = passwordSaveError(saveError);
    if (problem) {
      sounds.error();
      return setError(problem);
    }
    sounds.advance();
    setDone(true);
    // The devices Supabase just signed out stop getting this account's notifications (best effort).
    void forgetOtherDevicesNow().catch(() => null);
  }

  if (who === undefined) {
    return (
      <Shell>
        <div className="flex justify-center py-10" role="status">
          <Mascot size={88} />
          <span className="sr-only">Loading…</span>
        </div>
      </Shell>
    );
  }

  if (who === null) {
    return (
      <Shell>
        <Mascot size={84} className="mb-3 -ml-2" />
        <h1 className="font-display text-[26px] leading-tight font-semibold mb-2">This reset link has expired</h1>
        <p className="text-[14.5px] text-ink-soft mb-6">Reset links work once and for a short while. Ask for a new one: it only takes a moment.</p>
        <Link href="/login?reset=1" className={primary}>
          Get a new reset link
        </Link>
      </Shell>
    );
  }

  if (!who.link) {
    return (
      <Shell>
        <Mascot size={84} className="mb-3 -ml-2" />
        <h1 className="font-display text-[26px] leading-tight font-semibold mb-2">Change it in Settings</h1>
        <p className="text-[14.5px] text-ink-soft mb-6">
          You&rsquo;re signed in as <b className="text-ink font-semibold break-all">{who.email}</b>. To change your password, go to Settings → Account and type your current one first. Forgot it? There&rsquo;s a button there that emails you a reset link.
        </p>
        <Link href="/settings?tab=account#password" className={primary}>
          Open Settings
          <ArrowRightIcon className="w-4 h-4" />
        </Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center motion-step">
          <Mascot mood="celebrate" size={120} className="mx-auto mb-2" />
          <h1 className="font-display text-[26px] leading-tight font-semibold mb-2">Your password is changed</h1>
          <p className="text-[14.5px] text-ink-soft mb-6">
            From now on you sign in as <b className="text-ink font-semibold break-all">{who.email}</b> with the new one. Every other device that was signed in to your account was signed out; this one stays signed in.
          </p>
          <button
            type="button"
            onClick={() => {
              router.push("/dashboard");
              router.refresh();
            }}
            className={`${primary} w-full sm:w-auto`}
          >
            Go to my dashboard
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={save} className="motion-step">
        <h1 className="font-display text-[26px] leading-tight font-semibold mb-1.5">Choose a new password</h1>
        <p className="text-[14px] text-ink-soft mb-6">
          For <b className="text-ink font-semibold break-all">{who.email}</b>. Every other device signed in to this account will be signed out.
        </p>
        <NewPasswordFields
          value={password}
          confirm={confirm}
          // What it said goes once they change it.
          onValue={(v) => {
            setPassword(v);
            setError(null);
          }}
          onConfirm={(v) => {
            setConfirm(v);
            setError(null);
          }}
          about={{ email: who.email, names: who.names }}
          inputClass={input}
          labelClass={label}
          autoFocus
        />
        {error && (
          <p role="alert" className="mt-4 text-[13.5px] text-red font-medium">
            {error}
          </p>
        )}
        <div className="mt-7 flex justify-end">
          <button type="submit" disabled={pending} className={`${primary} w-full sm:w-auto`}>
            {pending && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
            {pending ? "Saving…" : "Save my new password"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-start sm:items-center justify-center p-4 sm:p-6 bg-paper">
      <div className="w-full max-w-md rounded-3xl border border-line/10 bg-surface p-6 sm:p-9 shadow-sm my-4">
        <Brand className="mb-6" />
        {children}
      </div>
    </main>
  );
}
