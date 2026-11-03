"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { ArchiveIcon, CheckIcon, LockIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { businessHistory, deleteSource, saveSource, setBusinessAccess, setYear } from "@/app/(dashboard)/business/actions";
import { words } from "../lib/i18n";
import { SOURCE_CATEGORIES, categoryLabel, type Lang, type SourceCategory } from "../lib/kinds";
import { formatDay } from "../lib/money";
import type { BusinessPerson, HistoryRow, Source } from "../lib/types";
import { upsert, useBusiness, useWords, without } from "./context";
import { ProfileForm } from "./profile-form";
import { Badge, Field, Note, Switch, card, field, h2, quiet, secondary } from "./ui";

/*
 * Business (1.42.0): the PFA's details and where its books start; its income sources (a page each in the fiscal
 * register); its years (closed: nothing in them changes until they're reopened; the fiscal register's Rectificare);
 * who else sees it (the owner decides: view, or edit too); and every change, kept.
 */

const W = words({
  pfa: { en: "The PFA", ro: "Datele PFA" },
  sourcesTitle: { en: "Income sources", ro: "Surse de venit" },
  sourcesIntro: {
    en: "The fiscal register keeps a page for each source of income, in its category. Most creators have one. A source that entries use stays; archive it to stop offering it.",
    ro: "Registrul de evidență fiscală are câte o pagină pentru fiecare sursă de venit, în categoria ei. Majoritatea creatorilor au una singură. O sursă folosită de operațiuni rămâne; arhiveaz-o ca să nu mai fie propusă.",
  },
  sourceName: { en: "The source's name", ro: "Denumirea sursei" },
  itsCategory: { en: "Its category", ro: "Categoria de venit" },
  archived: { en: "Archived", ro: "Arhivată" },
  offerAgain: { en: "Offer it again", ro: "Propune-o din nou" },
  archiveIt: { en: "Archive it", ro: "Arhiveaz-o" },
  unarchive: { en: "Unarchive", ro: "Dezarhivează" },
  archive: { en: "Archive", ro: "Arhivează" },
  removeIt: { en: (x: string) => `Remove ${x}`, ro: (x: string) => `Șterge ${x}` },
  removeTitle: { en: (x: string) => `Remove ${x}?`, ro: (x: string) => `Ștergi ${x}?` },
  removeSourceBody: { en: "Only a source no entry uses can go.", ro: "Se poate șterge numai o sursă pe care nu o folosește nicio operațiune." },
  remove: { en: "Remove", ro: "Șterge" },
  cancel: { en: "Cancel", ro: "Renunță" },
  noSources: { en: "None yet: add the first one.", ro: "Niciuna încă: adaug-o pe prima." },
  sourceAdded: { en: "Source added", ro: "Sursă adăugată" },
  newSource: { en: "A new source", ro: "Sursă nouă" },
  // Sources are named in Romanian (they head the fiscal register's pages).
  sourceExample: { en: "Drepturi de autor, Chirie…", ro: "Drepturi de autor, Chirie…" },
  add: { en: "Add", ro: "Adaugă" },
  closeTitle: { en: (y: number) => `Close ${y}?`, ro: (y: number) => `Închizi anul ${y}?` },
  closeBody: {
    en: "Nothing in it changes until it's reopened: its entries, inventories, fiscal register lines, and the fixed assets amortized in it. Mistakes are then corrected by reversing them from an open year.",
    ro: "Nimic din el nu se mai poate modifica până la redeschidere: operațiunile, inventarele, rândurile din registrul de evidență fiscală și mijloacele fixe amortizate în acel an. Greșelile se corectează apoi prin stornare, dintr-un an deschis.",
  },
  closeConfirm: { en: (y: number) => `Close ${y}`, ro: (y: number) => `Închide anul ${y}` },
  reopenTitle: { en: (y: number) => `Reopen ${y}?`, ro: (y: number) => `Redeschizi anul ${y}?` },
  reopenBody: {
    en: "Its lines can change again. If its fiscal register was already handed in, a change makes it a correction (Rectificare).",
    ro: "Rândurile lui se pot modifica din nou. Dacă registrul de evidență fiscală a fost deja întocmit, o modificare îl face rectificativ (Rectificare).",
  },
  reopenConfirm: { en: (y: number) => `Reopen ${y}`, ro: (y: number) => `Redeschide anul ${y}` },
  closedToast: { en: (y: number) => `${y} is closed`, ro: (y: number) => `Anul ${y} este închis` },
  openToast: { en: (y: number) => `${y} is open again`, ro: (y: number) => `Anul ${y} este din nou deschis` },
  yearsTitle: { en: "Years", ro: "Anii" },
  yearsIntro: {
    en: "Close a year once its fiscal register is done: the registers have no erasures (OMFP 170/2015), so a closed year’s mistakes are corrected with a line that reverses them. Rectificare marks a fiscal register that corrects one already handed in.",
    ro: "Închide un an după ce registrul de evidență fiscală este gata: registrele nu admit ștersături (OMFP 170/2015), așa că greșelile dintr-un an închis se corectează prin stornare. „Rectificare” marchează un registru de evidență fiscală care îl corectează pe unul deja întocmit.",
  },
  closed: { en: "Closed", ro: "Închis" },
  closedOn: { en: (d: string) => `Closed on ${d}`, ro: (d: string) => `Închis la ${d}` },
  open: { en: "Open", ro: "Deschis" },
  rectifyAria: { en: (y: number) => `${y}: a correction (Rectificare)`, ro: (y: number) => `${y}: rectificare` },
  reopen: { en: "Reopen", ro: "Redeschide" },
  closeYear: { en: "Close the year", ro: "Închide anul" },
  stopTitle: { en: (n: string) => `Stop ${n} seeing Business?`, ro: (n: string) => `Retragi accesul la Contabilitate pentru ${n}?` },
  stopBody: { en: "The menu item goes for them. Nothing they did is undone.", ro: "Pagina dispare din meniul său. Nimic din ce a făcut nu se anulează." },
  stopConfirm: { en: "Take it away", ro: "Retrage accesul" },
  editTitle: { en: (n: string) => `Let ${n} change the registers?`, ro: (n: string) => `Acorzi drept de editare pentru ${n}?` },
  editBody: {
    en: "They add, change and remove entries, assets and inventories, close and reopen years, and export everything. They get a notification.",
    ro: "Va putea adăuga, modifica și șterge operațiuni, mijloace fixe și inventare, închide și redeschide ani și exporta tot. Primește o notificare.",
  },
  editConfirm: { en: "Let them edit", ro: "Acordă editarea" },
  viewTitle: { en: (n: string) => `Let ${n} see the registers?`, ro: (n: string) => `Acorzi drept de vizualizare pentru ${n}?` },
  viewBody: {
    en: "They see every register and export them, but change nothing. They get a notification.",
    ro: "Va vedea toate registrele și le va putea exporta, dar nu va putea modifica nimic. Primește o notificare.",
  },
  viewConfirm: { en: "Let them see", ro: "Acordă vizualizarea" },
  accessTitle: { en: "Access", ro: "Acces" },
  accessIntro: {
    en: (team: string) => `You always see and change Business. Choose who else on ${team} does: to see it (and export it), or to change it too. Nobody else sees it in their menu.`,
    ro: (team: string) => `Tu vezi și modifici oricând Contabilitatea. Alege cine altcineva din ${team} are acces: doar vizualizare (și export) sau și editare. Ceilalți nu o văd în meniu.`,
  },
  you: { en: " (you)", ro: " (tu)" },
  ownerAll: { en: "Owner: everything", ro: "Proprietar: acces complet" },
  whatCan: { en: (n: string) => `What ${n} can do`, ro: (n: string) => `Ce poate face ${n}` },
  nothing: { en: "Nothing", ro: "Fără acces" },
  see: { en: "See", ro: "Vizualizare" },
  edit: { en: "Edit", ro: "Editare" },
  nobodyElse: { en: "Nobody else is on the team yet.", ro: "Încă nu mai e nimeni în echipă." },
  historyTitle: { en: "History", ro: "Istoric" },
  historyIntro: {
    en: "Every change, kept by the database: who, when, what it was and what it became. Nobody can change it.",
    ro: "Fiecare modificare, păstrată de baza de date: cine, când, ce a fost și ce a devenit. Nimeni nu îl poate modifica.",
  },
  loading: { en: "Loading…", ro: "Se încarcă…" },
  showHistory: { en: "Show the history", ro: "Arată istoricul" },
  someone: { en: "Someone", ro: "Cineva" },
  theApp: { en: "The app", ro: "Aplicația" },
  noChanges: { en: "No changes yet.", ro: "Nicio modificare încă." },
  earlier: { en: "Earlier changes", ro: "Modificări anterioare" },
});

