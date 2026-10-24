"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { NewPasswordFields, newPasswordState } from "@/components/ui/new-password";
import { changePassword } from "./account-actions";

const input =
  "w-full rounded-lg border border-line/15 bg-surface px-3 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber/40 focus:border-amber/60";
const label = "block text-[12.5px] font-semibold mb-1";

/**
 * Settings → Account → Password (1.31.10): change it with the current one
 * (checked on the server with the sign-in limits), the new one by the same
 * rules as everywhere; every other device is signed out once it's saved.
 * Forgot the current one: a reset link to your email, from here.
 */
export function PasswordSection({ email, names }: { email: string; names: string[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [error, setError] = useState<{ text: string; field?: "current" | "next" } | null>(null);
  const [pending, start] = useTransition();
  const [mail, setMail] = useState<"idle" | "sending" | "sent">("idle");
  const about = { email, names };

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setAgain("");
    setError(null);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (!current) return setError({ text: "Type your current password.", field: "current" });
    const state = newPasswordState(next, again, about);
    if (!state.ready) return setError({ text: state.error ?? "Choose another password.", field: "next" });
    start(async () => {
      const r = await changePassword({ current, next });
      if (r.ok) {
        toast.success("Password changed. Every other device was signed out.");
        close();
        return;
      }
      setError({ text: r.error ?? "Couldn't change your password. Try again.", field: r.field });
      if (r.field === "current") setCurrent("");
    });
  }

  async function emailLink() {
    if (mail === "sending") return;
    setMail("sending");
    const { error: sendError } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (sendError) {
      setMail("idle");
      const tooSoon = sendError.status === 429 || /rate limit|security purposes|seconds/i.test(sendError.message ?? "");
      toast.error(tooSoon ? "One reset email a minute: wait a moment, then try again." : "Couldn't send the email. Try again in a minute.");
      return;
    }
    setMail("sent");
  }

  return (
    <section id="password" className="rounded-xl border border-line/10 bg-surface p-6 scroll-mt-24">
      <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">Password</h2>
      <p className="text-[12.5px] text-ink-soft mt-1 max-w-2xl">
        You sign in as <b className="font-semibold text-ink break-all">{email}</b>. A new password signs out every other device signed in to your account; this one stays signed in.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-line/20 px-4 h-10 text-[13.5px] font-semibold hover:border-line/40 hover:bg-surface-2 transition-colors"
        >
          Change password
        </button>
      ) : (
        <form onSubmit={save} className="mt-4 max-w-md space-y-4" noValidate>
          <div>
            <label className={label} htmlFor="current-password">
              Current password
            </label>
            <div className="relative">
              <input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value);
                  if (error?.field === "current") setError(null);
                }}
                autoComplete="current-password"
                autoFocus
                aria-invalid={error?.field === "current" || undefined}
                className={`${input} pr-20`}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                aria-pressed={showCurrent}
                aria-label={showCurrent ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 rounded-lg px-2.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <NewPasswordFields
            value={next}
            confirm={again}
            onValue={(v) => {
              setNext(v);
              if (error?.field !== "current") setError(null);
            }}
            onConfirm={(v) => {
              setAgain(v);
              if (error?.field !== "current") setError(null);
            }}
            about={about}
            inputClass={input}
            labelClass={label}
          />
          {error && (
            <p role="alert" className="text-[13px] text-red font-medium">
              {error.text}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pending} className="rounded-lg bg-amber text-white font-semibold px-4 h-10 text-[13.5px] hover:brightness-110 disabled:opacity-60">
              {pending ? "Changing…" : "Change password"}
            </button>
            <button type="button" onClick={close} disabled={pending} className="rounded-lg px-3 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
              Cancel
            </button>
          </div>
        </form>
      )}

      <p className="mt-4 text-[12.5px] text-ink-soft" role="status">
        {mail === "sent" ? (
          <>
            A reset link is on its way to <b className="font-semibold text-ink break-all">{email}</b>. It works once, for a short while.
          </>
        ) : (
          <>
            Forgot your current password?{" "}
            <button type="button" onClick={() => void emailLink()} disabled={mail === "sending"} className="font-semibold text-amber hover:underline disabled:opacity-60">
              {mail === "sending" ? "Sending…" : "Email me a reset link"}
            </button>
          </>
        )}
      </p>
    </section>
  );
}
