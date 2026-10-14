// Analytics' realtime (1.19.0, migration 0083): the counts the 10-minute job keeps
// (analytics_live) around the real "now", and the two sums the database makes of them
// (analytics_live_hours, analytics_live_gains), worked out the same way: a change between
// two looks spread evenly over the time between them.
//   MOCK_LIVE=0       no counts yet (Realtime waits for its first reads)
//   MOCK_LIVE_FRESH=1 realtime started 3 hours ago (the 48 hours fill in)
const HOUR = 3600e3;

module.exports.liveFixtures = function liveFixtures({ TEAM, contentRows }) {
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const now = Date.now();
  const rows = [];
  if (process.env.MOCK_LIVE === "0") return { rows, hours: () => [], gains: () => [], buckets: () => [] };
  const start = now - (process.env.MOCK_LIVE_FRESH ? 3 : 56) * HOUR;
  // The busiest videos: read every 10 minutes; the others every 3 hours.
  const hot = contentRows.filter((c) => c.views).slice(0, 9);
  const rest = contentRows.filter((c) => c.views && !hot.includes(c)).slice(0, 30);
  const curve = (t) => 0.55 + 0.45 * Math.sin(((t / HOUR) % 24) / 24 * Math.PI * 2 - 1.2); // a daily rhythm
  for (const [list, every] of [[hot, 10 * 60e3], [rest, 3 * HOUR]]) {
    list.forEach((c, k) => {
      const perHour = Math.max(3, Math.round((c.views / 900) * (list === hot ? 1.6 - k * 0.12 : 0.25)));
      let views = Math.max(0, c.views - perHour * 60);
      let likes = Math.max(0, (c.likes ?? 0) - Math.round(perHour * 2));
      let comments = Math.max(0, (c.comments ?? 0) - Math.round(perHour / 20));
      // Aligned like the timer (:05, :15…).
      for (let t = Math.ceil((start - 5 * 60e3) / every) * every + 5 * 60e3; t <= now; t += every) {
        const gain = Math.round(perHour * (every / HOUR) * curve(t) * (0.7 + 0.6 * rnd()));
        views += gain;
        likes += Math.round(gain * 0.035);
        comments += rnd() < 0.3 ? 1 : 0;
        rows.push({ team_id: TEAM, platform: c.platform, external_id: c.external_id, at: new Date(t).toISOString(), views, likes, comments, shares: null });
      }
    });
  }
  const steps = (team) => {
    const by = new Map();
    for (const r of rows) {
      if (r.team_id !== team) continue;
      const k = `${r.platform}|${r.external_id}`;
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    const out = [];
    for (const list of by.values()) {
      list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      for (let i = 1; i < list.length; i++) {
        const a = Date.parse(list[i - 1].at);
        const b = Date.parse(list[i].at);
        if (b <= a) continue;
        out.push({ platform: list[i].platform, external_id: list[i].external_id, a, b, dv: Math.max(0, list[i].views - list[i - 1].views), dl: Math.max(0, list[i].likes - list[i - 1].likes), dc: Math.max(0, list[i].comments - list[i - 1].comments) });
      }
    }
    return out;
  };
  const part = (s, from, to) => {
    const lo = Math.max(s.a, from);
    const hi = Math.min(s.b, to);
    return hi > lo ? (hi - lo) / (s.b - s.a) : 0;
  };
  return {
    rows,
    hours: (b) => {
      const since = Date.now() - Math.min(192, Math.max(1, b.p_hours ?? 48)) * HOUR;
      const sums = new Map();
      for (const s of steps(b.p_team)) {
        if (s.b <= since) continue;
        for (let h = Math.floor(Math.max(s.a, since) / HOUR) * HOUR; h < s.b; h += HOUR) {
          const f = part(s, Math.max(h, since), h + HOUR);
          if (f <= 0) continue;
          const k = `${h}|${s.platform}`;
          const cur = sums.get(k) ?? { hour: new Date(h).toISOString(), platform: s.platform, views: 0, likes: 0, comments: 0 };
          cur.views += s.dv * f;
          cur.likes += s.dl * f;
          cur.comments += s.dc * f;
          sums.set(k, cur);
        }
      }
      return [...sums.values()].map((x) => ({ ...x, views: Math.round(x.views), likes: Math.round(x.likes), comments: Math.round(x.comments) })).sort((x, y) => x.hour.localeCompare(y.hour));
    },
    // 0084: views per `p_step`-minute slot over the last `p_minutes` (the slots end now).
    buckets: (b) => {
      const step = Math.min(60, Math.max(1, b.p_step ?? 10)) * 60e3;
      const count = Math.min(Math.ceil(Math.max(1, b.p_minutes ?? 60) / (step / 60e3)), Math.floor(2880 / (step / 60e3)));
      const first = Date.now() - count * step;
      const sums = new Map();
      for (const s of steps(b.p_team)) {
        if (s.b <= first) continue;
        for (let t = first + Math.floor((Math.max(s.a, first) - first) / step) * step; t < s.b; t += step) {
          const f = part(s, Math.max(t, first), t + step);
          if (f <= 0) continue;
          const k = `${t}|${s.platform}`;
          const cur = sums.get(k) ?? { at: new Date(t).toISOString(), platform: s.platform, views: 0, likes: 0, comments: 0 };
          cur.views += s.dv * f;
          cur.likes += s.dl * f;
          cur.comments += s.dc * f;
          sums.set(k, cur);
        }
      }
      return [...sums.values()].map((x) => ({ ...x, views: Math.round(x.views), likes: Math.round(x.likes), comments: Math.round(x.comments) })).sort((x, y) => x.at.localeCompare(y.at));
    },
    gains: (b) => {
      const since = Date.now() - Math.min(11520, Math.max(1, b.p_minutes ?? 2880)) * 60e3;
      const sums = new Map();
      for (const s of steps(b.p_team)) {
        const f = part(s, since, Infinity);
        if (f <= 0) continue;
        const k = `${s.platform}|${s.external_id}`;
        const cur = sums.get(k) ?? { platform: s.platform, external_id: s.external_id, views: 0, likes: 0, comments: 0 };
        cur.views += s.dv * f;
        cur.likes += s.dl * f;
        cur.comments += s.dc * f;
        sums.set(k, cur);
      }
      return [...sums.values()].map((x) => ({ ...x, views: Math.round(x.views), likes: Math.round(x.likes), comments: Math.round(x.comments) }));
    },
  };
};
