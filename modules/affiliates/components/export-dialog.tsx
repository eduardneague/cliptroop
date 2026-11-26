"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { DownloadIcon, LockIcon } from "@/components/ui/icons";
import { exportNeeds, exportSponsorships, type ExportNeeds } from "@/app/(dashboard)/sponsorships/actions";
import { sendTwoStepCode } from "@/app/two-step/actions";
import { csvName, SPONSORSHIPS_PATH } from "../lib/rules";

/*
 * Exporting (1.59.0; the owner: "for exporting the entire table, i want mandatory 2 factor authentification to be set
 * up and you should need to use it, both password and 2fa for it, so yeah, you shouldnt be able to export the table
 * without some work"). Only with two-step sign-in on (otherwise: turn it on first, and back here after), then your
 * password and a code typed now: the one your authenticator app shows, or one emailed for this. The server checks both
 * and only then makes the spreadsheet (app/(dashboard)/sponsorships/actions.ts, exportSponsorships): the whole table,
 * or the picked products.
 */

const FIELD = "w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-amber";
const LABEL = "flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft mb-1.5";
const SETUP_HREF = `/two-step/setup?next=${encodeURIComponent(SPONSORSHIPS_PATH)}`;

/** The spreadsheet saved (a byte-order mark first, so Excel reads the names' accents right). */
function save(csv: string) {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** ids: the picked products (in the order shown), or null for the whole table. */
export function ExportDialog({ teamId, ids, count, onClose }: { teamId: string; ids: string[] | null; count: number; onClose: () => void }) {
  const toast = useToast();
  const [needs, setNeeds] = useState<ExportNeeds | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [bad, setBad] = useState<"password" | "code" | null>(null);
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const passwordField = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    let alive = true;
    exportNeeds(teamId).then(
      (r) => {
        if (!alive) return;
        if (r.error !== undefined) setProblem(r.error);
        else setNeeds(r);
      },
      () => alive && setProblem("Couldn't check. Check your connection and try again.")
    );
    return () => {
      alive = false;
    };
  }, [teamId]);

  const method = needs?.method ?? null;
  useEffect(() => {
    if (!method) return;
    const t = requestAnimationFrame(() => passwordField.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [method]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  async function sendCode() {
    if (sending || wait > 0) return;
    setSending(true);
    setProblem(null);
    try {
      const r = await sendTwoStepCode("export");
      if (r.error) setProblem(r.error);
      if (r.to) setSentTo(r.to);
      if (r.wait) setWait(r.wait);
      if (!r.error) requestAnimationFrame(() => codeField.current?.focus());
    } catch {
      setProblem("Couldn't send a code. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function submit(typedCode = code) {
    if (pending || !method || !password || typedCode.length !== 6) return;
    setPending(true);
    setProblem(null);
    setBad(null);
    try {
      const r = await exportSponsorships(teamId, ids, password, typedCode);
      if (r.error !== undefined) {
        setProblem(r.error);
        if (r.field === "setup") return setNeeds({ method: null, to: null, minutes: needs?.minutes ?? 10 });
        // Only the wrong one is cleared (an email code still works after a wrong password).
        if (r.field === "password" || r.field === "code") {
          setBad(r.field);
          if (r.field === "password") setPassword("");
          else setCode("");
          requestAnimationFrame(() => (r.field === "password" ? passwordField : codeField).current?.focus());
        }
        return;
      }
      save(r.csv);
      setPassword("");
      toast.success(r.count === 1 ? "Exported as a spreadsheet" : `${r.count} products exported as a spreadsheet`);
      onClose();
    } catch {
      setProblem("Couldn't export. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const what = ids ? (count === 1 ? "The picked product" : `The ${count} picked products`) : count === 1 ? "The whole table (1 product)" : `The whole table (${count} products)`;
  const cancel = (
    <button type="button" onClick={onClose} disabled={pending} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
      Cancel
    </button>
  );

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      title="Export as a spreadsheet"
      description={`${what}, with their companies, as a CSV file (logins never leave). Exporting takes your password and a two-step code.`}
      footer={
        needs && !method ? (
          <>
            {cancel}
            <Link href={SETUP_HREF} className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px]">
              Turn on two-step sign-in
            </Link>
          </>
        ) : (
          <>
            {cancel}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!method || !password || code.length !== 6 || pending}
              className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-45"
            >
              {pending ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden /> : <DownloadIcon className="w-4 h-4" />}
              {pending ? "Checking…" : "Export"}
            </button>
          </>
        )
      }
    >
      {!needs ? (
        problem ? (
          <p className="text-[13px] text-red" role="alert">
            {problem}
          </p>
        ) : (
          <div className="space-y-3" role="status" aria-label="Checking what exporting needs">
            <div className="h-[4.25rem] rounded-xl bg-surface-2 animate-pulse" />
            <div className="h-[4.25rem] rounded-xl bg-surface-2 animate-pulse" />
          </div>
        )
      ) : !method ? (
        <div className="rounded-xl border border-amber/30 bg-amber/[0.07] px-4 py-3.5" data-export-setup>
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <LockIcon className="w-4 h-4 text-amber" />
            Exporting needs two-step sign-in
          </p>
          <p className="mt-1.5 text-[13px] text-ink-soft leading-relaxed">
            Turn it on first (an authenticator app, or codes by email). Then exporting asks for your password and a code, so someone who gets into your account still can&rsquo;t take the
            table. You&rsquo;ll come back here after.
          </p>
          {problem && (
            <p className="mt-2 text-[12.5px] text-red" role="alert">
              {problem}
            </p>
          )}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor={`${id}-password`} className={LABEL}>
              <LockIcon className="w-3.5 h-3.5" />
              Your password
            </label>
            <input
              ref={passwordField}
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (bad === "password") setBad(null);
              }}
              aria-invalid={bad === "password" ? true : undefined}
              className={`${FIELD} ${bad === "password" ? "border-red/60" : "border-line/15"}`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-code`} className={LABEL}>
              {method === "app" ? "The code your authenticator app shows" : "The code from the email"}
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={codeField}
                id={`${id}-code`}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                  if (bad === "code") setBad(null);
                  // The last digit sends it, once the password is there too.
                  if (v.length === 6 && password) void submit(v);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={12}
                placeholder="123456"
                aria-invalid={bad === "code" ? true : undefined}
                aria-describedby={`${id}-hint`}
                className={`${FIELD} flex-1 min-w-0 font-mono tracking-[0.3em] placeholder:tracking-[0.3em] placeholder:text-ink-faint/50 ${bad === "code" ? "border-red/60" : "border-line/15"}`}
              />
              {method === "email" && (
                <button
                  type="button"
                  onClick={() => void sendCode()}
                  disabled={sending || wait > 0}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-line/15 px-3.5 h-[2.875rem] text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  {sending && <span className="w-3.5 h-3.5 rounded-full border-2 border-amber/30 border-t-amber animate-spin" aria-hidden />}
                  {wait > 0 ? `Again in ${wait} s` : sentTo ? "Send another" : "Email me a code"}
                </button>
              )}
            </div>
          </div>
          <p id={`${id}-hint`} className={`text-[12px] ${problem ? "text-red" : "text-ink-faint"}`} role={problem ? "alert" : undefined}>
            {problem ??
              (method === "app"
                ? "Your sign-in password, then the six digits your app shows for this account now."
                : sentTo
                  ? `Sent to ${sentTo}. It works once, for ${needs.minutes} minutes. Nothing there? Look in spam.`
                  : `Your sign-in password, then a code we email to ${needs.to ?? "you"} for this.`)}
          </p>
        </form>
      )}
    </Dialog>
  );
}
