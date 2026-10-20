/*
 * The built-in explore niches (1.27.0): a little of every corner of YouTube,
 * collected for everyone, so "every niche" has formats to borrow even for a
 * team that follows one niche. Each is kept small (a few dozen channels) and
 * read slowly (searches every few days, channels every 10 days).
 */

export type ExploreNiche = { slug: string; name: string; color: string; keywords: string[] };

export const EXPLORE: ExploreNiche[] = [
  { slug: "tech", name: "Tech and gadgets", color: "blue", keywords: ["tech review", "smartphone", "gadgets", "iphone"] },
  { slug: "gaming", name: "Gaming", color: "violet", keywords: ["gaming", "minecraft", "fortnite", "gta"] },
  { slug: "finance", name: "Personal finance", color: "green", keywords: ["personal finance", "investing", "make money", "stock market"] },
  { slug: "business", name: "Business", color: "teal", keywords: ["entrepreneur", "side hustle", "small business", "startup"] },
  { slug: "food", name: "Food and cooking", color: "orange", keywords: ["cooking", "recipe", "food review", "street food"] },
  { slug: "fitness", name: "Fitness", color: "red", keywords: ["fitness", "workout", "gym", "weight loss"] },
  { slug: "travel", name: "Travel", color: "sky", keywords: ["travel vlog", "travel", "backpacking", "visiting"] },
  { slug: "science", name: "Science and learning", color: "indigo", keywords: ["science", "explained", "physics", "history documentary"] },
  { slug: "cars", name: "Cars", color: "slate", keywords: ["cars", "car review", "supercar", "car restoration"] },
  { slug: "diy", name: "DIY and building", color: "brown", keywords: ["diy", "woodworking", "home renovation", "building"] },
  { slug: "beauty", name: "Beauty and fashion", color: "pink", keywords: ["makeup", "skincare", "fashion haul", "outfit"] },
  { slug: "challenges", name: "Challenges and entertainment", color: "gold", keywords: ["challenge", "last to leave", "experiment", "pranks"] },
  { slug: "true-crime", name: "True crime and mystery", color: "plum", keywords: ["true crime", "mystery", "unsolved", "documentary"] },
  { slug: "movies", name: "Movies and TV", color: "rose", keywords: ["movie review", "movie explained", "tv series", "film analysis"] },
  { slug: "self-improvement", name: "Self-improvement", color: "mint", keywords: ["self improvement", "productivity", "motivation", "habits"] },
  { slug: "real-estate", name: "Homes and real estate", color: "olive", keywords: ["real estate", "house tour", "tiny house", "apartment tour"] },
  { slug: "sports", name: "Sports", color: "navy", keywords: ["football", "basketball", "nba", "soccer"] },
  { slug: "animals", name: "Animals and nature", color: "lime", keywords: ["animals", "wildlife", "dog", "pets"] },
  { slug: "music", name: "Music", color: "fuchsia", keywords: ["music producer", "guitar", "singing", "music theory"] },
  { slug: "commentary", name: "Commentary and news", color: "coral", keywords: ["commentary", "drama", "internet culture", "news"] },
  { slug: "art", name: "Art and design", color: "purple", keywords: ["art", "drawing", "painting", "graphic design"] },
  { slug: "film-making", name: "Photo and film-making", color: "cyan", keywords: ["photography", "filmmaking", "camera", "video editing"] },
  { slug: "outdoors", name: "Outdoors and survival", color: "aqua", keywords: ["survival", "camping", "bushcraft", "fishing"] },
  { slug: "ai", name: "AI and software", color: "yellow", keywords: ["ai tools", "coding", "programming", "chatgpt"] },
];

export const EXPLORE_BY_SLUG = new Map(EXPLORE.map((e) => [e.slug, e]));

/** Colours a niche can have (the app's objective colours: they work in light and dark). */
export const NICHE_COLORS = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red", "teal", "sky", "indigo", "purple", "fuchsia", "rose", "peach", "lime", "mint", "cyan", "navy", "brown", "slate", "gold", "plum", "olive", "pink", "coral"] as const;

/** A niche colour as CSS (the objectives palette, else the app's own tokens). */
export function nicheColor(c: string | null | undefined): string {
  const known = new Set<string>(NICHE_COLORS);
  if (c === "pink") return "rgb(var(--pink))";
  if (c === "coral") return "rgb(var(--coral))";
  return known.has(c ?? "") ? `rgb(var(--obj-${c}))` : "rgb(var(--obj-blue))";
}
