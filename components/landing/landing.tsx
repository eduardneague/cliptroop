import Link from "next/link";
import { APP_NAME, MASCOT_NAME } from "@/lib/brand";
import { Mascot } from "@/components/ui/mascot";
import { btn, btnQuiet, SitePage, textLink } from "@/components/site/site-chrome";
import { Cut } from "@/components/site/cut";
import { DEPTS, FEATURES, featuresIn } from "@/lib/site/features";
import { SITE_PLATFORMS } from "@/lib/site/platforms";
import { PLAN_FACTS, gbLabel, planPrice } from "@/lib/plans";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { ClipOnView, Play, Timecode } from "./landing-client";
import { PhoneVignette } from "./vignettes";
import "./landing.css";

/*
 * The public home page: what new people and the platforms' reviewers see. A slate claps shut (the one big moment on
 * load); then the cut, one short's week of work as scenes beside an editing timeline whose playhead follows your
 * reading (1.45.0, components/site/cut.tsx); the phone; every feature as end credits, each with its own page; the
 * platforms; the price, plainly; and the promises. Since 1.33.0 it's the front of the website (components/site).
 */

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
              <span className="w-2 h-2 rounded-[3px] bg-[#E5484D] animate-pulse" />
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
            {APP_NAME} is where your team plans, scripts, films, edits, reviews and posts its YouTube, TikTok, Instagram and Facebook videos. Everyone sees what&rsquo;s next and whose turn it is.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={`${btn} bg-amber text-white px-6 h-12 text-[15px] hover:brightness-110`}>
              Create an account
            </Link>
            <a href="#how" className={btnQuiet}>
              See how it works
            </a>
          </div>
          <p className="mt-4 text-[13px] text-ink-faint">
            Already on a team?{" "}
            <Link href="/login" className={textLink}>
              Sign in
            </Link>
            . New teams choose a plan:{" "}
            <Link href="/pricing" className={textLink}>
              pricing
            </Link>
            .
          </p>
        </div>
      </div>
      <Slate />
    </section>
  );
}

