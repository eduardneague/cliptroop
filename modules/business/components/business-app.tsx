"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startNavProgress } from "@/components/ui/nav-progress";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { UiLocale } from "@/components/ui/ui-locale";
import { LANG_COOKIE, pick, words } from "../lib/i18n";
import { regimeLabel, type Lang } from "../lib/kinds";
import { yearOf } from "../lib/money";
import { canEdit, closedYears, type Access, type BusinessPerson, type Entry, type YearBooks } from "../lib/types";
import { Ctx, type BooksState, type BusinessCtx } from "./context";
import { BUSINESS_TABS, type BusinessTab } from "./tabs";
import { BusinessTabSkeleton } from "./skeletons";
import { OverviewTab } from "./overview";
import { CashBookTab } from "./cash-book";
import { FiscalTab } from "./fiscal-view";
import { InventoryTab } from "./inventory-view";
import { AssetsTab } from "./assets-view";
import { SettingsTab } from "./settings-view";
import { SetupCard } from "./setup-card";
import { EntryDialog } from "./entry-dialog";
import { ExportDialog } from "./export-dialog";
import { secondary } from "./ui";

const W = words({
  title: { en: "Business", ro: "Contabilitate" },
  registersOf: { en: (team: string) => `${team}'s registers: cash book, fiscal register, inventory`, ro: (team: string) => `Registrele echipei ${team}: registrul-jurnal, evidența fiscală, inventarul` },
  yearGroup: { en: "Year", ro: "Anul" },
  yearBefore: { en: "The year before", ro: "Anul anterior" },
  theYear: { en: "The year", ro: "Anul" },
  yearAfter: { en: "The year after", ro: "Anul următor" },
  closedYear: { en: "Closed", ro: "Închis" },
  export: { en: "Export", ro: "Exportă" },
  language: { en: "The page's language", ro: "Limba paginii" },
  tabs: { en: "Business", ro: "Contabilitate" },
  needs0120: { en: "Business needs migration 0120 on this database.", ro: "Pentru Contabilitate, baza de date are nevoie de migrarea 0120." },
  loading: { en: "Loading", ro: "Se încarcă" },
});

/*
 * Business (1.42.0): the page. The owner: "o pagină de business, construită în engleză… un astfel de tabel Excel type
 * cu evidențe pentru firmă… să țin aceste trei registre". One year's books at a time; the tabs share them, so going
 * from one to another is instant (the address keeps ?tab= for a refresh or a link); another year comes from the
 * server. Until the PFA is set up (its name, CUI, where the books start), that comes first. In English or Romanian
 * (the switch at the top, remembered in this browser by a cookie the server reads too, so a page opens in it).
 */

