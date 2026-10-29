"use client";

import { Fragment, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DateChip } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { CheckIcon, CloseIcon, EditIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { createInventory, deleteInventory, deleteItem, saveItem, updateInventory } from "@/app/(dashboard)/business/actions";
import { nEn, nRo, words } from "../lib/i18n";
import { orderItems, totals } from "../lib/inventory";
import { INVENTORY_KINDS, ITEM_GROUPS, groupLabel, inventoryKindLabel, isLiability, type ItemGroup, type Lang } from "../lib/kinds";
import { formatDay, formatLei, parseAmount, yearOf } from "../lib/money";
import type { Inventory, InventoryItem } from "../lib/types";
import { upsert, useBusiness, useWords, without } from "./context";
import { Empty, Field, Money, Note, SwitchRow, area, card, danger, field, primary, quiet, secondary } from "./ui";

/*
 * Business (1.42.0): the Registrul-inventar (OMFP 170/2015, 14-1-2/b): what the business owns and owes on a day, at
 * the start of the activity, every 31 December, and when it ends. A new one starts from the books (the fixed assets in
 * use, the cash, the bank balance); the rest is added line by line: equipment under the threshold, stocks, what's
 * still to be collected or paid.
 */

const W = words({
  norma: {
    en: "Income norm: the inventory isn’t required, but it can be kept here all the same.",
    ro: "Normă de venit: registrul-inventar nu este obligatoriu, dar îl poți ține și aici.",
  },
  inventory: { en: "Inventory", ro: "Inventar" },
  newInventory: { en: "New inventory", ro: "Inventar nou" },
  removeInventory: { en: (d: string) => `Remove the inventory of ${d}?`, ro: (d: string) => `Ștergi inventarul din ${d}?` },
  removeInventoryBody: { en: "Its lines go with it.", ro: "Se șterg și rândurile lui." },
  remove: { en: "Remove", ro: "Șterge" },
  cancel: { en: "Cancel", ro: "Renunță" },
  emptyTitle: { en: (y: number) => `No inventory in ${y}`, ro: (y: number) => `Niciun inventar în ${y}` },
  startYearEnd: { en: "Start the inventory at 31 December", ro: "Creează inventarul la 31 decembrie" },
  emptyBody: {
    en: "The inventory lists what the business owns and owes on a day: at the start of the activity, at least every 31 December, and when it ends. It starts from what the books know.",
    ro: "Inventarul cuprinde elementele de activ și datoriile la o anumită dată: la începerea activității, cel puțin la 31 decembrie a fiecărui an și la încetarea activității. Pornește de la datele din registre.",
  },
  newDescription: { en: "What the business owns and owes on a day.", ro: "Elementele de activ și datoriile la o anumită dată." },
  startedIn: { en: (y: number) => `Started in ${y}`, ro: (y: number) => `Inventar creat în ${y}` },
  open: { en: "Open", ro: "Deschide" },
  startedWith: { en: (n: number) => `Started with ${nEn(n, "line", "lines")} from the books`, ro: (n: number) => `Inventar creat cu ${nRo(n, "rând", "rânduri")} preluate din registre` },
  started: { en: "Started", ro: "Inventar creat" },
  starting: { en: "Starting…", ro: "Se creează…" },
  startIt: { en: "Start it", ro: "Creează" },
  day: { en: "Day", ro: "Data" },
  dayTaken: { en: "There's an inventory on that day already.", ro: "Există deja un inventar la această dată." },
  dayAria: { en: "The inventory's day", ro: "Data inventarului" },
  kind: { en: "Kind", ro: "Tipul" },
  fromBooks: { en: "Start from the books", ro: "Preia datele din registre" },
  fromBooksHint: {
    en: "The fixed assets in use that day (at their entry value), the cash on hand and the bank balance, from the cash book.",
    ro: "Mijloacele fixe în folosință la acea dată (la valoarea de intrare), numerarul din casă și soldul din bancă, din registrul-jurnal.",
  },
  whatCountedQ: { en: "What was counted?", ro: "Ce s-a inventariat?" },
  valueNeeded: { en: "Its value in lei (zero or more).", ro: "Valoarea în lei (zero sau mai mult)." },
  removeLine: { en: "Remove this line?", ro: "Ștergi rândul?" },
  group: { en: "Group", ro: "Grupa" },
  whatCounted: { en: "What was counted", ro: "Denumirea" },
  quantity: { en: "Quantity", ro: "Cantitatea" },
  unit: { en: "Unit", ro: "U.M." },
  document: { en: "Document", ro: "Documentul" },
  valueLei: { en: "Value (lei)", ro: "Valoare (lei)" },
  zero: { en: "0.00", ro: "0,00" },
  save: { en: "Save", ro: "Salvează" },
  saving: { en: "Saving…", ro: "Se salvează…" },
  qty: { en: "Qty", ro: "Cant." },
  valueInLei: { en: "Value in lei", ro: "Valoarea în lei" },
  saveLine: { en: "Save the line", ro: "Salvează rândul" },
  inventoryOn: { en: "Inventory on", ro: "Inventar la data de" },
  no: { en: "No.", ro: "Nr. crt." },
  items: { en: "Items inventoried", ro: "Denumirea elementelor inventariate" },
  inventoryValue: { en: "Value (lei)", ro: "Valoarea de inventar" },
  change: { en: (x: string) => `Change ${x}`, ro: (x: string) => `Modifică ${x}` },
  removeIt: { en: (x: string) => `Remove ${x}`, ro: (x: string) => `Șterge ${x}` },
  noLines: { en: "No lines yet.", ro: "Niciun rând încă." },
  totalAssets: { en: "Total assets", ro: "Total elemente de activ" },
  totalDebts: { en: "Total debts", ro: "Total datorii" },
  difference: { en: "Difference (assets − debts)", ro: "Diferența (active − datorii)" },
  owed: { en: "(owed)", ro: "(se scad)" },
  addLine: { en: "Add a line", ro: "Adaugă un rând" },
  notes: { en: "Notes on this inventory", ro: "Observații la inventar" },
  notesHint: {
    en: "Printed under it (who counted, the inventory lists attached…).",
    ro: "Se tipăresc sub inventar (cine a inventariat, listele de inventariere anexate…).",
  },
  total: { en: "Total", ro: "Total" },
});

export function InventoryTab() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const mine = useMemo(() => b.s.inventories.filter((i) => yearOf(i.taken_on) === b.year).sort((x, y) => (x.taken_on < y.taken_on ? 1 : -1)), [b.s.inventories, b.year]);
  const [pick, setPick] = useState<string | null>(mine[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [warnings, setWarnings] = useState<Record<string, string[]>>({});
  const inv = mine.find((i) => i.id === pick) ?? mine[0] ?? null;
  const writable = b.edit && !b.closed;

  return (
    <div className="space-y-3">
      {b.s.profile.regime === "norma" && <Note>{w.norma}</Note>}
      <div className="flex items-center gap-2 flex-wrap">
        {mine.length > 0 && (
          <Segmented
            ariaLabel={w.inventory}
            value={inv?.id ?? ""}
            onChange={setPick}
            options={mine.map((i) => ({ value: i.id, label: formatDay(i.taken_on, b.lang), title: inventoryKindLabel(i.kind, b.lang) }))}
          />
        )}
        {writable && (
          <button type="button" className={mine.length ? secondary : primary} onClick={() => setCreating(true)}>
            <PlusIcon className="w-4 h-4" />
            {w.newInventory}
          </button>
        )}
      </div>
      {inv ? (
        <InventorySheet
          key={inv.id}
          inv={inv}
          writable={writable}
          warnings={warnings[inv.id] ?? []}
          onRemoved={async () => {
            const ok = await confirm({ title: w.removeInventory(formatDay(inv.taken_on, b.lang)), description: w.removeInventoryBody, confirmLabel: w.remove, cancelLabel: w.cancel, danger: true });
            if (!ok) return;
            const r = await deleteInventory(b.teamId, inv.id);
            if (r.error !== undefined) return void toast.error(r.error);
            b.patch((s) => ({ ...s, inventories: without(s.inventories, [inv.id]), items: s.items.filter((x) => x.inventory_id !== inv.id) }));
            setPick(null);
          }}
        />
      ) : (
        <Empty
          title={w.emptyTitle(b.year)}
          action={
            writable ? (
              <button type="button" className={primary} onClick={() => setCreating(true)}>
                {w.startYearEnd}
              </button>
            ) : undefined
          }
        >
          {w.emptyBody}
        </Empty>
      )}
      {creating && (
        <NewInventory
          onClose={() => setCreating(false)}
          onMade={(i, w) => {
            setPick(i.id);
            if (w.length) setWarnings((x) => ({ ...x, [i.id]: w }));
          }}
        />
      )}
    </div>
  );
}

function NewInventory({ onClose, onMade }: { onClose: () => void; onMade: (i: Inventory, warnings: string[]) => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const taken = new Set(b.s.inventories.map((i) => i.taken_on));
  const [day, setDay] = useState(() => (taken.has(`${b.year}-12-31`) ? (yearOf(b.today) === b.year ? b.today : `${b.year}-01-01`) : `${b.year}-12-31`));
  const [kind, setKind] = useState<string>(day.endsWith("-12-31") ? "year_end" : "other");
  const [fromBooks, setFromBooks] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={w.newInventory}
      description={w.newDescription}
      footer={
        <>
          <button type="button" className={secondary} onClick={onClose} disabled={busy}>
            {w.cancel}
          </button>
          <button
            type="button"
            className={primary}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await createInventory(b.teamId, day, kind, fromBooks);
                if (r.error !== undefined) return void toast.error(r.error);
                b.patch((s) => ({ ...s, inventories: upsert(s.inventories, r.inventory), items: r.items.reduce((l, it) => upsert(l, it), s.items) }));
                if (yearOf(r.inventory.taken_on) !== b.year) toast.success(w.startedIn(yearOf(r.inventory.taken_on)), { action: { label: w.open, onClick: () => b.goYear(yearOf(r.inventory.taken_on)) } });
                else toast.success(r.items.length ? w.startedWith(r.items.length) : w.started);
                onMade(r.inventory, r.warnings);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? w.starting : w.startIt}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={w.day} problem={taken.has(day) ? w.dayTaken : null}>
            <DateChip value={day} onChange={(d) => setDay(d)} ariaLabel={w.dayAria} />
          </Field>
          <Field label={w.kind}>
            <Select
              value={kind}
              onChange={(v) => v && setKind(v)}
              options={INVENTORY_KINDS.map((k) => ({ value: k, label: inventoryKindLabel(k, b.lang), hint: b.lang === "en" ? inventoryKindLabel(k, "ro") : undefined }))}
              ariaLabel={w.kind}
              fullWidth
            />
          </Field>
        </div>
        <SwitchRow on={fromBooks} onChange={setFromBooks} label={w.fromBooks} hint={w.fromBooksHint} />
      </div>
    </Dialog>
  );
}

type ItemDraft = { id?: string; item_group: ItemGroup; name: string; quantity: string; unit: string; value: string; document: string };
/** A line, to change: the amounts written the page's way (1.234,50 in Romanian; the quantity with a decimal comma). */
const draftOf = (it: InventoryItem, lang: Lang): ItemDraft => ({
  id: it.id,
  item_group: it.item_group,
  name: it.name,
  quantity: it.quantity == null ? "" : lang === "ro" ? String(it.quantity).replace(".", ",") : String(it.quantity),
  unit: it.unit,
  value: formatLei(it.value, lang),
  document: it.document,
});
/** The groups to pick from: in English, with the register's Romanian name under each. */
const groupOptions = (lang: Lang) => ITEM_GROUPS.map((g) => ({ value: g, label: groupLabel(g, lang), hint: lang === "en" ? groupLabel(g, "ro") : undefined }));

function InventorySheet({ inv, writable, warnings, onRemoved }: { inv: Inventory; writable: boolean; warnings: string[]; onRemoved: () => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const items = useMemo(() => orderItems(b.s.items.filter((i) => i.inventory_id === inv.id)), [b.s.items, inv.id]);
  const t = useMemo(() => totals(items), [items]);
  const [edit, setEdit] = useState<ItemDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(inv.note);

  async function save() {
    if (!edit) return;
    const value = parseAmount(edit.value);
    if (!edit.name.trim()) return void toast.error(w.whatCountedQ);
    if (value == null || value < 0) return void toast.error(w.valueNeeded);
    setBusy(true);
    try {
      const r = await saveItem(b.teamId, { ...edit, inventory_id: inv.id, value, quantity: edit.quantity.trim() ? edit.quantity : null, position: edit.id ? undefined : items.length });
      if (r.error !== undefined) return void toast.error(r.error);
      b.patch((s) => ({ ...s, items: upsert(s.items, r.item) }));
      setEdit(null);
    } finally {
      setBusy(false);
    }
  }
  /** True once it's gone. */
  async function del(it: InventoryItem) {
    if (!(await confirm({ title: w.removeLine, description: it.name, confirmLabel: w.remove, cancelLabel: w.cancel, danger: true }))) return false;
    const r = await deleteItem(b.teamId, it.id);
    if (r.error !== undefined) {
      toast.error(r.error);
      return false;
    }
    b.patch((s) => ({ ...s, items: without(s.items, [it.id]) }));
    return true;
  }
  async function saveNote() {
    if (note === inv.note) return;
    const r = await updateInventory(b.teamId, inv.id, { note });
    if (r.error !== undefined) return void toast.error(r.error);
    b.patch((s) => ({ ...s, inventories: upsert(s.inventories, r.inventory) }));
  }

  // Numbered down the register, group by group (Nr. crt.).
  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of t.groups) for (const it of items) if (it.item_group === g.group) m.set(it.id, m.size + 1);
    return m;
  }, [t.groups, items]);
  const qtyText = (it: InventoryItem) => (it.quantity != null ? `${formatLei(it.quantity, b.lang, { decimals: Number.isInteger(it.quantity) ? 0 : 3 })} ${it.unit}`.trim() : "");
  const setDraft = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => setEdit((x) => (x ? { ...x, [k]: v } : x));

  // On a phone: the line's fields one under the other, with its own Remove.
  const phoneEditor = (d: ItemDraft) => (
    <div className="px-4 py-3 bg-amber/5 border-t border-line/10 space-y-2.5">
      <Field label={w.group}>
        <Select value={d.item_group} onChange={(v) => v && setDraft("item_group", v as ItemGroup)} options={groupOptions(b.lang)} ariaLabel={w.group} fullWidth />
      </Field>
      <Field label={w.whatCounted}>
        <input className={field} value={d.name} onChange={(e) => setDraft("name", e.target.value)} maxLength={300} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={w.quantity}>
          <input className={`${field} text-right tabular-nums`} value={d.quantity} onChange={(e) => setDraft("quantity", e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={w.unit}>
          <input className={field} value={d.unit} onChange={(e) => setDraft("unit", e.target.value)} placeholder="buc." maxLength={20} />
        </Field>
      </div>
      <Field label={w.document}>
        <input className={field} value={d.document} onChange={(e) => setDraft("document", e.target.value)} placeholder="Factură 12" maxLength={160} />
      </Field>
      <Field label={w.valueLei}>
        <input className={`${field} text-right tabular-nums`} value={d.value} onChange={(e) => setDraft("value", e.target.value)} placeholder={w.zero} inputMode="decimal" />
      </Field>
      <div className="flex items-center gap-2 pt-1">
        {d.id && (
          <button
            type="button"
            className={danger}
            disabled={busy}
            onClick={() => {
              const it = items.find((x) => x.id === d.id);
              if (it) void del(it).then((gone) => gone && setEdit(null));
            }}
          >
            {w.remove}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className={secondary} onClick={() => setEdit(null)} disabled={busy}>
          {w.cancel}
        </button>
        <button type="button" className={primary} onClick={() => void save()} disabled={busy}>
          {busy ? w.saving : w.save}
        </button>
      </div>
    </div>
  );

  const editorRow = (d: ItemDraft) => (
    <tr className="border-t border-line/10 bg-amber/5">
      <td className="px-3 py-2" />
      <td className="px-2 py-2" colSpan={2}>
        <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          <Select value={d.item_group} onChange={(v) => v && setEdit((x) => (x ? { ...x, item_group: v as ItemGroup } : x))} options={groupOptions(b.lang)} ariaLabel={w.group} fullWidth />
          <input className={field} value={d.name} onChange={(e) => setEdit((x) => (x ? { ...x, name: e.target.value } : x))} placeholder={w.whatCounted} maxLength={300} data-autofocus />
        </div>
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1.5">
          <input className={`${field} w-20 text-right tabular-nums`} value={d.quantity} onChange={(e) => setEdit((x) => (x ? { ...x, quantity: e.target.value } : x))} placeholder={w.qty} inputMode="decimal" aria-label={w.quantity} />
          <input className={`${field} w-20`} value={d.unit} onChange={(e) => setEdit((x) => (x ? { ...x, unit: e.target.value } : x))} placeholder="buc." maxLength={20} aria-label={w.unit} />
        </div>
      </td>
      <td className="px-2 py-2">
        <input className={field} value={d.document} onChange={(e) => setEdit((x) => (x ? { ...x, document: e.target.value } : x))} placeholder="Factură 12" maxLength={160} aria-label={w.document} />
      </td>
      <td className="px-2 py-2">
        <input className={`${field} text-right tabular-nums`} value={d.value} onChange={(e) => setEdit((x) => (x ? { ...x, value: e.target.value } : x))} placeholder={w.zero} inputMode="decimal" aria-label={w.valueInLei} onKeyDown={(e) => e.key === "Enter" && void save()} />
      </td>
      <td className="px-2 py-2 whitespace-nowrap text-right">
        <button type="button" className={quiet} onClick={() => void save()} disabled={busy} aria-label={w.saveLine}>
          <CheckIcon className="w-4 h-4 text-green" />
        </button>
        <button type="button" className={quiet} onClick={() => setEdit(null)} disabled={busy} aria-label={w.cancel}>
          <CloseIcon className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );

  return (
    <div className="space-y-3">
      {warnings.map((x) => (
        <Note key={x} tone="amber">
          {x}
        </Note>
      ))}
      <section className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-line/10 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">
              {w.inventoryOn} {formatDay(inv.taken_on, b.lang)}
            </p>
            <p className="text-[12.5px] text-ink-soft">{inventoryKindLabel(inv.kind, b.lang)}</p>
          </div>
          {writable && (
            <button type="button" className={danger} onClick={onRemoved}>
              <TrashIcon className="w-4 h-4" />
              {w.remove}
            </button>
          )}
        </div>
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead>
              <tr className="bg-surface-2 text-[10.5px] text-ink-faint uppercase tracking-wide">
                <th className="px-3 py-2 text-left w-12">{w.no}</th>
                <th className="px-2 py-2 text-left" colSpan={2}>
                  {w.items}
                </th>
                <th className="px-2 py-2 text-right w-[180px]">{w.quantity}</th>
                <th className="px-2 py-2 text-left w-[180px]">{w.document}</th>
                <th className="px-2 py-2 text-right w-[150px]">{w.inventoryValue}</th>
                <th className="px-2 py-2 w-[84px]" />
              </tr>
            </thead>
            <tbody>
              {t.groups.map((g) => (
                <GroupRows key={g.group} group={g.group} total={g.total}>
                  {items
                    .filter((it) => it.item_group === g.group)
                    .map((it) => {
                      if (edit?.id === it.id) return <Fragment key={it.id}>{editorRow(edit)}</Fragment>;
                      return (
                        <tr key={it.id} className="border-t border-line/10 hover:bg-surface-2/40">
                          <td className="px-3 py-2 tabular-nums text-ink-faint">{numbers.get(it.id)}</td>
                          <td className="px-2 py-2" colSpan={2}>
                            {it.name}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink-soft">{qtyText(it)}</td>
                          <td className="px-2 py-2 text-ink-soft truncate max-w-[180px]">{it.document}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">
                            <Money value={it.value} />
                          </td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            {writable && (
                              <>
                                <button type="button" className={quiet} onClick={() => setEdit(draftOf(it, b.lang))} aria-label={w.change(it.name)}>
                                  <EditIcon className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" className={`${quiet} hover:text-red`} onClick={() => void del(it)} aria-label={w.removeIt(it.name)}>
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </GroupRows>
              ))}
              {edit && !edit.id && editorRow(edit)}
              {!items.length && !edit && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-ink-soft">
                    {w.noLines}
                  </td>
                </tr>
              )}
              <tr className="border-t border-line/15 bg-surface-2/60 font-semibold">
                <td className="px-3 py-2" />
                <td className="px-2 py-2" colSpan={4}>
                  {w.totalAssets}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money value={t.owned} />
                </td>
                <td />
              </tr>
              <tr className="border-t border-line/10 bg-surface-2/60 font-semibold">
                <td className="px-3 py-2" />
                <td className="px-2 py-2" colSpan={4}>
                  {w.totalDebts}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money value={t.owed} />
                </td>
                <td />
              </tr>
              <tr className="border-t border-line/10 bg-amber/10 font-bold">
                <td className="px-3 py-2" />
                <td className="px-2 py-2" colSpan={4}>
                  {w.difference}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money value={t.net} />
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="md:hidden">
          {t.groups.map((g) => {
            const mine = items.filter((it) => it.item_group === g.group);
            return (
              <section key={g.group} className="border-b border-line/10">
                <div className="flex items-baseline justify-between gap-2 px-4 pt-3 pb-1.5">
                  <h4 className="text-[11.5px] font-bold uppercase tracking-wide text-ink-soft">
                    {groupLabel(g.group, b.lang)}
                    {isLiability(g.group) && <span className="ml-1.5 normal-case tracking-normal font-semibold text-ink-faint">{w.owed}</span>}
                  </h4>
                  <span className="text-[12.5px] font-semibold tabular-nums">
                    <Money value={g.total} />
                  </span>
                </div>
                <ul>
                  {mine.map((it) =>
                    edit?.id === it.id ? (
                      <li key={it.id}>{phoneEditor(edit)}</li>
                    ) : (
                      <li key={it.id} className="border-t border-line/10">
                        <button type="button" disabled={!writable} onClick={() => setEdit(draftOf(it, b.lang))} className="w-full flex items-start gap-3 px-4 py-2.5 text-left enabled:active:bg-surface-2">
                          <span className="w-5 flex-shrink-0 pt-px text-[12px] text-ink-faint tabular-nums">{numbers.get(it.id)}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13.5px] leading-snug">{it.name}</span>
                            {(qtyText(it) || it.document) && <span className="block mt-0.5 text-[11.5px] text-ink-faint">{[qtyText(it), it.document].filter(Boolean).join(" · ")}</span>}
                          </span>
                          <span className="text-[13.5px] font-semibold tabular-nums whitespace-nowrap">
                            <Money value={it.value} />
                          </span>
                        </button>
                      </li>
                    )
                  )}
                </ul>
              </section>
            );
          })}
          {edit && !edit.id && phoneEditor(edit)}
          {!items.length && !edit && <p className="px-4 py-8 text-center text-[13px] text-ink-soft">{w.noLines}</p>}
          <dl className="bg-surface-2/60 px-4 py-2.5 space-y-1 text-[13px] tabular-nums">
            <div className="flex justify-between gap-3 font-semibold">
              <dt>{w.totalAssets}</dt>
              <dd>
                <Money value={t.owned} />
              </dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold">
              <dt>{w.totalDebts}</dt>
              <dd>
                <Money value={t.owed} />
              </dd>
            </div>
            <div className="flex justify-between gap-3 font-bold">
              <dt>{w.difference}</dt>
              <dd>
                <Money value={t.net} />
              </dd>
            </div>
          </dl>
        </div>
        {writable && !edit && (
          <div className="px-4 py-3 border-t border-line/10">
            <button type="button" className={secondary} onClick={() => setEdit({ item_group: "inventory_item", name: "", quantity: "1", unit: "buc.", value: "", document: "" })}>
              <PlusIcon className="w-4 h-4" />
              {w.addLine}
            </button>
          </div>
        )}
      </section>
      <Field label={w.notes} hint={w.notesHint}>
        <textarea className={area} rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => void saveNote()} maxLength={500} disabled={!writable} />
      </Field>
    </div>
  );
}

function GroupRows({ group, total, children }: { group: ItemGroup; total: number; children: React.ReactNode }) {
  const b = useBusiness();
  const w = useWords(W);
  return (
    <>
      <tr className="border-t border-line/10 bg-surface-2/40">
        <td className="px-3 py-1.5" />
        <td className="px-2 py-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-soft" colSpan={6}>
          {groupLabel(group, b.lang)}
          {isLiability(group) && <span className="ml-1.5 normal-case tracking-normal font-semibold text-ink-faint">{w.owed}</span>}
        </td>
      </tr>
      {children}
      <tr className="border-t border-line/10">
        <td className="px-3 py-1.5" />
        <td className="px-2 py-1.5 text-[12.5px] text-ink-soft" colSpan={4}>
          {w.total}: {groupLabel(group, b.lang).toLowerCase()}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums text-[12.5px] font-semibold">
          <Money value={total} />
        </td>
        <td />
      </tr>
    </>
  );
}
