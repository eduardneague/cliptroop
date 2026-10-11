"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Mascot } from "@/components/ui/mascot";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { ArchiveIcon, EditIcon, MoreIcon, PlusIcon, TrashIcon, TrendIcon } from "@/components/ui/icons";
import { archiveProjection, deleteProjection, loadProjectionsBoard } from "@/app/(dashboard)/objectives/projection-actions";
import { formatValue, unitWords } from "@/modules/projections/lib/metrics";
import type { ProjectionView, ProjectionsBoard } from "@/modules/projections/lib/types";
import { ProgressTrack, ProjIcon, ProjStatusPill } from "@/modules/projections/components/parts";
import { leftWords } from "@/modules/projections/components/projection-card";
import { ProjectionEditor, TEMPLATES, type EditorStart } from "@/modules/projections/components/projection-editor";

/**
 * Team → Projections. Masters set the team's long-term targets here as well
 * as on the Projections page: change one, archive it (asks first), bring it
 * back, delete it. Everyone else reads them.
 */
export function ProjectionsSettings({ teamId, canEdit }: { teamId: string; canEdit: boolean }) {
  const [board, setBoard] = useState<ProjectionsBoard | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; editing: ProjectionView | null; start: EditorStart | null }>({ open: false, editing: null, start: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (ms = 0) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const r = await loadProjectionsBoard(teamId);
        if (r.error !== undefined) setFailed(r.error);
        else {
          setFailed(null);
          setBoard(r.board);
        }
      }, ms);
    },
    [teamId]
  );
  useEffect(() => {
    load();
    // Live, like the page: a change by another master shows up here too.
    const supabase = createClient();
    const channel = supabase
      .channel(`projections-settings:${teamId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projections" }, (p) => {
        const row = (p.new ?? p.old) as { team_id?: string } | null;
        if (p.eventType === "DELETE" || row?.team_id === teamId) load(400);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [teamId, load]);

  const closeEditor = useCallback(() => setEditor((e) => ({ ...e, open: false })), []);
  const list = board?.projections ?? [];
  const running = list.filter((p) => !p.archived).sort((a, b) => Number(!!a.endedAt) - Number(!!b.endedAt) || a.deadline.localeCompare(b.deadline));
  const archived = list.filter((p) => p.archived);

  return (
    <div>
      <div className="flex items-start gap-3 flex-wrap mb-5">
        <div className="flex-1 min-w-[min(100%,16rem)]">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Projections</h2>
          <p className="text-[12px] text-ink-soft max-w-xl">
            The team&rsquo;s long-term targets with a date: 200K subscribers by December, a Reels skip rate under 22% by spring. Each is measured every morning, with the pace it needs and where it&rsquo;s heading.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/objectives?view=projections" className="rounded-lg border border-line/15 px-3 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
            <TrendIcon className="w-4 h-4" />
            Open the page
          </Link>
          {canEdit && board?.ready && (
            <button type="button" onClick={() => setEditor({ open: true, editing: null, start: null })} className="rounded-lg bg-amber text-white px-3.5 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-bold hover:brightness-110">
              <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
              New projection
            </button>
          )}
        </div>
      </div>

      {failed ? (
        <p className="text-[13px] text-coral">{failed}</p>
      ) : !board ? (
        <ul className="rounded-2xl border border-line/15 divide-y divide-line/10 overflow-hidden" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="skeleton w-8 h-8 rounded-lg" />
              <span className="flex-1 space-y-1.5">
                <span className={`skeleton block h-3.5 rounded-md ${["w-40", "w-52", "w-36"][i]}`} />
                <span className="skeleton block h-3 w-64 max-w-full rounded-md" />
              </span>
            </li>
          ))}
        </ul>
      ) : !board.ready ? (
        <p className="text-[13px] text-ink-soft">Projections need the latest database update (migration 0080).</p>
      ) : !list.length ? (
        <div className="rounded-2xl border border-dashed border-line/25 p-5 sm:p-6">
          <div className="flex items-center gap-4 mb-5">
            <Mascot mood="idle" size={72} />
            <div>
              <div className="text-[15px] font-semibold">No projections yet</div>
              <p className="text-[12.5px] text-ink-soft">{canEdit ? "Start from one of these, or make your own." : "Masters set them here or on the Projections page."}</p>
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.filter((t) => board.money || !/^(revenue|rpm)/.test(t.start.metric ?? "")).map((t) => (
                <button key={t.key} type="button" onClick={() => setEditor({ open: true, editing: null, start: t.start })} className="rounded-lg border border-line/20 bg-surface px-3.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-amber/50 transition-colors">
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <ul className="rounded-2xl border border-line/15 divide-y divide-line/10 overflow-hidden">
            {running.map((p) => (
              <Row key={p.id} p={p} currency={board.currency} canEdit={canEdit} onEdit={() => setEditor({ open: true, editing: p, start: null })} onChanged={() => load()} />
            ))}
            {!running.length && <li className="px-4 py-4 text-[12.5px] text-ink-faint">Nothing running. The archived ones are below.</li>}
          </ul>
          {archived.length > 0 && (
            <details className="mt-4 group">
              <summary className="cursor-pointer list-none inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                Archived <span className="text-ink-faint tabular-nums">{archived.length}</span>
                <span className="text-ink-faint group-open:hidden">· Show</span>
              </summary>
              <ul className="mt-2 rounded-2xl border border-line/15 divide-y divide-line/10 overflow-hidden">
                {archived.map((p) => (
                  <Row key={p.id} p={p} currency={board.currency} canEdit={canEdit} onEdit={() => setEditor({ open: true, editing: p, start: null })} onChanged={() => load()} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {canEdit && board?.ready && (
        <ProjectionEditor
          open={editor.open}
          teamId={teamId}
          today={board.today}
          money={board.money}
          editing={editor.editing}
          start={editor.start}
          used={list.map((p) => p.color)}
          currency={board.currency}
          onClose={closeEditor}
          onSaved={() => {
            setEditor((e) => ({ ...e, open: false }));
            load();
          }}
        />
      )}
    </div>
  );
}

function Row({ p, currency, canEdit, onEdit, onChanged }: { p: ProjectionView; currency: string; canEdit: boolean; onEdit: () => void; onChanged: () => void }) {
  const [menu, setMenu] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const fmt = (v: number) => formatValue(p.metric, v, { currency });
  const unit = unitWords(p.metric, p.target, p.scope);
  const pct = p.a.progress === null ? null : Math.min(100, Math.round(Math.max(0, p.a.progress) * 100));

  async function archive() {
    setMenu(false);
    if (!p.archived) {
      const ok = await confirm({
        title: `Archive "${p.title}"?`,
        description: "It stops being measured each morning and moves to Archived, with its history kept. You can bring it back any time.",
        confirmLabel: "Archive",
      });
      if (!ok) return;
    }
    const r = await archiveProjection(p.id, !p.archived);
    if (r.error !== undefined) return void toast.error(r.error);
    toast.success(p.archived ? "Back with the others" : "Archived");
    onChanged();
  }
  async function remove() {
    setMenu(false);
    const ok = await confirm({ title: `Delete "${p.title}"?`, description: "Its history and Compare go too. Archive it instead to keep them.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    const r = await deleteProjection(p.id);
    if (r.error !== undefined) return void toast.error(r.error);
    toast.success("Deleted");
    onChanged();
  }

  return (
    <li className={`bg-surface ${p.archived ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3 px-3 sm:px-4 py-3">
        <ProjIcon p={p} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold truncate">{p.title}</span>
            {p.archived && <span className="rounded-md bg-surface-2 px-2 h-5 inline-flex items-center text-[10.5px] font-bold text-ink-soft">Archived</span>}
          </div>
          <div className="text-[12px] text-ink-soft truncate">{p.sentence}</div>
        </div>
        <div className="hidden md:flex items-center gap-3 w-[340px] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-[11.5px] mb-1">
              <span className="tabular-nums text-ink-soft truncate">
                <b className="text-ink">{p.current === null ? "–" : fmt(p.current)}</b> of {fmt(p.target)}
                {unit ? ` ${unit}` : ""}
              </span>
              {pct !== null && <span className="tabular-nums text-ink-faint whitespace-nowrap">{pct}%</span>}
            </div>
            <ProgressTrack p={p} height={6} />
            <div className="mt-1 text-[11px] text-ink-faint truncate">{leftWords(p)}</div>
          </div>
          <span className="w-[92px] flex justify-end flex-shrink-0">
            <ProjStatusPill status={p.a.status} />
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onEdit} className="hidden sm:inline-flex rounded-lg border border-line/15 px-2.5 h-8 items-center gap-1.5 text-[12px] font-semibold text-ink-soft hover:text-ink">
              <EditIcon className="w-3.5 h-3.5" />
              Edit
            </button>
            <button ref={btn} type="button" onClick={() => setMenu((x) => !x)} aria-haspopup="menu" aria-expanded={menu} aria-label={`More for ${p.title}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
              <MoreIcon className="w-4 h-4" />
            </button>
            <AnchoredMenu open={menu} onClose={() => setMenu(false)} anchor={btn} width={230} label={`More for ${p.title}`}>
              <div className="p-1.5">
                <MenuItem icon={<EditIcon className="w-4 h-4" />} onClick={() => (setMenu(false), onEdit())}>
                  Edit
                </MenuItem>
                <MenuItem icon={<ArchiveIcon className="w-4 h-4" />} onClick={() => void archive()}>
                  {p.archived ? "Bring it back" : "Archive"}
                </MenuItem>
                <div className="my-1 h-px bg-line/10" />
                <MenuItem icon={<TrashIcon className="w-4 h-4" />} danger onClick={() => void remove()}>
                  Delete
                </MenuItem>
              </div>
            </AnchoredMenu>
          </div>
        )}
      </div>
    </li>
  );
}

function MenuItem({ icon, children, onClick, danger = false }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-[13px] font-medium text-left ${danger ? "text-red hover:bg-red/10" : "hover:bg-surface-2"}`}>
      <span className={danger ? "" : "text-ink-soft"}>{icon}</span>
      {children}
    </button>
  );
}
