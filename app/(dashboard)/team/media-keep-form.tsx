"use client";

import { useState } from "react";
import { updateMediaKeepDays } from "./actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import { formatBytes } from "@/modules/review/lib/limits";
import { KEEP_OPTIONS, keepLabel, keepsLess, keepValue, parseKeep, type KeepSetting } from "@/lib/media-keep";

/**
 * Team → Defaults → Video files (masters): how long a posted short's video
 * files stay before the nightly clean-up deletes them (1.27.5: 1 day to 1
 * year, or never). Shorter asks first: older files go the same night and
 * can't be brought back.
 */
export function MediaKeepForm({
  teamId,
  days,
  ready,
  files,
  bytes,
}: {
  teamId: string;
  days: KeepSetting;
  ready: boolean;
  files: number;
  bytes: number;
}) {
  const [value, setValue] = useState<KeepSetting>(days);
  const confirm = useConfirm();
  const save = useAction(updateMediaKeepDays, {
    success: (_t, d) => (d === null ? "Video files of posted shorts are kept now" : `Video files now stay ${keepLabel(d)} after posting`),
    onError: () => setValue(days),
  });

  async function pick(next: KeepSetting) {
    if (next === value) return;
    if (next !== null && keepsLess(next, value)) {
      const ok = await confirm({
        title: `Keep video files for ${keepLabel(next)}?`,
        description: `Tonight, the video files of shorts posted more than ${keepLabel(next)} ago are deleted. They can't be brought back. The shorts themselves stay.`,
        confirmLabel: `Keep for ${keepLabel(next)}`,
        danger: true,
      });
      if (!ok) return;
    }
    const before = value;
    setValue(next);
    const done = await save.run(teamId, next);
    if (!done) setValue(before);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">Delete short video files after posting</div>
          <div className="text-[11.5px] text-ink-faint">Counted from the last platform a short went out on. Checked every night.</div>
        </div>
        <div className="w-40 flex-shrink-0">
          <Select
            value={keepValue(value)}
            onChange={(v) => {
              const next = v ? parseKeep(v) : undefined;
              if (next !== undefined) void pick(next);
            }}
            options={KEEP_OPTIONS}
            ariaLabel="Delete short video files after posting"
            disabled={!ready || save.pending}
          />
        </div>
      </div>
      <ul className="text-[12px] text-ink-soft space-y-1 list-disc pl-4">
        <li>Every version of the video goes, the approved one too. The short stays, with its title, script, notes and numbers.</li>
        <li>Never while a post still needs the file (scheduled, posting or failed).</li>
      </ul>
      <div className="rounded-lg bg-surface-2/60 border border-line/10 px-3 py-2 text-[12px] text-ink-soft">
        {!ready ? (
          "This needs the latest database update (migration 0070)."
        ) : files === 0 ? (
          "No video files stored right now."
        ) : (
          <>
            Stored right now: <b className="text-ink">{files} video file{files === 1 ? "" : "s"}</b>, <b className="text-ink">{formatBytes(bytes)}</b>.
          </>
        )}
      </div>
    </div>
  );
}
