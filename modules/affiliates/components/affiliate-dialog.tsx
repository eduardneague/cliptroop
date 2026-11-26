"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { Ago } from "@/components/ui/ago";
import { wordColor } from "@/lib/word-color";
import { CheckIcon, CloseIcon, EyeIcon, ImageIcon, LockIcon, PlusIcon, RetryIcon, SearchIcon, ShortsIcon, VideoIcon } from "@/components/ui/icons";
import { findProductPicture, saveAffiliate, type LoginChange } from "@/app/(dashboard)/sponsorships/actions";
import {
  AFFILIATE_STATUSES,
  choiceThumb,
  cleanAffiliate,
  cleanLogin,
  DEAL_KINDS,
  domainOf,
  KIND_COLOR,
  KIND_HINT,
  KIND_LABEL,
  LIMITS,
  normalizePicture,
  normalizeUrl,
  smallPicture,
  STATUS_LABEL,
  YOUTUBE_ID,
  youtubeIdOf,
  type Affiliate,
  type AffiliateStatus,
  type DealKind,
  type LinkedVideo,
  type PictureChange,
  type PictureSource,
  type VideoChoice,
  type VideoKind,
  type VideoSource,
} from "../lib/rules";
import { useAffiliates } from "./affiliates-context";

/*
 * Adding or changing a sponsorship (1.56.0, as an affiliate): its name, what kind of deal (1.57.0: affiliate, review,
 * paid, one or more), the product link and its picture (1.57.0: found on the product's page as soon as the link is
 * typed; another picture's link, or none), the code and the percentage, whether it's on, the long video and the Short
 * made about the product (1.57.0: the team's own or any video on the channel, picked from a list), the affiliate
 * platform's link, notes, and its login. A login is never shown here: a new one is typed in; one that's kept is
 * replaced or removed, after the password (the unlock). The fields keep password managers out (they'd offer to save it
 * as this site's), and the spell checker (some send what's typed away).
 */

/** What's linked in one place: one of the team's videos or one only on the channel, with what's shown of it. */
type Picked = { source: VideoSource; id: string; number: number | null; title: string; stageLabel: string; thumb: string | null };
const pickedOf = (v: LinkedVideo | null): Picked | null => (v ? { source: v.source, id: v.id, number: v.number, title: v.title, stageLabel: v.stageLabel, thumb: v.thumb } : null);
const pickedFrom = (c: VideoChoice): Picked => ({ source: c.source, id: c.id, number: c.number, title: c.title, stageLabel: c.stageLabel, thumb: choiceThumb(c) });

/** The picture in the window: none (looked on the page and there was none: missed), taken away, being looked for, or one. */
type Pic = { at: "none"; missed?: boolean } | { at: "off" } | { at: "looking"; for: string } | { at: "set"; url: string; source: PictureSource };

