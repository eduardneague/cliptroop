"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mascot } from "@/components/ui/mascot";
import Link from "next/link";
import { PlusIcon, SettingsIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { LAYOUTS, LayoutSwitch, useStoredView } from "@/components/ui/table-bits";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { archiveProjection, deleteProjection, loadProjectionsBoard } from "@/app/(dashboard)/objectives/projection-actions";
import type { ProjectionView, ProjectionsBoard } from "../lib/types";
import { ProjectionCard } from "./projection-card";
import { ProjectionTable } from "./projection-table";
import { ProjectionDetail } from "./projection-detail";
import { CompareDialog } from "./compare-dialog";
import { ProjectionEditor, TEMPLATES, type EditorStart } from "./projection-editor";
import { fmtDay, ProjStatusPill } from "./parts";

/*
 * Objectives → Projections: the team's long-term targets, each with its
 * value now, how far it's come, the pace and where it's heading, and a
 * Compare of the channel then and now. A table first (1.18.0; one row each,
 * columns that sort) or the cards with their charts. Masters set, change and
 * archive them. ?p=<id> opens one (where notifications lead).
 */

type Tab = "active" | "reached" | "ended" | "archived";
const TAB_LABEL: Record<Tab, string> = { active: "Running", reached: "Reached", ended: "Ended", archived: "Archived" };
const tabOf = (p: ProjectionView): Tab => (p.archived ? "archived" : p.a.status === "done" || p.a.status === "missed" ? "ended" : p.a.status === "reached" ? "reached" : "active");

// Running ones that need a push first, then the nearest deadline.
const NEED: Record<string, number> = { behind: 0, new: 1, waiting: 1, on_track: 2, ahead: 3, reached: 4, done: 5, missed: 5 };
const byNeed = (a: ProjectionView, b: ProjectionView) => (NEED[a.a.status] ?? 2) - (NEED[b.a.status] ?? 2) || a.deadline.localeCompare(b.deadline);

export function ProjectionsView({ initial, canEdit, openId, tabs }: { initial: ProjectionsBoard; canEdit: boolean; openId: string | null; tabs?: React.ReactNode }) {
  const [board, setBoard] = useState(initial);
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [layout, setLayout] = useStoredView("vp-projections-layout", LAYOUTS, "table");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; editing: ProjectionView | null; start: EditorStart | null }>({ open: false, editing: null, start: null });
  useEffect(() => setBoard(initial), [initial]);
  // A link to one (?p=) opens it once: the page refreshing after a save
  // doesn't open it again over whatever is open now.
  const openedFromLink = useRef<string | null>(null);
  useEffect(() => {
    if (!openId || openedFromLink.current === openId) return;
    openedFromLink.current = openId;
    setDetailId(openId);
    const p = initial.projections.find((x) => x.id === openId);
    if (p) setTab(tabOf(p));
  }, [openId, initial.projections]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(
    (ms = 0) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const r = await loadProjectionsBoard(board.teamId);
        if (r.error === undefined) setBoard(r.board);
      }, ms);
    },
    [board.teamId]
  );
  // Live: a master's change shows up for everyone looking; days left move on by themselves.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`projections:${board.teamId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projections" }, (p) => {
        const row = (p.new ?? p.old) as { team_id?: string } | null;
        if (p.eventType === "DELETE" || row?.team_id === board.teamId) reload(400);
      })
      .subscribe();
    const every = setInterval(() => document.visibilityState === "visible" && reload(), 10 * 60_000);
    return () => {
      clearInterval(every);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [board.teamId, reload]);

  const list = board.projections;
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { active: 0, reached: 0, ended: 0, archived: 0 };
    for (const p of list) c[tabOf(p)]++;
    return c;
  }, [list]);
  const shown = list.filter((p) => tabOf(p) === tab).sort(byNeed);
  const running = list.filter((p) => tabOf(p) === "active");
  const onTrack = running.filter((p) => p.a.status === "on_track" || p.a.status === "ahead").length;
  const behind = running.filter((p) => p.a.status === "behind").length;
  const next = [...running].sort((a, b) => a.deadline.localeCompare(b.deadline))[0] ?? null;
  const detail = list.find((p) => p.id === detailId) ?? null;
  const compare = list.find((p) => p.id === compareId) ?? null;

  // Stable, so the open dialog doesn't take the focus back on every refresh.
  const closeDetail = useCallback(() => {
    setDetailId(null);
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("p")) {
        u.searchParams.delete("p");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      }
    } catch {}
  }, []);
  const closeCompare = useCallback(() => setCompareId(null), []);
  const closeEditor = useCallback(() => setEditor((e) => ({ ...e, open: false })), []);

  async function archive(p: ProjectionView) {
    if (!p.archived) {
      const ok = await confirm({
        title: `Archive "${p.title}"?`,
        description: "It stops being measured each morning and moves to Archived, with its history kept. You can bring it back any time.",
        confirmLabel: "Archive",
      });
      if (!ok) return;
    }
    const r = await archiveProjection(p.id, !p.archived);
    if (r.error !== undefined) return toast.error(r.error);
    toast.success(p.archived ? "Back with the others" : "Archived");
    closeDetail();
    reload();
  }
  async function remove(p: ProjectionView) {
    const ok = await confirm({ title: `Delete "${p.title}"?`, description: "Its history and Compare go too. Archive it instead to keep them.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    const r = await deleteProjection(p.id);
    if (r.error !== undefined) return toast.error(r.error);
    toast.success("Deleted");
    closeDetail();
    reload();
  }

  const header = (
    <header className="mb-4 sm:mb-5">
      <div className="flex items-center gap-x-4 gap-y-3 flex-wrap">
        <h1 className="font-display text-[30px] sm:text-[34px] leading-none font-semibold">Projections</h1>
        {tabs && <div className="order-last w-full sm:order-none sm:w-auto">{tabs}</div>}
        {canEdit && board.ready && (
          <div className="ml-auto flex items-center gap-2">
            {list.length > 0 && (
              <Link href="/team?tab=projections" title="Change, archive or delete" className="rounded-lg border border-line/15 px-2.5 sm:px-3 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
                <SettingsIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Manage</span>
              </Link>
            )}
            <button type="button" onClick={() => setEditor({ open: true, editing: null, start: null })} className="rounded-lg bg-amber text-white px-3 sm:px-3.5 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-bold hover:brightness-110">
              <PlusIcon className="w-4 h-4" strokeWidth={2.5} />
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New projection</span>
            </button>
          </div>
        )}
      </div>
      <p className="mt-2.5 text-[13px] text-ink-soft">Long-term targets with a date. Set one and check back: it&rsquo;s measured again every morning.</p>
    </header>
  );

  const editorEl = canEdit ? (
    <ProjectionEditor
      open={editor.open}
      teamId={board.teamId}
      today={board.today}
      money={board.money}
      editing={editor.editing}
      start={editor.start}
      used={list.map((p) => p.color)}
      currency={board.currency}
      onClose={closeEditor}
      onSaved={(id) => {
        setEditor((e) => ({ ...e, open: false }));
        reload();
        if (id) {
          setTab("active");
          setDetailId(null);
        }
      }}
    />
  ) : null;

  if (!board.ready)
    return (
      <div>
        {header}
        <p className="text-[13px] text-ink-soft">Projections need the latest database update (migration 0080).</p>
      </div>
    );

  if (!list.length)
    return (
      <div>
        {header}
        <div className="rounded-2xl border border-dashed border-line/25 px-6 py-12 flex flex-col items-center text-center">
          <Mascot mood="idle" size={120} />
          <h2 className="mt-3 font-display text-[22px] font-semibold">No projections yet</h2>
          <p className="mt-1 text-[13.5px] text-ink-soft max-w-lg">
            Targets months away: 100K subscribers by spring, 45% viewed on long videos, a Reels skip rate under 30%, a million views a month. Each one keeps its starting point, shows the pace it needs and compares then with now.
          </p>
          {canEdit ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-2xl">
              {TEMPLATES.filter((t) => board.money || !/^(revenue|rpm)/.test(t.start.metric ?? "")).map((t) => (
                <button key={t.key} type="button" onClick={() => setEditor({ open: true, editing: null, start: t.start })} className="rounded-lg border border-line/20 bg-surface px-3.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-amber/50 transition-colors">
                  {t.label}
                </button>
              ))}
              <button type="button" onClick={() => setEditor({ open: true, editing: null, start: null })} className="rounded-lg bg-amber text-white px-4 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-bold hover:brightness-110">
                <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                Something else
              </button>
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] text-ink-faint">Masters set them here.</p>
          )}
        </div>
        {editorEl}
      </div>
    );

  return (
    <div>
      {header}
      <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:px-5 mb-4 grid gap-x-4 gap-y-3 grid-cols-4 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)] items-center" aria-label="Overview">
        {(
          [
            ["Running", counts.active, ""],
            ["On track", onTrack, ""],
            ["Behind", behind, behind ? "text-coral" : ""],
            ["Reached", counts.reached + list.filter((p) => p.a.status === "done").length, "text-green"],
          ] as const
        ).map(([label, n, tone]) => (
          <div key={label} className="min-w-0">
            <div className="text-[11.5px] text-ink-soft truncate">{label}</div>
            <div className={`font-display text-[24px] sm:text-[26px] font-semibold tabular-nums leading-tight ${n ? tone : ""}`}>{n}</div>
          </div>
        ))}
        <div className="min-w-0 col-span-4 sm:col-span-1 border-t border-line/10 pt-3 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-4">
          <div className="text-[11.5px] text-ink-soft">Next deadline</div>
          {next ? (
            <button type="button" onClick={() => setDetailId(next.id)} className="text-left min-w-0 w-full">
              <span className="block font-semibold text-[14px] truncate hover:underline underline-offset-2">{next.title}</span>
              <span className="flex items-center gap-2 text-[12px] text-ink-faint">
                {fmtDay(next.deadline, true)} · {next.a.daysLeft} day{next.a.daysLeft === 1 ? "" : "s"} left
                <ProjStatusPill status={next.a.status} />
              </span>
            </button>
          ) : (
            <span className="block text-[13px] text-ink-faint">Nothing running</span>
          )}
        </div>
      </section>

      <div className="flex items-center gap-2 mb-4 -mx-4 px-4 overflow-x-auto no-scrollbar sm:mx-0 sm:px-0">
        <Segmented
          ariaLabel="Which projections"
          value={tab}
          onChange={setTab}
          options={(Object.keys(TAB_LABEL) as Tab[]).filter((t) => t === "active" || counts[t] > 0).map((t) => ({ value: t, label: TAB_LABEL[t], count: counts[t] }))}
        />
        <LayoutSwitch value={layout} onChange={setLayout} className="ml-auto" />
      </div>

      {shown.length ? (
        layout === "table" ? (
          <ProjectionTable list={shown} currency={board.currency} onOpen={setDetailId} onCompare={setCompareId} />
        ) : (
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))]">
            {shown.map((p, i) => (
              <div key={p.id} className="flex animate-[fadein_.35s_ease_both]" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <ProjectionCard p={p} currency={board.currency} onOpen={() => setDetailId(p.id)} onCompare={() => setCompareId(p.id)} />
              </div>
            ))}
          </div>
        )
      ) : (
        <p className="rounded-2xl border border-dashed border-line/20 px-6 py-10 text-center text-[13.5px] text-ink-soft">
          {tab === "active" ? (canEdit ? "Nothing running. Set the next one with New projection." : "Nothing running right now.") : `Nothing ${TAB_LABEL[tab].toLowerCase()}.`}
        </p>
      )}

      <ProjectionDetail
        p={detail}
        currency={board.currency}
        canEdit={canEdit}
        onClose={closeDetail}
        onCompare={() => detail && setCompareId(detail.id)}
        onEdit={() => detail && setEditor({ open: true, editing: detail, start: null })}
        onArchive={() => detail && void archive(detail)}
        onDelete={() => detail && void remove(detail)}
      />
      <CompareDialog p={compare} now={board.now} money={board.money} currency={board.currency} onClose={closeCompare} />
      {editorEl}
    </div>
  );
}
