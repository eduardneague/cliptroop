"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Select } from "@/components/ui/select";
import { ArrowLeftIcon, BookIcon, CheckIcon, CloseIcon, SpellCheckIcon, TargetIcon, TrashIcon } from "@/components/ui/icons";
import type { Grammar } from "./use-grammar";
import { scoreColor, scoreInk } from "./score";
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_HINT, CATEGORY_LABEL, FORMALITY, LANGUAGES, type GrammarCategory, type Suggestion } from "./types";

/*
 * Writing suggestions on screen, the way Grammarly shows them:
 *   - the underlines (drawn by the editor plugin),
 *   - a card over a word when you point at it (or tap it): what to do,
 *     the fix to click, why, Dismiss and Add to dictionary,
 *   - a round button in the corner with how many there are,
 *   - the panel: the overall score, the four kinds with their counts, every
 *     suggestion as a line that opens into its card, Accept all, and Goals
 *     (formality, language, which kinds, the team's dictionary).
 */

/** What changes, word by word: the same start and end stay plain. */
export function diffWords(a: string, b: string) {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  let i = 0;
  while (i < A.length && i < B.length && A[i] === B[i]) i++;
  let j = 0;
  while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;
  return { pre: A.slice(0, i).join(""), del: A.slice(i, A.length - j).join(""), ins: B.slice(i, B.length - j).join(""), post: A.slice(A.length - j).join("") };
}

