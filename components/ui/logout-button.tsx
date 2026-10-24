"use client";

import { useTransition } from "react";
import { signOut } from "@/app/(dashboard)/actions";
import { useConfirm } from "@/components/ui/confirm-provider";

/** What "Log out?" says, everywhere it's asked (this button, the search palette). 1.31.11: this device only. */
export const LOGOUT_CONFIRM = {
  title: "Log out?",
  description: "You'll need your email and password to sign back in here. Notifications on this device stop until you do. Your other devices stay signed in.",
  confirmLabel: "Log out",
  cancelLabel: "Stay signed in",
};

/** Every "Log out" in the app: asks first, then signs this device out (and switches its notifications off). */
export function LogoutButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={async () => {
        const ok = await confirm(LOGOUT_CONFIRM);
        if (ok) start(() => signOut());
      }}
    >
      {pending ? "Logging out…" : children}
    </button>
  );
}
