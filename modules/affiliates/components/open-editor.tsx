"use client";

import type { Product } from "../lib/rules";
import { useAffiliates } from "./affiliates-context";

/**
 * A product's name: for the people who manage sponsorships, a button over its whole row or card that opens it to edit
 * (the controls on it sit above); for everyone else, just its name.
 */
export function OpenEditor({ product, className = "" }: { product: Product; className?: string }) {
  const ctx = useAffiliates();
  if (!ctx?.manage)
    return (
      <span data-row-title="" className={className}>
        {product.name}
      </span>
    );
  return (
    <button type="button" data-row-title="" onClick={() => ctx.openProduct(product)} aria-label={`Edit ${product.name}`} title={`Edit ${product.name}`} className={`text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-amber focus-visible:after:rounded-[inherit] ${className}`}>
      {product.name}
    </button>
  );
}
