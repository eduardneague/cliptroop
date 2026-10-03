"use client";

import { useEffect, useRef, useState } from "react";
import { findMentions, type MentionTarget } from "@/lib/mentions";
import { colorForId } from "@/lib/avatar";
import type { RoleId } from "@/lib/permissions/roles";
import { useToast } from "./toast-provider";
import { ArrowRightIcon, CloseIcon, ChevronRightIcon, SmileIcon, PaperclipIcon, GifIcon } from "./icons";
import { sounds } from "@/lib/sounds";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const EMOJI = [
  "😀","😂","😅","😊","😉","😍","🤔","😎","😢","😭","😡","🥳","👍","👎","👏","🙌",
  "🙏","💪","🔥","✨","🎉","✅","❌","⚠️","❤️","💯","👀","🤝","🚀","📌","📝","🎬",
  "🎥","📷","🖥️","💡","⏰","📅","🗓️","💰","🏆","👋","😴","🤯","🫡","😬","🙃",
];

type MenuItem = { type: "target"; target: MentionTarget } | { type: "rolesGroup" };
type GifResult = { id: string; preview: string; full: string };

export function MentionInput({
  catalog,
  roleColors,
  placeholder,
  onSubmit,
}: {
  catalog: MentionTarget[];
  roleColors: Record<RoleId, string>;
  placeholder: string;
  onSubmit: (text: string, files: File[], gifUrls?: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [rolesExpanded, setRolesExpanded] = useState(false);
  const [menuView, setMenuView] = useState<"closed" | "menu" | "emoji" | "gif">("closed");
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (menuView !== "gif") return;
    setGifLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/giphy/search?q=${encodeURIComponent(gifQuery)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            toast.error(data.error);
            setGifResults([]);
          } else {
            setGifResults(data.gifs ?? []);
          }
        })
        .catch(() => toast.error("Couldn't load GIFs."))
        .finally(() => setGifLoading(false));
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gifQuery, menuView]);

  function selectGif(gif: GifResult) {
    setMenuView("closed");
    setGifQuery("");
    onSubmit("", [], [gif.full]);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuView("closed");
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function targetColor(t: MentionTarget) {
    if (t.kind === "all") return "rgb(var(--red))";
    if (t.kind === "role") return roleColors[t.roleId];
    return colorForId(t.userId);
  }
  function targetLabel(t: MentionTarget) {
    return t.kind === "all" ? "everyone" : t.label;
  }

  // --- Caret helpers for the contentEditable box -----------------------
  // We track cursor position as a plain character offset into the box's
  // text content, so it survives us rebuilding the colored spans.

  function getCaretOffset(el: HTMLElement): number {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.getRangeAt(0).endContainer)) {
      return el.textContent?.length ?? 0;
    }
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }

  function setCaretOffset(el: HTMLElement, offset: number) {
    const range = document.createRange();
    const sel = window.getSelection();
    let remaining = offset;
    let placed = false;
    function walk(n: Node): boolean {
      if (n.nodeType === Node.TEXT_NODE) {
        const len = (n as Text).length;
        if (remaining <= len) {
          range.setStart(n, Math.max(0, remaining));
          placed = true;
          return true;
        }
        remaining -= len;
        return false;
      }
      for (let i = 0; i < n.childNodes.length; i++) {
        if (walk(n.childNodes[i])) return true;
      }
      return false;
    }
    walk(el);
    if (!placed) {
      range.selectNodeContents(el);
      range.collapse(false);
    } else {
      range.collapse(true);
    }
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // Rebuilds the box's actual DOM content: plain text nodes, with
  // matched @mentions wrapped in colored spans. This element is never
  // touched by React's own rendering — it's the single source of truth
  // for what's on screen, so there's nothing else it can fall out of
  // sync with.
  function renderColored(el: HTMLElement, text: string) {
    el.innerHTML = "";
    const matches = findMentions(text, catalog);
    let cursor = 0;
    matches.forEach((m) => {
      if (m.start > cursor) el.appendChild(document.createTextNode(text.slice(cursor, m.start)));
      const span = document.createElement("span");
      span.textContent = "@" + (m.target.kind === "all" ? "everyone" : m.target.label);
      span.style.color = targetColor(m.target);
      span.style.fontWeight = "600";
      el.appendChild(span);
      cursor = m.end;
    });
    if (cursor < text.length) el.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function setTextAndCaret(text: string, caret: number) {
    const el = editableRef.current;
    if (!el) return;
    renderColored(el, text);
    setCaretOffset(el, caret);
    setValue(text);
  }

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const text = el.textContent || "";
    const caret = getCaretOffset(el);
    renderColored(el, text);
    setCaretOffset(el, caret);
    setValue(text);
    updateQueryFromCursor(text, caret);
  }

  // --- Mention matching / menu -----------------------------------------

  const peopleMatches =
    query === null
      ? []
      : catalog
          .filter((t) => t.kind === "user" && targetLabel(t).toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6);

  const allRoleTargets = catalog.filter((t) => t.kind !== "user");
  const queriedRoleTargets =
    query === null
      ? []
      : query.length === 0
      ? allRoleTargets
      : allRoleTargets.filter((t) => targetLabel(t).toLowerCase().includes(query.toLowerCase()));

  // People first, always. Roles are collapsed into a single "Roles" row
  // at the bottom unless you've expanded it (by selecting that row) —
  // so an empty "@" doesn't dump all seven roles in your face.
  const items: MenuItem[] =
    query === null
      ? []
      : [
          ...peopleMatches.map((t): MenuItem => ({ type: "target", target: t })),
          ...(rolesExpanded
            ? queriedRoleTargets.map((t): MenuItem => ({ type: "target", target: t }))
            : queriedRoleTargets.length > 0
            ? [{ type: "rolesGroup" } as MenuItem]
            : []),
        ];

  function updateQueryFromCursor(v: string, cursor: number) {
    const upToCursor = v.slice(0, cursor);
    const atIndex = upToCursor.lastIndexOf("@");
    if (atIndex !== -1 && !/\s/.test(upToCursor.slice(atIndex + 1))) {
      setQuery(upToCursor.slice(atIndex + 1));
      setHighlighted(0);
    } else {
      setQuery(null);
      setRolesExpanded(false);
    }
  }

  function insertAtCursor(text: string) {
    const el = editableRef.current;
    if (!el) return;
    const caret = getCaretOffset(el);
    const next = value.slice(0, caret) + text + value.slice(caret);
    setTextAndCaret(next, caret + text.length);
    el.focus();
  }

  function selectTarget(t: MentionTarget) {
    const el = editableRef.current;
    if (!el) return;
    const label = targetLabel(t);
    const caret = getCaretOffset(el);
    const upToCursor = value.slice(0, caret);
    const atIndex = upToCursor.lastIndexOf("@");
    if (atIndex === -1) return;
    const before = value.slice(0, atIndex);
    const after = value.slice(caret);
    const inserted = `@${label} `;
    setTextAndCaret(`${before}${inserted}${after}`, before.length + inserted.length);
    setQuery(null);
    setRolesExpanded(false);
    el.focus();
  }

  function expandRoles() {
    setRolesExpanded(true);
    setHighlighted(peopleMatches.length);
    editableRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (query !== null && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, items.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = items[highlighted];
        if (!item) return;
        if (item.type === "rolesGroup") expandRoles();
        else selectTarget(item.target);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery(null);
        setRolesExpanded(false);
        return;
      }
    }
    if (e.key === "Enter") {
      // A single-line composer — Enter always sends, never a newline.
      e.preventDefault();
      submitMessage();
    }
  }

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const accepted: File[] = [];
    Array.from(list).forEach((f) => {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name} is over 25MB. Skipped.`);
        return;
      }
      accepted.push(f);
    });
    setFiles((cur) => [...cur, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(i: number) {
    setFiles((cur) => cur.filter((_, idx) => idx !== i));
  }

  function submitMessage() {
    if (!value.trim() && files.length === 0) return;
    onSubmit(value.trim(), files);
    sounds.send();
    setValue("");
    setFiles([]);
    setQuery(null);
    setRolesExpanded(false);
    if (editableRef.current) editableRef.current.innerHTML = "";
  }

  return (
    <div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 rounded-full border border-line/15 bg-surface-2 pl-2 pr-1.5 py-1 text-[11px] font-medium"
            >
              {f.name.length > 20 ? `${f.name.slice(0, 17)}…` : f.name}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-ink-faint hover:text-red"
                aria-label={`Remove ${f.name}`}
              >
                <CloseIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative flex items-center gap-1.5">
        {query !== null && items.length > 0 && (
          <div className="absolute bottom-[calc(100%+6px)] left-0 w-64 max-h-64 overflow-y-auto overflow-x-hidden styled-scroll rounded-lg border border-line/10 bg-surface shadow-lg z-30 p-1">
            {items.map((item, i) => {
              const active = i === highlighted;
              if (item.type === "rolesGroup") {
                return (
                  <button
                    key="roles-group"
                    type="button"
                    onClick={expandRoles}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-left font-bold transition-colors ${
                      active ? "bg-surface-2" : ""
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-ink-faint flex-shrink-0" />
                    Roles
                    <span className="text-ink-faint text-[10.5px] font-normal ml-auto inline-flex items-center gap-0.5">Enter to expand <ChevronRightIcon className="w-3 h-3" /></span>
                  </button>
                );
              }
              const t = item.target;
              const color = targetColor(t);
              const showRolesHeader = rolesExpanded && i === peopleMatches.length;
              return (
                <div key={i}>
                  {showRolesHeader && (
                    <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                      Roles
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => selectTarget(t)}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-left transition-colors ${
                      active ? "bg-surface-2" : ""
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span style={{ color }} className="font-semibold">
                      @{targetLabel(t)}
                    </span>
                    {t.kind === "role" && (
                      <span className="text-ink-faint text-[10.5px] ml-auto">role</span>
                    )}
                    {t.kind === "all" && (
                      <span className="text-ink-faint text-[10.5px] ml-auto">everyone</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onClick={() => {
            const el = editableRef.current;
            if (el) updateQueryFromCursor(value, getCaretOffset(el));
          }}
          data-placeholder={placeholder}
          className="flex-1 min-w-0 rounded-lg border border-line/15 bg-surface-2 px-2.5 py-1.5 text-[12.5px] leading-normal outline-none focus:ring-2 focus:ring-amber whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-ink-faint"
        />

        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuView((v) => (v === "closed" ? "menu" : "closed"))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] font-bold text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
            aria-label="Add emoji, file, or GIF"
            title="Add"
          >
            +
          </button>

          {menuView === "menu" && (
            <div className="absolute bottom-[calc(100%+6px)] right-0 z-30 w-44 rounded-lg border border-line/10 bg-surface shadow-lg p-1 animate-[modalin_.12s_ease]">
              <button
                type="button"
                onClick={() => setMenuView("emoji")}
                className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium hover:bg-surface-2"
              >
                <SmileIcon className="w-4 h-4 text-ink-soft" /> Emoji
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuView("closed");
                  fileInputRef.current?.click();
                }}
                className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium hover:bg-surface-2"
              >
                <PaperclipIcon className="w-4 h-4 text-ink-soft" /> Attach file
                <span className="text-ink-faint text-[10.5px] ml-auto">≤25MB</span>
              </button>
              <button
                type="button"
                onClick={() => setMenuView("gif")}
                className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium hover:bg-surface-2"
              >
                <GifIcon className="w-4 h-4 text-ink-soft" /> GIF
              </button>
            </div>
          )}

          {menuView === "gif" && (
            <div className="absolute bottom-[calc(100%+6px)] right-0 z-30 w-72 rounded-lg border border-line/10 bg-surface shadow-lg p-2 animate-[modalin_.12s_ease]">
              <input
                autoFocus
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                placeholder="Search GIFs…"
                className="w-full rounded-md border border-line/15 bg-surface-2 px-2.5 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-amber mb-2"
              />
              <div className="max-h-64 overflow-y-auto overflow-x-hidden styled-scroll grid grid-cols-3 gap-1.5">
                {gifLoading && (
                  <div className="col-span-3 text-center text-[11px] text-ink-faint py-6">Loading…</div>
                )}
                {!gifLoading && gifResults.length === 0 && (
                  <div className="col-span-3 text-center text-[11px] text-ink-faint py-6">No GIFs found.</div>
                )}
                {!gifLoading &&
                  gifResults.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => selectGif(g)}
                      className="rounded-md overflow-hidden border border-line/10 hover:border-amber transition-colors aspect-square"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img loading="lazy" decoding="async" src={g.preview} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
              </div>
            </div>
          )}

          {menuView === "emoji" && (
            <div className="absolute bottom-[calc(100%+6px)] right-0 z-30 w-64 max-h-52 overflow-y-auto overflow-x-hidden styled-scroll rounded-lg border border-line/10 bg-surface shadow-lg p-2 grid grid-cols-8 gap-0.5 animate-[modalin_.12s_ease]">
              {EMOJI.map((e, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    insertAtCursor(e);
                    setMenuView("closed");
                  }}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-[16px] hover:bg-surface-2"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={submitMessage}
          aria-label="Send"
          className="w-8 h-8 rounded-lg bg-amber text-white flex items-center justify-center flex-shrink-0 hover:brightness-110 transition-[filter]"
        >
          <ArrowRightIcon className="w-4 h-4" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}
