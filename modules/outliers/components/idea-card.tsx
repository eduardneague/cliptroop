"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Dialog } from "@/components/ui/dialog";
import { ChevronDownIcon, CloseIcon, CopyIcon, ShortsIcon, VideoIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { startNavProgress } from "@/components/ui/nav-progress";
import { dismissIdea, removeSave, saveIdea, startFromIdea } from "@/app/(dashboard)/outliers/actions";
import { FORMAT_BY_ID, type FormatGroup } from "../lib/formats";
import type { Idea } from "../lib/ideas";
import type { MiniVideo, SavedIdea } from "../lib/types";
import { compact } from "../lib/filters";
import { BookmarkIcon, ChannelAvatar, Mult, Thumb } from "./bits";
import { useOutliersNav } from "./context";

/*
 * An idea (1.27.0; simpler since 1.29.0). In a list it's the outlier it
 * comes from (its thumbnail and multiplier), the title, whose video it's
 * from and the hook in a line or two, with Start and Save. Tapping it opens
 * the whole idea: every title (tap one to make it the main title), the
 * hook, why it should work and all the outliers behind it.
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

/**
 * The outlier each idea in a list leads with: its first source not already
 * shown by an idea above it, so a list of ideas doesn't repeat one picture.
 */
export function leadSources(ideas: Idea[], examples: Record<string, MiniVideo> | undefined): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const idea of ideas) {
    const have = idea.sources.filter((id) => examples?.[id]);
    const pick = have.find((id) => !used.has(id)) ?? have[0];
    if (!pick) continue;
    out.set(idea.key, pick);
    used.add(pick);
  }
  return out;
}

type IdeaProps = {
  idea: Idea;
  teamId: string;
  examples?: Record<string, MiniVideo>;
  nicheName: string | null;
  kind: "long" | "short";
  savedId: string | null;
  onSaved: (key: string, id: string | null) => void;
  onHide?: (key: string) => void;
  index?: number;
  /** The outlier's thumbnail on top (off where the idea comes from the video already shown). */
  thumb?: boolean;
  /** Which of its outliers leads (leadSources: no picture twice in a list). */
  lead?: string | null;
};

/** Saving, starting, hiding and copying an idea (the tile and the full view share them). */
function useIdea({ idea, teamId, examples, nicheName, kind, savedId, onSaved, onHide }: IdeaProps, main: number) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"save" | "start" | null>(null);
  const titles = [idea.titles[main] ?? idea.titles[0], ...idea.titles.filter((_, i) => i !== main)];
  const saved = toSaved({ ...idea, titles }, { niche: nicheName, kind, examples });
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
  return { titles, busy, toggleSave, start, hide, copy, sources };
}

