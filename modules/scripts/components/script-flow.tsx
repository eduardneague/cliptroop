"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DoneBurst } from "@/components/ui/done-burst";
import { useRouter } from "next/navigation";
import { Ago } from "@/components/ui/ago";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowRightIcon, CheckIcon, UsersIcon } from "@/components/ui/icons";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { ScripterPicker } from "@/modules/short-videos/components/scripter-picker";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";
import { finishScript, handOffScript, setScriptPeople } from "@/app/(dashboard)/scripts/actions";
import { saveScriptNow } from "../lib/save-now";
import { sounds } from "@/lib/sounds";
import type { FlowStepInfo, ScriptFlow } from "../lib/flow";
import type { FlowStep } from "../lib/queries";
import { PendingLink, usePendingNav } from "@/components/ui/pending-nav";
import { handOffLocked, LOCK_WAIT } from "../lib/flow-lock";

/*
 * The strip under the script's top bar: Script → Review → Staging, who's on
 * each, what's been sent, and the one button that matters right now
 * ("Ready for review" on Script, "Ready for staging" on Review), which
 * notifies the next step's people. On Staging, "Staging done" is the optional
 * last tick: every step gets a check, everyone on the script is notified.
 * Nothing needs it; it can be undone.
 */

const LABEL: Record<FlowStep, string> = { write: "Script", review: "Review", staging: "Staging" };
const WHAT: Record<FlowStep, string> = {
  write: "Writes the script",
  review: "Checks it and makes the changes",
  staging: "Gets it ready for filming and editing",
};
const NEXT: Partial<Record<FlowStep, "review" | "staging">> = { write: "review", review: "staging" };

export type FlowPermissions = {
  /** Add / remove scripters (Script step). */
  scripters: boolean;
  /** Choose who reviews / stages this video. */
  people: boolean;
  /** Hand on Script (the scripters, masters) and Review (the reviewers, masters). */
  handOff: { write: boolean; review: boolean };
  /** "Staging done" (and undo): masters, scripters, reviewers, staging people. */
  finish: boolean;
};

