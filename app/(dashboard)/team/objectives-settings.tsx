"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Mascot } from "@/components/ui/mascot";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { CopyIcon, EditIcon, GripIcon, MoreIcon, PauseIcon, PlayIcon, PlusIcon, TargetIcon, TrashIcon, CalendarIcon } from "@/components/ui/icons";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";
import { deleteObjective, duplicateObjective, reorderObjectives, setObjectivePaused } from "@/app/(dashboard)/objectives/actions";
import { METRICS, OBJECTIVE_COLORS, TEMPLATES, describe, formatAmount, suggestTitle, unitFor } from "@/modules/objectives/lib/metrics";
import { CADENCE } from "@/modules/objectives/lib/periods";
import { useLiveBoard, type LiveBoard } from "@/modules/objectives/components/use-live-board";
import { Meter, ObjectiveIcon, StatusPill } from "@/modules/objectives/components/parts";
import { ObjectiveEditor, type EditorSeed } from "@/modules/objectives/components/objective-editor";
import { ONE, ScheduleDialog } from "@/modules/objectives/components/schedule-dialog";
import type { ObjectiveView } from "@/modules/objectives/lib/types";

/**
 * Team → Objectives. Masters set the team's goals here (everyone else reads
 * them): what each counts and how often, its target and a different target
 * for any single period. Drag to reorder: the page and the widget follow.
 */
