// Production on its own domain: old *.vercel.app page loads move to
// NEXT_PUBLIC_APP_URL; /api, POSTs, staging and the new domain itself never move.
import { NextRequest } from "next/server";
import { canonicalRedirect } from "../lib/supabase/middleware";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const env = process.env as Record<string, string | undefined>;
const req = (url: string, method = "GET") => new NextRequest(url, { method, headers: { host: new URL(url).host } });
const where = (r: ReturnType<typeof canonicalRedirect>) => r?.headers.get("location") ?? null;

env.VERCEL_ENV = "production";
env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
ok(where(canonicalRedirect(req("https://vivplanner.vercel.app/shorts/1?doc=2"))) === "https://app.example.com/shorts/1?doc=2", "page on the old address moves, path and query kept");
ok(canonicalRedirect(req("https://vivplanner.vercel.app/x"))?.status === 308, "permanent redirect that keeps the method");
ok(canonicalRedirect(req("https://vivplanner.vercel.app/api/social/tiktok/callback?code=1")) === null, "/api never moves (callbacks, timers)");
ok(canonicalRedirect(req("https://vivplanner.vercel.app/login", "POST")) === null, "form posts never move");
ok(canonicalRedirect(req("https://app.example.com/dashboard")) === null, "the new address itself doesn't move");
ok(canonicalRedirect(req("https://www.other.com/dashboard")) === null, "only *.vercel.app moves");

env.NEXT_PUBLIC_APP_URL = "https://vivplanner.vercel.app";
ok(canonicalRedirect(req("https://vivplanner-abc123-viverro.vercel.app/dashboard")) === null, "no move while the app URL is still a vercel.app address");
env.NEXT_PUBLIC_APP_URL = "not a url";
ok(canonicalRedirect(req("https://vivplanner.vercel.app/dashboard")) === null, "a broken NEXT_PUBLIC_APP_URL does nothing");
env.NEXT_PUBLIC_APP_URL = "";
ok(canonicalRedirect(req("https://vivplanner.vercel.app/dashboard")) === null, "no NEXT_PUBLIC_APP_URL: nothing moves");

env.VERCEL_ENV = "preview";
env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
env.VERCEL_GIT_COMMIT_REF = "staging";
ok(canonicalRedirect(req("https://vplanner-git-staging-viverro.vercel.app/dashboard")) === null, "staging without STAGING_URL never moves (and never to production)");
env.STAGING_URL = "https://staging.example.com";
ok(where(canonicalRedirect(req("https://vplanner-git-staging-viverro.vercel.app/dashboard"))) === "https://staging.example.com/dashboard", "staging moves to STAGING_URL");
ok(canonicalRedirect(req("https://staging.example.com/dashboard")) === null, "staging's own domain doesn't move");
env.VERCEL_GIT_COMMIT_REF = "feature-x";
ok(canonicalRedirect(req("https://vplanner-git-feature-x-viverro.vercel.app/dashboard")) === null, "other previews never move");

if (fails) process.exit(1);
console.log("canonical redirect ok");
