/*
 * The app's name and mascot, in ONE place.
 *
 * Renaming the app = change APP_NAME here (and the domain: NEXT_PUBLIC_APP_URL
 * in Vercel). Every page, email, push notification, the installed phone app
 * and the legal pages read from this file. Safe to import anywhere (browser
 * or server): nothing secret lives here.
 */

/** The product's name, as people see it. */
export const APP_NAME = "VPlanner";

/** Short name under the icon on a phone's home screen (≤ 12 characters). */
export const APP_SHORT_NAME = "VPlanner";

/** The little clapperboard. */
export const MASCOT_NAME = "Clip";

/** One line: what it is. Used on the home page, the installed app and link previews. */
export const APP_TAGLINE = "Plan, make and post your videos, together.";

export const APP_DESCRIPTION =
  "The production planner for video teams: ideas, scripts, filming, editing, review, thumbnails and posting to YouTube, Instagram and TikTok, with tasks, meetings and analytics in one place.";

/** Who runs it (legal pages). Set NEXT_PUBLIC_COMPANY_NAME once there's a company. */
export const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || `the ${APP_NAME} team`;

/** Where people write to (legal pages, data deletion). Set NEXT_PUBLIC_CONTACT_EMAIL in Vercel. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

/** The app's brand colour (installed app splash, browser bar on phones). */
export const BRAND_COLOR = "#E8630D";
