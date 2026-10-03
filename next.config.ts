import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// App version, baked in at build time:
//   P = production, E = experimental (staging / previews), D = your computer.
// Plus the short commit Vercel built, so every build is identifiable.
const version = (JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }).version;
const channel = process.env.VERCEL_ENV === "production" ? "P" : process.env.VERCEL_ENV ? "E" : "D";
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_CHANNEL: channel,
    NEXT_PUBLIC_APP_COMMIT: commit,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
