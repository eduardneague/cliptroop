/*
 * The kinds of video Analytics tells apart (1.22.0: live streams joined
 * Shorts, long videos and posts; YouTube's creatorContentType LIVE_STREAM
 * used to count as a long video). One place for their names, so every
 * screen says the same thing.
 */

export type VideoKind = "short" | "long" | "live" | "post";
export const VIDEO_KINDS: VideoKind[] = ["short", "long", "live", "post"];

export const KIND_LABEL: Record<VideoKind, string> = { short: "Short", long: "Long video", live: "Live stream", post: "Post" };
export const KIND_SHORT_LABEL: Record<VideoKind, string> = { short: "Short", long: "Long", live: "Live", post: "Post" };
export const KIND_PLURAL: Record<VideoKind, string> = { short: "shorts", long: "long videos", live: "live streams", post: "posts" };
export const KIND_TITLE: Record<VideoKind, string> = { short: "Shorts", long: "Long videos", live: "Live streams", post: "Posts" };

export const isKind = (v: unknown): v is VideoKind => v === "short" || v === "long" || v === "live" || v === "post";
/** Wide (16:9) pictures: long videos and live streams; Shorts, Reels and posts are tall or square. */
export const isWide = (k: string | null | undefined) => k === "long" || k === "live";
/** Long videos and live streams hold viewers past 30 seconds (Shorts past 3). */
export const holdSeconds = (k: string | null | undefined) => (isWide(k) ? 30 : 3);
