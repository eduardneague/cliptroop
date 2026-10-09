/**
 * How long a short can be on each platform when it's posted through their
 * APIs (checked Oct 2026), and what to tell the team when a video doesn't
 * fit. Used on the short's Video card and its Posting card.
 *
 *   Facebook Reels   3 s to 1:30   (longer: Facebook refuses it)
 *   Instagram Reels  3 s to 15:00
 *   YouTube Shorts   up to 3:00    (longer: a regular video, not a Short)
 *   TikTok           the account's own limit (checked when posting)
 */
export const FACEBOOK_MAX = 90;
export const INSTAGRAM_MAX = 15 * 60;
export const REELS_MIN = 3;
export const YOUTUBE_SHORTS_MAX = 180;

export type LengthNote = {
  platform: "facebook" | "instagram" | "youtube";
  /** block: that platform won't take it. warn: it posts, differently. */
  level: "block" | "warn";
  text: string;
};

/** 1:30, 0:42, 15:00. */
export function clock(seconds: number) {
  const t = Math.round(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Half a second of slack: a 1:30.4 file is still "1:30" to everyone. */
const over = (secs: number, max: number) => secs > max + 0.5;

/** What doesn't fit, for the platforms this short is planned for. Nothing when the length is unknown. */
export function lengthNotes(duration: number | null | undefined, platforms: readonly string[]): LengthNote[] {
  if (duration === null || duration === undefined || !Number.isFinite(duration) || duration <= 0) return [];
  const len = clock(duration);
  const notes: LengthNote[] = [];
  if (platforms.includes("facebook")) {
    if (over(duration, FACEBOOK_MAX)) {
      notes.push({ platform: "facebook", level: "block", text: `Facebook Reels can be at most 1:30 and this video is ${len}, so it can't be posted to Facebook. Cut it to 1:30 or less, or post it there by hand.` });
    } else if (duration < REELS_MIN) {
      notes.push({ platform: "facebook", level: "block", text: `Facebook Reels must be at least 3 seconds long; this video is ${len}.` });
    }
  }
  if (platforms.includes("instagram")) {
    if (over(duration, INSTAGRAM_MAX)) {
      notes.push({ platform: "instagram", level: "block", text: `Instagram Reels can be at most 15:00 and this video is ${len}, so it can't be posted to Instagram.` });
    } else if (duration < REELS_MIN) {
      notes.push({ platform: "instagram", level: "block", text: `Instagram Reels must be at least 3 seconds long; this video is ${len}.` });
    }
  }
  if (platforms.includes("youtube") && over(duration, YOUTUBE_SHORTS_MAX)) {
    notes.push({ platform: "youtube", level: "warn", text: `Over 3:00, YouTube posts it as a regular video, not a Short (this one is ${len}).` });
  }
  return notes;
}
