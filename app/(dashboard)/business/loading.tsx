import { cookies } from "next/headers";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";
import { BUSINESS_TABS } from "@/modules/business/components/tabs";
import { BusinessTabSkeleton } from "@/modules/business/components/skeletons";
import { LANG_COOKIE, langOf } from "@/modules/business/lib/i18n";

/** Business (1.42.0): the title, the year and Export, the tabs, then the Overview's cards (in the page's language). */
export default async function Loading() {
  let lang = langOf(null);
  try {
    lang = langOf((await cookies()).get(LANG_COOKIE)?.value);
  } catch {
    /* drawn ahead of a request: English */
  }
  return (
    <SkeletonPage width="max-w-[1480px]" className="px-4 sm:px-6 xl:px-8 py-6 sm:py-8 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap" aria-hidden>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] font-semibold">{lang === "ro" ? "Contabilitate" : "Business"}</h1>
          <Skeleton className="h-3.5 w-72 max-w-full mt-1.5" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-[84px] rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </header>
      <nav className="flex items-center gap-1 border-b border-line/15 overflow-hidden" aria-hidden>
        {BUSINESS_TABS.map((t) => (
          <span key={t.id} className="px-3.5 h-11 inline-flex items-center text-[14px] font-semibold text-ink-faint whitespace-nowrap">
            {t.label[lang]}
          </span>
        ))}
      </nav>
      <BusinessTabSkeleton tab="overview" />
    </SkeletonPage>
  );
}
