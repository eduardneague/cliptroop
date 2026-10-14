/*
 * Names for everything on the Advanced page and in the export for Claude
 * (1.16.0): the platforms' own codes (YT_SEARCH, MOBILE, age25-34…) in
 * plain words, and what each number means. Pure: page, server and export.
 */

const title = (s: string) =>
  s
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

const TRAFFIC: Record<string, string> = {
  ADVERTISING: "YouTube ads",
  ANNOTATION: "Annotations",
  CAMPAIGN_CARD: "Campaign cards",
  END_SCREEN: "End screens",
  EXT_URL: "Outside YouTube (sites & apps)",
  HASHTAGS: "Hashtag pages",
  IMMERSIVE_LIVE: "Live feed",
  LIVE_REDIRECT: "Live redirects",
  NO_LINK_EMBEDDED: "Embedded players",
  NO_LINK_OTHER: "Direct or unknown",
  NOTIFICATION: "Notifications",
  PLAYLIST: "Playlists",
  PRODUCT_PAGE: "Product pages",
  PROMOTED: "YouTube promotion",
  RELATED_VIDEO: "Suggested videos",
  SHORTS: "Shorts feed",
  SHORTS_CONTENT_LINKS: "Links in Shorts",
  SOUND_PAGE: "Sound pages",
  SUBSCRIBER: "Browse features (Home, Subscriptions)",
  VIDEO_REMIXES: "Remixes",
  YT_CHANNEL: "Channel pages",
  YT_OTHER_PAGE: "Other YouTube pages",
  YT_PLAYLIST_PAGE: "Playlist pages",
  YT_SEARCH: "YouTube search",
};
const DEVICE: Record<string, string> = { DESKTOP: "Computer", GAME_CONSOLE: "Game console", MOBILE: "Phone", TABLET: "Tablet", TV: "TV", UNKNOWN_PLATFORM: "Unknown" };
const OS: Record<string, string> = {
  ANDROID: "Android",
  IOS: "iOS",
  WINDOWS: "Windows",
  MACINTOSH: "macOS",
  LINUX: "Linux",
  CHROMECAST: "Chromecast",
  PLAYSTATION: "PlayStation",
  XBOX: "Xbox",
  SMART_TV: "Smart TV",
  ROKU: "Roku",
  TIZEN: "Samsung TV (Tizen)",
  WEBOS: "LG TV (webOS)",
  FIREFOX: "Firefox OS",
  KAIOS: "KaiOS",
  NINTENDO_3DS: "Nintendo 3DS",
  NINTENDO_SWITCH: "Nintendo Switch",
  NINTENDO_WII: "Nintendo Wii",
  NINTENDO_WIIU: "Nintendo Wii U",
  BLACKBERRY: "BlackBerry",
  DOCOMO: "Docomo",
  HIPTOP: "Hiptop",
  MEEGO: "MeeGo",
  NOKIA: "Nokia",
  SYMBIAN: "Symbian",
  WII: "Wii",
  OTHER: "Other",
};
const LOCATION: Record<string, string> = {
  BROWSE: "Home & browsing",
  CHANNEL: "Channel page",
  EMBEDDED: "Embedded on other sites",
  EXTERNAL_APP: "Other apps",
  MOBILE: "Mobile (older apps)",
  SEARCH: "Search results",
  SHORTS: "Shorts feed",
  WATCH: "Watch page",
  YT_OTHER: "Other YouTube pages",
};
const SUBSCRIBED: Record<string, string> = { SUBSCRIBED: "Subscribers", UNSUBSCRIBED: "Not subscribed" };
const PRODUCT: Record<string, string> = { CORE: "YouTube", GAMING: "YouTube Gaming", KIDS: "YouTube Kids", MUSIC: "YouTube Music", UNKNOWN: "Other or unknown" };
const SHARING: Record<string, string> = {
  WHATS_APP: "WhatsApp",
  FACEBOOK: "Facebook",
  FACEBOOK_MESSENGER: "Messenger",
  FACEBOOK_PAGES: "Facebook Pages",
  TWITTER: "X (Twitter)",
  COPY_PASTE: "Copied link",
  EMBED: "Embed code",
  EMAIL: "Email",
  GMAIL: "Gmail",
  INSTAGRAM: "Instagram",
  INSTAGRAM_STORIES: "Instagram Stories",
  SMS: "Text message",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  PINTEREST: "Pinterest",
  LINKEDIN: "LinkedIn",
  DISCORD: "Discord",
  SNAPCHAT: "Snapchat",
  TIKTOK: "TikTok",
  LINE: "LINE",
  VIBER: "Viber",
  WECHAT: "WeChat",
  OTHER: "Other",
  ANDROID_MESSENGER: "Android Messages",
  ANDROID_EMAIL: "Android email",
  ANDROID_GMAIL: "Gmail (Android)",
  YOUTUBE_MESSAGES: "YouTube messages",
  UNKNOWN: "Unknown",
};
const IG_TYPE: Record<string, string> = {
  FOLLOWER: "Followers",
  NON_FOLLOWER: "Everyone else",
  UNKNOWN: "Unknown",
  REEL: "Reels",
  REELS: "Reels",
  POST: "Posts",
  FEED: "Posts",
  STORY: "Stories",
  CAROUSEL_CONTAINER: "Carousels",
  AD: "Ads",
  IGTV: "IGTV",
  LIVE: "Live",
};
const GENDER: Record<string, string> = { female: "Women", male: "Men", user_specified: "Other", F: "Women", M: "Men", U: "Not said" };

