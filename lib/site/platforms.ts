/**
 * What ClipTroop does with each platform, for the website's Platforms pages
 * (1.33.0; 1.45.0 a page each): what you connect, what it posts and how, and
 * what it reads back. 1.46.0: the access each platform grants isn't listed
 * on the website any more (the owner: "those should be confidential"); the
 * platforms' own review forms have it. Plain words: this is what the
 * platforms' reviewers and every team owner read before connecting.
 */
export type SitePlatform = {
  id: "youtube" | "tiktok" | "instagram" | "facebook";
  name: string;
  /** What you connect. */
  account: string;
  /** What ClipTroop puts there, and how. */
  posts: string[];
  /** What it reads back. */
  reads: string;
  /** Taking access back on the platform's side too. */
  revoke: string;
};

export const SITE_PLATFORMS: SitePlatform[] = [
  {
    id: "tiktok",
    name: "TikTok",
    account: "A TikTok account, connected with TikTok's own sign-in (Login Kit).",
    posts: [
      "Your team's approved shorts, as TikTok posts, through TikTok's Content Posting API (Direct Post). The video goes from our server straight to TikTok.",
      "Before each post, ClipTroop asks TikTok what this account allows and shows it: the account's name and picture, the privacy choices TikTok offers it (you pick one, there's no default), whether people can comment, duet and stitch, and the post's length limit.",
      "If the video promotes a brand, you say so: your own brand, or branded content for someone else, as TikTok asks. You agree to TikTok's Music Usage Confirmation before anything is posted.",
      "At the time you chose, ClipTroop sends it, then follows it until TikTok says it's live or why it isn't. The Posting page shows each step.",
    ],
    reads: "Your profile's name and picture, and, with analytics on, the account's follower and like counts and your public videos' numbers.",
    revoke: "You can also remove ClipTroop from the apps connected to your account, in TikTok's settings.",
  },
  {
    id: "youtube",
    name: "YouTube",
    account: "A YouTube channel, connected with your Google account.",
    posts: [
      "Your team's approved shorts, with their title, description, visibility (public, unlisted or private) and whether they're made for kids.",
      "A short scheduled for later is uploaded as private with its publish time, and YouTube publishes it itself at that moment. Moving or cancelling it in ClipTroop changes it on YouTube.",
    ],
    reads: "The channel's name and picture, and, with analytics on, its videos' views, watch time, subscribers and estimated revenue from YouTube Analytics.",
    revoke: "You can also remove ClipTroop from your Google Account's third-party connections.",
  },
  {
    id: "instagram",
    name: "Instagram",
    account: "An Instagram professional account (Business or Creator), connected with Instagram's own sign-in.",
    posts: [
      "Your team's approved shorts, as Reels, shared to the feed too, with their caption.",
      "At the time you chose, Instagram fetches the video from a private link that stops working after two hours, then ClipTroop publishes it once Instagram has processed it. The Posting page shows each step.",
    ],
    reads: "The account's name and picture, and, with analytics on, its Reels' views, reach and interactions and its followers.",
    revoke: "You can also remove ClipTroop from the apps and websites in Instagram's settings.",
  },
  {
    id: "facebook",
    name: "Facebook",
    account: "A Facebook Page you manage, connected with Facebook Login.",
    posts: [
      "Your team's approved shorts, as Reels on the Page, with their description. Reels on a Page are public.",
      "At the time you chose, Facebook fetches the video from a private link (or ClipTroop sends the file itself), then ClipTroop publishes it and follows it until it's live. The Posting page shows each step.",
    ],
    reads: "The Page's name and picture, its Reels' views and interactions, its followers and its earnings, for Analytics.",
    revoke: "You can also remove ClipTroop from the business integrations in Facebook's settings.",
  },
];

/** Promises that hold for every platform. */
export const PLATFORM_PROMISES = [
  { title: "Only what your team approved", text: "A short is posted when someone on your team scheduled it or pressed Post now, and not before it was approved. Nothing goes out on its own." },
  { title: "Only the accounts you connect", text: "Your team's Master or Scheduler connects each account. ClipTroop never posts anywhere else, and never comments, likes, follows or sends messages." },
  { title: "Sign-ins sealed on our server", text: "The keys the platforms give us are encrypted (AES-256-GCM) with a key that only our server has. They never reach a browser, yours included." },
  { title: "Gone when you disconnect", text: "Disconnect an account in Team → Connected accounts: we tell the platform to cancel our access where it lets us, and delete the keys." },
] as const;
