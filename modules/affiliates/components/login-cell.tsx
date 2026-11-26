"use client";

import { useRef } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { CopyIcon, EyeIcon, LockIcon } from "@/components/ui/icons";
import { SHOWN_SECONDS, type Company } from "../lib/rules";
import { useAffiliates, type ShownLogin } from "./affiliates-context";

/*
 * A company's login on the list (1.56.0), for the people let in: kept or not, and Show / copy the username / copy the
 * password. Each asks the server for just that part (after the password, if logins are locked); a shown login stays 30
 * seconds. One small lock beside the platform's icon (1.57.1; on the company's heading since 1.58.0): it opens beside
 * it, with a copy button for each part; the company's ⋯ copies a part without showing it.
 */

const ICON_BTN = "w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:opacity-40";

export function LoginCell({ company }: { company: Company }) {
  const ctx = useAffiliates();
  const btn = useRef<HTMLButtonElement>(null);
  if (!ctx?.manage || !company.login) return null;
  const a = company;
  const shown = ctx.shown?.id === a.id ? ctx.shown : null;

  const popover = (
    <AnchoredMenu open={!!shown} onClose={ctx.hide} anchor={btn} width={300} align="right" role="dialog" label={`${a.name}'s login`}>
      {shown && (
        <div className="p-3">
          <Shown login={shown} now={ctx.now} name={a.name} onCopy={(part) => void ctx.copyPart(a, part)} />
        </div>
      )}
    </AnchoredMenu>
  );

  // One small lock (the copies are in the shown login, and in the company's ⋯).
  const lock = (
    <button
      ref={btn}
      type="button"
      onClick={() => (shown ? ctx.hide() : void ctx.show(a))}
      aria-expanded={!!shown}
      aria-label={shown ? `Hide ${a.name}'s login` : `Show ${a.name}'s login`}
      title={shown ? "Hide the login" : "The login for the affiliate platform: show it, copy it"}
      className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
        shown ? "bg-amber/15 text-amber" : "text-ink-soft hover:text-ink hover:bg-surface-2"
      }`}
    >
      {shown ? <EyeIcon className="w-4 h-4" /> : <LockIcon className="w-4 h-4" />}
    </button>
  );

  return (
    <>
      {lock}
      {popover}
    </>
  );
}

/** The login, shown: each part with its copy button, and how long until it hides. */
function Shown({ login, now, name, onCopy }: { login: ShownLogin; now: number; name: string; onCopy: (part: "username" | "password" | "notes") => void }) {
  const left = Math.min(SHOWN_SECONDS, Math.max(0, Math.ceil((login.hideAt - now) / 1000)));
  const row = (label: string, value: string, part: "username" | "password" | "notes", mono = false) => (
    <div className="min-w-0">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint mb-0.5">{label}</div>
      <div className="flex items-start gap-1.5">
        <span className={`flex-1 min-w-0 break-all select-all text-[13px] ${mono ? "font-mono" : "font-semibold"} ${value ? "text-ink" : "text-ink-faint"}`}>{value || "None"}</span>
        {value && (
          <button type="button" onClick={() => onCopy(part)} aria-label={`Copy ${name}'s ${label.toLowerCase()}`} className={ICON_BTN}>
            <CopyIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
  return (
    <div className="rounded-xl border border-amber/30 bg-amber/[0.06] p-3 space-y-2.5" role="group" aria-label={`${name}'s login`}>
      {row("Username", login.username, "username")}
      {row("Password", login.password, "password", true)}
      {login.notes && row("Notes", login.notes, "notes")}
      <div className="flex items-center gap-2 pt-1">
        <span className="h-1 flex-1 rounded-full bg-line/15 overflow-hidden" aria-hidden>
          <span className="block h-full bg-amber transition-[width] duration-1000 ease-linear" style={{ width: `${(left / SHOWN_SECONDS) * 100}%` }} />
        </span>
        <span className="text-[11px] text-ink-faint tabular-nums" aria-live="off">
          Hides in {left}s
        </span>
      </div>
    </div>
  );
}
