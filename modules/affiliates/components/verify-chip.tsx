"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { useToast } from "@/components/ui/toast-provider";
import { CheckIcon, CloseIcon } from "@/components/ui/icons";
import { wordColor } from "@/lib/word-color";
import { setProductsChecked } from "@/app/(dashboard)/sponsorships/actions";
import { CHECK_COLOR, CHECK_HINT, CHECK_LABEL, CHECK_STATES, checkState, type CheckState, type Product } from "../lib/rules";
import { useAffiliates } from "./affiliates-context";

/** "Nov 26, 2026" (the same on the server and in the browser). */
const dayOf = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/** "Verified by Ana, Nov 26, 2026", or that nobody has checked. */
export const checkText = (a: Pick<Product, "check">) => (a.check ? `${CHECK_LABEL[a.check.result]}${a.check.by ? ` by ${a.check.by}` : ""}, ${dayOf(a.check.at)}` : CHECK_HINT.none);

/**
 * Verified or not (1.58.0; the owner: "i want one more thing saying verified or not, because i will check to see if
 * they dont work or not"), on each product: Verified (green, the link and the code work), Not working (red), or Not
 * verified (nobody checked yet). Who checked and when on pointing at it. The people who manage sponsorships click it
 * to mark it (again: a new date); the database keeps who and when, and takes the mark away when the link or the code
 * it goes by changes (the company's too). `compact`: the icon alone (a phone's name line).
 */
export function VerifyChip({ product, compact = false }: { product: Product; compact?: boolean }) {
  const ctx = useAffiliates();
  const toast = useToast();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = product;
  const state = checkState(a);
  const c = CHECK_COLOR[state];
  const said = checkText(a);
  const face = (
    <>
      {busy ? (
        <span className="w-3 h-3 rounded-full border-2 border-current/30 border-t-current animate-spin flex-shrink-0" aria-hidden />
      ) : state === "works" ? (
        <CheckIcon className="w-3 h-3 flex-shrink-0" />
      ) : state === "broken" ? (
        <CloseIcon className="w-3 h-3 flex-shrink-0" />
      ) : (
        <span className="w-2 h-2 rounded-full border-[1.5px] border-current flex-shrink-0" aria-hidden />
      )}
      <span className={compact ? "sr-only" : ""}>{CHECK_LABEL[state]}</span>
    </>
  );
  const cls = `relative z-10 inline-flex items-center gap-1 rounded-md font-bold whitespace-nowrap text-[11px] ${compact ? "w-6 h-6 justify-center" : "px-2 h-6"} ${state === "none" ? "border border-dashed border-line/30 text-ink-faint" : ""}`;
  const style = state === "none" ? undefined : { color: wordColor(c), background: `color-mix(in srgb, ${c} 14%, rgb(var(--surface)))` };

  if (!ctx?.manage)
    return (
      <span className={cls} style={style} title={said}>
        {face}
      </span>
    );

  async function mark(to: CheckState) {
    setOpen(false);
    if (!ctx) return;
    setBusy(true);
    try {
      const r = await setProductsChecked(ctx.teamId, [a.id], to === "none" ? null : to);
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(`${a.name}: ${CHECK_LABEL[to]}${to !== "none" && to === state ? " again" : ""}`);
    } catch {
      toast.error("Couldn't mark it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        aria-label={`${a.name}: ${CHECK_LABEL[state]}. Mark it`}
        title={`${said}. Click to mark it.`}
        className={`${cls} transition-[filter,background-color] hover:brightness-95 ${state === "none" ? "hover:text-ink hover:border-line/50" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber`}
        style={style}
      >
        {face}
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={280} label={`${a.name}: verified or not`}>
        <div className="p-1">
          {CHECK_STATES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === state}
              onClick={() => void mark(s)}
              className="w-full flex items-start gap-2.5 text-left rounded-lg px-3 py-2 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
            >
              <span className="mt-1 w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: CHECK_COLOR[s] }} aria-hidden />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-ink">{CHECK_LABEL[s]}</span>
                <span className="block text-[11.5px] text-ink-faint">{CHECK_HINT[s]}</span>
              </span>
              {s === state && <CheckIcon className="mt-0.5 w-3.5 h-3.5 text-ink-faint flex-shrink-0" />}
            </button>
          ))}
          {a.check && <p className="mx-2 mt-1 pt-2 pb-1.5 border-t border-line/10 text-[11.5px] text-ink-faint">{said}. Marking it again moves the date.</p>}
        </div>
      </AnchoredMenu>
    </>
  );
}
