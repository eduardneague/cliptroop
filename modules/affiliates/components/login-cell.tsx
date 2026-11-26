"use client";

import { useRef } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { CopyIcon, EyeIcon, LockIcon, PlusIcon, UserIcon } from "@/components/ui/icons";
import { SHOWN_SECONDS, type Affiliate } from "../lib/rules";
import { useAffiliates, type ShownLogin } from "./affiliates-context";

/*
 * A sponsorship's login on the list (1.56.0), for the people let in: kept or not, and Show / copy the username / copy
 * the password. Each asks the server for just that part (after the password, if logins are locked); a shown login
 * stays 30 seconds. On a card, in it. On the table (1.57.1), one small lock beside the platform's icon: it opens beside
 * the row, with a copy button for each part; the row's ⋯ copies a part without showing it.
 */

const ICON_BTN = "w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:opacity-40";

export function LoginCell({ affiliate, variant }: { affiliate: Affiliate; variant: "icon" | "card" }) {
  const ctx = useAffiliates();
  const btn = useRef<HTMLButtonElement>(null);
  if (!ctx?.manage) return null;
  const a = affiliate;
  const shown = ctx.shown?.id === a.id ? ctx.shown : null;

  if (!a.login)
    return variant === "card" ? (
      <button type="button" onClick={() => ctx.openEditor(a)} className="relative z-10 inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-faint hover:text-ink">
        <PlusIcon className="w-3.5 h-3.5" />
        Add its login
      </button>
    ) : null;

  const popover = (
    <AnchoredMenu open={!!shown} onClose={ctx.hide} anchor={btn} width={300} align="right" role="dialog" label={`${a.name}'s login`}>
      {shown && (
        <div className="p-3">
          <Shown login={shown} now={ctx.now} name={a.name} onCopy={(part) => void ctx.copyPart(a, part)} />
        </div>
      )}
    </AnchoredMenu>
  );

  if (variant === "icon")
    return (
      <>
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
        {popover}
      </>
    );

  const buttons = (
    <span className="relative z-10 inline-flex items-center gap-0.5">
      <button
        ref={btn}
        type="button"
        onClick={() => (shown ? ctx.hide() : void ctx.show(a))}
        aria-expanded={!!shown}
        aria-label={shown ? `Hide ${a.name}'s login` : `Show ${a.name}'s login`}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2 h-8 text-[12px] font-semibold border transition-colors ${
          shown ? "border-amber/50 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:bg-surface-2"
        }`}
      >
        {shown ? <EyeIcon className="w-3.5 h-3.5" /> : <LockIcon className="w-3.5 h-3.5" />}
        {shown ? "Hide" : "Show"}
      </button>
      <button type="button" onClick={() => void ctx.copyPart(a, "username")} aria-label={`Copy ${a.name}'s username`} title="Copy the username" className={ICON_BTN}>
        <UserIcon className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => void ctx.copyPart(a, "password")} aria-label={`Copy ${a.name}'s password`} title="Copy the password" className={ICON_BTN}>
        <CopyIcon className="w-3.5 h-3.5" />
      </button>
    </span>
  );

  return (
    <div className="relative z-10 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-ink-soft flex-1 min-w-0 truncate">Login</span>
        {buttons}
      </div>
      {shown && <Shown login={shown} now={ctx.now} name={a.name} onCopy={(part) => void ctx.copyPart(a, part)} />}
    </div>
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
