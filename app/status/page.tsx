import type { Metadata } from "next";
import Link from "next/link";
import { getCachedUser } from "@/lib/supabase/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAlertPerson } from "@/lib/errors";
import { coreChecks, jobChecks, vendorChecks, worst, type Level } from "@/lib/status";
import { Brand } from "@/components/ui/clip-logo";
import { AutoRefresh, ResolveButton } from "./status-client";

export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";

const LEVEL: Record<Level, { label: string; dot: string; tone: string }> = {
  ok: { label: "Working", dot: "bg-green", tone: "text-green" },
  warn: { label: "Needs a look", dot: "bg-gold", tone: "text-gold" },
  down: { label: "Not working", dot: "bg-red", tone: "text-red" },
  unknown: { label: "Unknown", dot: "bg-line/40", tone: "text-ink-soft" },
};

const BANNER: Record<Level, { title: string; box: string }> = {
  ok: { title: "Everything is working", box: "border-green/30 bg-green/10" },
  warn: { title: "Working, with something to look at", box: "border-gold/30 bg-gold/10" },
  down: { title: "Something isn't working", box: "border-red/30 bg-red/10" },
  unknown: { title: "Checking…", box: "border-line/15 bg-surface" },
};

/**
 * VPlanner's status: the app's own parts (database, sign-in, files, timers,
 * analytics, posting, email, errors) and the services it runs on. Everyone
 * can see it; the people who get the alerts also see the recent errors.
 */
export default async function StatusPage() {
  const [core, jobs, vendors, user] = await Promise.all([coreChecks(), jobChecks(), vendorChecks(), getCachedUser()]);
  const insider = await isAlertPerson(user?.id);
  const { data: errors } = insider
    ? await createAdminClient().from("app_errors").select("id, source, message, route, count, first_seen, last_seen, resolved_at").order("last_seen", { ascending: false }).limit(30)
    : { data: null };
  const overall = worst([...core, ...jobs].map((c) => c.level).filter((l) => l !== "unknown"));
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  const Row = ({ name, level, detail, href }: { name: string; level: Level; detail: string; href?: string }) => (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${LEVEL[level].dot}`} aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {name}
            </a>
          ) : (
            name
          )}
        </span>
        <span className="block text-[12.5px] text-ink-soft">{detail}</span>
      </span>
      <span className={`text-[12px] font-semibold whitespace-nowrap ${LEVEL[level].tone}`}>{LEVEL[level].label}</span>
    </li>
  );
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:py-12">
      <AutoRefresh />
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/dashboard" aria-label="VPlanner">
            <Brand />
          </Link>
          <span className="text-[12px] text-ink-faint">Status · v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
        </header>

        <section className={`rounded-2xl border px-5 py-4 ${BANNER[overall].box}`}>
          <h1 className="font-display text-[22px] font-semibold">{BANNER[overall].title}</h1>
          <p className="text-[12.5px] text-ink-soft mt-0.5">Checked {fmt(new Date().toISOString())}. This page checks again every minute.</p>
        </section>

        <section className="rounded-2xl border border-line/10 bg-surface px-5 py-2">
          <h2 className="pt-3 text-[12px] font-bold uppercase tracking-wide text-ink-faint">VPlanner</h2>
          <ul className="divide-y divide-line/10">
            {[...core, ...jobs].map((c) => (
              <Row key={c.key} name={c.name} level={c.level} detail={c.detail} />
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line/10 bg-surface px-5 py-2">
          <h2 className="pt-3 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Services VPlanner runs on</h2>
          <ul className="divide-y divide-line/10">
            {vendors.map((v) => (
              <Row key={v.key} name={v.name} level={v.level} detail={v.detail} href={v.url} />
            ))}
          </ul>
        </section>

        {insider && (
          <section className="rounded-2xl border border-line/10 bg-surface px-5 py-2">
            <h2 className="pt-3 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Recent errors (only you see these)</h2>
            {errors?.length ? (
              <ul className="divide-y divide-line/10">
                {errors.map((e) => (
                  <li key={e.id as string} className={`py-3 ${e.resolved_at ? "opacity-55" : ""}`}>
                    <div className="flex items-start gap-3">
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-semibold break-words">{e.message as string}</span>
                        <span className="block text-[12px] text-ink-soft">
                          {e.source as string}
                          {e.route ? ` · ${e.route}` : ""} · {e.count as number}× · last {fmt(e.last_seen as string)}
                          {e.resolved_at ? " · marked fixed" : ""}
                        </span>
                      </span>
                      {!e.resolved_at && <ResolveButton id={e.id as string} />}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-[13px] text-ink-soft">No errors recorded.</p>
            )}
          </section>
        )}
        <p className="text-center text-[11.5px] text-ink-faint">For uptime monitors: /api/health answers 200 when the core is up, 503 when it isn&rsquo;t.</p>
      </div>
    </main>
  );
}
