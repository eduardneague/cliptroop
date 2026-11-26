import { GroupPick } from "@/components/ui/list-pick";
import { dealOf, type Company, type ShownCompany } from "../lib/rules";
import { PRODUCT_INDENT, TABLE_COLS } from "../lib/table-cols";
import { CompanyMark } from "./brand-mark";
import { AddProduct, FoldButton, FoldRow } from "./company-fold";
import { CopyChip } from "./copy-chip";
import { PayoutChip } from "./payout";
import { PlatformLinks } from "./platform-links";
import { CompanyMenu } from "./row-menu";

/*
 * A company's heading on the list (1.58.0): its name and how many products it has (of them, how many show), and once
 * for all of them what's the company's: the code and the deal, the affiliate platform and the login. + a product and
 * ⋯. A click on it (not on its controls) folds it (company-fold.tsx); while picking, a tick box picks all of its
 * products here. On the table (CompanyRow) the code, the deal and the platform sit in the products' own columns, over
 * theirs; over the cards (CompanyHead), in a row. 1.60.0: its picture where its initial was (CompanyMark), and where its
 * money goes right after the deal (PayoutChip: the icon; its name too in the table's wide videos' column). Short of
 * room (a phone, a box one card wide), they wrap rather than lose the deal.
 */

const countOf = (c: ShownCompany) => {
  const shown = c.products.length;
  return c.total === 0 ? "No products yet" : shown === c.total ? `${c.total} ${c.total === 1 ? "product" : "products"}` : `${shown} of ${c.total} products`;
};

/** The company's code as its column shows it (a click copies it). */
const CompanyCode = ({ c, small = false }: { c: Company; small?: boolean }) =>
  c.code ? <CopyChip text={c.code} title={`${c.name}'s code, for its products`} className={`max-w-full ${small ? "!h-6 !text-[11px]" : ""}`} /> : <span className="text-[12px] text-ink-faint">No code</span>;

/** The heading as a row of the table, in the products' columns. */
export function CompanyRow({ company: c, manage }: { company: ShownCompany; manage: boolean }) {
  const shown = c.products.length;
  const platform = !!(c.platformUrl || (manage && c.login));
  return (
    <FoldRow
      id={c.id}
      className={`relative grid grid-cols-[36px_minmax(0,1fr)_auto] ${TABLE_COLS.product} ${PRODUCT_INDENT} gap-x-3 gap-y-1 pr-3 py-2 items-center bg-surface-2/60 hover:bg-surface-2 transition-colors`}
    >
      <span className="flex justify-center items-center self-start md:self-center">
        {/* The arrow, in the room the products are drawn in by (a phone: before the name). */}
        <FoldButton id={c.id} name={c.name} count={shown} className="max-md:hidden absolute left-2.5 top-1/2 -translate-y-1/2" />
        <CompanyMark company={{ id: c.id, name: c.name, picture: c.picture }} className="w-8 h-8 text-[13px]" px={32} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <GroupPick ids={c.products.map((p) => p.id)} label={`All of ${c.name}'s products here`} />
          <FoldButton id={c.id} name={c.name} count={shown} className="md:hidden -ml-1.5 !w-5" />
          <h2 className="min-w-0 truncate text-[14.5px] font-bold text-ink">{c.name}</h2>
          {/* (The name first: the count gives way before it, and goes where the column is narrow.) */}
          <span className="min-w-0 truncate shrink-[100] text-[12px] text-ink-faint tabular-nums md:max-xl:hidden">{countOf(c)}</span>
          {manage && <AddProduct companyId={c.id} name={c.name} className="ml-auto max-md:hidden" label="max-xl:sr-only" />}
        </div>
      </div>
      {/* The platform and its login: the Link column where there's one (xl), else the empty Verified one; a phone: under
          the name, after the code and the deal. One of them, placed (the login opens beside it). */}
      <div
        className={`min-w-0 items-center gap-x-2 gap-y-1 max-md:flex-wrap md:row-start-1 md:col-start-3 xl:col-start-7 max-md:col-start-2 max-md:row-start-2 ${
          c.code || c.percentage || platform || c.payout || manage ? "flex" : "hidden md:flex"
        }`}
      >
        {c.code && (
          <span className="md:hidden">
            <CompanyCode c={c} small />
          </span>
        )}
        {c.percentage && <span className="md:hidden text-[12.5px] font-bold text-ink truncate">{c.percentage}</span>}
        <span className="md:hidden flex">
          <PayoutChip company={{ id: c.id, name: c.name, payout: c.payout }} label="sr-only" />
        </span>
        {platform ? <PlatformLinks company={c} /> : <span className="max-xl:hidden text-[12px] text-ink-faint">—</span>}
      </div>
      <span className="hidden xl:block md:row-start-1 xl:col-start-3" />
      <div className="hidden md:flex min-w-0 md:row-start-1 md:col-start-4">
        <CompanyCode c={c} />
      </div>
      {/* The deal, then where its money goes (into the videos' column, empty on a company's row: its name fits there). */}
      <div className="hidden md:flex items-center gap-2 min-w-0 md:row-start-1 md:col-start-5 lg:col-end-7">
        <span className="min-w-0 truncate text-[13px] font-bold text-ink" title={c.percentage ?? undefined}>
          {c.percentage ?? <span className="font-normal text-[12px] text-ink-faint">—</span>}
        </span>
        <PayoutChip company={{ id: c.id, name: c.name, payout: c.payout }} label="max-lg:sr-only" />
      </div>
      <div className="flex items-center justify-end gap-0.5 self-start md:self-center max-md:col-start-3 max-md:row-start-1 md:row-start-1 md:col-start-6 lg:col-start-7 xl:col-start-8">
        {manage && <AddProduct companyId={c.id} name={c.name} className="md:hidden" />}
        <CompanyMenu company={c} />
      </div>
    </FoldRow>
  );
}

