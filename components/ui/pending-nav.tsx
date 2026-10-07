"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { startNavProgress } from "./nav-progress";

/**
 * Instant answers for steps and tabs that stay on the same page (?tab=…,
 * ?view=…). Those don't show a page's loading skeleton by themselves: the old
 * content just sat there until the new one arrived. Inside <PendingNav>:
 *   <PendingLink navKey="script">  the step/tab lights up the moment it's clicked
 *   <PendingSwap fallback={…}>     its content turns into a skeleton meanwhile
 *   usePendingNav().pending        which step/tab is on its way (or null)
 */
type PendingNavValue = { pending: string | null; go: (href: string, key: string) => void };

const PendingNavContext = createContext<PendingNavValue | null>(null);

export function PendingNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const go = useCallback(
    (href: string, key: string) => {
      // Already there: nothing to load.
      if (typeof window !== "undefined" && new URL(href, window.location.href).href === window.location.href) return;
      setTarget(key);
      startNavProgress();
      startTransition(() => router.push(href, { scroll: false }));
    },
    [router]
  );
  const value = useMemo(() => ({ pending: isPending ? target : null, go }), [isPending, target, go]);
  return <PendingNavContext.Provider value={value}>{children}</PendingNavContext.Provider>;
}

/** Outside a <PendingNav> it still works: a plain move, nothing pending. */
export function usePendingNav(): PendingNavValue & { inside: boolean } {
  const ctx = useContext(PendingNavContext);
  const router = useRouter();
  const plain = useCallback(
    (href: string) => {
      startNavProgress(href);
      router.push(href, { scroll: false });
    },
    [router]
  );
  return ctx ? { ...ctx, inside: true } : { pending: null, go: plain, inside: false };
}

type LinkProps = Omit<React.ComponentProps<typeof Link>, "href" | "onClick"> & { href: string; navKey: string };

/** A link whose page stays the same (a step, a tab): answers at once, see above. */
export function PendingLink({ href, navKey, children, ...rest }: LinkProps) {
  const { go, inside } = usePendingNav();
  return (
    <Link
      href={href}
      scroll={false}
      {...rest}
      // Inside <PendingNav> the bar is started by go() itself.
      data-no-progress={inside ? "" : undefined}
      onClick={(e) => {
        if (!inside || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(href, navKey);
      }}
    >
      {children}
    </Link>
  );
}

/**
 * The part of the page that changes with the step/tab: while another one is
 * on its way, its skeleton (by key in `fallbacks`, else `fallback`) stands in.
 */
export function PendingSwap({
  children,
  fallback,
  fallbacks,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  fallbacks?: Record<string, React.ReactNode>;
}) {
  const { pending } = usePendingNav();
  if (pending === null) return <>{children}</>;
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      {fallbacks?.[pending] ?? fallback ?? null}
    </div>
  );
}
