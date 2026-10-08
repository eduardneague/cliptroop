// Reports (1.9.9): which files can be added, and safe storage names.
import { FEEDBACK_MAX_BYTES, feedbackFileProblem, mb, safeFileName } from "../lib/feedback";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

ok(feedbackFileProblem({ name: "shot.png", type: "image/png", size: 1000 }) === null, "a screenshot is fine");
ok(feedbackFileProblem({ name: "clip.mov", type: "video/quicktime", size: FEEDBACK_MAX_BYTES }) === null, "exactly 25 MB is fine");
ok(feedbackFileProblem({ name: "IMG_1.HEIC", type: "", size: 2_000_000 }) === null, "HEIC without a type (some phones) is fine");
ok(/up to 25 MB/.test(feedbackFileProblem({ name: "big.mp4", type: "video/mp4", size: FEEDBACK_MAX_BYTES + 1 }) ?? ""), "over 25 MB is refused");
ok(/isn't a photo or a video/.test(feedbackFileProblem({ name: "notes.pdf", type: "application/pdf", size: 1000 }) ?? ""), "a PDF is refused");
ok(/empty/.test(feedbackFileProblem({ name: "x.png", type: "image/png", size: 0 }) ?? ""), "an empty file is refused");

ok(safeFileName("Screen Shot 2026-10-08 at 13.04.22.png") === "Screen-Shot-2026-10-08-at-13-04-22.png", "spaces and dots become dashes, extension kept");
ok(safeFileName("../../etc/passwd") === "passwd" && safeFileName("C:\\Users\\me\\clip.mp4") === "clip.mp4", "only the file name, no folders");
ok(safeFileName("ăîșț video.MOV") === "aist-video.mov", "accents dropped, extension lowercased");
ok(safeFileName("") === "file", "empty name");
ok(mb(820 * 1024) === "820 KB" && mb(1.4 * 1024 * 1024) === "1.4 MB" && mb(24.6 * 1024 * 1024) === "25 MB", "sizes read well");

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
