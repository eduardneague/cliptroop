"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { Ago } from "@/components/ui/ago";
import { CloseIcon, EyeIcon, LockIcon, PlusIcon, SearchIcon, ShortsIcon, VideoIcon } from "@/components/ui/icons";
import { saveAffiliate, type LoginChange } from "@/app/(dashboard)/affiliates/actions";
import { AFFILIATE_STATUSES, cleanAffiliate, cleanLogin, LIMITS, STATUS_LABEL, type Affiliate, type AffiliateStatus, type VideoChoice, type VideoKind } from "../lib/rules";
import { useAffiliates } from "./affiliates-context";

/*
 * Adding or changing an affiliate (1.56.0): its name, the product link, the code and the percentage, whether it's on,
 * the long video and the Short made about the product (the team's own, picked from a list), the affiliate platform's
 * link, notes, and its login. A login is never shown here: a new one is typed in; one that's kept is replaced or
 * removed, after the password (the unlock). The fields keep password managers out (they'd offer to save it as this
 * site's), and the spell checker (some send what's typed away).
 */

const INPUT = "w-full rounded-xl border border-line/15 bg-surface px-3.5 h-11 text-[14px] outline-none focus:ring-2 focus:ring-amber placeholder:text-ink-faint/70";
const LABEL = "block text-[12.5px] font-semibold text-ink-soft mb-1.5";
/** Keeps password managers and the spell checker away from what's typed. */
const SECRET = { autoComplete: "off", spellCheck: false, autoCapitalize: "off", autoCorrect: "off", "data-1p-ignore": "", "data-lpignore": "true", "data-bwignore": "", "data-form-type": "other" } as const;

