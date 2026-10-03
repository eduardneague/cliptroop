"use client";

import Link from "next/link";
import { ExternalIcon } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/mascot";
import { useBox } from "./widget-box";
import { durationLabel, type Meeting } from "@/modules/meetings/lib/types";
import { Countdown, LocalTime } from "@/modules/meetings/components/local-time";
import { RsvpButtons } from "@/modules/meetings/components/rsvp";
import { AvatarStack, DateTile } from "@/modules/meetings/components/meetings-home";

/** Next meeting: when, where, who's coming, and your answer right here. */
export function MeetingsWidget({ meetings }: { meetings: Meeting[] }) {
  const box = useBox();
  const now = Date.now();
  const list = meetings.filter((m) => m.status === "scheduled" && Date.parse(m.startsAt) + m.durationMin * 60_000 > now);
  const next = list[0];
  if (!next)
    return (
      <div className="h-full flex items-center gap-3 animate-[fadein_.3s_ease]">
        <Mascot mood="idle" size={Math.max(48, Math.min(80, box.h - 16))} />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold">No meetings planned</p>
          <Link href="/meetings" className="text-[12.5px] font-semibold text-amber hover:brightness-110">
            Meetings →
          </Link>
        </div>
      </div>
    );
  const going = next.attendees.filter((a) => a.rsvp === "yes").map((a) => a.person);
  const tall = box.h >= 150;
  const roomy = box.h >= 230;
  const soon = Date.parse(next.startsAt) - now < 2 * 3_600_000;
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-start gap-3">
        <DateTile iso={next.startsAt} />
        <div className="min-w-0 flex-1">
          <Link href={`/meetings/${next.id}`} className="block text-[14.5px] font-semibold leading-snug truncate hover:underline">
            {next.title}
          </Link>
          <p className="text-[12px] text-ink-soft truncate">
            <LocalTime iso={next.startsAt} format="time" /> · {durationLabel(next.durationMin)} · {next.location}
          </p>
          <span className="mt-1 inline-flex rounded-full bg-violet/12 text-violet px-2 h-5 items-center text-[11px] font-bold">
            <Countdown iso={next.startsAt} durationMin={next.durationMin} />
          </span>
        </div>
        {next.link && soon && (
          <a href={next.link} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-violet text-white dark:text-paper font-bold px-2.5 h-8 text-[12px] hover:brightness-110">
            <ExternalIcon className="w-3.5 h-3.5" />
            Join
          </a>
        )}
      </div>
      {tall && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <RsvpButtons meetingId={next.id} value={next.myRsvp} size="sm" />
          {going.length > 0 && box.w > 330 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
              <AvatarStack people={going} max={4} />
            </span>
          )}
        </div>
      )}
      {roomy && list.length > 1 && (
        <ul className="mt-3 pt-2.5 border-t border-line/10 space-y-1.5 min-h-0 overflow-hidden">
          {list.slice(1, 4).map((m) => (
            <li key={m.id}>
              <Link href={`/meetings/${m.id}`} className="flex items-center gap-2 text-[12.5px] hover:text-ink text-ink-soft">
                <span className="w-1.5 h-1.5 rounded-full bg-violet flex-shrink-0" />
                <span className="truncate flex-1 text-ink">{m.title}</span>
                <LocalTime iso={m.startsAt} format="day" className="flex-shrink-0 tabular-nums" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
