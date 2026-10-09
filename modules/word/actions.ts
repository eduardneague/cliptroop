"use server";

import { revalidatePath } from "next/cache";
import { getWordState, submitGuess, type GuessResult, type WordState } from "./lib/state";

/** The daily word's board (the widget asks for it when it shows). */
export async function loadWord(): Promise<WordState | null> {
  return getWordState();
}

/** One guess. Finishing the game adds today's contribution (the dashboard's grid). */
export async function guessWord(word: string): Promise<GuessResult> {
  const r = await submitGuess(word);
  if ("state" in r && r.state.status !== "playing") revalidatePath("/dashboard");
  return r;
}
