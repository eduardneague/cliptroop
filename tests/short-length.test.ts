// How long a short can be on each platform (1.12.1).
import { clock, lengthNotes } from "../lib/short-length";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const all = ["youtube", "instagram", "facebook", "tiktok"];
const plats = (secs: number | null, p = all) => lengthNotes(secs, p).map((n) => `${n.platform}:${n.level}`).join(",");

ok(clock(90) === "1:30" && clock(42.4) === "0:42" && clock(59.6) === "1:00" && clock(900) === "15:00", "clock");
ok(plats(45) === "", "45 s fits everywhere");
ok(plats(90) === "" && plats(90.4) === "", "exactly 1:30 (and a hair over) is fine for Facebook");
ok(plats(91) === "facebook:block", "1:31 can't go to Facebook");
ok(/at most 1:30 and this video is 1:42/.test(lengthNotes(102, all)[0]?.text ?? ""), "the note says both lengths");
ok(plats(91, ["youtube", "instagram", "tiktok"]) === "", "not planned for Facebook: nothing to say");
ok(plats(200) === "facebook:block,youtube:warn", "over 3:00: not a YouTube Short");
ok(plats(901) === "facebook:block,instagram:block,youtube:warn", "over 15:00: Instagram too");
ok(plats(2) === "facebook:block,instagram:block", "under 3 s: no Reels");
ok(plats(null) === "" && plats(0) === "" && plats(Number.NaN) === "", "unknown length: no notes");

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
