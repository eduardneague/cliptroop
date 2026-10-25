import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { FactList, PageHead, SitePage, SiteSection, textLink } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  ...publicMetadata(
    "/security",
    "Security",
    `How ${APP_NAME} protects your team's work and the accounts you connect: sealed sign-ins, each team walled off by the database, and how to report a problem.`
  ),
  robots: { index: true, follow: true },
};

/*
 * Security (1.33.0): what protects a team's work, in plain words. Every line
 * is something the app does (the security patch, 1.31.0 to 1.31.16, and
 * what came before it); keep it that way when something changes.
 */

const SECTIONS: { id: string; title: string; lead: string; items: { name: string; text: React.ReactNode }[] }[] = [
  {
    id: "accounts",
    title: "Your connected accounts",
    lead: `The keys to your YouTube, TikTok, Instagram and Facebook accounts are the most sensitive thing ${APP_NAME} holds.`,
    items: [
      {
        name: "You sign in on the platform's own page",
        text: `Connecting an account opens the platform's own sign-in in a window of its own. ${APP_NAME} never sees your password, only the access you approve there.`,
      },
      {
        name: "Sealed on our server",
        text: "The keys each platform gives us are encrypted with AES-256-GCM before they're stored, with a key only our server has. They never reach a browser, yours included.",
      },
      {
        name: "Connected by the right people",
        text: "Only a team's Masters and Schedulers connect accounts. Each connection starts from a one-time code that runs out after 15 minutes, so nobody else can finish it.",
      },
      {
        name: "Only what your team approved",
        text: (
          <>
            A short goes out when someone on your team scheduled it or pressed Post now, never on its own. {APP_NAME} never comments, likes, follows or sends
            messages.{" "}
            <Link href="/platforms" className={textLink}>
              What it asks each platform for
            </Link>
          </>
        ),
      },
      {
        name: "Disconnect any time",
        text: "Team → Connected accounts. We ask the platform to cancel our access where it lets us, and delete the keys.",
      },
    ],
  },
  {
    id: "work",
    title: "Your team’s work",
    lead: "Scripts, cuts, comments and numbers belong to your team, and only your team sees them.",
    items: [
      {
        name: "Walled off by the database",
        text: "Every table has row-level security: the database itself checks that you're on the team before it answers, so a mistake in a page can't show another team's work.",
      },
      {
        name: "Every action checks who's asking",
        text: "Each change checks that you're signed in, on the team and in a role that may make it. The app's own tests fail for a new action without that check.",
      },
      {
        name: "Roles",
        text: "Masters decide who does what. Revenue is only for Masters and the people they choose.",
      },
      {
        name: "Your email stays private",
        text: "Your teams and the people with an invite between you see your email. Everyone else signed in sees your name and picture.",
      },
      {
        name: "Photos without their hidden details",
        text: "Pictures are made smaller in your browser before they upload, which drops what phones hide in them, like where a photo was taken.",
      },
      {
        name: "Attachments stay files",
        text: "A web page or SVG attached to a comment is kept as a plain download: nothing you attach can open as a page.",
      },
    ],
  },
  {
    id: "signing-in",
    title: "Signing in",
    lead: "Who gets in, and how a stolen or guessed password is kept from doing harm.",
    items: [
      {
        name: "Invite only",
        text: "Accounts are made by invitation from a team's Master. Nobody can make one on their own.",
      },
      {
        name: "Passwords",
        text: "Kept by our sign-in provider as one-way hashes (bcrypt), never in our own tables or logs. At least 8 characters; ones people use a lot, and ones made from your name or email, are refused. No rules about capitals or symbols: a few unrelated words make a strong password.",
      },
      {
        name: "Guessing doesn't work",
        text: "After too many wrong passwords for an account, or from one place, signing in pauses for up to 15 minutes before it checks another. The right password clears the count.",
      },
      {
        name: "Your devices",
        text: "Log out signs out the device you're on. Settings → Account → Sign out everywhere else signs out every other one, for a lost phone or a shared computer. A new password signs out the rest by itself.",
      },
      {
        name: "Links meant for someone else",
        text: "An invite or reset link for another account never switches you into it quietly: you're asked first.",
      },
    ],
  },
  {
    id: "app",
    title: "The app itself",
    lead: "What protects every page, whoever is using it.",
    items: [
      {
        name: "Only our own code runs",
        text: `Every page tells your browser exactly what it may run: only ${APP_NAME}'s own scripts, with a new secret on every visit. No other site can show ${APP_NAME} inside its own.`,
      },
      {
        name: "Other sites can't act for you",
        text: "A request from another website to change anything is turned away before it reaches the app.",
      },
      {
        name: "Limits for each person",
        text: "Signing in, invites, searches and anything that costs per use have a limit per person, so nobody can flood the app or run up its bill.",
      },
      {
        name: "Encrypted on the way",
        text: "Everything travels over HTTPS (with HSTS), and your session's cookies only ever travel over a secure connection.",
      },
      {
        name: "Known problems stop a release",
        text: "Before every release, the packages the app is built from are checked against published security advisories, and one with a known problem stops it. Updates are checked every week.",
      },
      {
        name: "Secrets stay on the server",
        text: "The keys the app itself uses live only on the server: never in a page, and never in the code or its history.",
      },
    ],
  },
  {
    id: "data",
    title: "Your data",
    lead: "Where it's kept, what's noted about how the app runs, and how it goes away.",
    items: [
      {
        name: "Where it lives",
        text: (
          <>
            The app runs on Vercel; its database, sign-in and files are at Supabase; emails go out through Resend. The{" "}
            <Link href="/privacy" className={textLink}>
              privacy policy
            </Link>{" "}
            lists everything that&rsquo;s stored and why.
          </>
        ),
      },
      {
        name: "Deleted when you ask",
        text: (
          <>
            Delete your account in Settings, or ask us to.{" "}
            <Link href="/data-deletion" className={textLink}>
              Deleting your data
            </Link>{" "}
            says what goes and how quickly.
          </>
        ),
      },
      {
        name: "Speed, measured without who",
        text: "To keep pages quick, the app notes how fast they open: the page, phone or computer and the connection, never who or which video. Kept for 30 days.",
      },
      {
        name: "Errors without your work",
        text: "When something breaks, the report we get says which page, not what was on it.",
      },
    ],
  },
];

