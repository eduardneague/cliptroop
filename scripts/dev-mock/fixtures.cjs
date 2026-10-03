// Sample data for the mock Supabase. Shapes follow what the pages select.
const TEAM = "11111111-1111-4111-8111-111111111111";
const U = ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002", "aaaaaaaa-0000-4000-8000-000000000003", "aaaaaaaa-0000-4000-8000-000000000004"];
const NOW = Date.parse("2026-10-03T09:00:00Z");
const day = (n) => new Date(NOW + n * 86400000).toISOString().slice(0, 10);
const at = (n, h = 10) => new Date(NOW + n * 86400000 + (h - 9) * 3600000).toISOString();
const people = [
  { id: U[0], username: "edu", full_name: "Edu Marin", email: "edu@example.com", avatar_url: null, color: "#e8630d" },
  { id: U[1], username: "maria", full_name: "Maria Popescu", email: "maria@example.com", avatar_url: null, color: "#583ac8" },
  { id: U[2], username: "andrei", full_name: "Andrei Ionescu", email: "andrei@example.com", avatar_url: null, color: "#0b8fcb" },
  { id: U[3], username: "ioana", full_name: "Ioana Stan", email: "ioana@example.com", avatar_url: null, color: "#0f9c88" },
];
const LAYOUT = { v: 2, fill: false, sounds: true, widgets: [
  { id: "w-output", type: "output", x: 0, y: 0, w: 6, h: 2 },
  { id: "w-views", type: "views", x: 6, y: 0, w: 3, h: 3 },
  { id: "w-followers", type: "followers", x: 9, y: 0, w: 3, h: 3 },
  { id: "w-map", type: "audienceMap", x: 0, y: 2, w: 6, h: 4 },
  { id: "w-top", type: "topVideos", x: 6, y: 3, w: 6, h: 4 },
  { id: "w-clock", type: "clock", x: 0, y: 6, w: 2, h: 2, settings: { h24: true, secondHand: true } },
  { id: "w-views2", type: "meetings", x: 2, y: 6, w: 4, h: 2 },
] };
const prof = (i) => ({ ...people[i], animations_enabled: true, sounds_enabled: false, dashboard_layout: process.env.MOCK_LAYOUT ? LAYOUT : null, created_at: "2026-01-10T10:00:00Z", bio: null, banner_url: null });
const roles = [["master"], ["scripter", "editor"], ["editor"], ["publisher", "reviewer"]];
const members = people.map((p, i) => ({
  id: `bbbbbbbb-0000-4000-8000-00000000000${i + 1}`,
  team_id: TEAM,
  user_id: p.id,
  status: "active",
  joined_at: "2026-01-12T10:00:00Z",
  created_at: "2026-01-12T10:00:00Z",
  member_roles: roles[i].map((role) => ({ role })),
  profiles: prof(i),
  profile: prof(i),
}));
const team = {
  id: TEAM,
  name: "Viverro Main",
  slug: "viverro",
  color: "#e8630d",
  logo_url: null,
  created_at: "2026-01-10T10:00:00Z",
  owner_id: U[0],
  timezone: "Europe/Bucharest",
  short_color: null,
  long_color: null,
  shorts_per_day: 2,
  team_members: members.map((m) => ({ user_id: m.user_id, status: "active" })),
};
// ---- Shorts
const mem = (i) => ({ id: members[i].id, user_id: members[i].user_id, profiles: { username: people[i].username, full_name: people[i].full_name, email: people[i].email, avatar_url: null } });
const SHORT_TITLES = ["Why cats knock things over", "3 kitchen hacks you need", "The tallest tree on Earth", "Morning routine (honest)", "Tiny house tour: 12 m²", "Street food in Cluj", "One-minute history: Dacia", "Pasta from scratch", "Rainy day ideas", "The best desk setup", "How bees talk", "Plant care basics", "Old phones vs new", "Coffee at home, 4 ways", "Why the sky is blue", "Night market in Iași"];
const stages = ["posted", "posted", "posted", "ready", "review", "editing", "editing", "editing", "script", "script", "script", "script", "script", "script", "script", "script"];
const shorts = SHORT_TITLES.map((title, i) => {
  const id = `cccccccc-0000-4000-8000-0000000000${String(i + 10).padStart(2, "0")}`;
  const stage = stages[i];
  const planned = day(i - 3 + Math.floor(i / 2));
  return {
    id, team_id: TEAM, entry_number: 231 + i, title, stage, planned_date: planned, schedule_mode: i === 6 ? "pinned" : "auto", pin_kind: i === 6 ? "oneoff" : null, queue_position: i,
    platforms: ["youtube", "instagram", "tiktok"], file_link: stage === "script" ? null : "https://drive.google.com/x", short_type: i === 4 ? "sponsorship" : i === 9 ? "big" : "filler",
    caption_enabled: i % 3 === 0, caption: i % 3 === 0 ? "Did you know? #shorts" : null, review_note: stage === "editing" && i === 7 ? "Cut the intro by 2 seconds and add captions." : null,
    created_at: at(-20 + i), created_by: U[0], creator: { username: "edu", full_name: "Edu Marin", email: "edu@example.com", avatar_url: null },
    editor: stage === "script" && i > 11 ? null : mem(i % 2 ? 2 : 1), reviewer: mem(0), scheduler: mem(3),
    short_video_posts: stage === "posted" ? [{ platform: "youtube", post_url: "https://youtube.com/shorts/x", posted_at: at(i - 3), posted_by: U[3], poster: { username: "ioana", full_name: "Ioana Stan", email: null, avatar_url: null } }, { platform: "instagram", post_url: null, posted_at: at(i - 3), posted_by: U[3], poster: null }, { platform: "tiktok", post_url: null, posted_at: at(i - 3), posted_by: U[3], poster: null }] : [],
    short_scripters: [{ team_member_id: members[1].id }],
    short_video_versions: [{ count: stage === "script" ? 0 : 1 }],
    short_video_events: [
      { id: 900 + i * 3, kind: "stage", from_stage: "script", to_stage: "editing", platform: null, note: null, created_at: at(-6 + i * 0.2), actor_id: U[1], actor: { username: "maria", full_name: "Maria Popescu", email: null, avatar_url: null } },
      { id: 901 + i * 3, kind: "created", from_stage: null, to_stage: "script", platform: null, note: null, created_at: at(-20 + i), actor_id: U[0], actor: { username: "edu", full_name: "Edu Marin", email: null, avatar_url: null } },
    ],
    short_videos: { entry_number: 231 + i, title, team_id: TEAM },
  };
});
// ---- Long videos
const LONG = [
  ["The real cost of living in Bucharest", "publish", 6, "Documentary"],
  ["We tried every bakery in Cluj", "edit", 14, "Food"],
  ["How Romania's trains work (and don't)", "script", 24, "Explainer"],
  ["Tiny houses: the full story", "research", 33, "Documentary"],
  ["A week without a phone", "ideate", null, "Challenge"],
  ["Inside a 400-year-old salt mine", "done", -9, "Travel"],
  ["Street food tour: Iași", "film", 19, "Food"],
];
const longs = LONG.map(([title, stage, d, theme], i) => ({
  id: `dddddddd-0000-4000-8000-00000000000${i + 1}`, team_id: TEAM, entry_number: 41 + i, title, stage, expected_date: d === null ? null : day(d), theme, subtheme: null, video_type: i % 2 ? ["Hub"] : ["Hero", "Help"], created_at: at(-60 + i * 5), created_by: U[0], published_at: stage === "done" ? at(-9) : null, youtube_video_id: null, description: null, project_thumbnails: [], notes: null,
}));
const titles = longs.flatMap((l, i) => [{ id: `t${i}a`, project_id: l.id, title: l.title, is_picked: true, position: 0 }, { id: `t${i}b`, project_id: l.id, title: l.title + " (alt)", is_picked: false, position: 1 }]);
const assignees = longs.flatMap((l) => [{ id: l.id + "a1", project_id: l.id, stage: "edit", team_member_id: members[2].id }, { id: l.id + "a2", project_id: l.id, stage: "script", team_member_id: members[1].id }, { id: l.id + "a3", project_id: l.id, stage: "publish", team_member_id: members[3].id }]);

