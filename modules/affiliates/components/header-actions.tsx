"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CloseIcon, DownloadIcon, PlusIcon, SearchIcon, UploadIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { useAffiliates } from "./affiliates-context";
import { ExportDialog } from "./export-dialog";
import { PasteDialog } from "./paste-dialog";

const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line/15 bg-surface h-11 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors";

/**
 * Export (1.59.0: the whole table, with the password and a two-step code; everyone on the team, as picking some),
 * Paste from a spreadsheet (1.56.0) and New company (1.58.0; a sponsorship before): those two for Masters and the
 * people they let in.
 */
export function HeaderActions() {
  const ctx = useAffiliates();
  const [pasting, setPasting] = useState(false);
  const [exporting, setExporting] = useState(false);
  if (!ctx) return null;
  const total = ctx.companies.reduce((n, c) => n + c.products.length, 0);
  if (!ctx.manage && !total) return null;
  return (
    <div className="flex items-center gap-2">
      {total > 0 && (
        <button
          type="button"
          onClick={() => setExporting(true)}
          aria-label="Export the whole table"
          title="The whole table as a spreadsheet (CSV), with the companies, without logins. Takes your password and a two-step code."
          className={`${SECONDARY} w-11 sm:w-auto sm:px-4`}
        >
          <DownloadIcon className="w-4 h-4" />
          <span className="max-sm:hidden">Export</span>
        </button>
      )}
      {ctx.manage && (
        <>
          <button type="button" onClick={() => setPasting(true)} className={`${SECONDARY} px-4`} title="Add several at once, copied from a spreadsheet">
            <UploadIcon className="w-4 h-4" />
            <span className="max-sm:hidden">Paste from a sheet</span>
            <span className="sm:hidden">Paste</span>
          </button>
          <button
            type="button"
            onClick={() => ctx.openCompany("new")}
            title="A brand you work with: its code and affiliate platform, then its products"
            className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-11 text-[14.5px] shadow-[0_3px_0_0_rgb(var(--amber)/0.5)] hover:brightness-105 active:translate-y-[2px] active:shadow-none transition-all"
          >
            <PlusIcon className="w-4 h-4" strokeWidth={2.25} />
            <span className="max-sm:hidden">New company</span>
            <span className="sm:hidden">New</span>
          </button>
        </>
      )}
      {exporting && <ExportDialog teamId={ctx.teamId} ids={null} count={total} onClose={() => setExporting(false)} />}
      {pasting && <PasteDialog teamId={ctx.teamId} kinds={ctx.newKinds} companies={ctx.companies} onClose={() => setPasting(false)} />}
    </div>
  );
}

/** The first one, from the empty list. */
export function AddFirst() {
  const ctx = useAffiliates();
  if (!ctx?.manage) return null;
  return (
    <button type="button" onClick={() => ctx.openCompany("new")} className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-semibold px-4 py-2 text-[13px]">
      <PlusIcon className="w-4 h-4" /> New company
    </button>
  );
}

/**
 * Finding one: a company (its name, code, platform: all of its products then), or a product (its name, kind, code,
 * link or a video's title). The address changes as you type (the list is the server's,
 * filtered), quietly: the list stays until the new one is there, no skeleton for each letter.
 */
export function SearchField({ initial }: { initial: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(initial);
  const [pending, start] = useTransition();
  const timer = useRef<number | null>(null);
  useEffect(() => setQ(initial), [initial]);

  const go = (value: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const next = new URLSearchParams(params?.toString() ?? "");
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      start(() => router.replace(`${path}${next.toString() ? `?${next}` : ""}`, { scroll: false }));
    }, 250);
  };

  return (
    <div className="relative flex-shrink-0 w-[11.5rem] sm:w-60">
      <SearchIcon className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 ${pending ? "text-amber animate-pulse" : "text-ink-faint"}`} aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          go(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && q) {
            e.preventDefault();
            setQ("");
            go("");
          }
        }}
        placeholder="Find a company or product"
        aria-label="Find a company or a product: its name, type, code, a link or a video"
        className="w-full rounded-lg border border-line/15 bg-surface pl-8 pr-8 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber placeholder:text-ink-faint/70 [&::-webkit-search-cancel-button]:hidden"
        autoComplete="off"
        spellCheck={false}
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            go("");
          }}
          aria-label="Clear the search"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** Live: a teammate's change shows here (one refresh for a burst): the companies and their products, never a login. */
export function AffiliatesRealtime({ teamId }: { teamId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel(`affiliates:${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "affiliates", filter: `team_id=eq.${teamId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "affiliate_products", filter: `team_id=eq.${teamId}` }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [teamId, router]);
  return null;
}
