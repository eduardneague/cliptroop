"use client";

import { useState } from "react";
import { smallPicture, type Company, type Product } from "../lib/rules";
import { BrandBadge } from "./bits";

/**
 * Where a product's initial is (1.57.0): the product's picture once there's one, else (none yet, or it doesn't open)
 * the initial in its colour. Carries data-row-num like the initial, so picking several puts the tick box
 * in its place. The picture is asked for without saying which page wants it (no referrer), smaller where the shop's
 * picture server makes it so.
 */
export function BrandMark({ item, className, px }: { item: Pick<Product, "id" | "name" | "picture">; className: string; px: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = item.picture?.url ?? null;
  if (!url || failed === url) return <BrandBadge id={item.id} name={item.name} className={className} />;
  return (
    <span data-row-num="" className={`${className} rounded-lg overflow-hidden flex-shrink-0 bg-white ring-1 ring-inset ring-line/10 select-none`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={smallPicture(url, px * 2)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(url)} className="w-full h-full object-cover" />
    </span>
  );
}

/**
 * A company's own mark (1.60.0): its picture (its logo, uploaded or a link) whole on white, else (none, or it doesn't
 * open) its initial in its colour. Never a tick box's place (a company's heading has its own).
 */
export function CompanyMark({ company, className, px }: { company: Pick<Company, "id" | "name" | "picture">; className: string; px: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = company.picture;
  if (!url || failed === url) return <BrandBadge id={company.id} name={company.name} pick={false} className={className} />;
  return (
    <span className={`${className} rounded-lg overflow-hidden flex-shrink-0 bg-white ring-1 ring-inset ring-line/10 select-none flex items-center justify-center`} aria-hidden data-company-picture="">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={smallPicture(url, px * 2)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(url)} className="w-full h-full object-contain p-[2px]" />
    </span>
  );
}
