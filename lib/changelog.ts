/**
 * What changed in each version — the app's own patch notes.
 *
 * This list IS the record of what was added with each update: the
 * "What's new" window reads it, and the handoff's version history is
 * written from it. Every release adds one entry at the TOP, with the same
 * version as package.json (fixes 1.x.y, features 1.x.0, milestones x.0.0).
 *
 * Write for the team, not for developers: what they can now do, in plain
 * words. `kind`: "new" = a new thing, "better" = something improved,
 * "fixed" = a bug that's gone.
 */
export type ChangeKind = "new" | "better" | "fixed";
export type Change = { kind: ChangeKind; text: string };
export type Release = {
  version: string;
  /** YYYY-MM-DD (left out when unknown). */
  date?: string;
  /** A few words: the headline of this update. */
  title: string;
  changes: Change[];
};

export const CHANGELOG: Release[] = [
  {
    version: "1.6.0",
    date: "2026-10-03",
    title: "Colour themes, Facebook in Analytics, and smoother connecting",
    changes: [
      { kind: "new", text: "Colour themes: Clippy (the original), Ocean, Forest, Lagoon, Grape, Berry and Sand, each in light and dark. Pick yours in Settings → Preferences → Colours. Only you see it, and it follows you to every device." },
      { kind: "new", text: "Facebook in Analytics: connect your Facebook Page in Team → Connected accounts to see its views, likes, comments and shares, new followers and posts next to YouTube, Instagram and TikTok. (Posting to Facebook stays by hand.)" },
      { kind: "new", text: "Audience: pick which platforms to count. Click one to see only it, add others to combine them, or All together. Every number, chart and the CSV follow your choice." },
      { kind: "better", text: "Connect and Reconnect open in their own window, so the page you're on stays put. When you're done, the window closes and the account updates." },
      { kind: "fixed", text: "Unticking permissions on YouTube's (or TikTok's) screen no longer leaves a half-working connection: VPlanner says which boxes are needed and keeps your previous connection." },
      { kind: "fixed", text: "TikTok numbers: daily views now count correctly (TikTok only shares totals, so they start the day after the first copy), and its totals, likes and followers show from the first sync." },
      { kind: "fixed", text: "Coming back from connecting an account no longer jumps to the Members tab, and the \"16s ago\" times no longer cause an error when a page loads." },
      { kind: "better", text: "The Setup check is only on staging and your computer, not in production." },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-10-03",
    title: "Analytics widgets, the world map, and a calmer look",
    changes: [
      { kind: "new", text: "Analytics widgets for your dashboard: This week (shorts and long videos out, on time, overdue), Views (last 7 days with the trend), Followers, Top videos and an Audience map. Add them from Customize → Add widget." },
      { kind: "new", text: "The audience heat map: a world map of where your views come from, switchable to watch time and Instagram followers. The map now ships with the app, so it always shows." },
      { kind: "fixed", text: "Country numbers could stay empty for good if one copy went wrong. Every sync now fills in any missing days from the last 4 weeks." },
      { kind: "fixed", text: "Reconnecting accounts on staging sent you back to production and failed. Each copy of VPlanner now uses its own return address, and when a platform refuses, you see its reason." },
      { kind: "new", text: "Setup check in Team → Connected accounts (masters and schedulers): shows each platform's keys, analytics permission and the exact return address to register in its developer app." },
      { kind: "better", text: "Long videos: calmer cards with a strip showing where each video is in the pipeline, and dates that turn orange when they're close and red when they're late." },
      { kind: "better", text: "Short videos: rows are one clean line, with a pin for fixed dates and the reviewer's requested changes right under the title. Stage tabs have their colour dot, and Mark done is quieter in lists." },
      { kind: "better", text: "No more gradients anywhere. Meetings violet is deeper in light mode and brighter in dark mode, so it reads clearly on both." },
      { kind: "better", text: "Our mascot has a name: say hi to Clippy." },
      { kind: "fixed", text: "The Create video buttons no longer float over the form while you scroll." },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-10-03",
    title: "Analytics: how the work flows and how the videos do",
    changes: [
      { kind: "new", text: "Analytics, in the menu under Insights. Pick 7 days, 28 days, 90 days or 12 months, compare with the same stretch just before, and export any tab as a CSV for Excel or Sheets." },
      { kind: "new", text: "Production: shorts and long videos posted, how many went out on their planned day, how many days a short takes from idea to posted, what's overdue right now, which step work waits in longest, who finished what, and how automatic posting went." },
      { kind: "new", text: "Audience: views per day on YouTube, Instagram and TikTok (each, or all together against the period before), watch time, likes, comments and shares, new followers, YouTube Shorts vs long videos, and a world map of where the views come from." },
      { kind: "new", text: "Content: every video and post in the range with its views, likes, comments and shares, and a link to our short or long video it came from." },
      { kind: "new", text: "Revenue: YouTube's estimated revenue, per 1,000 views and month by month. Only masters see it, and the people a master turns it on for." },
      { kind: "better", text: "Platform numbers are copied every morning on their own; masters and schedulers can press Sync now. To allow it, reconnect YouTube, Instagram and TikTok once in Team → Connected accounts." },
      { kind: "better", text: "The menu icons are calm grey again and light up in their colour when you point at them or are on that page." },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-10-03",
    title: "Meetings, a new menu, and Clip as our logo",
    changes: [
      { kind: "new", text: "Meetings: masters and schedulers plan the team's calls (Discord by default, with a join link and an agenda). Everyone answers Going, Maybe or Can't, and each meeting keeps its notes and action items (who does what, by when)." },
      { kind: "new", text: "Reminders 3 days, 1 day and 1 hour before every meeting, in the app and by email. Planning, moving or cancelling a meeting tells everyone invited." },
      { kind: "new", text: "Add a meeting to Google Calendar, or download it for Apple Calendar and Outlook." },
      { kind: "new", text: "Next meeting widget on the dashboard: when, where, who's coming, and your answer right there. (Customized dashboards: add it from Add widget.)" },
      { kind: "new", text: "Meetings show in the calendar in their own violet colour, and as a violet dot in every date picker." },
      { kind: "better", text: "A new menu: grouped into Content, Schedule and Team. On phones the bar has Home, Shorts, Long, Calendar and More (Meetings, Posting, Team, Settings, What's new, Log out)." },
      { kind: "better", text: "Clip is now the VPlanner logo: in the menu, on phones, on the sign-in pages and as the browser tab icon. Point at him and he claps." },
      { kind: "fixed", text: "The light colour tints on many badges and chips (due dates, today, What's new labels, step chips) weren't showing. Now they do." },
    ],
  },
  {
    version: "1.2.1",
    date: "2026-10-03",
    title: "One calendar everywhere, black paper for sketches",
    changes: [
      { kind: "fixed", text: "Adding a drawing to an editing idea could fail with \"Couldn't upload the drawing\". Drawings now upload through a link the server signs after checking you're on the team, and a real reason is shown if anything still goes wrong." },
      { kind: "new", text: "Black paper in Sketch Studio: one tap turns the paper (and the studio) dark. Ink switches to white so nothing disappears, and the picture keeps its black paper in comments and in the Word and PDF exports. Your choice is remembered." },
      { kind: "better", text: "Deleting a comment or an editing idea asks first, so a misclick can't lose it." },
      { kind: "better", text: "One calendar across the app: every date picker (shorts, long videos, to-dos, the calendar page) and the dashboard Calendar widget are now the same calendar, with planned / full / long markers and a peek at what's on each day." },
      { kind: "better", text: "Long video dates use a small date button with a calendar icon (new long video, video settings), like the post date on shorts." },
      { kind: "fixed", text: "Clicking a day in the dashboard Calendar now opens that day in the big calendar." },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-10-02",
    title: "Scripting: mentions, sketches and safer drafts",
    changes: [
      { kind: "new", text: "@mentions in script comments and editing ideas. Type @ to tag a teammate, a role (@Editor, @Scheduler…) or @all. The people working on that video are suggested first, and whoever you tag gets a notification that opens the exact comment." },
      { kind: "new", text: "Sketch Studio: draw an editing idea instead of describing it. Pen, marker, shapes, arrows, text, sticky notes, stickers and images, on an endless canvas with zoom, undo and redo. Works with a finger or a pen on phones and tablets." },
      { kind: "new", text: "Sketches appear under their idea: tap one to see it full screen (pinch or tap to zoom), and they're included in the Word and PDF exports." },
      { kind: "better", text: "Drafts are safe: the text you're commenting on stays highlighted while you write, closing asks before throwing anything away, and an unfinished comment or sketch is kept on your device so you can restore it." },
      { kind: "new", text: "What's new: this window. A dot appears on it after every update." },
      { kind: "better", text: "Every page now shows its real shape while it loads (titles, tabs and columns in place), with one soft shimmer across the screen." },
      { kind: "better", text: "Clip is bigger in My tasks when you're all done for the day." },
      { kind: "better", text: "The grid behind the dashboard widgets is back while you arrange them, brighter while you're dragging." },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-02",
    title: "Dashboard Studio, rebuilt",
    changes: [
      { kind: "new", text: "The dashboard is a 12-column board: the same layout on every desktop screen, widgets fill empty space, and dragging and resizing are smooth (keyboard works too)." },
      { kind: "new", text: "Add widget shows live previews of every widget with your real data." },
      { kind: "new", text: "Meet Clip, the clapperboard. He celebrates when your tasks for today are done." },
      { kind: "new", text: "Little sounds across the app (checking things off, saving, notifications, dragging). Turn them off in Settings → Preferences." },
      { kind: "better", text: "My tasks has tabs, with Overdue in red when something is late." },
      { kind: "better", text: "Livelier widgets: numbers count up, pipeline bars grow, the weather icon moves, the to-do list checks off with a flourish." },
      { kind: "fixed", text: "No more sideways scrollbars in menus and popups." },
      { kind: "fixed", text: "A page error when opening the dashboard (drag and drop setup)." },
    ],
  },
  {
    version: "1.0.0",
    title: "VPlanner 1.0",
    changes: [
      { kind: "new", text: "Shorts and long videos from idea to posted, with steps, people, dates and activity." },
      { kind: "new", text: "Scripts with versions, side by side documents, comments and editing ideas, Word and PDF export." },
      { kind: "new", text: "Video review with time-stamped notes, version compare and approvals." },
      { kind: "new", text: "Automatic posting with health checks, the calendar, Thumbnail Studio and the first dashboard." },
    ],
  },
];

export const KIND_LABEL: Record<ChangeKind, string> = { new: "New", better: "Better", fixed: "Fixed" };

/** "1.2.3" → [1, 2, 3] (anything odd counts as 0). */
const parts = (v: string) => v.split(".").map((n) => Number.parseInt(n, 10) || 0);

/** A feature release or milestone happened between `from` and `to` (not just fixes). */
export function isFeatureUpdate(from: string | null, to: string) {
  if (!from) return true;
  const [a1, a2] = parts(from);
  const [b1, b2] = parts(to);
  return b1 > a1 || (b1 === a1 && b2 > a2);
}

/** -1 / 0 / 1, like a sort comparator. */
export function compareVersions(a: string, b: string) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}
