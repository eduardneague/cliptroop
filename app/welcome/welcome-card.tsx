"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient as createSideClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { signOutHere } from "@/app/(dashboard)/actions";
import { nextForLinkType, readHandoff, SWAP_KEY, swapDecision, type LinkSession } from "@/lib/auth/link-swap";
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

/** A client that keeps nothing (no cookies, nothing remembered): an email's link is checked on it first when someone else is signed in here. */
function sideClient() {
  return createSideClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The question when the link is for another account than the one signed in here (1.31.11). */
type Swap = { from: string; to: string; session: LinkSession; next: string };

export function WelcomeCard({ tokenHash, type, expired, swap: handoff = false }: { tokenHash: string | null; type: LinkType | null; expired: boolean; swap?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "failed" | "stayed">(expired ? "failed" : "idle");
  const [swap, setSwap] = useState<Swap | null>(null);
  const copy = type ? COPY[type] : null;
  const supabase = useRef(createClient()).current;

  // An old-style link (#access_token=…) for another account: AuthHashHandler left it here to ask about.
  useEffect(() => {
    if (!handoff) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(SWAP_KEY);
      sessionStorage.removeItem(SWAP_KEY);
    } catch {}
    const h = readHandoff(raw, Date.now());
    window.history.replaceState(null, "", "/welcome");
    if (!h) return setState("failed");
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        // Nobody signed in by now: it's simply this browser's sign-in.
        void supabase.auth.setSession(h).then(({ error }) => (error ? setState("failed") : router.replace(nextForLinkType(h.type))));
        return;
      }
      setSwap({ from: data.user.email ?? "another account", to: h.email ?? "another account", session: h, next: nextForLinkType(h.type) });
    });
  }, [handoff, router, supabase]);

  async function go() {
    if (!tokenHash || !type) return;
    setState("working");
    const { data: here } = await supabase.auth.getUser();
    if (!here.user) {
      // Nobody signed in on this device: the link signs its account in.
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) {
        sounds.error();
        setState("failed");
        return;
      }
      sounds.advance();
      // The code is used up: take it out of the address and history.
      router.replace(COPY[type].next);
      return;
    }
    // Someone is signed in here: the link is checked on the side first, so it can't swap accounts without asking (1.31.11).
    const { data, error } = await sideClient().auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      sounds.error();
      setState("failed");
      return;
    }
    const session = data.session;
    if (session && swapDecision(here.user, data.user?.id) === "ask") {
      setState("idle");
      setSwap({ from: here.user.email ?? "another account", to: data.user?.email ?? "another account", session, next: COPY[type].next });
      return;
    }
    // Their own account (or a link that doesn't sign anyone in, like a second email-change confirmation).
    if (session) await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    sounds.advance();
    router.replace(COPY[type].next);
  }

  // "Continue as …": this device signs out of the account it was in, then in with the link's.
  async function continueAs(s: Swap) {
    setState("working");
    try {
      await signOutHere();
    } catch {}
    const { error } = await supabase.auth.setSession(s.session);
    if (error) {
      sounds.error();
      setSwap(null);
      setState("failed");
      return;
    }
    sounds.advance();
    router.replace(s.next);
    router.refresh();
  }

  // "Stay as …": the link's sign-in is ended right away (it was made on the side; nothing here changed).
  async function stay(s: Swap) {
    setState("working");
    const side = sideClient();
    try {
      const { error } = await side.auth.setSession(s.session);
      if (!error) await side.auth.signOut({ scope: "local" });
    } catch {}
    setSwap(null);
    setState("stayed");
  }

  const card = "w-full max-w-md rounded-3xl border border-line/10 bg-surface p-7 sm:p-9 shadow-sm";

  if (swap) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-paper">
        <div className={card}>
          <Brand className="mb-6" />
          <Mascot size={84} className="mb-3 -ml-2" />
          <h1 className="font-display text-[26px] leading-tight font-semibold mb-2">This link is for another account</h1>
          <p className="text-[14.5px] text-ink-soft mb-6">
            It&rsquo;s for <b className="text-ink font-semibold break-all">{swap.to}</b>, but this browser is signed in as{" "}
            <b className="text-ink font-semibold break-all">{swap.from}</b>. Which one do you want here?
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void continueAs(swap)}
              disabled={state === "working"}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-semibold text-[15px] min-h-12 px-4 py-2 hover:brightness-110 disabled:opacity-70 break-all"
            >
              {state === "working" ? "One moment…" : `Continue as ${swap.to}`}
            </button>
            <button
              type="button"
              onClick={() => void stay(swap)}
              disabled={state === "working"}
              className="w-full inline-flex items-center justify-center rounded-xl border border-line/20 font-semibold text-[14.5px] min-h-12 px-4 py-2 hover:bg-surface-2 disabled:opacity-60 break-all"
            >
              Stay as {swap.from}
            </button>
          </div>
          <p className="mt-4 text-[12px] text-ink-faint">Continuing signs this browser out of {swap.from} first. Your other devices stay as they are.</p>
        </div>
      </main>
    );
  }

  if (state === "stayed") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-paper">
        <div className={card}>
          <Brand className="mb-6" />
          <Mascot size={84} className="mb-3 -ml-2" />
          <h1 className="font-display text-[26px] leading-tight font-semibold mb-2">Nothing changed here</h1>
          <p className="text-[14.5px] text-ink-soft mb-6">You&rsquo;re still signed in as before. The link is used up: if it&rsquo;s needed for the other account, open it in a browser that isn&rsquo;t signed in, after asking for a new one.</p>
          <Link href="/dashboard" className="inline-flex items-center rounded-xl bg-amber text-white font-semibold text-[14px] px-5 h-11 hover:brightness-110">
            Go to my dashboard
          </Link>
        </div>
      </main>
    );
  }

  // A hand-over being read: a moment of nothing rather than "open the link from your email".
  if (handoff && state !== "failed") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-paper">
        <Mascot size={88} />
        <span className="sr-only">Loading…</span>
      </main>
    );
  }

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
        <span className="inline-block rounded-md bg-amber/12 text-amber text-[12px] font-bold px-2.5 py-1">{copy.eyebrow}</span>
        <h1 className="font-display text-[28px] leading-tight font-semibold mt-3 mb-2">{copy.title}</h1>
        <p className="text-[14.5px] text-ink-soft mb-5">{copy.text}</p>
        {type === "invite" && (
          <ol className="space-y-2 mb-6">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-[14px]">
                <span className="w-6 h-6 rounded-md bg-amber/15 text-amber text-[12px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
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
