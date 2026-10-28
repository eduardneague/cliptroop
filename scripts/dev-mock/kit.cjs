// 1.41.0: the media kit's tables, a big library of videos to pick from, and who else deletes videos (Team → Danger zone).
//   MOCK_LIBRARY=1      about 1,500 more videos on every platform since 2021 (Shorts, Reels, TikToks, long videos, live
//                       streams, posts), for the media kit's picker (MOCK_LIBRARY=200: that many)
//   MOCK_KIT=owner      the setup of the owner's screenshot (a YouTube kit, the "tester" Instagram package at 555 EUR,
//                       Show prices); MOCK_KIT=eight: eight packages and a long note
//   MOCK_KIT_TEMPLATES=2  that many saved templates
//   MOCK_DELETE=maria:shorts,andrei:longs   what the owner let each person delete (shorts, longs, both)
//   MOCK_DELETE_MANY=shorts,longs           the people given it delete several at once
//   MOCK_NO_0119=1      as before migration 0119 (no such table, function or columns)
const crypto = require("crypto");

function kitFixtures({ TEAM, U, people, at }) {
  const NOW = Date.now();
  const rnd = (() => {
    let x = 2463534242;
    return () => ((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5), (x >>> 0) / 4294967296);
  })();
  // ---- The library
  const n = process.env.MOCK_LIBRARY ? (Number(process.env.MOCK_LIBRARY) > 1 ? Number(process.env.MOCK_LIBRARY) : 1500) : 0;
  const words = ["What Your GPU Says About You", "Rating Your PC Builds", "I Tested a $200 Fake iPhone", "Every PS5 Is Getting Banned", "Check Your RAM Now", "Why Does Storage Start With C", "Hot PC Takes", "What Your CPU Says About You", "I Became The Windows XP Guy", "Building a PC in a Shoebox", "The Cheapest Gaming Laptop", "Is This Monitor Worth It", "Fixing My Viewers' PCs", "Keyboard Sounds Ranked", "One Year With a Steam Deck"];
  const plats = ["youtube", "youtube", "youtube", "instagram", "tiktok", "facebook"];
  const library = Array.from({ length: n }, (_, i) => {
    const platform = plats[i % plats.length];
    const r = rnd();
    // YouTube: mostly Shorts, a long video every few, a live stream now and then; Instagram: Reels and posts; Facebook: all three.
    const kind =
      platform === "youtube" ? (r < 0.78 ? "short" : r < 0.97 ? "long" : "live") : platform === "instagram" ? (r < 0.8 ? "short" : "post") : platform === "facebook" ? (r < 0.5 ? "short" : r < 0.8 ? "long" : "post") : "short";
    const days = Math.floor(rnd() * 5.6 * 365);
    const base = kind === "short" ? 30_000 + rnd() * 900_000 : kind === "long" ? 8_000 + rnd() * 400_000 : kind === "live" ? 2_000 + rnd() * 40_000 : 500 + rnd() * 30_000;
    const views = Math.round(base * (rnd() < 0.04 ? 6 : 1));
    return {
      team_id: TEAM,
      platform,
      external_id: `lib-${platform}-${i}`,
      kind,
      title: `${words[i % words.length]}${kind === "long" ? "" : ` #${(i % 97) + 1}`}`,
      url: `https://example.com/lib/${i}`,
      thumbnail_url: `https://i.ytimg.com/vi/lib${i}/hqdefault.jpg`,
      published_at: new Date(NOW - days * 86_400_000 - (i % 24) * 3_600_000).toISOString(),
      duration_seconds: kind === "long" ? 600 + Math.round(rnd() * 1400) : kind === "live" ? 5400 : 35,
      views,
      likes: Math.round(views * (0.02 + rnd() * 0.05)),
      comments: Math.round(views * 0.002),
      shares: Math.round(views * 0.001),
      saves: null,
      reach: null,
      short_id: null,
      project_id: null,
      short_videos: null,
      long_video_projects: null,
    };
  });

  // ---- The media kit
  const pkg = (id, name, detail, platform, price) => ({ id, name, detail, platform, price });
  const kitSettings =
    process.env.MOCK_KIT === "owner"
      ? { v: 1, platforms: ["youtube"], split: "together", period: "28d", rates: { show: true, currency: "EUR", note: "", packages: [pkg("tester", "tester", "test", "instagram", 555), pkg("dedicated", "Dedicated video", "A whole video built around your brand", "youtube", null), pkg("short", "Short or Reel", "A vertical video of 30 to 60 seconds", "any", null)] }, about: "Tech videos for people who build their own PCs.", partners: [], testimonials: [], contact: { name: "Edu", email: "edu@example.com", phone: "", website: "viverro.com", cta: "" } }
      : process.env.MOCK_KIT === "eight"
        ? { v: 1, split: "together", period: "28d", rates: { show: false, currency: "EUR", note: "Prices exclude VAT. Every package includes a link in the description, a pinned comment and two rounds of changes.", packages: [pkg("a", "Dedicated video", "A whole video built around your brand", "youtube", 4000), pkg("b", "Integration", "60 to 90 seconds inside one of our videos", "youtube", 1800), pkg("c", "Short", "A vertical video of 30 to 60 seconds", "youtube", 900), pkg("d", "Reel", "A Reel with your product, and a story", "instagram", 700), pkg("e", "TikTok", "One TikTok, with a link in bio for a week", "tiktok", 600), pkg("f", "Facebook video", "A video on the Page", "facebook", null), pkg("g", "Bundle", "A Short, a Reel and a TikTok of one idea", "any", 1900), pkg("h", "Live stream", "An hour live with your product", "youtube", null)] } }
        : null;
  const templates = Array.from({ length: Math.max(0, Math.min(5, Number(process.env.MOCK_KIT_TEMPLATES || 0))) }, (_, i) => ({
    id: `7e000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    team_id: TEAM,
    name: ["Gaming brands", "Tech sponsors", "Romanian brands", "Summer 2026", "Agencies"][i],
    settings: { v: 1, title: ["Gaming brands", "Tech sponsors", "Romanian brands", "Summer 2026", "Agencies"][i] },
    updated_at: at(-i - 1),
    updated_by: U[0],
  }));

  // ---- Who else deletes videos
  const no0119 = !!process.env.MOCK_NO_0119;
  const byName = Object.fromEntries(people.map((p) => [p.username, p.id]));
  const access = no0119
    ? null
    : String(process.env.MOCK_DELETE || "")
        .split(",")
        .filter(Boolean)
        .map((x) => {
          const [who, what] = x.split(":");
          return { team_id: TEAM, user_id: byName[who] ?? who, shorts: what === "shorts" || what === "both", longs: what === "longs" || what === "both", granted_by: U[0], granted_at: at(-2) };
        });
  const many = String(process.env.MOCK_DELETE_MANY || "");
  const teamDelete = no0119 ? {} : { delete_many_shorts: many.includes("shorts"), delete_many_longs: many.includes("longs") };

  return {
    library,
    teamDelete,
    // Before 0119 its table isn't there: PostgREST says so (PGRST205), as Supabase would.
    missing: no0119 ? ["video_delete_access"] : [],
    tables: {
      media_kit_settings: kitSettings ? [{ team_id: TEAM, settings: kitSettings, updated_at: at(-1), updated_by: U[0] }] : [],
      media_kit_templates: templates,
      media_kit_access: [],
      ...(access ? { video_delete_access: access } : {}),
    },
    rpc: {
      // The database decides (0119); the mock lets every short asked for go. Before 0119: no such functions (PostgREST's
      // own answer), so the app falls back to the old way.
      ...(no0119
        ? Object.fromEntries(
            ["delete_shorts", "set_delete_rules"].map((fn) => [fn, () => ({ __status: 404, __body: { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null } })])
          )
        : {
            delete_shorts: (b) => (Array.isArray(b?.p_ids) ? b.p_ids.map((id) => ({ short_id: id })) : []),
            set_delete_rules: () => null,
          }),
    },
  };
}

module.exports = { kitFixtures, uuid: () => crypto.randomUUID() };