/** Every feature, as the end credits roll: department by department, each one a link to its page. */
function Credits() {
  return (
    <section id="more" aria-labelledby="more-title" className="scroll-mt-16 max-w-5xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32">
      <h2 id="more-title" className="ld-italic text-center text-[34px] sm:text-[44px] font-semibold tracking-[-0.01em]">
        The full cast
      </h2>
      <p className="mt-3 text-center text-[16px] text-ink-soft">
        {FEATURES.length} parts of {APP_NAME}, in the order a video is made. Each has its own page.
      </p>
      <div className="mt-12 space-y-12">
        {DEPTS.map((d) => (
          <div key={d.id}>
            <h3 className="text-center font-display text-[15px] font-semibold text-amber">{d.name}</h3>
            <dl className="mt-4 space-y-3">
              {featuresIn(d.id).map((f) => (
                <div key={f.slug} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1.6fr)] sm:items-baseline">
                  <dt className="sm:text-right font-display text-[20px] sm:text-[22px] font-semibold">
                    <Link href={`/features/${f.slug}`} className="hover:text-amber underline-offset-4 hover:underline decoration-2">
                      {f.name}
                    </Link>
                  </dt>
                  <span className="hidden sm:block ld-leader h-3" aria-hidden />
                  <dd className="text-[15px] text-ink-soft leading-relaxed">{f.line}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-12 text-center text-[15px]">
        <Link href="/features" className={textLink}>
          Every feature, department by department
        </Link>
      </p>
    </section>
  );
}

/** Where it posts: a page for each platform. */
function Platforms() {
  return (
    <section aria-labelledby="platforms-title" className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:items-end">
        <div>
          <h2 id="platforms-title" className="font-display text-[34px] sm:text-[46px] font-semibold leading-[1.03] tracking-[-0.02em]">
            Posted from your own accounts
          </h2>
          <p className="mt-4 text-[16.5px] leading-relaxed text-ink-soft max-w-[32rem]">
            Your team connects its accounts, and {APP_NAME} posts only what you approved, when you said. Each platform&rsquo;s page lists every permission it asks for, and why.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {SITE_PLATFORMS.map((p) => (
            <li key={p.id}>
              <Link href={`/platforms/${p.id}`} className="group flex items-center gap-3 rounded-2xl border border-line/15 bg-surface px-4 sm:px-5 h-[72px] hover:border-line/35">
                <PlatformIcon platform={p.id} className="w-7 h-7 flex-shrink-0" />
                <span className="font-display text-[20px] sm:text-[22px] font-semibold group-hover:text-amber">{p.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The price, plainly. */
function Price() {
  const studio = PLAN_FACTS.studio;
  return (
    <section aria-labelledby="price-title" className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32">
      <div className="rounded-[28px] border border-line/15 bg-surface px-6 sm:px-10 py-9 sm:py-11 grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <h2 id="price-title" className="font-display text-[30px] sm:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em]">
            One price a person, every feature
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-soft max-w-[34rem]">
            {studio.name} is {planPrice("studio", false)} a person a month, or {planPrice("studio", true)} billed yearly, with {gbLabel(studio.storageGb)} of storage for the
            team. Network, for agencies with several teams, is priced with you. There&rsquo;s no free plan and no trial.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <Link href="/pricing" className={`${btn} bg-amber text-white px-6 h-12 text-[15px] hover:brightness-110`}>
            See pricing
          </Link>
          <Link href="/signup" className={btnQuiet}>
            Create an account
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <SitePage>
      <Hero />

      {/* The production, as a week of work on an editing timeline. */}
      <Cut />

      {/* The phone. */}
      <section className="mt-28 sm:mt-36 bg-[rgb(43_33_24)] text-[rgb(246_240_228)] overflow-hidden">
        <Play className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24 grid gap-14 lg:grid-cols-[1fr_auto] items-center">
          <div className="max-w-[34rem]">
            <h2 className="font-display text-[34px] sm:text-[48px] font-semibold leading-[1.04] tracking-[-0.02em]">Your turn comes to you</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-[rgb(246_240_228/0.75)]">
              When a script is handed to you, a cut needs your review or a short goes live, you hear about it right away, in the app and on your phone. Add {APP_NAME} to your home screen on iPhone or Android: no app store, nothing to update.
            </p>
            <div className="mt-8 h-[7px] w-24 rounded-[3px] ld-stripes" aria-hidden />
          </div>
          <PhoneVignette />
        </Play>
      </section>

      <Credits />

      <Platforms />

      <Price />

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
              What it asks each platform for, and why:{" "}
              <Link href="/platforms" className={textLink}>
                Platforms
              </Link>
              . How your team&rsquo;s work is kept safe:{" "}
              <Link href="/security" className={textLink}>
                Security
              </Link>
              .
            </p>
            <p>
              Read the{" "}
              <Link href="/privacy" className={textLink}>
                privacy policy
              </Link>
              , the{" "}
              <Link href="/terms" className={textLink}>
                terms
              </Link>{" "}
              and how to{" "}
              <Link href="/data-deletion" className={textLink}>
                delete your data
              </Link>
              .
            </p>
            <p>
              Is everything running? The{" "}
              <Link href="/status" className={textLink}>
                status page
              </Link>{" "}
              shows the last three days, hour by hour.
            </p>
          </div>
        </div>
      </section>

      {/* That's a wrap. */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 text-center">
        <ClipOnView size={150} />
        <h2 className="mt-4 font-display text-[40px] sm:text-[60px] font-semibold leading-[1] tracking-[-0.025em]">That&rsquo;s a wrap.</h2>
        <p className="mt-4 text-[17px] text-ink-soft">{MASCOT_NAME} will show you around the first time you sign in.</p>
        <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
          <Link href="/signup" className={`${btn} bg-amber text-white px-7 h-12 text-[15px] hover:brightness-110`}>
            Create an account
          </Link>
          <Link href="/login" className={btnQuiet}>
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-[13px] text-ink-faint">
          Joining a team? Open the invite it sent you.
        </p>
      </section>
    </SitePage>
  );
}
