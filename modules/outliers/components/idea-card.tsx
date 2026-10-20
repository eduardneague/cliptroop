"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { ChevronDownIcon, CloseIcon, CopyIcon, ShortsIcon, VideoIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { startNavProgress } from "@/components/ui/nav-progress";
import { dismissIdea, removeSave, saveIdea, startFromIdea } from "@/app/(dashboard)/outliers/actions";
import { FORMAT_BY_ID, type FormatGroup } from "../lib/formats";
import type { Idea } from "../lib/ideas";
import type { MiniVideo, SavedIdea } from "../lib/types";
import { multText } from "../lib/scores";
import { BookmarkIcon, heat, Thumb } from "./bits";
import { useOutliersNav } from "./context";

/*
 * An idea (1.27.0), in the Ideate step's shape: 2 to 4 titles (tap one to
 * make it the main title), a hook, the type, why it should work and the
 * outliers it comes from. Save it, start a long video or a Short from it
 * (New long video opens filled in), copy the titles, or hide it for good.
 */

/** Each kind of format its own colour, so a list of ideas reads at a glance. */
export const GROUP_COLOR: Record<FormatGroup, string> = {
  compare: "rgb(var(--obj-blue))",
  test: "rgb(var(--obj-teal))",
  challenge: "rgb(var(--obj-orange))",
  story: "rgb(var(--obj-plum))",
  teach: "rgb(var(--obj-green))",
  list: "rgb(var(--obj-gold))",
  reveal: "rgb(var(--obj-violet))",
  react: "rgb(var(--obj-rose))",
  build: "rgb(var(--obj-brown))",
};

export function formatColor(id: string | null | undefined): string {
  const f = id ? FORMAT_BY_ID.get(id) : undefined;
  return f ? GROUP_COLOR[f.group] : "rgb(var(--ink-faint))";
}

/** An idea as it's saved and handed to New long video / New short. */
export function toSaved(idea: Idea, o: { niche: string | null; kind: "long" | "short"; examples?: Record<string, MiniVideo> }): SavedIdea {
  return {
    key: idea.key,
    titles: idea.titles,
    hook: idea.hook,
    topic: idea.topic,
    formatId: idea.formatId,
    type: idea.type,
    sources: idea.sources.slice(0, 3).map((id) => ({ id, title: o.examples?.[id]?.title ?? "" })),
    niche: o.niche,
    kind: o.kind,
    why: idea.why.map((w) => w.text),
  };
}

/** Saved ideas (key → save id) and hidden ones, for a list of ideas. */
export function useIdeaMarks(saved: { key: string; id: string }[], dismissed: string[]) {
  const [savedMap, setSavedMap] = useState(() => new Map(saved.map((s) => [s.key, s.id])));
  const [hidden, setHidden] = useState(() => new Set(dismissed));
  const markSaved = useCallback((key: string, id: string | null) => {
    setSavedMap((m) => {
      const n = new Map(m);
      if (id) n.set(key, id);
      else n.delete(key);
      return n;
    });
  }, []);
  const hide = useCallback((key: string) => setHidden((h) => new Set(h).add(key)), []);
  const unhideAll = useCallback(() => setHidden(new Set()), []);
  return { savedMap, markSaved, hidden, hide, unhideAll };
}

function Strength({ value }: { value: number }) {
  const n = Math.max(1, Math.round(value * 4));
  return (
    <span className="inline-flex items-end gap-[2px]" title={`How strong the numbers behind it are: ${["weak", "fair", "good", "strong"][n - 1]}`} aria-label={`Strength ${n} of 4`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="w-[3px] rounded-[1px]" style={{ height: 5 + i * 2.5, background: i < n ? "rgb(var(--amber))" : "rgb(var(--ink) / 0.14)" }} />
      ))}
    </span>
  );
}

