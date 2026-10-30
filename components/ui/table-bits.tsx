"use client";

import { useCallback, useEffect, useState } from "react";
import { GridIcon, ListIcon } from "./icons";
import { Segmented } from "./segmented";

/*
 * Small pieces for screens that offer a table (1.18.0: Objectives,
 * Projections): a Table / Cards switch remembered on this device, and column
 * headings that sort when you click them (again to flip the order).
 */

/** The view picked last on this device (`key` in localStorage); `fallback` until then. */
export function useStoredView<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [view, setView] = useState<T>(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v && (allowed as readonly string[]).includes(v)) setView(v as T);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const pick = useCallback(
    (v: T) => {
      setView(v);
      try {
        localStorage.setItem(key, v);
      } catch {}
    },
    [key]
  );
  return [view, pick];
}

export type Layout = "table" | "cards";
export const LAYOUTS = ["table", "cards"] as const;

/** Table or Cards (the words hide on phones; the icons stay). */
export function LayoutSwitch({ value, onChange, className = "", size = "md" }: { value: Layout; onChange: (v: Layout) => void; className?: string; /** 1.43.0: as tall as the row it's in. */ size?: "sm" | "md" | "lg" }) {
  return (
    <Segmented<Layout>
      ariaLabel="Show as"
      value={value}
      onChange={onChange}
      size={size}
      className={className}
      options={[
        {
          value: "table",
          title: "Table",
          label: (
            <>
              <ListIcon className="w-4 h-4" />
              <span className="sr-only md:not-sr-only">Table</span>
            </>
          ),
        },
        {
          value: "cards",
          title: "Cards",
          label: (
            <>
              <GridIcon className="w-4 h-4" />
              <span className="sr-only md:not-sr-only">Cards</span>
            </>
          ),
        },
      ]}
    />
  );
}

export type SortState<K extends string> = { key: K; dir: 1 | -1 };

/** The next sort after clicking `key`: the same column flips, a new one starts with `first`. */
export const nextSort = <K extends string>(s: SortState<K>, key: K, first: 1 | -1 = -1): SortState<K> => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : first });

/** A column heading that sorts (aria-sort says how it's sorted now). */
export function SortTh<K extends string>({
  k,
  sort,
  onSort,
  children,
  align = "left",
  title,
  className = "",
}: {
  k: K;
  sort: SortState<K>;
  onSort: (k: K) => void;
  children: React.ReactNode;
  align?: "left" | "right";
  title?: string;
  className?: string;
}) {
  const on = sort.key === k;
  return (
    <th scope="col" className={`px-3 py-2 font-bold whitespace-nowrap ${align === "right" ? "text-right" : "text-left"} ${className}`} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" title={title} onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink ${on ? "text-ink" : ""}`}>
        {children}
        <svg viewBox="0 0 10 10" className={`w-2 h-2 transition-transform ${on ? "" : "opacity-0"} ${on && sort.dir === 1 ? "rotate-180" : ""}`} aria-hidden>
          <path d="M1.5 3.2h7L5 7.6Z" fill="currentColor" />
        </svg>
      </button>
    </th>
  );
}
