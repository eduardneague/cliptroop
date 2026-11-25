import { CardPick } from "@/components/ui/list-pick";
import { chunks, LIST_CHUNK } from "@/lib/chunks";
import { domainOf, type Affiliate } from "../lib/rules";
import { BrandBadge, OutLink, StatusPill, VideoChip } from "./bits";
import { CopyChip } from "./copy-chip";
import { LoginCell } from "./login-cell";
import { OpenEditor } from "./open-editor";
import { AffiliateMenu } from "./row-menu";

/*
 * The affiliates as cards (1.56.0): the brand, its status, the product link, the code (a click copies it) and the
 * percentage, the video made about it (its thumbnail when the long video has one), the affiliate platform, and, for
 * the people who manage affiliates, the login. Picking several puts a tick box on the brand's initial.
 */
export function AffiliateCards({ list, manage }: { list: Affiliate[]; manage: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {chunks(list, LIST_CHUNK).map((group, g) => (
        // A group of cards off screen isn't drawn until it comes near (globals.css .list-chunk-cards).
        <div key={g} className="list-chunk-cards motion-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {group.map((a) => {
            const thumb = a.long?.thumb ?? null;
            return (
              <div
                key={a.id}
                data-card=""
                data-item-id={a.id}
                className={`relative rounded-2xl border-2 border-line/10 bg-surface p-4 flex flex-col gap-3 hover:border-amber hover:shadow-[0_8px_24px_-8px_rgb(var(--amber)/0.35)] hover:-translate-y-0.5 transition-all ${a.status === "ended" ? "opacity-75" : ""}`}
              >
                <div className="flex items-start gap-2.5">
                  <span data-card-num="" className="contents">
                    <BrandBadge id={a.id} name={a.name} className="w-9 h-9 text-[15px] rounded-xl" />
                  </span>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <OpenEditor affiliate={a} className="block w-full font-semibold text-[15px] leading-snug truncate" />
                    {a.productUrl ? <OutLink url={a.productUrl} className="!text-[12px]" /> : <span className="text-[12px] text-ink-faint">No product link</span>}
                  </div>
                  <div className="flex items-center gap-1 -mr-1.5 -mt-1">
                    {a.status !== "active" && <StatusPill status={a.status} />}
                    <AffiliateMenu affiliate={a} />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {a.code ? <CopyChip text={a.code} /> : <span className="text-[12px] text-ink-faint">No code</span>}
                  {a.percentage && <span className="rounded-md bg-green/10 text-green px-2 h-7 inline-flex items-center text-[12.5px] font-bold">{a.percentage}</span>}
                </div>

                {(a.long || a.short) && (
                  <div className="flex items-center gap-2.5 min-w-0">
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" loading="lazy" decoding="async" className="w-[72px] aspect-video rounded-md object-cover bg-surface-2 flex-shrink-0" />
                    )}
                    <div className="flex flex-col items-start gap-1 min-w-0">
                      {a.long && <VideoChip video={a.long} wide />}
                      {a.short && <VideoChip video={a.short} wide />}
                    </div>
                  </div>
                )}

                {(a.platformUrl || manage) && (
                  <div className="mt-auto pt-2.5 border-t border-line/10 flex flex-col gap-2">
                    {a.platformUrl && (
                      <div className="flex items-center gap-2 text-[12px] min-w-0">
                        <span className="text-ink-faint flex-shrink-0">Platform</span>
                        <OutLink url={a.platformUrl} label={domainOf(a.platformUrl)} />
                      </div>
                    )}
                    <LoginCell affiliate={a} variant="card" />
                  </div>
                )}
                <CardPick id={a.id} label={a.name} x={25} y={25} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
