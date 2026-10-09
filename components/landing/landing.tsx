import Link from "next/link";
import { APP_NAME, CONTACT_EMAIL, MASCOT_NAME } from "@/lib/brand";
import { Brand } from "@/components/ui/clip-logo";
import { Mascot } from "@/components/ui/mascot";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ClipOnView, HeaderScroll, Play, Timecode } from "./landing-client";
import { MeasureVignette, PhoneVignette, PipelineVignette, PlanVignette, PostVignette, ReviewVignette, ScriptVignette } from "./vignettes";
import "./landing.css";

/*
 * The public home page: what new people and the platforms' reviewers see.
 * A slate claps shut (the one big moment on load), then the production in
 * six scenes, each with a small live demo, then the rest as end credits.
 */

const SCENES = [
  {
    id: "plan",
    title: "Ideas become a schedule",
    text: "Drop shorts into the queue and they're given a day by themselves, a few at a time, around your days off. Pin the ones that have to go out on a date. Long videos keep their own deadline.",
    facts: ["One calendar for the whole team", "Daily limits and days off", "Drag a video to another day"],
    Vignette: PlanVignette,
  },
  {
    id: "script",
    title: "Write it, then hand it on",
    text: "Write the script together, comment on any line and sketch editing ideas right next to it. When it's ready, send it to review and then to staging. The next person is told it's their turn.",
    facts: ["Comments and sketches on the script", "Script, review and staging", "Notified when it's your turn"],
    Vignette: ScriptVignette,
  },
  {
    id: "make",
    title: "Everyone knows whose turn it is",
    text: "Every short and long video moves through the same steps, with a person on each one. Mark your part done and it moves on, and the editor, reviewer or scheduler hears about it at the right moment.",
    facts: ["A person on every step", "Tasks for today, for each person", "Late work stands out"],
    Vignette: PipelineVignette,
  },
  {
    id: "review",
    title: "Notes on the exact frame",
    text: "Upload a cut and the team watches it right in the browser. Pin a note to the second it's about, reply, upload the next version and compare. Approve it when it's right.",
    facts: ["Notes pinned to a moment", "Every version kept to compare", "Approve, or send it back with a note"],
    Vignette: ReviewVignette,
  },
  {
    id: "post",
    title: "Out everywhere, on time",
    text: "Schedule each approved short for YouTube, Instagram, Facebook and TikTok from your team's own accounts, or post it everywhere right now. You see every step, and anything that goes wrong shows up on the Posting page.",
    facts: ["YouTube, Instagram, Facebook and TikTok", "Scheduled or right now", "Problems explained, with a retry"],
    Vignette: PostVignette,
  },
  {
    id: "measure",
    title: "See what worked",
    text: "Views, watch time, followers and revenue from every platform, where your audience is, and how much the team made, side by side. It's all copied every morning.",
    facts: ["Every platform in one place", "Audience by country", "Your team's output next to it"],
    Vignette: MeasureVignette,
  },
] as const;

const CREDITS = [
  { part: "Meetings", name: "Agenda, notes and action items that land in each person's tasks" },
  { part: "Your dashboard", name: "Widgets you arrange: today's tasks, the calendar, the weather, your numbers" },
  { part: "Thumbnail studio", name: "Thumbnail ideas side by side, so the team can pick the winner" },
  { part: "Roles", name: "Masters, scripters, editors and schedulers each see what's theirs" },
  { part: "Search", name: "Any video, script or person, with Ctrl K" },
  { part: "Status", name: "A public page that says whether everything is running" },
];

const btn = "inline-flex items-center justify-center rounded-xl font-semibold transition-[filter,background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

function Header() {
  return (
    <header data-ld-header className="ld-header sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-2">
        <Link href="/" aria-label={`${APP_NAME} home`} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
          <Brand />
        </Link>
        <nav aria-label="On this page" className="hidden md:flex items-center gap-1 ml-6 text-[14px] text-ink-soft">
          <a href="#how" className="rounded-lg px-3 h-9 inline-flex items-center hover:text-ink hover:bg-surface/70">
            How it works
          </a>
          <a href="#more" className="rounded-lg px-3 h-9 inline-flex items-center hover:text-ink hover:bg-surface/70">
            Everything else
          </a>
          <Link href="/status" className="rounded-lg px-3 h-9 inline-flex items-center hover:text-ink hover:bg-surface/70">
            Status
          </Link>
        </nav>
        <span className="flex-1" />
        <ThemeToggle />
        <Link href="/login" className={`${btn} bg-amber text-white px-4 h-10 text-[14px] hover:brightness-110`}>
          Sign in
        </Link>
      </div>
      <HeaderScroll />
    </header>
  );
}

