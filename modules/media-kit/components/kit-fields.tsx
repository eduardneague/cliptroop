"use client";

import { useId, useState } from "react";
import { ChevronDownIcon, CloseIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { KIT_CURRENCIES, KIT_PLATFORMS, KIT_PLATFORM_NAME, LIMITS, newId, type MediaKitSettings, type RatePackage, type Testimonial } from "../lib/settings";

/*
 * The media kit builder's form parts (1.37.0): a section card, labelled fields with a character count, and the
 * editors for the rates, the brands and the kind words.
 */

export const inputClass =
  "w-full rounded-xl border border-line/15 bg-surface px-3.5 py-2.5 text-[14px] outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-amber transition-shadow disabled:opacity-60";

export function Section({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-[15px] font-bold">{title}</h2>
        {hint && <p className="text-[12.5px] text-ink-soft mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

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

/** An on/off row (a page of the kit). */
export function Toggle({ label, hint, on, onChange, disabled }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2/70 transition-colors disabled:opacity-50"
    >
      <span className={`relative w-8 h-[18px] rounded-[6px] flex-shrink-0 transition-colors ${on ? "bg-amber" : "bg-line/20"}`}>
        <span className={`absolute top-[3px] w-3 h-3 rounded-[4px] bg-white transition-all ${on ? "left-[17px]" : "left-[3px]"}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold">{label}</span>
        {hint && <span className="block text-[12px] text-ink-faint">{hint}</span>}
      </span>
    </button>
  );
}

// ---- Rates ------------------------------------------------------------------------------------------------------------

const PLATFORM_OPTIONS = [{ value: "any", label: "Any platform" }, ...KIT_PLATFORMS.map((p) => ({ value: p, label: KIT_PLATFORM_NAME[p], icon: <PlatformIcon platform={p} className="w-4 h-4" /> }))];
export const CURRENCY_OPTIONS = KIT_CURRENCIES.map((c) => ({ value: c, label: c }));

export function RatesEditor({ rates, onChange, disabled }: { rates: MediaKitSettings["rates"]; onChange: (r: MediaKitSettings["rates"]) => void; disabled?: boolean }) {
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

// ---- Brands -----------------------------------------------------------------------------------------------------------

export function PartnersEditor({ partners, onChange, disabled }: { partners: string[]; onChange: (p: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const add = (raw: string) => {
    const names = raw
      .split(/[,\n]/)
      .map((x) => x.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .map((x) => Array.from(x).slice(0, LIMITS.partner).join(""));
    if (!names.length) return;
    const have = new Set(partners.map((x) => x.toLowerCase()));
    const next = [...partners];
    for (const n of names) if (!have.has(n.toLowerCase()) && next.length < LIMITS.partners) (next.push(n), have.add(n.toLowerCase()));
    onChange(next);
    setDraft("");
  };
  const full = partners.length >= LIMITS.partners;
  return (
    <Field label="Brands you've worked with" hint={full ? `That's the most a kit shows (${LIMITS.partners}).` : "Type a name and press Enter. Paste a list with commas to add several."} htmlFor={id}>
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (/[,\n]/.test(t)) {
              e.preventDefault();
              add(t);
            }
          }}
          placeholder="e.g. GoPro"
          disabled={disabled || full}
          className={inputClass}
        />
        <button type="button" onClick={() => add(draft)} disabled={disabled || full || !draft.trim()} className="rounded-xl border border-line/15 px-4 text-[13px] font-semibold hover:bg-surface-2 disabled:opacity-40 flex-shrink-0">
          Add
        </button>
      </div>
      {partners.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-2.5">
          {partners.map((p) => (
            <li key={p} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 pl-2.5 pr-1 h-8 text-[13px] font-semibold">
              {p}
              <button type="button" onClick={() => onChange(partners.filter((x) => x !== p))} disabled={disabled} aria-label={`Remove ${p}`} className="w-6 h-6 inline-flex items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-line/10">
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

export function QuotesEditor({ quotes, onChange, disabled }: { quotes: Testimonial[]; onChange: (q: Testimonial[]) => void; disabled?: boolean }) {
  const edit = (id: string, patch: Partial<Testimonial>) => onChange(quotes.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] font-semibold text-ink-soft">What brands said about working with you</p>
      {quotes.map((q, i) => (
        <div key={q.id} className="rounded-xl border border-line/12 bg-surface-2/40 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <textarea
              value={q.quote}
              onChange={(e) => edit(q.id, { quote: Array.from(e.target.value).slice(0, LIMITS.quote).join("") })}
              placeholder="“Their audience actually buys what they recommend.”"
              aria-label={`Quote ${i + 1}`}
              rows={2}
              disabled={disabled}
              className={`${inputClass} resize-y py-2 text-[13.5px]`}
            />
            <button type="button" onClick={() => onChange(quotes.filter((x) => x.id !== q.id))} disabled={disabled} aria-label={`Remove quote ${i + 1}`} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-soft hover:text-coral hover:bg-surface-2 flex-shrink-0">
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
          <input
            value={q.by}
            onChange={(e) => edit(q.id, { by: Array.from(e.target.value).slice(0, LIMITS.by).join("") })}
            placeholder="Who said it, e.g. Mara Ionescu, Komoot"
            aria-label={`Who said quote ${i + 1}`}
            disabled={disabled}
            className={`${inputClass} py-2 text-[13px]`}
          />
        </div>
      ))}
      {quotes.length < LIMITS.testimonials && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...quotes, { id: newId(), quote: "", by: "" }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line/25 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/45 disabled:opacity-50"
        >
          <PlusIcon className="w-4 h-4" />
          Add a quote
        </button>
      )}
    </div>
  );
}