const short = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function Fix({ s, rep, first, onClick }: { s: Suggestion; rep: string; first: boolean; onClick: () => void }) {
  const color = CATEGORY_COLOR[s.category];
  const d = diffWords(s.original, rep);
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`group/fix inline-flex items-center gap-1.5 max-w-full rounded-lg border text-left transition-colors ${first ? "px-2.5 py-1.5 text-[14px]" : "px-2 py-1 text-[13px]"}`}
      style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} ${first ? 12 : 6}%, transparent)` }}
      title={rep ? `Change to “${rep}”` : "Remove"}
    >
      {first && (d.pre || d.post) && <span className="text-ink-soft truncate">{short(d.pre.trim(), 16)}</span>}
      {(first || !rep) && d.del && (
        <span className="line-through decoration-[1.5px] text-ink-soft truncate" style={{ textDecorationColor: "var(--gr-correctness)" }}>
          {short(d.del.trim(), 28)}
        </span>
      )}
      {rep ? (
        <span className="font-bold text-ink truncate">{short(first ? d.ins.trim() || rep : rep, 30)}</span>
      ) : (
        <span className="font-bold text-ink">Remove</span>
      )}
      {first && d.post.trim() && <span className="text-ink-soft truncate">{short(d.post.trim(), 16)}</span>}
    </button>
  );
}

/** One suggestion, in full: in the card over the text, and opened in the panel. */
export function SuggestionCard({
  s,
  onAccept,
  onDismiss,
  onAddWord,
}: {
  s: Suggestion;
  onAccept: (replacement: string) => void;
  onDismiss: () => void;
  onAddWord?: () => void;
}) {
  const color = CATEGORY_COLOR[s.category];
  return (
    <div>
      <div className="flex items-center gap-1.5 min-w-0 text-[11.5px] mb-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="font-bold flex-shrink-0" style={{ color }}>
          {CATEGORY_LABEL[s.category]}
        </span>
        <span className="text-ink-faint">·</span>
        <span className="text-ink-soft truncate">{s.title}</span>
      </div>
      {s.replacements.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {s.replacements.map((r, i) => (
            <Fix key={`${i}-${r}`} s={s} rep={r} first={i === 0} onClick={() => onAccept(r)} />
          ))}
        </div>
      )}
      <p className="text-[12.5px] leading-snug text-ink-soft">{s.message}</p>
      <div className="flex items-center gap-1 mt-2.5 -mb-1 -ml-1.5 flex-wrap">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDismiss}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
        >
          <TrashIcon className="w-3.5 h-3.5" />
          Dismiss
        </button>
        {s.word && onAddWord && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onAddWord}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
          >
            <BookIcon className="w-3.5 h-3.5" />
            Add to dictionary
          </button>
        )}
      </div>
    </div>
  );
}

/** The card over a word (pointed at, or tapped). */
function HoverCard({
  g,
  editor,
  id,
  pinned,
  onClose,
  onEnter,
  onLeave,
}: {
  g: Grammar;
  editor: Editor;
  id: string;
  pinned: boolean;
  onClose: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const s = g.items.find((x) => x.id === id) ?? null;
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!s) return;
    const place = () => {
      const q = CSS.escape(id);
      const el = editor.view.dom.querySelector<HTMLElement>(`[data-gr="${q}"], [data-gr-wide="${q}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.min(330, window.innerWidth - 16);
      const h = box.current?.offsetHeight ?? 170;
      const below = r.bottom + 8 + h <= window.innerHeight - 8 || r.top - 8 - h < 8;
      setPos({ top: below ? r.bottom + 8 : r.top - 8 - h, left: Math.min(Math.max(8, r.left - 14), window.innerWidth - w - 8) });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [id, s, editor]);

  // Its words changed (or it was fixed): the card goes.
  useEffect(() => {
    if (!s) onClose();
  }, [s, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      if (!pinned) return;
      const t = e.target as Element | null;
      if (box.current?.contains(t as Node) || t?.closest?.("[data-gr], [data-gr-wide]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [pinned, onClose]);

  if (!s) return null;
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={`${CATEGORY_LABEL[s.category]}: ${s.title}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: "min(330px, calc(100vw - 16px))", boxShadow: `inset 0 3px 0 ${CATEGORY_COLOR[s.category]}, 0 20px 50px -18px rgb(0 0 0 / .45)` }}
      className="no-print fixed z-[120] rounded-xl border border-line/15 bg-surface p-3 animate-[modalin_.14s_var(--ease-out)]"
    >
      <SuggestionCard
        s={s}
        onAccept={(r) => {
          g.accept(s.id, r);
          onClose();
        }}
        onDismiss={() => {
          g.dismiss(s.id);
          onClose();
        }}
        onAddWord={
          s.word
            ? () => {
                void g.dictionary.add(s.word!);
                onClose();
              }
            : undefined
        }
      />
    </div>,
    document.body
  );
}

/**
 * The overall score as a ring (like Grammarly's), coloured from red to the
 * app's own green as it climbs (1.23.1, scoreColor).
 */
export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const stroke = size >= 40 ? 4 : 3;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <span className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }} title={`Overall score ${score}: fixing suggestions raises it`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line) / .14)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * score) / 100} ${c}`}
          className="transition-[stroke-dasharray,stroke] duration-500"
        />
      </svg>
      <span className="absolute font-bold tabular-nums leading-none" style={{ fontSize: Math.max(9.5, Math.round(size * 0.32)) }}>
        {score}
      </span>
      <span className="sr-only">Overall score {score} out of 100</span>
    </span>
  );
}

const STATUS: Record<string, string> = {
  checking: "Checking…",
  idle: "Up to date",
  paused: "LanguageTool needs a minute (too many checks). Style suggestions keep working.",
  offline: "Can't reach LanguageTool right now. Style suggestions keep working.",
  off: "Suggestions are off.",
};

/**
 * Will "Accept all" take this one? (1.23.1: every suggestion with a fix,
 * spelling too, its best fix.) Only what has no fix (a long sentence to
 * split) and what looks like a name or a brand wait for you.
 */
const takesAll = (s: Suggestion) => !s.wide && !s.name && s.replacements.length > 0;

function Goals({ g, onBack }: { g: Grammar; onBack: () => void }) {
  const [word, setWord] = useState("");
  const { settings: st, setSettings } = g;
  const add = () => {
    const w = word.trim();
    if (!w) return;
    if (/\s/.test(w)) return;
    void g.dictionary.add(w);
    setWord("");
  };
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Back to the suggestions
      </button>
      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-2">Formality</h3>
        <div role="radiogroup" aria-label="Formality" className="grid grid-cols-3 gap-1.5">
          {FORMALITY.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={st.formality === f.value}
              onClick={() => setSettings({ formality: f.value })}
              className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${st.formality === f.value ? "border-amber bg-amber/10" : "border-line/15 hover:border-line/30"}`}
            >
              <span className="block text-[13px] font-bold">{f.label}</span>
              <span className="block text-[11px] leading-snug text-ink-soft mt-0.5">{f.hint}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-2">Language</h3>
        <Select
          value={st.language}
          onChange={(v) => v && setSettings({ language: v as typeof st.language })}
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
          ariaLabel="Language"
        />
        <p className="mt-1.5 text-[11.5px] text-ink-faint leading-snug">Spelling and grammar work in many languages. Clarity, Engagement and Delivery are for English.</p>
      </section>
      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-2">What to suggest</h3>
        <div className="space-y-1">
          {CATEGORIES.map((c) => {
            const on = !st.off.includes(c);
            return (
              <label key={c} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2 cursor-pointer">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLOR[c] }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold">{CATEGORY_LABEL[c]}</span>
                  <span className="block text-[11.5px] text-ink-soft">{CATEGORY_HINT[c]}</span>
                </span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setSettings({ off: on ? [...st.off, c] : st.off.filter((x) => x !== c) })}
                  className="w-4 h-4 accent-[rgb(var(--amber))]"
                />
              </label>
            );
          })}
        </div>
      </section>
      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1">The team&rsquo;s dictionary</h3>
        <p className="text-[11.5px] text-ink-faint leading-snug mb-2">Words spelled the way you want them: names, the channel&rsquo;s own words. Everyone on the team shares it.</p>
        <div className="flex gap-1.5 mb-2">
          <input
            value={word}
            onChange={(e) => setWord(e.target.value.replace(/\s/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && add()}
            maxLength={48}
            placeholder="Add a word"
            className="flex-1 min-w-0 rounded-lg border border-line/15 bg-surface px-3 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber"
          />
          <button type="button" onClick={add} disabled={!word.trim()} className="rounded-lg bg-amber text-white font-bold px-3 h-9 text-[12.5px] disabled:opacity-50">
            Add
          </button>
        </div>
        {g.dictionary.words.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {g.dictionary.words.map((w) => (
              <li key={w.id} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 pl-2.5 pr-1 h-7 text-[12.5px] font-semibold">
                {w.word}
                {g.dictionary.canRemove(w) && (
                  <button type="button" onClick={() => void g.dictionary.remove(w.id)} aria-label={`Remove ${w.word}`} className="w-5 h-5 rounded flex items-center justify-center text-ink-faint hover:text-red">
                    <CloseIcon className="w-3 h-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-ink-soft">No words yet. Use Add to dictionary on a spelling suggestion.</p>
        )}
      </section>
      <section className="pt-1 border-t border-line/10">
        <button
          type="button"
          onClick={() => setSettings({ on: !st.on })}
          className="mt-3 rounded-lg border border-line/20 px-3 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/40"
        >
          {st.on ? "Turn suggestions off" : "Turn suggestions on"}
        </button>
      </section>
    </div>
  );
}

/** "Wukong looks like a name." / "Wukong, MSRP and 2 more look like names." */
function namesWords(words: string[]) {
  if (words.length === 1) return `“${words[0]}” looks like a name.`;
  const shown = words.slice(0, 2).map((w) => `“${w}”`);
  const more = words.length - shown.length;
  return `${more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(" and ")} look like names.`;
}

/** The assistant panel on the right (a sheet on phones). */
function GrammarPanel({ g, onClose }: { g: Grammar; onClose: () => void }) {
  const [filter, setFilter] = useState<GrammarCategory | null>(null);
  const [goals, setGoals] = useState(false);
  const [open, setOpen] = useState<string | null>(g.active);
  const listRef = useRef<HTMLDivElement>(null);

  // An underline clicked in the text opens its card here.
  useEffect(() => {
    if (!g.active) return;
    setOpen(g.active);
    setGoals(false);
    const s = g.items.find((x) => x.id === g.active);
    if (s && filter && s.category !== filter) setFilter(null);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-row="${CSS.escape(g.active!)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.active]);

  const list = useMemo(() => {
    const visible = g.items.filter((s) => !filter || s.category === filter);
    // In reading order, the sentence-wide ones after the word-level ones they hold.
    return visible.sort((a, b) => a.from - b.from || Number(!!a.wide) - Number(!!b.wide));
  }, [g.items, filter]);
  const all = list.filter(takesAll);
  // What Accept all leaves: names (one click puts them in the dictionary) and the rest.
  const names = list.filter((s) => s.name && s.word);
  const rest = list.length - all.length - names.length;

  const next = useCallback(
    (id: string) => {
      // Fixed or dismissed: the next one opens, like Grammarly.
      const i = list.findIndex((s) => s.id === id);
      const after = list[i + 1] ?? list[i - 1] ?? null;
      setOpen(after?.id ?? null);
      if (after) g.pick(after.id);
      else g.pick(null, false);
    },
    [list, g]
  );

  return createPortal(
    <>
      <section
        className="no-print fixed z-40 bg-surface border border-line/15 shadow-2xl flex flex-col animate-[modalin_.18s_var(--ease-out)] inset-x-2 bottom-2 h-[78dvh] rounded-2xl lg:inset-auto lg:right-6 lg:bottom-6 lg:w-[384px] lg:h-[min(680px,calc(100dvh-9rem))]"
        aria-label="Writing suggestions"
      >
        <header className="px-4 pt-3.5 pb-3 border-b border-line/10">
          <div className="flex items-center gap-3">
            <ScoreRing score={g.score} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-bold leading-tight">Suggestions</h2>
              <p className="text-[12px] text-ink-soft">
                {!g.live ? "Off" : g.counts.all ? `${g.counts.all} to look at · ${g.words} words` : `All clear · ${g.words} words`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGoals((v) => !v)}
              aria-pressed={goals}
              title="Goals and dictionary"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold ${goals ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
            >
              <TargetIcon className="w-4 h-4" />
              Goals
            </button>
            <button type="button" onClick={onClose} aria-label="Close suggestions" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          {!goals && (
            <div role="radiogroup" aria-label="Show" className="mt-3 grid grid-cols-4 gap-1.5">
              {CATEGORIES.map((c) => {
                const on = filter === c;
                const off = g.settings.off.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setFilter(on ? null : c)}
                    title={off ? `${CATEGORY_LABEL[c]} is turned off in Goals` : CATEGORY_HINT[c]}
                    className={`relative overflow-hidden rounded-lg border px-1.5 sm:px-2 pt-2 pb-1.5 text-left transition-colors ${on ? "border-line/40 bg-surface-2" : "border-line/10 hover:border-line/25"} ${off ? "opacity-45" : ""}`}
                  >
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: CATEGORY_COLOR[c] }} />
                    <span className="block text-[15px] font-bold tabular-nums leading-tight">{g.counts[c]}</span>
                    <span className="block text-[10px] sm:text-[10.5px] font-semibold tracking-tight sm:tracking-normal text-ink-soft truncate">{CATEGORY_LABEL[c]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {goals ? (
          <Goals g={g} onBack={() => setGoals(false)} />
        ) : (
          <>
            <div className="px-4 py-2 border-b border-line/10 flex items-center gap-2 text-[12px] text-ink-soft min-h-[2.5rem]">
              {g.status === "checking" ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-soft/30 border-t-amber animate-spin flex-shrink-0" />
              ) : g.status === "idle" ? (
                <CheckIcon className="w-3.5 h-3.5 text-green flex-shrink-0" />
              ) : null}
              <span className="flex-1 min-w-0 leading-snug">{STATUS[g.status]}</span>
              {g.status === "offline" && (
                <button type="button" onClick={g.recheck} className="font-semibold text-ink hover:underline flex-shrink-0">
                  Try again
                </button>
              )}
              {g.status === "off" && (
                <button type="button" onClick={() => g.setSettings({ on: true })} className="font-semibold text-ink hover:underline flex-shrink-0">
                  Turn on
                </button>
              )}
              {filter && (
                <button type="button" onClick={() => setFilter(null)} className="font-semibold text-ink hover:underline flex-shrink-0">
                  Show all
                </button>
              )}
            </div>
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1.5">
              {(all.length > 0 || names.length > 0) && (
                <div className="rounded-xl bg-surface-2 px-3 py-2 mb-2 space-y-2">
                  {all.length > 0 && (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 min-w-0 text-[12px] text-ink-soft leading-snug">
                        {all.length === list.length
                          ? `${all.length === 1 ? "It has" : `All ${all.length} have`} a fix: take ${all.length === 1 ? "it" : "them"} in one go.`
                          : `${all.length} ${all.length === 1 ? "has" : "have"} a fix. ${names.length + rest} ${names.length + rest === 1 ? "is" : "are"} left for you.`}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          g.acceptAll(all.map((s) => s.id));
                          setOpen(null);
                        }}
                        className="rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px] flex-shrink-0"
                      >
                        Accept all {all.length}
                      </button>
                    </div>
                  )}
                  {names.length > 0 && (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 min-w-0 text-[12px] text-ink-soft leading-snug" title={[...new Set(names.map((s) => s.word))].join(", ")}>
                        {namesWords([...new Set(names.map((s) => s.word!))])}
                      </p>
                      <button
                        type="button"
                        onClick={() => void g.addWords(names.map((s) => s.word!))}
                        title="Add them to the team's dictionary: they won't be marked again"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-2.5 h-8 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 flex-shrink-0"
                      >
                        <BookIcon className="w-3.5 h-3.5" />
                        Add to dictionary
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!list.length && (
                <div className="text-center px-6 py-10">
                  {g.live && g.status !== "checking" && !filter && (
                    <span className="mx-auto mb-3 w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--gr-engagement) 14%, transparent)", color: "var(--gr-engagement)" }}>
                      <CheckIcon className="w-5 h-5" />
                    </span>
                  )}
                  <p className="text-[13px] text-ink-soft">
                    {!g.live ? "Turn suggestions on to see them here." : filter ? `Nothing in ${CATEGORY_LABEL[filter]}.` : g.status === "checking" ? "Reading the script…" : "No suggestions right now. Nice writing."}
                  </p>
                </div>
              )}
              {list.map((s) =>
                open === s.id ? (
                  <article
                    key={s.id}
                    data-row={s.id}
                    className="rounded-xl border border-line/20 bg-surface p-3 shadow-[0_8px_24px_-16px_rgb(0_0_0/0.5)] animate-[modalin_.14s_var(--ease-out)]"
                    style={{ boxShadow: `inset 3px 0 0 ${CATEGORY_COLOR[s.category]}` }}
                  >
                    <SuggestionCard
                      s={s}
                      onAccept={(r) => {
                        if (g.accept(s.id, r)) next(s.id);
                      }}
                      onDismiss={() => {
                        g.dismiss(s.id);
                        next(s.id);
                      }}
                      onAddWord={
                        s.word
                          ? () => {
                              void g.dictionary.add(s.word!);
                              next(s.id);
                            }
                          : undefined
                      }
                    />
                  </article>
                ) : (
                  <button
                    key={s.id}
                    type="button"
                    data-row={s.id}
                    onClick={() => {
                      setOpen(s.id);
                      g.pick(s.id);
                    }}
                    className="w-full text-left rounded-xl border border-line/10 hover:border-line/25 hover:bg-surface-2/50 px-3 py-2.5 flex items-center gap-2.5 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLOR[s.category] }} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      <span className="font-semibold text-ink">{short(s.original.replace(/\s+/g, " "), s.wide ? 24 : 30)}</span>
                      <span className="text-ink-faint"> · </span>
                      <span className="text-ink-soft">{s.title}</span>
                    </span>
                  </button>
                )
              )}
            </div>
          </>
        )}
        <footer className="px-4 py-2.5 border-t border-line/10 text-[11px] leading-snug text-ink-faint pb-[calc(env(safe-area-inset-bottom)+0.625rem)]">
          Spelling and grammar by{" "}
          <a href="https://languagetool.org" target="_blank" rel="noopener" className="font-semibold text-ink-soft hover:text-ink underline underline-offset-2">
            LanguageTool
          </a>
          : the script&rsquo;s text is sent there to be checked (
          <a href="https://languagetool.org/legal/privacy" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
            how they handle it
          </a>
          ). Style suggestions are worked out on your device.
        </footer>
      </section>
    </>,
    document.body
  );
}

/** The count's badge (1.23.1): the score's colour, red to green as the script gets better. */
const badge = (g: Grammar) => ({ background: scoreColor(g.score), color: scoreInk(g.score) });

/** The round button in the corner, with how many suggestions there are. */
function GrammarFab({ g, onOpen }: { g: Grammar; onOpen: () => void }) {
  const n = g.counts.all;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={g.live ? `Writing suggestions: ${n}` : "Writing suggestions are off"}
      title={g.live ? (n ? `${n} suggestion${n === 1 ? "" : "s"}` : "No suggestions") : "Suggestions are off"}
      className="no-print fixed z-30 right-4 bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] lg:bottom-[4.75rem] w-11 h-11 rounded-full bg-surface-2 text-ink border border-line/20 shadow-[0_12px_30px_-10px_rgb(0_0_0/0.6)] flex items-center justify-center hover:border-line/40 hover:scale-[1.05] transition-transform"
    >
      <SpellCheckIcon className={`w-5 h-5 ${g.live ? "" : "opacity-40"}`} />
      {g.status === "checking" && <span aria-hidden className="absolute inset-[-3px] rounded-full border-2 border-transparent border-t-amber animate-spin" />}
      {g.live && (
        <span
          className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums ring-2 ring-[rgb(var(--paper))]"
          style={badge(g)}
        >
          {n ? (n > 99 ? "99+" : n) : <CheckIcon className="w-3 h-3" />}
        </span>
      )}
    </button>
  );
}

/**
 * In the formatting bar: the count and the panel, and next to them the
 * score in its ring (1.23.1), so how the script is doing shows as you write.
 */
export function GrammarToolbarButton({ g, open, onToggle }: { g: Grammar; open: boolean; onToggle: () => void }) {
  const n = g.counts.all;
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        aria-pressed={open}
        title="Writing suggestions"
        className={`h-9 pl-2 pr-2.5 rounded-lg flex items-center gap-1.5 transition-colors ${open ? "bg-ink text-paper" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
      >
        <SpellCheckIcon className="w-4 h-4" />
        <span className="hidden xl:inline text-[12.5px] font-semibold">Suggestions</span>
        {g.live && n > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center tabular-nums" style={badge(g)}>
            {n > 99 ? "99+" : n}
          </span>
        )}
      </button>
      {g.live && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggle}
          aria-label={`Overall score ${g.score} out of 100`}
          className="rounded-full p-0.5 hover:bg-surface-2 transition-colors"
        >
          <ScoreRing score={g.score} size={30} />
        </button>
      )}
    </span>
  );
}