export function IdeaCard({
  idea,
  teamId,
  examples,
  nicheName,
  kind,
  savedId,
  onSaved,
  onHide,
  index = 0,
  dense = false,
}: {
  idea: Idea;
  teamId: string;
  examples?: Record<string, MiniVideo>;
  nicheName: string | null;
  kind: "long" | "short";
  savedId: string | null;
  onSaved: (key: string, id: string | null) => void;
  onHide?: (key: string) => void;
  index?: number;
  /** Fewer details (For you, the video panel). */
  dense?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { openVideo } = useOutliersNav();
  const [main, setMain] = useState(0);
  const [allTitles, setAllTitles] = useState(false);
  const [busy, setBusy] = useState<"save" | "start" | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const startRef = useRef<HTMLButtonElement>(null);
  const f = idea.formatId ? FORMAT_BY_ID.get(idea.formatId) : undefined;
  const titles = [idea.titles[main], ...idea.titles.filter((_, i) => i !== main)];
  const ordered: Idea = { ...idea, titles };
  const saved = toSaved(ordered, { niche: nicheName, kind, examples });

  const toggleSave = async () => {
    if (busy) return;
    setBusy("save");
    try {
      if (savedId) {
        onSaved(idea.key, null);
        const r = await removeSave(teamId, savedId);
        if (r.error !== undefined) {
          onSaved(idea.key, savedId);
          toast.error(r.error);
        }
      } else {
        const r = await saveIdea(teamId, saved, null);
        if (r.error !== undefined) toast.error(r.error);
        else {
          onSaved(idea.key, r.id);
          toast.success("Idea saved. It's in the Saved tab.");
        }
      }
    } catch {
      toast.error("Couldn't save the idea. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };
  const start = async (as: "long" | "short") => {
    setStartOpen(false);
    if (busy) return;
    setBusy("start");
    try {
      const r = await startFromIdea(teamId, saved, as, savedId);
      if (r.error !== undefined) {
        toast.error(r.error);
        setBusy(null);
        return;
      }
      startNavProgress(r.href);
      router.push(r.href);
    } catch {
      toast.error("Couldn't start it. Check your connection and try again.");
      setBusy(null);
    }
  };
  const hide = async () => {
    onHide?.(idea.key);
    try {
      const r = await dismissIdea(teamId, idea.key);
      if (r.error !== undefined) toast.error(r.error);
    } catch {}
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText([...titles, "", `Hook: ${idea.hook}`].join("\n"));
      toast.success("Titles and hook copied");
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  };
  const sources = idea.sources.map((id) => examples?.[id]).filter((x): x is MiniVideo => !!x);

  return (
    <article className="group relative flex flex-col rounded-2xl border border-line/10 bg-surface p-4 min-w-0 transition-shadow hover:shadow-[0_10px_30px_-18px_rgb(0_0_0/0.45)]" style={{ "--i": index } as React.CSSProperties}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: formatColor(idea.formatId) }} aria-hidden />
        <span className="text-[12px] font-semibold text-ink-soft truncate">{f?.name ?? "From real outlier titles"}</span>
        <span className="rounded-md bg-surface-2 px-1.5 h-5 inline-flex items-center text-[11px] font-semibold text-ink-faint flex-shrink-0">{idea.type}</span>
        {idea.origin === "every" && (
          <span className="rounded-md bg-violet/12 text-violet px-1.5 h-5 inline-flex items-center text-[11px] font-semibold flex-shrink-0" title="A format that wins in other niches, written for yours">
            From other niches
          </span>
        )}
        <span className="flex-1" />
        <Strength value={idea.strength} />
        {onHide && (
          <button type="button" onClick={hide} aria-label="Hide this idea" title="Hide (it won't come back)" className="-mr-1.5 w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <h3 className={`mt-2.5 font-display leading-[1.22] font-semibold text-balance ${dense ? "text-[17px]" : "text-[17.5px] sm:text-[18px]"}`}>{titles[0]}</h3>
      {titles.length > 1 && (
        <ul className="mt-2 space-y-1" aria-label="Other titles (tap one to make it the main title)">
          {idea.titles
            .map((t, i) => ({ t, i }))
            .filter((x) => x.i !== main)
            .slice(0, dense && !allTitles ? 1 : 4)
            .map(({ t, i }) => (
              <li key={t}>
                <button type="button" onClick={() => setMain(i)} className="text-left text-[13px] leading-snug text-ink-soft hover:text-ink flex gap-2" title="Make this the main title">
                  <span className="mt-[7px] w-1 h-1 rounded-[1px] bg-ink-faint flex-shrink-0" aria-hidden />
                  {t}
                </button>
              </li>
            ))}
          {dense && !allTitles && titles.length > 2 && (
            <li>
              <button type="button" onClick={() => setAllTitles(true)} className="text-[12px] font-semibold text-ink-faint hover:text-ink pl-3">
                {titles.length - 2} more title{titles.length - 2 === 1 ? "" : "s"}
              </button>
            </li>
          )}
        </ul>
      )}

      <p className={`mt-3 text-[12.5px] leading-relaxed text-ink-soft border-l-2 border-amber/50 pl-2.5 ${dense ? "line-clamp-2" : ""}`} title={dense ? idea.hook : undefined}>
        <span className="font-semibold text-ink">Hook </span>
        {idea.hook}
      </p>

      {!dense && idea.why.length > 0 && (
        <ul className="mt-3 space-y-1">
          {idea.why.map((w) => (
            <li key={w.text} className="flex gap-2 text-[12px] leading-snug text-ink-soft">
              <span className={`mt-[5px] w-1.5 h-1.5 rounded-[2px] flex-shrink-0 ${w.tone === "good" ? "bg-green" : w.tone === "new" ? "bg-violet" : "bg-blue"}`} aria-hidden />
              {w.text}
            </li>
          ))}
        </ul>
      )}

      {sources.length > 0 && !dense && (
        <div className="mt-3 flex items-center gap-1.5 min-w-0">
          <span className="text-[11.5px] text-ink-faint flex-shrink-0">From</span>
          <Sources list={sources.slice(0, 3)} open={openVideo} />
        </div>
      )}

      <div className="mt-auto pt-3.5 flex items-center gap-1.5 min-w-0">
        <div className="inline-flex rounded-lg overflow-hidden">
          <button type="button" disabled={busy !== null} onClick={() => start(kind)} className="inline-flex items-center gap-1.5 bg-amber text-white h-9 pl-3 pr-2.5 text-[13px] font-semibold whitespace-nowrap hover:brightness-110 disabled:opacity-60" title={kind === "short" ? "Start a Short from this idea" : "Start a long video from this idea"}>
            {kind === "short" ? <ShortsIcon className="w-4 h-4" /> : <VideoIcon className="w-4 h-4" />}
            {busy === "start" ? "Opening…" : dense ? "Start" : kind === "short" ? "Start a Short" : "Start a video"}
          </button>
          <button ref={startRef} type="button" disabled={busy !== null} onClick={() => setStartOpen((o) => !o)} aria-label="More ways to start" aria-haspopup="menu" aria-expanded={startOpen} className="bg-amber text-white h-9 w-8 flex items-center justify-center border-l border-white/25 hover:brightness-110 disabled:opacity-60">
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <AnchoredMenu open={startOpen} onClose={() => setStartOpen(false)} anchor={startRef} width={230} align="left" label="Start from this idea">
          <div className="p-1.5">
            {(["long", "short"] as const).map((k) => (
              <button key={k} type="button" role="menuitem" onClick={() => start(k)} className="w-full flex items-center gap-2.5 px-3 h-10 rounded-lg text-left text-[13.5px] hover:bg-surface-2">
                {k === "short" ? <ShortsIcon className="w-4 h-4 text-short" /> : <VideoIcon className="w-4 h-4 text-long" />}
                {k === "short" ? "Start a Short" : "Start a long video"}
              </button>
            ))}
          </div>
        </AnchoredMenu>
        <button type="button" disabled={busy === "save"} onClick={toggleSave} aria-pressed={!!savedId} aria-label={savedId ? "Saved (click to remove)" : "Save this idea"} title={savedId ? "Saved" : "Save"} className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${savedId ? "border-amber/40 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"}`}>
          <BookmarkIcon filled={!!savedId} />
        </button>
        <button type="button" onClick={copy} aria-label="Copy the titles and hook" title="Copy" className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line/15 text-ink-soft hover:text-ink hover:border-line/30 flex-shrink-0">
          <CopyIcon className="w-4 h-4" />
        </button>
        {dense && sources.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 min-w-0 pl-1">
            <span className="text-[11.5px] text-ink-faint flex-shrink-0 hidden min-[420px]:inline">From</span>
            <Sources list={sources.slice(0, 2)} open={openVideo} />
          </div>
        )}
      </div>
    </article>
  );
}

/** The outliers an idea comes from, as small thumbnails with their multiplier. */
function Sources({ list, open }: { list: MiniVideo[]; open: (id: string) => void }) {
  return (
    <div className="flex gap-1.5 min-w-0 overflow-hidden">
      {list.map((s) => (
        <button key={s.id} type="button" onClick={() => open(s.id)} title={`${s.title} · ${s.channel}`} className="relative flex-shrink-0 rounded-md overflow-hidden ring-1 ring-line/10 hover:ring-line/40 w-[64px] aspect-video bg-surface-2">
          <Thumb id={s.id} kind={s.kind === "short" ? "long" : s.kind} sizes="64px" tint={s.tint} />
          {s.score !== null && (
            <span className="absolute bottom-0.5 left-0.5 rounded-[3px] px-1 text-[10px] font-display font-semibold leading-[14px] text-white" style={{ background: s.score >= 2 ? heat(s.score).solid : "rgb(0 0 0 / 0.7)" }}>
              {multText(s.score)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
