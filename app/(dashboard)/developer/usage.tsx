import { ExternalIcon } from "@/components/ui/icons";
import { bucketLabel, loadUsage, planLimits, supabaseUsageUrl } from "./data";
import { fmtBytes, fmtNum } from "./format";
import { PeopleTable, TablesList, TeamsTable } from "./usage-tables";
import { card, h2, Meter, ShareRow, UploadsChart, Widget } from "./ui";

/**
 * Usage: everything the app stores. The plan's two limits first (database,
 * file storage), then what's counted, uploads per day, storage per kind of
 * file, every team, every person and the biggest tables.
 */
export async function UsageTab() {
  const { usage, error } = await loadUsage();
  const plan = planLimits();
  if (!usage)
    return (
      <section className={`${card} p-6 text-center`}>
        <p className="text-[14px] font-semibold">Usage isn&rsquo;t available</p>
        <p className="mt-1 text-[13px] text-ink-soft">{error ?? "Try again in a moment."}</p>
      </section>
    );
  const c = usage.counts;
  const bucketTotal = usage.buckets.reduce((t, b) => t + b.bytes, 0);
  const tiles: [string, number, string?][] = [
    ["Accounts", c.people, `${fmtNum(c.people7)} this week · ${fmtNum(c.people30)} this month`],
    ["Teams", c.teams],
    ["Shorts", c.shorts],
    ["Long videos", c.longs],
    ["Video files", c.videoFiles, `${fmtBytes(c.videoBytes)} · ${fmtNum(c.videoFilesCleaned)} cleaned up`],
    ["Scripts", c.scripts],
    ["Posts published", c.postsPublished],
    ["Tasks done", c.tasksDone],
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Widget title={`Database · ${plan.name} plan`}>
          <Meter used={usage.database.bytes} limit={plan.database} />
        </Widget>
        <Widget title={`File storage · ${plan.name} plan`}>
          <Meter used={usage.storage.bytes} limit={plan.storage} />
          <p className="mt-2 text-[12px] text-ink-soft tabular-nums">{fmtNum(usage.storage.files)} files</p>
        </Widget>
        <Widget title="Counted by Supabase only">
          <p className="text-[12.5px] text-ink-soft leading-relaxed">
            Downloads (egress, {plan.egress} a month included) and monthly active sign-ins ({plan.people} included) are only counted by Supabase. Biggest single upload on this plan:{" "}
            {plan.upload}.
          </p>
          <a href={supabaseUsageUrl()} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-amber hover:underline">
            Supabase usage page
            <ExternalIcon className="w-3.5 h-3.5" />
          </a>
          <p className="mt-2 text-[11.5px] text-ink-faint">
            {plan.name === "Free" ? "Limits shown for the Free plan. On Pro, set SUPABASE_PLAN=pro in Vercel." : "Limits shown for the Pro plan (SUPABASE_PLAN=pro). Pro bills past them instead of stopping."}
          </p>
        </Widget>
      </div>

      <section className={`${card} p-4`}>
        <h2 className={`${h2} mb-3`}>What&rsquo;s stored</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
          {tiles.map(([label, n, sub]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[12px] text-ink-soft">{label}</dt>
              <dd className="font-display text-[24px] leading-tight font-semibold tabular-nums">{fmtNum(n)}</dd>
              {sub && <dd className="text-[11.5px] text-ink-faint truncate">{sub}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-5 items-start scroll-mt-24" id="storage">
        <Widget title="Uploads per day, 30 days" className="lg:col-span-3">
          <UploadsChart days={usage.uploads} height={120} />
          <p className="mt-3 text-[12px] text-ink-soft">
            {fmtNum(usage.uploads.reduce((t, d) => t + d.files, 0))} files, {fmtBytes(usage.uploads.reduce((t, d) => t + d.bytes, 0))} in 30 days. Short videos are deleted after posting, on each team&rsquo;s
            schedule (Team → Defaults → Video files), so storage goes down too.
          </p>
        </Widget>
        <Widget title="Storage by kind of file" className="lg:col-span-2">
          {usage.buckets.length ? (
            <ul className="-my-2">
              {usage.buckets.map((b) => (
                <ShareRow key={b.id} label={bucketLabel(b.id)} sub={b.id} value={b.bytes} total={bucketTotal} right={<><b className="text-ink">{fmtBytes(b.bytes)}</b> · {fmtNum(b.files)}</>} />
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-soft">No files yet.</p>
          )}
        </Widget>
      </div>

      <section className={`${card} p-4 scroll-mt-24`} id="teams">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h2 className={h2}>Teams</h2>
          <span className="text-[12px] text-ink-faint">{fmtNum(usage.teams.length)}</span>
        </div>
        <p className="text-[12.5px] text-ink-soft mb-3">
          Files: everything stored for the team (videos, thumbnails, sketches…). Data: its rows in the database and, from them, about how much of the database it takes. Click a column to sort.
        </p>
        <TeamsTable teams={usage.teams} />
      </section>

      <section className={`${card} p-4 scroll-mt-24`} id="people">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h2 className={h2}>Everyone</h2>
          <span className="text-[12px] text-ink-faint">{fmtNum(usage.people.length)}</span>
        </div>
        <p className="text-[12.5px] text-ink-soft mb-3">Every account: its teams, when it last signed in, what it uploaded and how many tasks it finished.</p>
        <PeopleTable people={usage.people} />
      </section>

      <section className={`${card} p-4 scroll-mt-24`} id="tables">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h2 className={h2}>Database tables</h2>
          <span className="text-[12px] text-ink-faint">{fmtBytes(usage.database.bytes)} in all</span>
        </div>
        <p className="text-[12.5px] text-ink-soft mb-3">The biggest tables with their indexes. Rows of ours are exact; Supabase&rsquo;s own (auth, storage…) are estimates (≈).</p>
        <TablesList tables={usage.tables} total={usage.database.bytes} />
      </section>

      <p className="text-[11.5px] text-ink-faint">
        Counted <span className="tabular-nums">{new Date(usage.at).toISOString().slice(0, 16).replace("T", " ")}</span> UTC, when this page opened.
      </p>
    </div>
  );
}
