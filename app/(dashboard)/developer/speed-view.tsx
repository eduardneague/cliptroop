import { formatVital, ratingOf, THRESHOLDS, VITAL_LABEL, VITALS, type Rating, type VitalName } from "@/lib/web-vitals";
import { card, h2 } from "./ui";
import { fmtNum } from "./format";

/*
 * Developer → Speed (1.32.4): real visitors' speed (the data: speed.tsx). Every full page load of
 * the app measures Google's Web Vitals in the browser (lib/web-vitals.ts);
 * this shows the 75th percentile of each over the last 7 days (what 3 visits
 * in 4 were at least as fast as, the number Google judges a site by), for
 * phones and computers, and the pages people open most.
 */

export type SpeedRow = { metric: string; device: string | null; page: string | null; loads: number; p75: number; good: number; poor: number };

const TONE: Record<Rating, string> = { good: "text-green", "needs-improvement": "text-gold", poor: "text-red" };
const WORD: Record<Rating, string> = { good: "Good", "needs-improvement": "Needs work", poor: "Poor" };
export const DAYS = 7;

function Value({ metric, row }: { metric: VitalName; row: SpeedRow | undefined }) {
  if (!row) return <span className="text-[13px] text-ink-faint">No visits yet</span>;
  const rating = ratingOf(metric, row.p75);
  const pct = row.loads ? Math.round((row.good / row.loads) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`font-display text-[26px] leading-none font-semibold tabular-nums ${TONE[rating]}`}>{formatVital(metric, row.p75)}</span>
        <span className={`text-[11.5px] font-semibold ${TONE[rating]}`}>{WORD[rating]}</span>
      </div>
      <div className="mt-1 text-[12px] text-ink-faint tabular-nums">
        {fmtNum(row.loads)} {row.loads === 1 ? "load" : "loads"} · {pct}% good
      </div>
    </div>
  );
}

/** What the Speed tab shows: `rows` from web_vitals_summary, or what went wrong reading them. */
export function SpeedView({ rows, problem }: { rows: SpeedRow[]; problem?: { missing: boolean; message: string } | null }) {
  if (problem)
    return (
      <div className={`${card} p-5 text-[13px] text-ink-soft`}>
        {problem.missing ? "Run migration 0110 (real visitors' speed) on this database, then visits start being measured." : `Couldn't read the measures: ${problem.message}`}
      </div>
    );
  const byDevice = (metric: VitalName, device: "phone" | "computer") => rows.find((r) => r.metric === metric && r.device === device && r.page === null);
  // Pages: the most opened first (by how many measured their largest paint).
  const pages = [...new Set(rows.filter((r) => r.page !== null).map((r) => r.page as string))]
    .map((page) => {
      const of = (m: VitalName) => rows.find((r) => r.metric === m && r.page === page && r.device === null);
      return { page, loads: of("LCP")?.loads ?? Math.max(0, ...rows.filter((r) => r.page === page).map((r) => r.loads)), lcp: of("LCP"), inp: of("INP"), cls: of("CLS"), ttfb: of("TTFB") };
    })
    .sort((a, b) => b.loads - a.loads)
    .slice(0, 15);

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-ink-soft max-w-3xl">
        Measured in the browsers of everyone using the app, each time a page is opened fresh (moving between pages inside it
        isn&rsquo;t a load), over the last {DAYS} days. Each number is the 75th percentile: 3 visits in 4 were at least that
        fast. That&rsquo;s the number Google judges a site by: green is good, gold needs work, red is poor.
      </p>
      {!rows.length ? (
        <div className={`${card} p-5 text-[13px] text-ink-soft`}>
          No visits measured yet. A page sends its measures when it&rsquo;s closed or put in the background: check back once
          people have used the app for a while.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {VITALS.map((m) => (
              <section key={m} className={`${card} p-4 flex flex-col min-w-0`}>
                <div className="flex items-baseline gap-2 mb-3">
                  <h2 className={`${h2} flex-1 truncate`}>{VITAL_LABEL[m].name}</h2>
                  <span className="text-[11px] font-bold text-ink-faint">{m}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink-soft mb-1">Phones</div>
                    <Value metric={m} row={byDevice(m, "phone")} />
                  </div>
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink-soft mb-1">Computers</div>
                    <Value metric={m} row={byDevice(m, "computer")} />
                  </div>
                </div>
                <p className="mt-3 pt-3 border-t border-line/10 text-[12px] text-ink-faint leading-snug">
                  {VITAL_LABEL[m].what[0].toUpperCase() + VITAL_LABEL[m].what.slice(1)}. Good up to {formatVital(m, THRESHOLDS[m][0])}, poor past{" "}
                  {formatVital(m, THRESHOLDS[m][1])}.
                </p>
              </section>
            ))}
          </div>

          <section className={`${card} p-4`}>
            <h2 className={`${h2} mb-3`}>Pages people open most</h2>
            <div className="overflow-x-auto overscroll-x-contain -mx-4 px-4">
              <table className="w-full min-w-[620px] text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 px-1.5 font-bold">Page</th>
                    <th className="pb-2 px-1.5 font-bold text-right">Loads</th>
                    {(["lcp", "inp", "cls", "ttfb"] as const).map((k) => (
                      <th key={k} className="pb-2 px-1.5 font-bold text-right">
                        {k.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p.page} className="border-t border-line/10">
                      <td className="py-2 px-1.5 font-mono text-[12px] break-all">{p.page}</td>
                      <td className="py-2 px-1.5 text-right tabular-nums">{fmtNum(p.loads)}</td>
                      {(["lcp", "inp", "cls", "ttfb"] as const).map((k) => {
                        const r = p[k];
                        const m = k.toUpperCase() as VitalName;
                        return (
                          <td key={k} className={`py-2 px-1.5 text-right tabular-nums whitespace-nowrap ${r ? TONE[ratingOf(m, r.p75)] : "text-ink-faint"}`}>
                            {r ? formatVital(m, r.p75) : "·"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-ink-faint">
              Phones and computers together. [id] is any video, team or person, [n] a number. Measures are kept 30 days, without who sent them.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
