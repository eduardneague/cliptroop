"use client";

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { setRsvp } from "@/app/(dashboard)/meetings/actions";
import { sounds } from "@/lib/sounds";
import type { Rsvp } from "../lib/types";

const CHOICES: { v: Exclude<Rsvp, "pending">; label: string; on: string }[] = [
  { v: "yes", label: "Going", on: "bg-green text-white border-green" },
  { v: "maybe", label: "Maybe", on: "bg-gold text-white border-gold" },
  { v: "no", label: "Not going", on: "bg-ink-soft text-paper border-ink-soft" },
];

/**
 * Going · Maybe · Not going — your answer, saved right away. `xs`: the
 * dashboard's Next meeting at its smallest (1.27.5); `fill`: the three share
 * the whole width.
 */
export function RsvpButtons({ meetingId, value, size = "md", disabled, fill = false }: { meetingId: string; value: Rsvp | null; size?: "xs" | "sm" | "md"; disabled?: boolean; fill?: boolean }) {
  const toast = useToast();
  const [shown, setShown] = useState<Rsvp | null>(value);
  const [pending, start] = useTransition();
  useEffect(() => setShown(value), [value]);
  const h = size === "xs" ? `h-7 ${fill ? "px-1.5" : "px-2"} text-[12px]` : size === "sm" ? `h-8 ${fill ? "px-2" : "px-3"} text-[12.5px]` : "h-10 px-4 text-[13.5px]";
  return (
    // fill: each as wide as its words plus an equal share of what's left; in a very narrow box the last one wraps
    // onto its own line instead of running past the edge.
    <div role="radiogroup" aria-label="Your answer" className={fill ? "flex flex-wrap gap-1 w-full" : "inline-flex gap-1.5"}>
      {CHOICES.map((c) => {
        const on = shown === c.v;
        return (
          <button
            key={c.v}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || pending}
            data-sound="none"
            onClick={() => {
              const next: Rsvp = on ? "pending" : c.v;
              const before = shown;
              setShown(next);
              if (next === "yes") sounds.check();
              else sounds.tick();
              start(async () => {
                const r = await setRsvp(meetingId, next);
                if (r.error !== undefined) {
                  setShown(before);
                  toast.error(r.error);
                }
              });
            }}
            className={`${h} ${fill ? "flex-auto" : ""} rounded-lg border font-bold whitespace-nowrap transition-all active:scale-95 disabled:opacity-60 ${on ? c.on : "border-line/20 text-ink-soft hover:text-ink hover:border-line/40"}`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
