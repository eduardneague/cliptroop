/**
 * What ClipTroop does with each platform, for the website's Platforms page
 * (1.33.0): what you connect, what it posts and reads, and every permission
 * it asks for with what it's used for. The permissions are the ones
 * lib/social/providers.ts really asks for (tests/website.test.ts checks
 * that each one is here). Plain words: this is what the platforms' reviewers
 * and every team owner read before connecting an account.
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
  /** Asked for every time, then the analytics ones (asked for when the team turns on analytics for this platform). */
  permissions: { scope: string; use: string; analytics?: boolean }[];
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
    permissions: [
      { scope: "user.info.basic", use: "Shows which account is connected: its name and picture." },
      { scope: "video.publish", use: "Posts the shorts your team approved and scheduled, at the time you chose." },
      { scope: "user.info.stats", use: "Reads the account's follower, following, like and video counts for Analytics.", analytics: true },
      { scope: "video.list", use: "Reads your public videos and their views, likes, comments and shares for Analytics.", analytics: true },
    ],
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
    permissions: [
      { scope: "youtube.upload", use: "Uploads the shorts your team approved." },
      { scope: "youtube.force-ssl", use: "Changes or cancels a scheduled short when you move it or take it back, and reads the channel's details." },
      { scope: "yt-analytics.readonly", use: "Reads views, watch time and subscribers for Analytics.", analytics: true },
      { scope: "yt-analytics-monetary.readonly", use: "Reads estimated revenue for Analytics (Masters, and people they let see money, only).", analytics: true },
    ],
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
    permissions: [
      { scope: "instagram_business_basic", use: "Shows which account is connected: its name and picture." },
      { scope: "instagram_business_content_publish", use: "Posts the Reels your team approved and scheduled." },
      { scope: "instagram_business_manage_insights", use: "Reads views, reach, interactions and followers for Analytics.", analytics: true },
    ],
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
    permissions: [
      { scope: "pages_show_list", use: "Lists the Pages you manage, so you can pick the one to connect." },
      { scope: "pages_manage_posts", use: "Posts the Reels your team approved and scheduled on that Page." },
      { scope: "pages_read_engagement", use: "Reads the Page's posts and their engagement for Analytics." },
      { scope: "read_insights", use: "Reads the Page's insights (views, followers, earnings) for Analytics." },
    ],
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
