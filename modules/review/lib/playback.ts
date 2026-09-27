"use client";

import { getPlaybackUrl } from "@/app/(dashboard)/shorts/[id]/review/actions";

/**
 * Private playback links, remembered per version for this session so
 * switching back and forth is instant. Links last 3 hours; we reuse them
 * for 2.5 to stay safely inside that.
 */
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<{ url?: string; error?: string }>>();

export function playbackUrl(versionId: string): Promise<{ url?: string; error?: string }> {
  const hit = cache.get(versionId);
  if (hit && hit.exp > Date.now()) return Promise.resolve({ url: hit.url });
  const running = inflight.get(versionId);
  if (running) return running;
  const p = getPlaybackUrl(versionId)
    .then((res) => {
      if (res.error === undefined) {
        cache.set(versionId, { url: res.url, exp: Date.now() + 2.5 * 3600_000 });
        return { url: res.url };
      }
      return { error: res.error };
    })
    .finally(() => inflight.delete(versionId));
  inflight.set(versionId, p);
  return p;
}

/** Fetch links ahead of time so the first switch is instant too. */
export function prefetchPlayback(versionIds: string[]) {
  versionIds.forEach((id) => void playbackUrl(id));
}
