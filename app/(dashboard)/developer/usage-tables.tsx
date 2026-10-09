"use client";

import { useMemo, useState } from "react";
import { Ago } from "@/components/ui/ago";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { useLocalFormat } from "@/lib/hooks/use-hydrated";
import type { UsagePerson, UsageTeam } from "./data";
import { fmtBytes, fmtNum } from "./format";

/* The Usage tab's tables: sortable columns, a search for people, all tables on demand. */

type Col<T> = { key: string; label: string; value: (r: T) => number | string; render?: (r: T) => React.ReactNode; num?: boolean; title?: string };

function SortTable<T extends { id: string }>({ rows, cols, initial, empty }: { rows: T[]; cols: Col<T>[]; initial: string; empty: string }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: initial, desc: true });
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key) ?? cols[0];
    return [...rows].sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -d : d;
    });
  }, [rows, cols, sort]);
  if (!rows.length) return <p className="text-[13px] text-ink-soft">{empty}</p>;
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full min-w-[760px] text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {cols.map((c) => {
              const on = sort.key === c.key;
              return (
                <th key={c.key} className={`pb-2 px-1.5 font-bold ${c.num ? "text-right" : ""}`} aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"} title={c.title}>
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : !!c.num }))}
                    className={`inline-flex items-center gap-1 uppercase hover:text-ink ${on ? "text-ink" : ""}`}
                  >
                    {c.label}
                    <span aria-hidden className={on ? "" : "opacity-0"}>
                      {sort.desc ? "↓" : "↑"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-line/10 align-top">
              {cols.map((c) => (
                <td key={c.key} className={`py-2 px-1.5 ${c.num ? "text-right tabular-nums whitespace-nowrap" : ""}`}>
                  {c.render ? c.render(r) : c.value(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const dash = <span className="text-ink-faint">–</span>;

export function TeamsTable({ teams }: { teams: UsageTeam[] }) {
  const format = useLocalFormat();
  const cols: Col<UsageTeam>[] = [
    {
      key: "name",
      label: "Team",
      value: (t) => t.name.toLowerCase(),
      render: (t) => (
        <span className="block min-w-[9rem]">
          <span className="block font-semibold text-[13px]">{t.name}</span>
          <span className="block text-[11.5px] text-ink-faint">since {format(t.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span>
        </span>
      ),
    },
    { key: "members", label: "People", value: (t) => t.members, num: true },
    { key: "shorts", label: "Shorts", value: (t) => t.shorts, num: true, render: (t) => fmtNum(t.shorts) },
    { key: "longs", label: "Long", value: (t) => t.longs, num: true, render: (t) => fmtNum(t.longs) },
    { key: "videoFiles", label: "Videos", value: (t) => t.videoBytes, num: true, title: "Short video files kept (not cleaned up yet)", render: (t) => (t.videoFiles ? <>{fmtNum(t.videoFiles)} · {fmtBytes(t.videoBytes)}</> : dash) },
    { key: "storage", label: "Files", value: (t) => t.storageBytes, num: true, title: "Everything stored for the team", render: (t) => (t.files ? <><b>{fmtBytes(t.storageBytes)}</b> · {fmtNum(t.files)}</> : dash) },
    { key: "db", label: "Data ≈", value: (t) => t.dbBytes, num: true, title: "About how much of the database is this team's (from its rows)", render: (t) => (t.dbBytes ? fmtBytes(t.dbBytes) : dash) },
    { key: "rows", label: "Rows", value: (t) => t.rows, num: true, render: (t) => fmtNum(t.rows) },
    { key: "posts", label: "Posted", value: (t) => t.postsPublished, num: true, title: "Posts published through the app", render: (t) => fmtNum(t.postsPublished) },
    { key: "active", label: "Last task", value: (t) => (t.lastActivity ? Date.parse(t.lastActivity) : 0), num: true, render: (t) => (t.lastActivity ? <Ago iso={t.lastActivity} /> : dash) },
  ];
  return <SortTable rows={teams} cols={cols} initial="storage" empty="No teams yet." />;
}

export function PeopleTable({ people }: { people: UsagePerson[] }) {
  const format = useLocalFormat();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? people.filter((p) => [p.name, p.username, p.email, ...p.teams].some((x) => x && x.toLowerCase().includes(s))) : people;
  }, [people, q]);
  const cols: Col<UsagePerson>[] = [
    {
      key: "name",
      label: "Person",
      value: (p) => (p.name ?? p.email ?? "").toLowerCase(),
      render: (p) => (
        <span className="block min-w-[11rem]">
          <span className="block font-semibold text-[13px]">{p.name ?? p.username ?? "No name yet"}</span>
          <span className="block text-[11.5px] text-ink-soft break-all">{p.email}</span>
        </span>
      ),
    },
    { key: "teams", label: "Teams", value: (p) => p.teams.join(", ").toLowerCase(), render: (p) => (p.teams.length ? <span className="block min-w-[7rem]">{p.teams.join(", ")}</span> : <span className="text-ink-faint">None</span>) },
    { key: "signin", label: "Signed in", value: (p) => (p.lastSignIn ? Date.parse(p.lastSignIn) : 0), num: true, render: (p) => (p.lastSignIn ? <Ago iso={p.lastSignIn} /> : <span className="text-ink-faint">Never</span>) },
    { key: "videos", label: "Videos", value: (p) => p.videoBytes, num: true, title: "Short video files they uploaded that are still kept", render: (p) => (p.videos ? <>{fmtNum(p.videos)} · {fmtBytes(p.videoBytes)}</> : dash) },
    { key: "files", label: "Other files", value: (p) => p.fileBytes, num: true, title: "Pictures, thumbnails, sketches, report files…", render: (p) => (p.files ? <>{fmtNum(p.files)} · {fmtBytes(p.fileBytes)}</> : dash) },
    { key: "tasks", label: "Tasks done", value: (p) => p.tasksDone, num: true, render: (p) => fmtNum(p.tasksDone) },
    { key: "joined", label: "Joined", value: (p) => Date.parse(p.createdAt), num: true, render: (p) => format(p.createdAt, { month: "short", day: "numeric", year: "numeric" }) },
  ];
  return (
    <div className="space-y-3">
      <label className="relative block max-w-sm">
        <span className="sr-only">Search people</span>
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Search name, email or team"
          className="w-full h-9 rounded-lg border border-line/15 bg-surface pl-8 pr-8 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-amber [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear the search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-ink-soft hover:text-ink">
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </label>
      <SortTable rows={shown} cols={cols} initial="signin" empty={q ? "Nobody matches." : "No accounts yet."} />
    </div>
  );
}

export function TablesList({ tables, total }: { tables: { schema: string; name: string; bytes: number; rows: number; exact: boolean }[]; total: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? tables : tables.slice(0, 12);
  const max = Math.max(1, ...tables.map((t) => t.bytes));
  return (
    <div>
      <ul className="divide-y divide-line/10">
        {shown.map((t) => (
          <li key={`${t.schema}.${t.name}`} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center">
            <span className="min-w-0 text-[13px] truncate">
              <span className="text-ink-faint">{t.schema === "public" ? "" : `${t.schema}.`}</span>
              <span className="font-semibold">{t.name}</span>
            </span>
            <span className="text-[12.5px] tabular-nums text-ink-soft whitespace-nowrap">
              {t.exact ? "" : "≈"}
              {fmtNum(t.rows)} rows · <b className="text-ink">{fmtBytes(t.bytes)}</b>
              <span className="text-ink-faint inline-block w-11 text-right">{total ? `${Math.max(0.1, (t.bytes / total) * 100).toFixed(t.bytes / total >= 0.1 ? 0 : 1)}%` : ""}</span>
            </span>
            <span className="col-span-2 mt-1 h-1 rounded-full bg-line/[0.07] overflow-hidden" aria-hidden>
              <span className="block h-full rounded-full bg-amber/70" style={{ width: `${Math.max(1, (t.bytes / max) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {tables.length > 12 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-[12.5px] font-semibold text-amber hover:underline">
          {all ? "Show the biggest 12" : `Show all ${tables.length}`}
        </button>
      )}
    </div>
  );
}
