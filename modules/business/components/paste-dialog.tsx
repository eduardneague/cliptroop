"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { checkEntry, parsePasted, type EntryInput, type PastedRow } from "../lib/entries";
import { nEn, nRo, words } from "../lib/i18n";
import { docLabel, naturePct } from "../lib/kinds";
import { formatDay, formatLei } from "../lib/money";
import { catKey, categoryOptions, parseCat } from "./category";
import { useBusiness, useWords } from "./context";
import { useEntries } from "./use-entries";
import { Badge, Note, area, primary, secondary } from "./ui";

/*
 * Business (1.42.0): lines pasted from a spreadsheet (Excel, Google Sheets, ChatGPT's workbook, a bank's CSV): with a
 * header row in Romanian or English, in any order, or in the register's own order. Each line is checked as an entry;
 * what it is gets guessed from its words, and can be changed here before they go in together. Undo takes them all
 * back.
 */

type Row = PastedRow & { pick: string | null; use: boolean };

/** What a pasted block looks like: the register's own columns (the same in both languages: they're the register's). */
const SAMPLE = "Data\tDocumentul\tExplicații\tÎncasări numerar\tÎncasări bancă\tPlăți numerar\tPlăți bancă\n05.01.2026\tExtras 1\tÎncasare AdSense\t\t4.382,10\t\t";

const W = words({
  title: { en: "Paste from Excel", ro: "Lipește din Excel" },
  sample: { en: SAMPLE, ro: SAMPLE },
  description: {
    en: "Copy the lines in Excel or Google Sheets (the header row too, if there is one) and paste them here.",
    ro: "Copiază rândurile din Excel sau Google Sheets (și rândul cu titlurile coloanelor, dacă există) și lipește-le aici.",
  },
  cancel: { en: "Cancel", ro: "Renunță" },
  adding: { en: "Adding…", ro: "Se adaugă…" },
  addN: { en: (n: number) => (n === 1 ? "Add 1 line" : `Add ${n} lines`), ro: (n: number) => `Adaugă ${nRo(n, "rând", "rânduri")}` },
  pasted: { en: "The lines, pasted", ro: "Rândurile lipite" },
  known: {
    en: "Columns it knows (Romanian or English, any order): Data, Documentul, Explicații, Încasări/Plăți numerar and bancă, or Sumă with Încasare/Plată, Categorie, Partener, Moneda, Curs, Observații. Without a header row, the register’s own order. Totals and balances are skipped.",
    ro: "Coloanele recunoscute (în română sau engleză, în orice ordine): Data, Documentul, Explicații, Încasări/Plăți numerar și bancă sau Sumă cu Încasare/Plată, Categorie, Partener, Moneda, Curs, Observații. Fără rând de titluri, se folosește ordinea coloanelor din registru. Rândurile de total și de sold se ignoră.",
  },
  read: { en: (n: number) => `${nEn(n, "line", "lines")} read`, ro: (n: number) => `${nRo(n, "rând citit", "rânduri citite")}` },
  ready: { en: (n: number) => `${n} ready`, ro: (n: number) => `${n} ${n === 1 ? "pregătit" : "pregătite"}` },
  needLook: { en: (n: number) => `${n} need a look`, ro: (n: number) => `${n} de verificat` },
  guessed: { en: ". What each one is was guessed from its words: change it where it’s wrong.", ro: ". Ce reprezintă fiecare a fost estimat după text: corectează unde e greșit." },
  day: { en: "Day", ro: "Data" },
  explanation: { en: "Explanation", ro: "Explicații" },
  amount: { en: "Amount", ro: "Suma" },
  column: { en: "Column", ro: "Coloana" },
  whatItIs: { en: "What it is", ro: "Ce reprezintă" },
  addLine: { en: (n: number) => `Add line ${n}`, ro: (n: number) => `Adaugă rândul ${n}` },
  lineProblem: { en: (n: number, p: string) => `Line ${n}: ${p}`, ro: (n: number, p: string) => `Rândul ${n}: ${p}` },
  in: { en: "In", ro: "Încasare" },
  out: { en: "Out", ro: "Plată" },
  cash: { en: "cash", ro: "numerar" },
  bank: { en: "bank", ro: "bancă" },
  whatLine: { en: (n: number) => `What line ${n} is`, ro: (n: number) => `Ce reprezintă rândul ${n}` },
});

/** A pasted line as an entry, with what it is as picked here. */
function raw(r: Row): Partial<Record<keyof EntryInput, unknown>> {
  const c = r.pick ? parseCat(r.pick) : null;
  return { ...r.input, ...(c ? { kind: c.kind, nature: c.nature, deductible_pct: c.kind === "expense" ? naturePct(c.nature) : 100 } : {}) };
}

