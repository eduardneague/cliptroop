import { HomeIcon, VideoIcon, ShortsIcon, CalendarIcon, UsersIcon, PostingIcon, MeetingIcon, AnalyticsIcon, CodeIcon, TargetIcon } from "@/components/ui/icons";

/**
 * Sidebar + phone bar destinations, in groups. Icons are SVG components,
 * never Unicode symbols (iOS turns those into emoji).
 */
const DASHBOARD = { href: "/dashboard", label: "Dashboard", shortLabel: "Home", Icon: HomeIcon, available: true } as const;
const SHORTS = { href: "/shorts", label: "Short videos", shortLabel: "Shorts", Icon: ShortsIcon, available: true } as const;
const VIDEOS = { href: "/videos", label: "Long videos", shortLabel: "Long", Icon: VideoIcon, available: true } as const;
const CALENDAR = { href: "/calendar", label: "Calendar", shortLabel: "Calendar", Icon: CalendarIcon, available: true } as const;
const MEETINGS = { href: "/meetings", label: "Meetings", shortLabel: "Meetings", Icon: MeetingIcon, available: true } as const;
const POSTING = { href: "/posting", label: "Posting", shortLabel: "Posting", Icon: PostingIcon, available: true } as const;
const ANALYTICS = { href: "/analytics", label: "Analytics", shortLabel: "Analytics", Icon: AnalyticsIcon, available: true } as const;
const OBJECTIVES = { href: "/objectives", label: "Objectives", shortLabel: "Objectives", Icon: TargetIcon, available: true } as const;
const TEAM = { href: "/team", label: "Team", shortLabel: "Team", Icon: UsersIcon, available: true } as const;
/** Developer accounts only (the layout decides; see isDeveloper in lib/errors.ts). */
export const DEVELOPER = { href: "/developer", label: "Developer", shortLabel: "Developer", Icon: CodeIcon, available: true } as const;

export type NavItem = typeof DASHBOARD | typeof SHORTS | typeof VIDEOS | typeof CALENDAR | typeof MEETINGS | typeof POSTING | typeof ANALYTICS | typeof OBJECTIVES | typeof TEAM | typeof DEVELOPER;

export const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [DASHBOARD] },
  { label: "Content", items: [SHORTS, VIDEOS] },
  { label: "Schedule", items: [CALENDAR, MEETINGS, POSTING] },
  { label: "Insights", items: [ANALYTICS, OBJECTIVES] },
  { label: "Team", items: [TEAM] },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The phone bar: the four you use most; the rest live under More. */
export const BOTTOM_ITEMS: NavItem[] = [DASHBOARD, SHORTS, VIDEOS, CALENDAR];
export const MORE_ITEMS: NavItem[] = [MEETINGS, POSTING, ANALYTICS, OBJECTIVES, TEAM];
