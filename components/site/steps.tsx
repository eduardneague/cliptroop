import { Play } from "@/components/landing/landing-client";
import { MeasureVignette, PipelineVignette, PlanVignette, PostVignette, ReviewVignette, ScriptVignette } from "@/components/landing/vignettes";
import { StepsClient } from "./steps-client";
import "./site.css";

/*
 * The home page's steps (1.46.0; 1.45.0's scrolling timeline was hard to follow): one short from the idea to its
 * numbers in six named steps, the open one's words beside its demo (steps-client.tsx). The demos are the home page's
 * own (components/landing/vignettes.tsx), each running only while it shows.
 */

const SCENES = [
  {
    id: "plan",
    label: "Plan",
    title: "Ideas become a schedule",
    text: "Drop shorts into the queue and each one takes the next free day, a few a day, around your days off. Pin the ones that have to go out on a date. Long videos keep their own deadline.",
    facts: ["One calendar for the whole team", "Daily limits and days off", "Drag a video to another day"],
    more: { href: "/features/shorts", label: "Shorts and the queue" },
    Vignette: PlanVignette,
  },
  {
    id: "script",
    label: "Script",
    title: "Written together, then handed on",
    text: "Write the script on real pages, comment on any line and sketch the editing idea beside it. Send it to review, then to staging: the next person is told it’s their turn.",
    facts: ["Comments and sketches on the script", "Suggestions as you write", "Word and PDF"],
    more: { href: "/features/scripts", label: "Scripts" },
    Vignette: ScriptVignette,
  },
  {
    id: "make",
    label: "Film and edit",
    title: "Filmed, edited, and nobody chasing",
    text: "The filmer marks the footage in and says where it is; the editor is told and finds the folder on the short. Every step has its person, and marking yours done tells the next one.",
    facts: ["A person on every step", "Tasks for today, for each person", "Late work stands out"],
    more: { href: "/features/workflow", label: "Steps and turns" },
    Vignette: PipelineVignette,
  },
  {
    id: "review",
    label: "Review",
    title: "Notes on the exact frame",
    text: "The cut plays in the browser. Pin a note to the second it’s about, reply, upload the next version and compare the two. Approve it when it’s right.",
    facts: ["Notes pinned to a moment", "Every version kept to compare", "Approve, or send it back"],
    more: { href: "/features/review", label: "Review" },
    Vignette: ReviewVignette,
  },
  {
    id: "post",
    label: "Post",
    title: "Out everywhere, on time",
    text: "Schedule the approved short for YouTube, TikTok, Instagram and Facebook from your team’s own accounts, or post it everywhere now. Every step shows, and a problem comes with Try again.",
    facts: ["Four platforms", "Scheduled or right now", "Problems explained"],
    more: { href: "/features/posting", label: "Posting" },
    Vignette: PostVignette,
  },
  {
    id: "measure",
    label: "Measure",
    title: "Then, what worked",
    text: "Views, watch time, followers and revenue from every platform, side by side, next to what the team made. The newest videos are read every few minutes, the rest every few hours.",
    facts: ["Every platform in one place", "Every video counted", "Goals that fill up live"],
    more: { href: "/features/analytics", label: "Analytics" },
    Vignette: MeasureVignette,
  },
] as const;

export function Steps() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-12 lg:items-end" data-reveal>
        <h2 id="how-title" className="lg:col-span-7 font-display text-[36px] sm:text-[52px] font-semibold leading-[1.02] tracking-[-0.02em]">
          One short, from the idea to its numbers
        </h2>
        <p className="lg:col-span-5 text-[17px] leading-relaxed text-ink-soft">
          Six steps, the way video teams already work. Each person sees their part, and the next one knows the moment it&rsquo;s their turn.
        </p>
      </div>
      <div className="mt-10 sm:mt-12" data-reveal>
        <StepsClient
          scenes={SCENES.map(({ Vignette: _v, ...rest }) => rest)}
          visuals={SCENES.map((s) => (
            <Play key={s.id}>
              <div aria-hidden>
                <s.Vignette />
              </div>
            </Play>
          ))}
        />
      </div>
    </section>
  );
}
