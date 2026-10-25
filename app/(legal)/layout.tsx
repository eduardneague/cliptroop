import { SitePage } from "@/components/site/site-chrome";

/** Public pages (no sign-in): privacy policy, terms, data deletion. Since 1.33.0 they wear the website's header and footer. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SitePage>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 legal">{children}</div>
    </SitePage>
  );
}
