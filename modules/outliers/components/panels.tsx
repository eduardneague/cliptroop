"use client";

import type { ChannelDetail, VideoDetail } from "../lib/types";
import { ChannelPanel } from "./channel-panel";
import { useOutliers, type Panel } from "./context";
import { PanelFrame } from "./panel";
import { VideoPanel } from "./video-panel";

/*
 * The side panel (1.29.9): one frame that stays open while you go from a
 * video to its channel, to another video and back; only what's inside
 * changes. Both kinds come in one piece of code, so the second never waits
 * to load while the panel is open.
 */
export function Panels({ panel, initialVideo, initialChannel }: { panel: Panel; initialVideo: VideoDetail | null; initialChannel: ChannelDetail | null }) {
  const ctx = useOutliers();
  return (
    <PanelFrame onClose={ctx.closePanel} onBack={ctx.trail.length ? ctx.panelBack : null} backLabel="Back to the last one">
      {panel.type === "video" ? (
        <VideoPanel id={panel.id} initial={initialVideo && initialVideo.video.id === panel.id ? initialVideo : null} />
      ) : (
        <ChannelPanel id={panel.id} initial={initialChannel && initialChannel.channel.id === panel.id ? initialChannel : null} />
      )}
    </PanelFrame>
  );
}
