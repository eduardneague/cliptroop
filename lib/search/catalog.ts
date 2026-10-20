import { CATALOG as WIDGETS, type WidgetType } from "@/modules/dashboard/layout";
import { PLATFORMS, PLATFORM_META, SHORT_STAGES, type Platform, type ShortStage } from "@/modules/short-videos/lib/constants";
import { STAGE_ORDER } from "@/modules/long-videos/lib/stages";
import type { PipelineStage } from "@/lib/permissions/roles";
import { APP_NAME } from "@/lib/brand";
import { prepare, type Prepared } from "./match";

/**
 * Everything in the app the search bar can take you to or do (1.26.0):
 * pages, tabs, filters, settings and actions, each with where it lives
 * (its trail: "Team › Defaults"), the other words people use for it, and
 * who sees it. Only what you could open yourself is listed.
 */

export type EntryKind = "page" | "tab" | "filter" | "setting" | "action";
/** Things that happen right where you are, instead of opening a page. */
export type RunId = "theme" | "sounds" | "whatsNew" | "tour" | "logout" | "sync" | "copyLink";
export type IconKey =
  | "home" | "shorts" | "video" | "calendar" | "meeting" | "posting" | "analytics" | "target" | "trend"
  | "users" | "settings" | "word" | "user" | "code" | "flag" | "lock" | "document" | "trash" | "plus"
  | "moon" | "sun" | "sound" | "bell" | "star" | "bug" | "lightbulb" | "logout" | "link" | "download"
  | "grid" | "list" | "clock" | "money" | "compass" | "alert" | "check" | "fill" | "retry" | "history"
  | "eye" | "trophy" | "image" | "flame" | "outliers";

export type Entry = {
  id: string;
  kind: EntryKind;
  title: string;
  /** Where it is, outermost first: ["Settings", "Preferences"]. */
  trail: string[];
  /** One short line: what it is or does. */
  hint?: string;
  /** Other words for it (lowercase, spaces between). */
  words?: string;
  icon: IconKey;
  href?: string;
  run?: RunId;
  /** A little extra for the main places, so they win ties. */
  boost?: number;
  /** A platform's colour and logo instead of an icon. */
  platform?: Platform;
};

export type SearchContext = {
  /** Your roles in the team you're in. */
  roles: readonly string[];
  developer: boolean;
  hasTeam: boolean;
  profileHref: string | null;
  dark: boolean;
  sounds: boolean;
  /** The video you're looking at (its page, script, review or studio), for "This video". */
  here?: { kind: "long" | "short"; id: string } | null;
};

const SHORT_STAGE: Record<ShortStage, { title: string; words: string }> = {
  script: { title: "Shorts at Script", words: "scripting writing step stage" },
  editing: { title: "Shorts in Editing", words: "edit edited being editor step stage" },
  review: { title: "Shorts in review", words: "reviewing approve approval waiting step stage" },
  ready: { title: "Shorts ready to post", words: "approved posting queue step stage" },
  posted: { title: "Posted shorts", words: "published done live out step stage" },
};
const LONG_STAGE: Record<PipelineStage, { title: string; words: string }> = {
  ideate: { title: "Long videos at Ideate", words: "idea ideas ideation brainstorm step stage" },
  research: { title: "Long videos at Research", words: "researching step stage" },
  script: { title: "Long videos at Script", words: "scripting writing step stage" },
  film: { title: "Long videos at Film", words: "filming recording shooting shoot record step stage" },
  edit: { title: "Long videos at Edit", words: "editing edited editor step stage" },
  review: { title: "Long videos in Review", words: "reviewing approval approve step stage" },
  package: { title: "Long videos at Package", words: "packaging thumbnail thumbnails titles step stage" },
  publish: { title: "Long videos at Post", words: "posting publish publishing scheduled upload step stage" },
  done: { title: "Posted long videos", words: "posted done published finished live step stage" },
};
const PLATFORM_WORDS: Record<Platform, string> = {
  youtube: "yt you tube",
  instagram: "ig insta reels",
  facebook: "fb meta reels",
  tiktok: "tt tik tok",
};

