"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Dialog } from "@/components/ui/dialog";
import { DateChip } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { BarDelete, BarMenu, ListPicker, PickBar, PickButton, RowPick, TickBox, usePick, type BarBusy } from "@/components/ui/list-pick";
import { CheckIcon, CloseIcon, EditIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { itemsAway, rowsBefore, rowsGlide, tableRowsAway } from "@/lib/remove-animation";
import { createInventory, deleteInventory, deleteItem, saveItem, updateInventory } from "@/app/(dashboard)/business/actions";
import { nEn, nRo, words } from "../lib/i18n";
import { orderItems, totals } from "../lib/inventory";
import { INVENTORY_KINDS, ITEM_GROUPS, groupLabel, inventoryKindLabel, isLiability, type ItemGroup, type Lang } from "../lib/kinds";
import { formatDay, formatLei, parseAmount, yearOf } from "../lib/money";
import type { Inventory, InventoryItem } from "../lib/types";
import { upsert, useBusiness, useWords, without } from "./context";
import { RegisterHead } from "./register-info";
import { Empty, Field, Money, Note, SwitchRow, area, card, danger, field, primary, quiet, secondary } from "./ui";

/*
 * Business (1.42.0): the Registrul-inventar (OMFP 170/2015, 14-1-2/b): what the business owns and owes on a day, at
 * the start of the activity, every 31 December, and when it ends. A new one starts from the books (the fixed assets in
 * use, the cash, the bank balance); the rest is added line by line: equipment under the threshold, stocks, what's
 * still to be collected or paid.
 *
 * 1.43.0 (the owner: "design-ul la inventar este foarte greu de urmărit în mare parte, poate modifici puțin partea de
 * jos cu total elemente, adaugă un rând butonul nu se află unde trebuie exact"): each group is a block that opens with
 * its name, how many lines and its total (no separate total row under it) and a + that adds a line straight into it;
 * Add a line sits at the top of the sheet, by its name; the totals at the bottom are three figures side by side (what
 * it owns, what it owes, the difference). Lines can be picked (moved to another group, removed); a saved line flashes
 * green, a removed one is struck through and slides off. The tab opens with its name and the ⓘ (register-info.tsx).
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
  addTo: { en: (g: string) => `Add a line to ${g}`, ro: (g: string) => `Adaugă un rând la ${g}` },
  linesN: { en: (n: number) => nEn(n, "line", "lines"), ro: (n: number) => nRo(n, "rând", "rânduri") },
  takenOff: { en: "taken off", ro: "se scade" },
  itemsWord: { en: "lines", ro: "rânduri" },
  pickHint: { en: "Pick lines: move them to another group or remove them", ro: "Selectează rânduri: mută-le în altă grupă sau șterge-le" },
  pickLine: { en: (n: number) => `Select line ${n}`, ro: (n: number) => `Selectează rândul ${n}` },
  oneLine: { en: "line", ro: "rând" },
  manyLines: { en: "lines", ro: "rânduri" },
  barLabel: { en: "Picked lines", ro: "Rânduri selectate" },
  selectedN: { en: (n: number) => `${n} selected`, ro: (n: number) => `${n} ${n === 1 ? "selectat" : "selectate"}` },
  moveTo: { en: "Move to", ro: "Mută în" },
  moving: { en: (n: number) => `Moving ${nEn(n, "line", "lines")}…`, ro: (n: number) => `Se mută ${nRo(n, "rând", "rânduri")}…` },
  moved: { en: (n: number) => `${nEn(n, "line", "lines")} moved`, ro: (n: number) => `Mutate: ${nRo(n, "rând", "rânduri")}` },
  allThere: { en: "All there", ro: "Deja acolo" },
  removeLines: { en: (n: number) => `Remove ${nEn(n, "line", "lines")}?`, ro: (n: number) => `Ștergi ${nRo(n, "rând", "rânduri")}?` },
  removeLinesBody: { en: "They go from this inventory.", ro: "Dispar din acest inventar." },
  removeN: { en: (n: number) => `Remove ${n}`, ro: (n: number) => `Șterge ${n}` },
  removing: { en: (n: number) => `Removing ${nEn(n, "line", "lines")}…`, ro: (n: number) => `Se șterg ${nRo(n, "rând", "rânduri")}…` },
  removedN: { en: (n: number) => `${nEn(n, "line", "lines")} removed`, ro: (n: number) => `Șterse: ${nRo(n, "rând", "rânduri")}` },
  removeInv: { en: "Remove the inventory", ro: "Șterge inventarul" },
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
      <RegisterHead
        register="inventory"
        aside={
          writable && (
            <button type="button" className={mine.length ? secondary : primary} onClick={() => setCreating(true)}>
              <PlusIcon className="w-4 h-4" />
              {w.newInventory}
            </button>
          )
        }
      />
      {b.s.profile.regime === "norma" && <Note>{w.norma}</Note>}
      {mine.length > 1 && (
        <Segmented
          ariaLabel={w.inventory}
          value={inv?.id ?? ""}
          onChange={setPick}
          options={mine.map((i) => ({ value: i.id, label: formatDay(i.taken_on, b.lang), title: inventoryKindLabel(i.kind, b.lang) }))}
        />
      )}
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
            <DateChip value={day} onChange={(d) => setDay(d)} ariaLabel={w.dayAria} size="field" />
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
/** A new line's draft, in a group. */
const blank = (g: ItemGroup): ItemDraft => ({ item_group: g, name: "", quantity: g === "cash" || g === "bank" || g === "receivable" || g === "debt" ? "" : "1", unit: g === "cash" || g === "bank" || g === "receivable" || g === "debt" ? "" : "buc.", value: "", document: "" });
/** The groups to pick from: in English, with the register's Romanian name under each. */
const groupOptions = (lang: Lang) => ITEM_GROUPS.map((g) => ({ value: g, label: groupLabel(g, lang), hint: lang === "en" ? groupLabel(g, "ro") : undefined }));

/** Where a new line is being typed: at the top of the sheet, or at the end of its group. */
type NewAt = "top" | ItemGroup;

function InventorySheet({ inv, writable, warnings, onRemoved }: { inv: Inventory; writable: boolean; warnings: string[]; onRemoved: () => void }) {
  const b = useBusiness();
  const items = useMemo(() => orderItems(b.s.items.filter((i) => i.inventory_id === inv.id)), [b.s.items, inv.id]);
  return (
    <ListPicker ids={items.map((i) => i.id)} bar={writable ? <InventoryPickBar items={items} /> : null}>
      <SheetBody inv={inv} items={items} writable={writable} warnings={warnings} onRemoved={onRemoved} />
    </ListPicker>
  );
}

function SheetBody({ inv, items, writable, warnings, onRemoved }: { inv: Inventory; items: InventoryItem[]; writable: boolean; warnings: string[]; onRemoved: () => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const p = usePick();
  const picking = !!p?.on;
  const t = useMemo(() => totals(items), [items]);
  const [edit, setEdit] = useState<ItemDraft | null>(null);
  const [newAt, setNewAt] = useState<NewAt>("top");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(inv.note);
  // A line just saved: it flashes green for a moment.
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const x = setTimeout(() => setFlash(null), 1100);
    return () => clearTimeout(x);
  }, [flash]);
  useEffect(() => {
    if (picking) setEdit(null);
  }, [picking]);

  function startNew(at: NewAt) {
    setNewAt(at);
    setEdit(blank(at === "top" ? "inventory_item" : at));
  }

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
      setFlash(r.item.id);
    } finally {
      setBusy(false);
    }
  }
  /** True once it's gone: struck through and off, the lines under it gliding up (back, if the server says no). */
  async function del(it: InventoryItem) {
    if (!(await confirm({ title: w.removeLine, description: it.name, confirmLabel: w.remove, cancelLabel: w.cancel, danger: true }))) return false;
    return removeItems([it], b, toast);
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

  // On a computer: the line's fields across its row (each box 36 px), ✓ saves, × leaves it.
  const box = "w-full h-9 rounded-lg border border-line/15 bg-surface px-3 text-[13px] outline-none focus:ring-2 focus:ring-amber";
  const editorRow = (d: ItemDraft) => (
    <tr className="biz-inv-edit" data-flip={d.id ?? "new"}>
      <td className="pl-4 pr-2 py-2 text-ink-faint">
        <PlusIcon className="w-3.5 h-3.5 text-amber" />
      </td>
      <td className="px-2 py-2">
        <div className="grid gap-2 grid-cols-[12rem_minmax(0,1fr)]">
          <Select value={d.item_group} onChange={(v) => v && setDraft("item_group", v as ItemGroup)} options={groupOptions(b.lang)} ariaLabel={w.group} size="bar" fullWidth />
          <input className={box} value={d.name} onChange={(e) => setDraft("name", e.target.value)} placeholder={w.whatCounted} maxLength={300} autoFocus onKeyDown={(e) => e.key === "Enter" && void save()} />
        </div>
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1.5">
          <input className={`${box} w-[4.5rem] text-right tabular-nums`} value={d.quantity} onChange={(e) => setDraft("quantity", e.target.value)} placeholder={w.qty} inputMode="decimal" aria-label={w.quantity} onKeyDown={(e) => e.key === "Enter" && void save()} />
          <input className={`${box} w-[4.5rem]`} value={d.unit} onChange={(e) => setDraft("unit", e.target.value)} placeholder="buc." maxLength={20} aria-label={w.unit} onKeyDown={(e) => e.key === "Enter" && void save()} />
        </div>
      </td>
      <td className="px-2 py-2">
        <input className={box} value={d.document} onChange={(e) => setDraft("document", e.target.value)} placeholder="Factură 12" maxLength={160} aria-label={w.document} onKeyDown={(e) => e.key === "Enter" && void save()} />
      </td>
      <td className="px-2 py-2">
        <input className={`${box} text-right tabular-nums`} value={d.value} onChange={(e) => setDraft("value", e.target.value)} placeholder={w.zero} inputMode="decimal" aria-label={w.valueInLei} onKeyDown={(e) => e.key === "Enter" && void save()} />
      </td>
      <td className="pl-2 pr-4 py-2">
        <div className="flex items-center justify-end gap-1">
          <button type="button" className="w-9 h-9 rounded-lg bg-green/12 text-green hover:bg-green/20 inline-flex items-center justify-center disabled:opacity-60" onClick={() => void save()} disabled={busy} aria-label={w.saveLine}>
            {busy ? <span className="biz-spin" aria-hidden /> : <CheckIcon className="w-4 h-4" />}
          </button>
          <button type="button" className="w-9 h-9 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 inline-flex items-center justify-center" onClick={() => setEdit(null)} disabled={busy} aria-label={w.cancel}>
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );

  const adding = edit && !edit.id ? newAt : null;
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
            <p className="text-[12.5px] text-ink-soft">
              {inventoryKindLabel(inv.kind, b.lang)} · {w.linesN(items.length)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {writable && items.length > 0 && <PickButton what={w.itemsWord} hint={w.pickHint} />}
            {writable && (
              <button type="button" className={primary} onClick={() => startNew("top")} disabled={picking}>
                <PlusIcon className="w-4 h-4" />
                {w.addLine}
              </button>
            )}
            {writable && (
              <button type="button" className={`${secondary} !px-0 w-9 hover:!text-red hover:!border-red/40`} onClick={onRemoved} aria-label={w.removeInv} title={w.removeInv}>
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto hidden md:block">
          <table className="biz-inv w-full text-[13px] min-w-[820px]">
            <colgroup>
              <col className="w-[3.75rem]" />
              <col />
              <col className="w-[10rem]" />
              <col className="w-[13rem]" />
              <col className="w-[10rem]" />
              <col className="w-[6.5rem]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-2 text-[10.5px] text-ink-faint uppercase tracking-wide">
                <th scope="col" className="pl-4 pr-2 py-2 text-left">
                  {w.no}
                </th>
                <th scope="col" className="px-2 py-2 text-left">
                  {w.items}
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  {w.quantity}
                </th>
                <th scope="col" className="px-2 py-2 text-left">
                  {w.document}
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  {w.inventoryValue}
                </th>
                <th scope="col" className="pl-2 pr-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {adding === "top" && editorRow(edit!)}
              {t.groups.map((g) => (
                <Fragment key={g.group}>
                  <GroupHead group={g.group} total={g.total} count={g.count} writable={writable && !picking} onAdd={() => startNew(g.group)} />
                  {items
                    .filter((it) => it.item_group === g.group)
                    .map((it) => {
                      if (edit?.id === it.id) return <Fragment key={it.id}>{editorRow(edit)}</Fragment>;
                      const on = !!p?.picked.has(it.id);
                      return (
                        <tr
                          key={it.id}
                          data-item-id={it.id}
                          data-flip={it.id}
                          className={`biz-inv-row ${flash === it.id ? "biz-saved" : ""} ${picking ? "biz-picking" : ""} ${picking && on ? "is-picked" : ""}`}
                          onClick={picking ? (e) => p!.toggle(it.id, e.shiftKey) : undefined}
                        >
                          <td className="pl-4 pr-2 py-2.5 tabular-nums text-ink-faint relative">
                            {picking ? (
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                aria-label={w.pickLine(numbers.get(it.id) ?? 0)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  p!.toggle(it.id, e.shiftKey);
                                }}
                                className="biz-tick"
                              >
                                <TickBox state={on} />
                              </button>
                            ) : (
                              numbers.get(it.id)
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            <span data-row-title="">{it.name}</span>
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft whitespace-nowrap">{qtyText(it)}</td>
                          <td className="px-2 py-2.5 text-ink-soft">
                            <span className="block truncate max-w-[13rem]" title={it.document}>
                              {it.document}
                            </span>
                          </td>
                          <td className={`px-2 py-2.5 text-right tabular-nums font-semibold ${isLiability(it.item_group) ? "text-red" : ""}`}>
                            <Money value={it.value} />
                          </td>
                          <td className="pl-2 pr-4 py-2">
                            {writable && (
                              <div className="biz-act flex items-center justify-end gap-0.5">
                                <button type="button" className={`${quiet} !px-0 w-8`} onClick={() => setEdit(draftOf(it, b.lang))} aria-label={w.change(it.name)} title={w.change(it.name)}>
                                  <EditIcon className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" className={`${quiet} !px-0 w-8 hover:!text-red`} onClick={() => void del(it)} aria-label={w.removeIt(it.name)} title={w.removeIt(it.name)}>
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {adding === g.group && editorRow(edit!)}
                </Fragment>
              ))}
              {/* A new line in a group that has none yet. */}
              {adding && adding !== "top" && !t.groups.some((g) => g.group === adding) && editorRow(edit!)}
              {!items.length && !edit && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-ink-soft">
                    {w.noLines}
                  </td>
                </tr>
              )}
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
                      <li key={it.id} data-item-id={it.id} className="relative border-t border-line/10">
                        <RowPick id={it.id} label={w.pickLine(numbers.get(it.id) ?? 0)} />
                        <button type="button" disabled={!writable || picking} onClick={() => setEdit(draftOf(it, b.lang))} className="w-full flex items-start gap-3 px-4 py-2.5 text-left enabled:active:bg-surface-2">
                          <span data-row-num="" className="w-5 flex-shrink-0 pt-px text-[12px] text-ink-faint tabular-nums">
                            {numbers.get(it.id)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span data-row-title="" className="block text-[13.5px] leading-snug">
                              {it.name}
                            </span>
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
        </div>
        {/* The bottom line: what it owns, what it owes, and the difference, side by side. */}
        <div className="biz-inv-sum grid sm:grid-cols-3 border-t border-line/15">
          <div className="px-4 py-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{w.totalAssets}</p>
            <p className="mt-1 font-display text-[20px] font-semibold tabular-nums leading-none">
              <Money value={t.owned} />
              <span className="ml-1 text-[12px] font-sans font-normal text-ink-faint">lei</span>
            </p>
          </div>
          <div className="px-4 py-3 max-sm:border-t sm:border-l border-line/10">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
              {w.totalDebts} <span className="normal-case tracking-normal font-semibold">({w.takenOff})</span>
            </p>
            <p className={`mt-1 font-display text-[20px] font-semibold tabular-nums leading-none ${t.owed ? "text-red" : ""}`}>
              <Money value={t.owed} />
              <span className="ml-1 text-[12px] font-sans font-normal text-ink-faint">lei</span>
            </p>
          </div>
          <div className="px-4 py-3 max-sm:border-t sm:border-l border-line/10 bg-amber/10">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-soft">{w.difference}</p>
            <p className="mt-1 font-display text-[22px] font-bold tabular-nums leading-none">
              <Money value={t.net} />
              <span className="ml-1 text-[12px] font-sans font-normal text-ink-faint">lei</span>
            </p>
          </div>
        </div>
      </section>
      <Field label={w.notes} hint={w.notesHint}>
        <textarea className={area} rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => void saveNote()} maxLength={500} disabled={!writable} />
      </Field>
    </div>
  );
}

/** A group's first row: its name (what's owed: taken off), how many lines, its total, and + to add a line to it. */
function GroupHead({ group, total, count, writable, onAdd }: { group: ItemGroup; total: number; count: number; writable: boolean; onAdd: () => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const owed = isLiability(group);
  return (
    <tr className={`biz-inv-group ${owed ? "is-owed" : ""}`} data-flip={`g:${group}`}>
      <td className="pl-4 pr-2 py-2" />
      <td className="px-2 py-2" colSpan={3}>
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink">{groupLabel(group, b.lang)}</span>
        <span className="ml-2 text-[11.5px] text-ink-faint">
          {w.linesN(count)}
          {owed ? ` · ${w.takenOff}` : ""}
        </span>
      </td>
      <td className={`px-2 py-2 text-right tabular-nums font-bold ${owed ? "text-red" : ""}`}>
        <Money value={total} />
      </td>
      <td className="pl-2 pr-4 py-1.5 text-right">
        {writable && (
          <button type="button" onClick={onAdd} className="biz-act w-8 h-8 rounded-lg inline-flex items-center justify-center text-ink-soft hover:text-amber hover:bg-amber/10" aria-label={w.addTo(groupLabel(group, b.lang))} title={w.addTo(groupLabel(group, b.lang))}>
            <PlusIcon className="w-4 h-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * Lines leave the sheet the way the cash book's do: struck through and off, the ones under them gliding up; they come
 * back if the server says no. True when every one went.
 */
async function removeItems(list: InventoryItem[], b: ReturnType<typeof useBusiness>, toast: ReturnType<typeof useToast>): Promise<boolean> {
  const ids = list.map((x) => x.id);
  const shown = ids.flatMap((id) => Array.from(document.querySelectorAll<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`))).filter((el) => el.getClientRects().length > 0);
  const rows = shown.filter((el): el is HTMLTableRowElement => el instanceof HTMLTableRowElement);
  const anim = rows.length ? tableRowsAway(rows) : itemsAway(shown);
  if (anim) {
    await anim.out;
    if (!rows.length) await anim.collapse();
  }
  const body = rows[0]?.parentElement ?? null;
  const before = body ? rowsBefore(body) : null;
  flushSync(() => b.patch((s) => ({ ...s, items: without(s.items, ids) })));
  if (body && before) void rowsGlide(body, before);
  const failed: InventoryItem[] = [];
  for (const it of list) {
    try {
      const r = await deleteItem(b.teamId, it.id);
      if (r.error !== undefined) {
        failed.push(it);
        toast.error(r.error);
      }
    } catch {
      failed.push(it);
    }
  }
  if (failed.length) b.patch((s) => ({ ...s, items: failed.reduce((l, it) => upsert(l, it), s.items) }));
  return !failed.length;
}

/** The bar while lines are picked: move them to another group, remove them. */
function InventoryPickBar({ items }: { items: InventoryItem[] }) {
  const b = useBusiness();
  const w = useWords(W);
  const p = usePick()!;
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<BarBusy>(null);
  const [menu, setMenu] = useState(false);
  const chosen = items.filter((i) => p.picked.has(i.id));
  const n = chosen.length;

  async function moveTo(g: ItemGroup) {
    setMenu(false);
    const todo = chosen.filter((i) => i.item_group !== g);
    if (!todo.length) return;
    setBusy({ text: w.moving(todo.length), progress: 0 });
    let done = 0;
    let ok = 0;
    try {
      for (const it of todo) {
        const r = await saveItem(b.teamId, { ...it, item_group: g });
        done++;
        setBusy({ text: w.moving(todo.length), progress: done / todo.length });
        if (r.error !== undefined) {
          toast.error(r.error);
          continue;
        }
        ok++;
        b.patch((s) => ({ ...s, items: upsert(s.items, r.item) }));
      }
      if (ok) toast.success(w.moved(ok));
    } finally {
      setBusy(null);
    }
  }

  async function removeAll() {
    if (!n) return;
    const ok = await confirm({ title: w.removeLines(n), description: w.removeLinesBody, confirmLabel: n === 1 ? w.remove : w.removeN(n), cancelLabel: w.cancel, danger: true });
    if (!ok) return;
    setBusy({ text: w.removing(n) });
    try {
      if (await removeItems(chosen, b, toast)) toast.success(w.removedN(n), { sound: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PickBar total={items.length} one={w.oneLine} many={w.manyLines} busy={busy} label={w.barLabel} selected={w.selectedN}>
      <BarMenu
        label={w.moveTo}
        open={menu}
        onOpen={setMenu}
        disabled={!n}
        items={ITEM_GROUPS.map((g) => {
          const go = chosen.filter((i) => i.item_group !== g).length;
          return {
            key: g,
            label: groupLabel(g, b.lang),
            hint: go === n ? undefined : go ? `${go}/${n}` : w.allThere,
            icon: <span className={`w-2 h-2 mx-[3px] rounded-[3px] ${isLiability(g) ? "bg-red/70" : "bg-amber/70"}`} aria-hidden />,
            disabled: !go,
            onPick: () => void moveTo(g),
          };
        })}
      />
      <BarDelete onClick={() => void removeAll()} disabled={!n} icon={<TrashIcon className="w-4 h-4" />} />
    </PickBar>
  );
}
