"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, CheckIcon, CloseIcon, DownloadIcon, EditIcon, ExternalIcon, PlusIcon, TrashIcon, UsersIcon } from "@/components/ui/icons";
import { markDoneConfirm, useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { Dialog } from "@/components/ui/dialog";
import { DateChip } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { addAction, deleteAction, deleteMeeting, saveMeetingText, setInvitees, setMeetingCancelled, updateAction } from "@/app/(dashboard)/meetings/actions";
import { sounds } from "@/lib/sounds";
import { durationLabel, googleCalendarUrl, isPast, RSVP_LABEL, type Meeting, type MeetingAction, type MeetingPerson, type Rsvp } from "../lib/types";
import { Countdown, LocalTime } from "./local-time";
import { MeetingDialog } from "./meeting-dialog";
import { RsvpButtons } from "./rsvp";
import { MeetingsRealtime } from "./meetings-realtime";

const RSVP_DOT: Record<Rsvp, string> = { yes: "bg-green", maybe: "bg-gold", no: "bg-ink-faint", pending: "bg-line/40" };

export function MeetingDetail({ meeting, people, canOrganize, me }: { meeting: Meeting; people: MeetingPerson[]; canOrganize: boolean; me: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const past = now !== null && isPast(meeting, now);
  const cancelled = meeting.status === "cancelled";

  const counts = useMemo(() => {
    const c: Record<Rsvp, number> = { yes: 0, maybe: 0, no: 0, pending: 0 };
    meeting.attendees.forEach((a) => c[a.rsvp]++);
    return c;
  }, [meeting.attendees]);

  async function cancelToggle() {
    if (!cancelled && !(await confirm({ title: "Cancel this meeting?", description: "Everyone invited gets told. You can bring it back later.", confirmLabel: "Cancel meeting", cancelLabel: "Keep it", danger: true }))) return;
    const r = await setMeetingCancelled(meeting.id, !cancelled);
    if (r.error !== undefined) return toast.error(r.error);
    toast.success(cancelled ? "The meeting is back on." : "Meeting cancelled. Everyone was told.");
    router.refresh();
  }
  async function remove() {
    if (!(await confirm({ title: "Delete this meeting?", description: "Its agenda, notes and action items are deleted too. This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
    const r = await deleteMeeting(meeting.id);
    if (r.error !== undefined) return toast.error(r.error);
    toast.success("Meeting deleted.");
    router.push("/meetings");
  }

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1200px] mx-auto">
      <MeetingsRealtime teamId={meeting.teamId} meetingId={meeting.id} />
      <Link href="/meetings" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-4">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Meetings
      </Link>

      {/* Title + organizer tools */}
      <div className="flex items-start gap-3 mb-2">
        <span className="mt-1 w-10 h-10 rounded-xl bg-violet/12 text-violet flex items-center justify-center flex-shrink-0" aria-hidden>
          <UsersIcon className="w-5 h-5" />
        </span>
        <h1 className={`flex-1 min-w-0 font-display text-[26px] sm:text-3xl font-semibold leading-tight ${cancelled ? "line-through text-ink-soft" : ""}`}>{meeting.title}</h1>
        {canOrganize && (
          <div className="flex-shrink-0 flex items-center gap-1 pt-1">
            <button type="button" onClick={() => setEditing(true)} aria-label="Change the meeting" title="Change" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
              <EditIcon className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => void remove()} aria-label="Delete the meeting" title="Delete" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-red hover:bg-red/10">
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-6 text-[13.5px] text-ink-soft pl-[52px]">
        {cancelled ? (
          <span className="rounded-full bg-red/12 text-red px-2.5 h-6 inline-flex items-center text-[11.5px] font-bold uppercase tracking-wide">Cancelled</span>
        ) : (
          <span className={`rounded-full px-2.5 h-6 inline-flex items-center text-[12px] font-bold ${past ? "bg-surface-2 text-ink-soft" : "bg-violet/12 text-violet"}`}>
            <Countdown iso={meeting.startsAt} durationMin={meeting.durationMin} />
          </span>
        )}
        <LocalTime iso={meeting.startsAt} format="full" className="font-semibold text-ink" />
        <span className="text-ink-faint">·</span>
        <span>{durationLabel(meeting.durationMin)}</span>
        <span className="text-ink-faint">·</span>
        <span>{meeting.location}</span>
        {meeting.createdBy && <span className="hidden sm:inline text-ink-faint">· Planned by {meeting.createdBy.name}</span>}
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 sm:gap-6">
        <div className="space-y-5 sm:space-y-6 min-w-0">
          {/* Your answer + join + add to calendar */}
          {!cancelled && (
            <section className="rounded-2xl border border-violet/25 bg-violet/[0.05] p-4 sm:p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[10rem]">
                  <p className="text-[14.5px] font-semibold">{past ? "How did it go?" : "Are you coming?"}</p>
                  <p className="text-[12.5px] text-ink-soft">
                    {meeting.myRsvp && meeting.myRsvp !== "pending" ? `You said: ${RSVP_LABEL[meeting.myRsvp]}.` : past ? "This meeting has ended." : "Let the team know."}
                  </p>
                </div>
                {!past && <RsvpButtons meetingId={meeting.id} value={meeting.myRsvp} />}
              </div>
              <div className="mt-4 pt-4 border-t border-violet/15 flex items-center gap-2 flex-wrap">
                {meeting.link && (
                  <a href={meeting.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-violet text-white dark:text-paper font-bold px-4 h-10 text-[13.5px] hover:brightness-110">
                    <ExternalIcon className="w-4 h-4" />
                    Join on {meeting.location}
                  </a>
                )}
                <a href={googleCalendarUrl(meeting)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3.5 h-10 text-[13px] font-semibold hover:border-line/40 hover:bg-surface-2">
                  <CalendarIcon className="w-4 h-4" />
                  Google Calendar
                </a>
                <a href={`/api/meetings/${meeting.id}/ics`} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3.5 h-10 text-[13px] font-semibold hover:border-line/40 hover:bg-surface-2">
                  <DownloadIcon className="w-4 h-4" />
                  Apple / Outlook (.ics)
                </a>
              </div>
            </section>
          )}

          <TextSection meetingId={meeting.id} field="agenda" title="Agenda" value={meeting.agenda} canEdit={canOrganize} placeholder={"What you'll talk about, one per line.\n1. What we posted\n2. Next month's plan"} empty="No agenda yet." />
          <TextSection meetingId={meeting.id} field="notes" title="Notes" value={meeting.notes} canEdit={canOrganize} placeholder="Notes from the meeting: decisions, ideas, links." empty="No notes yet." />
          <Actions meeting={meeting} people={people} me={me} canOrganize={canOrganize} />
        </div>

        <aside className="space-y-5 sm:space-y-6">
          <section className="rounded-2xl border border-line/10 bg-surface p-5">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft flex-1">People</h2>
              {canOrganize && !cancelled && (
                <button type="button" onClick={() => setInviting(true)} className="text-[12.5px] font-semibold text-amber hover:brightness-110">
                  Edit list
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 text-[12px] text-ink-soft mb-3 flex-wrap">
              {(["yes", "maybe", "no", "pending"] as Rsvp[]).map((r) =>
                counts[r] ? (
                  <span key={r} className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${RSVP_DOT[r]}`} />
                    <b className="text-ink tabular-nums">{counts[r]}</b> {RSVP_LABEL[r].toLowerCase()}
                  </span>
                ) : null
              )}
            </div>
            <ul className="space-y-1">
              {meeting.attendees.map((a) => (
                <li key={a.person.userId} className="flex items-center gap-2.5 py-1.5">
                  <span className="relative">
                    <PersonAvatar name={a.person.name} avatarUrl={a.person.avatarUrl} color={a.person.color} className="w-8 h-8 text-[11px]" />
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-surface ${RSVP_DOT[a.rsvp]}`} aria-hidden />
                  </span>
                  <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">
                    {a.person.name}
                    {a.person.userId === me && <span className="text-ink-faint font-medium"> (you)</span>}
                  </span>
                  <span className={`text-[11.5px] font-semibold ${a.rsvp === "yes" ? "text-green" : a.rsvp === "maybe" ? "text-gold" : "text-ink-faint"}`}>{RSVP_LABEL[a.rsvp]}</span>
                </li>
              ))}
              {!meeting.attendees.length && <li className="text-[13px] text-ink-soft">Nobody invited yet.</li>}
            </ul>
          </section>
          {canOrganize && (
            <button type="button" onClick={() => void cancelToggle()} className={`w-full rounded-xl border px-4 h-11 text-[13.5px] font-semibold transition-colors ${cancelled ? "border-line/20 hover:bg-surface-2" : "border-red/30 text-red hover:bg-red/10"}`}>
              {cancelled ? "Bring the meeting back" : "Cancel the meeting"}
            </button>
          )}
        </aside>
      </div>

      {canOrganize && <MeetingDialog open={editing} onClose={() => setEditing(false)} teamId={meeting.teamId} people={people} meeting={meeting} />}
      {canOrganize && <InviteDialog open={inviting} onClose={() => setInviting(false)} meeting={meeting} people={people} me={me} />}
    </div>
  );
}

/** Agenda / notes: plain text, saved as you type (organizers), read-only for the rest. */
function TextSection({ meetingId, field, title, value, canEdit, placeholder, empty }: { meetingId: string; field: "agenda" | "notes"; title: string; value: string; canEdit: boolean; placeholder: string; empty: string }) {
  const toast = useToast();
  const [text, setText] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(value);
  const focused = useRef(false);
  // Someone else changed it (and you're not typing): show theirs.
  useEffect(() => {
    if (!focused.current && value !== last.current) {
      setText(value);
      last.current = value;
    }
  }, [value]);
  const save = (t: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (t === last.current) return;
      setState("saving");
      const r = await saveMeetingText(meetingId, field, t);
      if (r.error !== undefined) {
        setState("idle");
        toast.error(r.error);
        return;
      }
      last.current = t;
      setState("saved");
    }, 700);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft flex-1">{title}</h2>
        {canEdit && state !== "idle" && (
          <span className="text-[11.5px] font-semibold text-ink-faint inline-flex items-center gap-1">
            {state === "saved" && <CheckIcon className="w-3.5 h-3.5 text-green" />}
            {state === "saving" ? "Saving…" : "Saved"}
          </span>
        )}
      </div>
      {canEdit ? (
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            save(e.target.value);
          }}
          onFocus={() => (focused.current = true)}
          onBlur={() => (focused.current = false)}
          placeholder={placeholder}
          rows={Math.min(18, Math.max(4, text.split("\n").length + 1))}
          className="w-full rounded-xl border border-line/10 bg-paper/40 px-3.5 py-3 text-[14px] leading-relaxed outline-none focus:ring-2 focus:ring-amber resize-y"
        />
      ) : text.trim() ? (
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{text}</p>
      ) : (
        <p className="text-[13.5px] text-ink-faint">{empty}</p>
      )}
    </section>
  );
}

function Actions({ meeting, people, me, canOrganize }: { meeting: Meeting; people: MeetingPerson[]; me: string; canOrganize: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [list, setList] = useState<MeetingAction[]>(meeting.actions);
  useEffect(() => setList(meeting.actions), [meeting.actions]);
  const [text, setText] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ownerOptions = people.map((p) => ({ value: p.userId, label: p.userId === me ? `${p.name} (you)` : p.name, icon: <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-5 h-5 text-[8px]" /> }));
  const open = list.filter((a) => !a.done).length;

  function add() {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      const r = await addAction(meeting.id, { text: t, ownerId: owner, dueDate: due });
      if (r.error !== undefined) return toast.error(r.error);
      sounds.pop();
      setText("");
      setOwner(null);
      setDue(null);
      router.refresh();
    });
  }
  async function toggle(a: MeetingAction) {
    if (!a.done && !(await confirm(markDoneConfirm(a.text)))) return;
    setList((l) => l.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)));
    if (!a.done) sounds.check();
    else sounds.uncheck();
    void updateAction(a.id, { done: !a.done }).then((r) => {
      if (r.error !== undefined) {
        toast.error(r.error);
        setList((l) => l.map((x) => (x.id === a.id ? { ...x, done: a.done } : x)));
      }
    });
  }
  async function remove(a: MeetingAction) {
    if (!(await confirm({ title: "Remove this action item?", description: a.text, confirmLabel: "Remove", danger: true }))) return;
    setList((l) => l.filter((x) => x.id !== a.id));
    const r = await deleteAction(a.id);
    if (r.error !== undefined) {
      toast.error(r.error);
      router.refresh();
    }
  }

  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft flex-1">Action items</h2>
        {list.length > 0 && <span className="text-[12px] text-ink-faint tabular-nums">{open} open · {list.length - open} done</span>}
      </div>
      <ul className="space-y-1 mb-3">
        {list.map((a) => (
          <li key={a.id} className="group flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 -mx-1.5 hover:bg-surface-2/60">
            <button
              type="button"
              role="checkbox"
              aria-checked={a.done}
              aria-label={a.done ? "Mark as not done" : "Mark as done"}
              data-sound="none"
              onClick={() => toggle(a)}
              className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${a.done ? "bg-green border-green text-white" : "border-line/30 hover:border-green"}`}
            >
              {a.done && <CheckIcon className="w-3.5 h-3.5" />}
            </button>
            <span className={`flex-1 min-w-0 text-[14px] leading-snug break-words ${a.done ? "line-through text-ink-faint" : ""}`}>{a.text}</span>
            {a.dueDate && (
              <span className="flex-shrink-0 text-[11.5px] font-semibold text-ink-soft tabular-nums mt-0.5">
                {new Date(`${a.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
            {a.owner && <PersonAvatar name={a.owner.name} avatarUrl={a.owner.avatarUrl} color={a.owner.color} className="w-6 h-6 text-[9px] mt-[-1px]" />}
            {(canOrganize || a.createdBy === me) && (
              <button type="button" onClick={() => void remove(a)} aria-label="Remove" className="w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-red hover:bg-red/10 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100">
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
        {!list.length && <li className="text-[13.5px] text-ink-faint px-0.5">Nothing yet. Add what needs doing after the meeting.</li>}
      </ul>
      <div className="flex items-center gap-2 flex-wrap rounded-xl border border-line/10 bg-paper/40 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          maxLength={300}
          placeholder="Add an action item…"
          className="flex-1 min-w-[12rem] bg-transparent px-2 h-9 text-[14px] outline-none"
        />
        <div className="w-40">
          <Select value={owner} onChange={setOwner} options={ownerOptions} emptyOption="Nobody yet" placeholder="Who" ariaLabel="Who does it" variant="inline" menuMinWidth={200} className="text-[13px] font-semibold text-ink-soft" />
        </div>
        <DateChip value={due} onChange={setDue} onClear={() => setDue(null)} placeholder="Due" ariaLabel="Due date" />
        <button type="button" onClick={add} disabled={pending || !text.trim()} className="inline-flex items-center gap-1 rounded-lg bg-amber text-white font-bold px-3 h-9 text-[13px] disabled:opacity-50">
          <PlusIcon className="w-4 h-4" />
          Add
        </button>
      </div>
    </section>
  );
}

function InviteDialog({ open, onClose, meeting, people, me }: { open: boolean; onClose: () => void; meeting: Meeting; people: MeetingPerson[]; me: string }) {
  const toast = useToast();
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setChosen(new Set(meeting.attendees.map((a) => a.person.userId)));
  }, [open, meeting.attendees]);
  async function save() {
    setBusy(true);
    const r = await setInvitees(meeting.id, [...chosen]);
    setBusy(false);
    if (r.error !== undefined) return toast.error(r.error);
    toast.success("Invite list saved. New people were told.");
    onClose();
    router.refresh();
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Who's invited"
      description="New people get a notification. Taking someone off doesn't."
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => setChosen(new Set(people.map((p) => p.userId)))} className="text-[12.5px] font-semibold text-amber">
          Everyone
        </button>
        <span className="text-ink-faint">·</span>
        <button type="button" onClick={() => setChosen(new Set([me]))} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink">
          Just me
        </button>
      </div>
      <ul className="space-y-1">
        {people.map((p) => {
          const on = chosen.has(p.userId);
          return (
            <li key={p.userId}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={p.userId === me}
                onClick={() =>
                  setChosen((s) => {
                    const n = new Set(s);
                    if (n.has(p.userId)) n.delete(p.userId);
                    else n.add(p.userId);
                    return n;
                  })
                }
                className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2 disabled:opacity-70"
              >
                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${on ? "bg-violet border-violet text-white dark:text-paper" : "border-line/30"}`}>{on && <CheckIcon className="w-3.5 h-3.5" />}</span>
                <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-7 h-7 text-[10px]" />
                <span className="text-[13.5px] font-semibold">{p.name}</span>
                {p.userId === me && <span className="text-[12px] text-ink-faint">(you)</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