/** The income categories to pick from: in English, with the register's Romanian name under each. */
const categoryOptions = (lang: Lang) => SOURCE_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c, lang), hint: lang === "en" ? categoryLabel(c, "ro") : undefined }));

export function SettingsTab() {
  const b = useBusiness();
  const w = useWords(W);
  return (
    <div className="space-y-4">
      <section className={`${card} p-4 sm:p-6`}>
        <h2 className={`${h2} mb-4`}>{w.pfa}</h2>
        <ProfileForm teamId={b.teamId} profile={b.s.profile} disabled={!b.edit} onSaved={(profile) => b.patch((s) => ({ ...s, profile, setUp: true }))} />
      </section>
      <Sources />
      <Years />
      {b.access === "owner" && b.people && <Access />}
      <History />
    </div>
  );
}

function Sources() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SourceCategory>("independent");
  const [busy, setBusy] = useState<string | null>(null);
  const used = new Set(b.s.entries.map((e) => e.source_id).filter(Boolean));

  async function save(s: Partial<Source>, key: string) {
    setBusy(key);
    try {
      const r = await saveSource(b.teamId, s);
      if (r.error !== undefined) return void toast.error(r.error);
      b.patch((x) => ({ ...x, sources: upsert(x.sources, r.source) }));
      return r.source;
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${card} p-4 sm:p-6`}>
      <h2 className={h2}>{w.sourcesTitle}</h2>
      <p className="mt-1 text-[12.5px] text-ink-soft max-w-2xl">{w.sourcesIntro}</p>
      <ul className="mt-3 rounded-xl border border-line/10 divide-y divide-line/10">
        {b.s.sources.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-2 flex-wrap">
            <input
              className={`${field} flex-1 min-w-[10rem] h-9`}
              defaultValue={s.name}
              disabled={!b.edit}
              aria-label={w.sourceName}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== s.name) void save({ ...s, name: v }, s.id);
              }}
            />
            <div className="w-[17rem] max-w-full">
              <Select
                value={s.category}
                onChange={(v) => v && v !== s.category && void save({ ...s, category: v as SourceCategory }, s.id)}
                options={categoryOptions(b.lang)}
                ariaLabel={w.itsCategory}
                fullWidth
                disabled={!b.edit}
              />
            </div>
            {s.archived && <Badge>{w.archived}</Badge>}
            {b.edit && (
              <>
                <button type="button" className={quiet} disabled={busy === s.id} onClick={() => void save({ ...s, archived: !s.archived }, s.id)} title={s.archived ? w.offerAgain : w.archiveIt}>
                  <ArchiveIcon className="w-3.5 h-3.5" />
                  {s.archived ? w.unarchive : w.archive}
                </button>
                {!used.has(s.id) && (
                  <button
                    type="button"
                    className={`${quiet} hover:text-red`}
                    disabled={busy === s.id}
                    aria-label={w.removeIt(s.name)}
                    onClick={async () => {
                      if (!(await confirm({ title: w.removeTitle(s.name), description: w.removeSourceBody, confirmLabel: w.remove, cancelLabel: w.cancel, danger: true }))) return;
                      const r = await deleteSource(b.teamId, s.id);
                      if (r.error !== undefined) return void toast.error(r.error);
                      b.patch((x) => ({ ...x, sources: without(x.sources, [s.id]) }));
                    }}
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </li>
        ))}
        {!b.s.sources.length && <li className="px-3 py-3 text-[13px] text-ink-soft">{w.noSources}</li>}
      </ul>
      {b.edit && (
        <form
          className="mt-3 flex items-end gap-2 flex-wrap"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const r = await save({ name, category, position: b.s.sources.length }, "new");
            if (r) {
              setName("");
              toast.success(w.sourceAdded);
            }
          }}
        >
          <Field label={w.newSource} className="flex-1 min-w-[12rem]">
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={w.sourceExample} />
          </Field>
          <div className="w-[17rem] max-w-full">
            <Select value={category} onChange={(v) => v && setCategory(v as SourceCategory)} options={categoryOptions(b.lang)} ariaLabel={w.itsCategory} fullWidth />
          </div>
          {/* As tall as the name's field and the category beside it (40 px). */}
          <button type="submit" className={`${secondary} !h-10`} disabled={busy === "new" || !name.trim()}>
            <PlusIcon className="w-4 h-4" />
            {w.add}
          </button>
        </form>
      )}
    </section>
  );
}

function Years() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<number | null>(null);
  const states = new Map(b.s.years.map((y) => [y.year, y]));

  async function change(year: number, closed: boolean | null, rectified: boolean | null) {
    if (closed !== null) {
      const ok = await confirm(
        closed
          ? { title: w.closeTitle(year), description: w.closeBody, confirmLabel: w.closeConfirm(year), cancelLabel: w.cancel }
          : { title: w.reopenTitle(year), description: w.reopenBody, confirmLabel: w.reopenConfirm(year), cancelLabel: w.cancel, danger: true }
      );
      if (!ok) return;
    }
    setBusy(year);
    try {
      const r = await setYear(b.teamId, year, closed, rectified);
      if (r.error !== undefined) return void toast.error(r.error);
      b.patch((s) => ({ ...s, years: [...s.years.filter((y) => y.year !== year), r.year] }));
      if (closed !== null) toast.success(closed ? w.closedToast(year) : w.openToast(year));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${card} p-4 sm:p-6`}>
      <h2 className={h2}>{w.yearsTitle}</h2>
      <p className="mt-1 text-[12.5px] text-ink-soft max-w-2xl">{w.yearsIntro}</p>
      <ul className="mt-3 rounded-xl border border-line/10 divide-y divide-line/10">
        {b.years.map((year) => {
          const st = states.get(year);
          const closed = !!st?.closed_at;
          return (
            <li key={year} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
              <span className="font-display text-[16px] font-semibold tabular-nums w-14">{year}</span>
              <span className="flex-1 min-w-[10rem] text-[12.5px] text-ink-soft">
                {closed ? (
                  <span className="inline-flex items-center gap-1.5">
                    <LockIcon className="w-3.5 h-3.5" /> {st?.closed_at ? w.closedOn(formatDay(st.closed_at.slice(0, 10), b.lang)) : w.closed}
                  </span>
                ) : (
                  w.open
                )}
              </span>
              <label className="flex items-center gap-2 text-[12.5px] font-semibold">
                <Switch on={!!st?.rectified} onChange={(v) => void change(year, null, v)} label={w.rectifyAria(year)} disabled={!b.edit || busy === year} />
                Rectificare
              </label>
              {b.edit && (
                <button type="button" className={secondary} disabled={busy === year} onClick={() => void change(year, !closed, null)}>
                  {closed ? w.reopen : w.closeYear}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Access() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const people = b.people ?? [];

  async function set(p: BusinessPerson, level: BusinessPerson["access"]) {
    if (level === p.access) return;
    const ok = await confirm(
      level === "none"
        ? { title: w.stopTitle(p.name), description: w.stopBody, confirmLabel: w.stopConfirm, cancelLabel: w.cancel, danger: true }
        : level === "edit"
          ? { title: w.editTitle(p.name), description: w.editBody, confirmLabel: w.editConfirm, cancelLabel: w.cancel }
          : { title: w.viewTitle(p.name), description: w.viewBody, confirmLabel: w.viewConfirm, cancelLabel: w.cancel }
    );
    if (!ok) return;
    setBusy(p.userId);
    try {
      const r = await setBusinessAccess(b.teamId, p.userId, level);
      if (r.error !== undefined) return void toast.error(r.error);
      b.setPeople((l) => l.map((x) => (x.userId === p.userId ? { ...x, access: r.level } : x)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${card} p-4 sm:p-6`}>
      <h2 className={h2}>{w.accessTitle}</h2>
      <p className="mt-1 text-[12.5px] text-ink-soft max-w-2xl">{w.accessIntro(b.teamName)}</p>
      <ul className="mt-3 rounded-xl border border-line/10 divide-y divide-line/10">
        {people.map((p) => (
          <li key={p.userId} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
            <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-8 h-8 text-[11px]" />
            <span className="flex-1 min-w-[8rem] text-[13.5px] font-semibold truncate">
              {p.name}
              {p.userId === b.me && <span className="font-normal text-ink-faint">{w.you}</span>}
            </span>
            {p.owner ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-faint">
                <CheckIcon className="w-3.5 h-3.5" /> {w.ownerAll}
              </span>
            ) : (
              <Segmented
                ariaLabel={w.whatCan(p.name)}
                size="sm"
                value={p.access}
                onChange={(v) => void set(p, v)}
                options={[
                  { value: "none", label: w.nothing, disabled: busy === p.userId },
                  { value: "view", label: w.see, disabled: busy === p.userId },
                  { value: "edit", label: w.edit, disabled: busy === p.userId },
                ]}
              />
            )}
          </li>
        ))}
        {people.length <= 1 && <li className="px-3 py-3 text-[13px] text-ink-soft">{w.nobodyElse}</li>}
      </ul>
    </section>
  );
}

/** "Ana changed the entry" / "Ana a modificat operațiunea". */
const ITEM_WORDS: Record<HistoryRow["item"], { en: string; ro: string }> = {
  profile: { en: "PFA details", ro: "datele PFA" },
  source: { en: "Income source", ro: "sursa de venit" },
  year: { en: "Year", ro: "anul" },
  entry: { en: "Entry", ro: "operațiunea" },
  asset: { en: "Fixed asset", ro: "mijlocul fix" },
  inventory: { en: "Inventory", ro: "inventarul" },
  inventory_item: { en: "Inventory line", ro: "rândul de inventar" },
  file: { en: "Document", ro: "documentul" },
  ref_line: { en: "Fiscal register line", ro: "rândul din registrul de evidență fiscală" },
};
const ACTION_WORDS: Record<HistoryRow["action"], { en: string; ro: string }> = {
  add: { en: "added", ro: "a adăugat" },
  change: { en: "changed", ro: "a modificat" },
  remove: { en: "removed", ro: "a șters" },
  close: { en: "closed", ro: "a închis" },
  reopen: { en: "reopened", ro: "a redeschis" },
};
export const historyDid = (r: HistoryRow, lang: Lang) => (lang === "ro" ? `${ACTION_WORDS[r.action].ro} ${ITEM_WORDS[r.item].ro}` : `${ACTION_WORDS[r.action].en} ${ITEM_WORDS[r.item].en.toLowerCase()}`);
const SKIP = new Set(["updated_at", "updated_by", "created_at", "created_by", "team_id", "id"]);
/** The columns a change names, in Romanian (in English, the column's own name: "fx rate"). The database's names, quoted. */
const FIELD_RO: Record<string, string> = {
  "entry_date": "data",
  "doc_type": "felul documentului",
  "doc_number": "nr. documentului",
  "explanation": "explicații",
  "partner": "partenerul",
  "direction": "sensul",
  "channel": "numerar / bancă",
  "amount": "suma",
  "vat_amount": "TVA",
  "kind": "ce reprezintă",
  "nature": "natura",
  "source_id": "sursa de venit",
  "deductible_pct": "cota deductibilă",
  "currency": "moneda",
  "fx_amount": "suma în valută",
  "fx_rate": "cursul",
  "fx_rate_date": "data cursului",
  "asset_id": "mijlocul fix",
  "reversal_of": "stornează",
  "note": "observații",
  "name": "denumirea",
  "holder": "titularul",
  "cui": "CIF",
  "reg_no": "nr. de înregistrare",
  "address": "adresa",
  "caen": "codul CAEN",
  "regime": "sistemul de impozitare",
  "vat": "TVA",
  "activity_start": "începutul activității",
  "keeps_cash": "casa în numerar",
  "opening_date": "data de început",
  "opening_cash": "soldul inițial al casei",
  "opening_bank": "soldul inițial al băncii",
  "fx_rule": "cursul BNR",
  "category": "categoria de venit",
  "archived": "arhivată",
  "position": "poziția",
  "inventory_no": "nr. de inventar",
  "details": "caracteristici tehnice",
  "catalog_code": "codul din catalog",
  "document": "documentul",
  "acquired_on": "data achiziției",
  "in_service_on": "data punerii în funcțiune",
  "value": "valoarea",
  "life_months": "durata (luni)",
  "method": "metoda de amortizare",
  "car_cap": "autoturism",
  "disposed_on": "data ieșirii",
  "disposal_note": "modul ieșirii",
  "taken_on": "data inventarului",
  "item_group": "grupa",
  "quantity": "cantitatea",
  "unit": "U.M.",
  "label": "denumirea",
  "closed_at": "închis la",
  "closed_by": "închis de",
  "rectified": "rectificare",
};
const valueText = (v: unknown, lang: Lang) => (v == null || v === "" ? "—" : typeof v === "boolean" && lang === "ro" ? (v ? "da" : "nu") : String(v));

/** What a change was about, in a few words ("05.03.2026 · AdSense: amount 1,234.5 → 1,300"). */
export function historyText(r: HistoryRow, lang: Lang = "en"): string {
  const row = (r.after ?? r.before ?? {}) as Record<string, unknown>;
  const name = String(row.explanation ?? row.name ?? row.label ?? row.taken_on ?? (r.item === "year" ? r.item_id : "") ?? "");
  const day = typeof row.entry_date === "string" ? `${formatDay(row.entry_date, "ro")} · ` : "";
  if (r.action !== "change" || !r.before || !r.after) return `${day}${name}`;
  const before = r.before as Record<string, unknown>;
  const after = r.after as Record<string, unknown>;
  const changed = Object.keys(after)
    .filter((k) => !SKIP.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .slice(0, 3)
    .map((k) => `${lang === "ro" ? (FIELD_RO[k] ?? k.replace(/_/g, " ")) : k.replace(/_/g, " ")}: ${valueText(before[k], lang)} → ${valueText(after[k], lang)}`);
  return `${day}${name}${changed.length ? `: ${changed.join("; ")}` : ""}`;
}

function History() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load(before: number | null) {
    setBusy(true);
    try {
      const r = await businessHistory(b.teamId, before);
      if (r.error !== undefined) return void toast.error(r.error);
      setRows((l) => (before ? [...(l ?? []), ...r.rows] : r.rows));
      setNames((n) => ({ ...n, ...r.names }));
      setMore(r.more);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${card} p-4 sm:p-6`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="max-w-2xl">
          <h2 className={h2}>{w.historyTitle}</h2>
          <p className="mt-1 text-[12.5px] text-ink-soft">{w.historyIntro}</p>
        </div>
        {!rows && (
          <button type="button" className={secondary} onClick={() => void load(null)} disabled={busy}>
            {busy ? w.loading : w.showHistory}
          </button>
        )}
      </div>
      {rows && (
        <>
          {rows.length ? (
            <ul className="mt-3 rounded-xl border border-line/10 divide-y divide-line/10">
              {rows.map((r) => (
                <li key={r.id} className="px-3 py-2 text-[12.5px] flex items-start gap-3">
                  <span className="text-ink-faint tabular-nums whitespace-nowrap w-[8.5rem] flex-shrink-0">{new Date(r.changed_at).toLocaleString(b.lang === "ro" ? "ro-RO" : "en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="min-w-0">
                    <b>{r.changed_by ? (names[r.changed_by] ?? w.someone) : w.theApp}</b> {historyDid(r, b.lang)}
                    <span className="block text-ink-soft break-words">{historyText(r, b.lang)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Note className="mt-3">{w.noChanges}</Note>
          )}
          {more && (
            <button type="button" className={`${secondary} mt-3`} onClick={() => void load(rows[rows.length - 1]?.id ?? null)} disabled={busy}>
              {busy ? w.loading : w.earlier}
            </button>
          )}
        </>
      )}
    </section>
  );
}
