"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { login } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/ui/clip-logo";
import { Mascot } from "@/components/ui/mascot";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AlertIcon, ArrowLeftIcon } from "@/components/ui/icons";
import { APP_NAME, MASCOT_NAME } from "@/lib/brand";
import "@/components/landing/landing.css";

/** Small things worth knowing, one at a time on the slate. */
const TIPS = [
  "Press Ctrl K anywhere to find a video, a script or a person.",
  "Mark your part done and the next person is told it's their turn.",
  "Post now skips a short's scheduled time and posts it everywhere.",
  "Pin a review note to the exact second it's about.",
  "Add the app to your phone's home screen to get notifications.",
];

const input =
  "w-full rounded-xl border border-line/15 bg-paper/60 px-3.5 h-11 text-[15px] outline-none transition-colors focus:border-amber/60 focus:ring-2 focus:ring-amber/25";

function Spinner() {
  return <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />;
}

/**
 * Sign in (and "Forgot password?"). Accounts are made by the team owner,
 * so there's no sign-up. Goes back to the page you were sent from (?next=).
 * Desktop: the slate with Clip on the left, the form on the right.
 */
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
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [tip, setTip] = useState(0);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    setCheckingForInvite(hash.includes("access_token") || hash.includes("error_code="));
    const params = new URLSearchParams(window.location.search);
    // "Get a new reset link" (from an expired reset email) opens the reset form.
    if (params.get("reset") === "1") setMode("forgot");
    setNext(params.get("next") ?? "");
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 5200);
    return () => clearInterval(t);
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
      <main className="min-h-dvh flex items-center justify-center p-6 bg-paper">
        <Mascot size={88} />
        <span className="sr-only">Loading…</span>
      </main>
    );
  }

  return (
    <main className="ld min-h-dvh bg-paper text-ink grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* The slate side (desktop). */}
      <section aria-hidden className="hidden lg:flex relative flex-col bg-[rgb(43_33_24)] text-[rgb(246_240_228)] overflow-hidden">
        <div className="h-9 ld-stripes" />
        <div className="flex-1 flex flex-col justify-center px-12 xl:px-16 py-12">
          <div className="ld-slate-label text-[11px] font-bold tracking-[0.16em]">PROD.</div>
          <div className="ld-chalk text-[48px] xl:text-[56px] font-semibold leading-none">{APP_NAME}</div>
          <div className="mt-10 flex items-end gap-6">
            <Mascot size={170} mood="celebrate" />
            <div className="relative mb-8 max-w-[19rem] rounded-2xl rounded-bl-sm bg-[rgb(255_244_230/0.08)] border border-[rgb(255_244_230/0.12)] px-4 py-3">
              <div className="text-[12px] font-bold text-[rgb(var(--amber))] mb-1">{MASCOT_NAME} says</div>
              <p key={tip} className="text-[15px] leading-snug animate-[ld-fade_0.5s_ease-out]">
                {TIPS[tip]}
              </p>
            </div>
          </div>
        </div>
        <div className="px-12 xl:px-16 pb-8 flex items-center justify-between font-mono text-[13px] text-[rgb(246_240_228/0.5)]">
          <span className="flex gap-5">
            <span>SCENE 1</span>
            <span>TAKE 1</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#E5484D] animate-pulse" />
            REC
          </span>
        </div>
      </section>

      {/* The form side. */}
      <section className="relative flex flex-col min-h-dvh">
        <div className="lg:hidden h-2 ld-stripes" aria-hidden />
        <header className="flex items-center justify-between gap-3 px-5 sm:px-8 pt-5">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg px-2 h-9 -ml-2 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface">
            <ArrowLeftIcon className="w-4 h-4" />
            Home
          </Link>
          <ThemeToggle />
        </header>

        <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10">
          <div className="w-full max-w-[380px]">
            <div className="lg:hidden flex justify-center mb-4">
              <Mascot size={96} />
            </div>
            <Brand className="hidden lg:inline-flex" />
            <h1 className="font-display text-[34px] sm:text-[38px] font-semibold leading-tight tracking-[-0.015em] mt-3 text-center lg:text-left">
              {mode === "signin" ? "Welcome back" : "Reset your password"}
            </h1>
            <p className="text-[14.5px] text-ink-soft mt-2 text-center lg:text-left">
              {mode === "signin" ? "Sign in to pick up where your team left off." : "Enter your email and we'll send you a link to choose a new one."}
            </p>

            <div className="mt-8">
              {mode === "signin" ? (
                <form action={formAction} className="space-y-4">
                  <input type="hidden" name="next" value={next} />
                  <div>
                    <label htmlFor="email" className="block text-[13px] font-semibold mb-1.5">
                      Email
                    </label>
                    <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className={input} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="password" className="block text-[13px] font-semibold">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("forgot");
                          setResetSent(false);
                          setResetError(null);
                        }}
                        className="text-[13px] font-semibold text-amber hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input id="password" name="password" type={show ? "text" : "password"} required autoComplete="current-password" className={`${input} pr-16`} />
                      <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        aria-pressed={show}
                        aria-label={show ? "Hide password" : "Show password"}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
                      >
                        {show ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  {state?.error && (
                    <p role="alert" className="flex items-start gap-2 rounded-xl border border-red/30 bg-red/[0.07] px-3 py-2.5 text-[13.5px] text-red font-medium">
                      <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      {state.error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={pending}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-bold h-12 text-[15px] hover:brightness-110 disabled:opacity-60 transition-[filter]"
                  >
                    {pending && <Spinner />}
                    {pending ? "Signing in…" : "Sign in"}
                  </button>
                  <p className="text-[13px] text-ink-faint text-center pt-2">No account? Your team&rsquo;s owner creates it and sends you an invite.</p>
                </form>
              ) : resetSent ? (
                <div className="space-y-5" role="status">
                  <div className="rounded-2xl border border-green/30 bg-green/[0.07] px-4 py-3.5 text-[14.5px] leading-relaxed">
                    If an account exists for <span className="font-semibold">{resetEmail}</span>, a reset link is on its way. Check your inbox.
                  </div>
                  <button onClick={() => setMode("signin")} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-amber hover:underline">
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label htmlFor="reset-email" className="block text-[13px] font-semibold mb-1.5">
                      Email
                    </label>
                    <input id="reset-email" type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} autoComplete="email" inputMode="email" className={input} />
                  </div>

                  {resetError && (
                    <p role="alert" className="flex items-start gap-2 rounded-xl border border-red/30 bg-red/[0.07] px-3 py-2.5 text-[13.5px] text-red font-medium">
                      <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      {resetError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={resetPending}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-bold h-12 text-[15px] hover:brightness-110 disabled:opacity-60"
                  >
                    {resetPending && <Spinner />}
                    {resetPending ? "Sending…" : "Send reset link"}
                  </button>
                  <button type="button" onClick={() => setMode("signin")} className="w-full inline-flex items-center justify-center gap-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink h-10">
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back to sign in
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <footer className="px-5 sm:px-8 pb-6 flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-1 text-[12.5px] text-ink-faint">
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/status" className="hover:text-ink">
            Status
          </Link>
        </footer>
      </section>
    </main>
  );
}
