import "server-only";
import { headers } from "next/headers";
import { PLATFORMS, PROVIDERS, redirectUriFor, statsEnabled, type SocialPlatform } from "./providers";
import { socialKeyConfigured } from "./crypto";

/**
 * "Setup check" for masters and schedulers (Team → Connected accounts):
 * what THIS copy of the app (production, staging, your computer) uses, so
 * it can be compared with what's registered in each developer app.
 * Nothing secret: only whether keys are set, never their values.
 */
export type SocialSetup = {
  env: "production" | "preview" | "development" | "local";
  host: string;
  /** https://host (http on your computer). */
  origin: string;
  tokenKey: boolean;
  pinnedUrl: string | null;
  pinnedIgnored: boolean;
  platforms: { platform: SocialPlatform; keys: boolean; stats: boolean; redirectUri: string }[];
};

export async function getSocialSetup(): Promise<SocialSetup> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https")).split(",")[0].trim();
  const origin = `${proto}://${host}`;
  const vercel = process.env.VERCEL_ENV;
  const env = vercel === "production" || vercel === "preview" || vercel === "development" ? vercel : "local";
  const pinned = process.env.NEXT_PUBLIC_APP_URL?.trim() || null;
  return {
    env,
    host,
    origin,
    tokenKey: socialKeyConfigured(),
    pinnedUrl: pinned,
    pinnedIgnored: !!pinned && env === "preview",
    platforms: PLATFORMS.map((p) => ({ platform: p, keys: PROVIDERS[p].configured(), stats: statsEnabled(p), redirectUri: redirectUriFor(p, origin) })),
  };
}
