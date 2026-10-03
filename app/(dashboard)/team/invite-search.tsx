"use client";

import { APP_NAME } from "@/lib/brand";
import { useEffect, useRef, useState } from "react";
import { searchInvitableUsers, type InviteCandidate } from "./search-users-action";
import { inviteExistingUser } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { colorForId, displayName, initialsFor } from "@/lib/avatar";

export function InviteSearch({ teamId }: { teamId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InviteCandidate[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [selected, setSelected] = useState<InviteCandidate | null>(null);
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      searchInvitableUsers(teamId, query)
        .then((r) => {
          setResults(r);
          setHighlighted(0);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, teamId, selected]);

  function pick(candidate: InviteCandidate) {
    setSelected(candidate);
    setResults([]);
    setQuery("");
  }

  function toggleRole(r: RoleId) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlighted]) pick(results[highlighted]);
    } else if (e.key === "Escape") {
      setResults([]);
    }
  }

  async function send() {
    if (!selected) return;
    setSending(true);
    const result = await inviteExistingUser(teamId, selected.id, roles);
    setSending(false);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(`Invite sent to ${displayName(selected.username, selected.fullName, null)}`);
      setSelected(null);
      setRoles([]);
    }
  }

  if (selected) {
    const name = displayName(selected.username, selected.fullName, null);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 overflow-hidden"
            style={{ background: colorForId(selected.id) }}
          >
            {selected.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={selected.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initialsFor(name)
            )}
          </span>
          <span className="text-[13px] font-semibold flex-1">{name}</span>
          <button
            onClick={() => setSelected(null)}
            className="text-[11px] font-semibold text-ink-faint hover:text-red"
          >
            Change
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ROLES.filter((r) => r.id !== "master").map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => toggleRole(r.id)}
              className={`rounded-full px-3 py-1 text-[11.5px] font-semibold border transition-colors ${
                roles.includes(r.id)
                  ? "border-amber bg-amber/10 text-amber"
                  : "border-line/15 text-ink-soft"
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>

        <button
          onClick={send}
          disabled={sending}
          className="rounded-lg bg-amber text-white font-semibold px-4 py-2 text-[13px] disabled:opacity-50 hover:brightness-110 transition-[filter]"
        >
          {sending ? "Sending…" : "Send team invite"}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search by username or email…"
        className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-amber"
      />
      {(results.length > 0 || loading) && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-30 rounded-lg border border-line/10 bg-surface shadow-lg p-1 max-h-64 overflow-y-auto styled-scroll">
          {loading && <div className="px-3 py-3 text-[12px] text-ink-faint">Searching…</div>}
          {!loading &&
            results.map((r, i) => {
              const name = displayName(r.username, r.fullName, null);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pick(r)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                    i === highlighted ? "bg-surface-2" : ""
                  }`}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 overflow-hidden"
                    style={{ background: colorForId(r.id) }}
                  >
                    {r.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async" src={r.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initialsFor(name)
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{name}</span>
                    {r.username && (
                      <span className="block text-[11px] text-ink-faint truncate">@{r.username}</span>
                    )}
                  </span>
                </button>
              );
            })}
        </div>
      )}
      <p className="text-[11px] text-ink-faint mt-1.5">
        Only finds people who already have a {APP_NAME} account. New accounts are created
        separately, by invite.
      </p>
    </div>
  );
}
