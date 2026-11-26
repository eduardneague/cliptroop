import { RowPick } from "@/components/ui/list-pick";
import { chunks } from "@/lib/chunks";
import { dealOf, domainOf, type DealKind, type Product, type ShownCompany } from "../lib/rules";
import { PRODUCT_INDENT, TABLE_COLS } from "../lib/table-cols";
import { KindPill, OutLink, StatusPill, VideoChip } from "./bits";
import { BrandMark } from "./brand-mark";
import { CompanyRow, ProductCode, ProductDeal } from "./company-head";
import { AddProduct, FoldBody } from "./company-fold";
import { OpenEditor } from "./open-editor";
import { ProductMenu } from "./row-menu";
import { VerifyChip } from "./verify-chip";

/*
 * The sponsorships as a table (1.56.0), drawn on the server; the parts that do something are the browser's. 1.58.0:
 * each company a row of its own (company-head.tsx: the code, the deal, the platform and the login, once, in the
 * columns over its products' own) that folds, its products under it. A product's columns come in as there's room: the name with its kind (not the tab's own, it goes without saying)
 * and status (a phone shows the rest under it), verified or not (a phone: its icon by the name), the code it goes by
 * (its own, or faint the company's) and the deal, the videos, the product link (its domain). Its picture (or initial)
 * first; picking several puts a tick box there.
 */

/** Companies per group: a group off screen isn't laid out or painted until it comes near (globals.css .list-chunk). */
const COMPANIES = 8;

export function AffiliatesTable({ companies, manage, tab = null }: { companies: ShownCompany[]; manage: boolean; tab?: DealKind | null }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface overflow-hidden">
      <div className={`hidden md:grid ${TABLE_COLS.product} ${PRODUCT_INDENT} gap-3 pr-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint`}>
        <span />
        <span>Product</span>
        <span>Verified</span>
        <span>Code</span>
        <span>Percentage</span>
        <span className="hidden lg:block">Video</span>
        <span className="hidden xl:block">Link</span>
        <span />
      </div>
      {chunks(companies, COMPANIES).map((group, g) => (
        <div key={g} className="list-chunk motion-stagger">
          {group.map((c, i) => (
            <section key={c.id} data-item-id={c.id} aria-label={c.name} className={g === 0 && i === 0 ? "" : "border-t border-line/10"}>
              <CompanyRow company={c} manage={manage} />
              <FoldBody id={c.id}>
                {c.products.length ? (
                  c.products.map((p) => <ProductRow key={p.id} product={p} company={c} tab={tab} />)
                ) : (
                  <div className={`${PRODUCT_INDENT} pr-3 py-2.5 border-t border-line/5 flex items-center text-[12.5px] text-ink-faint`}>
                    {manage ? <AddProduct companyId={c.id} name={c.name} wide /> : <span>No products yet.</span>}
                  </div>
                )}
              </FoldBody>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}

function ProductRow({ product: p, company: c, tab }: { product: Product; company: ShownCompany; tab: DealKind | null }) {
  const deal = dealOf(p, c);
  const videos = [p.long, p.short].filter((v) => v !== null);
  // The line under the name, on the screens where some of it has no column yet (the link: below xl; the videos:
  // below lg; the code: below md).
  const under = p.productUrl ? "xl:hidden" : videos.length ? "lg:hidden" : deal.code || deal.percentage ? "md:hidden" : null;
  return (
    <div
      data-item-id={p.id}
      className={`relative grid grid-cols-[36px_minmax(0,1fr)_auto] ${TABLE_COLS.product} ${PRODUCT_INDENT} gap-x-3 gap-y-1.5 pr-3 py-2.5 items-center border-t border-line/5 hover:bg-surface-2/70 transition-colors ${p.status === "ended" ? "opacity-70" : ""}`}
    >
      <span className="self-start md:self-center pt-0.5 md:pt-0 flex justify-center">
        <BrandMark item={p} className="w-8 h-8 text-[12px]" px={32} />
      </span>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <OpenEditor product={p} className="min-w-0 truncate text-[13.5px] font-semibold mr-0.5" />
          <span className="md:hidden flex">
            <VerifyChip product={p} compact />
          </span>
          {p.kinds
            .filter((k) => k !== tab)
            .map((k) => (
              <KindPill key={k} kind={k} />
            ))}
          {p.status !== "active" && <StatusPill status={p.status} />}
        </div>
        {under && (
          <div className={`flex items-center gap-x-2 gap-y-1 mt-1 flex-wrap text-[12px] text-ink-soft ${under}`}>
            {deal.code && (
              <span className="md:hidden">
                <ProductCode deal={deal} company={c} small />
              </span>
            )}
            {deal.percentage && (
              <span className="md:hidden">
                <ProductDeal deal={deal} />
              </span>
            )}
            {videos.map((v) => (
              <span key={v.kind} className="lg:hidden min-w-0 max-w-full">
                <VideoChip video={v} />
              </span>
            ))}
            {p.productUrl && (
              <span className="min-w-0 max-w-full">
                <OutLink url={p.productUrl} />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="hidden md:flex min-w-0">
        <VerifyChip product={p} />
      </div>
      <div className="hidden md:flex min-w-0">
        <ProductCode deal={deal} company={c} />
      </div>
      <div className="hidden md:block min-w-0 truncate">
        <ProductDeal deal={deal} />
      </div>
      <div className="hidden lg:flex flex-col items-start gap-1 min-w-0">
        {videos.map((v) => (
          <VideoChip key={v.kind} video={v} wide />
        ))}
        {!videos.length && <span className="text-[12px] text-ink-faint">—</span>}
      </div>
      <div className="hidden xl:flex min-w-0">{p.productUrl ? <OutLink url={p.productUrl} label={domainOf(p.productUrl)} className="!text-[12px]" /> : <span className="text-[12px] text-ink-faint">—</span>}</div>
      <div className="flex items-center justify-end self-start md:self-center">
        <ProductMenu product={p} company={c} />
      </div>
      <RowPick id={p.id} label={p.name} />
    </div>
  );
}
