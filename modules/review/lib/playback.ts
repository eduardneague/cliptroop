"use client";

import { getPlaybackUrl } from "@/app/(dashboard)/shorts/[id]/review/actions";
import { getLongPlaybackUrl } from "@/app/(dashboard)/videos/[id]/review/actions";
import type { ReviewKind } from "./queries";

/**
 * Private playback links, remembered per version for this session so
 * switching back and forth is instant. Links last 3 hours; we reuse them
 * for 2.5 to stay safely inside that. Shorts and (1.25.0) long videos.
 */
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<{ url?: string; error?: string }>>();
const FETCH: Record<ReviewKind, (versionId: string) => Promise<{ error?: undefined; url: string } | { error: string }>> = {
  short: getPlaybackUrl,
  long: getLongPlaybackUrl,
};

export function playbackUrl(versionId: string, kind: ReviewKind = "short"): Promise<{ url?: string; error?: string }> {
  const hit = cache.get(versionId);
  if (hit && hit.exp > Date.now()) return Promise.resolve({ url: hit.url });
  const running = inflight.get(versionId);
  if (running) return running;
  const p = FETCH[kind](versionId)
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
export function prefetchPlayback(versionIds: string[], kind: ReviewKind = "short") {
  versionIds.forEach((id) => void playbackUrl(id, kind));
}
