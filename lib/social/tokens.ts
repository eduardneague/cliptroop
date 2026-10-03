import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotifications } from "@/lib/notify";
import { decryptToken, encryptToken } from "./crypto";
import { PROVIDERS, ProviderError, type SocialPlatform, type TokenSet } from "./providers";

type Row = {
  id: string;
  team_id: string;
  platform: SocialPlatform;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  username: string | null;
  display_name: string | null;
};

export async function logSocial(
  teamId: string,
  platform: string,
  action: "connected" | "reconnected" | "disconnected" | "refresh_failed" | "refreshed" | "refused_taken",
  actorId: string | null,
  detail: Record<string, unknown> = {}
) {
  await createAdminClient().from("social_audit_log").insert({ team_id: teamId, platform, action, actor_id: actorId, detail });
}

function tokenColumns(t: TokenSet) {
  return {
    access_token_enc: encryptToken(t.accessToken),
    refresh_token_enc: t.refreshToken ? encryptToken(t.refreshToken) : null,
    token_expires_at: t.expiresAt?.toISOString() ?? null,
    refresh_expires_at: t.refreshExpiresAt?.toISOString() ?? null,
  };
}

async function refreshRow(row: Row, reason: string): Promise<string> {
  const admin = createAdminClient();
  const provider = PROVIDERS[row.platform];
  try {
    const t = await provider.refresh({
      accessToken: decryptToken(row.access_token_enc),
      refreshToken: row.refresh_token_enc ? decryptToken(row.refresh_token_enc) : null,
    });
    await admin
      .from("social_accounts")
      .update({
        ...tokenColumns({ ...t, refreshToken: t.refreshToken ?? (row.refresh_token_enc ? decryptToken(row.refresh_token_enc) : null) }),
        status: "active",
        last_error: null,
        last_refreshed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await logSocial(row.team_id, row.platform, "refreshed", null, { reason });
    return t.accessToken;
  } catch (e) {
    const message = e instanceof ProviderError ? e.message : "The platform didn't accept the refresh.";
    await admin.from("social_accounts").update({ status: "needs_reconnect", last_error: message }).eq("id", row.id);
    await logSocial(row.team_id, row.platform, "refresh_failed", null, { reason, message });
    // Tell the masters so posting doesn't silently stop.
    const { data: masters } = await admin
      .from("team_members")
      .select("user_id, member_roles!inner(role)")
      .eq("team_id", row.team_id)
      .eq("status", "active")
      .eq("member_roles.role", "master");
    const who = row.username ? `@${row.username}` : row.display_name ?? PROVIDERS[row.platform].name;
    await Promise.all(
      (masters ?? [])
        .map((m) => m.user_id as string | null)
        .filter(Boolean)
        .map((uid) =>
          sendNotifications({
            recipient_id: uid!,
            kind: "social_reconnect",
            metadata: { platform: row.platform, account: who },
            body: `${PROVIDERS[row.platform].name} (${who}) needs reconnecting. Go to Team → Connected accounts.`,
          })
        )
    );
    throw new ProviderError(`${PROVIDERS[row.platform].name} needs reconnecting: ${message}`);
  }
}

const SELECT =
  "id, team_id, platform, access_token_enc, refresh_token_enc, token_expires_at, refresh_expires_at, username, display_name";

/** A valid access token for posting (refreshed first if it's about to expire). */
export async function getAccessToken(accountId: string): Promise<string> {
  const { data } = await createAdminClient().from("social_accounts").select(SELECT).eq("id", accountId).maybeSingle();
  if (!data) throw new ProviderError("That account isn't connected anymore.");
  const row = data as Row;
  const exp = row.token_expires_at ? Date.parse(row.token_expires_at) : Infinity;
  if (exp - Date.now() < 5 * 60_000) return refreshRow(row, "before use");
  return decryptToken(row.access_token_enc);
}

/**
 * Daily upkeep: Instagram tokens last 60 days and must be refreshed
 * before then; TikTok refresh tokens last a year. Google refreshes on use.
 */
export async function refreshExpiring(): Promise<{ refreshed: number; failed: number }> {
  const admin = createAdminClient();
  const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const { data: ig } = await admin.from("social_accounts").select(SELECT).eq("platform", "instagram").eq("status", "active").lt("token_expires_at", soon(10));
  const { data: tt } = await admin.from("social_accounts").select(SELECT).eq("platform", "tiktok").eq("status", "active").lt("refresh_expires_at", soon(30));
  let refreshed = 0;
  let failed = 0;
  for (const row of [...(ig ?? []), ...(tt ?? [])] as Row[]) {
    try {
      await refreshRow(row, "daily upkeep");
      refreshed++;
    } catch {
      failed++;
    }
  }
  return { refreshed, failed };
}