/**
 * The heading over a company's cards: its name and count, + a product and ⋯; under them the code, the deal and the
 * platform (a box can be one card wide).
 */
export function CompanyHead({ company: c, manage, className = "" }: { company: ShownCompany; manage: boolean; className?: string }) {
  const shown = c.products.length;
  const deal = !!(c.code || c.percentage || c.platformUrl || c.payout || manage);
  return (
    <FoldRow id={c.id} className={`relative ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        <GroupPick ids={c.products.map((p) => p.id)} label={`All of ${c.name}'s products here`} />
        <FoldButton id={c.id} name={c.name} count={shown} className="-ml-1" />
        <CompanyMark company={{ id: c.id, name: c.name, picture: c.picture }} className="w-8 h-8 text-[13px]" px={32} />
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <h2 className="min-w-0 truncate text-[14.5px] font-bold text-ink">{c.name}</h2>
          <span className="min-w-0 truncate shrink-[100] text-[12px] text-ink-faint tabular-nums">{countOf(c)}</span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 -mr-1.5">
          {manage && <AddProduct companyId={c.id} name={c.name} label="sr-only" />}
          <CompanyMenu company={c} />
        </div>
      </div>
      {deal && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0 pl-[3.75rem]">
          {c.code && <CopyChip text={c.code} title={`${c.name}'s code, for its products`} className="max-w-[11rem]" />}
          {c.percentage && (
            <span className="text-[13px] font-bold text-ink whitespace-nowrap truncate min-w-0" title={c.percentage}>
              {c.percentage}
            </span>
          )}
          <PayoutChip company={{ id: c.id, name: c.name, payout: c.payout }} label="sr-only" />
          <span className="ml-auto flex-shrink-0 -mr-1.5">
            <PlatformLinks company={c} />
          </span>
        </div>
      )}
    </FoldRow>
  );
}

/** The code a product goes by: its own (a chip), or its company's (faint: it's on the heading; a click copies it too). */
export function ProductCode({ deal, company, small = false }: { deal: ReturnType<typeof dealOf>; company: Pick<Company, "name">; small?: boolean }) {
  if (deal.code) return <CopyChip text={deal.code} quiet={!deal.own} title={deal.own ? "Its own code" : `${company.name}'s code`} className={`max-w-full ${small ? "!h-6 !text-[11px]" : ""}`} />;
  return <span className="text-[12px] text-ink-faint">{deal.own ? "No code" : "—"}</span>;
}

/** The deal it goes by: its own (bold), or its company's (faint). */
export function ProductDeal({ deal }: { deal: ReturnType<typeof dealOf> }) {
  if (!deal.percentage) return <span className="text-[12px] text-ink-faint">—</span>;
  return (
    <span className={`text-[13px] whitespace-nowrap truncate ${deal.own ? "font-bold text-ink" : "text-ink-faint"}`} title={deal.own ? deal.percentage : `${deal.percentage}, the company's`}>
      {deal.percentage}
    </span>
  );
}
