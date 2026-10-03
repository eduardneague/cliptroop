"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveAppError } from "./actions";

/** Checks again every minute while the page is open. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function ResolveButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {err && <span className="text-[11px] text-red">{err}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resolveAppError(id);
            if (r.error) setErr(r.error);
            else router.refresh();
          })
        }
        className="rounded-md border border-line/20 px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 disabled:opacity-50"
      >
        Mark fixed
      </button>
    </span>
  );
}
