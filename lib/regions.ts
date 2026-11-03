/**
 * Where the app's server runs and where its database is (1.32.1, App setup
 * card 11). Every page asks the database a few times in turn, so the two
 * should be in the same city: an ocean between them adds about 90 ms to
 * every question (a page with four rounds of questions: a third of a second).
 */

/** Vercel's function regions. */
export const VERCEL_REGIONS: Record<string, string> = {
  iad1: "Washington, D.C., USA",
  cle1: "Cleveland, USA",
  pdx1: "Portland, USA",
  sfo1: "San Francisco, USA",
  yul1: "Montréal, Canada",
  gru1: "São Paulo, Brazil",
  dub1: "Dublin, Ireland",
  lhr1: "London, UK",
  cdg1: "Paris, France",
  fra1: "Frankfurt, Germany",
  arn1: "Stockholm, Sweden",
  bom1: "Mumbai, India",
  sin1: "Singapore",
  hnd1: "Tokyo, Japan",
  kix1: "Osaka, Japan",
  icn1: "Seoul, South Korea",
  hkg1: "Hong Kong",
  syd1: "Sydney, Australia",
  cpt1: "Cape Town, South Africa",
  dxb1: "Dubai, UAE",
};

/** Supabase's regions (as its dashboard names them) and the Vercel region in that city, or the nearest. */
export const SUPABASE_REGIONS: { id: string; name: string; vercel: string }[] = [
  { id: "us-east-1", name: "East US (North Virginia)", vercel: "iad1" },
  { id: "us-east-2", name: "East US (Ohio)", vercel: "cle1" },
  { id: "us-west-1", name: "West US (North California)", vercel: "sfo1" },
  { id: "us-west-2", name: "West US (Oregon)", vercel: "pdx1" },
  { id: "ca-central-1", name: "Canada (Central)", vercel: "yul1" },
  { id: "sa-east-1", name: "South America (São Paulo)", vercel: "gru1" },
  { id: "eu-west-1", name: "West EU (Ireland)", vercel: "dub1" },
  { id: "eu-west-2", name: "West Europe (London)", vercel: "lhr1" },
  { id: "eu-west-3", name: "West EU (Paris)", vercel: "cdg1" },
  { id: "eu-central-1", name: "Central EU (Frankfurt)", vercel: "fra1" },
  { id: "eu-central-2", name: "Central Europe (Zurich)", vercel: "fra1" },
  { id: "eu-north-1", name: "North EU (Stockholm)", vercel: "arn1" },
  { id: "ap-south-1", name: "South Asia (Mumbai)", vercel: "bom1" },
  { id: "ap-southeast-1", name: "Southeast Asia (Singapore)", vercel: "sin1" },
  { id: "ap-northeast-1", name: "Northeast Asia (Tokyo)", vercel: "hnd1" },
  { id: "ap-northeast-2", name: "Northeast Asia (Seoul)", vercel: "icn1" },
  { id: "ap-southeast-2", name: "Oceania (Sydney)", vercel: "syd1" },
];

/** The middle one (the first question also opens the connection, so one slow answer doesn't count). */
export function median(ms: number[]): number | null {
  const v = ms.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

/** How far the database is from the server, by how long one question takes there and back. */
export function distanceOf(ms: number | null): "same-city" | "near" | "far" | null {
  if (ms === null) return null;
  return ms <= 20 ? "same-city" : ms <= 45 ? "near" : "far";
}

/**
 * How sign-ins are checked: the project's public keys (Supabase → Project
 * Settings → JWT Keys). "own" = an asymmetric key (ES256 / RS256 / EdDSA):
 * the app checks a sign-in itself, no question to Supabase on every page;
 * "shared" = only the old shared secret: every page asks Supabase who you are.
 */
export function signInKeys(jwks: unknown): "own" | "shared" | null {
  if (!jwks || typeof jwks !== "object" || !Array.isArray((jwks as { keys?: unknown }).keys)) return null;
  const keys = (jwks as { keys: { kty?: unknown }[] }).keys;
  return keys.some((k) => k && typeof k === "object" && (k.kty === "EC" || k.kty === "RSA" || k.kty === "OKP")) ? "own" : "shared";
}
