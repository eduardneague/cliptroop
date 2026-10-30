"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { signUp } from "./actions";
import { Brand } from "@/components/ui/clip-logo";
import { Mascot } from "@/components/ui/mascot";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AlertIcon, ArrowLeftIcon } from "@/components/ui/icons";
import { NewPasswordFields } from "@/components/ui/new-password";
import { Turnstile, TURNSTILE_SITE_KEY } from "@/components/auth/turnstile";
import { APP_NAME } from "@/lib/brand";
import { signUpProblem, type SignUpField } from "@/lib/auth/sign-up-rules";
import "@/components/landing/landing.css";

const input =
  "w-full rounded-xl border border-line/15 bg-paper/60 px-3.5 h-11 text-[15px] outline-none transition-colors focus:border-amber/60 focus:ring-2 focus:ring-amber/25 aria-[invalid=true]:border-red/50";
const label = "block text-[13px] font-semibold mb-1.5";

/** Where each problem is: the box focused when it's said. */
const FIELD_ID: Record<SignUpField, string> = { name: "su-name", email: "su-email", password: "su-password", confirm: "su-password-again", agree: "su-agree", check: "su-check" };

const STEPS = [
  { n: "01", title: "Your account", text: "Your name, your email, a password. We send a link to confirm the address." },
  { n: "02", title: "Your team", text: "Name it after your channel. You're its owner and its first Master." },
  { n: "03", title: "Its plan", text: `Studio or Network. We write back, and the team opens once its plan is on.` },
];

/**
 * Create an account (1.45.0): anyone may, now that ClipTroop is open to the public. The same slate as Sign in, with
 * the three steps to a working team on it. The account is made by app/signup/actions.ts; this checks as you type,
 * says what's wrong next to it (and moves there), and keeps what was typed.
 */