/** Outliers' tabs (1.27.0): [tab, title, other words, icon]. */
const OUTLIER_TABS: [string, string, string, IconKey][] = [
  ["search", "Search outliers", "find videos filters multiplier views", "outliers"],
  ["ideas", "Video ideas", "ideas generator content topics shuffle what to make next", "lightbulb"],
  ["formats", "Formats that win", "formats templates title shapes video types", "grid"],
  ["keywords", "Outlier keywords", "keywords words phrases topics rising", "trend"],
  ["channels", "Outlier channels", "channels competitors creators track tracked", "users"],
  ["titles", "Title lab", "title score test titles rewrite compare", "document"],
  ["thumbnails", "Outlier thumbnails", "thumbnails thumbnail colours colors preview mockup", "image"],
  ["saved", "Saved outliers", "saved bookmarks folders boards collections", "star"],
];

const ANALYTICS_TABS: [string, string, string][] = [
  ["overview", "Overview", "summary totals chart views"],
  ["content", "Content", "videos every video performance top best worst list"],
  ["audience", "Audience", "followers subscribers countries country demographics growth fans"],
  ["realtime", "Realtime", "live now 48 hours right now last hours"],
  ["revenue", "Revenue", "money earnings income rpm cpm adsense paid dollars"],
  ["insights", "Insights", "tips patterns what works hooks advice"],
  ["advanced", "Advanced", "detailed details metrics retention ctr impressions watch time"],
  ["production", "Production", "output on time late cycle speed how fast"],
];
const RANGES: [string, string, string][] = [
  ["48h", "Last 48 hours", "48h two days 2 days hours"],
  ["7d", "Last 7 days", "7d week weekly past week seven"],
  ["28d", "Last 28 days", "28d month monthly four weeks"],
  ["90d", "Last 90 days", "90d quarter three months 3 months"],
  ["12m", "Last 365 days", "year yearly 12 months twelve months annual"],
  ["lifetime", "Lifetime", "all time ever since the start total forever"],
];