export function FlowStrip({
  flow,
  currentDocId,
  people,
  number,
  can,
  scripterAction,
  videoId,
  href,
  roleColors,
}: {
  flow: ScriptFlow;
  currentDocId: string;
  people: TeamPerson[];
  number: number;
  can: FlowPermissions;
  /** Saves a scripter change (shorts or long videos). */
  scripterAction: (id: string, memberId: string, add: boolean) => Promise<{ error?: string } | object>;
  videoId: string;
  href: (docId: string) => string;
  roleColors: Record<string, string>;
}) {
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [sending, setSending] = useState<FlowStepInfo | null>(null);
  // Shown at once (before the page refreshes); `celebrate` plays the big tick.
  const [doneNow, setDoneNow] = useState<ScriptFlow["done"] | undefined>(undefined);
  const [celebrate, setCelebrate] = useState(0);
  useEffect(() => setDoneNow(undefined), [flow.done?.at]);
  const done = doneNow === undefined ? flow.done : doneNow;
  const current = flow.steps.find((s) => s.docId === currentDocId) ?? null;
  const nextOf = (s: FlowStepInfo) => flow.steps.find((x) => x.step === NEXT[s.step]) ?? null;
  const dot: Record<FlowStep, string | undefined> = { write: roleColors.scripter, review: roleColors.master, staging: roleColors.editor };
  const personOf = (id: string) => people.find((p) => p.memberId === id) ?? null;
  const showHandOff = current && NEXT[current.step] && can.handOff[current.step as "write" | "review"];
  const hasStaging = flow.steps.some((s) => s.step === "staging");
  const showFinish = !!current && current.step === "staging" && can.finish && !done;
  // A step's document on its way (clicked here or in the list) lights up at once.
  const openingDoc = usePendingNav().pending;

  return (
    <div data-head-row="" className="no-print border-b border-line/10 bg-paper/60">
      <div className="flex items-center gap-2 px-3 sm:px-6 py-1.5 flex-wrap">
        <ol className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar -my-1 py-1" aria-label="Script steps">
          {flow.steps.map((s, i) => {
            const on = s.docId === (openingDoc ?? currentDocId);
            const crew = s.people.map(personOf).filter(Boolean) as TeamPerson[];
            const ticked = !!done || !!s.sent;
            return (
              <li key={s.step} className="flex items-center gap-1 flex-shrink-0">
                {i > 0 && <ArrowRightIcon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" aria-hidden />}
                <PendingLink
                  href={href(s.docId)}
                  navKey={s.docId}
                  prefetch={false}
                  aria-current={on ? "step" : undefined}
                  title={`${LABEL[s.step]}: ${crew.length ? crew.map((p) => p.name).join(", ") : "nobody yet"}${done ? " · done" : s.sent ? ` · sent on by ${s.sent.by ?? "someone"}` : ""}`}
                  className={`inline-flex items-center gap-2 rounded-lg pl-2 pr-2.5 h-8 text-[12.5px] font-semibold transition-colors ${
                    on ? "bg-amber/12 text-ink ring-1 ring-amber/40" : "text-ink-soft hover:text-ink hover:bg-surface-2"
                  }`}
                >
                  <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: dot[s.step] ?? "rgb(var(--line) / .4)" }} aria-hidden />
                  {s.name}
                  {ticked && (
                    <span key={celebrate ? `t${celebrate}` : "t"} className={celebrate ? "done-step-tick inline-flex" : "inline-flex"} style={{ "--d": `${i * 120}ms` } as React.CSSProperties}>
                      <CheckIcon className="w-3.5 h-3.5 text-green" aria-label={done ? "done" : "sent on"} />
                    </span>
                  )}
                  {crew.length > 0 ? (
                    <span className="flex -space-x-1.5">
                      {crew.slice(0, 3).map((p) => (
                        <span key={p.memberId} className="rounded-full ring-2 ring-paper">
                          <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-5 h-5 text-[8.5px]" />
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-[11px] font-normal text-ink-faint">nobody</span>
                  )}
                </PendingLink>
              </li>
            );
          })}
          {hasStaging && done && (
            <li className="flex items-center gap-1 flex-shrink-0">
              <ArrowRightIcon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" aria-hidden />
              <span
                key={celebrate}
                title={`Marked done${done.by ? ` by ${done.by}` : ""}`}
                className={`inline-flex items-center gap-1.5 rounded-lg bg-green/15 text-green pl-1 pr-2.5 h-7 text-[12px] font-bold ${celebrate ? "done-chip" : ""}`}
              >
                <span className="grid place-items-center w-5 h-5 rounded-md bg-green text-white">
                  <CheckIcon className="w-3 h-3" />
                </span>
                Done
              </span>
            </li>
          )}
        </ol>
        <button
          type="button"
          onClick={() => setPeopleOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 flex-shrink-0"
        >
          <UsersIcon className="w-3.5 h-3.5" />
          People
        </button>
        <span className="flex-1" />
        {showHandOff && current && (
          <HandOffButton
            step={current}
            next={nextOf(current)}
            locked={handOffLocked({ step: current.step as "write" | "review", sentAt: current.sent?.at ?? null, nextSentAt: nextOf(current)?.sent?.at ?? null, doneAt: done?.at ?? null })}
            onOpen={() => setSending(current)}
          />
        )}
        {current?.step === "staging" && (showFinish || done) && (
          <FinishButton
            docId={current.docId}
            done={done ?? null}
            canUndo={can.finish}
            onChange={(d) => {
              setDoneNow(d);
              if (d) setCelebrate((n) => n + 1);
            }}
          />
        )}
      </div>
      {celebrate > 0 && <DoneBurst key={celebrate} subtitle="Script ✓ Review ✓ Staging ✓" />}

      <PeopleDialog
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        flow={flow}
        people={people}
        number={number}
        can={can}
        scripterAction={scripterAction}
        videoId={videoId}
      />
      {sending && (
        <HandOffDialog
          step={sending}
          next={nextOf(sending)}
          people={people}
          onClose={() => setSending(null)}
          onPickPeople={() => {
            setSending(null);
            setPeopleOpen(true);
          }}
          href={href}
        />
      )}
    </div>
  );
}

/**
 * Script's "Ready for review", Review's "Ready for staging". Once sent: what was sent and when, greyed out while the
 * next step is still at it (1.35.2, `handOffLocked`), then a way to send it again.
 */
function HandOffButton({ step, next, locked, onOpen }: { step: FlowStepInfo; next: FlowStepInfo | null; locked: boolean; onOpen: () => void }) {
  const word = NEXT[step.step] === "review" ? "review" : "staging";
  if (step.sent && locked) {
    // (The tooltip on a wrapper: a disabled button shows none in some browsers.)
    return (
      <span title={`Sent to ${word}. ${LOCK_WAIT[step.step as "write" | "review"]}`} className="inline-flex flex-shrink-0 cursor-not-allowed">
        <button
          type="button"
          disabled
          className="pointer-events-none inline-flex items-center gap-1.5 rounded-lg border border-line/15 bg-surface-2 text-ink-soft px-3 h-8 text-[12.5px] font-semibold"
        >
          <CheckIcon className="w-3.5 h-3.5" />
          Sent to {word}
          <span className="font-normal text-ink-faint">
            · <Ago iso={step.sent.at} />
          </span>
        </button>
      </span>
    );
  }
  if (step.sent) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title={`The ${word} is done: send it to ${word} again (notifies them again)`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-green/40 bg-green/10 text-ink px-3 h-8 text-[12.5px] font-semibold hover:bg-green/15 flex-shrink-0"
      >
        <CheckIcon className="w-3.5 h-3.5 text-green" />
        Sent to {word}
        <span className="font-normal text-ink-soft">
          · <Ago iso={step.sent.at} />
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!next}
      className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white px-3.5 h-8 text-[12.5px] font-bold hover:brightness-110 disabled:opacity-50 flex-shrink-0"
    >
      Ready for {word}
      <ArrowRightIcon className="w-3.5 h-3.5" />
    </button>
  );
}

/** "Staging done" on the Staging document; once done, when and by whom (and undo). */
function FinishButton({
  docId,
  done,
  canUndo,
  onChange,
}: {
  docId: string;
  done: ScriptFlow["done"];
  canUndo: boolean;
  onChange: (d: ScriptFlow["done"]) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  function mark(on: boolean) {
    start(async () => {
      const r = await finishScript(docId, on);
      if (r.error !== undefined) {
        toast.error(r.error);
        return;
      }
      if (on) {
        onChange({ at: new Date().toISOString(), by: null });
        toast.success(r.notified ? `All done! ${r.notified === 1 ? "1 person was" : `${r.notified} people were`} notified.` : "All done!", { sound: "celebrate" });
      } else {
        sounds.uncheck();
        onChange(null);
      }
      router.refresh();
    });
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 flex-shrink-0">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-green/40 bg-green/10 text-ink px-3 h-8 text-[12.5px] font-semibold">
          <CheckIcon className="w-3.5 h-3.5 text-green" />
          Staging done
          <span className="font-normal text-ink-soft">
            · <Ago iso={done.at} />
          </span>
        </span>
        {canUndo && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Take back “done”?",
                description: "The ticks go away. Nobody is notified, and any Review or Staging work still in progress shows up in their tasks again.",
                confirmLabel: "Take it back",
                cancelLabel: "Keep it done",
              });
              if (ok) mark(false);
            }}
            className="rounded-lg px-2 h-8 text-[12px] font-semibold text-ink-faint hover:text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            {pending ? "…" : "Undo"}
          </button>
        )}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Mark the script done?",
          description: "Every step gets a tick and everyone on this script is notified. You can take it back.",
          confirmLabel: "Mark done",
        });
        if (ok) mark(true);
      }}
      title="Optional: puts a tick on every step and lets everyone on this script know"
      className="inline-flex items-center gap-1.5 rounded-lg bg-green text-white px-3.5 h-8 text-[12.5px] font-bold hover:brightness-110 disabled:opacity-60 flex-shrink-0"
    >
      {pending ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
      Staging done
    </button>
  );
}

