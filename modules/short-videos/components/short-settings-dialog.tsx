"use client";

import { useEffect, useState } from "react";
import { updateShortDetails } from "@/app/(dashboard)/shorts/actions";
import { useAction } from "@/lib/hooks/use-action";
import { Dialog } from "@/components/ui/dialog";
import { PLATFORM_META, type Platform, type ShortType } from "../lib/constants";
import type { DatedShort, TeamPerson } from "../lib/queries";
import { assignShortPerson, setShortScripter } from "@/app/(dashboard)/shorts/actions";
import { ScripterPicker } from "./scripter-picker";
import { PersonSelect, type PersonKind } from "./person-select";
import { formatShortDate } from "../lib/dates";
import { ScheduleField, type ScheduleValue } from "./schedule-field";
import { ShortTypePicker, Switch } from "./short-type";
import { PlatformPicker } from "./platform-picker";
import { CopyButton } from "./copy-button";

export type ShortSettingsData = {
  id: string;
  number: number;
  title: string;
  plannedDate: string | null;
  scheduleMode: "auto" | "pinned";
  pinKind: "anchor" | "oneoff" | null;
  shortType: ShortType;
  platforms: Platform[];
  captionEnabled: boolean;
  caption: string | null;
  fileLink: string | null;
  editorId: string | null;
  reviewerId: string | null;
  schedulerId: string | null;
  scripterIds: string[];
};

export type ShortSettingsContext = {
  planned: DatedShort[];
  limits: Record<string, number>;
  perDay: number;
  weekends: boolean;
  queueStart: { id: string; number: number; date: string } | null;
  /** Master: everything. Scheduler: everything except fixed dates and the queue start. */
  isMaster: boolean;
  people: TeamPerson[];
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-4 border-t border-line/10 first:border-t-0 first:pt-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">{label}</div>
      {children}
    </div>
  );
}

/**
 * Everything about a short that isn't part of the current step: post
 * date, type, platforms and caption. Each change saves right away.
 */
