import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWordState } from "@/modules/word/lib/state";
import { WordGame } from "@/modules/word/components/word-game";

export const metadata: Metadata = { title: "Daily word" };
export const dynamic = "force-dynamic";

/** The daily word, full size: the board, the keyboard, and afterwards your stats and the team's results. */
export default async function WordPage() {
  const state = await getWordState();
  if (!state) redirect("/login");
  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8">
      <WordGame initial={state} />
    </div>
  );
}
