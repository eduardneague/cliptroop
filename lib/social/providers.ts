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
 *   FACEBOOK_APP_ID / FACEBOOK_APP_SECRET            (Facebook Login: Page analytics only)
 *     optional FACEBOOK_LOGIN_CONFIG_ID (Facebook Login for Business) and
 *     FACEBOOK_GRAPH_VERSION (default v23.0)
 */

export const PLATFORMS = ["youtube", "instagram", "tiktok", "facebook"] as const;
/** Platforms VPlanner posts to (Facebook is connected for analytics only). */
export const POSTING_PLATFORMS = ["youtube", "instagram", "tiktok"] as const;
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
  // Facebook is only connected for analytics: its permissions are the required ones.
  facebook: [],
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

/**
 * Boxes people must leave ticked on the platform's consent screen (Google
 * and TikTok let you untick some). Without them a connection is useless,
 * so the callback refuses it, says which ones, and keeps the old one.
 */
export const REQUIRED_SCOPES: Record<SocialPlatform, { scope: string; label: string }[]> = {
  youtube: [
    { scope: "https://www.googleapis.com/auth/youtube.upload", label: "Manage your YouTube videos (upload)" },
    { scope: "https://www.googleapis.com/auth/youtube.force-ssl", label: "See, edit and delete your YouTube videos (change or cancel scheduled ones)" },
  ],
  instagram: [
    { scope: "instagram_business_basic", label: "Access your profile" },
    { scope: "instagram_business_content_publish", label: "Publish content" },
  ],
  tiktok: [
    { scope: "user.info.basic", label: "Read your profile info" },
    { scope: "video.publish", label: "Post content to TikTok" },
  ],
  facebook: [
    { scope: "pages_show_list", label: "Show a list of the Pages you manage" },
    { scope: "pages_read_engagement", label: "Read content posted on the Page" },
    { scope: "read_insights", label: "Read Page insights" },
  ],
};
export const missingRequired = (p: SocialPlatform, granted: string[]) => REQUIRED_SCOPES[p].filter((r) => !granted.includes(r.scope));

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

// ---------------------------------------------------------------------------
// Facebook (Facebook Login → one Page; analytics only)
// ---------------------------------------------------------------------------

const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "read_insights"];
export const FB_GRAPH = () => `https://graph.facebook.com/${env("FACEBOOK_GRAPH_VERSION") || "v23.0"}`;

type FbPage = { id: string; name: string; token: string; picture: string | null; canAnalyze: boolean };

/**
 * The Pages this person let VPlanner use (each with its own Page token).
 * /me/accounts lists Pages they manage directly; Pages owned by a Business
 * portfolio often don't show there with Facebook Login for Business, so
 * then we ask the sign-in itself which Pages were picked (debug_token →
 * granular_scopes → target_ids) and read each one by id.
 */
export async function facebookPages(userToken: string): Promise<FbPage[]> {
  const r = await call(`${FB_GRAPH()}/me/accounts?` + new URLSearchParams({ fields: "id,name,access_token,picture{url},tasks", limit: "100", access_token: userToken }));
  const listed: FbPage[] = ((r.data as { id: string; name: string; access_token?: string; picture?: { data?: { url?: string } }; tasks?: string[] }[] | undefined) ?? [])
    .filter((p) => !!p.access_token)
    .map((p) => ({
      id: p.id,
      name: p.name,
      token: p.access_token!,
      picture: p.picture?.data?.url ?? null,
      // Insights need the ANALYZE task on the Page.
      canAnalyze: !p.tasks || p.tasks.includes("ANALYZE"),
    }));
  if (listed.length) return listed;

  const dbg = await call(`${FB_GRAPH()}/debug_token?` + new URLSearchParams({ input_token: userToken, access_token: `${env("FACEBOOK_APP_ID")}|${env("FACEBOOK_APP_SECRET")}` }));
  const scopes = ((dbg.data as { granular_scopes?: { scope: string; target_ids?: string[] }[] } | undefined)?.granular_scopes ?? []) as { scope: string; target_ids?: string[] }[];
  const ids = [...new Set(scopes.filter((s) => /^pages_|^read_insights$/.test(s.scope)).flatMap((s) => s.target_ids ?? []))].slice(0, 25);
  const pages: FbPage[] = [];
  for (const id of ids) {
    try {
      const p = await call(`${FB_GRAPH()}/${id}?` + new URLSearchParams({ fields: "id,name,access_token,picture{url}", access_token: userToken }));
      if (p.access_token) pages.push({ id: String(p.id), name: String(p.name ?? "Facebook Page"), token: String(p.access_token), picture: (p.picture as { data?: { url?: string } } | undefined)?.data?.url ?? null, canAnalyze: true });
    } catch {
      /* a Page we can't open: skip it */
    }
  }
  if (!pages.length && ids.length) {
    throw new ProviderError("Facebook let VPlanner see your Page but not open it. In the Meta app's Facebook Login for Business configuration, also tick business_management, then connect again.");
  }
  return pages;
}

