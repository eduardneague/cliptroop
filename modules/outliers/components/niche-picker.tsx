"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { CheckIcon, ChevronDownIcon, EditIcon, PlusIcon } from "@/components/ui/icons";
import { compact } from "../lib/filters";
import type { NicheInfo } from "../lib/types";
import { NicheDot } from "./bits";

/*
 * The niche being looked at (1.29.0): one button that says which it is, and
 * a menu with the team's niches (all of them together, each one, a new one)
 * and the explore niches (collected for everyone). Replaces the row of chips
 * and the separate Explore menu.
 */

export function nicheLabel(n: NicheInfo | null, hasOwn: boolean): string {
  if (!n) return hasOwn ? "All your niches" : "Every corner of YouTube";
  return n.name;
}

export function NichePicker({
  niches,
  explore,
  current,
  canManage,
  onPick,
  onAdd,
  onEdit,
}: {
  niches: NicheInfo[];
  explore: NicheInfo[];
  /** null: all the team's niches (or every explore niche, for a team without one). */
  current: NicheInfo | null;
  canManage: boolean;
  onPick: (id: string | null) => void;
  onAdd: () => void;
  onEdit: (n: NicheInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const pick = (id: string | null) => {
    setOpen(false);
    onPick(id);
  };
  const row = (on: boolean) => `w-full flex items-center gap-2.5 rounded-lg px-3 h-11 text-left text-[13.5px] hover:bg-surface-2 ${on ? "bg-surface-2 font-semibold" : ""}`;
  const hasOwn = niches.length > 0;

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="min-w-0 max-w-full inline-flex items-center gap-2.5 rounded-xl border border-line/15 bg-surface h-10 pl-3 pr-2.5 text-[14px] font-semibold hover:border-line/30 transition-colors"
      >
        {current ? <NicheDot color={current.color} className="w-3 h-3" /> : <span className="w-3 h-3 rounded-[3px] bg-ink flex-shrink-0" aria-hidden />}
        <span className="truncate">{nicheLabel(current, hasOwn)}</span>
        {current?.explore && <span className="flex-shrink-0 rounded-md bg-violet/12 text-violet px-1.5 h-5 inline-flex items-center text-[11px] font-bold">Explore</span>}
        <ChevronDownIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={anchor} width={580} align="left" label="Niches">
        <div className="p-1.5 max-h-[min(72vh,640px)] overflow-y-auto styled-scroll">
          <div className="flex items-center justify-between gap-2 px-3 pt-1.5 pb-1">
            <p className="text-[11.5px] font-semibold text-ink-faint">Your niches</p>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAdd();
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 h-7 text-[12.5px] font-semibold text-amber hover:bg-amber/10"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                New niche
              </button>
            )}
          </div>
          {hasOwn ? (
            <>
              {niches.length > 1 && (
                <button type="button" role="menuitem" onClick={() => pick(null)} className={row(!current)}>
                  <span className="w-3 h-3 rounded-[3px] bg-ink flex-shrink-0" aria-hidden />
                  <span className="flex-1 truncate">All your niches</span>
                  {!current && <CheckIcon className="w-4 h-4 text-amber" />}
                </button>
              )}
              {niches.map((n) => (
                <div key={n.id} className="flex items-center gap-1">
                  <button type="button" role="menuitem" onClick={() => pick(n.id)} className={`${row(current?.id === n.id)} flex-1 min-w-0`}>
                    <NicheDot color={n.color} className="w-3 h-3" />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{n.name}</span>
                      <span className="block text-[11.5px] font-normal text-ink-faint truncate">{nicheLine(n)}</span>
                    </span>
                    {current?.id === n.id && <CheckIcon className="w-4 h-4 text-amber flex-shrink-0" />}
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onEdit(n);
                      }}
                      aria-label={`Change ${n.name}`}
                      title="Change this niche"
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 flex-shrink-0"
                    >
                      <EditIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <div className="mx-1.5 mb-1 rounded-lg bg-surface-2/60 px-3 py-2.5 text-[12.5px] text-ink-soft">
              {canManage ? "No niche of your own yet: add one with the keywords and channels your videos are about." : "No niche of your own yet. A master or researcher adds one."}
            </div>
          )}

          {explore.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-line/10">
              <div className="px-3 pt-1 pb-1">
                <p className="text-[11.5px] font-semibold text-ink-faint">Explore</p>
                <p className="text-[11.5px] text-ink-faint">Every corner of YouTube, from well-known channels, collected for everyone</p>
              </div>
              {!hasOwn && (
                <button type="button" role="menuitem" onClick={() => pick(null)} className={row(!current)}>
                  <span className="w-3 h-3 rounded-[3px] bg-ink flex-shrink-0" aria-hidden />
                  <span className="flex-1 truncate">All of them together</span>
                  {!current && <CheckIcon className="w-4 h-4 text-amber" />}
                </button>
              )}
              <div className="grid sm:grid-cols-2 gap-0.5">
                {explore.map((e) => (
                  <button key={e.id} type="button" role="menuitem" onClick={() => pick(e.id)} className={`${row(current?.id === e.id)} !h-10`}>
                    <NicheDot color={e.color} />
                    <span className="flex-1 truncate">{e.name}</span>
                    <span className="text-[11px] text-ink-faint tabular-nums">{e.counts?.videos ? compact(e.counts.videos) : "new"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </AnchoredMenu>
    </>
  );
}

/** A niche in a few words: its channels and videos, or that it's still filling. */
export function nicheLine(n: NicheInfo): string {
  const own = n.groupN ? `${n.groupN} of your channels` : null;
  if (!n.counts || !n.counts.videos) return own ? `${own} · collecting` : "Collecting the first videos";
  return [own, `${compact(n.counts.channels)} channels`, `${compact(n.counts.videos)} videos`, `${compact(n.counts.outliers)} outliers`].filter(Boolean).join(" · ");
}
