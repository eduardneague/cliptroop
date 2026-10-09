import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getTeamsAndCurrent } from "@/lib/teams";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import { puzzleFor, todayIn } from "@/lib/word/puzzle";
import { isValidWord } from "@/lib/word/valid";
import { cleanGuess, MAX_TRIES, score, type Mark } from "@/lib/word/score";

export type WordRow = { word: string; marks: Mark[] };
export type WordStats = { played: number; won: number; streak: number; best: number; dist: number[] };
export type WordMate = { userId: string; name: string; avatarUrl: string | null; color: string; tries: number; solved: boolean; finished: boolean; me: boolean };
export type WordState = {
  /** false before migration 0077. */
  ready: boolean;
  day: string;
  number: number;
  rows: WordRow[];
  status: "playing" | "won" | "lost";
  /** Only once the game is over. */
  answer: string | null;
  stats: WordStats;
  /** How the team did today (tries only). */
  team: WordMate[];
};
type Play = { day: string; puzzle: number; guesses: string[]; solved: boolean; finished_at: string | null; updated_at: string };

const statusOf = (p: Pick<Play, "guesses" | "solved" | "finished_at"> | null): WordState["status"] => (p?.solved ? "won" : p?.finished_at ? "lost" : "playing");

/** Wins in a row (ending today, or yesterday when today isn't won yet), the best run, and wins by tries. */
function statsOf(plays: Play[], today: string): WordStats {
  const done = plays.filter((p) => p.finished_at);
  const won = new Set(done.filter((p) => p.solved).map((p) => p.day));
  const dist = Array(MAX_TRIES).fill(0);
  for (const p of done) if (p.solved && p.guesses.length) dist[Math.min(MAX_TRIES, p.guesses.length) - 1]++;
  const prev = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  let d = won.has(today) ? today : prev(today);
  let streak = 0;
  while (won.has(d) && streak < 5000) {
    streak++;
    d = prev(d);
  }
  let best = 0;
  let run = 0;
  let last: string | null = null;
  for (const day of [...won].sort()) {
    run = last && prev(day) === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = day;
  }
  return { played: done.length, won: won.size, streak, best, dist };
}

async function context() {
  const supabase = await createClient();
  const [user, { currentTeam }] = await Promise.all([getCachedUser(), getTeamsAndCurrent(supabase)]);
  if (!user) return null;
  const { data: t } = currentTeam ? await supabase.from("teams").select("timezone").eq("id", currentTeam.id).maybeSingle() : { data: null };
  const day = todayIn((t?.timezone as string | null) ?? "UTC");
  return { supabase, user, teamId: currentTeam?.id ?? null, day };
}

/** The daily word for the signed-in person: today's board, their stats, the team's results. */
export async function getWordState(): Promise<WordState | null> {
  const ctx = await context();
  if (!ctx) return null;
  return stateFor(ctx);
}

async function stateFor(ctx: NonNullable<Awaited<ReturnType<typeof context>>>): Promise<WordState> {
  const { supabase, user, teamId, day } = ctx;
  const { number, answer } = puzzleFor(day);
  const [{ data: plays, error }, team] = await Promise.all([
    supabase.from("daily_word_plays").select("day, puzzle, guesses, solved, finished_at, updated_at").eq("user_id", user.id).order("day", { ascending: false }).limit(800),
    teamId ? teamResults(supabase, teamId, day, user.id) : Promise.resolve([] as WordMate[]),
  ]);
  const list = (plays ?? []) as Play[];
  const today = list.find((p) => p.day === day) ?? null;
  const status = statusOf(today);
  // Your own line from your own board (it's always up to date).
  const mine = { tries: today?.guesses.length ?? 0, solved: !!today?.solved, finished: !!today?.finished_at };
  for (const m of team) if (m.me) Object.assign(m, mine);
  team.sort(byResult);
  return {
    ready: !error,
    day,
    number,
    rows: (today?.guesses ?? []).map((w) => ({ word: w, marks: score(w, answer) })),
    status,
    answer: status === "playing" ? null : answer,
    stats: statsOf(list, day),
    team,
  };
}

async function teamResults(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string, day: string, me: string): Promise<WordMate[]> {
  const [{ data, error }, people] = await Promise.all([supabase.rpc("daily_word_team", { p_team: teamId, p_day: day }), listTeamPeople(teamId)]);
  if (error) return [];
  const by = new Map(((data ?? []) as { user_id: string; tries: number; solved: boolean; finished: boolean }[]).map((r) => [r.user_id, r]));
  return people
    .map((p) => {
      const r = by.get(p.userId);
      return { userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, color: p.color, tries: r?.tries ?? 0, solved: !!r?.solved, finished: !!r?.finished, me: p.userId === me };
    })
    .sort(byResult);
}

/** Finished first, solved before not, fewer tries first. */
const byResult = (a: WordMate, b: WordMate) => Number(b.finished) - Number(a.finished) || Number(b.solved) - Number(a.solved) || a.tries - b.tries || a.name.localeCompare(b.name);

export type GuessResult = { state: WordState } | { error: string; reason: "length" | "word" | "again" | "over" | "busy" | "setup" | "session" };

/**
 * One guess: checked here against today's word (the browser never knows
 * it), then saved. Only the server writes plays, and only on top of the
 * row it read (a second tab can't skip ahead or add a seventh try).
 */
export async function submitGuess(raw: string): Promise<GuessResult> {
  const ctx = await context();
  if (!ctx) return { error: "Your session expired. Sign in again.", reason: "session" };
  const word = cleanGuess(raw);
  if (!word) return { error: "Five letters, please.", reason: "length" };
  if (!isValidWord(word)) return { error: "Not in the word list.", reason: "word" };
  const { user, day } = ctx;
  const { number, answer } = puzzleFor(day);
  const admin = createAdminClient();
  const { data: row, error: readError } = await admin.from("daily_word_plays").select("day, puzzle, guesses, solved, finished_at, updated_at").eq("user_id", user.id).eq("day", day).maybeSingle();
  if (readError) return { error: /daily_word_plays/.test(readError.message) ? "The daily word needs the latest database update (migration 0077)." : "Couldn't save your guess. Try again.", reason: "setup" };
  const play = row as Play | null;
  if (play?.finished_at) return { error: "Today's word is done. A new one comes tomorrow.", reason: "over" };
  const guesses = play?.guesses ?? [];
  if (guesses.includes(word)) return { error: "You tried that one already.", reason: "again" };
  const next = [...guesses, word];
  const solved = word === answer;
  const finished = solved || next.length >= MAX_TRIES;
  const now = new Date().toISOString();
  const values = { guesses: next, solved, finished_at: finished ? now : null, updated_at: now };
  const { data: saved, error } = play
    ? await admin.from("daily_word_plays").update(values).eq("user_id", user.id).eq("day", day).eq("updated_at", play.updated_at).is("finished_at", null).select("day")
    : await admin.from("daily_word_plays").insert({ user_id: user.id, day, puzzle: number, ...values }).select("day");
  if (error || !saved?.length) return { error: "Your board changed in another window. Reload to see it.", reason: "busy" };
  return { state: await stateFor(ctx) };
}
