"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CloseIcon, LockIcon, PlusIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { addRevenueEntry, deleteRevenueEntry, setRevenueAccess, setRevenueCurrency } from "@/app/(dashboard)/analytics/actions";
import { Select, type SelectOption } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-provider";
import { DateChip } from "@/components/ui/date-picker";
import { ChartCard, Legend, StackedColumns, StatTile } from "../charts";
import { SHORT_COLOR, LONG_COLOR, niceDay } from "./shared";
import type { Revenue } from "../../lib/queries";

/* Analytics → Revenue. 1.21.0: click a day (week, month) for the videos that made it. */

// Only loaded when a column is clicked.
const RevenueVideosDialog = dynamic(() => import("../revenue-videos").then((m) => m.RevenueVideosDialog), { ssr: false });

const YT_COLOR = "rgb(var(--chart-yt))";
const FB_COLOR = "rgb(var(--chart-fb))";
const OTHER_COLOR = "rgb(var(--chart-tt))";
const STREAM_COLOR = { youtube: YT_COLOR, facebook: FB_COLOR, other: OTHER_COLOR } as const;

export function RevenueTab({ r, compare, teamId }: { r: Revenue; compare: boolean; teamId: string }) {
  const [adding, setAdding] = useState(false);
  const [pickAt, setPickAt] = useState<number | null>(null);
  if (!r.allowed)
    return (
      <div className="rounded-2xl border border-line/10 bg-surface p-8 text-center flex flex-col items-center">
        <span className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-ink-soft">
          <LockIcon className="w-6 h-6" />
        </span>
        <p className="text-[15px] font-semibold mt-3">Revenue is private</p>
        <p className="text-[13px] text-ink-soft mt-1 max-w-sm">Only masters, and the people a master chooses, can see the channel&rsquo;s revenue.</p>
      </div>
    );
  // Big numbers and round axis ticks without cents; everything else with them (as many as the currency uses).
  const money = (n: number | null) => {
    if (n === null) return "–";
    if (Math.abs(n) >= 1000 || Number.isInteger(n)) return new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency, maximumFractionDigits: 0 }).format(n);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency }).format(n);
  };
  const cents = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency }).format(n);
  const streamTotal = r.streams.reduce((t, x) => t + x.amount, 0);
  const splitTotal = r.split ? r.split.shorts + r.split.long : 0;
  const hasOther = r.perBucket.some((b) => b.other > 0);
  const hasFb = r.hasFacebook;
  const fbMonths = r.months.some((m) => m.facebook);
  return (
    <div className="space-y-5">
      <CurrencyBar r={r} />
      {r.note && <p className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-[13px] text-ink">{r.note}</p>}
      {r.fxNote && <p className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-[13px] text-ink">{r.fxNote}</p>}
      <div className={`grid gap-3 grid-cols-2 ${hasFb ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <StatTile className={`ring-1 ring-amber/30 ${hasFb ? "col-span-2 lg:col-span-1" : ""}`} label="All streams together" value={r.all.value} prev={r.all.prev} compare={compare} format={money} />
        <StatTile label="YouTube (estimated)" value={r.total.value} prev={r.total.prev} compare={compare} format={money} hint={r.bestDay ? `best day ${niceDay(r.bestDay.day)}: ${cents(r.bestDay.revenue)}` : undefined} />
        {hasFb && <StatTile label="Facebook" value={r.facebook.value} prev={r.facebook.prev} compare={compare} format={money} hint="Content Monetization" />}
        <StatTile label="Other income" value={r.other.value} prev={r.other.prev} compare={compare} format={money} hint={r.other.value === null ? "sponsorships, deals, other platforms" : undefined} />
        <StatTile label="Per 1,000 views" value={r.rpm.value} prev={r.rpm.prev} compare={compare} format={(n) => (n === null ? "–" : cents(n))} hint="YouTube revenue ÷ views" />
      </div>
      {r.facebookNote && <p className="-mt-2 text-[12.5px] text-ink-soft">{r.facebookNote}</p>}

      {r.hasData ? (
        <ChartCard
          title="Revenue"
          sub={`${!r.buckets.length || r.buckets[0].from === r.buckets[0].to ? "Per day" : r.buckets[0].key.length === 7 ? "Per month" : "Per week"} · ${r.currency}`}
          right={
            hasOther || hasFb ? (
              <Legend
                shape="rect"
                items={[
                  { key: "yt", label: "YouTube", color: YT_COLOR },
                  ...(hasFb ? [{ key: "fb", label: "Facebook", color: FB_COLOR }] : []),
                  ...(hasOther ? [{ key: "other", label: "Other income", color: OTHER_COLOR }] : []),
                ]}
              />
            ) : undefined
          }
        >
          <StackedColumns
            ariaLabel="Revenue per period"
            labels={r.buckets.map((b) => b.label)}
            series={[
              { key: "rev", label: "YouTube", color: YT_COLOR, values: r.perBucket.map((b) => b.revenue) },
              ...(hasFb ? [{ key: "fb", label: "Facebook", color: FB_COLOR, values: r.perBucket.map((b) => b.facebook) }] : []),
              ...(hasOther ? [{ key: "other", label: "Other income", color: OTHER_COLOR, values: r.perBucket.map((b) => b.other) }] : []),
            ]}
            format={money}
            onPick={setPickAt}
            pickHint="Click for the videos that made it"
          />
          <p className="mt-2 text-[11.5px] text-ink-faint">Click a {!r.buckets.length || r.buckets[0].from === r.buckets[0].to ? "day" : r.buckets[0].key.length === 7 ? "month" : "week"} for the videos that made its money.</p>
        </ChartCard>
      ) : (
        <p className="rounded-2xl border border-dashed border-line/20 py-10 px-6 text-center text-[13.5px] text-ink-soft">
          No revenue yet. YouTube&rsquo;s and Facebook&rsquo;s come with a sync (a monetized channel, or a Page in Facebook&rsquo;s Content Monetization); other income you add below.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Where it comes from" sub="Every stream in this range, biggest first">
          {r.streams.length ? (
            <ul className="space-y-2.5">
              {r.streams.map((x) => (
                <li key={x.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center">
                  <span className="flex items-center gap-2 min-w-0 text-[13px]">
                    <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: STREAM_COLOR[x.kind] }} aria-hidden />
                    <span className="truncate">{x.label}</span>
                  </span>
                  <span className="text-[13px] tabular-nums">
                    <b>{cents(x.amount)}</b>
                    <span className="text-ink-faint ml-2 inline-block w-10 text-right">{streamTotal ? `${Math.round((x.amount / streamTotal) * 100)}%` : ""}</span>
                  </span>
                  <span className="col-span-2 mt-1 h-1.5 rounded-[3px] bg-line/[0.07] overflow-hidden" aria-hidden>
                    <span className="block h-full rounded-[3px]" style={{ width: `${streamTotal ? Math.max(2, (x.amount / streamTotal) * 100) : 0}%`, background: STREAM_COLOR[x.kind] }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-faint">Nothing in this range.</p>
          )}
          {r.split && splitTotal > 0 && (
            <div className="mt-5 pt-4 border-t border-line/10">
              <div className="text-[12px] font-semibold text-ink-soft mb-2">YouTube revenue: Shorts vs long videos</div>
              <div className="flex h-3 rounded-[3px] overflow-hidden gap-[2px]" role="img" aria-label={`Shorts ${cents(r.split.shorts)}, long videos ${cents(r.split.long)}`}>
                <span style={{ width: `${(r.split.shorts / splitTotal) * 100}%`, background: SHORT_COLOR }} />
                <span style={{ width: `${(r.split.long / splitTotal) * 100}%`, background: LONG_COLOR }} />
              </div>
              <div className="mt-2 flex justify-between text-[12px] text-ink-soft">
                <span>
                  <span className="inline-block w-2 h-2 rounded-[2px] mr-1.5" style={{ background: SHORT_COLOR }} />
                  Shorts <b className="text-ink">{cents(r.split.shorts)}</b> · {Math.round((r.split.shorts / splitTotal) * 100)}%
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-[2px] mr-1.5" style={{ background: LONG_COLOR }} />
                  Long <b className="text-ink">{cents(r.split.long)}</b> · {Math.round((r.split.long / splitTotal) * 100)}%
                </span>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Other income"
          sub="Sponsorships, brand deals, affiliate links, other platforms: anything the synced numbers don't show"
          right={
            r.isMaster && !adding ? (
              <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px] hover:brightness-110">
                <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.4} />
                Add income
              </button>
            ) : undefined
          }
        >
          {adding && <IncomeForm teamId={teamId} currency={r.currency} onDone={() => setAdding(false)} />}
          {r.entries.length ? (
            <ul className="divide-y divide-line/10 -my-1">
              {r.entries.map((e) => (
                <IncomeRow key={e.id} e={e} teamId={teamId} canEdit={r.isMaster} money={cents} />
              ))}
            </ul>
          ) : (
            !adding && <p className="text-[13px] text-ink-faint">{r.isMaster ? "Nothing added in this range." : "Nothing in this range."}</p>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="By month" sub="The last 12 months">
          {r.months.length ? (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-ink-faint text-left">
                    <th className="font-bold pb-2 px-1">Month</th>
                    <th className="font-bold pb-2 px-1 text-right">YouTube</th>
                    {fbMonths && <th className="font-bold pb-2 px-1 text-right">Facebook</th>}
                    <th className="font-bold pb-2 px-1 text-right">Other</th>
                    <th className="font-bold pb-2 px-1 text-right">Total</th>
                    <th className="font-bold pb-2 px-1 text-right">RPM</th>
                  </tr>
                </thead>
                <tbody>
                  {r.months.map((m) => (
                    <tr key={m.month} className="border-t border-line/10">
                      <td className="py-2 px-1 whitespace-nowrap">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</td>
                      <td className="py-2 px-1 text-right tabular-nums">{cents(m.revenue)}</td>
                      {fbMonths && <td className="py-2 px-1 text-right tabular-nums">{m.facebook ? cents(m.facebook) : "–"}</td>}
                      <td className="py-2 px-1 text-right tabular-nums text-ink-soft">{m.other ? cents(m.other) : "–"}</td>
                      <td className="py-2 px-1 text-right tabular-nums font-semibold">{cents(m.revenue + m.facebook + m.other)}</td>
                      <td className="py-2 px-1 text-right tabular-nums text-ink-soft">{m.views ? cents((m.revenue / m.views) * 1000) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[13px] text-ink-faint">Nothing yet.</p>
          )}
        </ChartCard>
        {r.isMaster && <AccessCard r={r} teamId={teamId} />}
      </div>
      {pickAt !== null && (
        <RevenueVideosDialog
          teamId={teamId}
          stretches={r.buckets.map((b, i) => ({ from: b.from, to: b.to, youtube: r.perBucket[i]?.revenue ?? 0, facebook: r.perBucket[i]?.facebook ?? 0, other: r.perBucket[i]?.other ?? 0 }))}
          index={pickAt}
          money={cents}
          entries={r.entries.map((e) => ({ id: e.id, day: e.day, source: e.source, amount: e.amount, note: e.note ?? null }))}
          sourceLabel={(x) => SOURCE_LABEL[x] ?? x}
          onClose={() => setPickAt(null)}
        />
      )}
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  sponsorship: "Sponsorship",
  brand_deal: "Brand deal",
  affiliate: "Affiliate links",
  youtube_other: "YouTube (outside the estimate)",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  merch: "Merch",
  other: "Other",
};

/** Brand-ish dots for the income sources in the dropdown (meaning stays in the words). */
const SOURCE_TONE: Record<string, string> = {
  youtube_other: "rgb(var(--chart-yt))",
  facebook: "rgb(var(--chart-fb))",
  instagram: "rgb(var(--chart-ig))",
  tiktok: "rgb(var(--chart-tt))",
};

const POPULAR_CURRENCIES = ["USD", "EUR", "GBP", "RON", "CAD", "AUD", "CHF", "JPY", "INR", "BRL", "MXN", "PLN", "SEK", "NOK", "DKK", "HUF", "CZK", "TRY", "AED", "ZAR"];
let currencyNames: Intl.DisplayNames | null = null;
function currencyName(code: string) {
  try {
    currencyNames ??= new Intl.DisplayNames(["en"], { type: "currency" });
    return currencyNames.of(code) ?? code;
  } catch {
    return code;
  }
}
function currencySymbol(code: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((x) => x.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/** "Amounts in [EUR · Euro ▾]": any currency with an exchange rate, saved for this person. */
function CurrencyBar({ r }: { r: Revenue }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(r.currency);
  useEffect(() => setValue(r.currency), [r.currency]);
  const options = useMemo<SelectOption[]>(() => {
    const opt = (code: string, group: string): SelectOption => ({
      value: code,
      label: currencyName(code),
      hint: `${code} · ${currencySymbol(code)}`,
      group,
      icon: <span className="w-9 flex-shrink-0 text-[11px] font-bold font-mono text-ink-soft">{code}</span>,
    });
    const popular = POPULAR_CURRENCIES.filter((c) => r.currencies.includes(c));
    return [...popular.map((c) => opt(c, "Common")), ...r.currencies.filter((c) => !popular.includes(c)).map((c) => opt(c, "All currencies"))];
  }, [r.currencies]);
  const updated = r.fx?.updatedAt ? new Date(r.fx.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  return (
    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
      <span className="text-[12.5px] font-semibold text-ink-soft">Amounts in</span>
      <div className="w-[15.5rem] max-w-full">
        <Select
          value={value}
          onChange={(code) => {
            if (!code || code === value) return;
            const prev = value;
            setValue(code);
            start(async () => {
              const res = await setRevenueCurrency(code);
              if (res.error !== undefined) {
                setValue(prev);
                toast.error(res.error);
              } else router.refresh();
            });
          }}
          options={options}
          searchable
          ariaLabel="Currency"
          menuMinWidth={280}
          className={`!h-9 !text-[13px] ${pending ? "opacity-60" : ""}`}
          renderValue={(o) => (
            <span className="truncate">
              <b className="font-mono text-[12px] mr-1.5">{value}</b>
              {o?.label ?? currencyName(value)}
            </span>
          )}
        />
      </div>
      {r.fx && (
        <span className="text-[11.5px] text-ink-faint">
          {r.fx.converted ? "Converted at today\u2019s rate" : "Exchange rates"}
          {updated ? ` (${updated})` : ""} ·{" "}
          <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline decoration-line/30 underline-offset-2 hover:text-ink">
            Rates By Exchange Rate API
          </a>
        </span>
      )}
    </div>
  );
}

function IncomeForm({ teamId, currency, onDone }: { teamId: string; currency: string; onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const today = new Date();
  const [day, setDay] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
  const [source, setSource] = useState("sponsorship");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="mb-4 rounded-xl border border-line/15 bg-surface-2/50 p-3 grid gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)_8rem]"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const res = await addRevenueEntry(teamId, { day, source, amount: Number(amount.replace(",", ".")), note, currency });
        setSaving(false);
        if (res.error !== undefined) return toast.error(res.error);
        toast.success("Income added");
        onDone();
        router.refresh();
      }}
    >
      <DateChip value={day} onChange={setDay} ariaLabel="Date of the income" />
      <Select
        value={source}
        onChange={(v) => v && setSource(v)}
        ariaLabel="Where it came from"
        className="!h-9 !text-[13px]"
        menuMinWidth={240}
        options={Object.entries(SOURCE_LABEL).map(([k, v]) => ({ value: k, label: v, icon: <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: SOURCE_TONE[k] ?? OTHER_COLOR }} aria-hidden /> }))}
      />
      <label className="flex items-center h-9 rounded-lg border border-line/15 bg-surface px-2.5 text-[13px] focus-within:ring-2 focus-within:ring-amber/40">
        <span className="text-ink-faint mr-1.5 text-[12px] font-semibold">{currency}</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Amount" className="w-full bg-transparent outline-none tabular-nums" autoFocus />
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Note (optional): brand, campaign, which video…" aria-label="Note" className="sm:col-span-3 h-9 rounded-lg border border-line/15 bg-surface px-2.5 text-[13px]" />
      <div className="sm:col-span-3 flex items-center gap-2">
        <button type="submit" disabled={saving || !amount} className="rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] disabled:opacity-50">
          {saving ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Cancel
        </button>
      </div>
    </form>
  );
}

function IncomeRow({ e, teamId, canEdit, money }: { e: Revenue["entries"][number]; teamId: string; canEdit: boolean; money: (n: number) => string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-14 text-[12px] text-ink-faint tabular-nums flex-shrink-0">{niceDay(e.day)}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold truncate">{SOURCE_LABEL[e.source] ?? "Other"}</span>
        {(e.note || e.video) && (
          <span className="block text-[11.5px] text-ink-soft truncate">
            {e.video && (
              <Link href={e.video.kind === "short" ? `/shorts/${e.video.id}` : `/videos/${e.video.id}`} className="font-mono text-amber hover:underline mr-1.5">
                #{e.video.number ?? "?"}
              </Link>
            )}
            {e.note}
          </span>
        )}
      </span>
      <span className="text-right">
        <b className="block text-[13px] tabular-nums">{money(e.amount)}</b>
        {e.original && (
          <span className="block text-[11px] text-ink-faint tabular-nums">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: e.original.currency }).format(e.original.amount)}
          </span>
        )}
      </span>
      {canEdit && (
        <button
          type="button"
          disabled={busy}
          aria-label="Remove this income"
          onClick={async () => {
            const ok = await confirm({ title: "Remove this income?", description: `${SOURCE_LABEL[e.source] ?? "Other"}, ${money(e.amount)} on ${niceDay(e.day)}.`, confirmLabel: "Remove", danger: true });
            if (!ok) return;
            setBusy(true);
            const res = await deleteRevenueEntry(teamId, e.id);
            setBusy(false);
            if (res.error !== undefined) toast.error(res.error);
            else router.refresh();
          }}
          className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-red hover:bg-red/10 disabled:opacity-50"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}

function AccessCard({ r, teamId }: { r: Revenue; teamId: string }) {
  const toast = useToast();
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <ChartCard title="Who can see revenue" sub="Masters always can. Turn it on for anyone else you trust with it.">
      <ul className="space-y-1">
        {r.access.map((p) => {
          const on = p.master || p.granted;
          return (
            <li key={p.userId} className="flex items-center gap-2.5 py-1.5">
              <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-7 h-7 text-[10px]" />
              <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{p.name}</span>
              {p.master ? (
                <span className="text-[12px] text-ink-faint">Master</span>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${p.name} can see revenue`}
                  disabled={busy === p.userId}
                  onClick={async () => {
                    // Money is sensitive: giving or taking away access asks first (1.17.0).
                    const ok = await confirm(
                      on
                        ? { title: `Stop ${p.name} seeing revenue?`, description: "Revenue disappears from their Analytics (the Revenue tab, money on Advanced, revenue projections). You can turn it back on any time.", confirmLabel: "Take it away", danger: true }
                        : { title: `Let ${p.name} see revenue?`, description: "They'll see the channel's revenue, RPM and each video's money in Analytics, and revenue projections. They get a notification.", confirmLabel: "Let them see it" }
                    );
                    if (!ok) return;
                    setBusy(p.userId);
                    const res = await setRevenueAccess(teamId, p.userId, !on);
                    setBusy(null);
                    if (res.error !== undefined) toast.error(res.error);
                    else {
                      toast.success(on ? `${p.name} no longer sees revenue` : `${p.name} can see revenue now`);
                      router.refresh();
                    }
                  }}
                  className={`w-10 h-6 rounded-lg relative transition-colors disabled:opacity-60 ${on ? "bg-amber" : "bg-line/20"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-md bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