/** "2025-11-03" → "Nov 3, 2025" */
const dayText = (d: string) => {
  const t = Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

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
  const [kinds, setKinds] = useState<DealKind[]>(affiliate?.kinds ?? ctx.newKinds);
  const [productUrl, setProductUrl] = useState(affiliate?.productUrl ?? "");
  const [code, setCode] = useState(affiliate?.code ?? "");
  const [percentage, setPercentage] = useState(affiliate?.percentage ?? "");
  const [status, setStatus] = useState<AffiliateStatus>(affiliate?.status ?? "active");
  const [platformUrl, setPlatformUrl] = useState(affiliate?.platformUrl ?? "");
  const [notes, setNotes] = useState(affiliate?.notes ?? "");
  const [longPick, setLongPick] = useState<Picked | null>(pickedOf(affiliate?.long ?? null));
  const [shortPick, setShortPick] = useState<Picked | null>(pickedOf(affiliate?.short ?? null));
  // The picture: as it's kept, until something here changes it (then it's sent).
  const [pic, setPic] = useState<Pic>(affiliate?.picture ? { at: "set", ...affiliate.picture } : affiliate?.pictureOff ? { at: "off" } : { at: "none" });
  const [picTouched, setPicTouched] = useState(false);
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

  // Each new product link: its page is asked for the product's picture (a pasted picture, or none on purpose, stays).
  const link = normalizeUrl(productUrl);
  const lookedFor = useRef<string | null>(affiliate?.productUrl ?? null);
  const picNow = useRef(pic);
  picNow.current = pic;
  const look = useCallback(
    async (url: string) => {
      lookedFor.current = url;
      setPic({ at: "looking", for: url });
      setPicTouched(true);
      let image: string | null = null;
      try {
        const r = await findProductPicture(ctx.teamId, url);
        image = r.error === undefined ? r.image : null;
      } catch {
        /* none found */
      }
      setPic((cur) => (cur.at === "looking" && cur.for === url ? (image ? { at: "set", url: image, source: "page" } : { at: "none", missed: true }) : cur));
    },
    [ctx.teamId]
  );
  useEffect(() => {
    const url = typeof link === "string" ? link : null;
    if (url === lookedFor.current) return;
    const cur = picNow.current;
    if ((cur.at === "set" && cur.source === "link") || cur.at === "off") {
      lookedFor.current = url;
      return;
    }
    if (!url) {
      // No product link any more: the picture found on its page goes with it.
      lookedFor.current = null;
      if (cur.at !== "none" || cur.missed) {
        setPic({ at: "none" });
        setPicTouched(true);
      }
      return;
    }
    const t = window.setTimeout(() => void look(url), 700);
    return () => window.clearTimeout(t);
  }, [link, look]);

  /** What's saved about the picture: nothing touched keeps it; else the one here, none on purpose, or the server's look. */
  const pictureChange = (): PictureChange => {
    // A new product link whose page wasn't asked yet (saved straight after typing it): the old page's picture doesn't
    // go with it; the server looks once it's saved. (A pasted picture, or none on purpose, stays.)
    const now = typeof link === "string" ? link : null;
    if (now !== lookedFor.current && !(pic.at === "set" && pic.source === "link") && pic.at !== "off") return "auto";
    if (pic.at === "set" && (picTouched || !affiliate)) return { url: pic.url, source: pic.source };
    if (!picTouched) return affiliate ? "keep" : "auto";
    return pic.at === "off" ? "off" : "auto";
  };
  const fields = {
    name,
    kinds,
    productUrl,
    code,
    percentage,
    status,
    platformUrl,
    notes,
    projectId: longPick?.source === "team" ? longPick.id : null,
    longYoutubeId: longPick?.source === "channel" ? longPick.id : null,
    shortId: shortPick?.source === "team" ? shortPick.id : null,
    shortYoutubeId: shortPick?.source === "channel" ? shortPick.id : null,
  };

  async function replaceOrRemove(mode: "replace" | "remove") {
    if (!(await ctx.ensureUnlocked())) return;
    setLoginMode(mode);
  }

  async function submit(again = true) {
    if (pending) return;
    const sending = { ...fields, picture: pictureChange() };
    const checked = cleanAffiliate(sending);
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
      const r = await saveAffiliate(ctx.teamId, sending, affiliate?.id ?? null, change);
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
      title={affiliate ? `Edit ${affiliate.name}` : "New sponsorship"}
      description={affiliate ? undefined : "A brand you work with: an affiliate code, a product to review, a paid video, or all of them."}
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
            {pending ? "Saving…" : affiliate ? "Save" : "Add sponsorship"}
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
        <fieldset className="min-w-0">
          <legend className={LABEL}>Type</legend>
          <div className="flex flex-wrap gap-1.5">
            {DEAL_KINDS.map((k) => {
              const on = kinds.includes(k);
              const c = KIND_COLOR[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  title={on && kinds.length === 1 ? `${KIND_HINT[k]}. A sponsorship is at least one kind.` : KIND_HINT[k]}
                  onClick={() => setKinds((cur) => (cur.includes(k) ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur) : DEAL_KINDS.filter((x) => x === k || cur.includes(x))))}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[13px] font-semibold border transition-colors ${on ? "" : "border-line/15 text-ink-soft hover:text-ink hover:bg-surface-2"}`}
                  style={on ? { color: wordColor(c), borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, background: `color-mix(in srgb, ${c} 14%, rgb(var(--surface)))` } : undefined}
                >
                  {on ? <CheckIcon className="w-3.5 h-3.5" /> : <span className="w-2 h-2 rounded-[3px]" style={{ background: c }} aria-hidden />}
                  {KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-faint">{kinds.map((k) => KIND_HINT[k]).join(". ")}.</p>
        </fieldset>
        <div>
          <label htmlFor={`${id}-product`} className={LABEL}>
            Product link
          </label>
          <input id={`${id}-product`} value={productUrl} onChange={(e) => setProductUrl(e.target.value)} maxLength={LIMITS.url} inputMode="url" placeholder="https://…" className={INPUT} autoComplete="off" spellCheck={false} />
          <PictureRow
            pic={pic}
            link={typeof link === "string" ? link : null}
            onLook={() => typeof link === "string" && void look(link)}
            onRemove={() => {
              setPic({ at: "off" });
              setPicTouched(true);
            }}
            onUse={(url) => {
              setPic({ at: "set", url, source: "link" });
              setPicTouched(true);
            }}
          />
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
        {/* min-w-0: a fieldset is as wide as its longest line otherwise (a long title would push the window wider). */}
        <fieldset className="min-w-0">
          <legend className={LABEL}>The video about it</legend>
          <div className="space-y-2">
            <VideoField kind="long" value={longPick} onChange={setLongPick} />
            <VideoField kind="short" value={shortPick} onChange={setShortPick} />
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
 * The product's picture, under its link: the one found on the product's page (or pasted), being looked for, or none
 * (look again, paste a picture's link). A picture that doesn't open here says so; the list then shows the initial.
 */
function PictureRow({ pic, link, onLook, onRemove, onUse }: { pic: Pic; link: string | null; onLook: () => void; onRemove: () => void; onUse: (url: string) => void }) {
  const [pasting, setPasting] = useState(false);
  const [typed, setTyped] = useState("");
  const [wrong, setWrong] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const inputId = useId();
  const typedRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (pasting) requestAnimationFrame(() => typedRef.current?.focus());
  }, [pasting]);
  const SMALL = "rounded-lg px-2.5 h-8 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 whitespace-nowrap";

  const use = () => {
    const url = normalizePicture(typed);
    if (!url) return setWrong("That isn't a picture on the web (https://…). Right-click the picture on the shop's page and copy its address.");
    onUse(url);
    setPasting(false);
    setTyped("");
    setWrong(null);
  };

  if (pasting)
    return (
      <div className="mt-2">
        <div className="flex items-center gap-2">
          <label htmlFor={inputId} className="sr-only">
            The picture&rsquo;s link
          </label>
          <input
            ref={typedRef}
            id={inputId}
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setWrong(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setPasting(false);
              }
              if (e.key === "Enter") {
                e.preventDefault();
                use();
              }
            }}
            inputMode="url"
            placeholder="The picture's link (on the shop's page: right-click it, Copy image address)"
            className={`${INPUT} h-10 text-[13px]`}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!wrong}
            aria-describedby={wrong ? `${inputId}-wrong` : undefined}
          />
          <button type="button" onClick={use} className="rounded-lg px-3 h-10 text-[12.5px] font-bold bg-amber text-white whitespace-nowrap">
            Use it
          </button>
          <button type="button" onClick={() => setPasting(false)} className={SMALL}>
            Cancel
          </button>
        </div>
        {wrong && (
          <p id={`${inputId}-wrong`} role="alert" className="mt-1.5 text-[12px] text-red">
            {wrong}
          </p>
        )}
      </div>
    );

  const shownUrl = pic.at === "set" ? pic.url : null;
  return (
    <div className="mt-2 flex items-center gap-3 min-h-12" aria-live="polite">
      <span className={`w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center ${shownUrl && broken !== shownUrl ? "bg-white border border-line/10" : "border border-dashed border-line/25 text-ink-faint"}`}>
        {pic.at === "looking" ? (
          <span className="w-full h-full bg-surface-2 animate-pulse" aria-hidden />
        ) : shownUrl && broken !== shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={smallPicture(shownUrl, 160)} alt="The product's picture" referrerPolicy="no-referrer" onError={() => setBroken(shownUrl)} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-5 h-5" />
        )}
      </span>
      <p className="flex-1 min-w-0 text-[12.5px] leading-snug text-ink-soft">
        {pic.at === "looking"
          ? `Looking for the product's picture on ${domainOf(pic.for)}…`
          : shownUrl && broken === shownUrl
            ? "That picture doesn't open here. Paste another picture's link, or remove it."
            : pic.at === "set"
              ? pic.source === "page"
                ? `The product's picture, from ${domainOf(link) || "its page"}.`
                : `A picture from ${domainOf(pic.url)}.`
              : pic.at === "off"
                ? "No picture."
                : pic.missed
                  ? "No picture on that page. Paste a picture's link if you have one."
                  : link
                    ? "The product's picture shows up here."
                    : "Add the product's link and its picture shows up here."}
      </p>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {link && pic.at !== "looking" && !(pic.at === "set" && pic.source === "page" && broken !== shownUrl) && (
          <button type="button" onClick={onLook} className={`${SMALL} inline-flex items-center gap-1`} title="Look on the product's page again">
            <RetryIcon className="w-3.5 h-3.5" />
            {pic.at === "set" ? "From the page" : "Find it"}
          </button>
        )}
        {pic.at !== "looking" && (
          <button
            type="button"
            onClick={() => {
              setPasting(true);
              setWrong(null);
            }}
            className={SMALL}
          >
            {pic.at === "set" ? "Use another" : "Paste a link"}
          </button>
        )}
        {pic.at === "set" && (
          <button type="button" onClick={onRemove} aria-label="Remove the picture" title="Remove the picture" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** A video's picture in the list (16:9), or its kind's icon. */
function VideoThumb({ src, kind, className = "w-16" }: { src: string | null; kind: VideoKind; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = kind === "short" ? ShortsIcon : VideoIcon;
  return (
    <span className={`${className} aspect-video rounded-md overflow-hidden flex-shrink-0 bg-surface-2 flex items-center justify-center`}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <Icon className={`w-4 h-4 ${kind === "short" ? "text-short" : "text-long"}`} />
      )}
    </span>
  );
}

const SHOWN_AT_ONCE = 80;

/**
 * The long video (or the Short) for the sponsorship: the one picked, or a button that opens a searchable list right
 * here (no popup over the window). The list is the team's own videos and every video on the team's YouTube channel
 * (1.57.0), newest first, asked for the first time it opens; found by title, #number, or a pasted YouTube link.
 */
function VideoField({ kind, value, onChange }: { kind: VideoKind; value: Picked | null; onChange: (v: Picked | null) => void }) {
  const ctx = useAffiliates()!;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const Icon = kind === "short" ? ShortsIcon : VideoIcon;
  const what = kind === "short" ? "Short" : "long video";
  const list = ctx.videoList;
  const load = ctx.loadVideos;

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => search.current?.focus());
    if (list) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [open, list, load]);

  const choices = useMemo(() => (list?.videos ?? []).filter((v) => v.kind === kind), [list, kind]);
  const { shown, total } = useMemo(() => {
    const raw = q.trim();
    if (!raw) return { shown: choices.slice(0, SHOWN_AT_ONCE), total: choices.length };
    // A pasted YouTube link (or its id) finds that video; anything else is looked for in the titles and numbers.
    const yt = /youtu/i.test(raw) ? youtubeIdOf(raw) : YOUTUBE_ID.test(raw) && choices.some((c) => c.youtubeId === raw) ? raw : null;
    const t = raw.toLowerCase().replace(/^#/, "");
    const hit = yt ? choices.filter((c) => c.youtubeId === yt) : choices.filter((c) => c.title.toLowerCase().includes(t) || (c.number !== null && String(c.number).startsWith(t)));
    return { shown: hit.slice(0, SHOWN_AT_ONCE), total: hit.length };
  }, [choices, q]);

  const close = () => {
    setOpen(false);
    setQ("");
  };
  const pick = (c: VideoChoice) => {
    onChange(pickedFrom(c));
    close();
  };

  if (value && !open)
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-line/15 bg-surface pl-1.5 pr-1.5 py-1.5">
        <VideoThumb src={value.thumb} kind={kind} className="w-[72px]" />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            {value.number !== null && <span className="font-mono text-[11.5px] text-ink-faint tabular-nums">#{value.number}</span>}
            <span className="truncate text-[13.5px] font-semibold">{value.title}</span>
          </span>
          <span className="flex items-center gap-1 text-[11.5px] text-ink-faint">
            <Icon className={`w-3 h-3 flex-shrink-0 ${kind === "short" ? "text-short" : "text-long"}`} />
            <span className="truncate">{value.stageLabel || (kind === "short" ? "Short" : "Long video")}</span>
          </span>
        </span>
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
        className="w-full flex items-center gap-2 rounded-xl border border-dashed border-line/25 px-3 h-11 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 hover:bg-surface-2/60"
      >
        <PlusIcon className="w-4 h-4" />
        <Icon className={`w-4 h-4 ${kind === "short" ? "text-short" : "text-long"}`} />
        {`Link a ${what}`}
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
              close();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (shown[0]) pick(shown[0]);
            }
          }}
          placeholder={`Find a ${what}: its title, #number or YouTube link`}
          aria-label={`Find a ${what}`}
          aria-controls={listId}
          className="flex-1 min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint/70"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" onClick={close} className="rounded-lg px-2 h-8 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Cancel
        </button>
      </div>
      <ul id={listId} role="listbox" aria-label={kind === "short" ? "Shorts" : "Long videos"} aria-busy={loading} className="max-h-72 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll p-1">
        {loading && !list
          ? [0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-2.5 px-2.5 h-14" aria-hidden>
                <span className="w-16 aspect-video rounded-md bg-surface-2 animate-pulse" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3 w-3/4 rounded bg-surface-2 animate-pulse" />
                  <span className="block h-2.5 w-1/3 rounded bg-surface-2 animate-pulse" />
                </span>
              </li>
            ))
          : null}
        {!loading && !list && (
          <li className="px-3 py-3 text-[12.5px] text-ink-faint">
            Couldn&rsquo;t get the videos.{" "}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void load().finally(() => setLoading(false));
              }}
              className="font-semibold text-amber hover:underline"
            >
              Try again
            </button>
          </li>
        )}
        {list && shown.length === 0 && <li className="px-3 py-3 text-[12.5px] text-ink-faint">{q.trim() ? "Nothing called that." : `No ${what}s yet.`}</li>}
        {shown.map((c) => {
          const on = !!value && value.source === c.source && value.id === c.id;
          return (
            <li key={`${c.source}:${c.id}`} role="option" aria-selected={on}>
              <button
                type="button"
                onClick={() => pick(c)}
                className={`w-full flex items-center gap-2.5 text-left rounded-lg px-2 py-1.5 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${on ? "bg-amber/10" : ""}`}
              >
                <VideoThumb src={choiceThumb(c)} kind={kind} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {c.number !== null && <span className="font-mono text-[11px] text-ink-faint tabular-nums">#{c.number}</span>}
                    <span className="truncate text-[13px] font-semibold">{c.title}</span>
                  </span>
                  {/* When it went up; a video not out yet: when it was added here. */}
                  <span className="block truncate text-[11.5px] text-ink-faint">{[c.stageLabel, c.date ? `${c.posted ? "" : "added "}${dayText(c.date)}` : null].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          );
        })}
        {list && total > shown.length && (
          <li className="px-3 py-2 text-[11.5px] text-ink-faint">
            The newest {shown.length} of {total.toLocaleString("en-US")}{q.trim() ? " that match" : ""}. Type to find the others.
          </li>
        )}
      </ul>
      {list && !list.channel && (
        <p className="px-3 py-2 border-t border-line/10 text-[11.5px] leading-snug text-ink-faint">
          Only the team&rsquo;s own videos are here. Connect the YouTube channel (Team → Connected accounts) to find every video posted on it.
        </p>
      )}
    </div>
  );
}
