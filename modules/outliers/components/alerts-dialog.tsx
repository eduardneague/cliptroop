"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { updateOutlierSettings } from "@/app/(dashboard)/outliers/actions";
import type { OutlierSettings } from "../lib/types";
import { BTN, BTN_MAIN, LABEL } from "./bits";
import { ChipsInput } from "./chips-input";

/*
 * Outlier alerts (1.27.0, masters): when a tracked channel's new video
 * passes a multiplier, or a video with a watched word takes off in a niche,
 * who hears about it, and the Monday summary. Since 1.29.0 the fields live
 * in Outlier settings (the gear), on its Alerts tab.
 */

const STEPS = [3, 5, 10, 25];

/** The alert fields (Outlier settings → Alerts). */
export function AlertsFields({ s, setS, canEdit }: { s: OutlierSettings; setS: (s: OutlierSettings) => void; canEdit: boolean }) {
  return (
    <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-80">
      {!canEdit && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-soft">Only masters can change the alerts.</p>}
      <div>
        <span className={LABEL}>Tell</span>
        <Segmented
          ariaLabel="Who hears about outliers"
          value={s.alertTo}
          onChange={(v) => setS({ ...s, alertTo: v })}
          options={[
            { value: "managers", label: "Masters and researchers" },
            { value: "everyone", label: "Everyone" },
            { value: "off", label: "Nobody" },
          ]}
        />
      </div>
      <div>
        <span className={LABEL}>When a tracked channel&rsquo;s video reaches</span>
        <Segmented ariaLabel="Alert from this multiplier" value={String(STEPS.includes(s.alertMin) ? s.alertMin : 5)} onChange={(v) => setS({ ...s, alertMin: Number(v) })} options={STEPS.map((n) => ({ value: String(n), label: `${n}× its usual` }))} />
        <p className="mt-1.5 text-[11.5px] text-ink-faint">Checked as its views come in: a video can trigger an alert within hours of going up.</p>
      </div>
      <div>
        <span className={LABEL}>Or has one of these words, in any niche (optional)</span>
        <ChipsInput value={s.watchWords} onChange={(w) => setS({ ...s, watchWords: w })} max={20} placeholder="iphone 18, scam, tier list…" ariaLabel="Watched words" />
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={s.digest} onChange={(e) => setS({ ...s, digest: e.target.checked })} className="mt-0.5 w-4 h-4 accent-[rgb(var(--amber))]" />
        <span>
          <span className="block text-[13.5px] font-semibold">Monday summary</span>
          <span className="block text-[12px] text-ink-soft">The week&rsquo;s biggest outliers in your niches, every Monday morning.</span>
        </span>
      </label>
    </fieldset>
  );
}

/** Saving the alerts (the toast says what happened). */
export function useSaveAlerts(teamId: string) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (s: OutlierSettings): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await updateOutlierSettings(teamId, s);
      if (r.error !== undefined) {
        toast.error(r.error);
        return false;
      }
      toast.success(s.alertTo === "off" ? "Alerts are off" : "Alerts saved");
      return true;
    } catch {
      toast.error("Couldn't save the alerts. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy };
}

/** The alerts on their own (kept for links that open them). */
export function AlertsDialog({ teamId, open, onClose, settings, canEdit }: { teamId: string; open: boolean; onClose: () => void; settings: OutlierSettings; canEdit: boolean }) {
  const [s, setS] = useState(settings);
  const { save, busy } = useSaveAlerts(teamId);
  useEffect(() => {
    if (open) setS(settings);
  }, [open, settings]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Outlier alerts"
      description="A notification (phones too) when a video takes off. Tapping it opens the video."
      footer={
        canEdit ? (
          <>
            <button type="button" onClick={onClose} className={BTN}>
              Cancel
            </button>
            <button type="button" onClick={async () => (await save(s)) && onClose()} disabled={busy} className={BTN_MAIN}>
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
      <AlertsFields s={s} setS={setS} canEdit={canEdit} />
    </Dialog>
  );
}
