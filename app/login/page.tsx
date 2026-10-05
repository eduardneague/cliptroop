"use client";

import { useActionState, useEffect, useState } from "react";
import { login } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/ui/clip-logo";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  // Defaults to "checking" rather than showing the form immediately —
  // a hash fragment (used by invite links) can only ever be read
  // client-side, so the server has no way to know in advance whether
  // this load is actually a real sign-in visit or an invite redirect
  // about to happen. Showing a neutral loading state here (instead of
  // the sign-in form) is what stops the wrong page from flashing for
  // that split second before AuthHashHandler redirects it away.
  const [checkingForInvite, setCheckingForInvite] = useState(true);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    setCheckingForInvite(hash.includes("access_token") || hash.includes("error_code="));
    // "Get a new reset link" (from an expired reset email) opens the reset form.
    if (new URLSearchParams(window.location.search).get("reset") === "1") setMode("forgot");
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetPending(false);
    // Never confirm/deny whether an email has an account (same reasoning as
    // the sign-in error); only say what the person can do about it.
    if (error) {
      const tooSoon = error.status === 429 || /rate limit|security purposes|seconds/i.test(error.message ?? "");
      setResetError(
        tooSoon
          ? "One reset email a minute: wait a moment, then try again."
          : "Couldn't send the reset email. Try again in a minute; if it keeps happening, tell your team's owner (the email settings need a look)."
      );
    } else setResetSent(true);
  }

  if (checkingForInvite) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-sm text-ink-faint">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line/10 bg-surface p-8 shadow-sm">
        <div className="mb-7">
          <Brand />
          <h1 className="font-display text-3xl font-semibold mt-3">
            {mode === "signin" ? "Sign in" : "Reset your password"}
          </h1>
          <p className="text-sm text-ink-soft mt-1.5">
            {mode === "signin"
              ? "Accounts are created by your team\u2019s owner. No public sign-up."
              : "Enter your email and we\u2019ll send you a reset link."}
          </p>
        </div>

        {mode === "signin" ? (
          <>
            <form action={formAction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold opacity-70 mb-1.5">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold opacity-70">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setResetSent(false);
                      setResetError(null);
                    }}
                    className="text-xs font-semibold text-amber"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
                />
              </div>

              {state?.error && (
                <p className="text-sm text-red font-medium">{state.error}</p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-amber text-white font-semibold py-2.5 text-sm disabled:opacity-50"
              >
                {pending ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </>
        ) : resetSent ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft leading-relaxed">
              If an account exists for <span className="font-semibold text-ink">{resetEmail}</span>,
              a reset link is on its way. Check your inbox.
            </p>
            <button
              onClick={() => setMode("signin")}
              className="text-sm font-semibold text-amber"
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold opacity-70 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
              />
            </div>

            {resetError && (
              <p className="text-sm text-red font-medium">{resetError}</p>
            )}

            <button
              type="submit"
              disabled={resetPending}
              className="w-full rounded-lg bg-amber text-white font-semibold py-2.5 text-sm disabled:opacity-50"
            >
              {resetPending ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="w-full text-sm font-semibold text-ink-soft"
            >
              ← Back to sign in
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
