import { HomeIcon, VideoIcon, ShortsIcon, CalendarIcon, UsersIcon, PostingIcon, MeetingIcon, AnalyticsIcon, CodeIcon, TargetIcon, OutliersIcon, BusinessIcon, TodoIcon, FrameIcon, TagIcon } from "@/components/ui/icons";

/**
 * Sidebar + phone bar destinations, in groups. Icons are SVG components,
 * never Unicode symbols (iOS turns those into emoji).
 */
const DASHBOARD = { href: "/dashboard", label: "Dashboard", shortLabel: "Home", Icon: HomeIcon, available: true } as const;
/** To Do (1.53.0): your own lists. Under Schedule (1.53.3). */
const TODO = { href: "/todo", label: "To Do", shortLabel: "To Do", Icon: TodoIcon, available: true } as const;
const OUTLIERS = { href: "/outliers", label: "Outliers", shortLabel: "Outliers", Icon: OutliersIcon, available: true } as const;
/** Frame Guides (1.54.0): the team's reference frames, for scripts. Under Research, after Outliers. */
const FRAME_GUIDES = { href: "/frame-guides", label: "Frame Guides", shortLabel: "Frames", Icon: FrameIcon, available: true } as const;
const SHORTS = { href: "/shorts", label: "Short videos", shortLabel: "Shorts", Icon: ShortsIcon, available: true } as const;
const VIDEOS = { href: "/videos", label: "Long videos", shortLabel: "Long", Icon: VideoIcon, available: true } as const;
/** Affiliates (1.56.0): the team's affiliate deals (links, codes, the videos about them, logins). Under Content. */
// 1.57.0: Sponsorships (Affiliates in 1.56.0): affiliates, reviews and paid deals in one list.
const SPONSORSHIPS = { href: "/sponsorships", label: "Sponsorships", shortLabel: "Sponsors", Icon: TagIcon, available: true } as const;
const CALENDAR = { href: "/calendar", label: "Calendar", shortLabel: "Calendar", Icon: CalendarIcon, available: true } as const;
const MEETINGS = { href: "/meetings", label: "Meetings", shortLabel: "Meetings", Icon: MeetingIcon, available: true } as const;
const POSTING = { href: "/posting", label: "Posting", shortLabel: "Posting", Icon: PostingIcon, available: true } as const;
const ANALYTICS = { href: "/analytics", label: "Analytics", shortLabel: "Analytics", Icon: AnalyticsIcon, available: true } as const;
const OBJECTIVES = { href: "/objectives", label: "Objectives", shortLabel: "Objectives", Icon: TargetIcon, available: true } as const;
const TEAM = { href: "/team", label: "Team", shortLabel: "Team", Icon: UsersIcon, available: true } as const;
/**
 * Business (1.42.0): only in teams a developer turned it on for, and only for the owner and the people they chose (the
 * layout asks my_business_access).
 */
export const BUSINESS = { href: "/business", label: "Business", shortLabel: "Business", Icon: BusinessIcon, available: true } as const;
/** Developer accounts only (the layout decides; see isDeveloper in lib/errors.ts). */
export const DEVELOPER = { href: "/developer", label: "Developer", shortLabel: "Developer", Icon: CodeIcon, available: true } as const;

export type NavItem = typeof DASHBOARD | typeof TODO | typeof OUTLIERS | typeof FRAME_GUIDES | typeof SHORTS | typeof VIDEOS | typeof SPONSORSHIPS | typeof CALENDAR | typeof MEETINGS | typeof POSTING | typeof ANALYTICS | typeof OBJECTIVES | typeof TEAM | typeof BUSINESS | typeof DEVELOPER;

export const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [DASHBOARD] },
  { label: "Research", items: [OUTLIERS, FRAME_GUIDES] },
  { label: "Content", items: [SHORTS, VIDEOS, SPONSORSHIPS] },
  { label: "Schedule", items: [CALENDAR, MEETINGS, POSTING, TODO] },
  { label: "Insights", items: [ANALYTICS, OBJECTIVES] },
  { label: "Team", items: [TEAM] },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The phone bar: the four you use most; the rest live under More. */
export const BOTTOM_ITEMS: NavItem[] = [DASHBOARD, SHORTS, VIDEOS, CALENDAR];
export const MORE_ITEMS: NavItem[] = [OUTLIERS, FRAME_GUIDES, SPONSORSHIPS, MEETINGS, POSTING, TODO, ANALYTICS, OBJECTIVES, TEAM];

/** The menu's groups, with Business (in its own group, after Insights) and Developer when they're the person's. */
export function navGroups(o: { business?: boolean; developer?: boolean }): { label: string | null; items: NavItem[] }[] {
  const groups = [...NAV_GROUPS];
  if (o.business) groups.splice(groups.findIndex((g) => g.label === "Team"), 0, { label: "Business", items: [BUSINESS] });
  if (o.developer) groups.push({ label: "Developer", items: [DEVELOPER] });
  return groups;
}
/** The phone's More list, the same way. */
export function moreItems(o: { business?: boolean; developer?: boolean }): NavItem[] {
  const items = [...MORE_ITEMS];
  if (o.business) items.splice(items.indexOf(TEAM), 0, BUSINESS);
  if (o.developer) items.push(DEVELOPER);
  return items;
}
