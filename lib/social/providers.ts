import "server-only";

/**
 * Sign-in ("OAuth") for each platform: where to send the person, how to
 * swap the returned code for tokens, how to read the account, refresh
 * and revoke. Official endpoints only.
 *
 * Environment (server only):
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET          (YouTube)
 *   INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET          (Instagram API with Instagram Login)
 *   TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET         (TikTok Login Kit + Content Posting)
 */

export const PLATFORMS = ["youtube", "instagram", "tiktok"] as const;
export type SocialPlatform = (typeof PLATFORMS)[number];
export const isSocialPlatform = (p: unknown): p is SocialPlatform =>
  typeof p === "string" && (PLATFORMS as readonly string[]).includes(p);

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  scopes: string[];
};
export type AccountProfile = {
  externalId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export class ProviderError extends Error {}

/*
 * Analytics ("stats") permissions, asked for on top of posting. Which
 * platforms ask for them is set in SOCIAL_STATS_PLATFORMS (comma list,
 * default "youtube"): a platform's developer app must have these
 * permissions turned on first, or its sign-in fails. Instagram:
 * instagram_business_manage_insights. TikTok: user.info.stats + video.list.
 * Accounts connected before need to be reconnected once to get them.
 */
export const STATS_SCOPES: Record<SocialPlatform, string[]> = {
  youtube: ["https://www.googleapis.com/auth/yt-analytics.readonly", "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"],
  instagram: ["instagram_business_manage_insights"],
  tiktok: ["user.info.stats", "video.list"],
};
export function statsEnabled(p: SocialPlatform) {
  const raw = process.env.SOCIAL_STATS_PLATFORMS ?? "youtube";
  return raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .includes(p);
}
/** This account's sign-in includes the analytics permissions (the revenue one isn't required). */
export function hasStatsScopes(p: SocialPlatform, scopes: string[]) {
  const need = p === "youtube" ? [STATS_SCOPES.youtube[0]] : STATS_SCOPES[p];
  return need.every((s) => scopes.includes(s));
}
const withStats = (p: SocialPlatform, base: string[]) => (statsEnabled(p) ? [...base, ...STATS_SCOPES[p]] : base);

type Provider = {
  name: string;
  configured: () => boolean;
  /** PKCE: Google (standard base64url) and TikTok (hex; TikTok's own
      variant, now required for web too). Instagram relies on `state`. */
  usesPkce: boolean;
  pkceEncoding?: "base64url" | "hex";
  authorizeUrl: (a: { state: string; challenge: string | null; redirectUri: string }) => string;
  exchange: (a: { code: string; verifier: string | null; redirectUri: string }) => Promise<TokenSet>;
  profile: (accessToken: string) => Promise<AccountProfile>;
  refresh: (a: { accessToken: string; refreshToken: string | null }) => Promise<TokenSet>;
  revoke: (a: { accessToken: string; refreshToken: string | null }) => Promise<void>;
};

const env = (k: string) => process.env[k] ?? "";
const inSeconds = (s: unknown) => (typeof s === "number" && s > 0 ? new Date(Date.now() + s * 1000) : null);

async function call(url: string, init: RequestInit & { form?: Record<string, string> } = {}) {
  const { form, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    ...(form
      ? {
          method: rest.method ?? "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", ...(rest.headers ?? {}) },
          body: new URLSearchParams(form).toString(),
        }
      : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* some endpoints (revoke) return no JSON */
  }
  if (!res.ok) {
    const msg =
      (body.error_description as string) ||
      ((body.error as { message?: string })?.message ?? (typeof body.error === "string" ? body.error : "")) ||
      `HTTP ${res.status}`;
    throw new ProviderError(msg);
  }
  return body;
}

// ---------------------------------------------------------------------------
// YouTube (Google)
// ---------------------------------------------------------------------------

// upload: post videos. force-ssl: change a scheduled video's time or
// delete it before it goes live (also covers reading the channel).
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];
export const YOUTUBE_EDIT_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

