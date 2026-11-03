"use client";

import { useTransition } from "react";
import { deleteShort, setShortDayLimit } from "@/app/(dashboard)/shorts/actions";
import { useToast } from "@/components/ui/toast-provider";
import { formatShortDate } from "./dates";
import type { Away } from "@/lib/remove-animation";

/**
 * Delete a short. The queue pulls the next short in to fill the gap —
 * and the toast offers the alternative in one click: keep that day at
 * the number it has left (a day exception), pushing things back out.
 *
 * 1.38.0: `away` (remove-animation.ts) plays while it goes: the line and the
 * slide first, then the server is asked while the gap closes (so the list
 * never jumps half-way); if deleting fails, the short comes back.
 */
export function useDeleteShort(onDeleted?: () => void) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function run(id: string, number: number, away?: () => Away | null) {
    startTransition(async () => {
      const anim = away?.() ?? null;
      if (anim) await anim.out;
      const asked = deleteShort(id);
      const closing = anim?.collapse();
      const res = await asked;
      if (res.error !== undefined) {
        anim?.restore();
        toast.error(res.error);
        return;
      }
      await closing;
      onDeleted?.();
      // The animation made its own sound.
      const quiet = anim ? ({ sound: false } as const) : undefined;
      const v = "vacated" in res ? res.vacated : undefined;
      if (!v) {
        toast.success(`#${number} deleted`, quiet);
        return;
      }
      const dayLabel = formatShortDate(v.day) ?? v.day;
      toast.success(`#${number} deleted. The next short moved up to fill ${dayLabel}.`, {
        ...quiet,
        action: {
          label: v.keep === 0 ? `Leave ${dayLabel} empty` : `Keep ${dayLabel} at ${v.keep}`,
          onClick: async () => {
            const r = await setShortDayLimit(v.teamId, v.day, v.keep);
            if (r.error !== undefined) toast.error(r.error);
            else toast.success(v.keep === 0 ? `${dayLabel} left empty. Dates updated` : `${dayLabel} now takes ${v.keep}. Dates updated`);
          },
        },
      });
    });
  }

  return { run, pending };
}
