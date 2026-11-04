"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildMentionCatalog, findMentions, type MentionTarget } from "@/lib/mentions";
import { ROLES, type RoleId } from "@/lib/permissions/roles";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { rankPeople, rankRoles, ROLE_LABEL, type MentionPerson } from "../lib/mention-people";
import { quoteText } from "../lib/anchors";
import { MAX_COMMENT } from "../lib/comment-limits";
import { Leaves } from "@/components/ui/leaves";
import { CommentIcon, DocumentIcon, ScissorsIcon } from "@/components/ui/icons";
import { wordColor } from "@/lib/word-color";

export const KIND_COLOR = { comment: "rgb(var(--amber))", edit_idea: "rgb(59 130 246)" } as const;
export const KIND_LABEL = { comment: "Comment", edit_idea: "Editing idea" } as const;

type Kind = "comment" | "edit_idea";
type Suggestion = { key: string; label: string; person?: MentionPerson; role?: RoleId; all?: boolean };

/*
 * Writing a comment or an editing idea (1.50.0, rebuilt: the owner, "the comments UI is pretty bad … the comment box,
 * the small box, everything here needs a rehaul basically, and when tagging someone or something we need to make sure
 * that cotnrast is good and the menu goes down not up").
 *
 *   MentionInput: the box itself. @ suggests people (who's on this video first) and roles; the list opens BELOW the box
 *     (it flips up only when there's no room below, as at the foot of the comments panel), in the app's own colours:
 *     the page under it is white paper with dark words, and the old list took the paper's dark ink onto a dark box.
 *   CommentComposer: the box with its quote, who it will notify, the drawing (editing ideas), Cancel and Send; as a
 *     card by the words, a sheet on phones, the panel's own (a general comment: on the whole document), or editing one.
 *
 * Enter sends, Shift+Enter is a new line, Esc asks first (or closes the list).
 */