const youtube: Provider = {
  name: "YouTube",
  configured: () => !!env("GOOGLE_CLIENT_ID") && !!env("GOOGLE_CLIENT_SECRET"),
  usesPkce: true,
  authorizeUrl: ({ state, challenge, redirectUri }) =>
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: withStats("youtube", GOOGLE_SCOPES).join(" "),
      access_type: "offline", // gives a refresh token
      prompt: "consent", // …every time, so reconnecting always works
      include_granted_scopes: "true",
      state,
      ...(challenge ? { code_challenge: challenge, code_challenge_method: "S256" } : {}),
    }),
  exchange: async ({ code, verifier, redirectUri }) => {
    const t = await call("https://oauth2.googleapis.com/token", {
      form: {
        client_id: env("GOOGLE_CLIENT_ID"),
        client_secret: env("GOOGLE_CLIENT_SECRET"),
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        ...(verifier ? { code_verifier: verifier } : {}),
      },
    });
    return {
      accessToken: String(t.access_token),
      refreshToken: (t.refresh_token as string) ?? null,
      expiresAt: inSeconds(t.expires_in),
      refreshExpiresAt: null,
      scopes: String(t.scope ?? "").split(" ").filter(Boolean),
    };
  },
  profile: async (accessToken) => {
    const r = await call("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ch = (r.items as { id: string; snippet: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }[] | undefined)?.[0];
    if (!ch) throw new ProviderError("This Google account doesn't have a YouTube channel.");
    return {
      externalId: ch.id,
      displayName: ch.snippet.title ?? null,
      username: ch.snippet.customUrl ?? null,
      avatarUrl: ch.snippet.thumbnails?.default?.url ?? null,
    };
  },
  refresh: async ({ refreshToken }) => {
    if (!refreshToken) throw new ProviderError("No refresh token. Reconnect the account.");
    const t = await call("https://oauth2.googleapis.com/token", {
      form: {
        client_id: env("GOOGLE_CLIENT_ID"),
        client_secret: env("GOOGLE_CLIENT_SECRET"),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      },
    });
    return {
      accessToken: String(t.access_token),
      refreshToken: (t.refresh_token as string) ?? refreshToken, // Google usually keeps the old one
      expiresAt: inSeconds(t.expires_in),
      refreshExpiresAt: null,
      scopes: String(t.scope ?? "").split(" ").filter(Boolean),
    };
  },
  revoke: async ({ accessToken, refreshToken }) => {
    await call("https://oauth2.googleapis.com/revoke", { form: { token: refreshToken ?? accessToken } });
  },
};

// ---------------------------------------------------------------------------
// Instagram (Instagram API with Instagram Login; Business / Creator accounts)
// ---------------------------------------------------------------------------

const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

const instagram: Provider = {
  name: "Instagram",
  configured: () => !!env("INSTAGRAM_APP_ID") && !!env("INSTAGRAM_APP_SECRET"),
  usesPkce: false,
  authorizeUrl: ({ state, redirectUri }) =>
    "https://www.instagram.com/oauth/authorize?" +
    new URLSearchParams({
      client_id: env("INSTAGRAM_APP_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: withStats("instagram", IG_SCOPES).join(","),
      state,
    }),
  exchange: async ({ code, redirectUri }) => {
    // 1) short-lived token (1 hour)…
    const short = await call("https://api.instagram.com/oauth/access_token", {
      form: {
        client_id: env("INSTAGRAM_APP_ID"),
        client_secret: env("INSTAGRAM_APP_SECRET"),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: code.replace(/#_$/, ""),
      },
    });
    const first = (Array.isArray(short.data) ? (short.data as Record<string, unknown>[])[0] : short) ?? {};
    const shortToken = String(first.access_token ?? "");
    if (!shortToken) throw new ProviderError("Instagram didn't return a token.");
    // 2) …swapped for a long-lived one (60 days, refreshed by the daily job).
    const long = await call(
      "https://graph.instagram.com/access_token?" +
        new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: env("INSTAGRAM_APP_SECRET"), access_token: shortToken })
    );
    const perms = first.permissions;
    return {
      accessToken: String(long.access_token),
      refreshToken: null,
      expiresAt: inSeconds(long.expires_in),
      refreshExpiresAt: null,
      scopes: Array.isArray(perms) ? (perms as string[]) : String(perms ?? withStats("instagram", IG_SCOPES).join(",")).split(",").filter(Boolean),
    };
  },
  profile: async (accessToken) => {
    const r = await call(
      "https://graph.instagram.com/me?" +
        new URLSearchParams({ fields: "user_id,username,name,profile_picture_url,account_type", access_token: accessToken })
    );
    const type = String(r.account_type ?? "");
    if (type && !/business|media_creator|creator/i.test(type)) {
      throw new ProviderError("Switch this Instagram account to a Professional (Business or Creator) account first.");
    }
    return {
      externalId: String(r.user_id ?? r.id),
      displayName: (r.name as string) || null,
      username: (r.username as string) || null,
      avatarUrl: (r.profile_picture_url as string) || null,
    };
  },
  refresh: async ({ accessToken }) => {
    const t = await call(
      "https://graph.instagram.com/refresh_access_token?" + new URLSearchParams({ grant_type: "ig_refresh_token", access_token: accessToken })
    );
    return { accessToken: String(t.access_token), refreshToken: null, expiresAt: inSeconds(t.expires_in), refreshExpiresAt: null, scopes: withStats("instagram", IG_SCOPES) };
  },
  // Instagram has no revoke endpoint for this API: removing the app is
  // done in Instagram's settings. We delete our copy of the token.
  revoke: async () => {},
};