export function BusinessApp({
  teamId,
  teamName,
  me,
  access,
  initialTab,
  initialLang = "en",
  today,
  data,
  people: initialPeople,
}: {
  teamId: string;
  teamName: string;
  me: string;
  access: Access;
  initialTab: BusinessTab;
  initialLang?: Lang;
  today: string;
  data: YearBooks;
  people: BusinessPerson[] | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<BusinessTab>(initialTab);
  const [s, setS] = useState<BooksState>(() => ({
    profile: data.books.profile,
    setUp: data.setUp,
    sources: data.books.sources,
    entries: data.books.entries,
    assets: data.books.assets,
    inventories: data.books.inventories,
    items: data.books.items,
    refLines: data.books.refLines,
    years: data.books.years,
    files: data.files,
  }));
  const [people, setPeopleState] = useState<BusinessPerson[] | null>(initialPeople);
  // The page's language (the exports ask their own): a cookie keeps it in this browser for a year, and the server reads
  // it too (the page's first drawing, the actions' messages).
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    // The browser tab's title too (the server names it from the cookie on the next page).
    const t = document.title;
    const rest = t.indexOf(" · ");
    if (/^(Business|Contabilitate)( · |$)/.test(t)) document.title = `${W.title[l]}${rest >= 0 ? t.slice(rest) : ""}`;
  }, []);
  const w = useMemo(() => pick(W, lang), [lang]);
  const [entryWin, setEntryWin] = useState<{ entry: Entry | null; draft: Partial<Entry> | null; reverse: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [goingYear, startYear] = useTransition();
  const [pendingYear, setPendingYear] = useState<number | null>(null);
  const year = data.year;

  const urlFor = useCallback(
    (t: BusinessTab, y: number) => {
      const q = new URLSearchParams();
      if (y !== yearOf(today)) q.set("year", String(y));
      if (t !== "overview") q.set("tab", t);
      const qs = q.toString();
      return `/business${qs ? `?${qs}` : ""}`;
    },
    [today]
  );
  const goTab = useCallback(
    (t: string) => {
      const next = BUSINESS_TABS.find((x) => x.id === t)?.id ?? "overview";
      setTab(next);
      // The address follows (a refresh or a link opens the same tab), without asking the server again.
      window.history.replaceState(window.history.state, "", urlFor(next, year));
    },
    [urlFor, year]
  );
  const goYear = useCallback(
    (y: number) => {
      if (y === year) return;
      setPendingYear(y);
      startNavProgress();
      startYear(() => router.push(urlFor(tab, y), { scroll: false }));
    },
    [router, tab, urlFor, year]
  );

  const closed = useMemo(() => closedYears(s.years), [s.years]);
  const value: BusinessCtx = useMemo(
    () => ({
      teamId,
      teamName,
      me,
      access,
      edit: canEdit(access),
      year,
      years: data.years,
      today,
      prior: { year, balances: data.prior },
      s,
      books: { profile: s.profile, sources: s.sources, entries: s.entries, assets: s.assets, inventories: s.inventories, items: s.items, refLines: s.refLines, years: s.years },
      closed: closed.has(year),
      writable: canEdit(access) && !closed.has(year),
      closedYears: closed,
      patch: (fn) => setS(fn),
      lang,
      setLang,
      people,
      setPeople: (fn) => setPeopleState((p) => (p ? fn(p) : p)),
      goTab,
      goYear,
      openEntry: (o) => setEntryWin({ entry: o.entry ?? null, draft: o.draft ?? null, reverse: !!o.reverse }),
    }),
    [teamId, teamName, me, access, year, data.years, today, data.prior, s, closed, lang, setLang, people, goTab, goYear]
  );

  const p = s.profile;
  const facts = [p.cui ? `CUI ${p.cui}` : null, regimeLabel(p.regime, lang)].filter(Boolean).join(" · ");
  const yearOptions = data.years.map((y) => ({ value: String(y), label: String(y), hint: closed.has(y) ? w.closedYear : undefined }));
  const shownYear = goingYear && pendingYear ? pendingYear : year;
  const needsSetup = !s.setUp && tab !== "settings";

  return (
    <Ctx.Provider value={value}>
      <UiLocale value={lang}>
      <div lang={lang} className="px-4 sm:px-6 xl:px-8 py-6 sm:py-8 max-w-[1480px] mx-auto space-y-5">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-semibold">{w.title}</h1>
            <p className="text-[13px] text-ink-soft max-w-[80ch]">
              {s.setUp ? (
                <>
                  <span className="font-semibold text-ink">{p.name || teamName}</span>
                  {facts ? ` · ${facts}` : ""}
                </>
              ) : (
                w.registersOf(teamName)
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Segmented
              ariaLabel={w.language}
              value={lang}
              onChange={setLang}
              options={[
                { value: "en", label: "EN", title: "English" },
                { value: "ro", label: "RO", title: "Română" },
              ]}
            />
            <div className="inline-flex items-center rounded-lg border border-line/15 bg-surface h-9" role="group" aria-label={w.yearGroup}>
              <button
                type="button"
                onClick={() => goYear(year - 1)}
                disabled={goingYear || !data.years.includes(year - 1)}
                aria-label={w.yearBefore}
                className="w-8 h-full flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-30"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <Select
                value={String(shownYear)}
                onChange={(v) => v && goYear(Number(v))}
                options={yearOptions}
                variant="inline"
                ariaLabel={w.theYear}
                menuMinWidth={140}
                renderValue={() => <span className="font-display text-[15px] font-semibold tabular-nums px-1">{shownYear}</span>}
              />
              <button
                type="button"
                onClick={() => goYear(year + 1)}
                disabled={goingYear || !data.years.includes(year + 1)}
                aria-label={w.yearAfter}
                className="w-8 h-full flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-30"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
            <button type="button" className={secondary} onClick={() => setExporting(true)} disabled={!s.setUp}>
              <DownloadIcon className="w-4 h-4" />
              {w.export}
            </button>
          </div>
        </header>

        <nav className="relative flex items-center gap-1 border-b border-line/15 overflow-x-auto no-scrollbar -mx-1 px-1" aria-label={w.tabs}>
          {BUSINESS_TABS.map((t) => {
            const on = t.id === tab;
            return (
              <a
                key={t.id}
                href={urlFor(t.id, year)}
                data-no-progress
                aria-current={on ? "page" : undefined}
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  goTab(t.id);
                }}
                className={`relative px-3.5 h-11 inline-flex items-center text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {t.label[lang]}
                <span aria-hidden className={`absolute left-2 right-2 bottom-0 h-[2.5px] rounded-t-[2px] bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
              </a>
            );
          })}
        </nav>

        {data.error && <p className="rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5">{data.error}</p>}
        {!data.ready ? (
          <p className="rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5">{w.needs0120}</p>
        ) : goingYear ? (
          <div role="status" aria-busy="true" aria-label={w.loading}>
            <BusinessTabSkeleton tab={tab} />
          </div>
        ) : needsSetup ? (
          <SetupCard />
        ) : (
          <div key={tab} className="biz-tab-in">
            {tab === "overview" && <OverviewTab />}
            {tab === "cashbook" && <CashBookTab />}
            {tab === "fiscal" && <FiscalTab />}
            {tab === "inventory" && <InventoryTab />}
            {tab === "assets" && <AssetsTab />}
            {tab === "settings" && <SettingsTab />}
          </div>
        )}
      </div>
      {entryWin && <EntryDialog key={entryWin.entry?.id ?? "new"} entry={entryWin.entry} draft={entryWin.draft} reverse={entryWin.reverse} onClose={() => setEntryWin(null)} />}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      </UiLocale>
    </Ctx.Provider>
  );
}
