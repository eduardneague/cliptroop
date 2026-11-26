"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { Ago } from "@/components/ui/ago";
import { EyeIcon, LockIcon } from "@/components/ui/icons";
import { discardCompanyPictures, saveCompany, type LoginChange } from "@/app/(dashboard)/sponsorships/actions";
import { cleanCompany, cleanLogin, LIMITS, pctField, type Company, type Payout } from "../lib/rules";
import { useAffiliates } from "./affiliates-context";
import { CompanyPicture } from "./company-picture";
import { PayoutPicker } from "./payout";
import { PercentField } from "./percent-field";

/*
 * Adding or changing a company (1.58.0; a sponsorship in 1.56.0): what's the same for all of its products (the owner:
 * "the information like the affiliate platform will always be the same so it doesnt become redunant"): its name, the
 * code and the deal its products go by (one can have its own: the product's window), the affiliate platform's link,
 * notes, and its login. A new one goes on to its first product. A login is never shown here: a new one is typed in;
 * one that's kept is replaced or removed, after the password (the unlock). The fields keep password managers out
 * (they'd offer to save it as this site's), and the spell checker (some send what's typed away). 1.60.0 (once 0139 is
 * in): its picture (company-picture.tsx; uploads not kept are removed when the window closes) and where its money goes.
 */

const INPUT = "w-full rounded-xl border border-line/15 bg-surface px-3.5 h-11 text-[14px] outline-none focus:ring-2 focus:ring-amber placeholder:text-ink-faint/70";
const LABEL = "block text-[12.5px] font-semibold text-ink-soft mb-1.5";
/** Keeps password managers and the spell checker away from what's typed. */
const SECRET = { autoComplete: "off", spellCheck: false, autoCapitalize: "off", autoCorrect: "off", "data-1p-ignore": "", "data-lpignore": "true", "data-bwignore": "", "data-form-type": "other" } as const;

