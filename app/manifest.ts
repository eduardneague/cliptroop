import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME, APP_TAGLINE } from "@/lib/brand";

/*
 * The installable app (no app stores): Android/Chrome offer "Install app",
 * iPhone/iPad use Share → Add to Home Screen. It opens full screen with its
 * own icon, and push notifications work from it (on iPhone ONLY from the
 * installed app, iOS 16.4+). Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_TAGLINE,
    start_url: "/dashboard?source=app",
    scope: "/",
    display: "standalone",
    background_color: "#E8630D",
    theme_color: "#EDEEE7",
    categories: ["productivity", "business"],
    prefer_related_applications: false,
    icons: [
      { src: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dashboard", url: "/dashboard?source=app", icons: [{ src: "/app-icons/icon-192.png", sizes: "192x192" }] },
      { name: "Short videos", url: "/shorts?source=app", icons: [{ src: "/app-icons/icon-192.png", sizes: "192x192" }] },
      { name: "Calendar", url: "/calendar?source=app", icons: [{ src: "/app-icons/icon-192.png", sizes: "192x192" }] },
      { name: "Meetings", url: "/meetings?source=app", icons: [{ src: "/app-icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
