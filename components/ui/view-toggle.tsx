"use client";

import { GridIcon, ListIcon } from "./icons";
import { usePendingNav } from "./pending-nav";

/**
 * Cards / table (1.27.5): the choice is remembered (a cookie, as before)
 * and the list answers at once with the other view's skeleton
 * (<PendingSwap>, keys "grid" / "table") until it's there. Without
 * JavaScript the form still goes through the server.
 */
export function ViewToggle({
  value,
  cookie,
  hrefs,
  action,
  fields,
}: {
  value: "grid" | "table";
  cookie: string;
  hrefs: { grid: string; table: string };
  action: (fd: FormData) => Promise<void>;
  /** Hidden fields for the server's fallback. */
  fields: Record<string, string>;
}) {
  const { go } = usePendingNav();
  return (
    <div className="flex-shrink-0 flex items-center rounded-lg border border-line/15 p-0.5" role="radiogroup" aria-label="View">
      {(["grid", "table"] as const).map((mode) => (
        <form key={mode} action={action}>
          <input type="hidden" name="mode" value={mode} />
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button
            type="submit"
            role="radio"
            aria-checked={value === mode}
            aria-label={mode === "grid" ? "Card view" : "Table view"}
            title={mode === "grid" ? "Cards" : "Table"}
            onClick={(e) => {
              e.preventDefault();
              if (value === mode) return;
              try {
                document.cookie = `${cookie}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
              } catch {
                /* no cookies: the address still says which */
              }
              go(hrefs[mode], mode);
            }}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${value === mode ? "bg-surface-2 text-ink" : "text-ink-faint hover:text-ink"}`}
          >
            {mode === "grid" ? <GridIcon className="w-[15px] h-[15px]" /> : <ListIcon className="w-[15px] h-[15px]" />}
          </button>
        </form>
      ))}
    </div>
  );
}
