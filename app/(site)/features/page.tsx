import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, MASCOT_NAME } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { Play } from "@/components/landing/landing-client";
import { MeasureVignette, PipelineVignette, PlanVignette, PostVignette, ReviewVignette, ScriptVignette } from "@/components/landing/vignettes";
import { OutliersFrame, StudioFrame } from "@/components/site/frames";
import { FactList, PageHead, SiteCta, SitePage, textLink } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  ...publicMetadata(
    "/features",
    "Features",
    `Everything ${APP_NAME} does, in the order a video is made: planning, scripts, steps and people, review, thumbnails, posting to four platforms, analytics and research.`
  ),
  robots: { index: true, follow: true },
};

/*
 * Features (1.33.0): the whole production in the order a video is made (the
 * home page's scenes, in full), then research and the team's everyday tools.
 */

type Chapter = {
  id: string;
  name: string;
  title: string;
  text: string;
  items: [string, string][];
  Visual: () => React.ReactNode;
  more?: { href: string; label: string };
};

const CHAPTERS: Chapter[] = [
  {
    id: "plan",
    name: "Plan",
    title: "Ideas become a schedule",
    text: "Shorts go into a queue and take a day by themselves, a few a day, around your days off. Long videos keep their own deadline. It all lands on one calendar the whole team shares.",
    items: [
      ["The shorts queue", "Set how many shorts go out a day and which days are off. Each new short takes the next free slot."],
      ["Fixed dates", "Pin a short to a date when it has to go out then: the queue carries on around it."],
      ["Long videos", "Each one has its expected date and moves through its own steps toward it."],
      ["One calendar", "Shorts, long videos, posts and meetings, by month or week. Drag a video to another day."],
      ["Meetings", "An agenda, notes and action items that land in each person's tasks."],
      ["Objectives", "Goals by the day, week, month, quarter or year, and a win streak while you keep hitting them."],
      ["Projections", "Where your views, followers or revenue will be by a date, at the pace you're going."],
    ],
    Visual: PlanVignette,
  },
  {
    id: "write",
    name: "Write",
    title: "Scripts, written together",
    text: "A writing space made for video: pages and headings, comments on any line, and editing ideas sketched right beside the words. When it's ready, it goes to review, then staging.",
    items: [
      ["Comments and sketches", "Comment on a line, or draw the editing idea next to it. Resolve them as you go."],
      ["Versions", "Every version is kept. Open two side by side."],
      ["Spelling and grammar", "Suggestions as you write, with your team's own dictionary for names and slang."],
      ["Hand it on", "Script, review, staging: the next person is told it's their turn."],
      ["Research", "Each long video has a research document beside its script."],
      ["Word and PDF", "Export a script to send it or print it."],
    ],
    Visual: ScriptVignette,
  },
  {
    id: "make",
    name: "Make",
    title: "Everyone knows whose turn it is",
    text: "Every short and long video moves through the same steps, with a person on each. Mark your part done and the next person hears about it at that moment.",
    items: [
      ["Steps with people", "From script to filming, editing, review, the thumbnail and posting, each with someone on it."],
      ["Your tasks", "Today's, the late ones and what's next, for each person, on the dashboard."],
      ["Notifications", "In the app and on your phone: your turn, a note for you, a short gone live."],
      ["Roles", "Masters run the team. Researchers, Scripters, Filmers, Editors, Packagers and Schedulers each see what's theirs."],
      ["XP and levels", "Every finished step earns XP. Levels, achievements and picture frames show on your profile."],
    ],
    Visual: PipelineVignette,
  },
  {
    id: "review",
    name: "Review",
    title: "Notes on the exact frame",
    text: "Upload a cut and the team watches it right in the browser. Pin a note to the second it's about, reply, upload the next version and compare. Approve it when it's right.",
    items: [
      ["Watch in the browser", "No downloads, no links to other sites: the cut plays in the video's page."],
      ["Notes on a moment", "Each note is pinned to its second, with replies under it."],
      ["Every version", "Upload the next cut and compare it with the last."],
      ["Approve or send back", "With a note the editor sees right away."],
    ],
    Visual: ReviewVignette,
  },
  {
    id: "package",
    name: "Package",
    title: "The thumbnail that gets the click",
    text: "Thumbnail Studio puts your thumbnail ideas where viewers will meet them: YouTube's home page, search, a phone and a TV, between other channels' videos.",
    items: [
      ["Versions", "Upload as many as you like. Each is checked against YouTube's size and weight limits."],
      ["Where they'll be seen", "Home, search, a phone and a TV, with your channel's name."],
      ["Titles", "Try your titles on each version."],
      ["Pick the winner", "Or two or three, for a test on YouTube."],
    ],
    Visual: StudioFrame,
  },
  {
    id: "post",
    name: "Post",
    title: "Out everywhere, on time",
    text: "Schedule each approved short for YouTube, TikTok, Instagram and Facebook from your team's own accounts, or post it everywhere right now. You see every step.",
    items: [
      ["Four platforms", "YouTube Shorts, TikTok, Instagram Reels and Facebook Reels on your Page."],
      ["Scheduled or now", "A time for each platform, or everywhere at once."],
      ["Each platform's choices", "Visibility on YouTube; privacy, comments, duet and stitch on TikTok; a caption for each."],
      ["The Posting page", "Every post's progress. When something goes wrong: what happened, and Try again."],
      ["Connections checked", "You're told before a platform's sign-in runs out."],
    ],
    Visual: PostVignette,
    more: { href: "/platforms", label: "What ClipTroop asks each platform for" },
  },
  {
    id: "measure",
    name: "Measure",
    title: "See what worked",
    text: "Views, watch time, followers and revenue from every platform, side by side, next to what your team made. Copied every morning, and new videos within minutes.",
    items: [
      ["Every platform together", "One number for all of them, or each on its own."],
      ["Each video", "Its own page of numbers, day by day."],
      ["Audience", "Where your viewers are, by country."],
      ["What works", "Your best videos, and what they have in common."],
      ["Money for the right people", "Only Masters, and the people they choose, see revenue."],
      ["Download for Claude", "Your numbers in a PDF to ask an AI assistant about."],
    ],
    Visual: MeasureVignette,
  },
];