// ---- Analytics (0058)
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const daily = [];
const countriesRows = [];
const CC = [["RO", 0.42], ["US", 0.17], ["MD", 0.08], ["GB", 0.06], ["DE", 0.055], ["IT", 0.05], ["ES", 0.035], ["FR", 0.03], ["CA", 0.02], ["AU", 0.015], ["NL", 0.012], ["HU", 0.012], ["PL", 0.01], ["BR", 0.008], ["IN", 0.008], ["JP", 0.004], ["MX", 0.004], ["ZA", 0.003]];
for (let d = -60; d <= 0; d++) {
  const dd = day(d);
  const yt = Math.round(14000 + 3000 * Math.sin(d / 3.1) + 5000 * rnd() + d * -40);
  const ig = Math.round(6200 + 1500 * Math.sin(d / 4) + 2000 * rnd());
  daily.push({ team_id: TEAM, platform: "youtube", day: dd, content: "all", views: yt, watch_minutes: Math.round(yt * 0.55), avg_view_seconds: 31, likes: Math.round(yt * 0.04), comments: Math.round(yt * 0.003), shares: Math.round(yt * 0.002), saves: null, reach: null, followers_gained: Math.round(120 + 60 * rnd()), followers_lost: Math.round(20 + 10 * rnd()), followers: d === 0 ? 182400 : null, total_views: d === 0 ? 48200000 : null, total_likes: null });
  daily.push({ team_id: TEAM, platform: "youtube", day: dd, content: "shorts", views: Math.round(yt * 0.72) });
  daily.push({ team_id: TEAM, platform: "youtube", day: dd, content: "long", views: Math.round(yt * 0.28) });
  daily.push({ team_id: TEAM, platform: "instagram", day: dd, content: "all", views: ig, likes: Math.round(ig * 0.05), comments: Math.round(ig * 0.004), shares: Math.round(ig * 0.003), saves: Math.round(ig * 0.006), reach: Math.round(ig * 0.7), followers: 64000 + (d + 60) * 12, followers_gained: null, followers_lost: null, watch_minutes: null, total_views: null, total_likes: null });
  daily.push({ team_id: TEAM, platform: "tiktok", day: dd, content: "all", followers: 120000 + (d + 60) * 40, total_views: 9000000 + (d + 60) * 9500 + Math.round(4000 * rnd()), total_likes: 700000 + (d + 60) * 600, views: null });
  if (d >= -28 && d <= -1) for (const [c, share] of CC) countriesRows.push({ team_id: TEAM, platform: "youtube", metric: "views", day: dd, country: c, value: Math.round(yt * share * (0.85 + rnd() * 0.3)), watch_minutes: Math.round(yt * share * 0.5) });
}
const IGC = [["RO", 38100], ["MD", 7200], ["IT", 4900], ["US", 3100], ["ES", 2400], ["DE", 1900]].map(([c, v]) => ({ team_id: TEAM, platform: "instagram", metric: "followers", day: day(-1), country: c, value: v }));
const contentRows = shorts.filter((x) => x.stage === "posted").flatMap((x, i) => ["youtube", "instagram", "tiktok"].map((pl, k) => ({ team_id: TEAM, platform: pl, external_id: `${pl}-${i}`, kind: "short", title: x.title, url: "https://example.com", thumbnail_url: null, published_at: at(-3 + i), duration_seconds: 45, views: Math.round(20000 + 90000 * rnd()), likes: Math.round(4000 * rnd()), comments: Math.round(300 * rnd()), shares: Math.round(400 * rnd()), saves: null, reach: null, short_id: x.id, project_id: null, short_videos: { entry_number: x.entry_number }, long_video_projects: null })));
contentRows.push({ team_id: TEAM, platform: "youtube", external_id: "yt-long-1", kind: "long", title: "Inside a 400-year-old salt mine", url: "https://example.com", thumbnail_url: null, published_at: at(-9), duration_seconds: 1240, views: 214000, likes: 9800, comments: 640, shares: 410, short_id: null, project_id: longs[5].id, short_videos: null, long_video_projects: { entry_number: 46 } });
contentRows.sort((a, b) => b.views - a.views);
const syncs = ["youtube", "instagram", "tiktok"].map((pl) => ({ team_id: TEAM, platform: pl, last_run_at: at(0, 8), last_ok_at: at(0, 8), last_error: null, backfilled: true, revenue_note: null }));
const STATS = { youtube: ["https://www.googleapis.com/auth/yt-analytics.readonly", "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"], instagram: ["instagram_business_manage_insights"], tiktok: ["user.info.stats", "video.list"] };

