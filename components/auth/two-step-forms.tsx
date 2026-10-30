"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/brand";
import { AlertIcon, CheckIcon, CopyIcon } from "@/components/ui/icons";
import { LogoutButton } from "@/components/ui/logout-button";
import { appFromNowOn, sendTwoStepCode, verifyTwoStepCode } from "@/app/two-step/actions";

/*
 * Two-step sign-in's two screens (1.46.0): typing this sign-in's code (TwoStepVerify) and setting a way up
 * (TwoStepSetup: the first time, which everyone does after making an account, or Settings → Account → Change).
 * An authenticator app goes through Supabase from the browser (enroll, the QR code, challenge and verify: the session
 * becomes aal2); email codes go through app/two-step/actions.ts. Leaving goes by a full load, so the next page sees the
 * new sign-in at once.
 */

const input =
  "w-full rounded-xl border border-line/15 bg-paper/60 px-4 h-14 text-center font-mono text-[26px] tracking-[0.4em] outline-none transition-colors focus:border-amber/60 focus:ring-2 focus:ring-amber/25";
const btnMain =
  "site-btn w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-bold h-12 text-[15px] hover:brightness-110 disabled:opacity-60 transition-[filter,transform]";
const spin = <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />;

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-red/30 bg-red/[0.07] px-3 py-2.5 text-[13.5px] text-red font-medium">
      <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{text}</span>
    </p>
  );
}

/** Six digits: numbers only, pasted codes with spaces work, submits itself once complete. */
function CodeInput({ value, onChange, onComplete, id, label }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; id: string; label: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold mb-1.5">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(v);
          if (v.length === 6) onComplete(v);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={12}
        autoFocus
        className={input}
        aria-describedby={`${id}-hint`}
      />
    </div>
  );
}

function Foot({ lost }: { lost?: boolean }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-faint">
      {lost ? (
        <span>
          Lost your phone?{" "}
          <Link href="/contact" className="font-semibold text-ink-soft hover:text-ink">
            Write to us
          </Link>
        </span>
      ) : (
        <span />
      )}
      <LogoutButton className="font-semibold text-ink-soft hover:text-ink">Sign out</LogoutButton>
    </div>
  );
}

