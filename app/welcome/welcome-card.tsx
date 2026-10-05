"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/ui/clip-logo";
import { Mascot } from "@/components/ui/mascot";
import { APP_NAME, MASCOT_NAME } from "@/lib/brand";
import { sounds } from "@/lib/sounds";

export type LinkType = "invite" | "recovery" | "email" | "magiclink" | "signup" | "email_change";

const COPY: Record<LinkType, { eyebrow: string; title: string; text: string; cta: string; next: string }> = {
  invite: {
    eyebrow: "You're invited",
    title: `Welcome to ${APP_NAME}`,
    text: "Your team plans its videos here: scripts, shorts, the calendar, meetings and analytics. Setting up takes about a minute.",
    cta: "Let's set you up",
    next: "/set-password",
  },
  signup: {
    eyebrow: "Almost there",
    title: "Confirm your email",
    text: `Press the button to confirm your email and finish setting up ${APP_NAME}.`,
    cta: "Confirm my email",
    next: "/set-password",
  },
  recovery: {
    eyebrow: "Password reset",
    title: "Choose a new password",
    text: "Press the button to continue. You'll pick your new password on the next screen.",
    cta: "Continue",
    next: "/reset-password",
  },
  email: {
    eyebrow: "Sign in",
    title: `Sign in to ${APP_NAME}`,
    text: "Press the button and you're in.",
    cta: "Sign in",
    next: "/dashboard",
  },
  magiclink: {
    eyebrow: "Sign in",
    title: `Sign in to ${APP_NAME}`,
    text: "Press the button and you're in.",
    cta: "Sign in",
    next: "/dashboard",
  },
  email_change: {
    eyebrow: "New email",
    title: "Confirm your new email",
    text: "Press the button to sign in with your new email from now on.",
    cta: "Confirm",
    next: "/settings?tab=account",
  },
};

const STEPS = ["Choose a password", "Add your name and a photo", "Get notifications on your phone (optional)"];

export function WelcomeCard({ tokenHash, type, expired }: { tokenHash: string | null; type: LinkType | null; expired: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "failed">(expired ? "failed" : "idle");
  const copy = type ? COPY[type] : null;

  async function go() {
    if (!tokenHash || !type) return;
    setState("working");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      sounds.error();
      setState("failed");
      return;
    }
    sounds.advance();
    // The code is used up: take it out of the address and history.
    router.replace(COPY[type].next);
  }

  const card = "w-full max-w-md rounded-3xl border border-line/10 bg-surface p-7 sm:p-9 shadow-sm";

  if (state === "failed" || !tokenHash || !copy) {
    const invite = type === "invite" || type === "signup";
    const reset = type === "recovery";
    const missing = !expired && state !== "failed";
    return (
      <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-paper">
        <div className={card}>
          <Brand className="mb-6" />
          <Mascot size={84} className="mb-3 -ml-2" />
          <h1 className="font-display text-[26px] leading-tight font-semibold mb-2">
            {missing ? "Open the link from your email" : "This link has expired or was already used"}
          </h1>
          <p className="text-[14.5px] text-ink-soft mb-6">
            {missing
              ? `This page is where the links in ${APP_NAME}'s emails lead. Open the email again and press its button.`
              : invite
                ? "Invite links work once. If you already set up your account, just sign in. If not, ask the person who invited you to send a new invite."
                : reset
                  ? "Reset links work once. Ask for a new one from the sign-in page: it only takes a moment."
                  : "Links in these emails work once. Ask for a new one, or sign in."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={reset ? "/login?reset=1" : "/login"} className="inline-flex items-center rounded-xl bg-amber text-white font-semibold text-[14px] px-5 h-11 hover:brightness-110">
              {reset ? "Get a new reset link" : "Go to sign in"}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-paper">
      <div className={card}>
        <Brand className="mb-6" />
        <div className="flex items-end gap-3 mb-4">
          <Mascot size={92} mood={state === "working" ? "celebrate" : "idle"} className="-ml-2 -mb-1 flex-shrink-0" />
          {type === "invite" && (
            <p className="mb-3 rounded-2xl rounded-bl-md bg-amber/12 px-3.5 py-2 text-[13px] font-medium text-ink">
              Hi! I&rsquo;m {MASCOT_NAME}. Let&rsquo;s get you in.
            </p>
          )}
        </div>
        <span className="inline-block rounded-full bg-amber/12 text-amber text-[12px] font-bold px-2.5 py-1">{copy.eyebrow}</span>
        <h1 className="font-display text-[28px] leading-tight font-semibold mt-3 mb-2">{copy.title}</h1>
        <p className="text-[14.5px] text-ink-soft mb-5">{copy.text}</p>
        {type === "invite" && (
          <ol className="space-y-2 mb-6">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-[14px]">
                <span className="w-6 h-6 rounded-full bg-amber/15 text-amber text-[12px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          onClick={go}
          disabled={state === "working"}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-semibold text-[15px] h-12 hover:brightness-110 disabled:opacity-70"
        >
          {state === "working" && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          {state === "working" ? "One moment…" : copy.cta}
        </button>
        <p className="mt-4 text-[12px] text-ink-faint text-center">
          Already set up? <Link href="/login" className="font-semibold text-ink-soft hover:text-ink">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
