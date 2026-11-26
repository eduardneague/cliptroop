import Link from "next/link";
import { LockIcon } from "@/components/ui/icons";
import { PendingNav, PendingSwap } from "@/components/ui/pending-nav";
import { ViewToggle } from "@/components/ui/view-toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { FiltersMenu } from "@/modules/short-videos/components/filters-menu";
import { setAffiliatesViewMode } from "@/app/(dashboard)/sponsorships/view-mode-actions";
import { AFFILIATES_VIEW_COOKIE } from "../lib/view-mode";
import {
  AFFILIATE_STATUSES,
  applyFilters,
  DEAL_KINDS,
  filtersHref,
  KIND_COLOR,
  KIND_TAB,
  SORT_LABEL,
  SORTS,
  SPONSORSHIPS_PATH,
  STATUS_COLOR,
  STATUS_LABEL,
  type AccessPerson,
  type Affiliate,
  type AffiliateFilters,
} from "../lib/rules";
import { AffiliatesProvider } from "./affiliates-context";
import { AffiliatesPicker, PickAffiliatesButton } from "./affiliates-picker";
import { AffiliatesTable } from "./affiliates-table";
import { AffiliateCards } from "./affiliate-cards";
import { AddFirst, AffiliatesRealtime, HeaderActions, SearchField } from "./header-actions";
import { KindTabs } from "./kind-tabs";
import { AffiliateCardsSkeleton, AffiliatesTableSkeleton } from "./list-skeletons";
import { LoginsBar } from "./logins-bar";

/*
 * The Sponsorships page (Affiliates in 1.56.0), drawn from what the server read (app/(dashboard)/sponsorships/page.tsx).
 * 1.57.0: tabs for the kinds of deal (all, affiliates, reviews, paid: one list, a sponsorship in each of its kinds'
 * tabs; the owner: "maybe add a tag or something so we dont have 2 separate tables … make it so you can filter through
 * it very easily"). As the shorts list: a step-like filter by status, Filters (the video, a code, a login, the order),
 * Select for several at once, and the table or the cards (the choice remembered); the counts are the tab's. The
 * browser's parts sit on it: the add / edit window, the logins, the picking bar. Out of page.tsx so the harness draws
 * the real thing.
 */

export type AffiliatesBodyProps = {
  teamId: string;
  teamName: string;
  me: string;
  affiliates: Affiliate[];
  master: boolean;
  manage: boolean;
  vault: boolean;
  unlockedUntil: number | null;
  people: AccessPerson[];
  filters: AffiliateFilters;
  isTable: boolean;
};

