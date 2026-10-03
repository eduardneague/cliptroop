"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { Ago } from "@/components/ui/ago";
import { removePushDevice } from "./actions";

export type PushDevice = { id: string; label: string; createdAt: string; lastSentAt: string | null; thisDevice: boolean };

/** Every device you turned notifications on for, with Remove. */
export function PushDevices({ devices }: { devices: PushDevice[] }) {
  const [busy, start] = useTransition();
  const toast = useToast();
  if (!devices.length) return <p className="text-[12.5px] text-ink-faint">No devices yet.</p>;
  return (
    <ul className="divide-y divide-line/10 rounded-xl border border-line/10">
      {devices.map((d) => (
        <li key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold truncate">
              {d.label}
              {d.thisDevice && <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-amber">This device</span>}
            </div>
            <div className="text-[11.5px] text-ink-faint">
              Added <Ago iso={d.createdAt} />
              {d.lastSentAt ? (
                <>
                  {" "}
                  · last notification <Ago iso={d.lastSentAt} />
                </>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await removePushDevice(d.id);
                if (r.error) toast.error(r.error);
                else toast.success(`${d.label} won't get notifications any more.`);
              })
            }
            className="rounded-lg border border-line/20 px-3 h-8 text-[12.5px] font-semibold hover:border-red/40 hover:text-red disabled:opacity-60"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
