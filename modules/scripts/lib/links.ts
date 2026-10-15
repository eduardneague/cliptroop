/**
 * Links in a script (1.23.0): what a link is, and how to show it inside the
 * app. Videos and posts from the big sites have their own players that any
 * page may show ("embeds"); everything else is shown as it is when the site
 * allows it.
 */
export type Embed = { src: string; kind: "video" | "post" | "doc" | "audio" | "design"; tall?: boolean };

/** Only web addresses (http and https), never javascript: or data:. */
export function webUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}

/** "youtube.com" for https://www.youtube.com/watch?v=… */
export function hostOf(raw: string): string {
  const u = webUrl(raw);
  return u ? u.hostname.replace(/^www\./, "") : raw;
}

/** The address without https:// and www., cut to fit. */
export function shortUrl(raw: string, max = 60): string {
  const u = webUrl(raw);
  const s = u ? `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}${u.search}` : raw;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const YT_ID = /^[\w-]{11}$/;

/** The player for a link, when its site has one. */
export function embedFor(raw: string): Embed | null {
  const u = webUrl(raw);
  if (!u) return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1] ?? null;
    if (id && YT_ID.test(id)) {
      const t = u.searchParams.get("t") ?? u.searchParams.get("start");
      const start = t ? parseInt(t, 10) : 0;
      return { src: `https://www.youtube-nocookie.com/embed/${id}${start > 0 ? `?start=${start}` : ""}`, kind: "video", tall: parts[0] === "shorts" };
    }
    return null;
  }
  if (host === "youtu.be" && parts[0] && YT_ID.test(parts[0])) return { src: `https://www.youtube-nocookie.com/embed/${parts[0]}`, kind: "video" };
  if (host === "vimeo.com" && /^\d+$/.test(parts[0] ?? "")) return { src: `https://player.vimeo.com/video/${parts[0]}`, kind: "video" };
  if (host === "tiktok.com") {
    const i = parts.indexOf("video");
    const id = i >= 0 ? parts[i + 1] : null;
    if (id && /^\d+$/.test(id)) return { src: `https://www.tiktok.com/embed/v2/${id}`, kind: "video", tall: true };
    return null;
  }
  if (host === "instagram.com" && ["p", "reel", "reels", "tv"].includes(parts[0]) && parts[1]) {
    return { src: `https://www.instagram.com/${parts[0] === "reels" ? "reel" : parts[0]}/${parts[1]}/embed`, kind: "post", tall: true };
  }
  if ((host === "twitter.com" || host === "x.com") && parts[1] === "status" && /^\d+$/.test(parts[2] ?? "")) {
    return { src: `https://platform.twitter.com/embed/Tweet.html?id=${parts[2]}`, kind: "post", tall: true };
  }
  if (host === "open.spotify.com" && ["track", "album", "playlist", "episode", "show", "artist"].includes(parts[0]) && parts[1]) {
    return { src: `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`, kind: "audio" };
  }
  if (host === "docs.google.com" && ["document", "spreadsheets", "presentation"].includes(parts[0]) && parts[1] === "d" && parts[2]) {
    return { src: `https://docs.google.com/${parts[0]}/d/${parts[2]}/preview`, kind: "doc" };
  }
  if (host === "drive.google.com" && parts[0] === "file" && parts[1] === "d" && parts[2]) {
    return { src: `https://drive.google.com/file/d/${parts[2]}/preview`, kind: "doc" };
  }
  if (host === "loom.com" && parts[0] === "share" && parts[1]) return { src: `https://www.loom.com/embed/${parts[1]}`, kind: "video" };
  if (host === "figma.com" && ["file", "design", "proto", "board"].includes(parts[0])) {
    return { src: `https://www.figma.com/embed?embed_host=cliptroop&url=${encodeURIComponent(u.toString())}`, kind: "design" };
  }
  return null;
}
