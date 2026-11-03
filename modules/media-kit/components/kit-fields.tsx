"use client";

import { useId, useRef, useState } from "react";
import { ChevronDownIcon, CloseIcon, PhotoIcon, PlusIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { AnyPlatformIcon } from "@/components/ui/platform-icons";
import { KIT_CURRENCIES, KIT_PLATFORMS, KIT_PLATFORM_NAME, LIMITS, newId, type KitBrand, type KitBrandsShow, type KitTitle, type MediaKitSettings, type RatePackage } from "../lib/settings";

/*
 * The media kit builder's form parts (1.37.0): labelled fields with a character count, and the editors for the rates
 * and the brands. (1.39.0: the parts themselves are kit-sections.tsx. 1.44.0: the brands with their logos and quotes,
 * a page's own title, a switch.)
 */

export const inputClass =
  "w-full rounded-xl border border-line/15 bg-surface px-3.5 py-2.5 text-[14px] outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-amber transition-shadow disabled:opacity-60";

/** A label above its control, an optional hint or problem under it. */
export function Field({ label, hint, problem, children, htmlFor, aside }: { label: string; hint?: string; problem?: string | null; children: React.ReactNode; htmlFor?: string; aside?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-ink-soft">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {problem ? <p className="text-[12px] text-coral mt-1">{problem}</p> : hint ? <p className="text-[12px] text-ink-faint mt-1">{hint}</p> : null}
    </div>
  );
}

const count = (s: string) => Array.from(s).length;
/** "112 / 160" when it's getting close. */
function Counter({ value, max }: { value: string; max: number }) {
  const n = count(value);
  if (n < max * 0.7) return null;
  return <span className={`text-[11px] tabular-nums ${n >= max ? "text-coral" : "text-ink-faint"}`}>{`${n} / ${max}`}</span>;
}

export function TextField({ label, value, onChange, max, placeholder, hint, problem, disabled, type = "text", inputMode }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; hint?: string; problem?: string | null; disabled?: boolean; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} problem={problem} htmlFor={id} aside={<Counter value={value} max={max} />}>
      <input id={id} type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(Array.from(e.target.value).slice(0, max).join(""))} placeholder={placeholder} disabled={disabled} className={inputClass} aria-invalid={problem ? true : undefined} />
    </Field>
  );
}

export function TextArea({ label, value, onChange, max, placeholder, hint, rows = 3, disabled }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; hint?: string; rows?: number; disabled?: boolean }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} aside={<Counter value={value} max={max} />}>
      <textarea id={id} value={value} onChange={(e) => onChange(Array.from(e.target.value).slice(0, max).join(""))} placeholder={placeholder} rows={rows} disabled={disabled} className={`${inputClass} resize-y leading-relaxed`} />
    </Field>
  );
}

// ---- Rates ------------------------------------------------------------------------------------------------------------

// 1.41.0: any platform shows them all, two by two (as the kit draws it).
const PLATFORM_OPTIONS = [{ value: "any", label: "Any platform", icon: <AnyPlatformIcon className="w-4 h-4" /> }, ...KIT_PLATFORMS.map((p) => ({ value: p, label: KIT_PLATFORM_NAME[p], icon: <PlatformIcon platform={p} className="w-4 h-4" /> }))];
export const CURRENCY_OPTIONS = KIT_CURRENCIES.map((c) => ({ value: c, label: c }));

