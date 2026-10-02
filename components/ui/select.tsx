"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "./icons";

export type SelectOption = {
  value: string;
  label: string;
  /** Small grey text under / beside the label. */
  hint?: string;
  /** Leading visual (avatar, icon, color dot). */
  icon?: React.ReactNode;
  /** Consecutive options with the same group get one header. */
  group?: string;
  disabled?: boolean;
};

/**
 * The app's dropdown. Replaces native <select> everywhere so every menu
 * looks the same and works the same:
 *   ↑ ↓ move · Home/End jump · Enter/Space pick · Esc close · Tab leaves
 *   typing jumps to a match (or filters, when `searchable`)
 * Renders in a portal (never clipped by a table or card), opens upward
 * when there's no room below, and follows its button on scroll/resize.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyOption,
  disabled,
  searchable,
  ariaLabel,
  variant = "field",
  renderValue,
  className = "",
  menuMinWidth = 220,
  fullWidth = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Adds a first option meaning "none" (value null), e.g. "No editor yet". */
  emptyOption?: string;
  disabled?: boolean;
  /** Show a filter box (defaults to on for long lists). */
  searchable?: boolean;
  ariaLabel?: string;
  /** "field" = form input · "inline" = quiet, for table cells · "pill" = small dashed "+ Add" chip */
  variant?: "field" | "inline" | "pill";
  renderValue?: (option: SelectOption | null) => React.ReactNode;
  className?: string;
  menuMinWidth?: number;
  /** Stretch a compact trigger to fill its container (e.g. a table cell). */
  fullWidth?: boolean;
}) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ text: "", at: 0 });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; maxH: number }>({
    left: 0,
    top: 0,
    width: 0,
    up: false,
    maxH: 320,
  });

  const allOptions: SelectOption[] = useMemo(
    () => (emptyOption ? [{ value: "__none__", label: emptyOption }, ...options] : options),
    [emptyOption, options]
  );
  const useSearch = searchable ?? options.length > 12;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!useSearch || !q) return allOptions;
    return allOptions.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  }, [allOptions, query, useSearch]);

  const selectedKey = value ?? (emptyOption ? "__none__" : null);
  const selected = allOptions.find((o) => o.value === selectedKey) ?? null;

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, menuMinWidth);
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    const maxH = Math.max(160, Math.min(360, (up ? above : below) - 8));
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, width, up, maxH });
  }, [menuMinWidth]);

  function openMenu() {
    if (disabled) return;
    place();
    setQuery("");
    const i = allOptions.findIndex((o) => o.value === selectedKey);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }

  function close(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function pick(o: SelectOption | undefined) {
    if (!o || o.disabled) return;
    close();
    onChange(o.value === "__none__" ? null : o.value);
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown);
    // Focus the filter box, or the list itself so keys work immediately.
    requestAnimationFrame(() => (useSearch ? searchRef.current : listRef.current)?.focus());
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, useSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the active option in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    if (active >= visible.length) setActive(Math.max(0, visible.length - 1));
  }, [visible.length, active]);

  function step(from: number, dir: 1 | -1) {
    if (visible.length === 0) return 0;
    let i = from;
    for (let n = 0; n < visible.length; n++) {
      i = (i + dir + visible.length) % visible.length;
      if (!visible[i].disabled) return i;
    }
    return from;
  }

  function onMenuKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => step(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => step(i, -1));
        break;
      case "Home":
        if (useSearch && e.target === searchRef.current) return;
        e.preventDefault();
        setActive(step(-1, 1));
        break;
      case "End":
        if (useSearch && e.target === searchRef.current) return;
        e.preventDefault();
        setActive(step(visible.length, -1));
        break;
      case "Enter":
        e.preventDefault();
        pick(visible[active]);
        break;
      case " ":
        if (useSearch && e.target === searchRef.current) return;
        e.preventDefault();
        pick(visible[active]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        // Type-ahead when there's no filter box.
        if (!useSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const now = Date.now();
          const t = typeahead.current;
          t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
          t.at = now;
          const hit = visible.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.text));
          if (hit >= 0) setActive(hit);
        }
    }
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openMenu();
    }
  }

  const triggerCls =
    variant === "pill"
      ? `inline-flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:opacity-60 ${
          open ? "border-amber text-ink" : "border-line/30 hover:border-line/50"
        } ${className}`
      : variant === "inline"
      ? `group inline-flex items-center gap-1.5 max-w-full ${fullWidth ? "w-full" : ""} rounded-md -mx-1.5 px-1.5 py-1 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:opacity-60 disabled:hover:bg-transparent ${className}`
      : `w-full min-w-0 inline-flex items-center gap-2 rounded-lg border bg-surface px-3 h-10 text-[14px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:opacity-60 ${
          open ? "border-amber ring-2 ring-amber/40" : "border-line/15 hover:border-line/30"
        } ${className}`;

  // Group headers render before the first option of each group.
  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={triggerCls}
      >
        {/* Only full-width fields stretch the label; compact triggers size to it. */}
        <span className={`${variant === "field" || fullWidth ? "flex-1" : ""} min-w-0 flex items-center gap-2 truncate`}>
          {renderValue ? (
            renderValue(selected && selected.value !== "__none__" ? selected : null)
          ) : selected ? (
            <>
              {selected.icon}
              <span className={`truncate ${selected.value === "__none__" ? "text-ink-soft" : ""}`}>{selected.label}</span>
            </>
          ) : (
            <span className="text-ink-soft truncate">{placeholder}</span>
          )}
        </span>
        <ChevronDownIcon
          className={`${variant === "pill" ? "w-3.5 h-3.5" : "w-4 h-4"} flex-shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""} ${
            variant === "inline" ? "opacity-70 group-hover:opacity-100" : ""
          }`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            onKeyDown={onMenuKey}
            style={{
              left: pos.left,
              width: pos.width,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
            className="fixed z-[130] rounded-xl border border-line/15 bg-surface shadow-2xl overflow-hidden animate-[modalin_.12s_ease]"
          >
            {useSearch && (
              <div className="flex items-center gap-2 px-3 h-10 border-b border-line/10">
                <SearchIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder="Type to filter…"
                  className="flex-1 min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint"
                  aria-controls={listId}
                  aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
                />
              </div>
            )}
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
              className="overflow-y-auto overscroll-contain styled-scroll p-1 outline-none"
              style={{ maxHeight: pos.maxH - (useSearch ? 40 : 0) }}
            >
              {visible.length === 0 && <p className="px-3 py-3 text-[13px] text-ink-soft">No matches</p>}
              {visible.map((o, i) => {
                const header = o.group && o.group !== lastGroup ? o.group : null;
                lastGroup = o.group;
                const isSel = o.value === selectedKey;
                const isActive = i === active;
                return (
                  <div key={o.value}>
                    {header && (
                      <div className="px-2.5 pt-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-soft">
                        {header}
                      </div>
                    )}
                    <div
                      id={`${listId}-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={isSel}
                      aria-disabled={o.disabled || undefined}
                      onMouseMove={() => !o.disabled && active !== i && setActive(i)}
                      onClick={() => pick(o)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] cursor-pointer select-none ${
                        o.disabled ? "opacity-45 cursor-not-allowed" : isActive ? "bg-surface-2" : ""
                      } ${o.value === "__none__" ? "text-ink-soft" : "text-ink"}`}
                    >
                      {o.icon}
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{o.label}</span>
                        {o.hint && <span className="block text-[11.5px] text-ink-soft truncate">{o.hint}</span>}
                      </span>
                      {isSel && <CheckIcon className="w-4 h-4 text-amber flex-shrink-0" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
