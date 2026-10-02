"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarIcon, ExternalIcon, PlusIcon } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/mascot";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { durationLabel, isPast, RSVP_LABEL, type Meeting, type MeetingPerson } from "../lib/types";
import type { MyAction } from "../lib/queries";
import { Countdown, LocalTime } from "./local-time";
import { MeetingDialog } from "./meeting-dialog";
import { RsvpButtons } from "./rsvp";
import { MeetingsRealtime } from "./meetings-realtime";

/** A month/day tile in the meetings colour. */
export function DateTile({ iso, size = "md", muted = false }: { iso: string; size?: "md" | "lg"; muted?: boolean }) {
  const [d, setD] = useState<Date | null>(null);
  useEffect(() => setD(new Date(iso)), [iso]);
  const big = size === "lg";
  return (
    <span
      className={`flex-shrink-0 rounded-xl flex flex-col items-center justify-center leading-none ${big ? "w-16 h-[72px]" : "w-12 h-[52px]"} ${muted ? "bg-surface-2 text-ink-soft" : "bg-violet/12 text-violet"}`}
      aria-hidden
      suppressHydrationWarning
    >
      <span className={`${big ? "text-[11px]" : "text-[9.5px]"} font-extrabold uppercase tracking-[0.1em]`}>{d ? d.toLocaleDateString(undefined, { month: "short" }) : " "}</span>
      <span className={`${big ? "text-[28px]" : "text-[20px]"} font-display font-semibold mt-0.5`}>{d ? d.getDate() : " "}</span>
    </span>
  );
}

export function AvatarStack({ people, max = 5 }: { people: MeetingPerson[]; max?: number }) {
  if (!people.length) return null;
  return (
    <span className="flex items-center -space-x-1.5">
      {people.slice(0, max).map((p) => (
        <PersonAvatar key={p.userId} name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-6 h-6 text-[9px] ring-2 ring-surface" />
      ))}
      {people.length > max && <span className="w-6 h-6 rounded-full bg-surface-2 ring-2 ring-surface text-[9.5px] font-bold text-ink-soft flex items-center justify-center">+{people.length - max}</span>}
    </span>
  );
}

