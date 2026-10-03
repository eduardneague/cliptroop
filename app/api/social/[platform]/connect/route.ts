import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS, isSocialPlatform, redirectUriFor } from "@/lib/social/providers";
import { requireSocialManager } from "@/lib/social/access";
import { socialKeyConfigured } from "@/lib/social/crypto";
import { POPUP_COOKIE } from "@/lib/social/popup";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64url = (b: Buffer) => b.toString("base64url");

/**
 * Start connecting an account: check the person may, remember a one-time
 * random "state" (+ PKCE for Google), send them to the platform.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const teamId = request.nextUrl.searchParams.get("team") ?? "";
  const popup = request.nextUrl.searchParams.get("popup") === "1";
  // In its own window, problems still end on the accounts tab (that window shows it).
  const back = (q: string) => NextResponse.redirect(new URL(`/team?tab=accounts&${q}#connected-accounts`, request.url));

  if (!isSocialPlatform(platform) || !UUID.test(teamId)) return back("social_error=bad_request");
  const provider = PROVIDERS[platform];
  if (!provider.configured() || !socialKeyConfigured()) return back(`social_error=not_configured&platform=${platform}`);

  const access = await requireSocialManager(teamId);
  if (!access.user) return NextResponse.redirect(new URL("/login", request.url));
  if (!access.ok) return back(`social_error=forbidden&platform=${platform}`);

  const state = b64url(randomBytes(32));
  // 48 random bytes → 64 URL-safe characters (TikTok and the standard
  // both allow 43–128 of [A-Za-z0-9-._~]).
  const verifier = provider.usesPkce ? b64url(randomBytes(48)) : null;
  const digest = verifier ? createHash("sha256").update(verifier).digest() : null;
  // Google: standard base64url. TikTok: its own variant, hex.
  const challenge = digest ? (provider.pkceEncoding === "hex" ? digest.toString("hex") : b64url(digest)) : null;

  const admin = createAdminClient();
  // Tidy up abandoned attempts, then remember this one.
  await admin.from("oauth_states").delete().lt("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
  const { error } = await admin
    .from("oauth_states")
    .insert({ state, team_id: teamId, platform, user_id: access.user.id, code_verifier: verifier });
  if (error) return back(`social_error=failed&platform=${platform}`);

  const url = provider.authorizeUrl({ state, challenge, redirectUri: redirectUriFor(platform, request.nextUrl.origin) });
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "private, no-store");
  // Remember (15 min) that the callback should answer this window, not navigate the app.
  res.cookies.set(POPUP_COOKIE, popup ? "1" : "", {
    path: "/api/social",
    maxAge: popup ? 15 * 60 : 0,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return res;
}