export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, undefined);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetCheck, setResetCheck] = useState(0);
  const [local, setLocal] = useState<{ field: SignUpField; error: string } | null>(null);
  // Typing again after a problem: it's put away until the next try.
  const [stale, setStale] = useState(false);
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setLocal(null);
    setStale(true);
  };

  const problem = local ?? (state?.error && !stale ? { field: state.field ?? null, error: state.error } : null);
  const bad = (f: SignUpField) => problem?.field === f || undefined;

  // A problem: its box gets the focus (a screen reader hears the message too, it's an alert).
  useEffect(() => {
    const f = problem?.field;
    if (f) document.getElementById(FIELD_ID[f])?.focus();
  }, [problem?.field, problem?.error]);

  // A token works once: after every answer from the server, the check runs again.
  useEffect(() => {
    if (state && TURNSTILE_SITE_KEY) setResetCheck((n) => n + 1);
  }, [state]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = signUpProblem({ name, email, password, confirm, agree });
    if (p) return setLocal({ ...p });
    if (TURNSTILE_SITE_KEY && !captcha) return setLocal({ field: "check", error: "Wait a moment for the security check to finish." });
    setLocal(null);
    setStale(false);
    const fd = new FormData(e.currentTarget);
    fd.set("password", password);
    fd.set("confirm", confirm);
    if (captcha) fd.set("captcha", captcha);
    startTransition(() => formAction(fd));
  }

  const sent = state?.sent;

  return (
    <main className="ld min-h-dvh bg-paper text-ink grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* The slate side (desktop): the three steps to a working team. */}
      <section aria-hidden className="hidden lg:flex relative flex-col bg-[rgb(43_33_24)] text-[rgb(246_240_228)] overflow-hidden">
        <div className="h-9 ld-stripes" />
        <div className="flex-1 flex flex-col justify-center px-12 xl:px-16 py-12">
          <div className="ld-slate-label text-[11px] font-bold tracking-[0.16em]">PROD.</div>
          <div className="ld-chalk text-[48px] xl:text-[56px] font-semibold leading-none">{APP_NAME}</div>
          <ol className="mt-12 space-y-7 max-w-[26rem]">
            {STEPS.map((s, i) => (
              <li key={s.n} className="grid grid-cols-[3.25rem_1fr] gap-x-4 animate-[ld-fade_0.6s_ease-out_both]" style={{ animationDelay: `${120 + i * 110}ms` }}>
                <span className="font-mono text-[13px] text-[rgb(var(--amber))] pt-1">{s.n}</span>
                <span>
                  <span className="block ld-chalk text-[22px] font-semibold leading-tight">{s.title}</span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-[rgb(246_240_228/0.66)]">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="px-12 xl:px-16 pb-8 flex items-center justify-between font-mono text-[13px] text-[rgb(246_240_228/0.5)]">
          <span className="flex gap-5">
            <span>SCENE 1</span>
            <span>TAKE 1</span>
          </span>
          <span>NEW TEAM</span>
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
          <div className="w-full max-w-[400px]">
            <Brand className="hidden lg:inline-flex" />
            {sent ? (
              <div role="status">
                <div className="lg:hidden flex justify-center mb-4">
                  <Mascot size={96} mood="celebrate" />
                </div>
                <h1 className="font-display text-[34px] sm:text-[38px] font-semibold leading-tight tracking-[-0.015em] mt-3 text-center lg:text-left">Check your inbox</h1>
                <p className="text-[15px] text-ink-soft mt-3 leading-relaxed text-center lg:text-left">
                  We sent a link to <b className="text-ink break-all">{sent}</b>. Open it to confirm your address; then you&rsquo;ll name your team.
                </p>
                <ul className="mt-6 space-y-2 text-[13.5px] text-ink-soft leading-relaxed">
                  <li>Nothing after a few minutes? Look in spam or promotions.</li>
                  <li>
                    Already have an account with this address?{" "}
                    <Link href="/login" className="font-semibold text-amber hover:underline">
                      Sign in
                    </Link>{" "}
                    or reset your password there.
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    window.location.reload();
                  }}
                  className="mt-7 inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  Use another email
                </button>
              </div>
            ) : (
              <>
                <h1 className="font-display text-[34px] sm:text-[38px] font-semibold leading-tight tracking-[-0.015em] mt-3 text-center lg:text-left">Create your account</h1>
                <p className="text-[14.5px] text-ink-soft mt-2 text-center lg:text-left">Then name your team and choose its plan.</p>

                <form onSubmit={submit} noValidate className="mt-8 space-y-4">
                  {/* Only a script fills this in (it's out of sight and skipped by the keyboard). */}
                  <div aria-hidden className="absolute -left-[9999px] w-px h-px overflow-hidden">
                    <label htmlFor="su-website">Website</label>
                    <input id="su-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                  </div>
                  <div>
                    <label htmlFor="su-name" className={label}>
                      Your name
                    </label>
                    <input
                      id="su-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      maxLength={80}
                      value={name}
                      onChange={(e) => edit(setName)(e.target.value)}
                      aria-invalid={bad("name")}
                      aria-describedby={bad("name") ? "su-problem" : undefined}
                      className={input}
                    />
                  </div>
                  <div>
                    <label htmlFor="su-email" className={label}>
                      Email
                    </label>
                    <input
                      id="su-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      spellCheck={false}
                      autoCapitalize="none"
                      value={email}
                      onChange={(e) => edit(setEmail)(e.target.value)}
                      aria-invalid={bad("email")}
                      aria-describedby={bad("email") ? "su-problem" : undefined}
                      className={input}
                    />
                  </div>
                  <NewPasswordFields
                    id="su-password"
                    label="Password"
                    value={password}
                    confirm={confirm}
                    onValue={edit(setPassword)}
                    onConfirm={edit(setConfirm)}
                    about={{ email, names: [name] }}
                    inputClass={input}
                    labelClass={label}
                  />
                  <label htmlFor="su-agree" className="flex items-start gap-3 rounded-xl px-1 py-1 text-[13.5px] leading-snug cursor-pointer">
                    <input
                      id="su-agree"
                      name="agree"
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => edit(setAgree)(e.target.checked)}
                      aria-invalid={bad("agree")}
                      className="mt-0.5 w-[18px] h-[18px] rounded-[5px] accent-[rgb(var(--amber))] flex-shrink-0"
                    />
                    <span className="text-ink-soft">
                      I&rsquo;m 18 or older and I agree to the{" "}
                      <Link href="/terms" target="_blank" className="font-semibold text-ink hover:text-amber underline underline-offset-2">
                        Terms
                      </Link>{" "}
                      and the{" "}
                      <Link href="/privacy" target="_blank" className="font-semibold text-ink hover:text-amber underline underline-offset-2">
                        Privacy policy
                      </Link>
                      .
                    </span>
                  </label>

                  {TURNSTILE_SITE_KEY ? (
                    <div id="su-check" tabIndex={-1} className="outline-none">
                      <Turnstile action="signup" onToken={setCaptcha} resetKey={resetCheck} />
                    </div>
                  ) : null}

                  {problem && (
                    <p id="su-problem" role="alert" className="flex items-start gap-2 rounded-xl border border-red/30 bg-red/[0.07] px-3 py-2.5 text-[13.5px] text-red font-medium">
                      <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{problem.error}</span>
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={pending}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-bold h-12 text-[15px] hover:brightness-110 disabled:opacity-60 transition-[filter]"
                  >
                    {pending && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                    {pending ? "Creating your account…" : "Create account"}
                  </button>
                  <p className="text-[13px] text-ink-faint text-center pt-2">
                    Have an account?{" "}
                    <Link href="/login" className="font-semibold text-amber hover:underline">
                      Sign in
                    </Link>
                  </p>
                </form>
              </>
            )}
          </div>
        </div>

        <footer className="px-5 sm:px-8 pb-6 flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-1 text-[12.5px] text-ink-faint">
          <Link href="/pricing" className="hover:text-ink">
            Pricing
          </Link>
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
