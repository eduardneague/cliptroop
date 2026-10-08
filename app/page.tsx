import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCachedUser } from "@/lib/supabase/get-user";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { Landing } from "@/components/landing/landing";

// Public (the platforms check it): findable, unlike the rest of the app.
export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: ${APP_TAGLINE}` },
  description: APP_DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { title: `${APP_NAME}: ${APP_TAGLINE}`, description: APP_DESCRIPTION, type: "website", siteName: APP_NAME },
};

/**
 * The public home page (app.cliptroop.com and staging): what the
 * platforms' reviewers and new visitors see (components/landing).
 * Signed in? Straight to the dashboard.
 */
export default async function HomePage() {
  if (await getCachedUser()) redirect("/dashboard");
  return <Landing />;
}
