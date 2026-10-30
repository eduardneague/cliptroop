// 1.34.5: an outlier's video plays on the first press. Opened from a card, the panel shows what the card knew while the
// video's numbers load; play pressed then used to stop when they arrived (the player was built anew), and needed a
// second press. Now the player keeps its place, and one built anew straight after a press goes on playing.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

const panel = read("modules/outliers/components/video-panel.tsx");
const body = panel.slice(panel.indexOf("export function VideoPanel"), panel.indexOf("function ScoreMath"));
ok(
  /\) : d && v \? \(\s*(\/\/[^\n]*\n\s*)?<VideoTop video=\{v\} side=\{<VideoSide d=\{d\} \/>\}>\s*<VideoRest d=\{d\} \/>\s*<\/VideoTop>\s*\) : preview \? \(\s*<VideoTop video=\{preview\} busy side=\{<PreviewSide v=\{preview\} \/>\}>/.test(body),
  "loading and loaded: the same VideoTop in the same place, so its player stays (and keeps playing)"
);
ok(!/VideoPreviewBody|<VideoBody|<Player /.test(panel), "no other player in the video's panel");
ok(/function VideoSide\(\{ d \}: \{ d: VideoDetail \}\)/.test(panel) && /function VideoRest\(\{ d \}: \{ d: VideoDetail \}\)/.test(panel), "what's beside the player and under it come in when the numbers do");

const pre = read("modules/outliers/components/panel-preview.tsx");
const top = pre.slice(pre.indexOf("export function VideoTop"), pre.indexOf("export function PreviewSide"));
ok(/<Player id=\{video\.id\} short=\{short\} title=\{video\.title\} \/>/.test(top) && /aria-busy=\{busy \|\| undefined\}/.test(top), "VideoTop: the player, then what's beside and under it");
ok(/<VideoTop video=\{v\} busy side=\{<PreviewSide v=\{v\} \/>\}>/.test(pre), "the stand-in panel (while the panels' code arrives) is built the same way");
const player = pre.slice(pre.indexOf("const pressed = new Map"), pre.length);
ok(/useState\(\(\) => \(\{ id, play: pressed\.has\(id\) \}\)\)/.test(player), "a player built anew right after a press starts playing");
ok(/if \(on\.id !== id\) setOn\(\{ id, play: pressed\.has\(id\) \}\);/.test(player) && !/useEffect\(\(\) => setPlay\(false\), \[id\]\)/.test(pre), "another video in its place: that one's picture first (the old reset ran on mount too)");
ok(/setTimeout\(\(\) => pressed\.delete\(id\), 1500\)/.test(player) && /if \(later\) clearTimeout\(later\);/.test(player), "the press is forgotten a moment after its player is gone (opened again later: the picture first)");
ok(/onClick=\{\(\) => setOn\(\{ id, play: true \}\)\}/.test(player) && /autoplay=1/.test(player), "pressing play: YouTube's player, playing");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("outlier player ok");