/**
 * Everything on screen for one editor's suggestions: the card over a word,
 * the corner button and the panel.
 */
export function GrammarLayer({ editor, g, open, onOpen, onClose, fab = true }: { editor: Editor | null; g: Grammar; open: boolean; onOpen: () => void; onClose: () => void; fab?: boolean }) {
  const [card, setCard] = useState<{ id: string; pinned: boolean } | null>(null);
  const timers = useRef<{ show?: ReturnType<typeof setTimeout>; hide?: ReturnType<typeof setTimeout> }>({});
  const live = useRef({ open, card });
  live.current = { open, card };

  const { pick, enabled } = g;
  const close = useCallback(() => {
    setCard(null);
    pick(null, false);
  }, [pick]);

  useEffect(() => {
    if (!editor || !enabled) return;
    const dom = editor.view.dom as HTMLElement;
    const t = timers.current;
    const markOf = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const word = target.closest<HTMLElement>("[data-gr]");
      if (word) return word.dataset.gr ?? null;
      return target.closest<HTMLElement>("[data-gr-wide]")?.dataset.grWide ?? null;
    };
    const over = (e: MouseEvent) => {
      const id = markOf(e.target);
      if (!id) return;
      clearTimeout(t.hide);
      if (live.current.open || live.current.card?.pinned) return;
      clearTimeout(t.show);
      t.show = setTimeout(() => setCard({ id, pinned: false }), 260);
    };
    const out = (e: MouseEvent) => {
      if (!markOf(e.target)) return;
      clearTimeout(t.show);
      if (live.current.card?.pinned) return;
      t.hide = setTimeout(() => setCard((c) => (c && !c.pinned ? null : c)), 240);
    };
    const click = (e: MouseEvent) => {
      const id = markOf(e.target);
      if (!id) return;
      clearTimeout(t.show);
      // With the panel open, its card opens there instead.
      if (live.current.open) return pick(id, false);
      setCard({ id, pinned: true });
      pick(id, false);
    };
    dom.addEventListener("mouseover", over);
    dom.addEventListener("mouseout", out);
    dom.addEventListener("click", click);
    return () => {
      dom.removeEventListener("mouseover", over);
      dom.removeEventListener("mouseout", out);
      dom.removeEventListener("click", click);
      clearTimeout(t.show);
      clearTimeout(t.hide);
    };
  }, [editor, enabled, pick]);

  // The panel opening takes over from the card.
  useEffect(() => {
    if (open) setCard(null);
  }, [open]);

  if (!editor || !g.enabled) return null;
  return (
    <>
      {card && !open && (
        <HoverCard
          g={g}
          editor={editor}
          id={card.id}
          pinned={card.pinned}
          onClose={close}
          onEnter={() => clearTimeout(timers.current.hide)}
          onLeave={() => {
            if (card.pinned) return;
            timers.current.hide = setTimeout(() => setCard((c) => (c && !c.pinned ? null : c)), 240);
          }}
        />
      )}
      {fab && !open && <GrammarFab g={g} onOpen={onOpen} />}
      {open && <GrammarPanel g={g} onClose={onClose} />}
    </>
  );
}
