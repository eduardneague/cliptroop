/**
 * Every feature of ClipTroop that every team has, one page each on the website (1.45.0: /features/<slug>). The owner:
 * "describe every feature that is publicly available in separate pages". Business isn't here: only teams a developer
 * picks have it. Written from what the app does (lib/changelog.ts has the long version): plain words, no numbers we
 * can't stand behind, nobody real.
 *
 * Departments run in the order a video is made, and the features in each the same way, so a page's "next" is what
 * comes next in the work. `visual` names its demo (components/site/visuals.tsx).
 */

export type DeptId = "plan" | "write" | "make" | "review" | "post" | "measure" | "research" | "team";

export const DEPTS: { id: DeptId; name: string; line: string }[] = [
  { id: "plan", name: "Planning", line: "What goes out, when, and who’s on it." },
  { id: "write", name: "Writing", line: "Scripts and research, written together." },
  { id: "make", name: "Production", line: "Filming and editing, each step with a person on it." },
  { id: "review", name: "Review", line: "Notes on the frame, and the thumbnail that gets the click." },
  { id: "post", name: "Posting", line: "Four platforms, from your team’s own accounts." },
  { id: "measure", name: "Insights", line: "What worked, what’s next, and the deck sponsors ask for." },
  { id: "research", name: "Research", line: "What’s taking off in your niche, before you film." },
  { id: "team", name: "The team", line: "Roles, the dashboard, your phone, and making it yours." },
];

export type VisualId =
  | "plan"
  | "longvideo"
  | "meeting"
  | "script"
  | "pipeline"
  | "review"
  | "studio"
  | "post"
  | "measure"
  | "objectives"
  | "projection"
  | "mediakit"
  | "outliers"
  | "team"
  | "dashboard"
  | "profile"
  | "phone"
  | "search"
  | "look";

export type SiteFeature = {
  slug: string;
  name: string;
  dept: DeptId;
  /** The page's headline. */
  title: string;
  /** In lists: what it is, in a line. */
  line: string;
  /** Under the headline. */
  lead: string;
  visual: VisualId;
  /** Who works in it (the team's roles). */
  who: string[];
  /** Where it is in the app. */
  where: string;
  /** What it does, part by part. */
  sections: { title: string; text: string }[];
  /** The details, each in a sentence or two. */
  details: [string, string][];
  /** Other pages it works with. */
  related: string[];
};

