import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCachedUser } from "@/lib/supabase/get-user";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, MASCOT_NAME } from "@/lib/brand";
import { Mascot } from "@/components/ui/mascot";
import { Brand } from "@/components/ui/clip-logo";
import { AnalyticsIcon, CalendarIcon, DocumentIcon, MeetingIcon, PostingIcon, VideoIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: { absolute: `${APP_NAME}: ${APP_TAGLINE}` }, description: APP_DESCRIPTION };

const FEATURES = [
  { icon: VideoIcon, title: "Every video, every step", text: "Shorts and long videos move from idea to research, script, filming, editing, review, packaging and posting, with the right person on each step." },
  { icon: DocumentIcon, title: "Scripts, reviewed together", text: "Write, comment, sketch editing ideas, then hand the script on to review and staging. The next person is told it's their turn." },
  { icon: PostingIcon, title: "Posting on schedule", text: "Approved shorts go out to YouTube, Instagram and TikTok at their planned time, from the team's own connected accounts." },
  { icon: CalendarIcon, title: "One calendar, clear tasks", text: "What's due today, what's late and what's next, for each person, plus a daily rhythm the team agrees on." },
  { icon: MeetingIcon, title: "Meetings that lead somewhere", text: "Agenda, notes and action items that land in the owner's tasks, with reminders before every meeting." },
  { icon: AnalyticsIcon, title: "How the videos do", text: "Views, watch time, followers, audience by country and revenue from every platform, next to the team's own output." },
];

/**
 * The public home page (what the platforms' reviewers and new visitors see).
 * Signed in? Straight to the dashboard.
 */
export default async function HomePage() {
  if (await getCachedUser()) redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="max-w-5xl mx-auto px-5 pt-6 pb-2 flex items-center justify-between gap-4">
        <Brand />
        <Link href="/login" className="inline-flex items-center rounded-xl border border-line/20 px-4 h-10 text-[14px] font-semibold hover:border-line/40 hover:bg-surface">
          Sign in
        </Link>
      </header>

      <main>
        <section className="max-w-5xl mx-auto px-5 pt-10 sm:pt-16 pb-12 grid gap-10 md:grid-cols-[1.2fr_1fr] items-center">
          <div>
            <h1 className="font-display text-[40px] sm:text-[56px] leading-[1.02] font-semibold tracking-tight">{APP_TAGLINE}</h1>
            <p className="mt-5 text-[17px] text-ink-soft max-w-xl leading-relaxed">{APP_DESCRIPTION}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="inline-flex items-center rounded-xl bg-amber text-white font-semibold text-[15px] px-5 h-12 hover:brightness-110">
                Sign in
              </Link>
              <span className="text-[13px] text-ink-faint">Invite only for now: accounts are created by the team owner.</span>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="rounded-[2rem] bg-surface border border-line/10 p-8 sm:p-10 flex flex-col items-center text-center">
              <Mascot size={150} mood="celebrate" />
              <p className="mt-4 font-display text-[18px] font-semibold">Hi, I&rsquo;m {MASCOT_NAME}!</p>
              <p className="text-[13px] text-ink-soft max-w-[15rem]">I keep your team&rsquo;s videos moving, one take at a time.</p>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 pb-16">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-2xl border border-line/10 bg-surface p-5">
                <span className="w-9 h-9 rounded-xl bg-amber/12 text-amber flex items-center justify-center mb-3">
                  <f.icon className="w-[18px] h-[18px]" />
                </span>
                <h2 className="font-semibold text-[15px] mb-1">{f.title}</h2>
                <p className="text-[13.5px] text-ink-soft leading-relaxed">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="max-w-5xl mx-auto px-5 pb-16">
          <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8 grid gap-4 md:grid-cols-2">
            <div>
              <h2 className="font-display text-[22px] font-semibold mb-2">Your accounts stay yours</h2>
              <p className="text-[14px] text-ink-soft leading-relaxed">
                {APP_NAME} only posts what your team approves, to the accounts your team connects, and reads their statistics to show them back to you. Sign-ins are
                encrypted and never leave our server. Disconnect any account at any time.
              </p>
            </div>
            <div className="text-[14px] text-ink-soft leading-relaxed space-y-2 md:pl-6 md:border-l border-line/10">
              <p>
                Works in any browser, and installs on iPhone and Android like an app, with notifications. No app store needed.
              </p>
              <p>
                Read the <Link href="/privacy" className="underline">privacy policy</Link>, the <Link href="/terms" className="underline">terms</Link> and how to{" "}
                <Link href="/data-deletion" className="underline">delete your data</Link>.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/10">
        <div className="max-w-5xl mx-auto px-5 py-6 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-ink-faint">
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <nav className="flex flex-wrap gap-4">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/data-deletion" className="hover:text-ink">Data deletion</Link>
            <Link href="/status" className="hover:text-ink">Status</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