export function AffiliatesBody(p: AffiliatesBodyProps) {
  const { affiliates: everyone, filters: f, manage } = p;
  const list = applyFilters(everyone, f);
  // The tab's own: what the status chips and the filters count.
  const all = f.kind ? everyone.filter((a) => a.kinds.includes(f.kind!)) : everyone;
  const count = (s: string) => all.filter((a) => a.status === s).length;
  const withVideo = all.filter((a) => a.long || a.short).length;
  const withLogin = all.filter((a) => a.login).length;
  const href = (next: Partial<AffiliateFilters>) => filtersHref(f, next);
  const qs = new URLSearchParams(filtersHref(f).split("?")[1] ?? "").toString();
  const filtered = !!(f.status || f.video || f.code || f.login || f.q.trim());
  const tabName = f.kind ? { affiliate: "affiliates", review: "reviews", paid: "paid deals" }[f.kind] : "sponsorships";

  return (
    <PendingNav>
      <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1500px] mx-auto">
        <AffiliatesRealtime teamId={p.teamId} />
        <AffiliatesProvider teamId={p.teamId} manage={manage} master={p.master} vault={p.vault} kind={f.kind} unlockedUntil={p.unlockedUntil}>
          <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
            <div>
              <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Sponsorships</h1>
              <p className="text-[14.5px] text-ink-soft">
                {everyone.length === 0
                  ? `${p.teamName}'s deals with brands: affiliate links and codes, products to review, paid videos.`
                  : [
                      `${everyone.length} sponsorship${everyone.length === 1 ? "" : "s"}`,
                      `${everyone.filter((a) => a.status === "active").length} active`,
                      everyone.some((a) => a.long || a.short) ? `${everyone.filter((a) => a.long || a.short).length} with a video` : null,
                      manage && everyone.some((a) => a.login) ? `${everyone.filter((a) => a.login).length} with a login` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
            </div>
            <HeaderActions />
          </div>

          <LoginsBar people={p.people} me={p.me} />

          <KindTabs
            tabs={[
              { key: "", label: "All", count: everyone.length, href: filtersHref(f, { kind: null }), color: null, active: !f.kind },
              ...DEAL_KINDS.map((k) => ({ key: k, label: KIND_TAB[k], count: everyone.filter((a) => a.kinds.includes(k)).length, href: filtersHref(f, { kind: k }), color: KIND_COLOR[k], active: f.kind === k })),
            ]}
          />

          <AffiliatesPicker items={list}>
            {/* One row at every screen size: status chips, the search, Select, the view. */}
            <div className="flex items-center gap-2 mb-6">
              <div className="-ml-4 pl-4 sm:ml-0 sm:pl-0 flex-1 min-w-0 overflow-x-auto no-scrollbar">
                <div className="flex gap-1 w-max items-center">
                  {[{ key: "", label: "All", count: all.length, color: null as string | null }, ...AFFILIATE_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], count: count(s), color: STATUS_COLOR[s] as string | null }))].map((c) => (
                    <FilterChip key={c.key || "all"} href={href({ status: (c.key || null) as AffiliateFilters["status"] })} navKey={`status:${c.key}`} active={(f.status ?? "") === c.key} label={c.label} count={c.count} color={c.color} tall />
                  ))}
                </div>
              </div>
              <span className="max-md:hidden">
                <SearchField initial={f.q} />
              </span>
              {list.length > 0 && <PickAffiliatesButton />}
              <ViewToggle value={p.isTable ? "table" : "grid"} cookie={AFFILIATES_VIEW_COOKIE} hrefs={{ grid: filtersHref(f, {}, "grid"), table: filtersHref(f, {}, "table") }} action={setAffiliatesViewMode} fields={{ qs }} />
            </div>

            <div className="-mt-3 mb-6 flex items-center gap-2 flex-wrap">
              <span className="md:hidden">
                <SearchField initial={f.q} />
              </span>
              <FiltersMenu
                sections={[
                  {
                    title: "Video",
                    items: [
                      { key: "video-any", kind: "radio", label: "Any", active: !f.video, href: href({ video: null }) },
                      { key: "video-long", kind: "radio", label: "Has a long video", count: all.filter((a) => a.long).length, active: f.video === "long", href: href({ video: f.video === "long" ? null : "long" }) },
                      { key: "video-short", kind: "radio", label: "Has a Short", count: all.filter((a) => a.short).length, active: f.video === "short", href: href({ video: f.video === "short" ? null : "short" }) },
                      { key: "video-none", kind: "radio", label: "No video yet", count: all.length - withVideo, active: f.video === "none", href: href({ video: f.video === "none" ? null : "none" }) },
                    ],
                  },
                  {
                    title: "Show",
                    items: [
                      { key: "code", kind: "check", label: "With a code", count: all.filter((a) => a.code).length, active: f.code, href: href({ code: !f.code }) },
                      ...(manage ? [{ key: "login", kind: "check" as const, label: "With a login", count: withLogin, active: f.login, href: href({ login: !f.login }) }] : []),
                    ],
                  },
                  {
                    title: "Order",
                    items: SORTS.map((s) => ({ key: `sort-${s}`, kind: "radio" as const, label: SORT_LABEL[s], active: f.sort === s, href: href({ sort: s }) })),
                  },
                ]}
                chips={[
                  ...(f.video ? [{ key: "video", label: f.video === "long" ? "Has a long video" : f.video === "short" ? "Has a Short" : "No video yet", clearHref: href({ video: null }) }] : []),
                  ...(f.code ? [{ key: "code", label: "With a code", clearHref: href({ code: false }) }] : []),
                  ...(f.login ? [{ key: "login", label: "With a login", clearHref: href({ login: false }) }] : []),
                  ...(f.sort !== "newest" ? [{ key: "sort", label: SORT_LABEL[f.sort], clearHref: href({ sort: "newest" }) }] : []),
                ]}
              />
            </div>

            {/* Switching view or filter: the list's skeleton answers at once. */}
            <PendingSwap fallback={p.isTable ? <AffiliatesTableSkeleton /> : <AffiliateCardsSkeleton />} fallbacks={{ grid: <AffiliateCardsSkeleton />, table: <AffiliatesTableSkeleton /> }}>
              {list.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-line/15 py-20 px-6 text-center">
                  <p className="text-[15px] font-semibold mb-1">{all.length === 0 ? `No ${tabName} yet` : "Nothing matches"}</p>
                  <p className="text-[13px] text-ink-faint mb-5 max-w-md mx-auto">
                    {everyone.length === 0
                      ? manage
                        ? "Add the brands you work with: the product link, the code for viewers, the video you made about it, and the login for their platform. Already in a spreadsheet? Paste from a sheet."
                        : "When a master adds the team's sponsorships, their links and codes show up here."
                      : all.length === 0
                        ? manage
                          ? `Add one, or mark ones you have: select them, then Type (or open one and pick its type).`
                          : "None of this kind yet."
                        : f.q.trim()
                          ? `Nothing called “${f.q.trim()}”${filtered ? " with these filters" : ""}.`
                          : "Try another status, or clear the filters."}
                  </p>
                  {all.length === 0 ? (
                    <AddFirst />
                  ) : (
                    <Link href={f.kind ? filtersHref({ ...f, status: null, video: null, code: false, login: false, sort: "newest", q: "" }) : SPONSORSHIPS_PATH} className="text-[13px] font-semibold text-amber">
                      Clear filters
                    </Link>
                  )}
                </div>
              ) : p.isTable ? (
                <AffiliatesTable list={list} manage={manage} tab={f.kind} />
              ) : (
                <AffiliateCards list={list} manage={manage} tab={f.kind} />
              )}
            </PendingSwap>
          </AffiliatesPicker>

          {all.length > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
              <LockIcon className="w-3 h-3 flex-shrink-0" />
              {manage
                ? "Logins are encrypted, open only after your password, and every look is written down for the masters. Click a code to copy it."
                : "Logins are kept apart: only masters and the people they choose see them. Click a code to copy it."}
            </p>
          )}
        </AffiliatesProvider>
      </div>
    </PendingNav>
  );
}
