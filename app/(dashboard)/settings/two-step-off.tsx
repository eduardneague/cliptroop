"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { turnOffTwoStep } from "@/app/two-step/actions";
import { BTN } from "./account-parts";

/**
 * Settings → Account → Two-step sign-in → Turn off (1.49.0: it's optional). Asks first; the server only does it for a
 * sign-in that typed its code.
 */
export function TwoStepOff() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function turnOff() {
    start(async () => {
      const r = await turnOffTwoStep();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setOpen(false);
      toast.success("Two-step sign-in is off");
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BTN}>
        Turn off
      </button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Turn off two-step sign-in?"
        description="Signing in will only ask for your password. You can turn it on again any time."
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="rounded-lg border border-line/15 px-3.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink">
              Keep it on
            </button>
            <button type="button" onClick={turnOff} disabled={pending} className="rounded-lg bg-red text-white px-3.5 h-9 text-[13px] font-semibold hover:brightness-110 disabled:opacity-40">
              {pending ? "Turning it off…" : "Turn it off"}
            </button>
          </div>
        }
      >
        <p className="text-[13px] text-ink-soft leading-relaxed">Without it, anyone who learns your password can sign in as you.</p>
      </Dialog>
    </>
  );
}
