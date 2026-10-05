"use client";

import { useTransition } from "react";
import { signOut } from "@/app/(dashboard)/actions";
import { useConfirm } from "@/components/ui/confirm-provider";

/** Every "Log out" in the app: asks first, then signs out (and switches this device's notifications off). */
export function LogoutButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={async () => {
        const ok = await confirm({
          title: "Log out?",
          description: "You'll need your email and password to sign back in. Notifications on this device stop until you do.",
          confirmLabel: "Log out",
          cancelLabel: "Stay signed in",
        });
        if (ok) start(() => signOut());
      }}
    >
      {pending ? "Logging out…" : children}
    </button>
  );
}