export function AffiliateDialog({ affiliate, onClose, onSaved }: { affiliate: Affiliate | null; onClose: () => void; onSaved: (id: string) => void }) {
  const ctx = useAffiliates()!;
  const toast = useToast();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(affiliate?.name ?? "");
  const [productUrl, setProductUrl] = useState(affiliate?.productUrl ?? "");
  const [code, setCode] = useState(affiliate?.code ?? "");
  const [percentage, setPercentage] = useState(affiliate?.percentage ?? "");
  const [status, setStatus] = useState<AffiliateStatus>(affiliate?.status ?? "active");
  const [platformUrl, setPlatformUrl] = useState(affiliate?.platformUrl ?? "");
  const [notes, setNotes] = useState(affiliate?.notes ?? "");
  const [longId, setLongId] = useState<string | null>(affiliate?.long?.id ?? null);
  const [shortId, setShortId] = useState<string | null>(affiliate?.short?.id ?? null);
  // The login: typed in (a new one), replacing the one kept, or removing it.
  const kept = !!affiliate?.login;
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

  const videosOf = (k: VideoKind) => ctx.videos.filter((v) => v.kind === k);
  const fields = { name, productUrl, code, percentage, status, platformUrl, notes, projectId: longId, shortId };

  async function replaceOrRemove(mode: "replace" | "remove") {
    if (!(await ctx.ensureUnlocked())) return;
    setLoginMode(mode);
  }

  async function submit(again = true) {
    if (pending) return;
    const checked = cleanAffiliate(fields);
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
      const r = await saveAffiliate(ctx.teamId, fields, affiliate?.id ?? null, change);
      if (r.error !== undefined) {
        if (r.locked && again && (await ctx.ensureUnlocked())) {
          setPending(false);
          return submit(false);
        }
        setProblem(r.error);
        return;
      }
      setPassword("");
      toast.success(affiliate ? `${checked.ok.name} saved` : `${checked.ok.name} added`);
      onSaved(r.id);
    } catch {
      setProblem("Couldn't save it. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      width="sm:max-w-xl"
      title={affiliate ? `Edit ${affiliate.name}` : "New affiliate"}
      description={affiliate ? undefined : "A brand you work with: its link, the code for viewers, and the video you made about it."}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={pending} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || !name.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-45"
          >
            {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
            {pending ? "Saving…" : affiliate ? "Save" : "Add affiliate"}
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
          <input ref={nameRef} id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.name} placeholder="Gravastar.com" className={INPUT} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={`${id}-product`} className={LABEL}>
            Product link
          </label>
          <input id={`${id}-product`} value={productUrl} onChange={(e) => setProductUrl(e.target.value)} maxLength={LIMITS.url} inputMode="url" placeholder="https://…" className={INPUT} autoComplete="off" spellCheck={false} />
        </div>
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
            <input id={`${id}-pct`} value={percentage} onChange={(e) => setPercentage(e.target.value)} maxLength={LIMITS.percentage} placeholder="10% or $5 off" className={INPUT} autoComplete="off" />
          </div>
        </div>
        <div>
          <span className={LABEL} id={`${id}-status`}>
            Status
          </span>
          <Segmented ariaLabel="Status" value={status} onChange={setStatus} options={AFFILIATE_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
        </div>
        <fieldset>
          <legend className={LABEL}>The video about it</legend>
          <div className="space-y-2">
            <VideoField kind="long" value={longId} choices={videosOf("long")} onChange={setLongId} linked={affiliate?.long ?? null} />
            <VideoField kind="short" value={shortId} choices={videosOf("short")} onChange={setShortId} linked={affiliate?.short ?? null} />
          </div>
        </fieldset>
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
          <textarea id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={LIMITS.notes} rows={2} placeholder="Terms, payouts, the contact there…" className={`${INPUT} h-auto py-2.5 resize-y min-h-[3.25rem]`} />
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
                {affiliate?.login && (
                  <>
                    {", changed "}
                    <Ago iso={affiliate.login.updatedAt} />
                    {affiliate.login.by ? ` by ${affiliate.login.by}` : ""}
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

/**
 * One of the team's long videos (or Shorts) for the affiliate: the one picked, or a button that opens a searchable
 * list right here (no popup over the window).
 */
function VideoField({ kind, value, choices, onChange, linked }: { kind: VideoKind; value: string | null; choices: VideoChoice[]; onChange: (id: string | null) => void; linked: { id: string; number: number | null; title: string } | null }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const Icon = kind === "short" ? ShortsIcon : VideoIcon;
  const what = kind === "short" ? "Short" : "long video";
  const picked = choices.find((c) => c.id === value) ?? (value && linked?.id === value ? { ...linked, stageLabel: "" } : null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^#/, "");
    const hit = t ? choices.filter((c) => c.title.toLowerCase().includes(t) || (c.number !== null && String(c.number).startsWith(t))) : choices;
    return hit.slice(0, 60);
  }, [choices, q]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => search.current?.focus());
  }, [open]);

  if (picked && !open)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line/15 bg-surface pl-3 pr-1.5 h-11">
        <Icon className={`w-4 h-4 flex-shrink-0 ${kind === "short" ? "text-short" : "text-long"}`} />
        {picked.number !== null && <span className="font-mono text-[12px] text-ink-faint tabular-nums">#{picked.number}</span>}
        <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold">{picked.title}</span>
        {picked.stageLabel && <span className="text-[11px] text-ink-faint whitespace-nowrap">{picked.stageLabel}</span>}
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg px-2 h-8 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Change
        </button>
        <button type="button" onClick={() => onChange(null)} aria-label={`Unlink the ${what}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!choices.length}
        className="w-full flex items-center gap-2 rounded-xl border border-dashed border-line/25 px-3 h-11 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 hover:bg-surface-2/60 disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <PlusIcon className="w-4 h-4" />
        <Icon className={`w-4 h-4 ${kind === "short" ? "text-short" : "text-long"}`} />
        {choices.length ? `Link a ${what}` : `No ${what}s on the team yet`}
      </button>
    );

  return (
    <div className="rounded-xl border border-line/15 bg-surface overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-11 border-b border-line/10">
        <SearchIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
        <input
          ref={search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              setQ("");
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (shown[0]) {
                onChange(shown[0].id);
                setOpen(false);
                setQ("");
              }
            }
          }}
          placeholder={`Find a ${what}: its title or number`}
          aria-label={`Find a ${what}`}
          aria-controls={listId}
          className="flex-1 min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint/70"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQ("");
          }}
          className="rounded-lg px-2 h-8 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Cancel
        </button>
      </div>
      <ul id={listId} role="listbox" aria-label={`The team's ${what}s`} className="max-h-56 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll p-1">
        {shown.length === 0 && <li className="px-3 py-3 text-[12.5px] text-ink-faint">Nothing called that.</li>}
        {shown.map((c) => (
          <li key={c.id} role="option" aria-selected={c.id === value}>
            <button
              type="button"
              onClick={() => {
                onChange(c.id);
                setOpen(false);
                setQ("");
              }}
              className={`w-full flex items-center gap-2.5 text-left rounded-lg px-2.5 h-10 text-[13px] hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${c.id === value ? "bg-amber/10" : ""}`}
            >
              <span className="font-mono text-[11.5px] text-ink-faint tabular-nums w-10 text-right flex-shrink-0">{c.number !== null ? `#${c.number}` : ""}</span>
              <span className="flex-1 min-w-0 truncate font-semibold">{c.title}</span>
              <span className="text-[11px] text-ink-faint whitespace-nowrap">{c.stageLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
