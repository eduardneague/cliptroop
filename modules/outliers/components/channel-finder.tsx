"use client";

import { useState } from "react";
import { CheckIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { lookUpChannels } from "@/app/(dashboard)/outliers/actions";
import type { FoundChannel } from "@/modules/outliers/lib/requests";
import { compact } from "../lib/filters";
import { countryName } from "../lib/regions";
import { ChannelAvatar } from "./bits";
import { useOutliers } from "./context";

/*
 * Finding channels by name, @handle or link (1.29.0), with a Search button
 * (nothing is looked up while typing). The channels ClipTroop already
 * collected come first, then YouTube by handle ("linus tech tips" is tried
 * as @linustechtips); when the one you mean isn't there, "Search YouTube"
 * uses one of your fresh searches for today.
 */

export type { FoundChannel };

export function ChannelFinder({
  picked,
  onPick,
  have,
  placeholder = "Name, @handle or link",
  pickLabel = "Add",
  autoFocus = false,
}: {
  /** The ones picked so far (shown ticked). */
  picked: Set<string>;
  onPick: (c: FoundChannel) => void;
  /** Already there (shown as such, can't be picked again). */
  have?: Set<string>;
  placeholder?: string;
  pickLabel?: string;
  autoFocus?: boolean;
}) {
  const ctx = useOutliers();
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [rows, setRows] = useState<FoundChannel[] | null>(null);
  const [busy, setBusy] = useState<"find" | "youtube" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

  const find = async (youtube: boolean) => {
    const text = q.trim();
    if (text.length < 2 || busy) return;
    setBusy(youtube ? "youtube" : "find");
    setError(null);
    try {
      const r = await lookUpChannels(ctx.teamId, text, youtube);
      if (r.error !== undefined) {
        setError(r.error);
        if (!youtube) setRows([]);
        return;
      }
      setAsked(text);
      setSearched(r.searched);
      if (r.left) setLeft(Math.min(r.left.person, r.left.team));
      // A YouTube search adds to what was found.
      setRows((old) => {
        if (!youtube || !old) return r.rows;
        const seen = new Map(old.map((x) => [x.id, x]));
        for (const x of r.rows) if (!seen.has(x.id)) seen.set(x.id, x);
        return [...seen.values()];
      });
    } catch {
      setError("Couldn't look that up. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          find(false);
        }}
        // 1.43.0: Find sits inside the box, one piece with it (the owner: "this part with find and done is very oddly
        // designed"); Enter finds too.
        className="relative"
      >
        <label className="block">
          <span className="sr-only">Find a channel</span>
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" data-autofocus={autoFocus || undefined} className="w-full rounded-xl border border-line/15 bg-surface pl-9 pr-24 h-11 text-[14px] outline-none focus:ring-2 focus:ring-amber" />
        </label>
        <button
          type="submit"
          disabled={q.trim().length < 2 || !!busy}
          className="absolute right-1.5 top-1.5 bottom-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber px-3.5 text-[13px] font-semibold text-white transition-[filter,background-color,color] hover:brightness-110 disabled:bg-surface-2 disabled:text-ink-faint disabled:hover:brightness-100"
        >
          {busy === "find" ? (
            <>
              <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />
              Finding
            </>
          ) : (
            "Find"
          )}
        </button>
      </form>
      {error && (
        <p className="rounded-lg bg-red/10 text-red px-3 py-2 text-[12.5px] font-semibold" role="alert">
          {error}
        </p>
      )}
      {rows && (
        <div className="space-y-2">
          {rows.length ? (
            <ul className="rounded-xl border border-line/10 divide-y divide-line/[0.07] max-h-[min(46vh,420px)] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll">
              {rows.map((c) => {
                const there = have?.has(c.id) ?? false;
                const on = picked.has(c.id);
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                    <ChannelAvatar src={c.avatar} title={c.title} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold truncate">{c.title}</span>
                      <span className="block text-[11.5px] text-ink-faint truncate">{[c.handle, c.subs !== null ? `${compact(c.subs)} subscribers` : null, countryName(c.country) || null].filter(Boolean).join(" · ")}</span>
                    </span>
                    {there ? (
                      <span className="text-[12px] font-semibold text-ink-faint px-2">Already in</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPick(c)}
                        aria-pressed={on}
                        className={`inline-flex items-center gap-1.5 rounded-lg border h-8 px-3 text-[12.5px] font-semibold transition-colors flex-shrink-0 ${on ? "border-amber/50 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"}`}
                      >
                        {on ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                        {on ? "Picked" : pickLabel}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-soft">Nothing called &ldquo;{asked}&rdquo; yet. Try its @handle or a link, or search YouTube.</p>
          )}
          {!searched && asked && (
            <button type="button" onClick={() => find(true)} disabled={!!busy} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber hover:underline disabled:opacity-60">
              <SearchIcon className="w-3.5 h-3.5" />
              {busy === "youtube" ? "Searching YouTube…" : `Not the one? Search YouTube for “${asked}”`}
            </button>
          )}
          {searched && left !== null && <p className="text-[11.5px] text-ink-faint">{left > 0 ? `${left} fresh searches left for you today.` : "That was your last fresh search for today."}</p>}
        </div>
      )}
    </div>
  );
}
