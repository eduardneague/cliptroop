/*
 * Every row of a query, a page at a time (1.32.5). Supabase answers at most
 * PAGE_ROWS rows to one request (Project Settings → API → Max rows, 1000 by
 * default) and cuts the rest without a word: a list that can grow past that
 * (a team's shorts) asks page by page. Pure: it takes the query as a function.
 */
/** What Supabase answers at most to one request (its default). */
export const PAGE_ROWS = 1000;

/**
 * Every row a query has, a page at a time (1.32.5): one answer stops at
 * PAGE_ROWS, so a team with more shorts than that lost its newest ones from
 * the list without a word. `page(from, to)` asks for that slice of a query
 * in a fixed order.
 */
export async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = PAGE_ROWS): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 100 * size; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

