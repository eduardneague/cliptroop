"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { runDuePostsNow } from "@/app/(dashboard)/shorts/[id]/schedule-actions";

/** Keeps the page live while anything is scheduled or moving. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), active ? 15_000 : 60_000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

/** "Fri 17:00 · in 2h 13m" / "5 min ago", in the viewer's time zone. */
export function When({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const t = Date.parse(iso);
  const abs = new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const m = Math.round((t - now) / 60_000);
  const rel = m > 0 ? (m < 60 ? `in ${m} min` : m < 2880 ? `in ${Math.floor(m / 60)}h ${m % 60}m` : `in ${Math.round(m / 1440)} days`) : m > -60 ? `${-m} min ago` : m > -2880 ? `${Math.round(-m / 60)}h ago` : `${Math.round(-m / 1440)} days ago`;
  return (
    <span title={abs}>
      {abs} · {rel}
    </span>
  );
}

export function RunNowButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await runDuePostsNow("");
        setBusy(false);
        if (r.error !== undefined) toast.error(r.error);
        else {
          toast.success(r.claimed ? `Processed ${r.claimed} post${r.claimed === 1 ? "" : "s"}` : "Nothing due right now");
          router.refresh();
        }
      }}
      className="rounded-lg border border-dashed border-amber/60 text-amber px-3 h-9 text-[12.5px] font-bold disabled:opacity-50"
      title="Only on staging and your computer"
    >
      {busy ? "Running…" : "Run due posts now"}
    </button>
  );
}
