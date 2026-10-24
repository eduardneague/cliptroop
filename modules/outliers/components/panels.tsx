"use client";

import type { ChannelDetail, VideoDetail } from "../lib/types";
import { ChannelPanel } from "./channel-panel";
import type { Panel } from "./context";
import { VideoPanel } from "./video-panel";

/*
 * What's inside the side panel (1.29.9; 1.31.8): a video's or a channel's, in one piece of code, so going from a
 * video to its channel never waits to load. The frame itself (PanelFrame) is in the page's own code since 1.31.8:
 * it opens at once, with PanelLoading inside until this piece is there.
 */
export function PanelBody({ panel, initialVideo, initialChannel }: { panel: Panel; initialVideo: VideoDetail | null; initialChannel: ChannelDetail | null }) {
  return panel.type === "video" ? (
    <VideoPanel id={panel.id} initial={initialVideo && initialVideo.video.id === panel.id ? initialVideo : null} />
  ) : (
    <ChannelPanel id={panel.id} initial={initialChannel && initialChannel.channel.id === panel.id ? initialChannel : null} />
  );
}
