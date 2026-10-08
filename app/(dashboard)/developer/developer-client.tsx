"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { resolveAllAppErrors, resolveAppError, sendTestAlert } from "./actions";

export function ResolveButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const act = useAction(resolveAppError, { success: "Marked fixed. If it happens again, you'll get an alert.", onSuccess: () => router.refresh() });
  return (
    <button
      type="button"
      disabled={act.pending}
      onClick={async () => {
        const ok = await confirm({ title: "Mark this error fixed?", description: "If it happens again, it shows up here again and you get an alert.", confirmLabel: "Mark fixed" });
        if (ok) act.run(id);
      }}
      className="rounded-lg border border-line/20 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 disabled:opacity-50 whitespace-nowrap"
    >
      {act.pending ? "Saving…" : "Mark fixed"}
    </button>
  );
}

export function ResolveAllButton({ count }: { count: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const act = useAction(resolveAllAppErrors, { success: "All marked fixed.", onSuccess: () => router.refresh() });
  return (
    <button
      type="button"
      disabled={act.pending}
      onClick={async () => {
        const ok = await confirm({
          title: `Mark all ${count} fixed?`,
          description: "Any of them that happens again shows up here again and sends you an alert.",
          confirmLabel: "Mark all fixed",
        });
        if (ok) act.run();
      }}
      className="rounded-lg border border-line/20 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 disabled:opacity-50 whitespace-nowrap"
    >
      {act.pending ? "Saving…" : "Mark all fixed"}
    </button>
  );
}

export function TestAlertButton() {
  const toast = useToast();
  const act = useAction(sendTestAlert, {
    onSuccess: (r) => {
      const n = r.notified ?? 0;
      const e = r.emails ?? 0;
      toast.success(`Sent: ${n} notification${n === 1 ? "" : "s"}${e ? `, ${e} email${e === 1 ? "" : "s"}` : ", no email (email isn't set up here, or it failed)"}`);
    },
  });
  return (
    <button
      type="button"
      disabled={act.pending}
      onClick={() => act.run()}
      className="rounded-lg bg-amber text-white px-3.5 h-9 text-[13px] font-bold hover:brightness-105 disabled:opacity-60 whitespace-nowrap"
    >
      {act.pending ? "Sending…" : "Send a test alert"}
    </button>
  );
}
