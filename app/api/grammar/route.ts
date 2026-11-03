import { getCachedUser } from "@/lib/supabase/get-user";
import { overLimit } from "@/lib/rate-limit";
import { DISABLED_RULES } from "@/modules/scripts/grammar/languagetool";

/*
 * Writing suggestions (1.23.0).
 *   GET  /api/grammar → { via }: "app" when this app has its own
 *        LanguageTool (LANGUAGETOOL_URL for one you run yourself, or
 *        LANGUAGETOOL_USERNAME + LANGUAGETOOL_API_KEY for a LanguageTool
 *        account), else "public" (browsers ask LanguageTool's free service
 *        themselves, each with its own allowance).
 *   POST /api/grammar { text, language, picky } → LanguageTool's answer,
 *        with the app's own keys (which never reach the browser).
 */

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function setup() {
  const url = (process.env.LANGUAGETOOL_URL ?? "").trim().replace(/\/+$/, "");
  const username = (process.env.LANGUAGETOOL_USERNAME ?? "").trim();
  const apiKey = (process.env.LANGUAGETOOL_API_KEY ?? "").trim();
  if (url && /^https?:\/\//i.test(url)) return { url: /\/v2$/.test(url) ? url : `${url}/v2`, username, apiKey };
  if (username && apiKey) return { url: "https://api.languagetoolplus.com/v2", username, apiKey };
  return null;
}

// A few checks a second per person is plenty (per server instance; 1.31.13: the shared limiter).
const tooMany = (user: string) => overLimit("grammar", user, 90, 60_000);

const LANGUAGE = /^(auto|[a-z]{2,3}(-[A-Z]{2})?)$/;

export async function GET() {
  const user = await getCachedUser();
  if (!user) return json({ error: "Sign in first." }, 401);
  return json({ via: setup() ? "app" : "public" });
}

export async function POST(req: Request) {
  const user = await getCachedUser();
  if (!user) return json({ error: "Sign in first." }, 401);
  const lt = setup();
  if (!lt) return json({ error: "This app has no LanguageTool of its own." }, 404);
  if (tooMany(user.id)) return json({ error: "Too many checks. Wait a moment." }, 429);

  let input: { text?: unknown; language?: unknown; picky?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  const text = typeof input.text === "string" ? input.text : "";
  if (!text.trim()) return json({ matches: [] });
  if (text.length > 20_000) return json({ error: "Too much text at once." }, 413);
  const language = typeof input.language === "string" && LANGUAGE.test(input.language) ? input.language : "auto";

  const body = new URLSearchParams({ text, language, enabledOnly: "false", disabledRules: DISABLED_RULES.join(",") });
  if (language === "auto") body.set("preferredVariants", "en-US,de-DE,pt-PT,ca-ES");
  if (input.picky === true) body.set("level", "picky");
  if (lt.username && lt.apiKey) {
    body.set("username", lt.username);
    body.set("apiKey", lt.apiKey);
  }
  try {
    const res = await fetch(`${lt.url}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 429) return json({ error: "LanguageTool is busy. Try again in a minute." }, 429);
    if (!res.ok) {
      console.error("[grammar] LanguageTool answered", res.status);
      return json({ error: "LanguageTool didn't answer." }, 502);
    }
    const data = (await res.json()) as { language?: unknown; matches?: unknown };
    return json({ language: data.language ?? null, matches: Array.isArray(data.matches) ? data.matches : [] });
  } catch (e) {
    console.error("[grammar]", e instanceof Error ? e.message : e);
    return json({ error: "LanguageTool didn't answer." }, 502);
  }
}
