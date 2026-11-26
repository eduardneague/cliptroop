"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { importSponsorships } from "@/app/(dashboard)/sponsorships/actions";
import { KIND_TAB, LIMITS, PAYOUT_LABEL, parsePasted, planImport, type Company, type DealKind } from "../lib/rules";
import { KindPill } from "./bits";
import { PayoutIcon, payoutStyle } from "./payout";

/**
 * Sponsorships from a spreadsheet (1.56.0): the owner keeps them in one (Name, Product Link, Code, Percentage). Its
 * rows are copied and pasted here, shown as they'll be added (with what's wrong with any), then added at once. Their
 * kind: a Type column when the sheet has one, else the tab it's pasted on (1.57.0). 1.58.0: each row a product, put
 * with its company (a Company column, else its brand: a company here already, or a new one with the code most of its
 * rows have; a row with another code keeps its own), as planImport says, here and again on the server. Logins and
 * videos are added afterwards; the product pictures are looked for by the server once they're in.
 */
export function PasteDialog({ teamId, kinds, companies, onClose }: { teamId: string; kinds: DealKind[]; companies: Pick<Company, "id" | "name" | "code" | "percentage">[]; onClose: () => void }) {
  const toast = useToast();
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const parsed = useMemo(() => parsePasted(text, kinds), [text, kinds]);
  const good = useMemo(() => parsed.rows.filter((r) => r.fields), [parsed]);
  const bad = parsed.rows.filter((r) => !r.fields);
  const plan = useMemo(() => planImport(good.map((g) => g.fields!), companies), [good, companies]);
  const fresh = plan.filter((g) => !g.id).length;

  useEffect(() => {
    const t = requestAnimationFrame(() => box.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  async function add() {
    if (!good.length || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const r = await importSponsorships(
        teamId,
        good.map((g) => g.fields)
      );
      if (r.error !== undefined) return void setProblem(r.error);
      toast.success(`${r.products === 1 ? "1 product" : `${r.products} products`} added${r.companies ? `, with ${r.companies === 1 ? "a new company" : `${r.companies} new companies`}` : ""}`);
      onClose();
    } catch {
      setProblem("Couldn't add them. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      width="sm:max-w-2xl"
      title="Paste from a spreadsheet"
      description={`Select the rows in your sheet (the heading row too, if it has one), copy them, and paste them here. Columns: name, product link, code, percentage; a company, a type, a platform link and notes if you have them. Without a company each goes with its brand (“Gravastar K98” with Gravastar); without a type they're added as ${kinds.map((k) => KIND_TAB[k].toLowerCase()).join(" + ")}.`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={pending} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => void add()} disabled={!good.length || pending} className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-45">
            {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
            {pending ? "Adding…" : good.length ? `Add ${good.length === 1 ? "1 product" : `${good.length} products`}` : "Add"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label htmlFor={id} className="sr-only">
          Rows from a spreadsheet
        </label>
        <textarea
          ref={box}
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={"Name\tProduct Link\tCode\tPercentage\nGravastar K98 PRO\thttps://www.gravastar.com/…\tVIVERRO\t10%"}
          className="w-full rounded-xl border border-line/15 bg-surface px-3.5 py-2.5 text-[12.5px] font-mono outline-none focus:ring-2 focus:ring-amber resize-y min-h-[7rem] placeholder:text-ink-faint/60"
        />
        {parsed.rows.length > 0 && (
          <div className="rounded-xl border border-line/15 overflow-hidden">
            <div className="px-3 py-2 bg-surface-2 text-[11.5px] font-semibold text-ink-soft flex items-center gap-2">
              <span className="flex-1">
                {good.length === 1 ? "1 product" : `${good.length} products`} to add
                {plan.length ? ` to ${plan.length === 1 ? "1 company" : `${plan.length} companies`}${fresh ? ` (${fresh === plan.length ? (fresh === 1 ? "new" : "all new") : `${fresh} new`})` : ""}` : ""}
                {bad.length ? `, ${bad.length} with something to fix` : ""}
                {parsed.header ? " · the first row was the headings" : ""}
              </span>
              {parsed.rows.length >= LIMITS.import && <span className="text-coral">At most {LIMITS.import} at once</span>}
            </div>
            <ul className="max-h-72 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll" aria-label="What will be added">
              {plan.map((g) => (
                <li key={g.id ?? `new:${g.name}`} className="border-b border-line/10 last:border-b-0">
                  <div className="px-3 pt-2 pb-1 flex items-center gap-2 text-[12.5px]">
                    <span className="font-bold truncate">{g.name}</span>
                    <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${g.id ? "bg-surface-2 text-ink-soft" : "bg-amber/15 text-amber"}`}>{g.id ? "Here already" : "New company"}</span>
                    {!g.id && (g.code || g.percentage) && <span className="ml-auto font-mono text-[11.5px] text-ink-soft whitespace-nowrap">{[g.code, g.percentage].filter(Boolean).join(" · ")}</span>}
                    {!g.id && g.payout && (
                      <span className={`${g.code || g.percentage ? "" : "ml-auto "}inline-flex items-center gap-1 rounded-md px-1.5 h-5 text-[10.5px] font-bold whitespace-nowrap`} style={payoutStyle(g.payout)} title="Where its money goes">
                        <PayoutIcon payout={g.payout} className="w-3 h-3" />
                        {PAYOUT_LABEL[g.payout]}
                      </span>
                    )}
                  </div>
                  <ul className="pb-1.5">
                    {g.products.map((r, i) => (
                      <li key={i} className="pl-6 pr-3 py-1 text-[12.5px] grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3 items-center">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold truncate">{r.name}</span>
                          {r.kinds.map((k) => (
                            <KindPill key={k} kind={k} />
                          ))}
                        </span>
                        <span className="truncate text-ink-faint">{r.productUrl ?? "No link"}</span>
                        <span className="text-[11.5px] whitespace-nowrap">
                          {r.ownCode ? <span className="font-mono text-ink-soft">{[r.code, r.percentage].filter(Boolean).join(" · ") || "No code"}</span> : <span className="text-ink-faint">The company&rsquo;s</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {bad.map((r) => (
                <li key={r.line} className="px-3 py-2 text-[12.5px] grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3 items-center border-t border-line/10">
                  <span className="font-semibold truncate">{r.name}</span>
                  <span className="truncate text-red" role="note">
                    Line {r.line}: {r.error}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {problem && (
          <p role="alert" className="rounded-xl bg-red/10 text-red text-[13px] px-3.5 py-2.5">
            {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