export function MeetingsHome({
  teamId,
  upcoming,
  past,
  myActions,
  people,
  canOrganize,
}: {
  teamId: string;
  upcoming: Meeting[];
  past: Meeting[];
  myActions: MyAction[];
  people: MeetingPerson[];
  canOrganize: boolean;
}) {
  const [planning, setPlanning] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  // Still-running meetings count as upcoming until they end.
  const live = upcoming.filter((m) => now === null || !isPast(m, now));
  const next = live.find((m) => m.status === "scheduled") ?? null;
  const rest = live.filter((m) => m !== next);
  // Ended in the last hours: already in "Earlier", newest first.
  const earlier = [...upcoming.filter((m) => now !== null && isPast(m, now)).reverse(), ...past];

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1100px] mx-auto">
      <MeetingsRealtime teamId={teamId} />
      <div className="flex items-start justify-between gap-6 mb-7 flex-wrap">
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Meetings</h1>
          <p className="text-[14.5px] text-ink-soft">Plan the team&rsquo;s calls, answer if you&rsquo;re coming, keep the notes and what to do next.</p>
        </div>
        {canOrganize && (
          <button
            type="button"
            onClick={() => setPlanning(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-11 text-[14.5px] shadow-[0_3px_0_0_rgb(var(--amber)/0.5)] hover:brightness-105 active:translate-y-[2px] active:shadow-none transition-all"
          >
            <PlusIcon className="w-4 h-4" strokeWidth={2.25} />
            Plan a meeting
          </button>
        )}
      </div>

      {!next && !rest.length && !earlier.length ? (
        <div className="rounded-2xl border-2 border-dashed border-line/15 py-14 px-6 text-center flex flex-col items-center">
          <Mascot mood="idle" size={110} />
          <p className="text-[16px] font-semibold mt-3">No meetings planned</p>
          <p className="text-[13.5px] text-ink-soft mt-1 max-w-sm">
            {canOrganize ? "Plan the next one: everyone invited gets told now and reminded 3 days, 1 day and 1 hour before." : "When a master or scheduler plans one, it shows up here and you'll get a notification."}
          </p>
          {canOrganize && (
            <button type="button" onClick={() => setPlanning(true)} className="mt-5 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px]">
              Plan a meeting
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {next && <NextUp m={next} />}

          {myActions.length > 0 && (
            <section>
              <h2 className="text-[11.5px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Your action items</h2>
              <div className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/10 overflow-hidden">
                {myActions.map((a) => (
                  <Link key={a.id} href={`/meetings/${a.meetingId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                    <span className="w-2 h-2 rounded-full bg-violet flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold truncate">{a.text}</span>
                      <span className="block text-[12px] text-ink-soft truncate">From {a.meetingTitle}</span>
                    </span>
                    {a.dueDate && <span className="text-[12px] font-semibold text-ink-soft tabular-nums">{new Date(`${a.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h2 className="text-[11.5px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Coming up</h2>
              <div className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/10 overflow-hidden motion-stagger">
                {rest.map((m) => (
                  <Row key={m.id} m={m} />
                ))}
              </div>
            </section>
          )}

          {earlier.length > 0 && (
            <section>
              <h2 className="text-[11.5px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Earlier</h2>
              <div className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/10 overflow-hidden">
                {earlier.map((m) => (
                  <Row key={m.id} m={m} past />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {canOrganize && <MeetingDialog open={planning} onClose={() => setPlanning(false)} teamId={teamId} people={people} />}
    </div>
  );
}

function NextUp({ m }: { m: Meeting }) {
  const going = m.attendees.filter((a) => a.rsvp === "yes").map((a) => a.person);
  const agenda = m.agenda.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <section className="relative overflow-hidden rounded-3xl border border-violet/25 bg-surface">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 w-72 h-72 rounded-full bg-violet/10 blur-2xl" />
      <div className="relative p-5 sm:p-7">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet">Next meeting</span>
          <span className="rounded-full bg-violet/12 text-violet px-2.5 h-6 inline-flex items-center text-[12px] font-bold">
            <Countdown iso={m.startsAt} durationMin={m.durationMin} />
          </span>
        </div>
        <div className="flex items-start gap-4">
          <DateTile iso={m.startsAt} size="lg" />
          <div className="min-w-0 flex-1">
            <Link href={`/meetings/${m.id}`} className="block font-display text-[24px] sm:text-[28px] font-semibold leading-tight hover:underline decoration-violet/40 underline-offset-4">
              {m.title}
            </Link>
            <p className="mt-1 text-[14px] text-ink-soft">
              <LocalTime iso={m.startsAt} format="full" className="font-semibold text-ink" /> · {durationLabel(m.durationMin)} · {m.location}
            </p>
            {agenda.length > 0 && (
              <ul className="mt-3 space-y-0.5 text-[13.5px] text-ink-soft">
                {agenda.slice(0, 3).map((l, i) => (
                  <li key={i} className="truncate">
                    {l}
                  </li>
                ))}
                {agenda.length > 3 && <li className="text-ink-faint">and {agenda.length - 3} more…</li>}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-5 pt-5 border-t border-line/10 flex items-center gap-3 flex-wrap">
          <RsvpButtons meetingId={m.id} value={m.myRsvp} />
          <span className="flex-1" />
          {going.length > 0 && (
            <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-soft">
              <AvatarStack people={going} />
              {going.length} going
            </span>
          )}
          {m.link && (
            <a href={m.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-violet text-white font-bold px-4 h-10 text-[13.5px] hover:brightness-110">
              <ExternalIcon className="w-4 h-4" />
              Join
            </a>
          )}
          <Link href={`/meetings/${m.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-4 h-10 text-[13.5px] font-semibold hover:bg-surface-2">
            <CalendarIcon className="w-4 h-4" />
            Open
          </Link>
        </div>
      </div>
    </section>
  );
}

function Row({ m, past = false }: { m: Meeting; past?: boolean }) {
  const cancelled = m.status === "cancelled";
  const going = m.attendees.filter((a) => a.rsvp === "yes").map((a) => a.person);
  const open = m.actions.filter((a) => !a.done).length;
  return (
    <Link href={`/meetings/${m.id}`} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-2/60 transition-colors">
      <DateTile iso={m.startsAt} muted={past || cancelled} />
      <span className="flex-1 min-w-0">
        <span className={`block text-[15px] font-semibold truncate ${cancelled ? "line-through text-ink-soft" : ""}`}>{m.title}</span>
        <span className="block text-[12.5px] text-ink-soft truncate">
          <LocalTime iso={m.startsAt} format="time" /> · {durationLabel(m.durationMin)} · {m.location}
          {past && (m.notes.trim() ? " · Notes" : "")}
          {past && m.actions.length > 0 ? ` · ${open ? `${open} open action item${open === 1 ? "" : "s"}` : "All action items done"}` : ""}
        </span>
      </span>
      {cancelled ? (
        <span className="text-[11px] font-bold uppercase tracking-wide text-red">Cancelled</span>
      ) : (
        <>
          <span className="hidden sm:inline-flex">
            <AvatarStack people={going} max={4} />
          </span>
          {!past && m.myRsvp && (
            <span className={`text-[12px] font-semibold ${m.myRsvp === "yes" ? "text-green" : m.myRsvp === "maybe" ? "text-gold" : "text-ink-faint"}`}>{m.myRsvp === "pending" ? "Answer" : RSVP_LABEL[m.myRsvp]}</span>
          )}
        </>
      )}
    </Link>
  );
}
