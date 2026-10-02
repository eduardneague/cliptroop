/** Dashboard Studio: which widgets, in what order, how big, their settings. */
export type WidgetType = "tasks" | "contributions" | "todo" | "teams" | "clock" | "minicalendar" | "upcomingShorts" | "upcomingLongs" | "pipeline" | "posting" | "weather";
export type Size = "s" | "m" | "l" | "w";
export type WidgetInstance = { id: string; type: WidgetType; size: Size; settings?: Record<string, unknown> };
export type Layout = { v: 1; widgets: WidgetInstance[] };

/** Every widget once per dashboard. */
export const CATALOG: Record<WidgetType, { name: string; description: string; sizes: Size[]; size: Size }> = {
  tasks: { name: "My tasks", description: "Everything you need to do, today and coming up.", sizes: ["m", "l", "w"], size: "l" },
  contributions: { name: "Contributions", description: "A year of finished tasks, one square per day.", sizes: ["l", "w"], size: "w" },
  todo: { name: "To-do list", description: "Your own list: priorities, due dates, notes.", sizes: ["s", "m", "l"], size: "s" },
  teams: { name: "Teams", description: "Your teams and who's in them. Click to switch.", sizes: ["s", "m"], size: "s" },
  upcomingShorts: { name: "Upcoming shorts", description: "The next shorts by date, with their step and editor.", sizes: ["s", "m"], size: "s" },
  upcomingLongs: { name: "Upcoming long videos", description: "Long videos in progress, with thumbnails and dates.", sizes: ["s", "m", "l"], size: "s" },
  pipeline: { name: "Pipeline", description: "How many videos sit at each step: bottlenecks at a glance.", sizes: ["m", "l", "w"], size: "m" },
  posting: { name: "Posting today", description: "Today's scheduled posts and anything that failed.", sizes: ["s", "m"], size: "s" },
  clock: { name: "Clock", description: "A clock face with moving hands, the time and date.", sizes: ["s", "m"], size: "s" },
  minicalendar: { name: "Mini calendar", description: "This month with shorts and long videos marked.", sizes: ["s", "m"], size: "s" },
  weather: { name: "Weather", description: "Now and the next 5 days, for your city.", sizes: ["s", "m"], size: "s" },
};

/** Column span per size: phones 1 column, tablets 2, desktop 12. */
export const SPAN: Record<Size, string> = {
  s: "md:col-span-1 lg:col-span-4",
  m: "md:col-span-1 lg:col-span-6",
  l: "md:col-span-2 lg:col-span-8",
  w: "md:col-span-2 lg:col-span-12",
};
export const SIZE_LABEL: Record<Size, string> = { s: "Small", m: "Medium", l: "Large", w: "Wide" };

export const DEFAULT_LAYOUT: Layout = {
  v: 1,
  widgets: [
    { id: "w-tasks", type: "tasks", size: "l" },
    { id: "w-teams", type: "teams", size: "s" },
    { id: "w-contrib", type: "contributions", size: "w", settings: { color: "#22c55e", scope: "all" } },
    { id: "w-shorts", type: "upcomingShorts", size: "s" },
    { id: "w-longs", type: "upcomingLongs", size: "s" },
    { id: "w-posting", type: "posting", size: "s" },
    { id: "w-pipeline", type: "pipeline", size: "m" },
    { id: "w-todo", type: "todo", size: "m" },
    { id: "w-clock", type: "clock", size: "s", settings: { h24: true, secondHand: true } },
    { id: "w-cal", type: "minicalendar", size: "s" },
    { id: "w-weather", type: "weather", size: "s", settings: { units: "c" } },
  ],
};

/** A saved layout, cleaned up (unknown widgets dropped, sizes kept valid). */
export function readLayout(raw: unknown): Layout {
  const l = raw as Layout | null;
  if (!l || l.v !== 1 || !Array.isArray(l.widgets)) return DEFAULT_LAYOUT;
  const seen = new Set<string>();
  const widgets = l.widgets
    .filter((w) => w && typeof w.id === "string" && w.type in CATALOG && !seen.has(w.type) && (seen.add(w.type), true))
    .map((w) => ({ ...w, size: CATALOG[w.type].sizes.includes(w.size) ? w.size : CATALOG[w.type].size }));
  return { v: 1, widgets };
}
