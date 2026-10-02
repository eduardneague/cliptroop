/** Meetings: shared types and small helpers (safe on client and server). */

export type Rsvp = "pending" | "yes" | "maybe" | "no";

export type MeetingPerson = { userId: string; name: string; username: string | null; avatarUrl: string | null; color: string };

export type MeetingAction = {
  id: string;
  text: string;
  owner: MeetingPerson | null;
  dueDate: string | null;
  done: boolean;
  createdBy: string | null;
};

export type Meeting = {
  id: string;
  teamId: string;
  title: string;
  startsAt: string;
  durationMin: number;
  location: string;
  link: string | null;
  agenda: string;
  notes: string;
  status: "scheduled" | "cancelled";
  createdBy: MeetingPerson | null;
  attendees: { person: MeetingPerson; rsvp: Rsvp }[];
  actions: MeetingAction[];
  myRsvp: Rsvp | null;
};

export const RSVP_LABEL: Record<Rsvp, string> = { pending: "No answer", yes: "Going", maybe: "Maybe", no: "Can't make it" };

export const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export const endsAt = (m: Pick<Meeting, "startsAt" | "durationMin">) => new Date(Date.parse(m.startsAt) + m.durationMin * 60_000).toISOString();

export const isPast = (m: Pick<Meeting, "startsAt" | "durationMin">, now = Date.now()) => Date.parse(endsAt(m)) < now;

/** "45 min", "1 h", "1 h 30 min". */
export function durationLabel(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** "Add to Google Calendar" link. */
export function googleCalendarUrl(m: Pick<Meeting, "title" | "startsAt" | "durationMin" | "location" | "link" | "agenda">) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title,
    dates: `${icsDate(m.startsAt)}/${icsDate(endsAt(m))}`,
    details: [m.link ? `Join: ${m.link}` : "", m.agenda].filter(Boolean).join("\n\n").slice(0, 1500),
    location: m.link ? `${m.location} (${m.link})` : m.location,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** A one-event .ics file (Apple Calendar, Outlook, Google import). */
export function meetingIcs(m: Pick<Meeting, "id" | "title" | "startsAt" | "durationMin" | "location" | "link" | "agenda" | "status">, url: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VPlanner//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${m.id}@vplanner`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(m.startsAt)}`,
    `DTEND:${icsDate(endsAt(m))}`,
    `SUMMARY:${icsText(m.title)}`,
    `LOCATION:${icsText(m.link ? `${m.location} (${m.link})` : m.location)}`,
    `DESCRIPTION:${icsText([m.agenda, `Open in VPlanner: ${url}`].filter(Boolean).join("\n\n"))}`,
    `URL:${url}`,
    `STATUS:${m.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(m.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // Lines longer than 75 octets are folded (RFC 5545).
  return lines.map((l) => (l.length > 74 ? l.match(/.{1,74}/g)!.join("\r\n ") : l)).join("\r\n") + "\r\n";
}