/** The slate: claps shut on load, then Clip pops up beside it. */
/** The hero's clapperboard (also used for the README and link-preview art). */
export function Slate() {
  const field = "ld-chalk-line pb-1.5";
  return (
    <div className="relative mx-auto w-full max-w-[520px] pt-6 pr-10 sm:pr-14" aria-hidden>
      <div className="ld-slate">
        <div className="ld-slate-arm relative h-[40px] sm:h-[46px] rounded-[10px] ld-stripes border-[3px] border-[rgb(43_33_24)] shadow-[0_10px_20px_-12px_rgb(0_0_0/0.6)]">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#FFF4E6] border-2 border-[rgb(43_33_24)]" />
        </div>
        <div className="mt-[5px] h-[30px] sm:h-[34px] rounded-t-[10px] ld-stripes border-[3px] border-b-0 border-[rgb(43_33_24)]" style={{ backgroundPosition: "13px 0" }} />
        <div className="ld-slate-face rounded-b-[20px] border-[3px] border-t-0 border-[rgb(43_33_24)] px-5 sm:px-7 pt-5 pb-6 shadow-[0_40px_70px_-30px_rgb(0_0_0/0.55)]">
          <div className={`${field} flex items-start justify-between gap-3`}>
            <div>
              <div className="ld-slate-label text-[10px] font-bold tracking-[0.14em]">PROD.</div>
              <div className="ld-chalk text-[30px] sm:text-[38px] font-semibold leading-tight">{APP_NAME}</div>
            </div>
            <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-[rgb(246_240_228/0.6)]">
              <span className="w-2 h-2 rounded-full bg-[#E5484D] animate-pulse" />
              REC
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3">
            {[
              ["ROLL", "A07"],
              ["SCENE", "231"],
              ["TAKE", "1"],
            ].map(([k, v]) => (
              <div key={k} className={field}>
                <div className="ld-slate-label text-[10px] font-bold tracking-[0.14em]">{k}</div>
                <div className="ld-chalk text-[24px] sm:text-[28px] font-semibold leading-tight">{v}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className={field}>
              <div className="ld-slate-label text-[10px] font-bold tracking-[0.14em]">DIRECTOR</div>
              <div className="ld-chalk text-[18px] sm:text-[20px] leading-tight">Your team</div>
            </div>
            <div className={field}>
              <div className="ld-slate-label text-[10px] font-bold tracking-[0.14em]">POSTING TO</div>
              <div className="ld-chalk text-[18px] sm:text-[20px] leading-tight">YT, IG, TikTok</div>
            </div>
          </div>
          <div className="mt-4 font-mono text-[22px] sm:text-[28px] font-medium text-[rgb(var(--amber))]">
            <Timecode />
          </div>
        </div>
      </div>
      <div className="ld-clip-peek absolute -right-2 sm:-right-4 -bottom-10 sm:-bottom-12">
        <Mascot mood="celebrate" size={128} />
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-24 sm:pb-28 grid gap-14 lg:gap-10 lg:grid-cols-[1.12fr_1fr] items-center">
      <div>
        <h1 className="font-display font-semibold tracking-[-0.025em] leading-[0.98] text-[44px] sm:text-[62px] xl:text-[72px]">
          <span className="ld-hero-line">Every video,</span>
          <span className="ld-hero-line">from idea</span>
          <span className="ld-hero-line">to posted.</span>
        </h1>
        <div className="ld-hero-after">
          <p className="mt-6 text-[17px] sm:text-[18px] leading-relaxed text-ink-soft max-w-[34rem]">
            {APP_NAME} is where your team plans, scripts, films, edits, reviews and posts its YouTube, Instagram, Facebook and TikTok videos. Everyone sees what&rsquo;s next and whose turn it is.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login" className={`${btn} bg-amber text-white px-6 h-12 text-[15px] hover:brightness-110`}>
              Sign in
            </Link>
            <a href="#how" className={`${btn} border border-line/20 px-5 h-12 text-[15px] hover:border-line/40 hover:bg-surface`}>
              See how it works
            </a>
          </div>
          <p className="mt-4 text-[13px] text-ink-faint">Invite only: your team&rsquo;s owner creates your account.</p>
        </div>
      </div>
      <Slate />
    </section>
  );
}

function Scene({ n, scene, flip }: { n: number; scene: (typeof SCENES)[number]; flip: boolean }) {
  const V = scene.Vignette;
  return (
    <Play className="scroll-mt-24" id={scene.id}>
      <article className={`grid gap-8 lg:gap-14 items-center lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}>
        <div className="max-w-[32rem]">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-9 h-[7px] rounded-full ld-stripes" aria-hidden />
            <span className="ld-scene-mark text-[17px] text-amber">Scene {n}</span>
          </div>
          <h3 className="font-display text-[32px] sm:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em]">{scene.title}</h3>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">{scene.text}</p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {scene.facts.map((f) => (
              <li key={f} className="rounded-full border border-line/15 px-3 h-8 inline-flex items-center text-[13px] text-ink-soft">
                {f}
              </li>
            ))}
          </ul>
        </div>
        <V />
      </article>
    </Play>
  );
}

export function Landing() {
  return (
    <div className="ld min-h-dvh bg-paper text-ink">
      <a href="#how" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to how it works
      </a>
      <Header />
      <main>
        <Hero />

        {/* The production, in order. */}
        <section id="how" className="scroll-mt-16 relative">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-[40rem] mb-14 sm:mb-20">
              <h2 className="font-display text-[36px] sm:text-[52px] font-semibold leading-[1.02] tracking-[-0.02em]">One video, start to finish</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">
                Six scenes, the way video teams already work. Each person sees their part, and the next person knows the moment it&rsquo;s their turn.
              </p>
            </div>
            <div className="space-y-24 sm:space-y-32">
              {SCENES.map((s, i) => (
                <Scene key={s.id} n={i + 1} scene={s} flip={i % 2 === 1} />
              ))}
            </div>
          </div>
        </section>

        {/* The phone. */}
        <section className="mt-28 sm:mt-36 bg-[rgb(43_33_24)] text-[rgb(246_240_228)] overflow-hidden">
          <Play className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24 grid gap-14 lg:grid-cols-[1fr_auto] items-center">
            <div className="max-w-[34rem]">
              <h2 className="font-display text-[34px] sm:text-[48px] font-semibold leading-[1.04] tracking-[-0.02em]">Your turn comes to you</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-[rgb(246_240_228/0.75)]">
                When a script is handed to you, a cut needs your review or a short goes live, you hear about it right away, in the app and on your phone. Add {APP_NAME} to your home screen on iPhone or Android: no app store, nothing to update.
              </p>
              <div className="mt-8 h-[7px] w-24 rounded-full ld-stripes" aria-hidden />
            </div>
            <PhoneVignette />
          </Play>
        </section>

        {/* Everything else, as end credits. */}
        <section id="more" className="scroll-mt-16 max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32">
          <h2 className="text-center font-display italic text-[34px] sm:text-[44px] font-semibold tracking-[-0.01em]">Also starring</h2>
          <dl className="mt-10 space-y-5 sm:space-y-4">
            {CREDITS.map((c) => (
              <div key={c.part} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1.6fr)] sm:items-baseline">
                <dt className="sm:text-right font-display text-[20px] sm:text-[22px] font-semibold">{c.part}</dt>
                <span className="hidden sm:block ld-leader h-3" aria-hidden />
                <dd className="text-[15px] text-ink-soft leading-relaxed">{c.name}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Trust. */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28">
          <div className="rounded-[26px] border border-line/10 bg-surface px-6 sm:px-10 py-8 sm:py-10 grid gap-6 md:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="font-display text-[26px] font-semibold leading-tight">Your accounts stay yours</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                {APP_NAME} only posts what your team approves, to the accounts your team connects, and reads their numbers to show them back to you. Sign-ins are encrypted and never leave our server. Disconnect any account at any time.
              </p>
            </div>
            <div className="text-[15px] leading-relaxed text-ink-soft md:border-l md:border-line/10 md:pl-8 space-y-3">
              <p>
                Read the{" "}
                <Link href="/privacy" className="text-ink underline underline-offset-2 hover:text-amber">
                  privacy policy
                </Link>
                , the{" "}
                <Link href="/terms" className="text-ink underline underline-offset-2 hover:text-amber">
                  terms
                </Link>{" "}
                and how to{" "}
                <Link href="/data-deletion" className="text-ink underline underline-offset-2 hover:text-amber">
                  delete your data
                </Link>
                .
              </p>
              <p>
                Is everything running? The{" "}
                <Link href="/status" className="text-ink underline underline-offset-2 hover:text-amber">
                  status page
                </Link>{" "}
                shows the last three days, hour by hour.
              </p>
            </div>
          </div>
        </section>

        {/* That's a wrap. */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-24 text-center">
          <ClipOnView size={150} />
          <h2 className="mt-4 font-display text-[40px] sm:text-[60px] font-semibold leading-[1] tracking-[-0.025em]">That&rsquo;s a wrap.</h2>
          <p className="mt-4 text-[17px] text-ink-soft">
            {MASCOT_NAME} will show you around the first time you sign in.
          </p>
          <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
            <Link href="/login" className={`${btn} bg-amber text-white px-7 h-12 text-[15px] hover:brightness-110`}>
              Sign in
            </Link>
            {CONTACT_EMAIL ? (
              <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} for our team`)}`} className={`${btn} border border-line/20 px-5 h-12 text-[15px] hover:border-line/40 hover:bg-surface`}>
                Ask about an account
              </a>
            ) : null}
          </div>
          <p className="mt-4 text-[13px] text-ink-faint">No account yet? Your team&rsquo;s owner can invite you.</p>
        </section>
      </main>

      <footer className="border-t border-line/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 flex flex-wrap items-center justify-between gap-4 text-[13px] text-ink-faint">
          <span className="inline-flex items-center gap-3">
            <Brand />
            <span>
              © {new Date().getFullYear()} {APP_NAME}
            </span>
          </span>
          <nav aria-label="Legal and status" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/data-deletion" className="hover:text-ink">
              Data deletion
            </Link>
            <Link href="/status" className="hover:text-ink">
              Status
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
