// 1.25.0: long videos' review files and Thumbnail Studio's clean-up choices, sizes and times.
import {
  DEFAULT_LONG_MEDIA_KEEP_DAYS,
  DEFAULT_STUDIO_KEEP_DAYS,
  dueForCleanup,
  isLongMediaKeepDays,
  isStudioKeepDays,
  KEEP_OPTIONS,
  keepLabel,
  keepsLess,
  LONG_MEDIA_KEEP_CHOICES,
  longPostedTimes,
  parseKeep,
  readKeep,
  STUDIO_KEEP_CHOICES,
  studioDue,
} from "../lib/media-keep";
import { LONG_VIDEO_CAP_MB, MAX_LONG_VIDEO_MB, MAX_VIDEO_MB, formatTime, sizeLabel } from "../modules/review/lib/limits";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// Long videos (1.27.5): 1 day to 1 year, 1 week by default; the same as the database check (0092).
ok(LONG_MEDIA_KEEP_CHOICES.map((c) => c.days).join() === "1,3,7,14,21,30,60,90,180,365", "long video files: 1 day to 1 year");
ok(DEFAULT_LONG_MEDIA_KEEP_DAYS === 7, "1 week by default");
ok(isLongMediaKeepDays(1) && isLongMediaKeepDays(365) && !isLongMediaKeepDays(2) && !isLongMediaKeepDays("7"), "only those ten numbers");

// Thumbnail Studio: the same ten; null (keep them) is handled by the caller.
ok(STUDIO_KEEP_CHOICES === LONG_MEDIA_KEEP_CHOICES, "studio: the same choices");
ok(DEFAULT_STUDIO_KEEP_DAYS === 30, "1 month by default");
ok(isStudioKeepDays(21) && !isStudioKeepDays(null) && !isStudioKeepDays(45), "45 days isn't a choice; null isn't a number");

// Never (1.27.5): null, read as it is; anything else unknown is the default.
ok(readKeep(null, 7) === null && readKeep(90, 7) === 90 && readKeep(5, 7) === 7 && readKeep(undefined, 30) === 30, "a stored value as a choice");
ok(keepLabel(null) === "Never" && keepLabel(1) === "1 day" && keepLabel(365) === "1 year" && keepLabel(180) === "6 months", "labels");
ok(KEEP_OPTIONS.length === 11 && KEEP_OPTIONS[10].value === "never" && parseKeep("never") === null && parseKeep("60") === 60 && parseKeep("45") === undefined && parseKeep("") === undefined, "the options, and what a picked one means");
ok(keepsLess(1, 7) && keepsLess(365, null) && !keepsLess(null, 7) && !keepsLess(30, 30) && !keepsLess(60, 30), "shorter (asks first): never is the longest");

const D = 86_400_000;
const NOW = Date.parse("2026-10-20T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * D).toISOString();
ok(!dueForCleanup([ago(6.9)], DEFAULT_LONG_MEDIA_KEEP_DAYS, NOW), "posted 6.9 days ago: the edit stays");
ok(dueForCleanup([ago(7)], DEFAULT_LONG_MEDIA_KEEP_DAYS, NOW), "posted a week ago: the edit goes");
ok(!dueForCleanup([ago(40), ago(2)], 3, NOW), "counted from the last platform it went out on");
ok(!dueForCleanup([ago(4000)], null, NOW), "never: not even after years");
ok(dueForCleanup([ago(1)], 1, NOW) && !dueForCleanup([ago(0.9)], 1, NOW), "1 day: a day after");

// When a long video went out: its platforms' posts, else when it was marked posted.
ok(longPostedTimes([{ posted_at: ago(9) }, { posted_at: ago(2) }], ago(30)).length === 2, "the posts count, not the old mark");
ok(longPostedTimes([], ago(5))[0] === ago(5) && longPostedTimes(null, null).length === 0, "no posts: when it was marked posted; neither: never");

// Thumbnail Studio: the ones that didn't win go; with no winner, all but the first.
const E = (id: string, w: boolean) => ({ id, is_winner: w });
ok(studioDue([E("a", false), E("b", true), E("c", false)]).map((e) => e.id).join() === "a,c", "a winner: every other one goes");
ok(studioDue([E("a", true), E("b", true)]).length === 0, "only winners: nothing goes");
ok(studioDue([E("a", false), E("b", false), E("c", false)]).map((e) => e.id).join() === "b,c", "no winner: the first stays");
ok(studioDue([]).length === 0 && studioDue([E("a", false)]).length === 0, "nothing, or one alone: nothing goes");

// Sizes: 3 GB at most; without the setting, the same as shorts.
ok(LONG_VIDEO_CAP_MB === 3072, "the bucket's limit is 3 GB");
ok(MAX_LONG_VIDEO_MB === Math.min(LONG_VIDEO_CAP_MB, MAX_VIDEO_MB), "no NEXT_PUBLIC_MAX_LONG_VIDEO_MB: same as shorts");
ok(sizeLabel(3072) === "3 GB" && sizeLabel(50) === "50 MB" && sizeLabel(1536) === "1.5 GB", "size labels");

// Times: long videos can run past an hour.
ok(formatTime(14) === "0:14", "0:14");
ok(formatTime(74.5, true) === "1:14.5", "1:14.5");
ok(formatTime(3725) === "1:02:05", "an hour and more: 1:02:05");
ok(formatTime(3599.9) === "59:59", "just under an hour stays m:ss");
ok(formatTime(-3) === "0:00", "never negative");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("long review: all good");
