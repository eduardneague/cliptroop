import type { Metadata } from "next";
import { WelcomeCard, type LinkType } from "./welcome-card";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TYPES: LinkType[] = ["invite", "recovery", "email", "magiclink", "signup", "email_change"];

/**
 * Where the sign-in emails lead (lib/auth-emails.ts): a one-time code in
 * the address, used only when the person presses the button. Also shows
 * "this link has expired" for the old-style links (AuthHashHandler).
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tokenHash = /^[A-Za-z0-9_-]{8,200}$/.test(one("token_hash")) ? one("token_hash") : null;
  const type = (TYPES as string[]).includes(one("type")) ? (one("type") as LinkType) : null;
  return <WelcomeCard tokenHash={tokenHash} type={type} expired={one("error") === "expired"} />;
}