export function RatesEditor({
  rates,
  onChange,
  disabled,
  where,
}: {
  rates: MediaKitSettings["rates"];
  onChange: (r: MediaKitSettings["rates"]) => void;
  disabled?: boolean;
  /** 1.41.0: which kit a package shows in (one kit per platform), said under it; null: nothing to say. */
  where?: (p: RatePackage) => string | null;
}) {
  const set = (packages: RatePackage[]) => onChange({ ...rates, packages });
  const edit = (id: string, patch: Partial<RatePackage>) => set(rates.packages.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const move = (i: number, by: -1 | 1) => {
    const list = [...rates.packages];
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set(list);
  };
  return (
    <div className="space-y-3">
      {rates.packages.map((p, i) => (
        <div key={p.id} className="rounded-xl border border-line/12 bg-surface-2/40 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              value={p.name}
              onChange={(e) => edit(p.id, { name: Array.from(e.target.value).slice(0, LIMITS.packageName).join("") })}
              placeholder="Package, e.g. Integration"
              aria-label="Package name"
              disabled={disabled}
              className={`${inputClass} font-semibold py-2`}
            />
            <div className="flex items-center flex-shrink-0">
              <button type="button" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label={`Move ${p.name || "this package"} up`} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30">
                <ChevronDownIcon className="w-4 h-4 rotate-180" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={disabled || i === rates.packages.length - 1} aria-label={`Move ${p.name || "this package"} down`} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30">
                <ChevronDownIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => set(rates.packages.filter((x) => x.id !== p.id))} disabled={disabled} aria-label={`Remove ${p.name || "this package"}`} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-soft hover:text-coral hover:bg-surface-2 disabled:opacity-30">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <input
            value={p.detail}
            onChange={(e) => edit(p.id, { detail: Array.from(e.target.value).slice(0, LIMITS.packageDetail).join("") })}
            placeholder="What it is, e.g. 60 to 90 seconds inside a video"
            aria-label="What the package is"
            disabled={disabled}
            className={`${inputClass} py-2 text-[13px]`}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-44 max-w-full">
              <Select value={p.platform} onChange={(v) => edit(p.id, { platform: (v as RatePackage["platform"]) ?? "any" })} options={PLATFORM_OPTIONS} ariaLabel="Which platform" disabled={disabled} />
            </div>
            {rates.show && (
              <label className="flex items-center gap-2 flex-1 min-w-[10rem]">
                <span className="text-[12.5px] font-semibold text-ink-soft flex-shrink-0">{rates.currency}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={LIMITS.price}
                  step="any"
                  value={p.price ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    edit(p.id, { price: v === null || !Number.isFinite(v) || v < 0 ? null : Math.min(LIMITS.price, v) });
                  }}
                  placeholder="On request"
                  aria-label={`Price of ${p.name || "this package"} in ${rates.currency}`}
                  disabled={disabled}
                  className={`${inputClass} py-2 tabular-nums`}
                />
              </label>
            )}
          </div>
          {where?.(p) && <p className="text-[11.5px] text-ink-faint -mt-1">{where(p)}</p>}
        </div>
      ))}
      {rates.packages.length < LIMITS.packages && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => set([...rates.packages, { id: newId(), name: "", detail: "", platform: "any", price: null }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line/25 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/45 disabled:opacity-50"
        >
          <PlusIcon className="w-4 h-4" />
          Add a package
        </button>
      )}
    </div>
  );
}

// ---- 1.44.0: switches and the pages' own titles ------------------------------------------------------------------------

/** A small on/off switch, its words beside it (the look of a page's In the kit / Left out). */
export function Toggle({ on, onChange, label, children, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; children?: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg pl-2 pr-1.5 h-8 -mr-1.5 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2/70 transition-colors disabled:opacity-50"
    >
      {children && <span>{children}</span>}
      <span className={`relative w-8 h-[18px] rounded-[6px] flex-shrink-0 transition-colors ${on ? "bg-amber" : "bg-line/20"}`}>
        <span className={`absolute top-[3px] w-3 h-3 rounded-[4px] bg-white transition-all ${on ? "left-[17px]" : "left-[3px]"}`} />
      </span>
    </button>
  );
}

/**
 * A page's title: its usual one, or its own (the switch). The owner: "for each page i want to be able to modify the
 * title of the page with a custom one, make that a toggle too". Switched on the first time, it starts from the usual
 * title. `lines` (the cover): a box of lines kept as they're broken ("a text box for the title that will respect where
 * i put it"), up to four.
 */