export function PasteDialog({ onClose }: { onClose: () => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const { importMany } = useEntries();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverLines, setServerLines] = useState<Map<number, string>>(new Map());
  const ctx = useMemo(
    () => ({ profile: { opening_date: b.s.profile.opening_date, vat: b.s.profile.vat }, sources: b.s.sources, assets: b.s.assets, closed: b.closedYears, today: b.today, lang: b.lang }),
    [b.s.profile.opening_date, b.s.profile.vat, b.s.sources, b.s.assets, b.closedYears, b.today, b.lang]
  );

  function read(t: string) {
    setText(t);
    setServerLines(new Map());
    const parsed = parsePasted(t, { sources: b.s.sources, lang: b.lang });
    setRows(parsed.rows.length ? parsed.rows.map((r) => ({ ...r, pick: r.input.kind ? catKey(r.input.kind, r.input.nature ?? "") : null, use: !r.problems.length })) : null);
  }
  const checks = useMemo(() => (rows ?? []).map((r) => (r.problems.length ? null : checkEntry(raw(r), ctx))), [rows, ctx]);
  const ready = (rows ?? []).filter((r, i) => r.use && !r.problems.length && checks[i]?.ok);
  const bad = (rows ?? []).filter((r, i) => r.problems.length || (checks[i] && !checks[i]!.ok)).length;

  async function go() {
    if (!rows || !ready.length) return;
    setBusy(true);
    const picked = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => r.use && !r.problems.length && checks[i]?.ok);
    const res = await importMany(picked.map(({ r }) => raw(r)));
    setBusy(false);
    if (res.ok) onClose();
    else if (res.lines.length) setServerLines(new Map(res.lines.map((l) => [picked[l.line - 1]?.i ?? -1, l.problem])));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width="sm:max-w-4xl"
      title={w.title}
      description={w.description}
      footer={
        <>
          <button type="button" className={secondary} onClick={onClose} disabled={busy}>
            {w.cancel}
          </button>
          <button type="button" className={primary} onClick={() => void go()} disabled={busy || !ready.length}>
            {busy ? w.adding : w.addN(ready.length)}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <textarea
          className={`${area} font-mono text-[12.5px] min-h-[7rem]`}
          value={text}
          onChange={(e) => read(e.target.value)}
          placeholder={w.sample}
          aria-label={w.pasted}
          data-autofocus
        />
        {!rows && (
          <Note>{w.known}</Note>
        )}
        {rows && (
          <>
            <p className="text-[12.5px] text-ink-soft">
              {w.read(rows.length)} · <b className="text-ink">{w.ready(ready.length)}</b>
              {bad ? (
                <>
                  {" "}
                  · <span className="text-red">{w.needLook(bad)}</span>
                </>
              ) : null}
              {w.guessed}
            </p>
            <div className="rounded-xl border border-line/10 overflow-auto max-h-[46dvh] styled-scroll">
              <table className="w-full text-[12.5px] min-w-[760px]">
                <thead className="sticky top-0 bg-surface-2 z-[1]">
                  <tr className="text-[10.5px] text-ink-faint uppercase tracking-wide">
                    <th className="px-2 py-1.5 text-left w-8" />
                    <th className="px-2 py-1.5 text-left">{w.day}</th>
                    <th className="px-2 py-1.5 text-left">{w.explanation}</th>
                    <th className="px-2 py-1.5 text-right">{w.amount}</th>
                    <th className="px-2 py-1.5 text-left">{w.column}</th>
                    <th className="px-2 py-1.5 text-left w-[230px]">{w.whatItIs}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const c = checks[i];
                    const problem = r.problems[0] ?? serverLines.get(i) ?? (c && !c.ok ? Object.values(c.problems).find(Boolean) : null);
                    const dir = r.input.direction;
                    return (
                      <tr key={i} className={`border-t border-line/10 align-top ${problem ? "bg-red/5" : r.use ? "" : "opacity-50"}`}>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={r.use && !problem}
                            disabled={!!problem}
                            onChange={(e) => setRows((l) => l!.map((x, k) => (k === i ? { ...x, use: e.target.checked } : x)))}
                            aria-label={w.addLine(r.line)}
                            className="accent-[rgb(var(--amber))]"
                          />
                        </td>
                        <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{r.input.entry_date ? formatDay(r.input.entry_date, "ro") : "—"}</td>
                        <td className="px-2 py-1.5">
                          <span className="block line-clamp-2">{r.input.explanation || "—"}</span>
                          {(r.input.doc_type || r.input.doc_number) && <span className="block text-[11px] text-ink-faint">{[r.input.doc_type ? docLabel(r.input.doc_type, b.lang) : "", r.input.doc_number].filter(Boolean).join(" ")}</span>}
                          {problem && <span className="block text-[11.5px] text-red mt-0.5">{w.lineProblem(r.line, problem)}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{r.input.amount != null ? formatLei(r.input.amount, b.lang) : "—"}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {dir ? (
                            <Badge tone={dir === "in" ? "green" : "plain"}>
                              {dir === "in" ? w.in : w.out} · {r.input.channel === "cash" ? w.cash : w.bank}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {dir ? (
                            <Select
                              value={r.pick}
                              onChange={(v) => setRows((l) => l!.map((x, k) => (k === i ? { ...x, pick: v, guessed: false } : x)))}
                              options={categoryOptions(dir, b.lang)}
                              variant="inline"
                              fullWidth
                              searchable
                              menuMinWidth={300}
                              ariaLabel={w.whatLine(r.line)}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
