import { matchRanges } from "@/lib/search/match";

/**
 * Renders `text` with the words you typed marked: every word, wherever it
 * is, accents or not ("creme" marks "Crème"). 1.26.0: was the first exact
 * match only.
 */
export function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = query.trim() ? matchRanges(text, query) : [];
  if (!ranges.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([from, to], i) => {
    if (from > at) out.push(text.slice(at, from));
    out.push(
      <mark key={i} className="bg-amber/20 text-inherit rounded-[3px] px-[1px]">
        {text.slice(from, to)}
      </mark>
    );
    at = to;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}
