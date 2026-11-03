"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { setProfilePublic } from "@/modules/profile/actions";

/** Settings → Profile (1.28.0): who sees your profile. Public: everyone signed in. Private: others see only your name and picture. */
export function ProfilePrivacy({ initial, ready }: { initial: boolean; ready: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  function pick(v: boolean) {
    if (v === on || pending) return;
    setOn(v);
    start(async () => {
      const r = await setProfilePublic(v);
      if (r.error) {
        setOn(!v);
        toast.error(r.error);
        return;
      }
      toast.success(v ? "Your profile is public" : "Your profile is private");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">Who sees your profile</div>
        <div className="text-[11.5px] text-ink-faint">
          {!ready ? "This needs the latest database update (migration 0093)." : on ? "Everyone signed in sees your level, achievements and showcases." : "Others see only your name and picture."}
        </div>
      </div>
      <div role="radiogroup" aria-label="Who sees your profile" className="inline-flex rounded-lg border border-line/15 p-0.5 flex-shrink-0">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={on === v}
            data-sound="none"
            disabled={!ready || pending}
            onClick={() => pick(v)}
            className={`px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${on === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {v ? "Public" : "Private"}
          </button>
        ))}
      </div>
    </div>
  );
}
