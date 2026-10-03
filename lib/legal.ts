import { CONTACT_EMAIL } from "./brand";

/** The date the legal pages last changed (shown at the top of each). */
export const LEGAL_UPDATED = "October 4, 2026";

/** Where people write about their data. Set NEXT_PUBLIC_CONTACT_EMAIL in Vercel. */
export const LEGAL_CONTACT = CONTACT_EMAIL || "the team owner (contact email not set yet)";
export const LEGAL_CONTACT_HREF = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : null;