/** The big tick in the middle of the screen, for a second and a half. */
/** "Send to review?": who gets notified, and copying the text over when the next document is empty. */
function HandOffDialog({
  step,
  next,
  people,
  onClose,
  onPickPeople,
  href,
}: {
  step: FlowStepInfo;
  next: FlowStepInfo | null;
  people: TeamPerson[];
  onClose: () => void;
  onPickPeople: () => void;
  href: (docId: string) => string;
}) {
  const router = useRouter();
  const nav = usePendingNav();
  const toast = useToast();
  const [pending, start] = useTransition();
  const word = NEXT[step.step] === "review" ? "review" : "staging";
  const crew = (next?.people ?? []).map((id) => people.find((p) => p.memberId === id)).filter(Boolean) as TeamPerson[];
  const nextEmpty = !!next && next.wordCount === 0;
  const [copy, setCopy] = useState(true);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Send to ${word}?`}
      description={next ? `The ${next.name} document is where the ${word} happens.` : undefined}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !next || crew.length === 0}
            onClick={() =>
              start(async () => {
                // 1.54.1: what's on the page is saved first (the copy takes the last words and pictures).
                if (!(await saveScriptNow(step.docId))) return toast.error("The latest changes aren't saved yet. Wait for “Saved”, then send it.");
                const r = await handOffScript(step.docId, nextEmpty && copy);
                if (r.error !== undefined) return toast.error(r.error);
                const brought = r.comments ? ` Its ${r.comments === 1 ? "comment came" : `${r.comments} comments and editing ideas came`} along.` : "";
                toast.success(`Sent to ${word}.${brought} ${r.notified ? `${r.notified === 1 ? "1 person was" : `${r.notified} people were`} notified.` : ""}`.trim());
                onClose();
                // The script moves on, and so does the page: open the next step's document.
                const to = r.nextId || next?.docId;
                if (to) nav.go(href(to), to);
                else router.refresh();
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-50"
          >
            {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {step.sent ? "Send again" : `Send to ${word}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-faint mb-2">Notifies</div>
          {crew.length ? (
            <div className="flex flex-wrap gap-1.5">
              {crew.map((p) => (
                <span key={p.memberId} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 bg-surface-2 pl-1 pr-2.5 h-8">
                  <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} />
                  <span className="text-[13px] font-semibold">{p.name}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-[13px]">
              Nobody does the {word} yet.{" "}
              <button type="button" onClick={onPickPeople} className="font-semibold text-amber hover:underline">
                Choose people
              </button>
            </p>
          )}
          <p className="mt-2 text-[12px] text-ink-soft">They get a notification and an email with a link to {next?.name ?? "the next document"}.</p>
        </div>
        {next &&
          (nextEmpty ? (
            <label className="flex items-start gap-2.5 rounded-lg border border-line/15 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[rgb(var(--amber))]" />
              <span className="text-[13px]">
                <b>Copy this script into {next.name}</b>
                <span className="block text-ink-soft text-[12px]">{next.name} is empty, so it starts from what&rsquo;s here, comments and editing ideas included.</span>
              </span>
            </label>
          ) : (
            <p className="text-[12.5px] text-ink-soft">{next.name} already has text: it stays as it is.</p>
          ))}
      </div>
    </Dialog>
  );
}

/** Who does what on this video: scripters, reviewers, staging. */
function PeopleDialog({
  open,
  onClose,
  flow,
  people,
  number,
  can,
  scripterAction,
  videoId,
}: {
  open: boolean;
  onClose: () => void;
  flow: ScriptFlow;
  people: TeamPerson[];
  number: number;
  can: FlowPermissions;
  scripterAction: (id: string, memberId: string, add: boolean) => Promise<{ error?: string } | object>;
  videoId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  // Local copies so changes show at once.
  const [lists, setLists] = useState<Record<string, string[]>>({});
  useEffect(() => {
    setLists(Object.fromEntries(flow.steps.map((s) => [s.step, s.people])));
  }, [flow]);
  const active = (ids: string[]) => ids.filter((id) => people.some((p) => p.memberId === id));
  // 1.53.3: each step says it's saving, then "Saved" for a moment, and waits for one change before the next (the owner:
  // "when adding or changing people from here, i want some responsiveness, some loading").
  const [state, setState] = useState<Record<string, "saving" | "saved">>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const mark = (step: string, v: "saving" | "saved" | null) => {
    clearTimeout(timers.current[step]);
    setState((m) => {
      const next = { ...m };
      if (v) next[step] = v;
      else delete next[step];
      return next;
    });
    if (v === "saved") timers.current[step] = setTimeout(() => mark(step, null), 1600);
  };

  async function changeScripter(memberId: string, add: boolean) {
    const prev = lists.write ?? [];
    setLists((l) => ({ ...l, write: add ? [...prev.filter((x) => x !== memberId), memberId] : prev.filter((x) => x !== memberId) }));
    mark("write", "saving");
    const r = (await scripterAction(videoId, memberId, add)) as { error?: string };
    if (r?.error) {
      setLists((l) => ({ ...l, write: prev }));
      mark("write", null);
      toast.error(r.error);
    } else {
      mark("write", "saved");
      router.refresh();
    }
  }
  async function save(s: FlowStepInfo, ids: string[]) {
    const prev = lists[s.step] ?? [];
    setLists((l) => ({ ...l, [s.step]: ids }));
    mark(s.step, "saving");
    const r = await setScriptPeople({ scriptId: s.docId, memberIds: ids });
    if (r.error !== undefined) {
      setLists((l) => ({ ...l, [s.step]: prev }));
      mark(s.step, null);
      toast.error(r.error);
    } else {
      mark(s.step, "saved");
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Who does what · #${number}`} description="Each step's people get a notification when the script reaches them." width="sm:max-w-xl">
      <div className="divide-y divide-line/10 -my-2">
        {flow.steps.map((s, i) => {
          const value = active(lists[s.step] ?? s.people);
          const editable = s.step === "write" ? can.scripters : can.people;
          return (
            <section key={s.step} className="py-4">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-mono text-[11.5px] text-ink-faint">{i + 1}</span>
                <h3 className="text-[14px] font-semibold">{s.name}</h3>
                {s.step !== "write" && s.usesDefaults && value.length > 0 && (
                  <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-soft">Team default</span>
                )}
                <span className="ml-auto self-center min-h-[18px]" aria-live="polite">
                  {state[s.step] === "saving" && (
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft">
                      <span className="w-3 h-3 rounded-full border-2 border-ink-soft/30 border-t-amber animate-spin" aria-hidden />
                      Saving…
                    </span>
                  )}
                  {state[s.step] === "saved" && (
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-green animate-[fadein_.18s_ease-out]">
                      <CheckIcon className="w-3.5 h-3.5" />
                      Saved
                    </span>
                  )}
                </span>
              </div>
              <p className="text-[12px] text-ink-soft mb-2.5">
                {WHAT[s.step]}
                {s.step === "write" ? ". Only they (and masters) edit the Script." : `. They can edit the ${s.name} document.`}
              </p>
              {/* While a change is saving, this step waits (dimmed) so two changes never cross. */}
              <div aria-busy={state[s.step] === "saving"} className={`transition-opacity duration-150 ${state[s.step] === "saving" ? "opacity-60 pointer-events-none" : ""}`}>
                <ScripterPicker
                  people={people}
                  value={value}
                  kind={s.step === "write" ? "scripter" : "reviewer"}
                  noun={s.step === "write" ? "scripter" : s.step === "review" ? "reviewer" : "person"}
                  readOnly={!editable}
                  emptyHint={s.step === "write" ? undefined : "Nobody yet"}
                  onAdd={(m) => (s.step === "write" ? void changeScripter(m, true) : void save(s, [...value.filter((x) => x !== m), m]))}
                  onRemove={(m) => (s.step === "write" ? void changeScripter(m, false) : void save(s, value.filter((x) => x !== m)))}
                />
              </div>
              {s.step !== "write" && editable && !s.usesDefaults && (
                <button type="button" disabled={state[s.step] === "saving"} onClick={() => void save(s, [])} className="mt-2 text-[12px] font-semibold text-ink-soft hover:text-ink disabled:opacity-50">
                  Use the team&rsquo;s defaults{flow.defaults[s.step as "review" | "staging"].length ? "" : " (none set)"}
                </button>
              )}
            </section>
          );
        })}
        <p className="pt-3 text-[12px] text-ink-faint">Team defaults for Review and Staging: Team → Defaults → Scripts (masters).</p>
      </div>
    </Dialog>
  );
}
