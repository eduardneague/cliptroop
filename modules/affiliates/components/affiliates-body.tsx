import Link from "next/link";
import { LockIcon } from "@/components/ui/icons";
import { PendingNav, PendingSwap } from "@/components/ui/pending-nav";
import { ViewToggle } from "@/components/ui/view-toggle";
import { FiltersMenu } from "@/modules/short-videos/components/filters-menu";
import { setAffiliatesViewMode } from "@/app/(dashboard)/sponsorships/view-mode-actions";
import { AFFILIATES_VIEW_COOKIE } from "../lib/view-mode";
import {
  AFFILIATE_STATUSES,
  applyFilters,
  CHECK_LABEL,
  CHECK_STATES,
  checkState,
  dealOf,
  DEAL_KINDS,
  filtersHref,
  itemsOf,
  KIND_COLOR,
  KIND_TAB,
  SORT_LABEL,
  SORTS,
  SPONSORSHIPS_PATH,
  STATUS_COLOR,
  STATUS_LABEL,
  type AccessPerson,
  type AffiliateFilters,
  type Company,
} from "../lib/rules";
import { AffiliatesProvider } from "./affiliates-context";
import { AffiliatesPicker, PickAffiliatesButton } from "./affiliates-picker";
import { AffiliatesTable } from "./affiliates-table";
import { AffiliateCards } from "./affiliate-cards";
import { FoldAll } from "./company-fold";
import { AddFirst, AffiliatesRealtime, HeaderActions, SearchField } from "./header-actions";
import { KindTabs } from "./kind-tabs";
import { AffiliateCardsSkeleton, AffiliatesTableSkeleton } from "./list-skeletons";
import { LoginsBar } from "./logins-bar";

/*
 * The Sponsorships page (Affiliates in 1.56.0), drawn from what the server read (app/(dashboard)/sponsorships/page.tsx).
 * 1.57.0: tabs for the kinds of deal (all, affiliates, reviews, paid: one list, a sponsorship in each of its kinds'
 * tabs; the owner: "maybe add a tag or something so we dont have 2 separate tables … make it so you can filter through
 * it very easily"). As the shorts list: Filters (the status, 1.60.0: All, Active, Paused, Ended, a row of chips before;
 * verified, the video, a code, a login, the order), Select for several at once, and the table or the cards (the choice
 * remembered); the counts are the tab's. The
 * browser's parts sit on it: the add / edit windows, the logins, the picking bar. 1.58.0: companies with their
 * products (the owner: "we should have groups in the table, dropdowns"), folding (all at once too); the tabs, the
 * status chips and the filters count products, the logins companies. Out of page.tsx so the harness draws the real
 * thing.
 */

export type AffiliatesBodyProps = {
  teamId: string;
  teamName: string;
  me: string;
  companies: Company[];
  /** The companies this viewer folded (rules.ts closedKey), from the cookie. */
  closed: string[];
  master: boolean;
  manage: boolean;
  vault: boolean;
  unlockedUntil: number | null;
  people: AccessPerson[];
  filters: AffiliateFilters;
  isTable: boolean;
  /** Where a company's money goes and its picture can be set (0139 is in). */
  extras: boolean;
};

