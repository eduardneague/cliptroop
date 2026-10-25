/**
 * The plans on the website's Pricing page (1.33.0). Every plan has every
 * feature: they differ in how many people, how many teams and how much help.
 * Access is by invitation while ClipTroop opens up team by team, so a plan
 * starts with a message, not a card form.
 *
 * OWNER: the names and prices are a starting point. Change them here and the
 * page, its comparison and its FAQ follow.
 */
export const CURRENCY = "$";

export type Plan = {
  id: "crew" | "studio" | "network";
  name: string;
  /** Per person per month, billed monthly; null: priced with you. */
  monthly: number | null;
  /** Per person per month, billed yearly. */
  yearly: number | null;
  /** Under the price. */
  unit: string;
  /** Who it's for, in a line. */
  for: string;
  /** What's in it beyond the plan before. */
  includes: string[];
  /** The one to look at first. */
  featured?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "crew",
    name: "Crew",
    monthly: 0,
    yearly: 0,
    unit: "up to 3 people",
    for: "A creator with an editor or two.",
    includes: [
      "Shorts and long videos from idea to posted",
      "Scripts, review and Thumbnail Studio",
      "Posting to YouTube, TikTok, Instagram and Facebook",
      "Analytics and Outliers",
      "Help by email",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    monthly: 12,
    yearly: 10,
    unit: "per person, per month",
    for: "Teams making videos every day.",
    includes: ["As many people as you need", "Every role: Scripters, Filmers, Editors, Packagers, Schedulers", "Help within a working day", "Your team set up with you"],
    featured: true,
  },
  {
    id: "network",
    name: "Network",
    monthly: null,
    yearly: null,
    unit: "priced with you",
    for: "Agencies and networks running several channels.",
    includes: ["Several teams, one person in many", "Onboarding for each team", "Invoices and agreements your way", "A person to call"],
  },
];

/** What every plan has, for the comparison under the plans. */
export const EVERY_PLAN = [
  "Every feature, nothing locked",
  "Your accounts, connected by you, disconnected any time",
  "The installable app on iPhone and Android, with notifications",
  "Your data deleted when you ask",
] as const;

export const PRICING_FAQ = [
  {
    q: "How do we start?",
    a: "Access is by invitation for now. Write to us with your channels and how many people make your videos: we set your team up and invite its owner, who invites everyone else.",
  },
  {
    q: "Who counts as a person?",
    a: "Anyone with a place on your team: Masters, Researchers, Scripters, Filmers, Editors, Packagers and Schedulers. Someone on two of your teams counts once on each.",
  },
  {
    q: "Is anything locked in Crew?",
    a: "No. Every plan has every feature. Crew is for small teams; Studio is for teams of any size, with quicker help.",
  },
  {
    q: "Can we change plans or leave?",
    a: "Any time. If you leave, export what you need (scripts to Word or PDF, numbers to a spreadsheet) and ask us to delete your team's data, or delete it yourself in Settings.",
  },
  {
    q: "Does ClipTroop ever post without asking?",
    a: "Never. It posts the shorts your team approved, when you scheduled them or pressed Post now, to the accounts your team connected. Nothing else.",
  },
] as const;

/** "$12", "Free", null for priced with you. */
export function priceLabel(p: Plan, yearly: boolean): string | null {
  const v = yearly ? p.yearly : p.monthly;
  if (v === null) return null;
  return v === 0 ? "Free" : `${CURRENCY}${v}`;
}
