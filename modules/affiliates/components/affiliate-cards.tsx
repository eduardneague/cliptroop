import { CardPick } from "@/components/ui/list-pick";
import { chunks } from "@/lib/chunks";
import { dealOf, type DealKind, type Product, type ShownCompany } from "../lib/rules";
import { KindPill, OutLink, StatusPill, VideoChip } from "./bits";
import { BrandMark } from "./brand-mark";
import { CompanyHead, ProductCode, ProductDeal } from "./company-head";
import { AddProduct, FoldBody, FoldBox } from "./company-fold";
import { OpenEditor } from "./open-editor";
import { ProductMenu } from "./row-menu";
import { VerifyChip } from "./verify-chip";

/*
 * The sponsorships as cards (1.56.0). 1.58.0: each company a box, its heading (company-head.tsx: the code, the platform
 * and the login, once) folding it, its products' cards in it. 1.60.1 (the owner: "make this view better, make each as
 * long as the entire thing"): every box the list's whole width, one under another, its heading one line (the name, then
 * the code, the deal and where its money goes, the platform and the login at the end), its cards in up to four columns
 * from the left. A product's card: its picture (1.57.0) or initial, the
 * name, verified or not, its kind (not the tab's own) and status, the product link, the code it goes by (its own; the
 * company's faint, a click copies either) and the deal, the video made about it (its thumbnail when the long video
 * has one). Picking several puts a tick box on the picture.
 */

/** Companies per group (a group off screen isn't drawn until it comes near: globals.css .list-chunk-cards). */
const COMPANIES = 8;
/** A box's cards: one column on a phone, up to four on a wide screen, from the left whatever their number. */
const INNER = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function AffiliateCards({ companies, manage, tab = null }: { companies: ShownCompany[]; manage: boolean; tab?: DealKind | null }) {
  return (
    <div className="flex flex-col gap-4">
      {chunks(companies, COMPANIES).map((group, g) => (
        <div key={g} className="list-chunk-cards motion-stagger flex flex-col gap-4">
          {group.map((c) => (
            <FoldBox key={c.id} id={c.id} open="" label={c.name} className="rounded-2xl border-2 border-line/10 bg-surface overflow-hidden">
              <CompanyHead company={c} manage={manage} className="px-3 sm:px-4 py-2.5 hover:bg-surface-2/60 transition-colors" />
              <FoldBody id={c.id}>
                <div className="border-t border-line/10 p-3 sm:p-4 bg-surface-2/30">
                  {c.products.length ? (
                    <div className={`grid ${INNER} gap-3`}>
                      {c.products.map((p) => (
                        <ProductCard key={p.id} product={p} company={c} tab={tab} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center text-[12.5px] text-ink-faint">{manage ? <AddProduct companyId={c.id} name={c.name} wide /> : <span className="py-1">No products yet.</span>}</div>
                  )}
                </div>
              </FoldBody>
            </FoldBox>
          ))}
        </div>
      ))}
    </div>
  );
}

function ProductCard({ product: p, company: c, tab }: { product: Product; company: ShownCompany; tab: DealKind | null }) {
  const deal = dealOf(p, c);
  const thumb = p.long?.thumb ?? null;
  return (
    <div
      data-card=""
      data-item-id={p.id}
      className={`relative rounded-xl border-2 border-line/10 bg-surface p-3.5 flex flex-col gap-2.5 hover:border-amber hover:shadow-[0_8px_24px_-8px_rgb(var(--amber)/0.35)] hover:-translate-y-0.5 transition-all ${p.status === "ended" ? "opacity-75" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <span data-card-num="" className="contents">
          <BrandMark item={p} className="w-9 h-9 text-[15px] rounded-xl" px={36} />
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <OpenEditor product={p} className="block w-full font-semibold text-[14.5px] leading-snug truncate" />
          {p.productUrl ? <OutLink url={p.productUrl} className="!text-[12px]" /> : <span className="text-[12px] text-ink-faint">No product link</span>}
          <span className="flex flex-wrap items-center gap-1 mt-1">
            <VerifyChip product={p} />
            {p.kinds
              .filter((k) => k !== tab)
              .map((k) => (
                <KindPill key={k} kind={k} />
              ))}
          </span>
        </div>
        <div className="flex items-center gap-1 -mr-1.5 -mt-1">
          {p.status !== "active" && <StatusPill status={p.status} />}
          <ProductMenu product={p} company={c} />
        </div>
      </div>

      {(deal.code || deal.percentage || deal.own) && (
        <div className="flex items-center gap-2 flex-wrap">
          <ProductCode deal={deal} company={c} />
          {deal.percentage &&
            (deal.own ? <span className="rounded-md bg-green/10 text-green px-2 h-7 inline-flex items-center text-[12.5px] font-bold">{deal.percentage}</span> : <ProductDeal deal={deal} />)}
        </div>
      )}

      {(p.long || p.short) && (
        <div className="flex items-center gap-2.5 min-w-0">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" decoding="async" className="w-[72px] aspect-video rounded-md object-cover bg-surface-2 flex-shrink-0" />
          )}
          <div className="flex flex-col items-start gap-1 min-w-0">
            {p.long && <VideoChip video={p.long} wide />}
            {p.short && <VideoChip video={p.short} wide />}
          </div>
        </div>
      )}
      <CardPick id={p.id} label={p.name} x={23} y={23} />
    </div>
  );
}
