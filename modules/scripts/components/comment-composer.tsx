"use client";

import { useMemo, useRef, useState } from "react";
import { buildMentionCatalog, findMentions, type MentionTarget } from "@/lib/mentions";
import { ROLES, type RoleId } from "@/lib/permissions/roles";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { rankPeople, rankRoles, ROLE_LABEL, type MentionPerson } from "../lib/mention-people";

export const KIND_COLOR = { comment: "rgb(var(--amber))", edit_idea: "rgb(59 130 246)" } as const;

type Suggestion = { key: string; label: string; person?: MentionPerson; role?: RoleId; all?: boolean };

/**
 * Writing a comment or an editing idea: @mentions with suggestions picked
 * for the context (editing ideas suggest editors and schedulers first),
 * a "will notify" line, and for editing ideas a Draw button with the
 * sketch's preview. Enter adds, Shift+Enter is a new line, Esc asks first.
 */
export function CommentComposer({
  kind,
  quote,
  people,
  roleColors,
  text,
  setText,
  sketchUrl,
  onDraw,
  onRemoveSketch,
  busy,
  onSubmit,
  onCancel,
  sheet,
}: {
  kind: "comment" | "edit_idea";
  quote: string;
  people: MentionPerson[];
  roleColors: Record<string, string>;
  text: string;
  setText: (t: string) => void;
  sketchUrl: string | null;
  onDraw?: () => void;
  onRemoveSketch?: () => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  /** Phones: a bottom sheet instead of a small popover. */
  sheet: boolean;
}) {
  const color = KIND_COLOR[kind];
  const ta = useRef<HTMLTextAreaElement>(null);
  const [q, setQ] = useState<{ at: number; text: string } | null>(null);
  const [hi, setHi] = useState(0);

  const catalog = useMemo(() => buildMentionCatalog(people.map((p) => ({ userId: p.userId, name: p.name })), ROLES.map((r) => ({ id: r.id, name: r.name }))), [people]);
  const notified = useMemo(() => {
    const seen = new Map<string, MentionTarget>();
    for (const m of findMentions(text, catalog)) seen.set(m.target.kind === "user" ? m.target.userId : m.target.kind === "role" ? m.target.roleId : "all", m.target);
    return [...seen.values()];
  }, [text, catalog]);

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

  const canSend = !!text.trim() || !!sketchUrl;
  const box = (
    <div
      className={`space-y-2 ${sheet ? "p-3.5 pb-[calc(env(safe-area-inset-bottom)+0.875rem)]" : "w-[300px] rounded-xl border bg-surface shadow-2xl p-2.5"} animate-[modalin_.14s_var(--ease-out)]`}
      style={sheet ? undefined : { borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 6%, rgb(var(--surface)))` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-[3px]" style={{ background: color }} />
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
          {kind === "edit_idea" ? "Editing idea" : "Comment"}
        </span>
        <span className="text-[11px] text-ink-faint">· Enter to add · @ to mention</span>
      </div>
      <div className="text-[11.5px] text-ink-soft truncate border-l-2 pl-2" style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}>
        “{quote}”
      </div>
      <div className="relative">
        {q && suggestions.length > 0 && (
          <ul role="listbox" aria-label="Mention someone" className="absolute left-0 right-0 bottom-[calc(100%+6px)] z-10 max-h-60 overflow-y-auto overflow-x-hidden rounded-xl border border-line/15 bg-surface shadow-2xl p-1 animate-[modalin_.1s_var(--ease-out)]">
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
                  className={`w-full flex items-center gap-2 rounded-lg px-2 h-10 text-left ${i === hi ? "bg-surface-2" : ""}`}
                >
                  {s.person ? (
                    <PersonAvatar name={s.person.name} avatarUrl={s.person.avatarUrl} color={s.person.color} className="w-6 h-6 text-[10px]" />
                  ) : (
                    <span className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white" style={{ background: s.all ? "rgb(var(--red))" : roleColors[s.role ?? ""] ?? "rgb(var(--ink-faint))" }}>
                      @
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate">{s.all ? "Everyone" : s.label}</span>
                    <span className="block text-[11px] text-ink-faint truncate">
                      {s.person
                        ? s.person.onVideo.length
                          ? `On this video: ${s.person.onVideo.join(", ")}`
                          : s.person.roles.map((r) => ROLE_LABEL[r]).join(", ")
                        : s.all
                          ? "The whole team"
                          : `Everyone who is a ${s.label.toLowerCase()}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={ta}
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            check(e.target);
          }}
          onClick={(e) => check(e.currentTarget)}
          onKeyUp={(e) => ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && check(e.currentTarget)}
          onKeyDown={(e) => {
            if (q && suggestions.length) {
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
              onCancel();
            }
            if (e.key === "Enter" && !e.shiftKey && canSend && !busy) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={sheet ? 3 : 3}
          maxLength={2000}
          placeholder={kind === "edit_idea" ? "Your editing idea… (@ to mention)" : "Your comment… (@ to mention)"}
          className="w-full rounded-lg border border-line/15 bg-surface px-2.5 py-2 text-[14px] sm:text-[13px] text-ink outline-none focus:ring-2 focus:ring-amber resize-none"
        />
      </div>
      {notified.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap text-[11px] text-ink-soft">
          <span>Notifies</span>
          {notified.map((t) => (
            <span
              key={t.kind === "user" ? t.userId : t.kind === "role" ? t.roleId : "all"}
              className="rounded-md px-1.5 h-5 inline-flex items-center font-semibold"
              style={{ background: `color-mix(in srgb, ${t.kind === "all" ? "rgb(var(--red))" : t.kind === "role" ? roleColors[t.roleId] ?? "rgb(var(--amber))" : "rgb(var(--amber))"} 14%, transparent)` }}
            >
              {t.kind === "all" ? "everyone" : t.label}
            </span>
          ))}
        </div>
      )}
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
          <button type="button" onClick={onDraw} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-9 sm:h-8 text-[12.5px] font-semibold hover:bg-surface-2" style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, color }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 20l1.2-4.4L16.6 4.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.4 18.8Z M14.5 6.3l3.2 3.2" />
            </svg>
            Draw
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className="rounded-lg px-3 h-9 sm:h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
          Cancel
        </button>
        <button type="button" disabled={!canSend || busy} onClick={onSubmit} data-sound="none" className="rounded-lg text-white font-bold px-3.5 h-9 sm:h-8 text-[12.5px] disabled:opacity-50" style={{ background: color }}>
          {busy ? "Adding…" : kind === "edit_idea" ? "Add idea" : "Comment"}
        </button>
      </div>
    </div>
  );
  return box;
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
      <span key={m.start} className="rounded px-0.5 font-semibold" style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}>
        {text.slice(m.start, m.end)}
      </span>
    );
    i = m.end;
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}