export function AffiliatesBody(p: AffiliatesBodyProps) {
  const { companies, filters: f, manage } = p;
  const list = applyFilters(companies, f);
  const items = itemsOf(companies);
  // The tab's own: what the status chips and the filters count (products; the logins: their companies).
  const tab = f.kind ? items.filter((i) => i.product.kinds.includes(f.kind!)) : items;
  const all = tab.map((i) => i.product);
  const count = (s: string) => all.filter((a) => a.status === s).length;
  const withVideo = all.filter((a) => a.long || a.short).length;
  const withLogin = (f.kind ? companies.filter((c) => c.products.some((x) => x.kinds.includes(f.kind!))) : companies).filter((c) => c.login).length;
  const href = (next: Partial<AffiliateFilters>) => filtersHref(f, next);
  const qs = new URLSearchParams(filtersHref(f).split("?")[1] ?? "").toString();
  const filtered = !!(f.status || f.checked || f.video || f.code || f.login || f.q.trim());
  const tabName = f.kind ? { affiliate: "affiliates", review: "reviews", paid: "paid deals" }[f.kind] : "sponsorships";
  const shown = itemsOf(list).length;
  const everything = items.map((i) => i.product);

  return (
    <PendingNav>
      <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1500px] mx-auto">
        <AffiliatesRealtime teamId={p.teamId} />
        <AffiliatesProvider teamId={p.teamId} companies={companies} manage={manage} master={p.master} vault={p.vault} extras={p.extras} kind={f.kind} unlockedUntil={p.unlockedUntil} closed={p.closed} searching={!!f.q.trim()}>
          <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
            <div>
              <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Sponsorships</h1>
              <p className="text-[14.5px] text-ink-soft">
                {companies.length === 0
                  ? `${p.teamName}'s deals with brands: affiliate links and codes, products to review, paid videos.`
                  : [
                      `${companies.length} ${companies.length === 1 ? "company" : "companies"}`,
                      `${everything.length} ${everything.length === 1 ? "product" : "products"}`,
                      `${everything.filter((a) => a.status === "active").length} active`,
                      `${everything.filter((a) => a.check?.result === "works").length} verified`,
                      everything.some((a) => a.long || a.short) ? `${everything.filter((a) => a.long || a.short).length} with a video` : null,
                      manage && companies.some((c) => c.login) ? `${companies.filter((c) => c.login).length} with a login` : null,
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
              { key: "", label: "All", count: everything.length, href: filtersHref(f, { kind: null }), color: null, active: !f.kind },
              ...DEAL_KINDS.map((k) => ({ key: k, label: KIND_TAB[k], count: everything.filter((a) => a.kinds.includes(k)).length, href: filtersHref(f, { kind: k }), color: KIND_COLOR[k], active: f.kind === k })),
            ]}
          />

          <AffiliatesPicker companies={list}>
            {/* One row: Filters (1.60.0: the status in it too, the owner: "put the all active paused and ended things
                within filters") and what's on, then the search, fold all, Select, the view. A phone: the search below. */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex-1 min-w-0">
                <FiltersMenu
                  sections={[
                    {
                      title: "Status",
                      items: [
                        { key: "status-any", kind: "radio", label: "All", count: all.length, active: !f.status, href: href({ status: null }) },
                        ...AFFILIATE_STATUSES.map((st) => ({
                          key: `status-${st}`,
                          kind: "radio" as const,
                          label: STATUS_LABEL[st],
                          color: STATUS_COLOR[st],
                          count: count(st),
                          active: f.status === st,
                          href: href({ status: f.status === st ? null : st }),
                        })),
                      ],
                    },
                    {
                      title: "Verified",
                      items: [
                        { key: "checked-any", kind: "radio", label: "Any", active: !f.checked, href: href({ checked: null }) },
                        ...CHECK_STATES.map((s) => ({
                          key: `checked-${s}`,
                          kind: "radio" as const,
                          label: CHECK_LABEL[s],
                          count: all.filter((a) => checkState(a) === s).length,
                          active: f.checked === s,
                          href: href({ checked: f.checked === s ? null : s }),
                        })),
                      ],
                    },
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
                        { key: "code", kind: "check", label: "With a code", count: tab.filter((i) => dealOf(i.product, i.company).code).length, active: f.code, href: href({ code: !f.code }) },
                        ...(manage ? [{ key: "login", kind: "check" as const, label: "With a login", count: withLogin, active: f.login, href: href({ login: !f.login }) }] : []),
                      ],
                    },
                    {
                      title: "Order",
                      items: SORTS.map((s) => ({ key: `sort-${s}`, kind: "radio" as const, label: SORT_LABEL[s], active: f.sort === s, href: href({ sort: s }) })),
                    },
                  ]}
                  chips={[
                    ...(f.status ? [{ key: "status", label: STATUS_LABEL[f.status], clearHref: href({ status: null }) }] : []),
                    ...(f.checked ? [{ key: "checked", label: CHECK_LABEL[f.checked], clearHref: href({ checked: null }) }] : []),
                    ...(f.video ? [{ key: "video", label: f.video === "long" ? "Has a long video" : f.video === "short" ? "Has a Short" : "No video yet", clearHref: href({ video: null }) }] : []),
                    ...(f.code ? [{ key: "code", label: "With a code", clearHref: href({ code: false }) }] : []),
                    ...(f.login ? [{ key: "login", label: "With a login", clearHref: href({ login: false }) }] : []),
                    ...(f.sort !== "newest" ? [{ key: "sort", label: SORT_LABEL[f.sort], clearHref: href({ sort: "newest" }) }] : []),
                  ]}
                />
              </div>
              <span className="max-md:hidden">
                <SearchField initial={f.q} />
              </span>
              <FoldAll ids={list.map((c) => c.id)} />
              {shown > 0 && <PickAffiliatesButton />}
              <ViewToggle value={p.isTable ? "table" : "grid"} cookie={AFFILIATES_VIEW_COOKIE} hrefs={{ grid: filtersHref(f, {}, "grid"), table: filtersHref(f, {}, "table") }} action={setAffiliatesViewMode} fields={{ qs }} />
            </div>
            <div className="md:hidden -mt-3 mb-6">
              <SearchField initial={f.q} />
            </div>

            {/* Switching view or filter: the list's skeleton answers at once. */}
            <PendingSwap fallback={p.isTable ? <AffiliatesTableSkeleton /> : <AffiliateCardsSkeleton />} fallbacks={{ grid: <AffiliateCardsSkeleton />, table: <AffiliatesTableSkeleton /> }}>
              {list.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-line/15 py-20 px-6 text-center">
                  <p className="text-[15px] font-semibold mb-1">{all.length === 0 && !(companies.length && !f.kind) ? `No ${tabName} yet` : "Nothing matches"}</p>
                  <p className="text-[13px] text-ink-faint mb-5 max-w-md mx-auto">
                    {companies.length === 0
                      ? manage
                        ? "Add the brands you work with: the code for viewers and the login for their platform, once, then their products: the link, the video you made about each. Already in a spreadsheet? Paste from a sheet."
                        : "When a master adds the team's sponsorships, their links and codes show up here."
                      : all.length === 0 && f.kind
                        ? manage
                          ? `Add one, or mark ones you have: select them, then Type (or open one and pick its type).`
                          : "None of this kind yet."
                        : f.q.trim()
                          ? `Nothing called “${f.q.trim()}”${filtered ? " with these filters" : ""}.`
                          : "Try another status, or clear the filters."}
                  </p>
                  {companies.length === 0 || (all.length === 0 && f.kind) ? (
                    <AddFirst />
                  ) : (
                    <Link href={f.kind ? filtersHref({ ...f, status: null, checked: null, video: null, code: false, login: false, sort: "newest", q: "" }) : SPONSORSHIPS_PATH} className="text-[13px] font-semibold text-amber">
                      Clear filters
                    </Link>
                  )}
                </div>
              ) : p.isTable ? (
                <AffiliatesTable companies={list} manage={manage} tab={f.kind} />
              ) : (
                <AffiliateCards companies={list} manage={manage} tab={f.kind} />
              )}
            </PendingSwap>
          </AffiliatesPicker>

          {companies.length > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
              <LockIcon className="w-3 h-3 flex-shrink-0" />
              {manage
                ? "Logins are encrypted, open only after your password, and every look is written down for the masters. Click a code to copy it; a faint one is the company's."
                : "Logins are kept apart: only masters and the people they choose see them. Click a code to copy it; a faint one is the company's."}
            </p>
          )}
        </AffiliatesProvider>
      </div>
    </PendingNav>
  );
}
