import type { ChannelDetail, VideoDetail } from "../lib/types";

/*
 * What the video and channel panels have read, kept while the page is open
 * (1.29.0; in one place since 1.30.1, so a change made in one panel shows in
 * the other).
 */

export const videoDetails = new Map<string, VideoDetail>();
export const channelDetails = new Map<string, ChannelDetail>();
/** Each niche's own channels, as its window last read them (shown at once the next time it opens, while they're read again). */
export const nicheChannels = new Map<string, { id: string; title: string; avatar: string | null }[]>();

/**
 * A channel's niches changed (taken out of one, put back, added to one):
 * what's kept about it and its videos is read again when it opens next,
 * except the panel on screen (that one changes in place), and so is that
 * niche's list of channels.
 */
export function forgetChannel(channelId: string, keep: { video?: string; channel?: boolean } = {}, nicheId?: string) {
  if (!keep.channel) channelDetails.delete(channelId);
  for (const [id, v] of videoDetails) if (v.video.channelId === channelId && id !== keep.video) videoDetails.delete(id);
  if (nicheId) nicheChannels.delete(nicheId);
}
