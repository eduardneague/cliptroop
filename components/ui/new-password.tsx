"use client";

import { useState } from "react";
import { CheckIcon } from "./icons";
import { checkPassword, type PasswordAbout } from "@/lib/auth/password-rules";

/**
 * Choosing a new password (1.31.10): the box, the same again, Show / Hide,
 * and the rules (lib/auth/password-rules.ts) as a checklist that ticks as
 * they're met. The same everywhere a password is chosen: setting up an
 * invited account, a reset link, Settings → Password. The page checks
 * `newPasswordState()` before saving and shows its `error` if it isn't ok.
 */
export function NewPasswordFields({
  value,
  confirm,
  onValue,
  onConfirm,
  about,
  inputClass,
  labelClass,
  label = "New password",
  id = "new-password",
  autoFocus = false,
}: {
  value: string;
  confirm: string;
  onValue: (v: string) => void;
  onConfirm: (v: string) => void;
  about: PasswordAbout;
  inputClass: string;
  labelClass: string;
  label?: string;
  id?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  const state = newPasswordState(value, confirm, about);
  const items = [...state.checks.map((c) => ({ key: c.rule, ok: c.ok, text: c.text })), { key: "same", ok: state.matches, text: "Both are the same" }];
  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass} htmlFor={id}>
          {label}
        </label>
        <div className="relative">
          <input
            id={id}
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onValue(e.target.value)}
            autoComplete="new-password"
            autoFocus={autoFocus}
            aria-describedby={`${id}-rules`}
            className={`${inputClass} pr-20`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 rounded-lg px-2.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor={`${id}-again`}>
          Type it again
        </label>
        <input id={`${id}-again`} type={show ? "text" : "password"} value={confirm} onChange={(e) => onConfirm(e.target.value)} autoComplete="new-password" className={inputClass} />
      </div>
      <ul id={`${id}-rules`} className="space-y-1.5 text-[13px]">
        {items.map((it) => (
          <li key={it.key} className={`flex items-center gap-2 ${it.ok ? "text-green" : "text-ink-faint"}`}>
            <span className={`w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 ${it.ok ? "bg-green text-white" : "border border-line/30"}`} aria-hidden>
              {it.ok ? <CheckIcon className="w-3 h-3" /> : null}
            </span>
            <span>
              {it.text}
              <span className="sr-only">{it.ok ? ": done" : ": not yet"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The rules' verdict plus whether it was typed the same twice; `error` is what to say when they press save too early. */
export function newPasswordState(value: string, confirm: string, about: PasswordAbout) {
  const r = checkPassword(value, about);
  const matches = value.length > 0 && value === confirm;
  return { ...r, matches, ready: r.ok && matches, error: r.error ?? (matches ? null : "The two passwords don't match yet.") };
}
