"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import type { OutlierSettings } from "../lib/types";
import { AlertsFields, useSaveAlerts } from "./alerts-dialog";
import { BTN, BTN_MAIN, ChannelAvatar, EmptyNote, TimeAgo } from "./bits";
import { useOutliersBlocked } from "./context";

/*
 * Outlier settings (1.29.0, the gear at the top of the page): the alerts
 * (masters change them) and the channels the team hid (anyone brings one
 * back).
 */

export type SettingsTab = "alerts" | "hidden";

export function SettingsDialog({ teamId, open, onClose, settings, canEdit, tab: startTab = "alerts" }: { teamId: string; open: boolean; onClose: () => void; settings: OutlierSettings; canEdit: boolean; tab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(startTab);
  const [s, setS] = useState(settings);
  const { save, busy } = useSaveAlerts(teamId);
  const { blocked, unhide } = useOutliersBlocked();
  useEffect(() => {
    if (!open) return;
    setS(settings);
    setTab(startTab);
  }, [open, settings, startTab]);
  const changed = JSON.stringify(s) !== JSON.stringify(settings);
  const hidden = [...blocked.values()];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Outlier settings"
      width="sm:max-w-xl"
      footer={
        tab === "alerts" && canEdit ? (
          <>
            <button type="button" onClick={onClose} className={BTN}>
              {changed ? "Cancel" : "Close"}
            </button>
            <button type="button" onClick={async () => (await save(s)) && onClose()} disabled={busy || !changed} className={BTN_MAIN}>
              {busy ? "Saving…" : "Save alerts"}
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose} className={BTN}>
            Close
          </button>
        )
      }
    >
      <div className="space-y-5">
        <Segmented
          ariaLabel="Settings"
          value={tab}
          onChange={setTab}
          options={[
            { value: "alerts", label: "Alerts" },
            { value: "hidden", label: "Hidden channels", count: hidden.length || undefined },
          ]}
        />
        {tab === "alerts" ? (
          <div className="space-y-4">
            <p className="text-[12.5px] text-ink-soft">A notification (phones too) when a video takes off. Tapping it opens the video.</p>
            <AlertsFields s={s} setS={setS} canEdit={canEdit} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[12.5px] text-ink-soft">Hidden channels never show in Outliers: not in For you, Search, ideas or alerts. Anyone on the team can hide one (⋯ on any video, or the channel&rsquo;s page) or bring it back here.</p>
            {hidden.length ? (
              <ul className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/[0.07]">
                {hidden.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <ChannelAvatar src={b.avatar} title={b.title || "?"} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold truncate">{b.title || "A channel"}</span>
                      {b.at && (
                        <span className="block text-[11.5px] text-ink-faint">
                          Hidden <TimeAgo iso={b.at} />
                        </span>
                      )}
                    </span>
                    <button type="button" onClick={() => unhide(b.id)} className={`${BTN} h-8`}>
                      Show again
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote title="No hidden channels">Use ⋯ on a video to hide its channel when you never want to see it here.</EmptyNote>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
