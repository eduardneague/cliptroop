import { APP_NAME } from "@/lib/brand";
import { relativeTime } from "@/lib/relative-time";
import { PLATFORM_META, SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";
import type { ShortEvent } from "@/modules/short-videos/lib/queries";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";

function describe(e: ShortEvent, auto: boolean): React.ReactNode {
  switch (e.kind) {
    case "created":
      return "created this short";
    case "editor":
      return "changed the editor";
    case "posted":
      return (
        <>
          {auto ? "posted it on" : "marked it posted on"} <b>{e.platform ? PLATFORM_META[e.platform].name : "a platform"}</b>
        </>
      );
    case "unposted":
      return <>unmarked <b>{e.platform ? PLATFORM_META[e.platform].name : "a platform"}</b></>;
    case "stage":
      if (e.fromStage === "editing" && e.toStage === "review") return "marked editing done";
      if (e.fromStage === "review" && e.toStage === "ready") return "approved it";
      if (e.fromStage === "review" && e.toStage === "editing") return "asked for changes";
      if (e.fromStage === "script" && e.toStage === "editing") return "sent it to editing";
      if (e.toStage === "posted") return "finished posting it everywhere";
      return (
        <>
          moved it to <b>{e.toStage ? SHORT_STAGE_LABELS[e.toStage] : "?"}</b>
        </>
      );
    default:
      return e.kind;
  }
}

/** The short's history — written by the database, so it can't be edited or faked. */
export function ActivityCard({ events }: { events: ShortEvent[] }) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-4">Activity</h2>
      {events.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint">Nothing yet.</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-line/15">
          {events.map((e) => (
            <li key={e.id} className="relative flex gap-3">
              {e.actor ? (
                <PersonAvatar name={e.actor.name} avatarUrl={e.actor.avatarUrl} color={e.actor.color} className="w-6 h-6 text-[9px] ring-2 ring-surface" />
              ) : (
                // No person: VPlanner did it automatically (e.g. posting).
                <span
                  className="w-6 h-6 rounded-full bg-amber text-white ring-2 ring-surface flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                  aria-hidden
                >
                  V
                </span>
              )}
              <div className="min-w-0 text-[12.5px] leading-snug pt-0.5">
                <span className="font-semibold">{e.actor?.name ?? APP_NAME}</span> {describe(e, !e.actor)}
                {e.note && (
                  <p className="mt-1 rounded-lg bg-amber/10 text-ink px-2.5 py-1.5 text-[12px] whitespace-pre-wrap">{e.note}</p>
                )}
                <div className="text-[11px] text-ink-faint mt-0.5">{relativeTime(e.createdAt)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
