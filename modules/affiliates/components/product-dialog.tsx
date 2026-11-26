"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Select, type SelectOption } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import { wordColor } from "@/lib/word-color";
import { CheckIcon, CloseIcon, ImageIcon, PlusIcon, RetryIcon, SearchIcon, ShortsIcon, VideoIcon } from "@/components/ui/icons";
import { findProductPicture, saveProduct } from "@/app/(dashboard)/sponsorships/actions";
import {
  AFFILIATE_STATUSES,
  choiceThumb,
  cleanProduct,
  DEAL_KINDS,
  domainOf,
  KIND_COLOR,
  KIND_HINT,
  KIND_LABEL,
  LIMITS,
  normalizePicture,
  normalizeUrl,
  pctField,
  smallPicture,
  STATUS_LABEL,
  YOUTUBE_ID,
  youtubeIdOf,
  type AffiliateStatus,
  type DealKind,
  type LinkedVideo,
  type PictureChange,
  type PictureSource,
  type Product,
  type VideoChoice,
  type VideoKind,
  type VideoSource,
} from "../lib/rules";
import { useAffiliates } from "./affiliates-context";
import { CompanyMark } from "./brand-mark";
import { PercentField } from "./percent-field";

/*
 * Adding or changing a product of a company (1.58.0; a sponsorship's own fields before): its company (another one of
 * the team's moves it), its name, what kind of deal (affiliate, review, paid, one or more), the product link and its
 * picture (found on the product's page as soon as the link is typed; another picture's link, or none), the code it
 * goes by (the owner: "click a button and use the regular company one or have the option to add a custom one"),
 * whether it's on, the long video and the Short made about it (the team's own or any video on the channel, picked from
 * a list), and notes. The company's code, platform and login are the company's window's.
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

export function ProductDialog({ product, companyId, onClose, onSaved }: { product: Product | null; companyId: string; onClose: () => void; onSaved: (id: string, companyId: string) => void }) {
  const ctx = useAffiliates()!;
  const toast = useToast();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [company, setCompany] = useState(product?.companyId ?? companyId);
  const [name, setName] = useState(product?.name ?? "");
  const [kinds, setKinds] = useState<DealKind[]>(product?.kinds ?? ctx.newKinds);
  const [productUrl, setProductUrl] = useState(product?.productUrl ?? "");
  const [ownCode, setOwnCode] = useState(product?.ownCode ?? false);
  const [code, setCode] = useState(product?.code ?? "");
  const [percentage, setPercentage] = useState(pctField(product?.percentage));
  const [status, setStatus] = useState<AffiliateStatus>(product?.status ?? "active");
  const [notes, setNotes] = useState(product?.notes ?? "");
  const [longPick, setLongPick] = useState<Picked | null>(pickedOf(product?.long ?? null));
  const [shortPick, setShortPick] = useState<Picked | null>(pickedOf(product?.short ?? null));
  // The picture: as it's kept, until something here changes it (then it's sent).
  const [pic, setPic] = useState<Pic>(product?.picture ? { at: "set", ...product.picture } : product?.pictureOff ? { at: "off" } : { at: "none" });
  const [picTouched, setPicTouched] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const companies = useMemo(() => [...ctx.companies].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true })), [ctx.companies]);
  const theCompany = ctx.companies.find((c) => c.id === company) ?? null;
  const was = product ? ctx.companies.find((c) => c.id === product.companyId) ?? null : null;
  // 1.60.0 (the owner, of the browser's own list: "this needs to be changed with a better dropdown"): the app's, each
  // company with its picture or initial and its code and deal under its name; a search box once there are many.
  const companyChoices: SelectOption[] = useMemo(
    () =>
      companies.map((c) => ({
        value: c.id,
        label: c.name,
        hint: [c.code, c.percentage].filter(Boolean).join(" · ") || undefined,
        icon: <CompanyMark company={{ id: c.id, name: c.name, picture: c.picture }} className="w-6 h-6 text-[11px]" px={24} />,
      })),
    [companies]
  );

  useEffect(() => {
    const t = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  // Each new product link: its page is asked for the product's picture (a pasted picture, or none on purpose, stays).
  const link = normalizeUrl(productUrl);
  const lookedFor = useRef<string | null>(product?.productUrl ?? null);
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
    if (pic.at === "set" && (picTouched || !product)) return { url: pic.url, source: pic.source };
    if (!picTouched) return product ? "keep" : "auto";
    return pic.at === "off" ? "off" : "auto";
  };
  const fields = {
    companyId: company,
    name,
    kinds,
    status,
    productUrl,
    ownCode,
    code,
    percentage,
    notes,
    projectId: longPick?.source === "team" ? longPick.id : null,
    longYoutubeId: longPick?.source === "channel" ? longPick.id : null,
    shortId: shortPick?.source === "team" ? shortPick.id : null,
    shortYoutubeId: shortPick?.source === "channel" ? shortPick.id : null,
  };

  // Verified, and saving changes the link or the code it goes by: the mark goes (the database takes it off).
  const goesBy = (own: boolean, c: string, co: { code: string | null } | null) => (own ? c.trim() || null : co?.code ?? null);
  const unverifies =
    !!product?.check &&
    ((typeof link === "string" ? link : null) !== product.productUrl || goesBy(ownCode, code, theCompany) !== goesBy(product.ownCode, product.code ?? "", was));

  async function submit() {
    if (pending) return;
    const sending = { ...fields, picture: pictureChange() };
    const checked = cleanProduct(sending);
    if ("error" in checked) return setProblem(checked.error);
    setPending(true);
    setProblem(null);
    try {
      const r = await saveProduct(ctx.teamId, sending, product?.id ?? null);
      if (r.error !== undefined) return void setProblem(r.error);
      toast.success(product ? `${checked.ok.name} saved` : `${checked.ok.name} added${theCompany ? ` to ${theCompany.name}` : ""}`);
      onSaved(r.id, checked.ok.companyId);
    } catch {
      setProblem("Couldn't save it. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const companyDeal = theCompany ? [theCompany.code, theCompany.percentage].filter(Boolean).join(" · ") : "";

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      width="sm:max-w-xl"
      title={product ? `Edit ${product.name}` : theCompany ? `New product for ${theCompany.name}` : "New product"}
      description={product ? undefined : "What the video is about: its link and picture, the kind of deal, and the code it goes by."}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={pending} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
            {product ? "Cancel" : "Not now"}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || !name.trim() || !theCompany}
            className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-45"
          >
            {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
            {pending ? "Saving…" : product ? "Save" : "Add product"}
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
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
          <div className="min-w-0">
            <label htmlFor={`${id}-company`} className={LABEL}>
              Company
            </label>
            <Select
              id={`${id}-company`}
              value={theCompany ? company : null}
              onChange={(v) => v && setCompany(v)}
              options={companyChoices}
              placeholder="Pick its company"
              searchable={companies.length > 7}
              menuMinWidth={260}
              className="!h-11 !rounded-xl !px-3.5"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-name`} className={LABEL}>
              Product
            </label>
            <input ref={nameRef} id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.name} placeholder="K98 PRO keyboard" className={INPUT} autoComplete="off" />
          </div>
        </div>
        {product && was && company !== product.companyId && theCompany && (
          <p className="-mt-2 text-[12px] text-ink-faint">
            Moves it from {was.name} to {theCompany.name}
            {ownCode ? "." : `: it goes by ${theCompany.name}'s code then.`}
          </p>
        )}
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
                  title={on && kinds.length === 1 ? `${KIND_HINT[k]}. A product is at least one kind.` : KIND_HINT[k]}
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
        {/* The code it goes by: the company's (one place to change it for all of them), or its own. */}
        <fieldset className="min-w-0">
          <legend className={LABEL}>Code</legend>
          <Segmented
            ariaLabel="The code it goes by"
            value={ownCode ? "own" : "company"}
            onChange={(v) => setOwnCode(v === "own")}
            options={[
              { value: "company", label: theCompany ? `${theCompany.name}'s` : "The company's", title: "The company's code and deal: change it there, for all of its products" },
              { value: "own", label: "Its own", title: "A code and a deal for this product only" },
            ]}
          />
          {ownCode ? (
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${id}-code`} className="sr-only">
                  Its code
                </label>
                <input id={`${id}-code`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={LIMITS.code} placeholder={theCompany?.code ? `Not ${theCompany.code}` : "Its code"} className={`${INPUT} font-mono`} autoComplete="off" spellCheck={false} autoCapitalize="off" />
              </div>
              <div>
                <label htmlFor={`${id}-pct`} className="sr-only">
                  Its percentage
                </label>
                <PercentField id={`${id}-pct`} value={percentage} onChange={setPercentage} className={INPUT} />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[12.5px] text-ink-soft">
              {companyDeal ? (
                <>
                  <span className="font-mono font-bold text-ink">{theCompany?.code ?? ""}</span>
                  {theCompany?.code && theCompany.percentage ? " · " : ""}
                  {theCompany?.percentage && <span className="font-bold text-ink">{theCompany.percentage}</span>}
                  {": the company's, for all of its products (change it there)."}
                </>
              ) : (
                "The company has no code yet: add it on the company, or give this one its own."
              )}
            </p>
          )}
        </fieldset>
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
          <label htmlFor={`${id}-notes`} className={LABEL}>
            Notes
          </label>
          <textarea id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={LIMITS.notes} rows={2} placeholder="Colours, when it ships, what they asked for…" className={`${INPUT} h-auto py-2.5 resize-y min-h-[3.25rem]`} />
        </div>
        {unverifies && (
          <p className="rounded-xl bg-amber/10 text-[12.5px] text-ink-soft px-3.5 py-2.5" role="note">
            It&rsquo;s marked {product?.check?.result === "works" ? "Verified" : "Not working"}: another link or code isn&rsquo;t checked yet, so saving takes the mark off.
          </p>
        )}
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
 * The long video (or the Short) for the product: the one picked, or a button that opens a searchable list right
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
