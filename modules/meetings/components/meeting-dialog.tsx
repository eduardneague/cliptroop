"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { DateChip } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { createMeeting, updateMeeting } from "@/app/(dashboard)/meetings/actions";
import { DURATIONS, durationLabel, type Meeting, type MeetingPerson } from "../lib/types";
import { sounds } from "@/lib/sounds";

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);
const PLACES = ["Discord", "Google Meet", "Zoom", "In person"];

const field = "w-full rounded-xl border border-line/15 bg-surface px-3.5 h-11 text-[14px] outline-none focus:ring-2 focus:ring-amber";
const label = "block text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-1.5";

/**
 * Plan a meeting, or change one. Day + time are picked in your own time
 * zone and saved as one moment, so everyone sees it in theirs.
 */
export function MeetingDialog({
  open,
  onClose,
  teamId,
  people,
  meeting,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  people: MeetingPerson[];
  /** Editing this one (else: a new meeting). */
  meeting?: Meeting | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState(60);
  const [place, setPlace] = useState("Discord");
  const [link, setLink] = useState("");
  const [agenda, setAgenda] = useState("");
  const [everyone, setEveryone] = useState(true);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Fill in when it opens (a new one: tomorrow at 18:00 on Discord).
  useEffect(() => {
    if (!open) return;
    if (meeting) {
      const d = new Date(meeting.startsAt);
      setTitle(meeting.title);
      setDay(localDay(d));
      setTime(localTime(d));
      setDuration(meeting.durationMin);
      setPlace(meeting.location);
      setLink(meeting.link ?? "");
      setAgenda(meeting.agenda);
    } else {
      const t = new Date(Date.now() + 86_400_000);
      setTitle("");
      setDay(localDay(t));
      setTime("18:00");
      setDuration(60);
      setPlace("Discord");
      setLink("");
      setAgenda("");
      setEveryone(true);
      setChosen(new Set(people.map((p) => p.userId)));
    }
  }, [open, meeting, people]);

  const timeOptions = useMemo(
    () => TIMES.map((t) => ({ value: t, label: new Date(`2000-01-01T${t}:00`).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) })),
    []
  );
  const durationOptions = useMemo(() => {
    const list = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);
    return list.map((d) => ({ value: String(d), label: durationLabel(d) }));
  }, [duration]);

  async function submit() {
    if (!title.trim()) return toast.error("Give the meeting a name.");
    if (!day) return toast.error("Pick a day.");
    const startsAt = new Date(`${day}T${time}:00`).toISOString();
    setBusy(true);
    const input = { title, startsAt, durationMin: duration, location: place, link: link.trim() || null, agenda };
    const r = meeting
      ? await updateMeeting(meeting.id, { ...input, agenda: undefined })
      : await createMeeting({ ...input, teamId, invite: everyone ? "all" : [...chosen] });
    setBusy(false);
    if (r.error !== undefined) return toast.error(r.error);
    sounds.success();
    toast.success(meeting ? "Meeting updated. Everyone invited was told." : "Meeting planned. Everyone invited was told.", { sound: false });
    onClose();
    if (!meeting && "id" in r) router.push(`/meetings/${r.id}`);
    else router.refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={meeting ? "Change the meeting" : "Plan a meeting"}
      description={meeting ? "Moving it tells everyone invited." : "Everyone invited gets a notification now, and reminders 3 days, 1 day and 1 hour before."}
      width="sm:max-w-xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} data-sound="none" className="rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60">
            {busy ? "Saving…" : meeting ? "Save" : "Plan meeting"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <label className="block">
          <span className={label}>Name</span>
          <input
            data-autofocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            maxLength={120}
            placeholder="Monthly planning, Sponsor sync…"
            className={field}
          />
        </label>

        <div>
          <span className={label}>When</span>
          <div className="flex items-center gap-2 flex-wrap">
            <DateChip value={day} onChange={setDay} ariaLabel="Meeting day" />
            <div className="w-32">
              <Select value={time} onChange={(v) => v && setTime(v)} options={timeOptions} ariaLabel="Start time" menuMinWidth={140} />
            </div>
            <div className="w-32">
              <Select value={String(duration)} onChange={(v) => v && setDuration(Number(v))} options={durationOptions} ariaLabel="How long" menuMinWidth={140} />
            </div>
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-faint">Your time ({Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")}). Everyone sees it in theirs.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
          <div>
            <span className={label}>Where</span>
            <input value={place} onChange={(e) => setPlace(e.target.value)} list="meeting-places" maxLength={120} className={field} />
            <datalist id="meeting-places">
              {PLACES.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <label className="block">
            <span className={label}>
              Link <span className="normal-case font-medium text-ink-faint">(optional)</span>
            </span>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://discord.gg/…" inputMode="url" className={field} />
          </label>
        </div>

        {!meeting && (
          <>
            <label className="block">
              <span className={label}>
                Agenda <span className="normal-case font-medium text-ink-faint">(optional)</span>
              </span>
              <textarea
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                rows={4}
                placeholder={"1. What we posted\n2. Next month's plan\n3. Sponsors"}
                className="w-full rounded-xl border border-line/15 bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-amber resize-y"
              />
            </label>

            <div>
              <span className={label}>Who&rsquo;s invited</span>
              <div role="radiogroup" className="inline-flex rounded-lg border border-line/15 p-0.5 mb-2.5">
                {[
                  [true, "Everyone on the team"],
                  [false, "Choose people"],
                ].map(([v, l]) => (
                  <button
                    key={String(v)}
                    type="button"
                    role="radio"
                    aria-checked={everyone === v}
                    onClick={() => setEveryone(v as boolean)}
                    className={`px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors ${everyone === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
                  >
                    {l as string}
                  </button>
                ))}
              </div>
              {!everyone && (
                <div className="flex flex-wrap gap-1.5 animate-[fadein_.15s_ease]">
                  {people.map((p) => {
                    const on = chosen.has(p.userId);
                    return (
                      <button
                        key={p.userId}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setChosen((s) => {
                            const n = new Set(s);
                            if (n.has(p.userId)) n.delete(p.userId);
                            else n.add(p.userId);
                            return n;
                          })
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full border pl-1 pr-3 h-8 text-[12.5px] font-semibold transition-colors ${
                          on ? "border-violet/50 bg-violet/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink"
                        }`}
                      >
                        <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className={`w-6 h-6 text-[9px] ${on ? "" : "opacity-60"}`} />
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