export function buildCatalog(ctx: SearchContext): Entry[] {
  const master = ctx.roles.includes("master");
  const manager = master || ctx.roles.includes("publisher");
  const team = ctx.hasTeam;
  const out: Entry[] = [];
  const add = (e: Entry, show = true) => {
    if (show) out.push(e);
  };

  // ---- The video you're on ------------------------------------------------
  const here = team ? ctx.here : null;
  if (here?.kind === "long") {
    const v = `/videos/${here.id}`;
    add({ id: "here.page", kind: "page", title: "Video page", trail: ["This video"], words: "back steps overview details", icon: "video", href: v, boost: 0.04 });
    add({ id: "here.script", kind: "page", title: "Script", trail: ["This video"], words: "write writing document doc", icon: "document", href: `${v}/script`, boost: 0.04 });
    add({ id: "here.research", kind: "page", title: "Research", trail: ["This video"], words: "notes sources facts", icon: "document", href: `${v}/script?kind=research`, boost: 0.04 });
    add({ id: "here.review", kind: "page", title: "Review", trail: ["This video"], words: "watch versions notes feedback edit upload", icon: "eye", href: `${v}/review`, boost: 0.04 });
    add({ id: "here.studio", kind: "page", title: "Thumbnail Studio", trail: ["This video"], words: "thumbnail thumbnails titles package compare winner", icon: "image", href: `${v}/studio`, boost: 0.04 });
  } else if (here?.kind === "short") {
    const v = `/shorts/${here.id}`;
    add({ id: "here.page", kind: "page", title: "Short page", trail: ["This short"], words: "back steps overview details caption", icon: "shorts", href: v, boost: 0.04 });
    add({ id: "here.script", kind: "page", title: "Script", trail: ["This short"], words: "write writing document doc", icon: "document", href: `${v}/script`, boost: 0.04 });
    add({ id: "here.review", kind: "page", title: "Review", trail: ["This short"], words: "watch versions notes feedback edit upload", icon: "eye", href: `${v}/review`, boost: 0.04 });
  }

  // ---- Pages -------------------------------------------------------------
  add({ id: "dashboard", kind: "page", title: "Dashboard", trail: [], hint: "Your widgets: tasks, today's posts, numbers", words: "home start main widgets", icon: "home", href: "/dashboard", boost: 0.06 });
  add({ id: "shorts", kind: "page", title: "Short videos", trail: [], words: "shorts reels tiktoks list schedule queue table", icon: "shorts", href: "/shorts", boost: 0.06 }, team);
  add({ id: "videos", kind: "page", title: "Long videos", trail: [], words: "longform projects pipeline list youtube", icon: "video", href: "/videos", boost: 0.06 }, team);
  add({ id: "calendar", kind: "page", title: "Calendar", trail: [], words: "schedule month week agenda dates planned when", icon: "calendar", href: "/calendar", boost: 0.05 }, team);
  add({ id: "meetings", kind: "page", title: "Meetings", trail: [], words: "calls call discord zoom agenda notes", icon: "meeting", href: "/meetings", boost: 0.05 }, team);
  add({ id: "posting", kind: "page", title: "Posting", trail: [], words: "posts post scheduled uploads published auto queue", icon: "posting", href: "/posting", boost: 0.05 }, team);
  add({ id: "outliers", kind: "page", title: "Outliers", trail: [], hint: "Videos beating their channel's usual, and ideas from them", words: "outlier viral trending research competitors competition ideas niche 1of10 viewstats what works spy", icon: "outliers", href: "/outliers", boost: 0.05 }, team);
  add({ id: "analytics", kind: "page", title: "Analytics", trail: [], words: "stats statistics numbers views growth metrics performance", icon: "analytics", href: "/analytics", boost: 0.05 }, team);
  add({ id: "objectives", kind: "page", title: "Objectives", trail: [], words: "goals goal targets rings okr okrs", icon: "target", href: "/objectives", boost: 0.05 }, team);
  add({ id: "projections", kind: "page", title: "Projections", trail: ["Objectives"], words: "forecast forecasts targets deadline future milestone", icon: "trend", href: "/objectives?view=projections", boost: 0.03 }, team);
  add({ id: "team", kind: "page", title: "Team", trail: [], words: "members people roles workspace crew", icon: "users", href: "/team", boost: 0.05 }, team);
  add({ id: "settings", kind: "page", title: "Settings", trail: [], words: "account preferences options config configuration", icon: "settings", href: "/settings", boost: 0.05 });
  add({ id: "word", kind: "page", title: "Daily word", trail: [], hint: "A five-letter word a day", words: "wordle game puzzle guess letters", icon: "word", href: "/word", boost: 0.02 });
  add({ id: "profile", kind: "page", title: "My profile", trail: [], hint: "Your public page", words: "me public page bio about", icon: "user", href: ctx.profileHref ?? undefined }, !!ctx.profileHref);
  add({ id: "developer", kind: "page", title: "Developer", trail: [], hint: "Status, problems and usage of the whole app", words: "admin errors problems usage logs", icon: "code", href: "/developer" }, ctx.developer);
  add({ id: "setup", kind: "page", title: "App setup", trail: [], hint: "What to paste in Supabase, Google, Meta, TikTok and Vercel", words: "env environment keys secrets install", icon: "code", href: "/setup" }, ctx.developer);
  for (const [id, label] of [["overview", "Overview"], ["usage", "Usage"], ["problems", "Problems"], ["status", "Status"]] as const) {
    add({ id: `developer.${id}`, kind: "tab", title: label, trail: ["Developer"], words: id === "problems" ? "errors reports bugs" : id === "usage" ? "database storage space teams people" : "", icon: "code", href: `/developer${id === "overview" ? "" : `?tab=${id}`}` }, ctx.developer);
  }
  add({ id: "status", kind: "page", title: "Status", trail: [], hint: "Is everything working right now", words: "down outage working uptime incidents health", icon: "flag", href: "/status" });
  add({ id: "privacy", kind: "page", title: "Privacy policy", trail: [], words: "privacy data gdpr personal information", icon: "lock", href: "/privacy" });
  add({ id: "terms", kind: "page", title: "Terms of service", trail: [], words: "terms tos legal rules", icon: "document", href: "/terms" });
  add({ id: "data-deletion", kind: "page", title: "Delete my data", trail: [], words: "data deletion remove erase account gdpr", icon: "trash", href: "/data-deletion" });

  // ---- Do something ------------------------------------------------------
  add({ id: "new-short", kind: "action", title: "New short", trail: ["Short videos"], words: "create add make short reel", icon: "plus", href: "/shorts/new", boost: 0.04 }, team && manager);
  add({ id: "new-long", kind: "action", title: "New long video", trail: ["Long videos"], words: "create add make project idea longform", icon: "plus", href: "/videos/new", boost: 0.04 }, team && manager);
  add({ id: "new-meeting", kind: "action", title: "Plan a meeting", trail: ["Meetings"], words: "new meeting schedule call create book", icon: "plus", href: "/meetings?new=1", boost: 0.03 }, team && manager);
  add({ id: "new-objective", kind: "action", title: "New objective", trail: ["Objectives"], words: "create add goal target", icon: "plus", href: "/objectives?new=1", boost: 0.02 }, team && master);
  add({ id: "new-projection", kind: "action", title: "New projection", trail: ["Objectives", "Projections"], words: "create add forecast milestone target", icon: "plus", href: "/objectives?view=projections&new=1", boost: 0.02 }, team && master);
  add({ id: "invite", kind: "action", title: "Invite people", trail: ["Team", "Members"], words: "invite add member join new person people", icon: "plus", href: "/team?invite=1", boost: 0.03 }, team && master);
  add({ id: "new-team", kind: "action", title: "Create a team", trail: [], words: "new team workspace channel start", icon: "plus", href: "/teams/new" });
  add({ id: "theme", kind: "action", title: ctx.dark ? "Turn off dark mode" : "Turn on dark mode", trail: [], hint: ctx.dark ? "Back to light" : "Easier on the eyes at night", words: "dark mode light mode night theme black white", icon: ctx.dark ? "sun" : "moon", run: "theme", boost: 0.03 });
  add({ id: "sounds-toggle", kind: "action", title: ctx.sounds ? "Turn sounds off" : "Turn sounds on", trail: [], hint: "The little sounds when you check things off", words: "sounds sound mute unmute quiet audio noise", icon: "sound", run: "sounds" });
  add({ id: "whats-new", kind: "action", title: "What's new", trail: [], hint: "What changed in the latest versions", words: "changelog updates update release notes version changes new features", icon: "star", run: "whatsNew" });
  add({ id: "tour", kind: "action", title: "Show me around", trail: [], hint: "Clip's one-minute tour", words: "tour tutorial help guide onboarding clip walkthrough", icon: "compass", run: "tour" });
  add({ id: "copy-link", kind: "action", title: "Copy link to this page", trail: [], words: "copy link url share address", icon: "link", run: "copyLink" });
  add({ id: "sync", kind: "action", title: "Sync analytics now", trail: ["Analytics"], hint: "Get the latest numbers from every platform", words: "refresh update latest numbers reload fetch", icon: "retry", run: "sync" }, team && manager);
  add({ id: "claude", kind: "action", title: "Download for Claude", trail: ["Analytics"], hint: "Your numbers in one file to ask Claude about", words: "export ai claude chatgpt download data report csv", icon: "download", href: "/analytics?claude=1" }, team);
  add({ id: "logout", kind: "action", title: "Log out", trail: [], words: "logout sign out signout exit", icon: "logout", run: "logout" });
  add({ id: "report", kind: "action", title: "Report a bug", trail: ["Settings", "Account"], hint: "Only the developer sees it", words: "bug report feedback problem broken issue support contact", icon: "bug", href: "/settings?tab=account#report" });
  add({ id: "suggest", kind: "action", title: "Suggest an idea", trail: ["Settings", "Account"], hint: `Something that would make ${APP_NAME} better`, words: "suggest suggestion idea feature request feedback wish", icon: "lightbulb", href: "/settings?tab=account#report" });

  // ---- Short videos ------------------------------------------------------
  if (team) {
    for (const s of SHORT_STAGES) add({ id: `shorts.stage.${s}`, kind: "filter", title: SHORT_STAGE[s].title, trail: ["Short videos"], words: SHORT_STAGE[s].words, icon: "shorts", href: `/shorts?stage=${s}` });
    add({ id: "shorts.late", kind: "filter", title: "Late shorts", trail: ["Short videos"], words: "late overdue behind missed", icon: "alert", href: "/shorts?late=1" });
    add({ id: "shorts.mine", kind: "filter", title: "Shorts you edit", trail: ["Short videos"], words: "my mine assigned editor me", icon: "user", href: "/shorts?mine=1" });
    add({ id: "shorts.type.sponsorship", kind: "filter", title: "Sponsorship shorts", trail: ["Short videos"], words: "sponsor sponsored paid ad ads brand deal", icon: "money", href: "/shorts?type=sponsorship" });
    add({ id: "shorts.type.big", kind: "filter", title: "Big shorts", trail: ["Short videos"], words: "big important major", icon: "star", href: "/shorts?type=big" });
    add({ id: "shorts.type.filler", kind: "filter", title: "Filler shorts", trail: ["Short videos"], words: "filler everyday regular", icon: "shorts", href: "/shorts?type=filler" });
    add({ id: "shorts.newest", kind: "filter", title: "Newest shorts first", trail: ["Short videos"], words: "latest newest recent sort order", icon: "list", href: "/shorts?sort=newest" });
    add({ id: "shorts.grid", kind: "filter", title: "Shorts as cards", trail: ["Short videos"], words: "grid cards view", icon: "grid", href: "/shorts?view=grid" });
    add({ id: "shorts.table", kind: "filter", title: "Shorts as a table", trail: ["Short videos"], words: "table list rows view", icon: "list", href: "/shorts?view=table" });
    for (const s of STAGE_ORDER) add({ id: `videos.stage.${s}`, kind: "filter", title: LONG_STAGE[s].title, trail: ["Long videos"], words: LONG_STAGE[s].words, icon: "video", href: `/videos?stage=${s}` });
    add({ id: "videos.grid", kind: "filter", title: "Long videos as cards", trail: ["Long videos"], words: "grid cards view", icon: "grid", href: "/videos?view=grid" });
    add({ id: "videos.table", kind: "filter", title: "Long videos as a table", trail: ["Long videos"], words: "table list rows view", icon: "list", href: "/videos?view=table" });
  }

  // ---- Outliers --------------------------------------------------------------
  if (team) {
    const researcher = master || ctx.roles.includes("researcher");
    for (const [id, title, words, icon] of OUTLIER_TABS) add({ id: `outliers.${id}`, kind: "tab", title, trail: ["Outliers"], words, icon, href: `/outliers?tab=${id}` });
    add({ id: "outliers.shorts", kind: "filter", title: "Shorts outliers", trail: ["Outliers"], words: "shorts short reels vertical viral", icon: "shorts", href: "/outliers?kind=short" });
    add({ id: "outliers.add-niche", kind: "action", title: "Add a niche", trail: ["Outliers"], hint: "Keywords for a kind of video to follow", words: "new niche keywords topic follow research competitors", icon: "plus", href: "/outliers?open=niche" }, researcher);
    add({ id: "outliers.alerts", kind: "setting", title: "Outlier alerts", trail: ["Outliers"], hint: "When a tracked channel's video takes off", words: "alerts notify notifications tracked channel takes off digest watch words weekly", icon: "bell", href: "/outliers?open=alerts" });
  }

  // ---- Calendar, meetings, posting ---------------------------------------
  if (team) {
    add({ id: "calendar.month", kind: "tab", title: "Month view", trail: ["Calendar"], words: "month calendar", icon: "calendar", href: "/calendar?view=month" });
    add({ id: "calendar.week", kind: "tab", title: "Week view", trail: ["Calendar"], words: "week calendar seven days", icon: "calendar", href: "/calendar?view=week" });
    add({ id: "calendar.agenda", kind: "tab", title: "Agenda", trail: ["Calendar"], words: "list upcoming agenda calendar", icon: "list", href: "/calendar?view=agenda" });
    add({ id: "meetings.actions", kind: "tab", title: "Your action items", trail: ["Meetings"], words: "action items todo tasks follow up assigned", icon: "check", href: "/meetings#my-actions" });
    add({ id: "meetings.earlier", kind: "tab", title: "Past meetings", trail: ["Meetings"], words: "earlier previous old notes history", icon: "history", href: "/meetings#earlier" });
    add({ id: "posting.overview", kind: "tab", title: "Posting overview", trail: ["Posting"], words: "overview summary today", icon: "posting", href: "/posting" });
    add({ id: "posting.upcoming", kind: "tab", title: "Upcoming posts", trail: ["Posting"], words: "upcoming scheduled queue next later planned", icon: "clock", href: "/posting?tab=upcoming" });
    add({ id: "posting.posted", kind: "tab", title: "Posted", trail: ["Posting"], words: "published history done went out", icon: "check", href: "/posting?tab=posted" });
    add({ id: "posting.attention", kind: "tab", title: "Needs attention", trail: ["Posting"], words: "failed failures errors error problems retry stuck broken", icon: "alert", href: "/posting?tab=attention" });
    add({ id: "posting.health", kind: "tab", title: "Posting health", trail: ["Posting"], words: "timer cron runs jobs stuck health check", icon: "flag", href: "/posting?tab=health" }, manager);
  }

  // ---- Platforms -----------------------------------------------------------
  if (team) {
    for (const p of PLATFORMS) {
      const name = PLATFORM_META[p].name;
      const w = PLATFORM_WORDS[p];
      add({ id: `platform.${p}.shorts`, kind: "filter", title: `${name} shorts`, trail: ["Short videos"], words: `${w} on for`, icon: "shorts", href: `/shorts?platform=${p}`, platform: p });
      add({ id: `platform.${p}.analytics`, kind: "tab", title: `${name} analytics`, trail: ["Analytics", "Advanced"], words: `${w} numbers stats views`, icon: "analytics", href: `/analytics?tab=advanced&platform=${p}`, platform: p });
      add({ id: `platform.${p}.posted`, kind: "tab", title: `${name} posts`, trail: ["Posting", "Posted"], words: `${w} posted published`, icon: "posting", href: `/posting?tab=posted&platform=${p}`, platform: p });
      add({ id: `platform.${p}.account`, kind: "setting", title: `${name} account`, trail: ["Team", "Connected accounts"], words: `${w} connect reconnect disconnect sign in link channel page`, icon: "link", href: `/team?tab=accounts#account-${p}`, platform: p });
    }
  }

  // ---- Analytics -----------------------------------------------------------
  if (team) {
    for (const [id, title, words] of ANALYTICS_TABS) add({ id: `analytics.${id}`, kind: "tab", title, trail: ["Analytics"], words, icon: id === "revenue" ? "money" : "analytics", href: id === "overview" ? "/analytics" : `/analytics?tab=${id}` });
    add({ id: "analytics.best-time", kind: "tab", title: "Best time to post", trail: ["Analytics", "Insights"], words: "when to post schedule time day hour posting times", icon: "clock", href: "/analytics?tab=insights#best-time" });
    add({ id: "analytics.what-works", kind: "tab", title: "What works", trail: ["Analytics", "Insights"], words: "patterns length titles hooks", icon: "lightbulb", href: "/analytics?tab=insights#what-works" });
    add({ id: "analytics.what-changed", kind: "tab", title: "What changed", trail: ["Analytics", "Insights"], words: "changes trend rhythm before after", icon: "trend", href: "/analytics?tab=insights#what-changed" });
    for (const [id, title, words] of RANGES) add({ id: `analytics.range.${id}`, kind: "filter", title, trail: ["Analytics"], words, icon: "clock", href: `/analytics?range=${id}` });
  }

  // ---- Objectives ----------------------------------------------------------
  if (team) {
    add({ id: "objectives.streak", kind: "tab", title: "Win streak", trail: ["Objectives"], words: "streak wins in a row days weeks", icon: "flame", href: "/objectives#streak" });
    add({ id: "team.objectives", kind: "setting", title: "Manage objectives", trail: ["Team", "Objectives"], words: "reorder pause copy delete edit goals", icon: "target", href: "/team?tab=objectives" }, master);
    add({ id: "team.projections", kind: "setting", title: "Manage projections", trail: ["Team", "Projections"], words: "reorder archive delete edit forecast", icon: "trend", href: "/team?tab=projections" }, master);
  }

  // ---- Dashboard -----------------------------------------------------------
  add({ id: "dashboard.customize", kind: "action", title: "Customize dashboard", trail: ["Dashboard"], words: "customize edit layout move widgets rearrange resize arrange", icon: "settings", href: "/dashboard?customize=1" });
  add({ id: "dashboard.add", kind: "action", title: "Add a widget", trail: ["Dashboard"], words: "widget widgets add new", icon: "plus", href: "/dashboard?customize=1&add=1" });
  for (const type of Object.keys(WIDGETS) as WidgetType[]) {
    add({ id: `widget.${type}`, kind: "action", title: `${WIDGETS[type].name} widget`, trail: ["Dashboard"], hint: "Put it on your dashboard", words: "widget add", icon: "grid", href: `/dashboard?customize=1&add=${type}` });
  }

  // ---- Team ------------------------------------------------------------------
  if (team) {
    add({ id: "team.members", kind: "tab", title: "Members", trail: ["Team"], words: "people roles remove permissions who", icon: "users", href: "/team" });
    add({ id: "team.defaults", kind: "tab", title: "Defaults", trail: ["Team"], words: "default settings rhythm", icon: "settings", href: "/team?tab=defaults" }, master);
    add({ id: "team.short-defaults", kind: "setting", title: "Short video defaults", trail: ["Team", "Defaults"], hint: "Per day, weekends and who works on new shorts", words: "per day weekends daily rhythm editor reviewer scheduler shorts", icon: "shorts", href: "/team?tab=defaults#short-defaults" }, master);
    add({ id: "team.long-defaults", kind: "setting", title: "Long video defaults", trail: ["Team", "Defaults"], hint: "What every new long video starts with", words: "description scripter researcher filmer editor packager scheduler", icon: "video", href: "/team?tab=defaults#long-defaults" }, master);
    add({ id: "team.long-review", kind: "setting", title: "Long video review", trail: ["Team", "Defaults"], hint: `Review long videos in ${APP_NAME}`, words: "review upload in app approve versions", icon: "eye", href: "/team?tab=defaults#long-review" }, master);
    add({ id: "team.tasks", kind: "setting", title: "Who sees everyone's tasks", trail: ["Team", "Defaults"], words: "tasks visibility late my tasks", icon: "check", href: "/team?tab=defaults#tasks" }, master);
    add({ id: "team.video-files", kind: "setting", title: "Video files", trail: ["Team", "Defaults"], hint: "How long files stay after posting", words: "keep delete storage space cleanup clean up auto deletion automatic files days weeks months year never thumbnails studio", icon: "trash", href: "/team?tab=defaults#video-files" }, master);
    add({ id: "team.script-defaults", kind: "setting", title: "Script handoffs", trail: ["Team", "Defaults"], hint: "Who's next when a script is handed on", words: "scripts review staging next default handoff", icon: "document", href: "/team?tab=defaults#script-defaults" }, master);
    add({ id: "team.accounts", kind: "tab", title: "Connected accounts", trail: ["Team"], words: "connect accounts social youtube instagram tiktok facebook sign in link channels", icon: "link", href: "/team?tab=accounts" });
    add({ id: "team.appearance", kind: "tab", title: "Team colours", trail: ["Team", "Appearance"], words: "appearance color look shorts long videos roles", icon: "fill", href: "/team?tab=appearance" });
    add({ id: "team.role-colors", kind: "setting", title: "Role colours", trail: ["Team", "Appearance"], words: "role color badge mentions", icon: "fill", href: "/team?tab=appearance#role-colors" });
    add({ id: "team.workspace", kind: "setting", title: "Team name and logo", trail: ["Team"], words: "rename name logo picture branding workspace image", icon: "image", href: "/team?tab=team#workspace" });
  }

  // ---- Settings --------------------------------------------------------------
  add({ id: "settings.profile", kind: "tab", title: "Profile", trail: ["Settings"], words: "name username bio about", icon: "user", href: "/settings" });
  add({ id: "settings.avatar", kind: "setting", title: "Profile picture", trail: ["Settings", "Profile"], words: "avatar photo picture image pfp", icon: "user", href: "/settings#profile-picture" });
  add({ id: "settings.name", kind: "setting", title: "Name and username", trail: ["Settings", "Profile"], words: "username handle rename bio display name change", icon: "user", href: "/settings#profile" });
  add({ id: "settings.teams", kind: "tab", title: "Your teams", trail: ["Settings"], words: "teams memberships roles", icon: "users", href: "/settings?tab=teams" });
  add({ id: "settings.teams-public", kind: "setting", title: "Show my teams publicly", trail: ["Settings", "Teams"], words: "public private privacy visible hide teams profile", icon: "eye", href: "/settings?tab=teams#teams-public" });
  add({ id: "settings.install", kind: "setting", title: "Install the app", trail: ["Settings", "Notifications & app"], words: "install app phone pwa home screen iphone android download mobile", icon: "download", href: "/settings?tab=notifications#install" });
  add({ id: "settings.push", kind: "setting", title: "Notifications", trail: ["Settings", "Notifications & app"], words: "notifications push alerts this device turn on off", icon: "bell", href: "/settings?tab=notifications#push" });
  add({ id: "settings.devices", kind: "setting", title: "Your devices", trail: ["Settings", "Notifications & app"], words: "devices phones computers", icon: "bell", href: "/settings?tab=notifications#devices" });
  add({ id: "settings.preferences", kind: "tab", title: "Preferences", trail: ["Settings"], words: "preferences options", icon: "settings", href: "/settings?tab=preferences" });
  add({ id: "settings.appearance", kind: "setting", title: "Appearance", trail: ["Settings", "Preferences"], words: "dark light mode theme", icon: "moon", href: "/settings?tab=preferences#appearance" });
  add({ id: "settings.animations", kind: "setting", title: "Animations", trail: ["Settings", "Preferences"], words: "motion animation reduce reduced movement", icon: "star", href: "/settings?tab=preferences#animations" });
  add({ id: "settings.sounds", kind: "setting", title: "Sounds", trail: ["Settings", "Preferences"], words: "sound audio noise mute quiet", icon: "sound", href: "/settings?tab=preferences#sounds" });
  add({ id: "settings.colors", kind: "setting", title: "Colours", trail: ["Settings", "Preferences"], words: "palette theme accent paper color look", icon: "fill", href: "/settings?tab=preferences#colours" });
  add({ id: "settings.glass", kind: "setting", title: "Glass", trail: ["Settings", "Preferences"], hint: "Frosted, see-through cards", words: "glass glassmorphism frosted blur transparent see through translucent look theme", icon: "fill", href: "/settings?tab=preferences#glass" });
  add({ id: "settings.background", kind: "setting", title: "Dashboard background", trail: ["Settings", "Preferences"], hint: "A picture, GIF or video behind your dashboard", words: "background wallpaper picture image gif video animated steam profile dashboard custom", icon: "image", href: "/settings?tab=preferences#background" });
  add({ id: "settings.account", kind: "tab", title: "Account", trail: ["Settings"], words: "account email sign in", icon: "settings", href: "/settings?tab=account" });

  return out;
}

const PREPARED = new WeakMap<Entry, Prepared>();
/** The entry's words, worked out once. */
export function prepared(e: Entry): Prepared {
  let p = PREPARED.get(e);
  if (!p) {
    p = prepare(e);
    PREPARED.set(e, p);
  }
  return p;
}

/** Shown when the search is empty: the few things people do most. */
export const SUGGESTED = ["new-short", "new-long", "new-meeting", "invite", "theme", "whats-new"];
