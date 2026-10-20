/*
 * GET /api/weather (1.27.5): the dashboard's Weather widget, through the
 * app instead of straight from the browser to Open-Meteo. The widget broke
 * on some setups after picking a city ("Couldn't load the weather", and it
 * stayed that way): blockers and the browser's own tracking protection can
 * stop third-party calls, and one failed call was the end of it. Here the
 * server asks (twice if it has to), answers in one small shape, and the
 * same place is asked once every 15 minutes for everyone (Next's data cache).
 * Signed in only (the middleware).
 *
 *   ?lat=&lon=&units=c|f   now and the next 7 days
 *   ?q=London              cities for the widget's settings
 */

const HEADERS = { "Cache-Control": "private, max-age=300" };
const fail = (error: string, status = 502) => Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

type Forecast = {
  current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number; is_day?: number };
  daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[] };
};
type Geo = { results?: { name?: string; country?: string; admin1?: string; latitude?: number; longitude?: number }[] };

async function ask<T>(url: string, revalidate: number): Promise<T | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(6000), headers: { Accept: "application/json" } });
      if (r.ok) return (await r.json()) as T;
      // A wrong question won't get better by asking again.
      if (r.status >= 400 && r.status < 500 && r.status !== 429) return null;
    } catch {
      /* timed out or the network: once more */
    }
    await new Promise((res) => setTimeout(res, 350));
  }
  return null;
}

const num = (v: string | null, min: number, max: number) => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  // Cities, for the settings.
  if (q.has("q")) {
    const name = (q.get("q") ?? "").trim().slice(0, 80);
    if (name.length < 2) return Response.json({ results: [] }, { headers: HEADERS });
    const g = await ask<Geo>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=en&format=json`, 86_400);
    if (!g) return fail("Couldn't search for cities right now. Try again in a moment.");
    const results = (g.results ?? [])
      .filter((h) => typeof h.name === "string" && typeof h.latitude === "number" && typeof h.longitude === "number")
      .map((h) => ({ name: h.name!, region: [h.admin1, h.country].filter(Boolean).join(", "), lat: h.latitude!, lon: h.longitude! }));
    return Response.json({ results }, { headers: HEADERS });
  }

  const lat = num(q.get("lat"), -90, 90);
  const lon = num(q.get("lon"), -180, 180);
  if (lat === null || lon === null) return fail("Pick a city.", 400);
  const f = q.get("units") === "f";
  // About a kilometre: people in the same city share one answer.
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
    "&current=temperature_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=8" +
    (f ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "");
  const j = await ask<Forecast>(url, 900);
  const c = j?.current;
  const d = j?.daily;
  if (!c || typeof c.temperature_2m !== "number" || !Array.isArray(d?.time)) return fail("The weather service didn't answer. Try again in a minute.");
  return Response.json(
    {
      temp: Math.round(c.temperature_2m),
      code: Number(c.weather_code ?? 0),
      wind: Math.round(Number(c.wind_speed_10m ?? 0)),
      isDay: c.is_day !== 0,
      days: d!.time!.map((date, i) => ({
        date,
        max: Math.round(Number(d!.temperature_2m_max?.[i] ?? 0)),
        min: Math.round(Number(d!.temperature_2m_min?.[i] ?? 0)),
        code: Number(d!.weather_code?.[i] ?? 0),
      })),
    },
    { headers: HEADERS }
  );
}