/** "age25-34" → "25–34", "age65-" → "65+", "18-24" → "18–24". */
export function ageLabel(k: string) {
  const m = k.replace(/^age/i, "").match(/^(\d+)-(\d*)$/);
  if (!m) return k;
  return m[2] ? `${m[1]}–${m[2]}` : `${m[1]}+`;
}

/** A breakdown's key in plain words. Keys with a title ("id|title") show the title. */
export function breakdownLabel(dimension: string, key: string): string {
  switch (dimension) {
    case "traffic_source":
      return TRAFFIC[key] ?? title(key);
    case "traffic_by_type": {
      const [type, source] = key.split("|");
      return `${type === "SHORTS" ? "Shorts" : type === "LIVE_STREAM" ? "Live" : "Long videos"} · ${TRAFFIC[source] ?? title(source ?? "")}`;
    }
    case "device":
      return DEVICE[key] ?? title(key);
    case "os":
      return OS[key] ?? title(key);
    case "playback_location":
      return LOCATION[key] ?? title(key);
    case "subscribed":
      return SUBSCRIBED[key] ?? title(key);
    case "product":
      return PRODUCT[key] ?? title(key);
    case "sharing":
      return SHARING[key] ?? title(key);
    case "age_gender": {
      const [age, gender] = key.split("|");
      return `${ageLabel(age)} · ${GENDER[gender] ?? title(gender ?? "")}`;
    }
    case "suggested_by":
    case "playlist": {
      const i = key.indexOf("|");
      const name = i >= 0 ? key.slice(i + 1).trim() : "";
      return name || (i >= 0 ? key.slice(0, i) : key);
    }
    case "viewer_type":
    case "content_type":
    case "interactions_by_type":
      return IG_TYPE[key] ?? title(key);
    case "follows":
      return key === "FOLLOWER" ? "Follows" : key === "NON_FOLLOWER" ? "Unfollows" : title(key);
    case "follower_gender":
    case "engaged_gender":
      return GENDER[key] ?? title(key);
    case "follower_age":
    case "engaged_age":
      return ageLabel(key);
    default:
      return key;
  }
}

