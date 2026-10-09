import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/brand";
import { getCachedUser } from "@/lib/supabase/get-user";
import { isDeveloper } from "@/lib/errors";
import { AutoRefresh } from "@/components/status/status-board";
import { PendingNav, PendingSwap } from "@/components/ui/pending-nav";
import { TabNav } from "@/components/ui/tab-nav";
import { TestAlertButton } from "./developer-client";
import { DEV_TABS, DevTabSkeleton, devTab } from "./skeletons";
import { OverviewTab } from "./overview";
import { UsageTab } from "./usage";
import { ProblemsTab } from "./problems";
import { StatusTab } from "./status-tab";

export const metadata: Metadata = { title: "Developer" };
export const dynamic = "force-dynamic";

/**
 * The developer area: the whole app, for developer accounts only
 * (DEVELOPER_EMAILS, matched against the signed-in email; lib/errors.ts).
 * Everyone else gets a 404. Tabs: Overview (a dashboard of the rest),
 * Usage (database, storage, every team and person), Problems (reports and
 * errors), Status (every check in full). Only the open tab is loaded.
 */
export default async function DeveloperPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCachedUser();
  if (!(await isDeveloper(user))) notFound();
  const tab = devTab((await searchParams).tab);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto space-y-5">
      {/* Usage counts everything: refreshed when you ask (open the tab again), the rest every minute. */}
      {tab !== "usage" && <AutoRefresh />}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-semibold">Developer</h1>
          <p className="text-[13px] text-ink-soft max-w-xl">
            {APP_NAME} as a whole, for developer accounts only. Everyone else sees the{" "}
            <Link href="/status" className="text-amber font-semibold hover:underline">
              status page
            </Link>{" "}
            (levels only), and each team sees its own problems on Posting.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/setup" className="rounded-lg border border-line/20 px-3.5 h-9 inline-flex items-center text-[13px] font-semibold hover:border-line/40">
            App setup
          </Link>
          <TestAlertButton />
        </div>
      </header>

      <PendingNav>
        <TabNav base="/developer" active={tab} label="Developer" tabs={DEV_TABS.map((t) => ({ id: t.id, label: t.label }))} />
        <div className="mt-5">
          <PendingSwap fallbacks={Object.fromEntries(DEV_TABS.map((t) => [t.id, <DevTabSkeleton key={t.id} tab={t.id} />]))}>
            {tab === "overview" && <OverviewTab />}
            {tab === "usage" && <UsageTab />}
            {tab === "problems" && <ProblemsTab />}
            {tab === "status" && <StatusTab />}
          </PendingSwap>
        </div>
      </PendingNav>
    </div>
  );
}