const facebook: Provider = {
  name: "Facebook",
  configured: () => !!env("FACEBOOK_APP_ID") && !!env("FACEBOOK_APP_SECRET"),
  usesPkce: false,
  authorizeUrl: ({ state, redirectUri }) =>
    `https://www.facebook.com/${env("FACEBOOK_GRAPH_VERSION") || "v23.0"}/dialog/oauth?` +
    new URLSearchParams({
      client_id: env("FACEBOOK_APP_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      // Ask again for anything declined last time.
      auth_type: "rerequest",
      // Facebook Login for Business uses a configuration instead of scopes.
      ...(env("FACEBOOK_LOGIN_CONFIG_ID") ? { config_id: env("FACEBOOK_LOGIN_CONFIG_ID") } : { scope: FB_SCOPES.join(",") }),
    }),
  exchange: async ({ code, redirectUri }) => {
    const short = await call(
      `${FB_GRAPH()}/oauth/access_token?` + new URLSearchParams({ client_id: env("FACEBOOK_APP_ID"), client_secret: env("FACEBOOK_APP_SECRET"), redirect_uri: redirectUri, code })
    );
    // Long-lived user token (about 60 days): Page tokens made from it don't expire.
    const long = await call(
      `${FB_GRAPH()}/oauth/access_token?` +
        new URLSearchParams({ grant_type: "fb_exchange_token", client_id: env("FACEBOOK_APP_ID"), client_secret: env("FACEBOOK_APP_SECRET"), fb_exchange_token: String(short.access_token) })
    );
    const userToken = String(long.access_token ?? short.access_token);
    const perms = await call(`${FB_GRAPH()}/me/permissions?` + new URLSearchParams({ access_token: userToken }));
    const granted = ((perms.data as { permission: string; status: string }[] | undefined) ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
    const pages = granted.includes("pages_show_list") ? await facebookPages(userToken) : [];
    const page = pages.find((p) => p.canAnalyze) ?? pages[0];
    if (granted.includes("pages_show_list") && !page) throw new ProviderError("No Facebook Page came through. Connect again and tick your Page on Facebook's screen (\"current Pages only\" is fine).");
    return {
      // The Page's token does the work; the person's token is kept to switch Pages later.
      accessToken: page ? page.token : userToken,
      refreshToken: userToken,
      expiresAt: null,
      refreshExpiresAt: inSeconds(long.expires_in),
      scopes: granted,
    };
  },
  profile: async (accessToken) => {
    const r = await call(`${FB_GRAPH()}/me?` + new URLSearchParams({ fields: "id,name,username,picture{url}", access_token: accessToken }));
    return {
      externalId: String(r.id),
      displayName: (r.name as string) || null,
      username: (r.username as string) || null,
      avatarUrl: ((r.picture as { data?: { url?: string } } | undefined)?.data?.url as string) || null,
    };
  },
  // Page tokens made from a long-lived user token don't expire.
  refresh: async ({ accessToken, refreshToken }) => ({ accessToken, refreshToken, expiresAt: null, refreshExpiresAt: null, scopes: FB_SCOPES }),
  revoke: async ({ refreshToken }) => {
    if (refreshToken) await call(`${FB_GRAPH()}/me/permissions?` + new URLSearchParams({ access_token: refreshToken }), { method: "DELETE" });
  },
};

export const PROVIDERS: Record<SocialPlatform, Provider> = { youtube, instagram, tiktok, facebook };

/**
 * Where each platform sends people back to. Must match the developer app
 * exactly. Production (and your computer) may pin it with
 * NEXT_PUBLIC_APP_URL. Previews (staging) ALWAYS use their own address:
 * sending people back to production would land them on a different copy
 * of the app (other database, other sign-in), so the connection is lost.
 */
export function redirectUriFor(platform: SocialPlatform, origin: string) {
  const pinned = process.env.VERCEL_ENV === "preview" ? "" : process.env.NEXT_PUBLIC_APP_URL;
  const base = (pinned || origin).replace(/\/+$/, "");
  return `${base}/api/social/${platform}/callback`;
}