/** The text box with @mentions. Grows with what's written (up to about ten lines). */
export function MentionInput({
  kind,
  people,
  roleColors,
  text,
  setText,
  onEnter,
  onEscape,
  placeholder,
  rows = 3,
  autoFocus = true,
  label,
}: {
  kind: Kind;
  people: MentionPerson[];
  roleColors: Record<string, string>;
  text: string;
  setText: (t: string) => void;
  /** Enter (without Shift): send. */
  onEnter: () => void;
  onEscape: () => void;
  placeholder: string;
  rows?: number;
  autoFocus?: boolean;
  label: string;
}) {
  const color = KIND_COLOR[kind];
  const ta = useRef<HTMLTextAreaElement>(null);
  const [q, setQ] = useState<{ at: number; text: string } | null>(null);
  const [hi, setHi] = useState(0);
  // Down unless there's no room for the list below the box.
  const [up, setUp] = useState(false);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!q) return [];
    const s = q.text.toLowerCase();
    const match = (label: string) => !s || label.toLowerCase().startsWith(s) || label.toLowerCase().split(/\s+/).some((w) => w.startsWith(s));
    const ppl = rankPeople(people, kind)
      .filter((p) => match(p.name))
      .slice(0, 6)
      .map((p) => ({ key: p.userId, label: p.name, person: p }));
    const roles = rankRoles(kind)
      .filter((r) => match(ROLE_LABEL[r]))
      .slice(0, s ? 3 : 2)
      .map((r) => ({ key: `role-${r}`, label: ROLE_LABEL[r], role: r }));
    const all = match("all") || match("everyone") ? [{ key: "all", label: "all", all: true }] : [];
    return [...ppl, ...roles, ...(s ? all : [])].slice(0, 8);
  }, [q, people, kind]);
  const listOpen = !!q && suggestions.length > 0;
  const roleColorOf = (r?: RoleId) => (r && roleColors[r]) || "rgb(var(--ink-soft))";

  // Where the list goes: measured as it opens (and as it changes size), against the window and anything around the
  // box that would cut it off (the comments panel's own scroll).
  useLayoutEffect(() => {
    const el = ta.current;
    if (!listOpen || !el) return;
    const r = el.getBoundingClientRect();
    let bottom = window.innerHeight;
    let top = 0;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") {
        const pr = p.getBoundingClientRect();
        bottom = Math.min(bottom, pr.bottom);
        top = Math.max(top, pr.top);
        break;
      }
    }
    const need = Math.min(264, suggestions.length * 48 + 12);
    const below = bottom - r.bottom;
    setUp(below < need && r.top - top > below);
  }, [listOpen, suggestions.length]);

  // Grows with the words (its borders on top of what's written in it).
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + el.offsetHeight - el.clientHeight, 240)}px`;
  }, [text]);

  // Is the caret right after "@something"?
  function check(el: HTMLTextAreaElement) {
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const m = before.match(/(^|\s)@([^\s@]{0,30})$/);
    if (m) {
      setQ({ at: caret - m[2].length - 1, text: m[2] });
      setHi(0);
    } else setQ(null);
  }
  function pick(s: Suggestion) {
    const el = ta.current;
    if (!el || !q) return;
    const caret = el.selectionStart ?? text.length;
    const next = `${text.slice(0, q.at)}@${s.label} ${text.slice(caret)}`;
    setText(next);
    setQ(null);
    const pos = q.at + s.label.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      {listOpen && (
        <Leaves>
          <ul
            role="listbox"
            aria-label="Mention someone"
            className={`absolute left-0 right-0 z-30 max-h-[264px] overflow-y-auto overflow-x-hidden styled-scroll rounded-xl border border-line/20 bg-surface text-ink shadow-[0_18px_44px_-14px_rgb(0_0_0/0.55)] p-1 pop-menu ${
              up ? "bottom-[calc(100%+6px)] origin-bottom" : "top-[calc(100%+6px)] origin-top"
            }`}
          >
            {suggestions.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === hi}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setHi(i)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-2 h-11 text-left text-ink transition-colors ${i === hi ? "bg-amber/12 ring-1 ring-inset ring-amber/40" : "hover:bg-surface-2"}`}
                >
                  {s.person ? (
                    <PersonAvatar name={s.person.name} avatarUrl={s.person.avatarUrl} color={s.person.color} className="w-7 h-7 text-[10.5px] flex-shrink-0" />
                  ) : (
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0" style={{ background: s.all ? "rgb(var(--red))" : roleColorOf(s.role) }}>
                      @
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink truncate">{s.all ? "Everyone" : s.label}</span>
                    <span className="block text-[11.5px] text-ink-soft truncate">
                      {s.person
                        ? s.person.onVideo.length
                          ? `On this video: ${s.person.onVideo.join(", ")}`
                          : s.person.roles.map((r) => ROLE_LABEL[r]).join(", ") || "On the team"
                        : s.all
                          ? "The whole team"
                          : `Everyone who is a ${s.label.toLowerCase()}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Leaves>
      )}
      <textarea
        ref={ta}
        autoFocus={autoFocus}
        value={text}
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          check(e.target);
        }}
        onClick={(e) => check(e.currentTarget)}
        onKeyUp={(e) => ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && check(e.currentTarget)}
        // Clicked away: the list goes (a moment later, so a tap on a name still lands).
        onBlur={() => window.setTimeout(() => setQ(null), 150)}
        onKeyDown={(e) => {
          if (listOpen) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              return setHi((h) => (h + 1) % suggestions.length);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              return setHi((h) => (h - 1 + suggestions.length) % suggestions.length);
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              return pick(suggestions[hi]);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              return setQ(null);
            }
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onEscape();
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEnter();
          }
        }}
        rows={rows}
        maxLength={MAX_COMMENT}
        placeholder={placeholder}
        className="block w-full rounded-xl border border-line/15 bg-paper/50 text-ink placeholder:text-ink-faint px-3 py-2.5 text-[14px] leading-relaxed outline-none focus:ring-2 resize-none styled-scroll"
        style={{ ["--tw-ring-color" as string]: `color-mix(in srgb, ${color} 55%, transparent)` }}
      />
    </div>
  );
}

const targetKey = (t: MentionTarget) => (t.kind === "user" ? t.userId : t.kind === "role" ? t.roleId : "all");

/** Who a comment will notify (as it's written). Changing one: only who's new (`before`: its words until now). */
function Notifies({ text, before, people, roleColors }: { text: string; before?: string; people: MentionPerson[]; roleColors: Record<string, string> }) {
  const catalog = useMemo(() => buildMentionCatalog(people.map((p) => ({ userId: p.userId, name: p.name })), ROLES.map((r) => ({ id: r.id, name: r.name }))), [people]);
  const notified = useMemo(() => {
    const had = new Set(before ? findMentions(before, catalog).map((m) => targetKey(m.target)) : []);
    const seen = new Map<string, MentionTarget>();
    for (const m of findMentions(text, catalog)) if (!had.has(targetKey(m.target))) seen.set(targetKey(m.target), m.target);
    return [...seen.values()];
  }, [text, before, catalog]);
  if (!notified.length) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap text-[11.5px] text-ink-soft">
      <span>{before !== undefined ? "Also notifies" : "Notifies"}</span>
      {notified.map((t) => {
        const c = t.kind === "all" ? "rgb(var(--red))" : t.kind === "role" ? roleColors[t.roleId] ?? "rgb(var(--amber))" : people.find((p) => p.userId === t.userId)?.color ?? "rgb(var(--amber))";
        return (
          <span
            key={targetKey(t)}
            className="rounded-md px-1.5 h-5 inline-flex items-center font-semibold"
            style={{ color: wordColor(c), background: `color-mix(in srgb, ${c} 14%, transparent)` }}
          >
            {t.kind === "all" ? "everyone" : t.label}
          </span>
        );
      })}
    </div>
  );
}

/** The words a comment is on: its own lines, never in added quote marks (a quote that had its own showed both). */
export function QuoteBlock({ quote, color, lines = 3, className = "" }: { quote: string; color: string; lines?: number; className?: string }) {
  return (
    <div
      className={`rounded-lg border-l-[3px] px-2.5 py-1.5 text-[12.5px] leading-snug text-ink-soft whitespace-pre-line break-words ${className}`}
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 8%, transparent)`, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" }}
    >
      {quoteText(quote)}
    </div>
  );
}

/** "Whole document": a general comment's place. */
export function WholeDocTag({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 h-[22px] text-[11.5px] font-semibold" style={{ color: wordColor(color), background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      <DocumentIcon className="w-3.5 h-3.5" />
      On the whole document
    </span>
  );
}

export function KindMark({ kind, className = "w-3.5 h-3.5" }: { kind: Kind; className?: string }) {
  return (
    <span className="inline-flex flex-shrink-0" style={{ color: KIND_COLOR[kind] }} aria-hidden>
      {kind === "edit_idea" ? <ScissorsIcon className={className} /> : <CommentIcon className={className} />}
    </span>
  );
}

export function CommentComposer({
  kind,
  quote,
  people,
  roleColors,
  text,
  setText,
  sketchUrl = null,
  onDraw,
  onRemoveSketch,
  busy,
  onSubmit,
  onCancel,
  variant,
  setKind,
  notifyBefore,
}: {
  kind: Kind;
  /** The words it's on; "" for a general comment (the whole document). */
  quote: string;
  people: MentionPerson[];
  roleColors: Record<string, string>;
  text: string;
  setText: (t: string) => void;
  /** Its drawing (a drawing alone may be sent without words; changing one: it keeps its drawing). */
  sketchUrl?: string | null;
  onDraw?: () => void;
  onRemoveSketch?: () => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  /** popover: by the words; sheet: phones; panel: the comments panel's own (general); edit: changing one. */
  variant: "popover" | "sheet" | "panel" | "edit";
  /** The panel's: Comment or Editing idea. */
  setKind?: (k: Kind) => void;
  /** Changing one: its words until now (who they mention was notified already). */
  notifyBefore?: string;
}) {
  const color = KIND_COLOR[kind];
  const canSend = (!!text.trim() || !!sketchUrl) && !busy;
  const send = () => canSend && onSubmit();
  const label = variant === "edit" ? "Change the words" : kind === "edit_idea" ? "Your editing idea" : "Your comment";
  const placeholder =
    variant === "panel"
      ? kind === "edit_idea"
        ? "An editing idea for the whole video…"
        : "A comment on the whole document…"
      : kind === "edit_idea"
        ? "Your editing idea… (@ to mention)"
        : "Your comment… (@ to mention)";

  const input = (
    <MentionInput
      kind={kind}
      people={people}
      roleColors={roleColors}
      text={text}
      setText={setText}
      onEnter={send}
      onEscape={onCancel}
      placeholder={placeholder}
      rows={variant === "panel" ? 1 : 3}
      autoFocus={variant !== "panel"}
      label={label}
    />
  );

  if (variant === "edit") {
    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        {input}
        <Notifies text={text} before={notifyBefore ?? ""} people={people} roleColors={roleColors} />
        <div className="flex items-center justify-end gap-1.5">
          <span className="mr-auto text-[11px] text-ink-faint">Enter saves · Esc cancels</span>
          <button type="button" onClick={onCancel} className="rounded-lg px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button type="button" disabled={!canSend} onClick={send} className="rounded-lg text-white font-bold px-3.5 h-8 text-[12.5px] disabled:opacity-50" style={{ background: color }}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1" role="radiogroup" aria-label="What it is">
          {(["comment", "edit_idea"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind?.(k)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 h-7 text-[12px] font-semibold transition-colors ${kind === k ? "bg-surface-2 text-ink ring-1 ring-inset ring-line/25" : "text-ink-soft hover:text-ink"}`}
            >
              <KindMark kind={k} />
              {KIND_LABEL[k]}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-ink-faint">@ to mention · Enter sends</span>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">{input}</div>
          <button
            type="button"
            disabled={!canSend}
            onClick={send}
            data-sound="none"
            className="rounded-xl text-white font-bold px-3.5 h-11 text-[13px] disabled:opacity-45 transition-opacity flex-shrink-0"
            style={{ background: color }}
          >
            {busy ? "Adding…" : kind === "edit_idea" ? "Add idea" : "Comment"}
          </button>
        </div>
        <Notifies text={text} people={people} roleColors={roleColors} />
      </div>
    );
  }

  const sheet = variant === "sheet";
  return (
    <div
      className={`text-ink space-y-2.5 ${sheet ? "p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]" : "pop-menu origin-top-left w-[340px] rounded-2xl border border-line/15 bg-surface shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)] p-3"}`}
      style={sheet ? undefined : { boxShadow: `inset 0 3px 0 ${color}, 0 24px 60px -20px rgb(0 0 0 / 0.55)` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <KindMark kind={kind} className="w-4 h-4" />
        <span className="text-[12.5px] font-bold" style={{ color: wordColor(color) }}>
          {KIND_LABEL[kind]}
        </span>
        <span className="ml-auto text-[11px] text-ink-faint">Enter sends · Shift+Enter new line</span>
      </div>
      {quote ? <QuoteBlock quote={quote} color={color} /> : <WholeDocTag color={color} />}
      {input}
      <Notifies text={text} people={people} roleColors={roleColors} />
      {sketchUrl && (
        <div className="relative rounded-lg border border-line/15 bg-white overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sketchUrl} alt="Your sketch" className="w-full max-h-32 object-contain" />
          {/* Fixed colours: they sit on the drawing (white or black paper), whatever the app theme. */}
          <div className="absolute top-1.5 right-1.5 flex gap-1.5">
            <button type="button" onClick={onDraw} className="rounded-md bg-[#14110c] text-white ring-1 ring-white/25 shadow-md px-2.5 h-7 text-[11.5px] font-bold hover:bg-black">
              Edit drawing
            </button>
            <button type="button" onClick={onRemoveSketch} className="rounded-md bg-[#c42b2b] text-white ring-1 ring-white/25 shadow-md px-2.5 h-7 text-[11.5px] font-bold hover:bg-[#a82222]">
              Remove
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        {onDraw && !sketchUrl && (
          <button type="button" onClick={onDraw} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-9 sm:h-8 text-[12.5px] font-semibold text-ink hover:bg-surface-2" style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ color }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 20l1.2-4.4L16.6 4.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.4 18.8Z M14.5 6.3l3.2 3.2" />
            </svg>
            Draw
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className="rounded-lg px-3 h-9 sm:h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Cancel
        </button>
        <button type="button" disabled={!canSend} onClick={send} data-sound="none" className="rounded-lg text-white font-bold px-3.5 h-9 sm:h-8 text-[12.5px] disabled:opacity-50" style={{ background: color }}>
          {busy ? "Adding…" : kind === "edit_idea" ? "Add idea" : "Comment"}
        </button>
      </div>
    </div>
  );
}

/** Comment text with @mentions highlighted (people in their colour, roles in the role's). */
export function MentionText({ text, people, roleColors }: { text: string; people: MentionPerson[]; roleColors: Record<string, string> }) {
  const catalog = useMemo(() => buildMentionCatalog(people.map((p) => ({ userId: p.userId, name: p.name })), ROLES.map((r) => ({ id: r.id, name: r.name }))), [people]);
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (const m of findMentions(text, catalog)) {
    if (m.start > i) parts.push(text.slice(i, m.start));
    const c = m.target.kind === "all" ? "rgb(var(--red))" : m.target.kind === "role" ? roleColors[m.target.roleId] ?? "rgb(var(--amber))" : people.find((p) => p.userId === (m.target as { userId: string }).userId)?.color ?? "rgb(var(--amber))";
    parts.push(
      <span key={m.start} className="rounded px-0.5 font-semibold" style={{ color: wordColor(c), background: `color-mix(in srgb, ${c} 12%, transparent)` }}>
        {text.slice(m.start, m.end)}
      </span>
    );
    i = m.end;
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}
