import { RowPick } from "@/components/ui/list-pick";
import { chunks, LIST_CHUNK } from "@/lib/chunks";
import { domainOf, type Affiliate, type DealKind } from "../lib/rules";
import { TABLE_COLS } from "../lib/table-cols";
import { KindPill, OutLink, StatusPill, VideoChip } from "./bits";
import { BrandMark } from "./brand-mark";
import { CopyChip } from "./copy-chip";
import { LoginCell } from "./login-cell";
import { OpenEditor } from "./open-editor";
import { AffiliateMenu } from "./row-menu";

/*
 * The sponsorships as a table (1.56.0), drawn on the server; the parts that do something are the browser's. Columns
 * come in as there's room: the name with its kind (1.57.0; not the tab's own, it goes without saying) and status (a
 * phone shows the rest under it), the code and the percentage, the video, the product link, the login (for the people
 * who manage sponsorships), the affiliate platform. The product's picture (1.57.0) or the brand's initial first;
 * picking several puts a tick box there.
 */
export function AffiliatesTable({ list, manage, tab = null }: { list: Affiliate[]; manage: boolean; tab?: DealKind | null }) {
  const cols = manage ? TABLE_COLS.manage : TABLE_COLS.view;
  return (
    <div className="rounded-xl border border-line/10 bg-surface overflow-hidden">
      <div className={`hidden md:grid ${cols} gap-3 px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint`}>
        <span />
        <span>Name</span>
        <span>Code</span>
        <span>Percentage</span>
        <span className="hidden lg:block">Video</span>
        <span className="hidden xl:block">Product link</span>
        {manage && <span className="hidden xl:block">Login</span>}
        <span className="hidden 2xl:block">Platform</span>
        <span />
      </div>
      {chunks(list, LIST_CHUNK).map((group, g) => (
        // A group of rows off screen isn't laid out or painted until it comes near (globals.css .list-chunk).
        <div key={g} className="list-chunk motion-stagger">
          {group.map((a) => (
            <div
              key={a.id}
              data-item-id={a.id}
              className={`relative grid grid-cols-[36px_minmax(0,1fr)_auto] ${cols} gap-x-3 gap-y-1.5 px-3 py-2.5 items-center border-t border-line/5 first:border-t-0 hover:bg-surface-2/70 transition-colors ${a.status === "ended" ? "opacity-70" : ""}`}
            >
              <span className="self-start md:self-center pt-0.5 md:pt-0 flex justify-center">
                <BrandMark affiliate={a} className="w-8 h-8 text-[12px]" px={32} />
              </span>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <OpenEditor affiliate={a} className="min-w-0 truncate text-[13.5px] font-semibold mr-0.5" />
                  {a.kinds
                    .filter((k) => k !== tab)
                    .map((k) => (
                      <KindPill key={k} kind={k} />
                    ))}
                  {a.status !== "active" && <StatusPill status={a.status} />}
                </div>
                {/* What has no column yet on this screen, under the name. */}
                <div className="flex items-center gap-x-2 gap-y-1 mt-1 flex-wrap text-[12px] text-ink-soft xl:hidden empty:hidden">
                  {a.code && (
                    <span className="md:hidden">
                      <CopyChip text={a.code} className="!h-6 !text-[11px]" />
                    </span>
                  )}
                  {a.percentage && <span className="md:hidden font-bold text-ink">{a.percentage}</span>}
                  {a.long && (
                    <span className="lg:hidden min-w-0 max-w-full">
                      <VideoChip video={a.long} />
                    </span>
                  )}
                  {a.short && (
                    <span className="lg:hidden min-w-0 max-w-full">
                      <VideoChip video={a.short} />
                    </span>
                  )}
                  {a.productUrl && (
                    <span className="min-w-0 max-w-full">
                      <OutLink url={a.productUrl} />
                    </span>
                  )}
                </div>
              </div>

              <div className="hidden md:flex min-w-0">{a.code ? <CopyChip text={a.code} /> : <span className="text-[12px] text-ink-faint">—</span>}</div>
              <div className="hidden md:block text-[13px] font-bold truncate" title={a.percentage ?? undefined}>
                {a.percentage ?? <span className="font-normal text-ink-faint">—</span>}
              </div>
              <div className="hidden lg:flex flex-col items-start gap-1 min-w-0">
                {a.long && <VideoChip video={a.long} wide />}
                {a.short && <VideoChip video={a.short} wide />}
                {!a.long && !a.short && <span className="text-[12px] text-ink-faint">—</span>}
              </div>
              <div className="hidden xl:flex min-w-0">{a.productUrl ? <OutLink url={a.productUrl} /> : <span className="text-[12px] text-ink-faint">—</span>}</div>
              {manage && (
                // One login cell: under the name on smaller screens, its own column on wide ones.
                <div className={`col-start-2 row-start-2 xl:col-start-auto xl:row-start-auto min-w-0 flex items-center ${a.login ? "" : "max-xl:hidden"}`}>
                  <LoginCell affiliate={a} variant="cell" />
                </div>
              )}
              <div className="hidden 2xl:flex min-w-0">{a.platformUrl ? <OutLink url={a.platformUrl} label={domainOf(a.platformUrl)} /> : <span className="text-[12px] text-ink-faint">—</span>}</div>
              <div className="flex items-center justify-end self-start md:self-center">
                <AffiliateMenu affiliate={a} />
              </div>
              <RowPick id={a.id} label={a.name} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
