import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS, ProviderError, isSocialPlatform, redirectUriFor } from "@/lib/social/providers";
import { requireSocialManager } from "@/lib/social/access";
import { encryptToken } from "@/lib/social/crypto";
import { logSocial } from "@/lib/social/tokens";

export const dynamic = "force-dynamic";

/**
 * The platform sends the person back here. We only accept it if the
 * "state" is ours, fresh (15 min), used once, and belongs to the same
 * signed-in person, who must still be a master or scheduler.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const q = request.nextUrl.searchParams;
  const back = (query: string) => {
    const res = NextResponse.redirect(new URL(`/team?${query}#connected-accounts`, request.url));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };
  if (!isSocialPlatform(platform)) return back("social_error=bad_request");

  const state = q.get("state") ?? "";
  const admin = createAdminClient();
  // Single use: take it out as we read it.
  const { data: saved } = await admin
    .from("oauth_states")
    .delete()
    .eq("state", state)
    .eq("platform", platform)
    .select("team_id, user_id, code_verifier, created_at")
    .maybeSingle();
  if (!saved || Date.now() - Date.parse(saved.created_at as string) > 15 * 60_000) {
    return back(`social_error=expired&platform=${platform}`);
  }

  const access = await requireSocialManager(saved.team_id as string);
  if (!access.user || access.user.id !== saved.user_id) return back(`social_error=expired&platform=${platform}`);
  if (!access.ok) return back(`social_error=forbidden&platform=${platform}`);

  // The person pressed "Cancel" on the platform's screen.
  if (q.get("error") || !q.get("code")) return back(`social_error=cancelled&platform=${platform}`);

  const provider = PROVIDERS[platform];
  try {
    const tokens = await provider.exchange({
      code: q.get("code")!,
      verifier: (saved.code_verifier as string | null) ?? null,
      redirectUri: redirectUriFor(platform, request.nextUrl.origin),
    });
    const profile = await provider.profile(tokens.accessToken);

    const { data: existing } = await admin
      .from("social_accounts")
      .select("id")
      .eq("team_id", saved.team_id)
      .eq("platform", platform)
      .maybeSingle();

    const { error } = await admin.from("social_accounts").upsert(
      {
        team_id: saved.team_id,
        platform,
        external_id: profile.externalId,
        display_name: profile.displayName,
        username: profile.username,
        avatar_url: profile.avatarUrl,
        access_token_enc: encryptToken(tokens.accessToken),
        refresh_token_enc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        token_expires_at: tokens.expiresAt?.toISOString() ?? null,
        refresh_expires_at: tokens.refreshExpiresAt?.toISOString() ?? null,
        scopes: tokens.scopes,
        status: "active",
        last_error: null,
        connected_by: access.user.id,
        connected_at: new Date().toISOString(),
        last_refreshed_at: null,
      },
      { onConflict: "team_id,platform" }
    );
    if (error) throw new ProviderError("Couldn't save the connection.");

    await logSocial(saved.team_id as string, platform, existing ? "reconnected" : "connected", access.user.id, {
      account: profile.username ?? profile.displayName,
    });
    return back(`social=connected&platform=${platform}`);
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : "Something went wrong talking to the platform.";
    return back(`social_error=failed&platform=${platform}&message=${encodeURIComponent(msg.slice(0, 200))}`);
  }
}