export function TitleField({ value, usual, start, onChange, lines = false, label = "Page title" }: { value: KitTitle | undefined; usual: string; start?: string; onChange: (t: KitTitle) => void; lines?: boolean; label?: string }) {
  const id = useId();
  const box = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const on = !!value?.on;
  const text = value?.text ?? "";
  const max = lines ? LIMITS.title : LIMITS.pageTitle;
  const switchTo = (next: boolean) => {
    onChange({ on: next, text: next && !text.trim() ? (start ?? usual) : text });
    if (next) requestAnimationFrame(() => box.current?.focus());
  };
  const typed = (v: string) => onChange({ on: true, text: Array.from(lines ? v.split("\n").slice(0, LIMITS.coverLines).join("\n") : v.replace(/\n/g, " ")).slice(0, max).join("") });
  const rows = Math.min(LIMITS.coverLines, Math.max(2, text.split("\n").length));
  return (
    <div>
      <div className="flex items-center gap-3 min-h-8">
        <label htmlFor={on ? id : undefined} className="text-[12.5px] font-semibold text-ink-soft flex-shrink-0">
          {label}
        </label>
        <span className="flex-1 min-w-0 truncate text-[12.5px] text-ink-faint" title={on ? undefined : usual}>
          {on ? null : usual}
        </span>
        <Toggle on={on} onChange={switchTo} label={`${label}: your own`}>
          Custom
        </Toggle>
      </div>
      {on && (
        <div className="mt-1.5">
          {lines ? (
            <textarea
              id={id}
              ref={(el) => {
                box.current = el;
              }}
              value={text}
              onChange={(e) => typed(e.target.value)}
              rows={rows}
              placeholder={start ?? usual}
              className={`${inputClass} resize-none leading-snug font-semibold`}
            />
          ) : (
            <input
              id={id}
              ref={(el) => {
                box.current = el;
              }}
              value={text}
              onChange={(e) => typed(e.target.value)}
              placeholder={usual}
              className={`${inputClass} py-2 font-semibold`}
            />
          )}
          <div className="flex items-start justify-between gap-3 mt-1">
            <p className="text-[12px] text-ink-faint">{lines ? "Each line as you break it, as big as fits. Up to four lines." : text.trim() ? "On the page instead of its usual title." : "Empty: the page keeps its usual title."}</p>
            <Counter value={text} max={max} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- 1.44.0: brands ---------------------------------------------------------------------------------------------------
// The owner: "for the quotes page … groups, i want a logo, the name of the company, and the quote below it … or you
// should just be able to hit brand logos only and add like a lot of logos in a cool way without the names, just the logos."

export type BrandLogos = {
  /** Each stored logo's link, by its path. */
  urls: Record<string, string>;
  /** The brands whose logo is going up. */
  busy: ReadonlySet<string>;
  /** Pictures as logos: one for a brand, or several, a new brand each. */
  add: (files: File[], brandId?: string) => void;
};

const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const pictures = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

/** A brand's logo in the form: the picture (on white, as in the kit) or a place to add one; a click picks a file. */
function LogoSlot({ brand, url, busy, onPick, onRemove, disabled }: { brand: KitBrand; url: string | null; busy: boolean; onPick: (f: File) => void; onRemove: () => void; disabled?: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const what = brand.name || "this brand";
  return (
    <div className="relative group/logo flex-shrink-0">
      <button
        type="button"
        onClick={() => file.current?.click()}
        disabled={disabled || busy}
        aria-label={url ? `Change ${what}'s logo` : `Add ${what}'s logo`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) (e.preventDefault(), e.stopPropagation(), setOver(true));
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const f = pictures(e.dataTransfer.files)[0];
          setOver(false);
          if (!f) return;
          e.preventDefault();
          e.stopPropagation();
          onPick(f);
        }}
        className={`relative w-[4.5rem] h-10 rounded-lg border overflow-hidden flex items-center justify-center transition-colors ${url ? "bg-white border-line/15" : "border-dashed border-line/30 text-ink-faint hover:text-ink hover:border-line/50"} ${over ? "ring-2 ring-amber" : ""}`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-w-[calc(100%-10px)] max-h-[calc(100%-8px)] object-contain" />
        ) : (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold">
            <PhotoIcon className="w-3.5 h-3.5" />
            Logo
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-surface/70" aria-hidden>
            <span className="w-4 h-4 rounded-full border-2 border-amber/30 border-t-amber animate-spin" />
          </span>
        )}
      </button>
      {url && !busy && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${what}'s logo`}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface border border-line/20 shadow-sm inline-flex items-center justify-center text-ink-soft hover:text-coral opacity-0 group-hover/logo:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <CloseIcon className="w-3 h-3" />
        </button>
      )}
      <input ref={file} type="file" accept={LOGO_ACCEPT} className="hidden" onChange={(e) => (pictures(e.target.files)[0] && onPick(pictures(e.target.files)[0]), (e.target.value = ""))} />
    </div>
  );
}

/**
 * The brands: one list, each with its logo, its name, and (with quotes) what they said and who said it, in the kit's
 * order. "Add logos" (or pictures dropped here) adds a brand for each picture, named from its file.
 */
export function BrandsEditor({ brands, show, onChange, logos, disabled }: { brands: KitBrand[]; show: KitBrandsShow; onChange: (b: KitBrand[]) => void; logos: BrandLogos; disabled?: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const edit = (id: string, patch: Partial<KitBrand>) => onChange(brands.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const move = (i: number, by: -1 | 1) => {
    const list = [...brands];
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange(list);
  };
  const full = brands.length >= LIMITS.brands;
  const quotes = show === "quotes";
  const btn = "inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-[13px] font-semibold disabled:opacity-50";
  return (
    <div
      className={`space-y-2.5 rounded-xl transition-shadow ${over ? "ring-2 ring-amber ring-offset-4 ring-offset-surface" : ""}`}
      onDragOver={(e) => {
        if (!disabled && !full && e.dataTransfer.types.includes("Files")) (e.preventDefault(), setOver(true));
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const fs = pictures(e.dataTransfer.files);
        if (!fs.length) return;
        e.preventDefault();
        logos.add(fs);
      }}
    >
      {brands.length > 0 && (
        <ul className="space-y-2">
          {brands.map((b, i) => {
            const url = b.logo ? (logos.urls[b.logo] ?? null) : null;
            const what = b.name || `brand ${i + 1}`;
            const unseen = quotes ? !b.quote.trim() : !url && !b.name.trim() && !logos.busy.has(b.id);
            return (
              <li key={b.id} className={`rounded-xl border border-line/12 bg-surface-2/40 p-2.5 ${quotes ? "space-y-2" : ""}`}>
                <div className="flex items-center gap-2">
                  <LogoSlot brand={b} url={url} busy={logos.busy.has(b.id)} onPick={(f) => logos.add([f], b.id)} onRemove={() => edit(b.id, { logo: null })} disabled={disabled} />
                  <input
                    value={b.name}
                    onChange={(e) => edit(b.id, { name: Array.from(e.target.value).slice(0, LIMITS.brandName).join("") })}
                    placeholder="Brand name"
                    aria-label={`Brand ${i + 1}'s name`}
                    disabled={disabled}
                    className={`${inputClass} py-2 font-semibold min-w-0`}
                  />
                  <div className="flex items-center flex-shrink-0">
                    <button type="button" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label={`Move ${what} up`} className="w-7 h-8 inline-flex items-center justify-center rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30">
                      <ChevronDownIcon className="w-4 h-4 rotate-180" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={disabled || i === brands.length - 1} aria-label={`Move ${what} down`} className="w-7 h-8 inline-flex items-center justify-center rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30">
                      <ChevronDownIcon className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => onChange(brands.filter((x) => x.id !== b.id))} disabled={disabled} aria-label={`Remove ${what}`} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-soft hover:text-coral hover:bg-surface-2 disabled:opacity-30">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {quotes && (
                  <>
                    <textarea
                      value={b.quote}
                      onChange={(e) => edit(b.id, { quote: Array.from(e.target.value).slice(0, LIMITS.quote).join("") })}
                      placeholder="What they said, e.g. Their audience actually buys what they recommend."
                      aria-label={`What ${what} said`}
                      rows={2}
                      disabled={disabled}
                      className={`${inputClass} resize-y py-2 text-[13.5px]`}
                    />
                    <input
                      value={b.by}
                      onChange={(e) => edit(b.id, { by: Array.from(e.target.value).slice(0, LIMITS.by).join("") })}
                      placeholder="Who said it, e.g. Mara Ionescu, Head of Partnerships"
                      aria-label={`Who at ${what} said it`}
                      disabled={disabled}
                      className={`${inputClass} py-2 text-[13px]`}
                    />
                  </>
                )}
                {unseen && <p className={`text-[11.5px] text-ink-faint ${quotes ? "" : "mt-1.5"}`}>{quotes ? "Not on the page until it has a quote." : "Not on the wall until it has a logo or a name."}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" disabled={disabled || full} onClick={() => file.current?.click()} className={`${btn} border-line/15 hover:bg-surface-2`}>
          <UploadIcon className="w-4 h-4" />
          {brands.length ? "Add logos" : "Add brand logos"}
        </button>
        <button type="button" disabled={disabled || full} onClick={() => onChange([...brands, { id: newId(), name: "", logo: null, quote: "", by: "" }])} className={`${btn} border-dashed border-line/25 text-ink-soft hover:text-ink hover:border-line/45`}>
          <PlusIcon className="w-4 h-4" />
          Add a brand
        </button>
        <span className="text-[12px] text-ink-faint ml-auto tabular-nums">{full ? `${LIMITS.brands} of ${LIMITS.brands}: the most a kit shows` : brands.length ? `${brands.length} of ${LIMITS.brands}` : null}</span>
        <input ref={file} type="file" accept={LOGO_ACCEPT} multiple className="hidden" onChange={(e) => (logos.add(pictures(e.target.files)), (e.target.value = ""))} />
      </div>
      <p className="text-[12px] text-ink-faint">Pick several logos at once, or drop them here: each becomes a brand, named from its file. PNG, JPG, WebP or SVG; the empty margin round a logo is cut away.</p>
    </div>
  );
}