export default function SecurityPage() {
  const report = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME}: security report`)}` : null;
  return (
    <SitePage current="/security" flush>
      <PageHead
        title="How your team’s work is kept safe"
        lead={`${APP_NAME} holds your scripts, your cuts and the keys to your channels. This is what protects them, in plain words, and how to tell us if you find a problem.`}
      />

      <nav aria-label="On this page" className="max-w-6xl mx-auto px-4 sm:px-6">
        <ul className="flex flex-wrap gap-2">
          {[...SECTIONS.map((s) => ({ id: s.id, title: s.title })), { id: "report", title: "Report a problem" }].map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex items-center rounded-xl border border-line/15 px-3.5 h-10 text-[14px] hover:border-line/40 hover:bg-surface">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-16 sm:mt-24 space-y-20 sm:space-y-28">
        {SECTIONS.map((s) => (
          <SiteSection key={s.id} id={s.id} title={s.title} lead={s.lead}>
            <FactList items={s.items} />
          </SiteSection>
        ))}
      </div>

      {/* Reporting a problem: the page's one dark band, and its ending. */}
      <section id="report" aria-labelledby="report-title" className="scroll-mt-16 mt-24 sm:mt-32 bg-[rgb(43_33_24)] text-[rgb(246_240_228)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <span className="block w-14 h-[7px] rounded-[3px] ld-stripes-light" aria-hidden />
            <h2 id="report-title" className="mt-5 font-display text-[32px] sm:text-[44px] font-semibold leading-[1.04] tracking-[-0.02em] max-w-[16ch]">
              Found a security problem?
            </h2>
            <p className="mt-4 text-[16.5px] leading-relaxed text-[rgb(246_240_228/0.78)] max-w-[32rem]">
              Tell us what you found and how to see it happen. We read every report, reply, and tell you when it&rsquo;s fixed.
            </p>
            <p className="mt-8">
              {report ? (
                <a href={report} className="font-display text-[24px] sm:text-[30px] font-semibold underline decoration-[rgb(var(--amber))] decoration-2 underline-offset-[6px] hover:text-[rgb(var(--amber))] break-all">
                  {CONTACT_EMAIL}
                </a>
              ) : (
                <Link href="/contact" className="font-display text-[24px] sm:text-[30px] font-semibold underline decoration-[rgb(var(--amber))] decoration-2 underline-offset-[6px] hover:text-[rgb(var(--amber))]">
                  Contact us
                </Link>
              )}
            </p>
          </div>
          <div className="lg:pt-[52px]">
            <h3 className="font-display text-[21px] font-semibold">While you look</h3>
            <ul className="mt-4 space-y-3 text-[15.5px] leading-relaxed text-[rgb(246_240_228/0.78)] list-disc pl-5 marker:text-[rgb(var(--amber))]">
              <li>Use your own account and your own team. Don&rsquo;t look at, change or keep anyone else&rsquo;s work beyond what shows the problem.</li>
              <li>Don&rsquo;t slow the app down for others: no floods of requests, no spam, nothing that fills it up.</li>
              <li>Give us time to fix it before you tell anyone else.</li>
            </ul>
            <p className="mt-6 text-[14.5px] text-[rgb(246_240_228/0.6)]">
              For tools that look for it: <a href="/.well-known/security.txt" className="underline underline-offset-2 hover:text-[rgb(246_240_228)]">/.well-known/security.txt</a>
            </p>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
