import Link from "next/link";
import { Play } from "@/components/landing/landing-client";
import { MeasureVignette, PipelineVignette, PlanVignette, PostVignette, ReviewVignette, ScriptVignette } from "@/components/landing/vignettes";
import { CutScroller } from "./cut-client";
import { textLink } from "./site-chrome";
import "./site.css";

/*
 * The cut (the home page, 1.45.0): one short, from the idea to its numbers, as the week of work it is. The words
 * scroll; beside them (computers) the scene's picture stays in view over an editing timeline, one clip per scene, a
 * person on each, and a playhead that crosses the week as you read (cut-client.tsx). On a phone each scene's picture
 * sits under its words.
 */

const SCENES = [
  {
    id: "plan",
    stage: "Plan",
    title: "Ideas become a schedule",
    text: "Drop shorts into the queue and each one takes the next free day, a few a day, around your days off. Pin the ones that have to go out on a date. Long videos keep their own deadline.",
    facts: ["One calendar for the whole team", "Daily limits and days off", "Drag a video to another day"],
    more: { href: "/features/shorts", label: "Shorts and the queue" },
    clip: { who: "Ana", role: "Master", from: 0, to: 0.15, color: "#E8630D" },
    Vignette: PlanVignette,
  },
  {
    id: "script",
    stage: "Script",
    title: "Written together, then handed on",
    text: "Write the script on real pages, comment on any line and sketch the editing idea beside it. Send it to review, then to staging: the next person is told it’s their turn.",
    facts: ["Comments and sketches on the script", "Suggestions as you write", "Word and PDF"],
    more: { href: "/features/scripts", label: "Scripts" },
    clip: { who: "Ioana", role: "Scripter", from: 0.12, to: 0.34, color: "#158273" },
    Vignette: ScriptVignette,
  },
  {
    id: "make",
    stage: "Film and edit",
    title: "Filmed, edited, and nobody chasing",
    text: "The filmer marks the footage in and says where it is; the editor is told and finds the folder on the short. Every step has its person, and marking yours done tells the next one.",
    facts: ["A person on every step", "Tasks for today, for each person", "Late work stands out"],
    more: { href: "/features/workflow", label: "Steps and turns" },
    clip: { who: "Mihai, Radu", role: "Filmer, Editor", from: 0.3, to: 0.55, color: "#583AC8" },
    Vignette: PipelineVignette,
  },
  {
    id: "review",
    stage: "Review",
    title: "Notes on the exact frame",
    text: "The cut plays in the browser. Pin a note to the second it’s about, reply, upload the next version and compare the two. Approve it when it’s right.",
    facts: ["Notes pinned to a moment", "Every version kept to compare", "Approve, or send it back"],
    more: { href: "/features/review", label: "Review" },
    clip: { who: "Ana", role: "Master", from: 0.52, to: 0.68, color: "#E8630D" },
    Vignette: ReviewVignette,
  },
  {
    id: "post",
    stage: "Post",
    title: "Out everywhere, on time",
    text: "Schedule the approved short for YouTube, TikTok, Instagram and Facebook from your team’s own accounts, or post it everywhere now. Every step shows, and a problem comes with Try again.",
    facts: ["Four platforms", "Scheduled or right now", "Problems explained"],
    more: { href: "/features/posting", label: "Posting" },
    clip: { who: "Elena", role: "Scheduler", from: 0.66, to: 0.8, color: "#B84070" },
    Vignette: PostVignette,
  },
  {
    id: "measure",
    stage: "Measure",
    title: "Then, what worked",
    text: "Views, watch time, followers and revenue from every platform, side by side, next to what the team made. The newest videos are read every few minutes, the rest every few hours.",
    facts: ["Every platform in one place", "Every video counted", "Goals that fill up live"],
    more: { href: "/features/analytics", label: "Analytics" },
    clip: { who: "Everyone", role: "The team", from: 0.78, to: 1, color: "#B4890E" },
    Vignette: MeasureVignette,
  },
] as const;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Timeline() {
  return (
    <div className="cut-timeline rounded-2xl bg-[rgb(43_33_24)] text-[rgb(246_240_228)] px-3 pt-2.5 pb-3" aria-hidden>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-[rgb(246_240_228/0.7)]">Short #231, one week</span>
        <span className="font-mono text-[12px] text-[rgb(var(--amber))] tabular-nums" data-cut-clock>
          Mon 00:00
        </span>
      </div>
      <div className="relative mt-2">
        <div className="grid grid-cols-7 text-[10px] text-[rgb(246_240_228/0.45)] border-b border-[rgb(246_240_228/0.12)] pb-1">
          {DAYS.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <div className="mt-1.5 space-y-1">
          {SCENES.map((s) => (
            <div key={s.id} className="relative h-[18px]">
              <span
                data-cut-clip
                className="cut-clip absolute inset-y-0 rounded-[5px] px-1.5 text-[10px] font-semibold leading-[18px] truncate"
                style={{ left: `${s.clip.from * 100}%`, width: `${(s.clip.to - s.clip.from) * 100}%`, ["--clip" as string]: s.clip.color }}
              >
                {s.stage}: {s.clip.who}
              </span>
            </div>
          ))}
        </div>
        <span className="cut-playhead absolute -top-1 bottom-0 w-[2px] bg-[rgb(var(--amber))]" />
      </div>
    </div>
  );
}

export function Cut() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-[40rem]">
          <h2 id="how-title" className="font-display text-[36px] sm:text-[52px] font-semibold leading-[1.02] tracking-[-0.02em]">
            One short, from Monday&rsquo;s idea to Sunday&rsquo;s numbers
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">
            Six scenes, the way video teams already work. Each person sees their part, and the next person knows the moment it&rsquo;s their turn.
          </p>
        </div>
        <CutScroller scenes={SCENES.length}>
          <div className="mt-12 sm:mt-16 grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
            <ol className="space-y-20 sm:space-y-28 lg:space-y-0">
              {SCENES.map((s, i) => (
                <li key={s.id} id={s.id} data-cut-scene className="scroll-mt-24 lg:min-h-[78vh] lg:flex lg:flex-col lg:justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-9 h-[7px] rounded-[3px] ld-stripes" aria-hidden />
                    <span className="ld-scene-mark text-[17px] text-amber">Scene {i + 1}</span>
                  </div>
                  <h3 className="font-display text-[30px] sm:text-[38px] font-semibold leading-[1.06] tracking-[-0.02em]">{s.title}</h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-ink-soft max-w-[32rem]">{s.text}</p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {s.facts.map((f) => (
                      <li key={f} className="rounded-lg border border-line/15 px-3 h-8 inline-flex items-center text-[13px] text-ink-soft">
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 text-[15px]">
                    <Link href={s.more.href} className={textLink}>
                      More about {s.more.label}
                    </Link>
                  </p>
                  {/* Phones: the picture under the words. */}
                  <Play className="mt-8 lg:hidden">
                    <s.Vignette />
                  </Play>
                </li>
              ))}
            </ol>
            {/* Computers: the picture stays, over the timeline. */}
            <div className="hidden lg:block" aria-hidden>
              <div className="sticky top-[10vh] h-[80vh] flex flex-col gap-4 py-2">
                <div className="relative flex-1 min-h-0">
                  {SCENES.map((s, i) => (
                    <div key={s.id} data-cut-panel data-ld-play data-active={i === 0 ? "" : undefined} className="cut-panel absolute inset-0 flex items-center">
                      <div className="w-full">
                        <s.Vignette />
                      </div>
                    </div>
                  ))}
                </div>
                <Timeline />
              </div>
            </div>
          </div>
        </CutScroller>
      </div>
    </section>
  );
}
