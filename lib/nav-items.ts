import { HomeIcon, VideoIcon, ShortsIcon, CalendarIcon, UsersIcon, PostingIcon, MeetingIcon, AnalyticsIcon, CodeIcon, TargetIcon, OutliersIcon, BusinessIcon } from "@/components/ui/icons";

/**
 * Sidebar + phone bar destinations, in groups. Icons are SVG components,
 * never Unicode symbols (iOS turns those into emoji).
 */
const DASHBOARD = { href: "/dashboard", label: "Dashboard", shortLabel: "Home", Icon: HomeIcon, available: true } as const;
const OUTLIERS = { href: "/outliers", label: "Outliers", shortLabel: "Outliers", Icon: OutliersIcon, available: true } as const;
const SHORTS = { href: "/shorts", label: "Short videos", shortLabel: "Shorts", Icon: ShortsIcon, available: true } as const;
const VIDEOS = { href: "/videos", label: "Long videos", shortLabel: "Long", Icon: VideoIcon, available: true } as const;
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

export type NavItem = typeof DASHBOARD | typeof OUTLIERS | typeof SHORTS | typeof VIDEOS | typeof CALENDAR | typeof MEETINGS | typeof POSTING | typeof ANALYTICS | typeof OBJECTIVES | typeof TEAM | typeof BUSINESS | typeof DEVELOPER;

export const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [DASHBOARD] },
  { label: "Research", items: [OUTLIERS] },
  { label: "Content", items: [SHORTS, VIDEOS] },
  { label: "Schedule", items: [CALENDAR, MEETINGS, POSTING] },
  { label: "Insights", items: [ANALYTICS, OBJECTIVES] },
  { label: "Team", items: [TEAM] },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The phone bar: the four you use most; the rest live under More. */
export const BOTTOM_ITEMS: NavItem[] = [DASHBOARD, SHORTS, VIDEOS, CALENDAR];
export const MORE_ITEMS: NavItem[] = [OUTLIERS, MEETINGS, POSTING, ANALYTICS, OBJECTIVES, TEAM];

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