/** The idea in a list: where it's from, the title and the hook. Tap for the whole idea. */
export function IdeaCard(props: IdeaProps) {
  const { idea, kind, savedId, onHide, index = 0, thumb = true, lead = null } = props;
  const [main, setMain] = useState(0);
  const [full, setFull] = useState(false);
  const a = useIdea(props, main);
  const f = idea.formatId ? FORMAT_BY_ID.get(idea.formatId) : undefined;
  const src = (lead ? a.sources.find((x) => x.id === lead) : null) ?? a.sources[0] ?? null;
  const more = Math.max(0, idea.sources.length - 1);

  return (
    <article className="group relative flex flex-col rounded-2xl border border-line/10 bg-surface overflow-hidden min-w-0 transition-shadow hover:shadow-[0_10px_30px_-18px_rgb(0_0_0/0.45)]" style={{ "--i": index } as React.CSSProperties}>
      {thumb && src ? (
        <button type="button" onClick={() => setFull(true)} className="relative block aspect-video bg-surface-2 overflow-hidden" aria-label={`Open the idea: ${a.titles[0]}`}>
          <Thumb id={src.id} kind={src.kind === "short" ? "long" : src.kind} sizes="(min-width: 1536px) 22vw, (min-width: 1280px) 30vw, (min-width: 768px) 45vw, 92vw" tint={src.tint} />
          <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent pointer-events-none" aria-hidden />
          {src.score !== null && <Mult score={src.score} size="md" className="absolute bottom-2 left-2" />}
          {more > 0 && <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 h-6 inline-flex items-center text-[11.5px] font-bold text-white backdrop-blur-sm">+{more} more</span>}
        </button>
      ) : (
        <span className="block h-1.5" style={{ background: formatColor(idea.formatId) }} aria-hidden />
      )}
      {onHide && (
        <button type="button" onClick={a.hide} aria-label="Hide this idea" title="Hide (it won't come back)" className={`absolute top-2 right-2 z-[1] w-8 h-8 rounded-lg flex items-center justify-center transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${thumb && src ? "bg-black/55 text-white hover:bg-black/75 backdrop-blur-sm" : "text-ink-faint hover:text-ink hover:bg-surface-2"}`}>
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="flex flex-col flex-1 p-3.5 min-w-0">
        <button type="button" onClick={() => setFull(true)} className={`text-left ${onHide && !(thumb && src) ? "pr-8" : ""}`}>
          <h3 className="font-display text-[16.5px] leading-[1.25] font-semibold text-balance line-clamp-3 hover:underline decoration-line/40 underline-offset-2">{a.titles[0]}</h3>
        </button>
        {src ? (
          <p className="mt-1.5 flex items-center gap-1.5 min-w-0 text-[12px] text-ink-soft">
            <ChannelAvatar src={src.avatar} title={src.channel} size={18} />
            <span className="truncate">
              From <span className="font-semibold text-ink">{src.channel}</span>
              {src.views !== null && <span className="text-ink-faint"> · {compact(src.views)} views</span>}
            </span>
          </p>
        ) : (
          <p className="mt-1.5 text-[12px] text-ink-faint truncate">{f?.name ?? "From real outlier titles"}</p>
        )}
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft line-clamp-2">{idea.hook}</p>
        <div className="mt-auto pt-3 flex items-center gap-1.5 min-w-0">
          <button type="button" disabled={a.busy !== null} onClick={() => a.start(kind)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white h-8 px-3 text-[12.5px] font-semibold whitespace-nowrap hover:brightness-110 disabled:opacity-60" title={kind === "short" ? "Start a Short from this idea" : "Start a long video from this idea"}>
            {kind === "short" ? <ShortsIcon className="w-3.5 h-3.5" /> : <VideoIcon className="w-3.5 h-3.5" />}
            {a.busy === "start" ? "Opening…" : "Start"}
          </button>
          <button type="button" disabled={a.busy === "save"} onClick={a.toggleSave} aria-pressed={!!savedId} aria-label={savedId ? "Saved (click to remove)" : "Save this idea"} title={savedId ? "Saved" : "Save"} className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${savedId ? "border-amber/40 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"}`}>
            <BookmarkIcon filled={!!savedId} />
          </button>
          <span className="flex-1" />
          <button type="button" onClick={() => setFull(true)} className="text-[12px] font-semibold text-ink-faint hover:text-ink whitespace-nowrap">
            See all
          </button>
        </div>
      </div>
      <IdeaDialog open={full} onClose={() => setFull(false)} props={props} main={main} setMain={setMain} a={a} />
    </article>
  );
}

/** The whole idea: every title, the hook, why it should work and the outliers behind it. */
function IdeaDialog({ open, onClose, props, main, setMain, a }: { open: boolean; onClose: () => void; props: IdeaProps; main: number; setMain: (i: number) => void; a: ReturnType<typeof useIdea> }) {
  const { openVideo } = useOutliersNav();
  const { idea, kind, savedId, onHide } = props;
  const [startOpen, setStartOpen] = useState(false);
  const startRef = useRef<HTMLButtonElement>(null);
  const f = idea.formatId ? FORMAT_BY_ID.get(idea.formatId) : undefined;
  const others = idea.titles.map((t, i) => ({ t, i })).filter((x) => x.i !== main);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Idea"
      width="sm:max-w-2xl"
      footer={
        <>
          {onHide && (
            <button
              type="button"
              onClick={() => {
                onClose();
                a.hide();
              }}
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-faint hover:text-ink hover:bg-surface-2"
            >
              Hide it
            </button>
          )}
          <button type="button" onClick={a.copy} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
            <CopyIcon className="w-4 h-4" />
            Copy
          </button>
          <button type="button" disabled={a.busy === "save"} onClick={a.toggleSave} aria-pressed={!!savedId} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-[13px] font-semibold transition-colors ${savedId ? "border-amber/40 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"}`}>
            <BookmarkIcon filled={!!savedId} />
            {savedId ? "Saved" : "Save"}
          </button>
          <div className="inline-flex rounded-lg overflow-hidden">
            <button type="button" disabled={a.busy !== null} onClick={() => a.start(kind)} className="inline-flex items-center gap-1.5 bg-amber text-white h-9 pl-3 pr-2.5 text-[13px] font-semibold whitespace-nowrap hover:brightness-110 disabled:opacity-60">
              {kind === "short" ? <ShortsIcon className="w-4 h-4" /> : <VideoIcon className="w-4 h-4" />}
              {a.busy === "start" ? "Opening…" : kind === "short" ? "Start a Short" : "Start a video"}
            </button>
            <button ref={startRef} type="button" disabled={a.busy !== null} onClick={() => setStartOpen((o) => !o)} aria-label="More ways to start" aria-haspopup="menu" aria-expanded={startOpen} className="bg-amber text-white h-9 w-8 flex items-center justify-center border-l border-white/25 hover:brightness-110 disabled:opacity-60">
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          <AnchoredMenu open={startOpen} onClose={() => setStartOpen(false)} anchor={startRef} width={230} label="Start from this idea">
            <div className="p-1.5">
              {(["long", "short"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setStartOpen(false);
                    a.start(k);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 h-10 rounded-lg text-left text-[13.5px] hover:bg-surface-2"
                >
                  {k === "short" ? <ShortsIcon className="w-4 h-4 text-short" /> : <VideoIcon className="w-4 h-4 text-long" />}
                  {k === "short" ? "Start a Short" : "Start a long video"}
                </button>
              ))}
            </div>
          </AnchoredMenu>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 h-6 text-[12px] font-semibold text-ink-soft">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: formatColor(idea.formatId) }} aria-hidden />
            {f?.name ?? "From real outlier titles"}
          </span>
          <span className="rounded-md bg-surface-2 px-2 h-6 inline-flex items-center text-[12px] font-semibold text-ink-faint">{idea.type}</span>
          {idea.origin === "every" && <span className="rounded-md bg-violet/12 text-violet px-2 h-6 inline-flex items-center text-[12px] font-semibold">From other niches</span>}
          <span className="flex-1" />
          <Strength value={idea.strength} />
        </div>

        <div>
          <h3 className="font-display text-[22px] sm:text-[24px] leading-[1.2] font-semibold text-balance">{a.titles[0]}</h3>
          {others.length > 0 && (
            <ul className="mt-3 space-y-1.5" aria-label="Other titles (tap one to make it the main title)">
              {others.map(({ t, i }) => (
                <li key={t}>
                  <button type="button" onClick={() => setMain(i)} className="text-left text-[14px] leading-snug text-ink-soft hover:text-ink flex gap-2" title="Make this the main title">
                    <span className="mt-[8px] w-1 h-1 rounded-[1px] bg-ink-faint flex-shrink-0" aria-hidden />
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[14px] leading-relaxed text-ink-soft border-l-2 border-amber/60 pl-3">
          <span className="font-semibold text-ink">Hook </span>
          {idea.hook}
        </p>

        {a.sources.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink-faint">The outliers it comes from</p>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              {a.sources.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    openVideo(s.id);
                  }}
                  className="text-left group/src min-w-0"
                >
                  <span className="relative block aspect-video rounded-xl overflow-hidden bg-surface-2 ring-1 ring-line/10 group-hover/src:ring-line/40">
                    <Thumb id={s.id} kind={s.kind === "short" ? "long" : s.kind} sizes="(min-width: 640px) 200px, 90vw" tint={s.tint} />
                    {s.score !== null && <Mult score={s.score} size="sm" className="absolute bottom-1.5 left-1.5" />}
                  </span>
                  <span className="mt-1.5 block text-[12.5px] font-semibold leading-snug line-clamp-2">{s.title}</span>
                  <span className="block text-[11.5px] text-ink-faint truncate">{s.channel}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {idea.why.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-ink-faint">Why it should work</p>
            <ul className="space-y-1.5">
              {idea.why.map((w) => (
                <li key={w.text} className="flex gap-2 text-[13px] leading-snug text-ink-soft">
                  <span className={`mt-[6px] w-1.5 h-1.5 rounded-[2px] flex-shrink-0 ${w.tone === "good" ? "bg-green" : w.tone === "new" ? "bg-violet" : "bg-blue"}`} aria-hidden />
                  {w.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