export const FEATURES: SiteFeature[] = [
  // Planning ------------------------------------------------------------------------------------------------------------
  {
    slug: "shorts",
    name: "Shorts",
    dept: "plan",
    title: "A queue that schedules your shorts for you",
    line: "New shorts take the next free day, a few a day, around your days off.",
    lead: "Add a short and it takes the next free slot: as many a day as you post, never on a day off. Pin the ones that have to go out on a date, and the queue moves around them.",
    visual: "plan",
    who: ["Masters", "Scripters", "Filmers", "Editors", "Schedulers"],
    where: "Shorts, in the menu",
    sections: [
      {
        title: "The queue does the dates",
        text: "Set how many shorts go out a day and which days are off. Every new short lands on the next free day, so the calendar fills itself and nobody has to count.",
      },
      {
        title: "From script to posted, with a person on each step",
        text: "A short moves Script, Filming, Editing, Review, then out. The filmer marks the footage filmed and adds the folder it’s in; the editor sees that folder with a Copy button; whoever is next hears about it at once.",
      },
      {
        title: "Many at once",
        text: "Select several shorts on the cards or in the table to move them, change their step or export them to a spreadsheet.",
      },
    ],
    details: [
      ["Daily limits", "How many shorts a day, and which days of the week are off."],
      ["Fixed dates", "Pin a short to a day when it has to go out then."],
      ["A Filming step", "The filmer is told when a script is ready to film, and marks it filmed when the footage is in."],
      ["The footage folder", "Kept on the short at Editing, with a Copy button for the editor."],
      ["Defaults", "Pick the usual scripter, filmer, editor and scheduler once, for every new short."],
      ["Types", "Mark what kind each short is, a sponsorship say, and set the usual kind for new ones."],
      ["Files that clear themselves", "Once a short is posted everywhere, its video files go after 7 to 30 days, as you choose."],
    ],
    related: ["calendar", "workflow", "review", "posting"],
  },
  {
    slug: "long-videos",
    name: "Long videos",
    dept: "plan",
    title: "Long videos, from research to the upload",
    line: "Research, script, film, edit, package and post, each with its own person and a date to hit.",
    lead: "Each long video has a date it’s expected and moves through its own steps toward it: research, the script, filming, the edit, the thumbnail and title, and posting.",
    visual: "longvideo",
    who: ["Masters", "Researchers", "Scripters", "Filmers", "Editors", "Packagers", "Schedulers"],
    where: "Videos, in the menu",
    sections: [
      {
        title: "Every step has its owner",
        text: "Pick who researches, writes, films, edits, packages and posts each video, or set the usual people once for the team. The step that’s late stands out on the video and on the dashboard.",
      },
      {
        title: "Research next to the script",
        text: "Each long video has a research document beside its script, so sources, notes and the script are one click apart.",
      },
      {
        title: "Reviewed in ClipTroop",
        text: "Turn on review for the team or for one video: the editor uploads the edit, files up to 3 GB, and the Master leaves notes at any moment of it. Approving keeps the version you watched, ready to download for YouTube.",
      },
    ],
    details: [
      ["Expected date", "Every long video works back from the day it should go out."],
      ["Six steps", "Research, Script, Filming, Editing, Packaging and Posting."],
      ["Team defaults", "The usual researcher, scripter, filmer, editor, packager and scheduler for new videos."],
      ["Review on or off", "For the whole team, or video by video."],
      ["Versions to compare", "Every upload is kept, and any two play side by side."],
      ["Files kept as long as you need", "A posted video’s files go after a week, or the time you pick; Masters and Schedulers can keep a video’s files."],
    ],
    related: ["scripts", "review", "thumbnail-studio", "calendar"],
  },
  {
    slug: "calendar",
    name: "Calendar",
    dept: "plan",
    title: "One calendar the whole team shares",
    line: "Shorts, long videos, posts and meetings by month or week. Drag to move.",
    lead: "Everything with a date lands in one place: shorts, long videos, what’s scheduled to post and the team’s meetings. Drag a video to another day and it moves everywhere.",
    visual: "plan",
    who: ["Everyone on the team"],
    where: "Calendar, in the menu",
    sections: [
      {
        title: "Month or week",
        text: "The month for the shape of things, the week for what’s happening today and tomorrow. Shorts and long videos keep the colours your team chose for them.",
      },
      {
        title: "Drag to change the plan",
        text: "Move a video to another day and its date changes for everyone, on the calendar, on the video and in the posting schedule.",
      },
    ],
    details: [
      ["Everything dated", "Shorts, long videos, scheduled posts and meetings."],
      ["Your team’s colours", "Pick the colours for shorts and long videos in Team → Appearance."],
      ["Days off", "The queue’s days off show, so nobody plans into them by mistake."],
      ["On the dashboard", "A calendar widget with the days ahead."],
    ],
    related: ["shorts", "long-videos", "meetings", "dashboard"],
  },
  {
    slug: "meetings",
    name: "Meetings",
    dept: "plan",
    title: "Meetings with an agenda, notes and what happens next",
    line: "Plan the call, see who’s coming, keep the notes, hand out the action items.",
    lead: "Masters and Schedulers plan the team’s calls with a join link and an agenda. Everyone answers Going, Maybe or Can’t, and each meeting keeps its notes and action items, who does what by when.",
    visual: "meeting",
    who: ["Masters", "Schedulers", "Everyone invited"],
    where: "Meetings, in the menu",
    sections: [
      {
        title: "Before",
        text: "A time, a link (Discord to start with, any other works), the agenda and who’s invited. Reminders go out 3 days, 1 day and 1 hour before, in the app and by email.",
      },
      {
        title: "After",
        text: "The notes stay with the meeting, and each action item lands in its person’s tasks with its date. When they finish it, whoever planned the meeting hears about it.",
      },
    ],
    details: [
      ["Going, Maybe or Can’t", "Everyone answers in one tap, and the meeting shows who’s coming."],
      ["Reminders", "3 days, 1 day and 1 hour before, in the app and by email."],
      ["Changes told", "Moving or cancelling a meeting tells everyone invited."],
      ["Your calendar too", "Add it to Google Calendar, or download it for Apple Calendar and Outlook."],
      ["On the dashboard", "The next meeting: when, where, who’s coming, and your answer right there."],
    ],
    related: ["calendar", "dashboard", "team"],
  },

  // Writing -------------------------------------------------------------------------------------------------------------
  {
    slug: "scripts",
    name: "Scripts",
    dept: "write",
    title: "Scripts, written together, on real pages",
    line: "Pages like Word, comments and sketches on any line, suggestions as you write.",
    lead: "A writing space made for video: pages that fill as you type, comments on any line, editing ideas sketched right beside the words, and suggestions for spelling, clarity and tone. When it’s ready, it goes to review, then staging.",
    visual: "script",
    who: ["Scripters", "Researchers", "Masters", "Editors"],
    where: "Scripts, in the menu, and on every video",
    sections: [
      {
        title: "Pages you write on",
        text: "Write straight onto the page, two or three pages in a row. Ctrl and Enter starts a new one. What you see is what prints and what goes into Word.",
      },
      {
        title: "Notes where they belong",
        text: "Comment on a line, @mention a teammate or a role, or draw the editing idea in Sketch Studio: pen, shapes, arrows, sticky notes and pictures on an endless canvas. Sketches go into the exports too.",
      },
      {
        title: "Suggestions as you write",
        text: "Coloured lines for spelling and grammar, clarity, livelier words and tone, with the fix and why. A score out of 100, and the team’s own dictionary for names and slang you use on purpose.",
      },
      {
        title: "Hand it on",
        text: "Ready for review, then ready for staging: the next person is told it’s their turn, and the comments and ideas travel with the text.",
      },
    ],
    details: [
      ["Versions", "Every version is kept. Open two side by side."],
      ["Research", "A research document beside each long video’s script."],
      ["Links you can open", "Point at a link to see where it goes, and open YouTube, TikTok or Instagram beside the script."],
      ["Lists and indents", "Lists number themselves, and Tab indents, the way you’d expect."],
      ["Search inside scripts", "Find a phrase, open the script, and it scrolls to the words."],
      ["Word and PDF", "Export a script to send it or print it, sketches included."],
      ["Drafts kept", "An unfinished comment or sketch is kept on your device until you’re back."],
    ],
    related: ["workflow", "long-videos", "search"],
  },

  // Production ----------------------------------------------------------------------------------------------------------
  {
    slug: "workflow",
    name: "Steps and turns",
    dept: "make",
    title: "Everyone knows whose turn it is",
    line: "Every video moves through the same steps, with a person on each. The next one is told.",
    lead: "Every short and long video moves through the same steps, with a person on each one. Mark your part done and it moves on, and the editor, reviewer or scheduler hears about it at that moment.",
    visual: "pipeline",
    who: ["Everyone on the team"],
    where: "Every video, My tasks and the dashboard",
    sections: [
      {
        title: "Your tasks, in order",
        text: "My tasks lists what’s yours today, what’s late and what’s next, across every video. Masters can let the team see everyone’s tasks, with late ones in red.",
      },
      {
        title: "Turns, not chasing",
        text: "When a script is handed to you, a cut needs your review or a short goes live, you’re told in the app and on your phone. Nobody has to ask who’s got it.",
      },
    ],
    details: [
      ["A person on every step", "Script, filming, editing, review, the thumbnail and posting."],
      ["Asked before done", "Marking a step done asks first, so nothing moves on by accident."],
      ["Late work stands out", "On the video, in the lists and on the dashboard."],
      ["Team tasks", "Masters choose who sees everyone’s tasks: only their own, Masters, or the whole team."],
      ["XP for finished steps", "Every step done earns XP on your profile, a quarter more when it’s on time."],
    ],
    related: ["team", "dashboard", "mobile", "profiles"],
  },

  // Review --------------------------------------------------------------------------------------------------------------
  {
    slug: "review",
    name: "Review",
    dept: "review",
    title: "Notes on the exact frame",
    line: "Watch the cut in the browser, pin notes to the second, approve or send it back.",
    lead: "Upload a cut and the team watches it right in the browser. Pin a note to the second it’s about, reply, upload the next version and compare. Approve it when it’s right.",
    visual: "review",
    who: ["Editors", "Masters"],
    where: "On every short, and long videos with review on",
    sections: [
      {
        title: "Watch where you work",
        text: "No downloads and no links to other sites: the cut plays on the video’s page, full screen if you like, with notes on the timeline where they belong.",
      },
      {
        title: "Versions side by side",
        text: "Each new cut is kept. Compare any two, see which notes were resolved, and approve the one you watched.",
      },
    ],
    details: [
      ["Notes on a moment", "Each note is pinned to its second, with replies under it."],
      ["Resolve as you go", "Tick a note off when it’s fixed."],
      ["Approve or send back", "With a note the editor sees right away."],
      ["Long videos too", "Edits up to 3 GB, reviewed the same way."],
      ["Frames for Claude", "Frames from a short go into the analytics export, for asking an AI assistant about it."],
    ],
    related: ["shorts", "long-videos", "thumbnail-studio", "posting"],
  },
  {
    slug: "thumbnail-studio",
    name: "Thumbnail Studio",
    dept: "review",
    title: "The thumbnail that gets the click",
    line: "Your thumbnail ideas where viewers meet them: home, search, a phone and a TV.",
    lead: "Thumbnail Studio puts your thumbnail ideas where viewers will meet them, YouTube’s home page, search, a phone and a TV, between other channels’ videos, so the team can pick the one that stands out.",
    visual: "studio",
    who: ["Packagers", "Masters", "Editors"],
    where: "The Package step of every long video",
    sections: [
      {
        title: "Seen the way viewers see it",
        text: "Each version sits in a real-looking feed with your channel’s name and picture. Step through them with the arrows, on the preview itself.",
      },
      {
        title: "Pick the winner, or a test",
        text: "Star the one to use, or two or three for a test on YouTube: they’re labelled A, B and C everywhere after that.",
      },
    ],
    details: [
      ["As many versions as you like", "Each checked against YouTube’s size and weight limits."],
      ["Titles on each", "Try your titles on every version."],
      ["Home, search, phone, TV", "Four places a viewer meets your video."],
      ["A mockup library", "Keep the frames and pictures you reuse."],
    ],
    related: ["long-videos", "review", "posting"],
  },

  // Posting -------------------------------------------------------------------------------------------------------------
  {
    slug: "posting",
    name: "Posting",
    dept: "post",
    title: "Out everywhere, on time",
    line: "Schedule each approved short for YouTube, TikTok, Instagram and Facebook, or post it now.",
    lead: "Schedule each approved short for YouTube, TikTok, Instagram and Facebook from your team’s own accounts, or post it everywhere right now. You see every step, and anything that goes wrong is explained, with Try again.",
    visual: "post",
    who: ["Schedulers", "Masters"],
    where: "Posting, in the menu, and on every short",
    sections: [
      {
        title: "Each platform’s own choices",
        text: "A caption for each, visibility on YouTube, privacy, comments, duet and stitch on TikTok, and the time for each platform, or Post now for all of them at once.",
      },
      {
        title: "A dashboard for what goes out",
        text: "Overview, Upcoming, Posted, Needs attention and Health: the next post, what’s scheduled, what went out this week, and a card for each platform with its account and latest posts.",
      },
      {
        title: "Nothing goes out on its own",
        text: "Only shorts your team approved, only when someone scheduled them or pressed Post now, only to the accounts your team connected.",
      },
    ],
    details: [
      ["Four platforms", "YouTube Shorts, TikTok, Instagram Reels and Facebook Reels on your Page."],
      ["Scheduled or now", "A time for each platform, or everywhere at once."],
      ["Every step shown", "Uploading, processing, live: and if it isn’t, why."],
      ["Try again", "A failed post explains what happened and goes again in one click."],
      ["Connections checked", "You’re told before a platform’s sign-in runs out."],
      ["Posted, wherever it was posted", "Everything on your connected accounts, whoever posted it, with its numbers."],
    ],
    related: ["shorts", "analytics", "review"],
  },

  // Insights ------------------------------------------------------------------------------------------------------------
  {
    slug: "analytics",
    name: "Analytics",
    dept: "measure",
    title: "Every platform’s numbers, side by side",
    line: "Views, watch time, followers and revenue from all four platforms, every video counted.",
    lead: "Views, watch time, followers and revenue from YouTube, TikTok, Instagram and Facebook, one total or each on its own, next to what your team made. Every video counts, and the newest are read every few minutes.",
    visual: "measure",
    who: ["Masters", "Everyone they let see it"],
    where: "Analytics, in the menu",
    sections: [
      {
        title: "Every video, not only the newest",
        text: "All your YouTube uploads, every TikTok, every Instagram post and every Facebook Reel. Click a day on Views per day to see every video that got views that day, on every platform.",
      },
      {
        title: "Deeper when you want it",
        text: "Advanced shows everything each platform shares: retention, where views come from, the search terms, ages, countries and devices, and every video with every number, sortable.",
      },
      {
        title: "Money for the right people",
        text: "Revenue by stream (ads, Premium, memberships, Supers and Shopping), Facebook earnings, and the income YouTube doesn’t know about, like sponsorships. Only Masters and the people they choose see it.",
      },
    ],
    details: [
      ["Realtime", "The last 48 hours, hour by hour, and the videos getting views right now."],
      ["Impressions and CTR", "How often each thumbnail was shown on YouTube, and how many became views."],
      ["Audience", "Where your viewers are, by country, and the channels they also watch."],
      ["What works", "Your best videos, and what they have in common."],
      ["Each video’s page", "Its own numbers, day by day."],
      ["Download for Claude", "Your numbers in a PDF to ask an AI assistant about."],
      ["CSV", "The tables export to a spreadsheet."],
    ],
    related: ["objectives", "projections", "media-kit", "outliers"],
  },
  {
    slug: "objectives",
    name: "Objectives",
    dept: "measure",
    title: "The team’s goals, filling up live",
    line: "Shorts a week, views a month, posts on each platform: goals that count themselves.",
    lead: "Set goals for the team, shorts a week, long videos a month, views, followers or watch hours, and they fill up as videos go out. When one is reached, everyone on the team sees it at once.",
    visual: "objectives",
    who: ["Masters set them", "Everyone sees them"],
    where: "Objectives, in the menu",
    sections: [
      {
        title: "Goals that count themselves",
        text: "Posts on each platform, new ideas, edits, approvals, filming, and the platforms’ own numbers. Narrow any goal to some platforms, types of video or one person’s work.",
      },
      {
        title: "Where each one stands",
        text: "Rings for the goals, the pace each needs, a forecast, its history with streaks and the best so far, and who helped.",
      },
      {
        title: "Reached together",
        text: "Confetti and Clip on every open screen, a fanfare with sounds on, and a notification on everyone’s phone. Missed it? It shows the next time you open the dashboard.",
      },
    ],
    details: [
      ["By the day, week, month, quarter or year", "Each goal has its own period."],
      ["A different target ahead", "Change one week or month without changing the usual target."],
      ["Live preview", "See how a goal would have gone before you save it."],
      ["Win streak", "How many periods in a row the team hit it."],
      ["Every count opened", "Open a goal to see everything it counted."],
    ],
    related: ["projections", "analytics", "dashboard"],
  },
  {
    slug: "projections",
    name: "Projections",
    dept: "measure",
    title: "Where you’ll be by the date you named",
    line: "Long-term targets with a date, checked every morning against the pace you’re going.",
    lead: "Set a target with a date, like a subscriber count by December, and check back: its value is kept every morning, with how far it’s come, the pace now, the pace it needs and where it lands if nothing changes.",
    visual: "projection",
    who: ["Masters", "Everyone they let see it"],
    where: "Objectives → Projections",
    sections: [
      {
        title: "Over 40 things to measure",
        text: "Followers on each platform, views, engaged view rate, watch hours, average view duration, likes, comments, shares, saves, rates per 1,000 views, and per video: average and median views and the best one.",
      },
      {
        title: "What moved",
        text: "Every projection keeps the channel’s key numbers from the day it was set, next to the same numbers now, platform by platform.",
      },
    ],
    details: [
      ["Kept every morning", "A line you can point at, day by day."],
      ["The pace it needs", "And the pace you’re going, side by side."],
      ["Where it lands", "At this pace, by the date you named."],
      ["Then and now", "The channel’s key numbers when you set it, and today."],
    ],
    related: ["objectives", "analytics"],
  },
  {
    slug: "media-kit",
    name: "Media kit",
    dept: "measure",
    title: "The deck sponsors ask for, made from your numbers",
    line: "A PDF of your reach, audience, best videos, brands and rates, built from your own data.",
    lead: "Media kit makes the PDF brands ask for: your reach, your audience, your best videos, the brands you’ve worked with, your rates and how to reach you. Every page shows as you set it up, exactly as the PDF will be.",
    visual: "mediakit",
    who: ["Masters", "The people they let make it"],
    where: "Analytics → Media kit",
    sections: [
      {
        title: "Your numbers, for the period you pick",
        text: "One kit for every channel or one per platform, over 28, 90 or 365 days or your own dates. Swap in a number of your own when you have a better one.",
      },
      {
        title: "The pages",
        text: "A cover, About us, At a glance, a page per platform, Audience (ages, genders and countries), your best videos, brands and kind words, rates and contact. Each page can have a title of your own.",
      },
      {
        title: "Brands, with their logos",
        text: "One list of brands, each with its logo and what they said. Show them with their quotes, or as a wall of logos only.",
      },
    ],
    details: [
      ["Rates", "A price for each package, or on request, in your currency, with a note."],
      ["Light or dark", "In your team’s colour or any other."],
      ["The cover", "Your best thumbnails, your own photo or one big number, and a title on as many lines as you break it."],
      ["Logos tidied", "PNG, JPG, WebP or SVG; the empty margin around each is cut away."],
      ["Templates", "Start from a ready-made kit and change what you like."],
      ["Built with ClipTroop", "A small line on the last page, which you can turn off."],
    ],
    related: ["analytics", "objectives"],
  },

  // Research ------------------------------------------------------------------------------------------------------------
  {
    slug: "outliers",
    name: "Outliers",
    dept: "research",
    title: "What’s taking off in your niche, before you film",
    line: "Videos doing many times their channel’s usual, ranked, with ideas made from them.",
    lead: "Outliers finds the videos in your niche doing far better than their own channel’s usual, so a small channel’s hit counts as much as a big one’s, and shows what they have in common.",
    visual: "outliers",
    who: ["Researchers", "Scripters", "Masters"],
    where: "Outliers, under Research",
    sections: [
      {
        title: "Your niche, set up in minutes",
        text: "Add a few keywords and the channels you watch. ClipTroop finds the channels making those videos, judged on what they post, and leaves out the ones that don’t fit: other languages, videos for kids, off-topic channels.",
      },
      {
        title: "For you, every day",
        text: "The biggest outliers of the week, month or year, what’s taking off right now, small channels with big hits, and the formats and keywords that win.",
      },
      {
        title: "Ideas from what’s working",
        text: "24 ideas at once, made from the formats and topics that win in your niche, each with titles, a hook, the numbers behind it and the outliers it comes from.",
      },
    ],
    details: [
      ["Times its usual", "Every video measured against its own channel, not against the biggest."],
      ["Search with filters", "Views, when it was posted, channel size, length, views per hour, formats and language."],
      ["Your audience’s channels", "The channels your viewers also watch, from your own YouTube numbers."],
      ["Alerts", "A notification when a channel you follow has a breakout."],
      ["Saved", "Keep the ones worth remembering, in folders."],
      ["Explore", "Two dozen ready-made niches to look around in."],
    ],
    related: ["scripts", "analytics", "thumbnail-studio"],
  },

  // The team ------------------------------------------------------------------------------------------------------------
  {
    slug: "team",
    name: "Team and roles",
    dept: "team",
    title: "Everyone sees what’s theirs",
    line: "Masters run the team; six roles each see their part. Invite people, give them roles.",
    lead: "Masters run the team. Researchers, Scripters, Filmers, Editors, Packagers and Schedulers each see what’s theirs, and a person can hold several roles, on several teams.",
    visual: "team",
    who: ["Masters invite and give roles"],
    where: "Team, in the menu",
    sections: [
      {
        title: "Invite, then give roles",
        text: "Invite people by their email or their ClipTroop name, with the roles they’ll have. They join from the invite, and you change their roles any time.",
      },
      {
        title: "Who may do what",
        text: "The database checks every request against the person’s team and role. The team’s owner decides who else may delete videos, and whether several at once.",
      },
    ],
    details: [
      ["Seven roles", "Master, Researcher, Scripter, Filmer, Editor, Packager and Scheduler."],
      ["Several teams", "One account, many teams, with a role in each. Switch from the menu."],
      ["Your team’s look", "Its name, logo and colours for shorts and long videos."],
      ["Handing over", "The owner can pass the team to someone else on it, who accepts first."],
      ["Connected accounts", "Masters and Schedulers connect the team’s YouTube, TikTok, Instagram and Facebook."],
    ],
    related: ["workflow", "dashboard", "profiles"],
  },
  {
    slug: "dashboard",
    name: "Dashboard",
    dept: "team",
    title: "The page your team opens first",
    line: "Widgets you arrange: today’s tasks, the calendar, your numbers, the next meeting.",
    lead: "A board of widgets you arrange: today’s tasks, the team’s tasks, the calendar, your numbers on every platform, the next meeting, objectives, the weather and the daily word.",
    visual: "dashboard",
    who: ["Everyone, each their own"],
    where: "Dashboard, the first page",
    sections: [
      {
        title: "Arrange it your way",
        text: "Drag and resize widgets on a 12-column board; empty space fills itself. Add widget shows live previews with your real data.",
      },
      {
        title: "The daily word",
        text: "A five-letter word in six tries, the same for everyone each day, with how your teammates did today (tries only, never their letters).",
      },
    ],
    details: [
      ["Today’s tasks", "What’s yours, what’s late, what’s next."],
      ["Your numbers", "Views and followers on each platform, with filters."],
      ["The next meeting", "When, where, who’s coming, and your answer."],
      ["Objectives", "The team’s goals, filling up."],
      ["The weather", "Where you are, for filming days."],
      ["The keyboard works too", "Move and resize widgets without a mouse."],
    ],
    related: ["workflow", "objectives", "meetings", "look"],
  },
  {
    slug: "profiles",
    name: "Profiles and XP",
    dept: "team",
    title: "Your work, on a profile of your own",
    line: "XP for every finished step, levels, achievements and a year of contributions.",
    lead: "Every step you finish on a video earns XP, more for bigger steps and a quarter more when it’s done by its date. XP brings levels, achievements and picture frames, on a profile you arrange.",
    visual: "profile",
    who: ["Everyone"],
    where: "Your name, top of the menu",
    sections: [
      {
        title: "A profile you arrange",
        text: "Showcases you drag and resize like widgets: your numbers, a year of contributions, achievements, your teams and your level. Frames unlock as you level up.",
      },
      {
        title: "Public or private",
        text: "Public to everyone signed in, or private: others see only your name and picture.",
      },
    ],
    details: [
      ["XP", "Bigger steps earn more; on time earns a quarter more."],
      ["Levels", "A new badge colour every ten."],
      ["Achievements", "Twenty-five to reach, each with what it takes."],
      ["Contributions", "A square for every day you worked, a year of them."],
      ["Clip cheers", "Clip shows up with your XP when a step is done."],
    ],
    related: ["workflow", "team", "look"],
  },
  {
    slug: "mobile",
    name: "On your phone",
    dept: "team",
    title: "Your turn comes to you",
    line: "Install it from the browser on iPhone or Android, with notifications. No app store.",
    lead: "Add ClipTroop to your home screen on iPhone or Android straight from the browser: its own icon, full screen, and notifications even when it’s closed.",
    visual: "phone",
    who: ["Everyone"],
    where: "Settings → Notifications & app",
    sections: [
      {
        title: "Notifications that matter",
        text: "A script handed to you, a cut waiting for your review, a short gone live, a goal reached: the same as the bell in the app, on your phone and your computer.",
      },
      {
        title: "Made for small screens",
        text: "A dashboard made for your phone, a tab bar at the bottom, and every page that fits a phone’s width.",
      },
    ],
    details: [
      ["iPhone and iPad", "Share, then Add to Home Screen."],
      ["Android", "Install app, from the browser’s menu."],
      ["Per device", "Turn notifications on per device, send yourself a test, remove old devices."],
      ["Nothing to update", "It’s always the latest version."],
    ],
    related: ["workflow", "dashboard"],
  },
  {
    slug: "search",
    name: "Search",
    dept: "team",
    title: "Find anything with Ctrl K",
    line: "Videos, scripts, meetings, people, settings and pages, and actions right from the box.",
    lead: "The search bar finds everything: videos, scripts and research, meetings and their action items, objectives, people, teams, and every page, tab and setting of the app.",
    visual: "search",
    who: ["Everyone"],
    where: "The top bar, or Ctrl K (⌘ K on a Mac)",
    sections: [
      {
        title: "Inside the words too",
        text: "Search inside scripts: open the result and it scrolls to the words and marks them. Videos are found by their caption, hook, description or notes, not just their title.",
      },
      {
        title: "Do things from it",
        text: "Dark mode, sounds, the tour, sync analytics, add a widget, a new short or long video, plan a meeting, invite people: right from the box, for the people who can.",
      },
    ],
    details: [
      ["Everywhere", "One shortcut on every page."],
      ["Filters", "A row of pills to narrow it down."],
      ["Settings by name", "Type the setting, land on it."],
      ["Your roles", "It offers what you can do."],
    ],
    related: ["scripts", "dashboard"],
  },
  {
    slug: "look",
    name: "Your look",
    dept: "team",
    title: "Make it yours",
    line: "Twenty colour themes in light and dark, glass in three styles, your own wallpapers.",
    lead: "Twenty colour themes in light and dark, a glass look in three styles, wallpapers of your own, and sounds and motion you can turn down or off.",
    visual: "look",
    who: ["Everyone, each their own"],
    where: "Settings → Preferences",
    sections: [
      {
        title: "Colour and glass",
        text: "Pick a theme, then glass if you like it: Simple, Liquid with light that follows the pointer (you can turn that off), or Halo. Choose how clear it is, and the colours behind it.",
      },
      {
        title: "Wallpapers",
        text: "Up to three of your own, on the dashboard or on every page, with the bars made readable over them.",
      },
    ],
    details: [
      ["Twenty themes", "In light and dark, from Ink to Sakura."],
      ["Glass", "Simple, Liquid or Halo, as clear as you like."],
      ["Motion and sound", "Turn animations and the little sounds down or off."],
      ["Saved to your account", "The same look on every device you sign in on."],
    ],
    related: ["dashboard", "profiles"],
  },
];

export const featureBySlug = (slug: string) => FEATURES.find((f) => f.slug === slug) ?? null;
export const featuresIn = (dept: DeptId) => FEATURES.filter((f) => f.dept === dept);
export const deptOf = (id: DeptId) => DEPTS.find((d) => d.id === id)!;

/** The page before and after, in the order a video is made. */
export function neighbours(slug: string): { prev: SiteFeature | null; next: SiteFeature | null } {
  const i = FEATURES.findIndex((f) => f.slug === slug);
  return { prev: i > 0 ? FEATURES[i - 1] : null, next: i >= 0 && i < FEATURES.length - 1 ? FEATURES[i + 1] : null };
}
