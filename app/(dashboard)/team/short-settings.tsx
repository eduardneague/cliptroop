"use client";

import { useMemo, useState } from "react";
import { updateShortSettings } from "./actions";
import { useAction } from "@/lib/hooks/use-action";
import { Select } from "@/components/ui/select";
import { ShortTypePicker } from "@/modules/short-videos/components/short-type";
import { PersonSelect } from "@/modules/short-videos/components/person-select";
import type { ShortTeamSettings, TeamPerson } from "@/modules/short-videos/lib/queries";

/** Team → Short videos: posting rhythm + default people (masters). */
export function ShortSettingsForm({
  teamId,
  settings,
  people,
}: {
  teamId: string;
  settings: ShortTeamSettings;
  people: TeamPerson[];
}) {
  const [perDay, setPerDay] = useState(settings.perDay);
  const [weekends, setWeekends] = useState(settings.weekends);
  const [rollForward, setRollForward] = useState(settings.rollForward);
  const [defaultType, setDefaultType] = useState(settings.defaultType);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [editor, setEditor] = useState(settings.defaultEditor);
  const [reviewer, setReviewer] = useState(settings.defaultReviewer);
  const [scheduler, setScheduler] = useState(settings.defaultScheduler);
  const [scripter, setScripter] = useState(settings.defaultScripter);
  const [ytDescription, setYtDescription] = useState(settings.youtubeDescription);

  const zones = useMemo(() => {
    try {
      const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
      return list.includes(settings.timezone) ? list : [settings.timezone, ...list];
    } catch {
      return [settings.timezone];
    }
  }, [settings.timezone]);

  const dirty =
    perDay !== settings.perDay ||
    weekends !== settings.weekends ||
    rollForward !== settings.rollForward ||
    defaultType !== settings.defaultType ||
    timezone !== settings.timezone ||
    editor !== settings.defaultEditor ||
    reviewer !== settings.defaultReviewer ||
    scheduler !== settings.defaultScheduler ||
    scripter !== settings.defaultScripter ||
    ytDescription !== settings.youtubeDescription;
  const rhythmChanged =
    perDay !== settings.perDay ||
    weekends !== settings.weekends ||
    rollForward !== settings.rollForward ||
    timezone !== settings.timezone;

  const save = useAction(updateShortSettings, {
    success: rhythmChanged ? "Saved. Auto dates updated." : "Saved",
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Shorts per day</div>
          <div className="inline-flex items-center rounded-lg border border-line/15 overflow-hidden">
            <button type="button" onClick={() => setPerDay((n) => Math.max(1, n - 1))} className="w-10 h-10 text-[18px] font-semibold text-ink-soft hover:bg-surface-2" aria-label="Fewer per day">
              −
            </button>
            <span className="w-12 text-center text-[16px] font-bold tabular-nums">{perDay}</span>
            <button type="button" onClick={() => setPerDay((n) => Math.min(10, n + 1))} className="w-10 h-10 text-[18px] font-semibold text-ink-soft hover:bg-surface-2" aria-label="More per day">
              +
            </button>
          </div>
        </div>
        <div>
          <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Post on weekends</div>
          <button
            type="button"
            role="switch"
            aria-checked={weekends}
            onClick={() => setWeekends((w) => !w)}
            className="inline-flex items-center gap-2.5 h-10"
          >
            <span className={`relative w-10 h-6 rounded-full transition-colors ${weekends ? "bg-green" : "bg-line/20"}`}>
              <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${weekends ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </span>
            <span className="text-[13px] font-semibold">{weekends ? "Yes" : "No, weekdays only"}</span>
          </button>
        </div>
        <div>
          <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Time zone</div>
          <Select
            value={timezone}
            onChange={(z) => z && setTimezone(z)}
            options={zones.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))}
            searchable
            ariaLabel="Time zone"
            menuMinWidth={280}
          />
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={rollForward}
        onClick={() => setRollForward((r) => !r)}
        className="flex items-start gap-3 text-left"
      >
        <span className={`relative mt-0.5 w-10 h-6 flex-shrink-0 rounded-full transition-colors ${rollForward ? "bg-green" : "bg-line/20"}`}>
          <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${rollForward ? "translate-x-[18px]" : "translate-x-0.5"}`} />
        </span>
        <span>
          <span className="block text-[13px] font-semibold">Roll unposted shorts forward</span>
          <span className="block text-[12px] text-ink-soft">
            Missed an Auto short? It moves to the next free day. Fixed dates stay put.
          </span>
        </span>
      </button>

      <div>
        <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Default type for new shorts</div>
        <ShortTypePicker value={defaultType} onChange={setDefaultType} />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <div className="text-[11.5px] font-semibold text-ink-soft">YouTube description</div>
          <div className="text-[11px] text-ink-faint tabular-nums">{ytDescription.length}/5000</div>
        </div>
        <textarea
          value={ytDescription}
          onChange={(e) => setYtDescription(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder="Links, socials, hashtags… used for every YouTube post."
          className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-amber resize-y"
        />
        <p className="mt-1 text-[11.5px] text-ink-faint">Filled in automatically every time a short is scheduled to YouTube.</p>
      </div>

      <div>
        <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Default people for new shorts</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[11px] text-ink-faint mb-1">Scripter</div>
            <PersonSelect kind="scripter" people={people} value={scripter} onChange={setScripter} />
          </div>
          <div>
            <div className="text-[11px] text-ink-faint mb-1">Editor</div>
            <PersonSelect kind="editor" people={people} value={editor} onChange={setEditor} />
          </div>
          <div>
            <div className="text-[11px] text-ink-faint mb-1">Reviewer</div>
            <PersonSelect kind="reviewer" people={people} value={reviewer} onChange={setReviewer} />
          </div>
          <div>
            <div className="text-[11px] text-ink-faint mb-1">Scheduler</div>
            <PersonSelect kind="scheduler" people={people} value={scheduler} onChange={setScheduler} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || save.pending}
          onClick={() =>
            save.run(teamId, {
              perDay,
              weekends,
              rollForward,
              defaultType,
              timezone,
              defaultEditor: editor,
              defaultReviewer: reviewer,
              defaultScheduler: scheduler,
              defaultScripter: scripter,
              youtubeDescription: ytDescription,
            })
          }
          className="rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-40 hover:brightness-110 transition-[filter]"
        >
          {save.pending ? "Saving…" : "Save"}
        </button>
        {rhythmChanged && (
          <span className="text-[12px] text-ink-faint">Saving updates the Auto dates.</span>
        )}
      </div>
    </div>
  );
}
