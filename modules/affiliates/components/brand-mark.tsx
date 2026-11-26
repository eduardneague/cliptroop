"use client";

import { useState } from "react";
import { smallPicture, type Affiliate } from "../lib/rules";
import { BrandBadge } from "./bits";

/**
 * Where a sponsorship's brand initial is (1.57.0): the product's picture once there's one, else (none yet, or it
 * doesn't open) the initial in its colour. Carries data-row-num like the initial, so picking several puts the tick box
 * in its place. The picture is asked for without saying which page wants it (no referrer), smaller where the shop's
 * picture server makes it so.
 */
export function BrandMark({ affiliate, className, px }: { affiliate: Pick<Affiliate, "id" | "name" | "picture">; className: string; px: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = affiliate.picture?.url ?? null;
  if (!url || failed === url) return <BrandBadge id={affiliate.id} name={affiliate.name} className={className} />;
  return (
    <span data-row-num="" className={`${className} rounded-lg overflow-hidden flex-shrink-0 bg-white ring-1 ring-inset ring-line/10 select-none`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={smallPicture(url, px * 2)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(url)} className="w-full h-full object-cover" />
    </span>
  );
}