export function ShortSettingsDialog({
  open,
  onClose,
  short,
  ctx,
}: {
  open: boolean;
  onClose: () => void;
  short: ShortSettingsData;
  ctx: ShortSettingsContext;
}) {
  const server: ScheduleValue =
    short.scheduleMode === "pinned" && short.plannedDate
      ? { mode: "pinned", date: short.plannedDate, kind: short.pinKind ?? "anchor" }
      : { mode: "auto" };

  const [schedule, setSchedule] = useState<ScheduleValue>(server);
  const [type, setType] = useState(short.shortType);
  const [plats, setPlats] = useState(short.platforms);
  const [capOn, setCapOn] = useState(short.captionEnabled);
  const [cap, setCap] = useState(short.caption ?? "");
  const [who, setWho] = useState({ editor: short.editorId, reviewer: short.reviewerId, scheduler: short.schedulerId });
  const [scripters, setScripters] = useState<string[]>(short.scripterIds);

  // Fresh values each time it opens (or when the server changes them).
  useEffect(() => {
    if (!open) return;
    setSchedule(server);
    setType(short.shortType);
    setPlats(short.platforms);
    setCapOn(short.captionEnabled);
    setCap(short.caption ?? "");
    setWho({ editor: short.editorId, reviewer: short.reviewerId, scheduler: short.schedulerId });
    setScripters(short.scripterIds);
  }, [open, short.scripterIds.join(","), short.editorId, short.reviewerId, short.schedulerId, short.plannedDate, short.scheduleMode, short.pinKind, short.shortType, short.platforms, short.captionEnabled, short.caption]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(updateShortDetails, { success: "Saved" });
  const assign = useAction(assignShortPerson, {
    success: (_id, role, m) => (m ? `${role[0].toUpperCase()}${role.slice(1)} set. They've been notified.` : `${role[0].toUpperCase()}${role.slice(1)} cleared.`),
    onError: () => setWho({ editor: short.editorId, reviewer: short.reviewerId, scheduler: short.schedulerId }),
  });
  const scripter = useAction(setShortScripter, {
    success: (_id, _m, add) => (add ? "Scripter added. They've been notified." : "Scripter removed."),
    onError: () => setScripters(short.scripterIds),
  });
  function toggleScripter(memberId: string, add: boolean) {
    setScripters((w) => (add ? [...w.filter((x) => x !== memberId), memberId] : w.filter((x) => x !== memberId)));
    scripter.run(short.id, memberId, add);
  }

  function setPerson(kind: "editor" | "reviewer" | "scheduler", memberId: string | null) {
    setWho((w) => ({ ...w, [kind]: memberId }));
    assign.run(short.id, kind, memberId);
  }
  const canEditDate = ctx.isMaster || short.scheduleMode === "auto";

  return (
    <Dialog
      open={open}
      onClose={() => {
        // Don't lose a caption that's still being typed.
        if (capOn && cap.trim() !== (short.caption ?? "")) save.run(short.id, { caption: cap });
        onClose();
      }}
      title={`Settings for #${short.number}`}
      width="sm:max-w-2xl"
      description={short.title}
      footer={
        <button
          type="button"
          onClick={() => {
            if (capOn && cap.trim() !== (short.caption ?? "")) save.run(short.id, { caption: cap });
            onClose();
          }}
          className="rounded-lg bg-ink text-paper font-bold px-5 h-10 text-[13.5px] hover:opacity-90"
        >
          Done
        </button>
      }
    >
      <Section label="People">
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["editor", "Editor"],
            ["reviewer", "Reviewer"],
            ["scheduler", "Scheduler"],
          ] as const).map(([kind, label]) => (
            <div key={kind} className="min-w-0">
              <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">{label}</div>
              <PersonSelect kind={kind} people={ctx.people} value={who[kind]} onChange={(m) => setPerson(kind, m)} />
            </div>
          ))}
        </div>
      </Section>

      <Section label="Scripters">
        <p className="text-[12px] text-ink-soft mb-2.5">Only these people (and masters) can edit the script.</p>
        <ScripterPicker
          people={ctx.people}
          value={scripters}
          onAdd={(m) => toggleScripter(m, true)}
          onRemove={(m) => toggleScripter(m, false)}
        />
      </Section>

      <Section label="Post date">
        {canEditDate ? (
          <ScheduleField
            value={schedule}
            onChange={(v) => {
              setSchedule(v);
              if (v.mode === "auto") save.run(short.id, { auto: true });
              else if (schedule.mode === "pinned" && schedule.date === v.date) save.run(short.id, { pin_kind: v.kind });
              else save.run(short.id, { planned_date: v.date, pin_kind: v.kind });
            }}
            autoDate={short.scheduleMode === "auto" ? short.plannedDate : null}
            autoLabel="Auto-scheduled for"
            planned={ctx.planned}
            perDay={ctx.perDay}
            weekends={ctx.weekends}
            limits={ctx.limits}
            queueStart={ctx.queueStart}
            canStartQueue={ctx.isMaster}
            excludeId={short.id}
          />
        ) : (
          <p className="text-[14px] font-semibold">
            {short.plannedDate ? formatShortDate(short.plannedDate, { withYear: true }) : "Not planned"}
            <span className="block mt-1 text-[12px] font-normal text-ink-soft">Only the master can change a fixed date.</span>
          </p>
        )}
      </Section>

      <Section label="Type">
        <ShortTypePicker
          value={type}
          onChange={(t) => {
            setType(t);
            save.run(short.id, { short_type: t });
          }}
        />
      </Section>

      <Section label="Post to">
        <PlatformPicker
          value={plats}
          onChange={(next) => {
            setPlats(next);
            save.run(short.id, { platforms: next });
          }}
        />
      </Section>

      <Section label="Caption">
        <Switch
          checked={capOn}
          onChange={(v) => {
            setCapOn(v);
            save.run(short.id, { caption_enabled: v });
          }}
          label="Custom caption"
          hint="Off uses the automatic caption."
        />
        {capOn && (
          <div className="mt-3">
            <textarea
              aria-label="Caption"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              onBlur={() => cap.trim() !== (short.caption ?? "") && save.run(short.id, { caption: cap })}
              maxLength={5000}
              rows={4}
              placeholder="Caption + hashtags"
              className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2.5 text-[13.5px] outline-none focus:ring-2 focus:ring-amber resize-y"
            />
            <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
              <div className="flex items-center gap-2.5 flex-wrap">
                {plats.map((p) => {
                  const over = cap.trim().length > PLATFORM_META[p].captionLimit;
                  return (
                    <span key={p} className={`text-[11px] tabular-nums ${over ? "text-red font-bold" : "text-ink-soft"}`}>
                      {PLATFORM_META[p].short} {cap.trim().length}/{PLATFORM_META[p].captionLimit}
                    </span>
                  );
                })}
              </div>
              <CopyButton text={cap.trim()} label="Copy caption" toastText="Caption copied" />
            </div>
          </div>
        )}
      </Section>
    </Dialog>
  );
}
