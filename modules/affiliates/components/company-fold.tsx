"use client";

import { ChevronRightIcon, PlusIcon } from "@/components/ui/icons";
import { useAffiliates } from "./affiliates-context";

/*
 * A company on the list, folded or open (1.58.0; the owner: "we should have groups in the table, dropdowns"): its
 * heading row folds it when clicked anywhere but on its controls (the arrow is the button for the keyboard), the
 * products under it drawn only while it's open, and one button for all of them. Which are folded is the viewer's own
 * (kept for the next visit: affiliates-context.tsx); a search shows them all open.
 */

/** Clicks the heading's own controls (or their menus) keep; a drag that selects text doesn't fold it either. */
const OWN = "button, a, input, select, textarea, label, [role='menu'], [role='menuitem'], [role='dialog']";

/** A company's heading row: a click on it (not on its controls) folds or opens the company. */
export function FoldRow({ id, className, children }: { id: string; className: string; children: React.ReactNode }) {
  const ctx = useAffiliates();
  return (
    <div
      data-fold-row=""
      className={`${className} cursor-pointer`}
      onClick={(e) => {
        if (e.detail > 1 || (e.target as HTMLElement).closest(OWN) || window.getSelection()?.toString()) return;
        ctx?.toggle(id);
      }}
    >
      {children}
    </div>
  );
}

/** The arrow: the button that folds or opens it (the heading row does too, for a pointer). */
export function FoldButton({ id, name, count, className = "" }: { id: string; name: string; count: number; className?: string }) {
  const ctx = useAffiliates();
  const open = ctx ? ctx.isOpen(id) : true;
  return (
    <button
      type="button"
      onClick={() => ctx?.toggle(id)}
      aria-expanded={open}
      aria-controls={`products-${id}`}
      aria-label={`${name}: ${count === 1 ? "1 product" : `${count} products`}. ${open ? "Fold it" : "Open it"}`}
      title={open ? "Fold" : "Open"}
      className={`w-6 h-8 flex-shrink-0 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-line/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${className}`}
    >
      <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
    </button>
  );
}

/**
 * A company's box among the cards (1.58.0): as wide as its products need while it's open (`open`: up to four cards'
 * columns), one column folded.
 */
export function FoldBox({ id, open, className, label, children }: { id: string; open: string; className: string; label: string; children: React.ReactNode }) {
  const ctx = useAffiliates();
  return (
    <section data-item-id={id} aria-label={label} className={`${className} ${!ctx || ctx.isOpen(id) ? open : ""}`}>
      {children}
    </section>
  );
}

/** The company's products, while it's open. */
export function FoldBody({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = useAffiliates();
  if (ctx && !ctx.isOpen(id)) return null;
  return <div id={`products-${id}`}>{children}</div>;
}

/** Fold all of these, or open them all (when some are folded). */
export function FoldAll({ ids }: { ids: string[] }) {
  const ctx = useAffiliates();
  if (!ctx || ids.length < 2) return null;
  const folded = ids.filter((id) => !ctx.isOpen(id)).length;
  const opening = folded > 0;
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(ids, opening)}
      title={opening ? `Open the ${folded === 1 ? "folded company" : `${folded} folded companies`}` : "Fold every company to its heading"}
      className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-line/15 h-9 px-2.5 sm:px-3 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
    >
      <ChevronRightIcon className={`w-4 h-4 transition-transform ${opening ? "" : "rotate-90"}`} />
      <span className="hidden sm:inline">{opening ? "Open all" : "Fold all"}</span>
    </button>
  );
}

/** A product added to this company (for the people who manage sponsorships). */
export function AddProduct({ companyId, name, wide = false, className = "", label }: { companyId: string; name: string; wide?: boolean; className?: string; label?: string }) {
  const ctx = useAffiliates();
  if (!ctx?.manage) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.openProduct({ companyId })}
      aria-label={`Add a product to ${name}`}
      title={`Add a product to ${name}`}
      className={`relative z-10 inline-flex items-center gap-1 rounded-lg h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${wide ? "px-2.5 border border-line/15" : "px-2"} ${className}`}
    >
      <PlusIcon className="w-3.5 h-3.5" />
      <span className={label ?? (wide ? "" : "max-md:sr-only")}>{wide ? "Add a product" : "Product"}</span>
    </button>
  );
}
