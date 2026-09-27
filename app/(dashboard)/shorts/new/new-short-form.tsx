"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShort } from "../actions";
import { useToast } from "@/components/ui/toast-provider";
import { PLATFORMS, YOUTUBE_TITLE_LIMIT, type Platform, type ShortType } from "@/modules/short-videos/lib/constants";
import { ShortTypePicker, Switch } from "@/modules/short-videos/components/short-type";
import { ScripterPicker } from "@/modules/short-videos/components/scripter-picker";
import type { DatedShort, ShortTeamSettings, TeamPerson } from "@/modules/short-videos/lib/queries";
import { ScheduleField, type ScheduleValue } from "@/modules/short-videos/components/schedule-field";
import { PlatformPicker } from "@/modules/short-videos/components/platform-picker";
import { PersonSelect } from "@/modules/short-videos/components/person-select";
import { formatShortDate } from "@/modules/short-videos/lib/dates";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="block text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-2">
      {children}
      {hint && <span className="normal-case font-medium text-ink-faint"> {hint}</span>}
    </span>
  );
}

export function NewShortForm({
  canAssignPeople,
  people,
  planned,
  settings,
  nextSlot,
  limits,
  queueStart,
  canStartQueue,
}: {
  canAssignPeople: boolean;
  people: TeamPerson[];
  planned: DatedShort[];
  settings: ShortTeamSettings;
  nextSlot: string | null;
  limits: Record<string, number>;
  queueStart: { id: string; number: number; date: string } | null;
  canStartQueue: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const titleRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState<ScheduleValue>({ mode: "auto" });
  // Start from the team defaults — change them only when you need someone else.
  const [editor, setEditor] = useState<string | null>(settings.defaultEditor);
  const [reviewer, setReviewer] = useState<string | null>(settings.defaultReviewer);
  const [scheduler, setScheduler] = useState<string | null>(settings.defaultScheduler);
  const [scripterIds, setScripterIds] = useState<string[]>(settings.defaultScripter ? [settings.defaultScripter] : []);
  const [platforms, setPlatforms] = useState<Platform[]>([...PLATFORMS]);
  const [caption, setCaption] = useState("");
  // Captions are automatic for normal shorts; switch on only for special ones.
  const [captionOn, setCaptionOn] = useState(false);
  const [shortType, setShortType] = useState<ShortType>(settings.defaultType);
  const [error, setError] = useState<string | null>(null);

  function submit(addAnother: boolean) {
    setError(null);
    if (!title.trim()) {
      setError("Give the short a title.");
      titleRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const res = await createShort({
        title,
        plannedDate: schedule.mode === "pinned" ? schedule.date : null,
        pinKind: schedule.mode === "pinned" ? schedule.kind : undefined,
        editorMemberId: editor,
        reviewerMemberId: reviewer,
        schedulerMemberId: scheduler,
        platforms,
        caption,
        captionEnabled: captionOn,
        shortType,
        ...(canAssignPeople ? { scripterIds } : {}),
      });
      if (!("id" in res) || !res.id) {
        const message = res.error ?? "Couldn't create the short. Try again.";
        setError(message);
        toast.error(message);
        return;
      }
      const when = res.plannedDate ? ` for ${formatShortDate(res.plannedDate)}` : "";
      if (addAnother) {
        toast.success(`#${res.number} scheduled${when}. Add the next one`);
        setTitle("");
        setCaption("");
        setCaptionOn(false);
        titleRef.current?.focus();
        router.refresh(); // refreshes the next Auto date too
      } else {
        toast.success(`#${res.number} created${when}`);
        router.push(`/shorts/${res.id}`);
      }
    });
  }

  const titleLen = title.trim().length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-7"
    >
      <div>
        <label htmlFor="short-title">
          <Label>Title</Label>
        </label>
        <input
          id="short-title"
          ref={titleRef}
          autoFocus
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Why Restarting Fixes 99% of Problems"
          className="w-full rounded-xl border border-line/15 bg-surface px-4 h-12 text-[16px] font-semibold outline-none focus:ring-2 focus:ring-amber"
        />
        <p className={`mt-1.5 text-[11.5px] ${titleLen > YOUTUBE_TITLE_LIMIT ? "text-amber" : "text-ink-faint"}`}>
          {titleLen}/{YOUTUBE_TITLE_LIMIT}
          {titleLen > YOUTUBE_TITLE_LIMIT ? ". YouTube cuts titles off after 100" : " · YouTube title limit"}
        </p>
      </div>

      <div>
        <Label>Type</Label>
        <ShortTypePicker value={shortType} onChange={setShortType} />
      </div>

      <div>
        <Label>Post date</Label>
        <ScheduleField
          value={schedule}
          onChange={setSchedule}
          autoDate={nextSlot}
          planned={planned}
          perDay={settings.perDay}
          weekends={settings.weekends}
          limits={limits}
          queueStart={queueStart}
          canStartQueue={canStartQueue}
        />
      </div>

      {canAssignPeople ? (
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label>Scripters</Label>
            <ScripterPicker
              people={people}
              value={scripterIds}
              onAdd={(m) => setScripterIds((ids) => [...ids.filter((x) => x !== m), m])}
              onRemove={(m) => setScripterIds((ids) => ids.filter((x) => x !== m))}
            />
            <p className="mt-1.5 text-[11.5px] text-ink-faint">Only these people (and masters) can edit the script.</p>
          </div>
          <div>
            <Label>Editor</Label>
            <PersonSelect kind="editor" people={people} value={editor} onChange={setEditor} />
          </div>
          <div>
            <Label>Reviewer</Label>
            <PersonSelect kind="reviewer" people={people} value={reviewer} onChange={setReviewer} />
          </div>
          <div>
            <Label>Scheduler</Label>
            <PersonSelect kind="scheduler" people={people} value={scheduler} onChange={setScheduler} />
          </div>
          <p className="sm:col-span-3 -mt-2 text-[11.5px] text-ink-faint">
            Pre-filled from your team defaults (Team → Short videos). Each person is notified when it&rsquo;s their turn.
          </p>
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-faint">The scripter, editor, reviewer and scheduler come from your team&rsquo;s defaults.</p>
      )}

      <div>
        <Label>Post to</Label>
        <PlatformPicker value={platforms} onChange={setPlatforms} />
      </div>

      <div className="space-y-3">
        <Switch
          checked={captionOn}
          onChange={setCaptionOn}
          label="Custom caption"
          hint="Off uses the automatic caption. Turn on for special shorts."
        />
        {captionOn && (
          <textarea
            aria-label="Caption"
            value={caption}
            maxLength={5000}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Caption + hashtags"
            className="w-full rounded-xl border border-line/15 bg-surface px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-amber resize-y"
          />
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red/30 bg-red/10 text-red text-[13px] px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-amber text-white font-bold px-6 h-11 text-[14.5px] shadow-[0_3px_0_0_rgb(var(--amber)/0.5)] hover:brightness-105 active:translate-y-[2px] active:shadow-none disabled:opacity-50 transition-all"
        >
          {pending ? "Creating…" : "Create short"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(true)}
          className="rounded-xl border border-line/15 px-5 h-11 text-[14px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 disabled:opacity-50 transition-colors"
        >
          Create &amp; add another
        </button>
      </div>
    </form>
  );
}