export function TwoStepVerify({ method, factorId, email, next }: { method: "app" | "email"; factorId: string | null; email: string; next: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const asked = useRef(false);

  // Email: a code goes out as the page opens (or says when another can).
  useEffect(() => {
    if (method !== "email" || asked.current) return;
    asked.current = true;
    void sendTwoStepCode("sign_in").then((r) => {
      if (r.error) setError(r.error);
      if (r.to) setSentTo(r.to);
      if (r.wait) setWait(r.wait);
    });
  }, [method]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(v = code) {
    if (busy || v.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      if (method === "app") {
        const { error: e } = await createClient().auth.mfa.challengeAndVerify({ factorId: factorId ?? "", code: v });
        if (e) {
          setError(/invalid|expired|code/i.test(e.message) ? "That's not the code. Type the one your app shows now." : "Couldn't check the code. Try again.");
          setCode("");
          return;
        }
      } else {
        const r = await verifyTwoStepCode(v, "sign_in");
        if (r.error) {
          setError(r.error);
          setCode("");
          return;
        }
      }
      window.location.assign(next);
    } catch {
      setError("Couldn't check the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    const r = await sendTwoStepCode("sign_in");
    if (r.error) setError(r.error);
    if (r.to) setSentTo(r.to);
    if (r.wait) setWait(r.wait);
  }

  return (
    <div>
      <h1 className="font-display text-[30px] sm:text-[34px] font-semibold leading-tight tracking-[-0.015em]">One more step</h1>
      <p className="mt-2 text-[15px] text-ink-soft leading-relaxed">
        {method === "app" ? (
          <>Open your authenticator app and type the six-digit code it shows for {APP_NAME}.</>
        ) : (
          <>We sent a six-digit code to {sentTo ?? email}. It works for 10 minutes.</>
        )}
      </p>
      <form
        className="mt-7 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <CodeInput id="two-step-code" label="Code" value={code} onChange={setCode} onComplete={(v) => void submit(v)} />
        <span id="two-step-code-hint" className="sr-only">
          Six digits
        </span>
        <Problem text={error} />
        <button type="submit" disabled={busy || code.length !== 6} className={btnMain}>
          {busy && spin}
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
      {method === "email" && (
        <p className="mt-4 text-[13.5px] text-ink-soft">
          Nothing yet? Look in spam, or{" "}
          <button type="button" onClick={() => void resend()} disabled={wait > 0} className="font-semibold text-amber hover:underline disabled:text-ink-faint disabled:no-underline">
            {wait > 0 ? `send another in ${wait} s` : "send another code"}
          </button>
          .
        </p>
      )}
      <Foot lost={method === "app"} />
    </div>
  );
}

type Enrolled = { id: string; qr: string; secret: string };

export function TwoStepSetup({ email, current, change, next }: { email: string; current: "app" | "email" | null; change: boolean; next: string }) {
  const [way, setWay] = useState<"app" | "email" | null>(null);
  const [enrolled, setEnrolled] = useState<Enrolled | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function startApp() {
    setWay("app");
    setError(null);
    setBusy(true);
    try {
      const mfa = createClient().auth.mfa;
      // Abandoned tries leave unfinished factors: they go first.
      const { data: list } = await mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status !== "verified") await mfa.unenroll({ factorId: f.id });
      const { data, error: e } = await mfa.enroll({ factorType: "totp", friendlyName: `${APP_NAME} ${new Date().toISOString().slice(0, 16)}`, issuer: APP_NAME });
      if (e || !data) {
        setError(/disabled|not enabled/i.test(e?.message ?? "") ? "Authenticator apps are turned off for this copy of ClipTroop. Use email codes." : "Couldn't start. Try again.");
        return;
      }
      setEnrolled({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch {
      setError("Couldn't start. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function startEmail() {
    setWay("email");
    setError(null);
    const r = await sendTwoStepCode("setup");
    if (r.error) setError(r.error);
    if (r.to) setSentTo(r.to);
    if (r.wait) setWait(r.wait);
  }

  async function confirm(v = code) {
    if (busy || v.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      if (way === "app" && enrolled) {
        const mfa = createClient().auth.mfa;
        const { error: e } = await mfa.challengeAndVerify({ factorId: enrolled.id, code: v });
        if (e) {
          setError("That's not the code. Type the one your app shows now.");
          setCode("");
          return;
        }
        // A new phone replaces the old one; email codes stop.
        const { data: list } = await mfa.listFactors();
        for (const f of list?.totp ?? []) if (f.id !== enrolled.id) await mfa.unenroll({ factorId: f.id });
        const r = await appFromNowOn();
        if (r.error) {
          setError(r.error);
          return;
        }
      } else if (way === "email") {
        const r = await verifyTwoStepCode(v, "setup");
        if (r.error) {
          setError(r.error);
          setCode("");
          return;
        }
      }
      setDone(true);
    } catch {
      setError("Couldn't check the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status">
        <span className="inline-flex w-12 h-12 rounded-2xl bg-green/12 text-green items-center justify-center">
          <CheckIcon className="w-6 h-6" />
        </span>
        <h1 className="mt-5 font-display text-[30px] sm:text-[34px] font-semibold leading-tight">Two-step sign-in is on</h1>
        <p className="mt-2 text-[15px] text-ink-soft leading-relaxed">
          {way === "app" ? "From now on, signing in asks for the code from your app." : `From now on, signing in sends a code to ${sentTo ?? email}.`} You can change it in
          Settings → Account.
        </p>
        <button type="button" onClick={() => window.location.assign(next)} className={`${btnMain} mt-7`}>
          Continue to {APP_NAME}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-[30px] sm:text-[34px] font-semibold leading-tight tracking-[-0.015em]">{change ? "Change two-step sign-in" : "Protect your account"}</h1>
      <p className="mt-2 text-[15px] text-ink-soft leading-relaxed">
        {change
          ? `You use ${current === "email" ? "email codes" : "an authenticator app"} now. Pick the way you want instead (or set up your app on a new phone).`
          : `Every ${APP_NAME} account signs in in two steps: your password, then a code only you can get. Choose how you'll get it.`}
      </p>

      {!way && (
        <div className="mt-7 grid gap-3">
          <button type="button" onClick={() => void startApp()} className="site-card text-left rounded-2xl border border-line/15 bg-surface px-5 py-4 hover:border-amber/60">
            <span className="flex items-center justify-between gap-3">
              <span className="font-display text-[19px] font-semibold">An authenticator app</span>
              <span className="text-[12px] font-semibold text-green">Safest</span>
            </span>
            <span className="mt-1 block text-[13.5px] text-ink-soft leading-relaxed">Google Authenticator, Microsoft Authenticator, 1Password or any other. A new code every 30 seconds, on your phone.</span>
          </button>
          <button type="button" onClick={() => void startEmail()} className="site-card text-left rounded-2xl border border-line/15 bg-surface px-5 py-4 hover:border-amber/60">
            <span className="font-display text-[19px] font-semibold">Codes by email</span>
            <span className="mt-1 block text-[13.5px] text-ink-soft leading-relaxed">A code to {email} each time you sign in.</span>
          </button>
        </div>
      )}

      {way === "app" && (
        <div className="mt-7">
          {enrolled ? (
            <ol className="space-y-5 text-[14px]">
              <li>
                <span className="font-semibold">1. Scan this with your app</span>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a QR code Supabase gives as a data URL */}
                  <img src={enrolled.qr} alt="QR code for your authenticator app" width={168} height={168} className="rounded-xl bg-white p-2 border border-line/15" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-ink-faint">Or type this key</div>
                    <div className="mt-1 font-mono text-[14px] break-all">{enrolled.secret.replace(/(.{4})/g, "$1 ").trim()}</div>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(enrolled.secret).then(() => setCopied(true));
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber hover:underline"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                      {copied ? "Copied" : "Copy the key"}
                    </button>
                  </div>
                </div>
              </li>
              <li>
                <span className="font-semibold">2. Type the code it shows</span>
                <form
                  className="mt-3 space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void confirm();
                  }}
                >
                  <CodeInput id="two-step-setup-code" label="Code" value={code} onChange={setCode} onComplete={(v) => void confirm(v)} />
                  <Problem text={error} />
                  <button type="submit" disabled={busy || code.length !== 6} className={btnMain}>
                    {busy && spin}
                    {busy ? "Checking…" : "Turn it on"}
                  </button>
                </form>
              </li>
            </ol>
          ) : (
            <div className="space-y-4">
              <Problem text={error} />
              {busy && <p className="text-[14px] text-ink-soft">Getting your code ready…</p>}
            </div>
          )}
        </div>
      )}

      {way === "email" && (
        <form
          className="mt-7 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <p className="text-[14px] text-ink-soft">{sentTo ? `We sent a code to ${sentTo}.` : "Sending a code…"}</p>
          <CodeInput id="two-step-setup-email" label="Code" value={code} onChange={setCode} onComplete={(v) => void confirm(v)} />
          <Problem text={error} />
          <button type="submit" disabled={busy || code.length !== 6} className={btnMain}>
            {busy && spin}
            {busy ? "Checking…" : "Turn it on"}
          </button>
          <p className="text-[13.5px] text-ink-soft">
            Nothing yet? Look in spam, or{" "}
            <button type="button" onClick={() => void startEmail()} disabled={wait > 0} className="font-semibold text-amber hover:underline disabled:text-ink-faint disabled:no-underline">
              {wait > 0 ? `send another in ${wait} s` : "send another code"}
            </button>
            .
          </p>
        </form>
      )}

      {way && (
        <button
          type="button"
          onClick={() => {
            setWay(null);
            setEnrolled(null);
            setCode("");
            setError(null);
          }}
          className="mt-5 text-[13.5px] font-semibold text-ink-soft hover:text-ink"
        >
          Choose another way
        </button>
      )}
      <Foot />
    </div>
  );
}
