// The daily word (1.13.0): the colours, the keyboard, the day's puzzle.
// The answer lists are server-only, so this file runs itself again with the
// react-server condition (where "server-only" is allowed).
import { spawnSync } from "node:child_process";

if (!process.env.WORD_TEST_CHILD) {
  const r = spawnSync("npx", ["--yes", "tsx", "--conditions=react-server", __filename], {
    stdio: "inherit",
    env: { ...process.env, WORD_TEST_CHILD: "1" },
    shell: process.platform === "win32",
  });
  process.exit(r.status ?? 1);
}

(async () => {
  const { cleanGuess, letterMarks, score, shareGrid } = await import("../lib/word/score");
  const { FIRST_DAY, puzzleFor, todayIn } = await import("../lib/word/puzzle");
  const { ANSWERS } = await import("../lib/word/answers");
  const { isValidWord } = await import("../lib/word/valid");

  let fails = 0;
  const ok = (c: boolean, m: string) => {
    if (!c) {
      fails++;
      console.log("FAIL", m);
    }
  };
  const s = (g: string, a: string) => score(g, a).map((m) => (m === "correct" ? "G" : m === "present" ? "Y" : ".")).join("");

  ok(s("crane", "crane") === "GGGGG", "all right");
  ok(s("slate", "crane") === "..G.G", "right spots only");
  ok(s("react", "crane") === "YYGY.", "react vs crane: r e present, a correct, c present, t absent");
  // A letter guessed twice lights up only as often as it's in the word, right spot first.
  ok(s("eerie", "crane") === "..Y.G", `three e's in the guess, one in the word (the right spot wins): ${s("eerie", "crane")}`);
  ok(s("speed", "abide") === "..Y.Y", `two e's, one in the word: ${s("speed", "abide")}`);
  ok(s("llama", "hello") === "YY...", `two l's, two in the word: ${s("llama", "hello")}`);
  ok(s("lolly", "hello") === ".YGG.", `three l's, two in the word (both in the right spot): ${s("lolly", "hello")}`);

  const keys = letterMarks([
    { word: "react", marks: score("react", "crane") },
    { word: "crane", marks: score("crane", "crane") },
  ]);
  ok(keys.c === "correct" && keys.r === "correct" && keys.t === "absent", "the keyboard keeps each letter's best colour");
  ok(shareGrid([{ marks: score("slate", "crane") }]) === "⬜⬜🟩⬜🟩", "the squares to share have no letters");
  ok(cleanGuess(" CrAnE ") === "crane" && cleanGuess("cran") === null && cleanGuess("cr4ne") === null && cleanGuess("crâne") === null, "guesses: five plain letters");

  ok(ANSWERS.length > 700 && new Set(ANSWERS).size === ANSWERS.length, "hundreds of answers, none twice");
  ok(ANSWERS.every((w) => /^[a-z]{5}$/.test(w) && isValidWord(w)), "every answer is a valid guess");
  ok(isValidWord("crane") && isValidWord("pizza") && !isValidWord("xqzzt") && !isValidWord("crane "), "the word list");
  ok(!ANSWERS.some((w) => ["death", "rifle", "skull", "toxic", "virus"].includes(w)), "nothing grim");

  ok(puzzleFor(FIRST_DAY).number === 1, "the first day is #1");
  const next = new Date(Date.parse(`${FIRST_DAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  ok(puzzleFor(next).number === 2 && puzzleFor(next).answer !== puzzleFor(FIRST_DAY).answer, "one a day");
  const seen = new Set<string>();
  const start = Date.parse(`${FIRST_DAY}T00:00:00Z`);
  for (let i = 0; i < ANSWERS.length; i++) seen.add(puzzleFor(new Date(start + i * 86_400_000).toISOString().slice(0, 10)).answer);
  ok(seen.size === ANSWERS.length, "no word comes back until all have been used");
  ok(puzzleFor(new Date(start + ANSWERS.length * 86_400_000).toISOString().slice(0, 10)).answer === puzzleFor(FIRST_DAY).answer, "then the list starts again");
  const before = new Date(Date.parse(`${FIRST_DAY}T00:00:00Z`) - 9 * 86_400_000).toISOString().slice(0, 10);
  ok(puzzleFor(before).number === -8 && !!puzzleFor(before).answer, "days before the start still have a word");

  // The day is the team's: 23:30 in Bucharest is already the next day there.
  const late = new Date("2026-10-10T21:30:00Z");
  ok(todayIn("Europe/Bucharest", late) === "2026-10-11" && todayIn("America/Los_Angeles", late) === "2026-10-10" && todayIn("Not/AZone", late) === "2026-10-10", "today in the team's time zone");

  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
