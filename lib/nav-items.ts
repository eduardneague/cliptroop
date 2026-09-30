import { HomeIcon, VideoIcon, ShortsIcon, CalendarIcon, UsersIcon, PostingIcon } from "@/components/ui/icons";

/**
 * Sidebar + mobile bottom-bar destinations. Icons are SVG components,
 * never Unicode symbols (iOS turns those into emoji).
 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", Icon: HomeIcon, available: true },
  { href: "/videos", label: "Long videos", shortLabel: "Long", Icon: VideoIcon, available: true },
  { href: "/shorts", label: "Short videos", shortLabel: "Shorts", Icon: ShortsIcon, available: true },
  { href: "/posting", label: "Posting", shortLabel: "Posting", Icon: PostingIcon, available: true },
  { href: "/calendar", label: "Calendar", shortLabel: "Calendar", Icon: CalendarIcon, available: true },
  { href: "/team", label: "Team", shortLabel: "Team", Icon: UsersIcon, available: true },
] as const;