module.exports = {
  TEAM,
  U,
  user: { id: U[0], aud: "authenticated", role: "authenticated", email: "edu@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-10T10:00:00Z" },
  rpc: { can_view_revenue: true, is_master_of: true },
  tables: {
    teams: [team],
    profiles: people.map((_, i) => prof(i)),
    team_members: members,
    notifications: [],
    role_colors: [],
    short_videos: shorts,
    short_video_posts: shorts.flatMap((x) => x.short_video_posts.map((p) => ({ ...p, short_id: x.id, short_videos: { team_id: TEAM } }))),
    short_scripters: shorts.map((x) => ({ short_id: x.id, team_member_id: members[1].id })),
    short_video_events: shorts.flatMap((x) => x.short_video_events.map((e) => ({ ...e, short_id: x.id, short_videos: { team_id: TEAM } }))),
    short_video_versions: [],
    short_video_comments: [],
    long_video_projects: longs,
    project_titles: titles,
    project_assignees: assignees,
    project_comments: [],
    project_thumbnails: [],
    comment_attachments: [],
    long_video_posts: [],
    long_video_scripters: longs.map((l) => ({ project_id: l.id, team_member_id: members[1].id })),
    package_entries: [],
    social_accounts: ["youtube", "instagram", "tiktok"].map((pl) => ({ id: "acc-" + pl, team_id: TEAM, platform: pl, display_name: "Viverro", username: "viverro", avatar_url: null, status: "active", scopes: STATS[pl], connected_at: at(-30), last_error: null })),
    analytics_daily: daily,
    analytics_countries: [...countriesRows, ...IGC],
    analytics_content: contentRows,
    analytics_syncs: syncs,
    analytics_revenue_daily: [],
    revenue_access: [],
    social_posts: [],
    team_day_limits: [],
    meetings: [],
    todos: [],
    tasks: [],
  },
  helpers: { day, at, people, members },
};
