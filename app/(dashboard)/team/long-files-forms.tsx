"use client";

import { useState } from "react";
import { updateLongInAppReview, updateLongMediaKeepDays, updateStudioKeepDays } from "./actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import { MAX_LONG_VIDEO_MB, formatBytes, sizeLabel } from "@/modules/review/lib/limits";
import { KEEP_OPTIONS, keepLabel, keepsLess, keepValue, parseKeep, type KeepSetting } from "@/lib/media-keep";


/**
 * Team → Defaults → Long videos (masters, 1.25.0): review the edit in
 * ClipTroop. On: the editor uploads the edit, the master leaves notes on it,
 * and the video can't go to Review before something is uploaded. A video can
 * still choose its own way (its settings).
 */
export function LongReviewToggle({ teamId, on: initial }: { teamId: string; on: boolean }) {
  const [on, setOn] = useState(initial);
  const save = useAction(updateLongInAppReview, {
    success: (_t, v) => (v ? "Long videos are now reviewed in ClipTroop" : "Long videos are now reviewed outside ClipTroop"),
  });
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={save.pending}
      onClick={async () => {
        const next = !on;
        setOn(next);
        if (!(await save.run(teamId, next))) setOn(!next);
      }}
      className="flex items-start gap-3 text-left disabled:opacity-60"
    >
      <span className={`relative mt-0.5 w-10 h-6 flex-shrink-0 rounded-lg transition-colors ${on ? "bg-green" : "bg-line/20"}`}>
        <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-md bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
      <span>
        <span className="block text-[13px] font-semibold">Review the edit in ClipTroop</span>
        <span className="block text-[12px] text-ink-soft">
          The editor uploads the edit (up to {sizeLabel(MAX_LONG_VIDEO_MB)}) and the master leaves notes at any moment of it, like shorts. A video can still choose its own way in its settings.
        </span>
      </span>
    </button>
  );
}

/**
 * Team → Defaults → Video files (masters, 1.25.0): how long a posted long
 * video's edit stays, and how long Thumbnail Studio keeps the thumbnails
 * that didn't win. Shorter asks first: older files go the same night and
 * can't be brought back.
 */
export function LongFilesForms({
  teamId,
  ready,
  longDays,
  studioDays,
  files,
  bytes,
  thumbs,
}: {
  teamId: string;
  ready: boolean;
  longDays: KeepSetting;
  studioDays: KeepSetting;
  files: number;
  bytes: number;
  thumbs: number;
}) {
  const [long, setLong] = useState<KeepSetting>(longDays);
  const [studio, setStudio] = useState<KeepSetting>(studioDays);
  const confirm = useConfirm();
  const saveLong = useAction(updateLongMediaKeepDays, {
    success: (_t, d) => (d === null ? "Long video files are kept after posting now" : `Long video files now stay ${keepLabel(d)} after posting`),
  });
  const saveStudio = useAction(updateStudioKeepDays, {
    success: (_t, d) => (d === null ? "Thumbnail Studio now keeps every thumbnail" : `Thumbnails that didn't win now go ${keepLabel(d)} after posting`),
  });

  async function pickLong(next: KeepSetting) {
    if (next === long) return;
    if (next !== null && keepsLess(next, long)) {
      const ok = await confirm({
        title: `Keep long video files for ${keepLabel(next)}?`,
        description: `Tonight, the edits of long videos posted more than ${keepLabel(next)} ago are deleted. They can't be brought back. The videos themselves stay.`,
        confirmLabel: `Keep for ${keepLabel(next)}`,
        danger: true,
      });
      if (!ok) return;
    }
    const before = long;
    setLong(next);
    if (!(await saveLong.run(teamId, next))) setLong(before);
  }

  async function pickStudio(next: KeepSetting) {
    if (next === studio) return;
    if (next !== null && keepsLess(next, studio)) {
      const ok = await confirm({
        title: `Delete thumbnails that didn't win after ${keepLabel(next)}?`,
        description: `Tonight, Thumbnail Studio's thumbnails that didn't win are deleted for long videos posted more than ${keepLabel(next)} ago. They can't be brought back. The winners always stay.`,
        confirmLabel: `After ${keepLabel(next)}`,
        danger: true,
      });
      if (!ok) return;
    }
    const before = studio;
    setStudio(next);
    if (!(await saveStudio.run(teamId, next))) setStudio(before);
  }

  if (!ready) return <p className="text-[12.5px] text-ink-soft">Long videos: this needs the latest database update (migration 0089).</p>;
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold">Delete long video files after posting</div>
            <div className="text-[11.5px] text-ink-faint">Every version of the edit. Counted from the last platform it went out on.</div>
          </div>
          <div className="w-40 flex-shrink-0">
            <Select
              value={keepValue(long)}
              onChange={(v) => {
                const next = v ? parseKeep(v) : undefined;
                if (next !== undefined) void pickLong(next);
              }}
              options={KEEP_OPTIONS}
              ariaLabel="Delete long video files after posting"
              disabled={saveLong.pending}
            />
          </div>
        </div>
        <p className="text-[12px] text-ink-soft">
          {files === 0 ? (
            "No long video files stored right now."
          ) : (
            <>
              Stored right now: <b className="text-ink">{files} file{files === 1 ? "" : "s"}</b>, <b className="text-ink">{formatBytes(bytes)}</b>.
            </>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold">Delete thumbnails that didn&rsquo;t win</div>
            <div className="text-[11.5px] text-ink-faint">Thumbnail Studio, after the video is posted. The winners always stay.</div>
          </div>
          <div className="w-40 flex-shrink-0">
            <Select
              value={keepValue(studio)}
              onChange={(v) => {
                const next = v ? parseKeep(v) : undefined;
                if (next !== undefined) void pickStudio(next);
              }}
              options={KEEP_OPTIONS}
              ariaLabel="Delete thumbnails that didn't win"
              disabled={saveStudio.pending}
            />
          </div>
        </div>
        <p className="text-[12px] text-ink-soft">
          {thumbs === 0 ? "No thumbnails in Thumbnail Studio right now." : <>Stored right now: <b className="text-ink">{thumbs} thumbnail{thumbs === 1 ? "" : "s"}</b>.</>}
        </p>
      </div>
    </div>
  );
}