export function ObjectivesSettings({ teamId, canEdit, initial, people, editId }: { teamId: string; canEdit: boolean; initial: LiveBoard; people: TeamPerson[]; editId?: string | null }) {
  const { board } = useLiveBoard(teamId, "widget", initial);
  const b = board ?? initial;
  const [editing, setEditing] = useState<ObjectiveView | null>(null);
  const [creating, setCreating] = useState<EditorSeed | null | false>(false);
  const [schedule, setSchedule] = useState<ObjectiveView | null>(null);
  const [order, setOrder] = useState<string[]>(b.objectives.map((o) => o.id));
  useEffect(() => setOrder(b.objectives.map((o) => o.id)), [b.objectives]);
  const byId = useMemo(() => new Map(b.objectives.map((o) => [o.id, o])), [b.objectives]);
  const list = order.map((id) => byId.get(id)).filter((o): o is ObjectiveView => !!o);
  const used = b.objectives.map((o) => o.color);
  const toast = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const dndId = useId();
  // /team?tab=objectives&edit=<id> (from an objective's details) opens its editor once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !editId || !canEdit) return;
    const o = b.objectives.find((x) => x.id === editId);
    if (!o) return;
    opened.current = true;
    setEditing(o);
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("edit");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch {}
  }, [editId, canEdit, b.objectives]);

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(order, order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
    const before = order;
    setOrder(next);
    const r = await reorderObjectives(teamId, next);
    if (r.error !== undefined) {
      setOrder(before);
      toast.error(r.error);
    }
  }

  if (!b.ready) return <p className="text-[12.5px] text-ink-soft">Objectives need the latest database update (migration 0078).</p>;

  return (
    <div>
      <div className="flex items-start gap-3 flex-wrap mb-5">
        <div className="flex-1 min-w-[min(100%,16rem)]">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Objectives</h2>
          <p className="text-[12px] text-ink-soft max-w-xl">
            The team&rsquo;s goals: shorts a week, Instagram-only reels, long videos a month, views, anything. Everyone sees them fill up live on the Objectives page and the dashboard widget, and the whole team is congratulated when one is reached.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/objectives" className="rounded-lg border border-line/15 px-3 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
            <TargetIcon className="w-4 h-4" />
            Open the page
          </Link>
          {canEdit && (
            <button type="button" onClick={() => setCreating(null)} className="rounded-lg bg-amber text-white px-3.5 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-bold hover:brightness-110">
              <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
              New objective
            </button>
          )}
        </div>
      </div>

      {!list.length ? (
        <div className="rounded-2xl border border-dashed border-line/25 p-5 sm:p-6">
          <div className="flex items-center gap-4 mb-5">
            <Mascot mood="idle" size={72} />
            <div>
              <div className="text-[15px] font-semibold">No objectives yet</div>
              <p className="text-[12.5px] text-ink-soft">{canEdit ? "Start from one of these, or make your own. You can change everything later." : "Masters set the team's goals here."}</p>
            </div>
          </div>
          {canEdit && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {TEMPLATES.map((t, i) => {
                const m = METRICS[t.metric];
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setCreating({ metric: t.metric, period: t.period, target: t.target, filters: t.filters, color: OBJECTIVE_COLORS[i % OBJECTIVE_COLORS.length] })}
                    className="text-left flex items-start gap-2.5 rounded-xl border border-line/15 p-3 hover:border-amber/50 hover:bg-amber/[0.04] transition-colors"
                  >
                    <ObjectiveIcon icon={m.icon} platform={t.filters.platforms?.length === 1 ? t.filters.platforms[0] : null} color={OBJECTIVE_COLORS[i % OBJECTIVE_COLORS.length]} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight">{suggestTitle(t)}</span>
                      <span className="block text-[11.5px] text-ink-faint mt-0.5">{describe(t)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          <SortableContext items={list.map((o) => o.id)} strategy={verticalListSortingStrategy}>
            <ul className="rounded-2xl border border-line/15 divide-y divide-line/10 overflow-hidden">
              {list.map((o) => (
                <Row key={o.id} o={o} canEdit={canEdit} onEdit={() => setEditing(o)} onSchedule={() => setSchedule(o)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {canEdit && list.length > 0 && <p className="mt-3 text-[11.5px] text-ink-faint">Drag the handle to change the order. The page and the widget follow it.</p>}

      <ObjectiveEditor open={!!editing || creating !== false} onClose={() => (setEditing(null), setCreating(false))} teamId={teamId} people={people} objective={editing} seed={creating || null} usedColors={used} />
      <ScheduleDialog open={!!schedule} onClose={() => setSchedule(null)} objective={schedule} canEdit={canEdit} />
    </div>
  );
}

function Row({ o, canEdit, onEdit, onSchedule }: { o: ObjectiveView; canEdit: boolean; onEdit: () => void; onSchedule: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: o.id, disabled: !canEdit });
  const [menu, setMenu] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const c = o.current;
  const changed = o.overrides.length;

  async function run(what: "pause" | "resume" | "copy" | "delete") {
    setMenu(false);
    if (what === "delete") {
      const ok = await confirm({ title: `Delete "${o.title}"?`, description: "It's gone for everyone, with its history and wins. This can't be undone.", confirmLabel: "Delete", danger: true });
      if (!ok) return;
      const r = await deleteObjective(o.id);
      return void (r.error !== undefined ? toast.error(r.error) : toast.success("Objective deleted"));
    }
    if (what === "pause") {
      const ok = await confirm({ title: `Pause "${o.title}"?`, description: "It stops counting and celebrating and leaves the widget, but keeps its history. Resume it any time.", confirmLabel: "Pause" });
      if (!ok) return;
    }
    const r = what === "copy" ? await duplicateObjective(o.id) : await setObjectivePaused(o.id, what === "pause");
    if (r.error !== undefined) return void toast.error(r.error);
    toast.success(what === "copy" ? "Copied. Change the copy to make it its own." : what === "pause" ? "Paused" : "Counting again");
  }

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`relative bg-surface ${isDragging ? "z-10 shadow-xl" : ""} ${o.paused ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3 px-3 sm:px-4 py-3">
        {canEdit && (
          <button type="button" {...attributes} {...listeners} aria-label={`Move ${o.title}`} className="w-6 h-8 -ml-1 flex items-center justify-center rounded-md text-ink-faint hover:text-ink cursor-grab active:cursor-grabbing touch-none">
            <GripIcon className="w-4 h-4" />
          </button>
        )}
        <ObjectiveIcon icon={o.icon} platform={o.platform} color={o.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold truncate max-w-full">{o.title}</span>
            <span className="text-[11px] font-semibold text-ink-faint">{CADENCE[o.period]}</span>
            {o.paused && <span className="rounded-full bg-surface-2 px-2 h-5 inline-flex items-center text-[10.5px] font-bold text-ink-soft">Paused</span>}
            {changed > 0 && (
              <button type="button" onClick={onSchedule} className="rounded-full bg-amber/10 text-ink px-2 h-5 inline-flex items-center text-[10.5px] font-bold hover:bg-amber/20" title="Targets set for single periods">
                {changed} {ONE[o.period]}
                {changed === 1 ? "" : "s"} changed
              </button>
            )}
          </div>
          <div className="text-[12px] text-ink-soft truncate">{o.sentence}</div>
        </div>
        <div className="hidden md:flex items-center gap-3 w-[320px] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-[11.5px] mb-1">
              <span className="text-ink-faint truncate">{c.label}</span>
              <span className="tabular-nums text-ink-soft whitespace-nowrap">
                <b className="text-ink">{formatAmount(o.metric, c.value)}</b> of {c.target ? formatAmount(o.metric, c.target) : "off"} {c.target ? unitFor(o.metric, c.target, o.filters) : ""}
              </span>
            </div>
            <Meter value={c.value} target={c.target} expected={o.paused ? null : c.expected} color={o.color} height={6} />
          </div>
          {/* A fixed width, so every row's bar is as long as the others. */}
          <span className="w-[84px] flex justify-end flex-shrink-0">
            <StatusPill status={o.paused ? "off" : c.status} />
          </span>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onEdit} className="hidden sm:inline-flex rounded-lg border border-line/15 px-2.5 h-8 items-center gap-1.5 text-[12px] font-semibold text-ink-soft hover:text-ink">
              <EditIcon className="w-3.5 h-3.5" />
              Edit
            </button>
            <button ref={btn} type="button" onClick={() => setMenu((x) => !x)} aria-haspopup="menu" aria-expanded={menu} aria-label={`More for ${o.title}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
              <MoreIcon className="w-4 h-4" />
            </button>
            <AnchoredMenu open={menu} onClose={() => setMenu(false)} anchor={btn} width={250} label={`More for ${o.title}`}>
              <div className="p-1.5">
                <MenuItem icon={<EditIcon className="w-4 h-4" />} onClick={() => (setMenu(false), onEdit())}>
                  Edit
                </MenuItem>
                <MenuItem icon={<CalendarIcon className="w-4 h-4" />} onClick={() => (setMenu(false), onSchedule())}>
                  Change a {ONE[o.period]}&rsquo;s target
                </MenuItem>
                <MenuItem icon={<CopyIcon className="w-4 h-4" />} onClick={() => void run("copy")}>
                  Make a copy
                </MenuItem>
                <MenuItem icon={o.paused ? <PlayIcon className="w-4 h-4" /> : <PauseIcon className="w-4 h-4" />} onClick={() => void run(o.paused ? "resume" : "pause")}>
                  {o.paused ? "Resume" : "Pause"}
                </MenuItem>
                <div className="my-1 h-px bg-line/10" />
                <MenuItem icon={<TrashIcon className="w-4 h-4" />} danger onClick={() => void run("delete")}>
                  Delete
                </MenuItem>
              </div>
            </AnchoredMenu>
          </div>
        ) : (
          <button type="button" onClick={onSchedule} className="hidden sm:inline-flex w-[122px] justify-center rounded-lg border border-line/15 px-2.5 h-8 items-center text-[12px] font-semibold text-ink-soft hover:text-ink">
            {ONE[o.period].charAt(0).toUpperCase() + ONE[o.period].slice(1)} by {ONE[o.period]}
          </button>
        )}
      </div>
      {/* Phones: the progress under the name. */}
      <div className="md:hidden px-3 sm:px-4 pb-3 -mt-1 flex items-center gap-2">
        <Meter value={c.value} target={c.target} expected={o.paused ? null : c.expected} color={o.color} height={5} className="flex-1" />
        <span className="text-[11.5px] tabular-nums text-ink-soft whitespace-nowrap">
          {formatAmount(o.metric, c.value)}/{c.target ? formatAmount(o.metric, c.target) : "off"}
        </span>
        <StatusPill status={o.paused ? "off" : c.status} />
      </div>
    </li>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-[13px] font-semibold text-left ${danger ? "text-red hover:bg-red/10" : "text-ink hover:bg-surface-2"}`}>
      <span className={danger ? "text-red" : "text-ink-soft"}>{icon}</span>
      {children}
    </button>
  );
}
