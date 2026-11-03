"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { signOutElsewhere } from "./account-actions";

/**
 * Settings → Account → Sign out everywhere else (1.31.11): every other
 * device signed in to your account is signed out and stops getting your
 * notifications; this one stays. For a lost phone or a shared computer.
 */
export function SignOutElsewhere({ className }: { className?: string }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={async () => {
        const ok = await confirm({
          title: "Sign out everywhere else?",
          description:
            "Every other phone, computer and browser signed in to your account is signed out and stops getting your notifications. This one stays signed in. Signing in again on them takes your password.",
          confirmLabel: "Sign them out",
          cancelLabel: "Cancel",
        });
        if (!ok) return;
        start(async () => {
          const r = await signOutElsewhere();
          if (r.ok) toast.success("Signed out everywhere else. This device stays signed in.");
          else toast.error(r.error ?? "Couldn't sign out your other devices. Try again in a minute.");
        });
      }}
    >
      {pending ? "Signing out…" : "Sign out everywhere else"}
    </button>
  );
}
