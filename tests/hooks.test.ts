// A script's hook (1.16.0): from a "Hook" heading, from "Hook: …" in the
// text, or the opening; and which script document counts.
import { clip, hookFromScript, pickScript } from "../modules/analytics/lib/hooks";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

ok(hookFromScript("Hook\nYou won't believe what this costs.\nAnd it's legal.\nBody\nThree stalls, three prices.") === "You won't believe what this costs. And it's legal.", "a Hook heading: the lines up to the next part");
ok(hookFromScript("Hook: you won't believe what this street food costs. Body: three stalls, three prices. Call to action: follow.") === "you won't believe what this street food costs.", "inline Hook: up to Body:");
ok(hookFromScript("HOOK - Is this the cheapest lunch in Cluj?\n\nThen we eat.") === "Is this the cheapest lunch in Cluj?", "any case and dash; up to the blank line");
ok(hookFromScript("This is an iPhone 17 Pro Max. And this is another one. One of them is fake.") === "This is an iPhone 17 Pro Max. And this is another one.", "no hook part: the first two sentences");
ok(hookFromScript("Hook\n\nBody\nText") === "Text", "an empty Hook part: the opening instead");
ok(hookFromScript("") === null && hookFromScript(null) === null, "no script: no hook");
ok((hookFromScript("word ".repeat(200), 50) ?? "").length <= 51, "long openings are cut");
ok(clip("one two three four five", 12) === "one two…", "cut at a word");

const docs = [
  { kind: "script", step: "write", position: 1, content_text: "first draft" },
  { kind: "script", step: "review", position: 2, content_text: "reviewed" },
  { kind: "script", step: "staging", position: 3, content_text: "  " },
  { kind: "research", step: null, position: 4, content_text: "notes" },
];
ok(pickScript(docs)?.content_text === "reviewed", "the latest step with words (an empty Staging doesn't count)");
ok(pickScript([{ kind: "research", content_text: "x" }]) === null, "research isn't a script");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("hooks: all good");