/** A link for a breakdown row where there's something to open (a suggesting video, a playlist, a site). */
export function breakdownHref(dimension: string, key: string): string | null {
  const id = key.split("|")[0];
  if (dimension === "suggested_by" && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  if (dimension === "playlist" && /^[\w-]{6,64}$/.test(id)) return `https://www.youtube.com/playlist?list=${id}`;
  if (dimension === "external_site" && /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(key)) return `https://${key.replace(/^https?:\/\//i, "")}`;
  return null;
}

/** What each number means (shown as hints, and in the export's glossary). */
export const METRIC_HELP: Record<string, string> = {
  views: "Times the videos were watched (each platform counts a view its own way).",
  engaged_views: "YouTube: views that went past the first seconds (for Shorts, plays that weren't swiped away at once).",
  watch_hours: "Total time people spent watching.",
  avg_view_seconds: "How long a view lasts on average.",
  avg_view_pct: "How much of a video a view covers on average. Over 100% means rewatches (Shorts loop).",
  likes: "Likes.",
  dislikes: "Dislikes (only the channel sees them).",
  comments: "Comments.",
  shares: "Times someone shared a video.",
  saves: "Times someone saved a post.",
  engagement_rate: "Likes, comments and shares for every 100 views.",
  playlist_adds: "Times a video was added to a playlist.",
  playlist_removes: "Times a video was removed from a playlist.",
  subs_gained: "Subscribers gained.",
  subs_lost: "Subscribers lost.",
  subs_net: "Subscribers gained minus lost.",
  premium_views: "Views by YouTube Premium members (no ads; paid from Premium).",
  premium_watch_hours: "Watch time by YouTube Premium members.",
  card_clicks: "Clicks on the cards shown in videos.",
  card_ctr: "Card clicks for every 100 cards shown.",
  card_teaser_clicks: "Clicks on card teasers.",
  revenue: "YouTube's estimate of what the channel earned (after YouTube's share).",
  rpm: "Revenue for every 1,000 views (all views, with or without ads).",
  cpm: "What advertisers paid for every 1,000 ad impressions (before YouTube's share).",
  playback_cpm: "What advertisers paid for every 1,000 views that showed an ad.",
  ad_impressions: "Ads shown.",
  monetized_playbacks: "Views that showed at least one ad.",
  ad_revenue: "Revenue from ads.",
  premium_revenue: "Revenue from YouTube Premium.",
  gross_revenue: "What advertisers paid in total (before YouTube's share).",
  reach: "Different accounts that saw the content at least once.",
  accounts_engaged: "Different accounts that liked, commented, shared, saved or replied.",
  interactions: "Likes, comments, shares, saves, replies and reposts together.",
  replies: "Replies to stories.",
  reposts: "Times someone reposted the content.",
  profile_link_taps: "Taps on the links in the profile.",
  followers_gained: "New followers.",
  followers_lost: "Followers lost.",
  followers_net: "Followers gained minus lost.",
  followers_now: "Followers right now.",
  engagements: "Reactions, comments, shares and clicks on the Page's posts.",
  video_watch_hours: "Time spent watching the Page's videos.",
  complete_views_30s: "Video views of 30 seconds or more (or to the end of shorter ones).",
  page_visits: "Times the Page was visited.",
  total_views: "All views of all videos, ever.",
  total_likes: "All likes, ever.",
  skip_rate: "Instagram: the share of plays swiped away in the first 3 seconds.",
  hold3s: "Still watching after the first 3 seconds (from the retention curve).",
  earnings: "Facebook Content Monetization earnings.",
};

/** The breakdowns: their titles, what's measured, and where they come from. */
export const DIMENSIONS: Record<string, { title: string; measure: "views" | "value"; valueLabel?: string; percent?: boolean }> = {
  traffic_source: { title: "Traffic sources", measure: "views" },
  traffic_by_type: { title: "Traffic sources by Shorts and long videos", measure: "views" },
  search_term: { title: "Search terms", measure: "views" },
  external_site: { title: "Outside sites and apps", measure: "views" },
  suggested_by: { title: "Videos that suggested yours", measure: "views" },
  playlist: { title: "Playlists", measure: "views" },
  device: { title: "Devices", measure: "views" },
  os: { title: "Operating systems", measure: "views" },
  playback_location: { title: "Where they watched", measure: "views" },
  subscribed: { title: "Subscribers vs everyone else", measure: "views" },
  product: { title: "YouTube apps", measure: "views" },
  age_gender: { title: "Age and gender", measure: "value", valueLabel: "of viewers", percent: true },
  sharing: { title: "Where people shared", measure: "value", valueLabel: "shares" },
  country: { title: "Countries", measure: "views" },
  viewer_type: { title: "Followers vs everyone else", measure: "value", valueLabel: "views" },
  content_type: { title: "Views by kind of post", measure: "value", valueLabel: "views" },
  interactions_by_type: { title: "Interactions by kind of post", measure: "value", valueLabel: "interactions" },
  follows: { title: "Follows and unfollows", measure: "value", valueLabel: "accounts" },
  follower_age: { title: "Followers by age", measure: "value", valueLabel: "followers" },
  follower_gender: { title: "Followers by gender", measure: "value", valueLabel: "followers" },
  follower_city: { title: "Followers by city", measure: "value", valueLabel: "followers" },
  engaged_age: { title: "Engaged audience by age", measure: "value", valueLabel: "accounts" },
  engaged_gender: { title: "Engaged audience by gender", measure: "value", valueLabel: "accounts" },
  engaged_country: { title: "Engaged audience by country", measure: "value", valueLabel: "accounts" },
  engaged_city: { title: "Engaged audience by city", measure: "value", valueLabel: "accounts" },
};

/** What TikTok would add with its Business API (separate approval), said where TikTok's numbers end. */
export const TIKTOK_MORE =
  "TikTok shares only views, likes, comments and shares per video with apps like ClipTroop. Its Business API (a separate TikTok approval, for Business and Creator accounts) would add average watch time, completion rate, total watch time, reach, where views came from (For You, follows, search, profile) and the audience's countries and gender.";
