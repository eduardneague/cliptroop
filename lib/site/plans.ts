import { CURRENCY, PLAN_FACTS, gbLabel, type PlanId } from "@/lib/plans";

/**
 * The plans on the website's Pricing page (1.33.0; 1.45.0: ClipTroop opens to the public with no free plan or trial,
 * prices ten times what they were, and storage with each plan). Every plan has every feature: they differ in teams,
 * storage and help. The prices and storage come from lib/plans.ts (the app reads the same facts).
 *
 * OWNER: change a price or the storage in lib/plans.ts, the words here; the page, its table and its FAQ follow.
 */
export { CURRENCY };

export type Plan = {
  id: PlanId;
  name: string;
  /** Per person per month, billed monthly; null: priced with you. */
  monthly: number | null;
  /** Per person per month, billed yearly. */
  yearly: number | null;
  /** The team's storage, in GB. */
  storageGb: number;
  /** Under the price. */
  unit: string;
  /** Who it's for, in a line. */
  for: string;
  /** What's in it. */
  includes: string[];
  /** The one to look at first. */
  featured?: boolean;
};

export const PLANS: Plan[] = [
  {
    ...PLAN_FACTS.studio,
    unit: "per person, per month",
    for: "One team making videos every day, for its own channels.",
    includes: [
      "Every feature, for as many people as you need",
      `${gbLabel(PLAN_FACTS.studio.storageGb)} of storage for the team's files`,
      "Every role: Researchers, Scripters, Filmers, Editors, Packagers, Schedulers",
      "Posting to YouTube, TikTok, Instagram and Facebook",
      "Help by email",
    ],
    featured: true,
  },
  {
    ...PLAN_FACTS.network,
    unit: "for several teams, by agreement",
    for: "Agencies and networks running several teams and channels.",
    includes: [
      "Everything in Studio, for every team",
      `${gbLabel(PLAN_FACTS.network.storageGb)} of storage for each team, more when you need it`,
      "One person in many teams, with a role in each",
      "Each team set up with you",
      "Invoices and agreements your way",
    ],
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
    a: "Create an account, make your team and choose its plan in the app. We write back by email to agree the details and send the invoice; your team opens as soon as its plan is on.",
  },
  {
    q: "Is there a free plan or a free trial?",
    a: "No. Every team is on Studio or Network, so the people who use ClipTroop are the people it’s built for.",
  },
  {
    q: "Who counts as a person?",
    a: "Anyone with a place on your team: Masters, Researchers, Scripters, Filmers, Editors, Packagers and Schedulers. Someone on two of your teams counts once on each.",
  },
  {
    q: "What counts toward storage?",
    a: "The files your team adds: short and long videos uploaded for review and posting, thumbnails, pictures in scripts, sketches, logos and media-kit photos. Team → Team shows what you use, file type by file type. Uploaded videos are cleared on their own 7 to 30 days after they’re posted everywhere (you choose how long), and when you need more room it’s added to your plan.",
  },
  {
    q: "How do we pay?",
    a: "By invoice, monthly or yearly, in US dollars. Yearly costs less per person.",
  },
  {
    q: "Can we change plans or leave?",
    a: "Any time. If you leave, export what you need (scripts to Word or PDF, numbers to a spreadsheet) and ask us to delete your team’s data, or delete it yourself in Settings.",
  },
  {
    q: "Does ClipTroop ever post without asking?",
    a: "Never. It posts the shorts your team approved, when you scheduled them or pressed Post now, to the accounts your team connected. Nothing else.",
  },
] as const;

/** "$120", null for priced with you. */
export function priceLabel(p: Plan, yearly: boolean): string | null {
  const v = yearly ? p.yearly : p.monthly;
  if (v === null) return null;
  return `${CURRENCY}${v.toLocaleString("en-US")}`;
}