// ---------------------------------------------------------------------------
// TikTok (Login Kit v2 + Content Posting API)
// ---------------------------------------------------------------------------

const TIKTOK_SCOPES = ["user.info.basic", "video.publish"];

function tiktokTokens(t: Record<string, unknown>): TokenSet {
  return {
    accessToken: String(t.access_token),
    refreshToken: (t.refresh_token as string) ?? null,
    expiresAt: inSeconds(t.expires_in),
    refreshExpiresAt: inSeconds(t.refresh_expires_in),
    scopes: String(t.scope ?? "").split(",").filter(Boolean),
  };
}

const tiktok: Provider = {
  name: "TikTok",
  configured: () => !!env("TIKTOK_CLIENT_KEY") && !!env("TIKTOK_CLIENT_SECRET"),
  usesPkce: true,
  pkceEncoding: "hex",
  authorizeUrl: ({ state, challenge, redirectUri }) =>
    "https://www.tiktok.com/v2/auth/authorize/?" +
    new URLSearchParams({
      client_key: env("TIKTOK_CLIENT_KEY"),
      response_type: "code",
      scope: withStats("tiktok", TIKTOK_SCOPES).join(","),
      redirect_uri: redirectUri,
      state,
      ...(challenge ? { code_challenge: challenge, code_challenge_method: "S256" } : {}),
    }),
  exchange: async ({ code, verifier, redirectUri }) => {
    const t = await call("https://open.tiktokapis.com/v2/oauth/token/", {
      form: {
        client_key: env("TIKTOK_CLIENT_KEY"),
        client_secret: env("TIKTOK_CLIENT_SECRET"),
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        ...(verifier ? { code_verifier: verifier } : {}),
      },
    });
    if (t.error) throw new ProviderError(String(t.error_description ?? t.error));
    return tiktokTokens(t);
  },
  profile: async (accessToken) => {
    const r = await call("https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const u = ((r.data as { user?: Record<string, string> } | undefined)?.user ?? {}) as Record<string, string>;
    if (!u.open_id) throw new ProviderError("TikTok didn't return the account.");
    return { externalId: u.open_id, displayName: u.display_name ?? null, username: null, avatarUrl: u.avatar_url ?? null };
  },
  refresh: async ({ refreshToken }) => {
    if (!refreshToken) throw new ProviderError("No refresh token. Reconnect the account.");
    const t = await call("https://open.tiktokapis.com/v2/oauth/token/", {
      form: {
        client_key: env("TIKTOK_CLIENT_KEY"),
        client_secret: env("TIKTOK_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      },
    });
    if (t.error) throw new ProviderError(String(t.error_description ?? t.error));
    return tiktokTokens(t);
  },
  revoke: async ({ accessToken }) => {
    await call("https://open.tiktokapis.com/v2/oauth/revoke/", {
      form: { client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), token: accessToken },
    });
  },
};

export const PROVIDERS: Record<SocialPlatform, Provider> = { youtube, instagram, tiktok };

/** Where each platform sends people back to. Must match the developer app exactly. */
export function redirectUriFor(platform: SocialPlatform, origin: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/+$/, "");
  return `${base}/api/social/${platform}/callback`;
}
