// Analytics → Advanced (0081) sample data: every other number per day and
// per video, the splits (traffic, devices, search terms, age and gender…),
// retention curves, each video's money, more videos on every platform (with
// patterns to find: short shorts, question titles and evening posts do
// better), hooks in their scripts. Mutates the base rows it's given.
module.exports.advancedFixtures = function advancedFixtures({ TEAM, day, at, daily, contentRows, revenue, shorts, LAST_DAY }) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const r1 = (x) => Math.round(x * 10) / 10;
  const r2 = (x) => Math.round(x * 100) / 100;

  // ---- Every other number per day -----------------------------------------------------------
  for (const r of daily) {
    if (r.platform === "youtube" && r.content === "all") {
      const v = r.views ?? 0;
      Object.assign(r, {
        engaged_views: Math.round(v * (0.78 + rnd() * 0.06)),
        avg_view_pct: r1(58 + rnd() * 12),
        dislikes: Math.round(v * 0.0012),
        playlist_adds: Math.round(v * 0.0009),
        metrics: {
          premium_views: Math.round(v * 0.041),
          premium_watch_minutes: Math.round(v * 0.041 * 0.62),
          playlist_removes: Math.round(v * 0.0002),
          card_impressions: Math.round(v * 0.03),
          card_clicks: Math.round(v * 0.03 * 0.021),
          card_teaser_impressions: Math.round(v * 0.05),
          card_teaser_clicks: Math.round(v * 0.05 * 0.012),
        },
      });
    } else if (r.platform === "youtube") {
      const v = r.views ?? 0;
      const shortsRow = r.content === "shorts";
      Object.assign(r, {
        watch_minutes: Math.round(v * (shortsRow ? 0.36 : 4.2)),
        likes: Math.round(v * (shortsRow ? 0.042 : 0.034)),
        comments: Math.round(v * (shortsRow ? 0.0021 : 0.0052)),
        shares: Math.round(v * 0.0019),
        avg_view_seconds: shortsRow ? r1(24 + rnd() * 6) : r1(380 + rnd() * 80),
        avg_view_pct: shortsRow ? r1(78 + rnd() * 14) : r1(38 + rnd() * 8),
        engaged_views: Math.round(v * (shortsRow ? 0.72 : 1)),
        followers_gained: Math.round(v * (shortsRow ? 0.0068 : 0.012)),
        followers_lost: Math.round(v * 0.0011),
      });
    } else if (r.platform === "instagram") {
      const v = r.views ?? 0;
      r.metrics = { interactions: Math.round(v * 0.068), accounts_engaged: Math.round(v * 0.041), replies: Math.round(v * 0.0011), reposts: Math.round(v * 0.0016), profile_link_taps: Math.round(v * 0.0023) };
    } else if (r.platform === "facebook" && r.views) {
      r.reach = Math.round(r.views * 0.74);
      r.metrics = { video_watch_minutes: Math.round(r.views * 0.31), complete_views_30s: Math.round(r.views * 0.09), page_visits: Math.round(r.views * 0.012) };
    }
  }
  for (const r of revenue) {
    if (r.platform !== "youtube" || r.content !== "all") continue;
    const imp = Math.round(r.revenue * 160 + rnd() * 400);
    Object.assign(r, { cpm: r2(5.2 + rnd() * 2.4), playback_cpm: r2(7.4 + rnd() * 3), ad_impressions: imp, monetized_playbacks: Math.round(imp * 0.71) });
  }

  // ---- More videos ----------------------------------------------------------------------------
  const TITLES = [
    "Can you guess which coffee is $1?", "I ate only street food for 24 hours", "Is this the tiniest flat in Bucharest?", "3 snacks every Romanian grew up with", "Why does this bread cost 40 lei?",
    "I tried the viral pancake stall", "The cheapest lunch in Cluj", "Would you eat this for breakfast?", "Night market: what $10 buys", "This bakery opens at 4 a.m.",
    "Romania's weirdest vending machine", "Rating gas station sandwiches", "How much is a coffee in Iași?", "I cooked like my grandma for a week", "The most famous soup in Romania",
    "Making covrigi at home", "Is this restaurant worth 300 lei?", "We found a hidden food court", "My honest supermarket haul", "Every pastry in this shop, ranked",
    "Who makes the best mici?", "1 lei vs 100 lei dessert", "The 5 a.m. fish market", "A day on a farm in Maramureș", "Trying sarmale for the first time?",
    "Tiny kitchen, big dinner", "What locals order in Sibiu", "Is fast food cheaper than cooking?", "Our most-asked recipe", "Street food rules nobody tells you",
    "Can I live on 20 lei a day?", "Inside a 100-year-old bakery", "The best shawarma in town?", "Breakfast in 4 cities", "Five-minute dinner ideas", "We rated airport food",
  ];
  const HOOKS = [
    "Can you guess which of these coffees costs one dollar?", "I ate only street food for a whole day. Here's what happened.", "Is this the tiniest flat in the whole city?", "If you grew up in Romania, you know these three snacks.",
    "Why would anyone pay forty lei for one loaf of bread?", "Everyone's lining up for this pancake stall. Is it worth it?", "This is the cheapest lunch I could find in Cluj.", "Would you eat this for breakfast? Be honest.",
    "Ten dollars at the night market. Let's see how far it goes.", "This bakery opens at 4 in the morning, and there's already a queue.",
  ];
  const now = Date.parse(`${day(LAST_DAY + 1)}T12:00:00Z`);
  const iso = (dAgo, hour) => new Date(now - dAgo * 86400000 - (12 - hour) * 3600000).toISOString();
  const thumb = (n) => `http://127.0.0.1:54321/storage/v1/object/img/an/v${n}.svg`;
  const out = [];
  const shortIds = shorts.map((s) => s.id);
  const typeOf = (i) => shorts[i]?.short_type ?? "filler";
  // YouTube Shorts: 36 over ~120 days. Short ones, question titles and evening posts do better.
  for (let i = 0; i < 36; i++) {
    const title = TITLES[i];
    const dur = [14, 18, 22, 28, 34, 41, 48, 55, 63][Math.floor(rnd() * 9)];
    const hour = pick([8, 11, 13, 16, 18, 19, 20, 21]);
    const boost = (dur < 20 ? 2.2 : dur < 40 ? 1.2 : 0.8) * (/\?/.test(title) ? 1.6 : 1) * (hour >= 17 && hour <= 21 ? 1.4 : 1) * (0.6 + rnd() * 0.9);
    const views = Math.round(9000 * boost * (1 + i * 0.02));
    const ours = i < 16 ? i : null;
    out.push({
      team_id: TEAM, platform: "youtube", external_id: `ytS${String(i).padStart(3, "0")}xyz`, kind: "short", title, url: `https://www.youtube.com/shorts/ytS${i}`, thumbnail_url: thumb(100 + i),
      published_at: iso(3 + i * 3.3, hour), duration_seconds: dur, views, likes: Math.round(views * (0.03 + rnd() * 0.025)), comments: Math.round(views * 0.002), shares: Math.round(views * (0.001 + rnd() * 0.002)),
      saves: null, reach: null, engaged_views: Math.round(views * 0.74), watch_minutes: r1((views * dur * 0.85) / 60), avg_view_seconds: r1(dur * (0.7 + rnd() * 0.35)), avg_view_pct: r1(70 + rnd() * 40 + (dur < 20 ? 15 : 0)), subscribers_gained: Math.round(views * (0.003 + rnd() * 0.006)),
      skip_rate: null, reposts: null, metrics: { dislikes: Math.round(views * 0.0011), subscribers_lost: Math.round(views * 0.0006), playlist_adds: Math.round(views * 0.0005), premium_views: Math.round(views * 0.04) },
      short_id: ours !== null ? shortIds[ours] : null, project_id: null, short_videos: ours !== null ? { entry_number: shorts[ours].entry_number, short_type: typeOf(ours) } : null, long_video_projects: null, updated_at: at(0, 8),
    });
  }
  // YouTube long videos: 9.
  const LONGS = ["The real cost of living in Bucharest", "We tried every bakery in Cluj", "Inside a 400-year-old salt mine", "Tiny houses: the full story", "A week without a phone", "Street food tour: Iași", "How Romania's trains work", "The village that feeds a city", "48 hours in Timișoara"];
  LONGS.forEach((title, i) => {
    const dur = [512, 734, 1240, 965, 1480, 640, 1102, 1830, 860][i];
    const views = Math.round((60000 + rnd() * 160000) * (dur < 900 ? 1.3 : 1));
    out.push({
      team_id: TEAM, platform: "youtube", external_id: `ytL${String(i).padStart(3, "0")}xyz`, kind: "long", title, url: `https://www.youtube.com/watch?v=ytL${i}`, thumbnail_url: thumb(200 + i),
      published_at: iso(8 + i * 13, pick([17, 18, 19])), duration_seconds: dur, views, likes: Math.round(views * 0.038), comments: Math.round(views * 0.006), shares: Math.round(views * 0.0024), saves: null, reach: null,
      engaged_views: views, watch_minutes: r1(views * dur * 0.4 / 60), avg_view_seconds: r1(dur * (0.32 + rnd() * 0.14)), avg_view_pct: r1(32 + rnd() * 14), subscribers_gained: Math.round(views * (0.008 + rnd() * 0.01)),
      skip_rate: null, reposts: null, metrics: { dislikes: Math.round(views * 0.0015), subscribers_lost: Math.round(views * 0.0009), playlist_adds: Math.round(views * 0.003), premium_views: Math.round(views * 0.05), card_impressions: Math.round(views * 0.4), card_clicks: Math.round(views * 0.4 * 0.02) },
      short_id: null, project_id: null, short_videos: null, long_video_projects: null, updated_at: at(0, 8),
    });
  });
  // Instagram Reels, TikToks, Facebook Reels: the same shorts (the first 16 are ours), each platform its own numbers.
  const others = [
    ["instagram", 24, 0.45],
    ["tiktok", 24, 0.8],
    ["facebook", 14, 0.18],
  ];
  for (const [pl, n, scale] of others)
    for (let i = 0; i < n; i++) {
      const yt = out[i];
      const skip = pl === "instagram" ? r1(18 + rnd() * 26) : null;
      const views = Math.round(yt.views * scale * (pl === "instagram" ? (skip < 28 ? 1.8 : 0.9) : 1) * (0.6 + rnd() * 0.8));
      const ours = i < 16 ? i : null;
      out.push({
        team_id: TEAM, platform: pl, external_id: `${pl.slice(0, 2)}R${String(i).padStart(3, "0")}`, kind: "short", title: yt.title, url: `https://example.com/${pl}/${i}`, thumbnail_url: thumb(300 + i),
        published_at: new Date(Date.parse(yt.published_at) + 3600000).toISOString(), duration_seconds: pl === "tiktok" ? yt.duration_seconds : null, views, likes: Math.round(views * (0.05 + rnd() * 0.04)), comments: Math.round(views * 0.003), shares: Math.round(views * (0.002 + rnd() * 0.004)),
        saves: pl === "instagram" ? Math.round(views * 0.006) : null, reach: pl === "instagram" ? Math.round(views * 0.71) : null, engaged_views: null, watch_minutes: null,
        avg_view_seconds: pl === "instagram" ? r1(8 + rnd() * 9) : pl === "facebook" ? r1(9 + rnd() * 8) : null, avg_view_pct: null, subscribers_gained: null, skip_rate: skip, reposts: pl === "instagram" ? Math.round(views * 0.001) : null,
        metrics:
          pl === "instagram"
            ? { total_watch_seconds: Math.round(views * 10.5), interactions: Math.round(views * 0.072), crossposted_views: Math.round(views * 0.04), facebook_views: Math.round(views * 0.03) }
            : pl === "facebook"
              ? { total_plays: Math.round(views * 1.3), replays: Math.round(views * 0.3), reach: Math.round(views * 0.68), total_watch_seconds: Math.round(views * 11), followers_gained: Math.round(views * 0.002), reactions: { like: Math.round(views * 0.03), love: Math.round(views * 0.008), haha: Math.round(views * 0.004) } }
              : {},
        short_id: ours !== null ? shortIds[ours] : null, project_id: null, short_videos: ours !== null ? { entry_number: shorts[ours].entry_number, short_type: typeOf(ours) } : null, long_video_projects: null, updated_at: at(0, 8),
      });
    }
  contentRows.push(...out);

  // ---- Retention curves -------------------------------------------------------------------------
  const retention = [];
  for (const v of out) {
    if (v.platform !== "youtube" && v.platform !== "facebook") continue;
    const short = v.kind === "short";
    const hold = short ? (v.duration_seconds < 20 ? 0.9 : 0.76) - rnd() * 0.12 : 0.66 - rnd() * 0.1;
    const end = short ? 0.45 + rnd() * 0.5 : 0.22 + rnd() * 0.14;
    const rel = r2(0.35 + rnd() * 0.5);
    const n = v.platform === "facebook" ? 40 : 101;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const x = k / (n - 1);
      // A quick drop in the opening, then a slow slide; Shorts loop back up at the end.
      let y = x < 0.06 ? 1 - (1 - hold) * (x / 0.06) : hold - (hold - end) * Math.pow((x - 0.06) / 0.94, 0.8);
      if (!short && x > 0.38 && x < 0.44) y -= 0.05 * Math.sin(((x - 0.38) / 0.06) * Math.PI);
      if (short && x > 0.9 && v.avg_view_pct > 100) y += (x - 0.9) * 2.5;
      pts.push([r2(x * 1000) / 1000, Math.round(y * 10000) / 10000, v.platform === "youtube" ? r2(rel + (rnd() - 0.5) * 0.06) : null]);
    }
    retention.push({ team_id: TEAM, platform: v.platform, external_id: v.external_id, points: pts, updated_at: at(0, 8) });
  }

  // ---- Each video's money ----------------------------------------------------------------------
  const contentRevenue = out
    .filter((v) => v.platform === "youtube")
    .map((v) => {
      const rpm = v.kind === "long" ? 3.4 + rnd() * 1.8 : 0.08 + rnd() * 0.06;
      const revenue = r2((v.views / 1000) * rpm);
      const imp = Math.round(v.views * (v.kind === "long" ? 1.4 : 0.02));
      return { team_id: TEAM, platform: "youtube", external_id: v.external_id, revenue, ad_revenue: r2(revenue * 0.8), premium_revenue: r2(revenue * 0.12), gross_revenue: r2(revenue * 1.6), cpm: r2(5 + rnd() * 3), playback_cpm: r2(7 + rnd() * 3), ad_impressions: imp, monetized_playbacks: Math.round(imp * 0.7), currency: "USD", updated_at: at(0, 8) };
    });

  // ---- The splits -------------------------------------------------------------------------------
  const breakdowns = [];
  const B = (o) => breakdowns.push({ team_id: TEAM, external_id: "", views: null, watch_minutes: null, value: null, updated_at: at(0, 8), ...o });
  const SPLITS = {
    traffic_source: [["SHORTS", 0.52], ["SUBSCRIBER", 0.13], ["RELATED_VIDEO", 0.1], ["YT_SEARCH", 0.08], ["NO_LINK_OTHER", 0.05], ["EXT_URL", 0.03], ["PLAYLIST", 0.025], ["NOTIFICATION", 0.02], ["YT_CHANNEL", 0.02], ["END_SCREEN", 0.01], ["HASHTAGS", 0.005]],
    device: [["MOBILE", 0.79], ["TV", 0.09], ["DESKTOP", 0.08], ["TABLET", 0.04]],
    os: [["ANDROID", 0.56], ["IOS", 0.3], ["WINDOWS", 0.06], ["MACINTOSH", 0.03], ["TIZEN", 0.02], ["WEBOS", 0.015], ["LINUX", 0.005]],
    playback_location: [["SHORTS", 0.53], ["BROWSE", 0.2], ["WATCH", 0.16], ["SEARCH", 0.05], ["CHANNEL", 0.04], ["EMBEDDED", 0.01], ["EXTERNAL_APP", 0.01]],
    subscribed: [["UNSUBSCRIBED", 0.79, 49], ["SUBSCRIBED", 0.21, 64]],
    product: [["CORE", 0.968], ["UNKNOWN", 0.022], ["KIDS", 0.01]],
  };
  for (const r of daily) {
    if (r.platform !== "youtube" || r.content !== "all" || !r.views) continue;
    for (const [dim, list] of Object.entries(SPLITS))
      for (const [key, share, value] of list) {
        const v = Math.round(r.views * share * (0.85 + rnd() * 0.3));
        B({ platform: "youtube", dimension: dim, key, day: r.day, span: 1, views: v, watch_minutes: Math.round(v * (key === "TV" || key === "WATCH" || key === "SUBSCRIBER" ? 2.4 : 0.45)), value: value ? r1(value + (rnd() - 0.5) * 6) : null });
      }
  }
  const end = day(LAST_DAY);
  const SEARCH = ["street food cluj", "mancare ieftina bucuresti", "viverro", "tiny house romania", "cel mai bun covrig", "romanian food", "street food romania", "cafea 1 dolar", "night market iasi", "reteta sarmale", "pastry ranking", "cheap lunch cluj", "fake vs real coffee", "bakery 4am", "food tour romania"];
  const SITES = ["google.com", "facebook.com", "reddit.com/r/romania", "instagram.com", "tiktok.com", "whatsapp.com", "wikipedia.org", "duckduckgo.com"];
  const SUGG = [["xA1bC2dE3fG", "Romanian Street Food Tour · Food Ranger"], ["hJ4kL5mN6oP", "I Tried Every Bakery in Paris · Joel Hansen"], ["qR7sT8uV9wX", "Cheapest Food in Eastern Europe · Best Ever Food"], ["yZ0aB1cD2eF", "Bucharest on $20 · Kara and Nate"], ["gH3iJ4kL5mN", "Tiny Homes of Europe · Living Big"]];
  const PLAYLISTS = [["PLvA1", "Street food (all episodes)"], ["PLvA2", "Cheap eats"], ["PLvA3", "Tiny homes"]];
  for (const span of [7, 28, 90, 365]) {
    const k = span / 28;
    SEARCH.forEach((t, i) => B({ platform: "youtube", dimension: "search_term", key: t, day: end, span, views: Math.round((2600 / (i + 1)) * k * (0.8 + rnd() * 0.4)), watch_minutes: Math.round((900 / (i + 1)) * k) }));
    SITES.forEach((t, i) => B({ platform: "youtube", dimension: "external_site", key: t, day: end, span, views: Math.round((1400 / (i + 1)) * k), watch_minutes: Math.round((500 / (i + 1)) * k) }));
    SUGG.forEach(([id, name], i) => B({ platform: "youtube", dimension: "suggested_by", key: `${id}|${name}`, day: end, span, views: Math.round((3100 / (i + 1)) * k), watch_minutes: Math.round((2600 / (i + 1)) * k) }));
    PLAYLISTS.forEach(([id, name], i) => B({ platform: "youtube", dimension: "playlist", key: `${id}|${name}`, day: end, span, views: Math.round((900 / (i + 1)) * k), watch_minutes: Math.round((1900 / (i + 1)) * k) }));
    const AG = [["age13-17", 2.1, 1.6], ["age18-24", 12.4, 8.9], ["age25-34", 19.8, 13.1], ["age35-44", 12.2, 8.4], ["age45-54", 7.1, 5.2], ["age55-64", 3.4, 3.1], ["age65-", 1.5, 1.2]];
    for (const [age, m, f] of AG) {
      B({ platform: "youtube", dimension: "age_gender", key: `${age}|male`, day: end, span, value: r2(m * (0.95 + rnd() * 0.1)) });
      B({ platform: "youtube", dimension: "age_gender", key: `${age}|female`, day: end, span, value: r2(f * (0.95 + rnd() * 0.1)) });
    }
    B({ platform: "youtube", dimension: "age_gender", key: "age25-34|user_specified", day: end, span, value: 0.4 });
    [["WHATS_APP", 0.41], ["COPY_PASTE", 0.19], ["FACEBOOK_MESSENGER", 0.12], ["INSTAGRAM", 0.09], ["TELEGRAM", 0.05], ["FACEBOOK", 0.04], ["OTHER", 0.1]].forEach(([key, s]) => B({ platform: "youtube", dimension: "sharing", key, day: end, span, value: Math.round(4200 * k * s) }));
    [["SHORTS|SHORTS", 0.71], ["SHORTS|SUBSCRIBER", 0.08], ["SHORTS|YT_SEARCH", 0.06], ["SHORTS|NO_LINK_OTHER", 0.05], ["SHORTS|HASHTAGS", 0.02], ["VIDEO_ON_DEMAND|RELATED_VIDEO", 0.32], ["VIDEO_ON_DEMAND|SUBSCRIBER", 0.29], ["VIDEO_ON_DEMAND|YT_SEARCH", 0.16], ["VIDEO_ON_DEMAND|EXT_URL", 0.08], ["VIDEO_ON_DEMAND|PLAYLIST", 0.06], ["VIDEO_ON_DEMAND|END_SCREEN", 0.04]].forEach(([key, s]) =>
      B({ platform: "youtube", dimension: "traffic_by_type", key, day: end, span, views: Math.round(380000 * k * s * (key.startsWith("SHORTS") ? 1 : 0.35)), watch_minutes: Math.round(380000 * k * s * (key.startsWith("SHORTS") ? 0.4 : 1.6)) })
    );
  }
  // Instagram: the last 7 and 28 days, and who the audience is.
  for (const span of [7, 28]) {
    const k = span / 28;
    [["NON_FOLLOWER", 0.67], ["FOLLOWER", 0.33]].forEach(([key, s]) => B({ platform: "instagram", dimension: "viewer_type", key, day: end, span, value: Math.round(190000 * k * s) }));
    [["REEL", 0.81], ["STORY", 0.11], ["CAROUSEL_CONTAINER", 0.05], ["POST", 0.03]].forEach(([key, s]) => B({ platform: "instagram", dimension: "content_type", key, day: end, span, value: Math.round(190000 * k * s) }));
    [["REEL", 0.86], ["CAROUSEL_CONTAINER", 0.08], ["POST", 0.04], ["STORY", 0.02]].forEach(([key, s]) => B({ platform: "instagram", dimension: "interactions_by_type", key, day: end, span, value: Math.round(13000 * k * s) }));
    [["FOLLOWER", 0.8], ["NON_FOLLOWER", 0.2]].forEach(([key, s]) => B({ platform: "instagram", dimension: "follows", key, day: end, span, value: Math.round(2100 * k * s) }));
  }
  const IGD = {
    follower_age: [["18-24", 9800], ["25-34", 21400], ["35-44", 15800], ["45-54", 8100], ["55-64", 3900], ["65+", 1500], ["13-17", 900]],
    follower_gender: [["F", 33600], ["M", 26200], ["U", 1800]],
    follower_city: [["Bucharest, Romania", 14200], ["Cluj-Napoca, Romania", 6100], ["Iași, Romania", 4300], ["Timișoara, Romania", 3900], ["Chișinău, Moldova", 3100], ["Brașov, Romania", 2700], ["Constanța, Romania", 2100], ["Craiova, Romania", 1800]],
    engaged_age: [["18-24", 2100], ["25-34", 4300], ["35-44", 2600], ["45-54", 1100], ["55-64", 400]],
    engaged_gender: [["F", 6100], ["M", 4200], ["U", 200]],
    engaged_country: [["RO", 7600], ["MD", 1300], ["IT", 520], ["ES", 400], ["DE", 310], ["GB", 260]],
    engaged_city: [["Bucharest, Romania", 2600], ["Cluj-Napoca, Romania", 1100], ["Iași, Romania", 800], ["Chișinău, Moldova", 700]],
  };
  for (const [dim, list] of Object.entries(IGD)) for (const [key, value] of list) B({ platform: "instagram", dimension: dim, key, day: end, span: 0, value });
  // Each of the 12 newest YouTube videos: its own traffic and searches.
  for (const v of out.filter((x) => x.platform === "youtube").slice(0, 12)) {
    const short = v.kind === "short";
    (short ? [["SHORTS", 0.78], ["SUBSCRIBER", 0.07], ["YT_SEARCH", 0.06], ["NO_LINK_OTHER", 0.05], ["HASHTAGS", 0.04]] : [["RELATED_VIDEO", 0.34], ["SUBSCRIBER", 0.28], ["YT_SEARCH", 0.17], ["EXT_URL", 0.09], ["PLAYLIST", 0.07], ["END_SCREEN", 0.05]]).forEach(([key, s]) =>
      breakdowns.push({ team_id: TEAM, platform: "youtube", external_id: v.external_id, dimension: "traffic_source", key, day: end, span: 0, views: Math.round(v.views * s), watch_minutes: Math.round(v.views * s * 0.5), value: null, updated_at: at(0, 8) })
    );
    SEARCH.slice(0, 5).forEach((t, i) => breakdowns.push({ team_id: TEAM, platform: "youtube", external_id: v.external_id, dimension: "search_term", key: t, day: end, span: 0, views: Math.round((v.views * 0.06) / (i + 1)), watch_minutes: null, value: null, updated_at: at(0, 8) }));
  }

  // ---- Hooks in the scripts of the first 16 shorts -------------------------------------------------
  const scripts = shorts.slice(1, 16).map((s, i) => ({
    id: `dd100000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, team_id: TEAM, short_video_id: s.id, long_video_id: null, kind: "script", name: "Script", position: 1, step: "write", version: 2, updated_at: at(-10 + i * 0.3), updated_by: null,
    word_count: 60, content_text: `Hook\n${HOOKS[i % HOOKS.length]}\nBody\nWe go through it step by step, with prices on screen.\nCall to action\nFollow for part two.`, content: { type: "doc", content: [] }, editor: null,
  }));

  return { breakdowns, retention, contentRevenue, scripts };
};
