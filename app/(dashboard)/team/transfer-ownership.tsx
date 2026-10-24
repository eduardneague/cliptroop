"use client";

import { ChevronDownIcon } from "@/components/ui/icons";

import { useEffect, useRef, useState, useTransition } from "react";
import { requestOwnershipTransfer, cancelOwnershipTransfer } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { colorForId, initialsFor } from "@/lib/avatar";
import { AvatarImg } from "@/components/ui/avatar-img";

type Candidate = { userId: string; name: string; avatarUrl: string | null };

export function TransferOwnership({
  teamId,
  candidates,
  pendingTransfer,
}: {
  teamId: string;
  candidates: Candidate[];
  pendingTransfer: { name: string; expiresAt: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleSend() {
    if (!selected) return;

    const ok = await confirm({
      title: `Send ownership to ${selected.name}?`,
      description:
        "They'll get a notification to accept or decline. Nothing changes until they say yes. You stay the owner until then.",
      confirmLabel: "Send request",
      danger: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await requestOwnershipTransfer(teamId, selected.userId);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`Ownership request sent to ${selected.name}`);
        setSelected(null);
      }
    });
  }

  async function handleCancel() {
    if (!pendingTransfer) return;
    const ok = await confirm({
      title: "Cancel the ownership request?",
      description: `${pendingTransfer.name} won't be able to accept it anymore.`,
      confirmLabel: "Cancel request",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await cancelOwnershipTransfer(teamId);
      if (result?.error) toast.error(result.error);
      else toast.success("Ownership request canceled");
    });
  }

  if (pendingTransfer) {
    const minutesLeft = Math.max(
      0,
      Math.round((new Date(pendingTransfer.expiresAt).getTime() - Date.now()) / 60000)
    );
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-ink-soft" suppressHydrationWarning>
          Waiting for <span className="font-semibold text-ink">{pendingTransfer.name}</span> to
          respond · expires in {minutesLeft} min
        </p>
        <button
          onClick={handleCancel}
          disabled={pending}
          className="rounded-lg border border-red/40 text-red font-semibold px-3.5 py-2 text-[13px] disabled:opacity-40 hover:bg-red/10 transition-colors"
        >
          {pending ? "Canceling…" : "Cancel request"}
        </button>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <p className="text-[12.5px] text-ink-faint">
        No one else is on this team yet. Invite someone before you can transfer ownership.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13px] min-w-[200px] text-left hover:border-line/30 transition-colors"
        >
          {selected ? (
            <>
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 overflow-hidden"
                style={{ background: colorForId(selected.userId) }}
              >
                <AvatarImg src={selected.avatarUrl} fallback={initialsFor(selected.name)} />
              </span>
              <span className="font-semibold flex-1 truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-ink-faint flex-1">Choose a new owner…</span>
          )}
          <ChevronDownIcon className="w-4 h-4 text-ink-faint" />
        </button>

        {open && (
          <div className="absolute top-[calc(100%+6px)] left-0 right-0 min-w-[220px] rounded-lg border border-line/10 bg-surface shadow-lg p-1 z-40 max-h-64 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll">
            {candidates.map((c) => (
              <button
                key={c.userId}
                type="button"
                onClick={() => {
                  setSelected(c);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2 transition-colors"
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 overflow-hidden"
                  style={{ background: colorForId(c.userId) }}
                >
                  <AvatarImg src={c.avatarUrl} fallback={initialsFor(c.name)} />
                </span>
                <span className="text-[13px] font-medium truncate">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleSend}
        disabled={!selected || pending}
        className="rounded-lg border border-red/40 text-red font-semibold px-3.5 py-2 text-[13px] disabled:opacity-40 hover:bg-red/10 transition-colors"
      >
        {pending ? "Sending…" : "Send request"}
      </button>
    </div>
  );
}
