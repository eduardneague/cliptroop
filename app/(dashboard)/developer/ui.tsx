import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { fmtBytes, fmtNum } from "./format";

/* Building blocks shared by the developer tabs (server-rendered). */

export const card = "rounded-2xl border border-line/10 bg-surface";
export const h2 = "text-[12px] font-bold uppercase tracking-wide text-ink-faint";

/** A dashboard card: a title, an optional link to the tab with the details, its content. */
export function Widget({ title, href, link, className = "", children }: { title: string; href?: string; link?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`${card} p-4 flex flex-col min-w-0 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <h2 className={`${h2} flex-1 truncate`}>{title}</h2>
        {href && (
          <Link href={href} className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-ink-soft hover:text-amber flex-shrink-0">
            {link ?? "Details"}
            <ChevronRightIcon className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** One big number with what it counts. */
export function Big({ value, label, tone = "" }: { value: React.ReactNode; label: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className={`font-display text-[30px] leading-none font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="text-[12.5px] text-ink-soft">{label}</span>
    </div>
  );
}

/** How much of the plan is used: green, then gold from 70 %, red from 90 %. */
export function Meter({ used, limit, unit = "bytes" }: { used: number; limit: number; unit?: "bytes" | "count" }) {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const tone = pct >= 90 ? "bg-red" : pct >= 70 ? "bg-gold" : "bg-green";
  const text = pct >= 90 ? "text-red" : pct >= 70 ? "text-gold" : "text-ink-soft";
  const f = unit === "bytes" ? fmtBytes : fmtNum;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[26px] leading-none font-semibold tabular-nums">{f(used)}</span>
        <span className={`text-[12px] font-semibold tabular-nums ${text}`}>{pct < 1 && used > 0 ? "<1" : Math.round(pct)}%</span>
      </div>
      <div
        className="mt-2.5 h-2 rounded-full bg-line/10 overflow-hidden"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-label={`${f(used)} of ${f(limit)}`}
      >
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(used > 0 ? 1.5 : 0, pct))}%` }} />
      </div>
      <div className="mt-1.5 text-[12px] text-ink-faint tabular-nums">of {f(limit)} included</div>
    </div>
  );
}

/**
 * Uploads per day, the last 30 days (days without any are empty columns).
 * Hover a column for its day, files and size.
 */
export function UploadsChart({ days, height = 72 }: { days: { day: string; files: number; bytes: number }[]; height?: number }) {
  const by = new Map(days.map((d) => [d.day, d]));
  const list: { day: string; files: number; bytes: number }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10);
    list.push(by.get(d) ?? { day: d, files: 0, bytes: 0 });
  }
  const max = Math.max(1, ...list.map((d) => d.bytes));
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label={`Uploads per day, last 30 days: ${fmtBytes(list.reduce((t, d) => t + d.bytes, 0))} in total`}>
        {list.map((d) => (
          <span key={d.day} className="group relative flex-1 h-full flex items-end" title={`${label(d.day)}: ${d.files} file${d.files === 1 ? "" : "s"}, ${fmtBytes(d.bytes)}`}>
            <span
              className={`block w-full rounded-t-[3px] ${d.bytes ? "bg-amber group-hover:brightness-110" : "bg-line/10"}`}
              style={{ height: d.bytes ? `${Math.max(6, (d.bytes / max) * 100)}%` : 2 }}
            />
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-faint tabular-nums">
        <span>{label(list[0].day)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/** A labelled share bar (storage per bucket, biggest teams). */
export function ShareRow({ label, sub, value, total, right }: { label: React.ReactNode; sub?: React.ReactNode; value: number; total: number; right: React.ReactNode }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline gap-3">
        <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">{label}</span>
        <span className="text-[12.5px] tabular-nums text-ink-soft flex-shrink-0">{right}</span>
      </div>
      {sub && <div className="text-[11.5px] text-ink-faint truncate">{sub}</div>}
      <div className="mt-1.5 h-1.5 rounded-full bg-line/[0.07] overflow-hidden" aria-hidden>
        <span className="block h-full rounded-full bg-amber/80" style={{ width: `${total ? Math.max(1.5, (value / total) * 100) : 0}%` }} />
      </div>
    </li>
  );
}
