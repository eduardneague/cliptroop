import { cookies } from "next/headers";
import { BusinessSkeleton } from "@/modules/business/components/skeletons";
import { LANG_COOKIE, langOf } from "@/modules/business/lib/i18n";

/** Business while it loads (modules/business/components/skeletons.tsx), in the page's language. */
export default async function Loading() {
  let lang = langOf(null);
  try {
    lang = langOf((await cookies()).get(LANG_COOKIE)?.value);
  } catch {
    /* drawn ahead of a request: English */
  }
  return <BusinessSkeleton lang={lang} />;
}
