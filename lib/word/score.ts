/*
 * The daily word's rules (shared by the server and the board): five
 * letters, six tries. A letter in the right spot is "correct", in the word
 * but elsewhere "present", otherwise "absent". A letter guessed twice only
 * lights up as often as it's in the word (correct ones first).
 */
export type Mark = "correct" | "present" | "absent";
export const WORD_LENGTH = 5;
export const MAX_TRIES = 6;

export function score(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(WORD_LENGTH).fill("absent");
  const left = new Map<string, number>();
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) marks[i] = "correct";
    else left.set(answer[i], (left.get(answer[i]) ?? 0) + 1);
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (marks[i] === "correct") continue;
    const n = left.get(guess[i]) ?? 0;
    if (n > 0) {
      marks[i] = "present";
      left.set(guess[i], n - 1);
    }
  }
  return marks;
}

const RANK: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
/** The keyboard's colours: each letter's best mark so far. */
export function letterMarks(rows: { word: string; marks: Mark[] }[]) {
  const out: Record<string, Mark> = {};
  for (const r of rows)
    for (let i = 0; i < r.word.length; i++) {
      const m = r.marks[i];
      const was = out[r.word[i]];
      if (!was || RANK[m] > RANK[was]) out[r.word[i]] = m;
    }
  return out;
}

/** The squares to paste in a chat: no letters, so nothing is spoiled. */
export function shareGrid(rows: { marks: Mark[] }[]) {
  return rows.map((r) => r.marks.map((m) => (m === "correct" ? "🟩" : m === "present" ? "🟨" : "⬜")).join("")).join("\n");
}

/** Lower-case a–z only, or null. */
export function cleanGuess(raw: string) {
  const w = raw.trim().toLowerCase();
  return /^[a-z]{5}$/.test(w) ? w : null;
}
