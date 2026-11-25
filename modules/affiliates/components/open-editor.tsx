"use client";

import type { Affiliate } from "../lib/rules";
import { useAffiliates } from "./affiliates-context";

/**
 * An affiliate's name: for the people who manage affiliates, a button over its whole row or card that opens it to
 * edit (the controls on it sit above); for everyone else, just its name.
 */
export function OpenEditor({ affiliate, className = "" }: { affiliate: Affiliate; className?: string }) {
  const ctx = useAffiliates();
  if (!ctx?.manage)
    return (
      <span data-row-title="" className={className}>
        {affiliate.name}
      </span>
    );
  return (
    <button type="button" data-row-title="" onClick={() => ctx.openEditor(affiliate)} aria-label={`Edit ${affiliate.name}`} title={`Edit ${affiliate.name}`} className={`text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-amber focus-visible:after:rounded-[inherit] ${className}`}>
      {affiliate.name}
    </button>
  );
}
