"use client";

import { AnalyticsIcon } from "@/components/ui/icons";
import { domainOf, type Affiliate } from "../lib/rules";
import { useAffiliates } from "./affiliates-context";
import { LoginCell } from "./login-cell";

const ICON = "relative z-10 w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber";

/**
 * The table's affiliate platform and its login, as two small icons (1.57.1; the owner: "make the login and platform
 * be way smaller or in a different way, maybe with like links or something that are going to be icons"): a chart that
 * opens the platform (where the sales are), and for the people let in a lock that shows the login beside the row. A
 * place without one keeps its room, so the icons line up from row to row.
 */
export function PlatformLinks({ affiliate }: { affiliate: Affiliate }) {
  const ctx = useAffiliates();
  const a = affiliate;
  const login = !!ctx?.manage && !!a.login;
  if (!a.platformUrl && !login) return <span className="text-[12px] text-ink-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {a.platformUrl ? (
        <a
          href={a.platformUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${a.name}'s affiliate platform (${domainOf(a.platformUrl)})`}
          title={`Affiliate platform: ${domainOf(a.platformUrl)}`}
          className={ICON}
        >
          <AnalyticsIcon className="w-4 h-4" />
        </a>
      ) : (
        login && <span className="w-8 h-8" aria-hidden />
      )}
      {login && <LoginCell affiliate={a} variant="icon" />}
    </span>
  );
}