export function CompanyDialog({ company, onClose, onSaved }: { company: Company | null; onClose: () => void; onSaved: (id: string, fresh: boolean) => void }) {
  const ctx = useAffiliates()!;
  const toast = useToast();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(company?.name ?? "");
  const [code, setCode] = useState(company?.code ?? "");
  const [percentage, setPercentage] = useState(pctField(company?.percentage));
  const [platformUrl, setPlatformUrl] = useState(company?.platformUrl ?? "");
  const [notes, setNotes] = useState(company?.notes ?? "");
  const [picture, setPicture] = useState<string | null>(company?.picture ?? null);
  const [payout, setPayout] = useState<Payout | null>(company?.payout ?? null);
  // Pictures uploaded in this window: the ones not kept are removed when it closes.
  const uploads = useRef<string[]>([]);
  // The login: typed in (a new one), replacing the one kept, or removing it.
  const kept = !!company?.login;
  const [loginMode, setLoginMode] = useState<"keep" | "replace" | "remove">("keep");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginNotes, setLoginNotes] = useState("");
  const [seePassword, setSeePassword] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const typing = !kept || loginMode === "replace";

  useEffect(() => {
    const t = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  // The products that go by the company's code, and which of them are verified (another code un-verifies them).
  const using = company ? company.products.filter((p) => !p.ownCode) : [];
  const codeChanged = !!company && (code.trim() || null) !== company.code;
  const losing = codeChanged ? using.filter((p) => p.check).length : 0;

  async function replaceOrRemove(mode: "replace" | "remove") {
    if (!(await ctx.ensureUnlocked())) return;
    setLoginMode(mode);
  }

  /** Closing: the uploads not kept go (all of them, unsaved; the others, saved with `kept`). */
  function letGo(kept: string | null) {
    const unused = uploads.current.filter((u) => u !== kept);
    uploads.current = [];
    if (unused.length) void discardCompanyPictures(ctx.teamId, unused).catch(() => null);
  }
  const close = () => {
    letGo(null);
    onClose();
  };

  async function submit(again = true) {
    if (pending) return;
    const sending = { name, code, percentage, platformUrl, notes, ...(ctx.extras ? { picture, payout } : {}) };
    const checked = cleanCompany(sending);
    if ("error" in checked) return setProblem(checked.error);
    let change: LoginChange = null;
    if (ctx.vault && loginMode === "remove") change = { clear: true };
    else if (ctx.vault && typing) {
      const l = cleanLogin({ username, password, notes: loginNotes });
      if ("error" in l) return setProblem(l.error);
      if (l.ok) change = { set: l.ok };
    }
    setPending(true);
    setProblem(null);
    try {
      const r = await saveCompany(ctx.teamId, sending, company?.id ?? null, change);
      if (r.error !== undefined) {
        if (r.locked && again && (await ctx.ensureUnlocked())) {
          setPending(false);
          return submit(false);
        }
        setProblem(r.error);
        return;
      }
      setPassword("");
      letGo(ctx.extras ? picture : null);
      toast.success(company ? `${checked.ok.name} saved` : `${checked.ok.name} added`);
      onSaved(r.id, !company);
    } catch {
      setProblem("Couldn't save it. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !pending && close()}
      width="sm:max-w-xl"
      title={company ? `Edit ${company.name}` : "New company"}
      description={company ? undefined : "A brand you work with. Its code and its affiliate platform go for all of its products: you add those next."}
      footer={
        <>
          <button type="button" onClick={close} disabled={pending} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || !name.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-45"
          >
            {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
            {pending ? "Saving…" : company ? "Save" : "Add company"}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor={`${id}-name`} className={LABEL}>
            Name
          </label>
          <input ref={nameRef} id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.name} placeholder="Gravastar" className={INPUT} autoComplete="off" />
        </div>
        {ctx.extras && (
          <CompanyPicture
            teamId={ctx.teamId}
            value={picture}
            input={INPUT}
            onChange={(url, uploaded) => {
              if (url && uploaded) uploads.current.push(url);
              setPicture(url);
            }}
          />
        )}
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-code`} className={LABEL}>
                Code
              </label>
              <input id={`${id}-code`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={LIMITS.code} placeholder="VIVERRO" className={`${INPUT} font-mono`} autoComplete="off" spellCheck={false} autoCapitalize="off" />
            </div>
            <div>
              <label htmlFor={`${id}-pct`} className={LABEL}>
                Percentage
              </label>
              <PercentField id={`${id}-pct`} value={percentage} onChange={setPercentage} className={INPUT} />
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-faint">
            {losing
              ? `Another code isn't checked yet: saving takes “Verified” off ${losing === 1 ? "the product that goes" : `the ${losing} products that go`} by it.`
              : company && using.length
                ? `${using.length === company.products.length ? (using.length === 1 ? "Its product goes" : `All ${using.length} of its products go`) : `${using.length} of its ${company.products.length} products ${using.length === 1 ? "goes" : "go"}`} by it; one can have its own.`
                : "Its products go by it, unless one has its own."}
          </p>
        </div>
        {ctx.extras && (
          <div>
            <span id={`${id}-payout`} className={LABEL}>
              Paid to
            </span>
            <PayoutPicker value={payout} onChange={setPayout} labelledBy={`${id}-payout`} />
            <p className="mt-1.5 text-[12px] text-ink-faint">Where its money goes (just the way, no account details). Click it again for none.</p>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-platform`} className={LABEL}>
            Affiliate platform
          </label>
          <input id={`${id}-platform`} value={platformUrl} onChange={(e) => setPlatformUrl(e.target.value)} maxLength={LIMITS.url} inputMode="url" placeholder="Where you sign in to see the sales" className={INPUT} autoComplete="off" spellCheck={false} />
        </div>
        <div>
          <label htmlFor={`${id}-notes`} className={LABEL}>
            Notes
          </label>
          <textarea id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={LIMITS.notes} rows={2} placeholder="Terms, when it pays, the contact there…" className={`${INPUT} h-auto py-2.5 resize-y min-h-[3.25rem]`} />
        </div>

        {/* The login: sealed on the server, never shown here. */}
        <section aria-labelledby={`${id}-login`} className="rounded-2xl border border-line/15 bg-surface-2/50 p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <LockIcon className="w-4 h-4 text-ink-soft" />
            <h3 id={`${id}-login`} className="text-[13.5px] font-bold flex-1">
              Login for the affiliate platform
            </h3>
          </div>
          {!ctx.vault ? (
            <p className="text-[12.5px] text-coral">Logins can&rsquo;t be kept on this server yet: its secret key (SOCIAL_TOKEN_KEY) isn&rsquo;t set.</p>
          ) : kept && loginMode === "keep" ? (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[12.5px] text-ink-soft flex-1 min-w-0">
                A login is kept
                {company?.login && (
                  <>
                    {", changed "}
                    <Ago iso={company.login.updatedAt} />
                    {company.login.by ? ` by ${company.login.by}` : ""}
                  </>
                )}
                .
              </p>
              <button type="button" onClick={() => void replaceOrRemove("replace")} className="rounded-lg px-3 h-8 text-[12.5px] font-semibold border border-line/15 hover:bg-surface">
                Replace
              </button>
              <button type="button" onClick={() => void replaceOrRemove("remove")} className="rounded-lg px-3 h-8 text-[12.5px] font-semibold text-red border border-red/30 hover:bg-red/10">
                Remove
              </button>
            </div>
          ) : loginMode === "remove" ? (
            <p className="text-[12.5px] text-ink-soft">
              It&rsquo;s removed when you save.{" "}
              <button type="button" onClick={() => setLoginMode("keep")} className="font-semibold text-amber hover:underline">
                Keep it
              </button>
            </p>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${id}-user`} className={LABEL}>
                    Username or email
                  </label>
                  <input id={`${id}-user`} name="aff-account" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={LIMITS.username} className={INPUT} {...SECRET} />
                </div>
                <div>
                  <label htmlFor={`${id}-pass`} className={LABEL}>
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id={`${id}-pass`}
                      name="aff-secret"
                      type={seePassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={LIMITS.password}
                      className={`${INPUT} pr-11`}
                      {...SECRET}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setSeePassword((v) => !v)}
                      aria-label={seePassword ? "Hide the password" : "Show the password"}
                      aria-pressed={seePassword}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2"
                    >
                      <EyeIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor={`${id}-lnotes`} className={LABEL}>
                  Login notes
                </label>
                <textarea id={`${id}-lnotes`} value={loginNotes} onChange={(e) => setLoginNotes(e.target.value)} maxLength={LIMITS.loginNotes} rows={2} placeholder="Two-step backup codes, the account's email…" className={`${INPUT} h-auto py-2.5 resize-y min-h-[3.25rem]`} {...SECRET} />
              </div>
              {kept && (
                <p className="text-[12px] text-ink-faint">
                  Replaces the one kept when you save.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMode("keep");
                      setUsername("");
                      setPassword("");
                      setLoginNotes("");
                    }}
                    className="font-semibold text-amber hover:underline"
                  >
                    Keep the old one
                  </button>
                </p>
              )}
            </>
          )}
          <p className="text-[11.5px] leading-snug text-ink-faint">
            Encrypted before it&rsquo;s saved. Only masters and the people they choose can open it, after typing their password, and every look is written down.
          </p>
        </section>

        {problem && (
          <p role="alert" className="rounded-xl bg-red/10 text-red text-[13px] px-3.5 py-2.5">
            {problem}
          </p>
        )}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