const RESEARCH: [string, string][] = [
  ["Your niche", "Channels like yours, found for you and followed."],
  ["Outliers", "Videos many times their channel's usual views, ranked."],
  ["What they share", "Their titles, thumbnails, formats and keywords, side by side."],
  ["Ideas", "Ideas for your next videos, from what's working now."],
  ["Alerts", "A notification when a channel you follow has a breakout."],
  ["Saved", "Keep the ones worth remembering, in folders."],
];

const EVERYDAY: [string, string][] = [
  ["Search everything", "Videos, scripts, people, settings and pages, with Ctrl K or ⌘ K."],
  ["Your dashboard", "Widgets you arrange: today's tasks, the calendar, your numbers, the weather, the daily word."],
  ["Your look", "Twenty colour themes in light and dark, a glass look and wallpapers."],
  ["On your phone", "Add it to your home screen on iPhone or Android, notifications included. No app store."],
  [`${MASCOT_NAME}'s tour`, `${MASCOT_NAME} shows you around the first time you sign in.`],
  ["A public status page", "Whether everything is running, hour by hour."],
];

function Items({ items }: { items: [string, string][] }) {
  return <FactList columns={3} items={items.map(([name, text]) => ({ name, text }))} />;
}

export default function FeaturesPage() {
  return (
    <SitePage current="/features">
      <PageHead
        title="The whole production, in one place"
        lead={`From the first idea to the numbers a month after posting: what ${APP_NAME} does at each step of making a video, and who does it.`}
      />

      {/* The chapters, to jump to. */}
      <nav aria-label="On this page" className="max-w-6xl mx-auto px-4 sm:px-6">
        <ol className="flex flex-wrap gap-2">
          {CHAPTERS.map((c, i) => (
            <li key={c.id}>
              <a href={`#${c.id}`} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-3.5 h-10 text-[14px] hover:border-line/40 hover:bg-surface">
                <span className="tabular-nums text-ink-faint">{i + 1}</span>
                {c.name}
              </a>
            </li>
          ))}
          <li>
            <a href="#research" className="inline-flex items-center rounded-xl border border-line/15 px-3.5 h-10 text-[14px] hover:border-line/40 hover:bg-surface">
              Research
            </a>
          </li>
          <li>
            <a href="#everyday" className="inline-flex items-center rounded-xl border border-line/15 px-3.5 h-10 text-[14px] hover:border-line/40 hover:bg-surface">
              Every day
            </a>
          </li>
        </ol>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24 space-y-24 sm:space-y-32">
        {CHAPTERS.map((c, i) => (
          <Play key={c.id} id={c.id} className="scroll-mt-24">
            <section aria-labelledby={`${c.id}-title`}>
              <div className="grid gap-10 lg:gap-14 items-center lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="max-w-[34rem]">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-9 h-[7px] rounded-[3px] ld-stripes" aria-hidden />
                    <span className="ld-scene-mark text-[17px] text-amber">
                      Scene {i + 1}: {c.name}
                    </span>
                  </div>
                  <h2 id={`${c.id}-title`} className="font-display text-[32px] sm:text-[42px] font-semibold leading-[1.05] tracking-[-0.02em]">
                    {c.title}
                  </h2>
                  <p className="mt-4 text-[16.5px] leading-relaxed text-ink-soft">{c.text}</p>
                  {c.more && (
                    <p className="mt-4 text-[15px]">
                      <Link href={c.more.href} className={textLink}>
                        {c.more.label}
                      </Link>
                    </p>
                  )}
                </div>
                <c.Visual />
              </div>
              <div className="mt-12">
                <Items items={c.items} />
              </div>
            </section>
          </Play>
        ))}

        <section id="research" aria-labelledby="research-title" className="scroll-mt-24">
          <div className="grid gap-10 lg:gap-14 items-center lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="max-w-[34rem]">
              <h2 id="research-title" className="font-display text-[32px] sm:text-[42px] font-semibold leading-[1.05] tracking-[-0.02em]">
                Know what&rsquo;s working before you film
              </h2>
              <p className="mt-4 text-[16.5px] leading-relaxed text-ink-soft">
                Outliers finds the videos in your niche doing many times better than their channel usually does, and shows what they have in common, so your next idea
                starts from what people are watching.
              </p>
            </div>
            <OutliersFrame />
          </div>
          <div className="mt-12">
            <Items items={RESEARCH} />
          </div>
        </section>

        <section id="everyday" aria-labelledby="everyday-title" className="scroll-mt-24">
          <h2 id="everyday-title" className="font-display text-[32px] sm:text-[42px] font-semibold leading-[1.05] tracking-[-0.02em] max-w-[20ch]">
            And every day
          </h2>
          <p className="mt-4 mb-12 text-[16.5px] leading-relaxed text-ink-soft max-w-[36rem]">The small things that make it the place your team opens first.</p>
          <Items items={EVERYDAY} />
        </section>
      </div>

      <SiteCta
        text={`${APP_NAME} is invite only while we open it up team by team. Tell us about your channels and your team, and we'll set you up.`}
      />
    </SitePage>
  );
}
