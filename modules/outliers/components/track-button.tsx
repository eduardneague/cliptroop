"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { setTracked as setTrackedAction } from "@/app/(dashboard)/outliers/actions";
import { TrackIcon } from "./bits";
import { useOutliers } from "./context";

/*
 * Track a channel (1.27.0): its new videos are read every few hours and an
 * alert goes out when one takes off. Masters and researchers only; everyone
 * else sees whether it's tracked.
 */
export function TrackButton({ channelId, label = true, size = "md", className = "" }: { channelId: string; label?: boolean; size?: "sm" | "md"; className?: string }) {
  const { teamId, tracked, setTracked, canManage } = useOutliers();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const on = tracked.has(channelId);
  if (!canManage && !on) return null;
  const toggle = async () => {
    if (!canManage || busy) return;
    setBusy(true);
    setTracked(channelId, !on);
    try {
      const r = await setTrackedAction(teamId, channelId, !on);
      if (r.error !== undefined) {
        setTracked(channelId, on);
        toast.error(r.error);
      } else toast.success(on ? "Not tracking it any more" : "Tracking. You'll hear when one of its videos takes off.", { sound: on ? false : undefined });
    } catch {
      setTracked(channelId, on);
      toast.error("Couldn't change it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const h = size === "sm" ? "h-8 text-[12.5px]" : "h-9 text-[13px]";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!canManage}
      aria-pressed={on}
      title={canManage ? (on ? "Tracked: click to stop" : "Track this channel: alerts when its videos take off") : "Tracked by your team"}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold transition-colors disabled:cursor-default ${h} ${label ? "px-3" : size === "sm" ? "w-8" : "w-9"} ${
        on ? "border-violet/40 bg-violet/10 text-violet" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30 hover:bg-surface-2/60"
      } ${className}`}
    >
      <TrackIcon on={on} className="w-4 h-4" />
      {label && <span>{on ? "Tracked" : "Track"}</span>}
    </button>
  );
}
