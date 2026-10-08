import { APP_NAME, APP_DESCRIPTION, APP_SHORT_NAME, APP_TAGLINE } from "@/lib/brand";
import { PwaRegister } from "@/components/pwa";
import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { AuthHashHandler } from "@/components/ui/auth-hash-handler";
import { BRAND_PAGES_RE, facebookMeta, OG_IMAGE, siteUrl } from "@/lib/public-pages";
import { BrandPages } from "@/components/ui/brand-pages";
import { ErrorReporter } from "@/components/error-reporter";
import "./globals.css";

/** This copy's public address (link previews need absolute URLs). */
function publicOrigin() {
  const staging = process.env.VERCEL_ENV === "preview" ? process.env.STAGING_URL?.trim() : "";
  const raw = staging || siteUrl() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

// viewport-fit=cover lets the app draw under the iPhone notch/home bar;
// the fixed bottom nav then pads itself with env(safe-area-inset-*).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EDEEE7" },
    { media: "(prefers-color-scheme: dark)", color: "#120F0B" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  // The installable app (app/manifest.ts): iPhone home-screen icon and full-screen mode.
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
  // The browser tab: Clip (app/icon.svg) where SVG works, favicon.ico everywhere else.
  // Listed here because a config `icons` replaces the automatic app/icon.svg link.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/app-icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Absolute links for link previews; every page shares the picture (public/og-image.png).
  metadataBase: new URL(publicOrigin()),
  openGraph: { type: "website", siteName: APP_NAME, title: `${APP_NAME}: ${APP_TAGLINE}`, description: APP_DESCRIPTION, locale: "en_US", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
  facebook: facebookMeta(),
  formatDetection: { telephone: false },
  // Invite-only: nothing shows up in search results, except the public
  // pages (home, privacy, terms, data deletion), which override this.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          // Runs before paint so dark mode doesn't flash light first.
          dangerouslySetInnerHTML={{
            // Also applies the user's "Animations off" choice and colour theme before first paint
            // (not on the brand pages: home, sign-in, status, legal; see lib/public-pages.ts).
            __html: `try{var d=document.documentElement;if(localStorage.getItem('vp-theme')==='dark')d.classList.add('dark');var m=localStorage.getItem('vp-motion');if(m==='off'||m==='on')d.dataset.motion=m;var p=localStorage.getItem('vp-palette');if(p&&/^[a-z]{2,20}$/.test(p)&&!new RegExp(${JSON.stringify(BRAND_PAGES_RE)}).test(location.pathname))d.dataset.palette=p}catch(e){}`,
          }}
        />
      </head>
      <body className="font-body antialiased">
        <ErrorReporter />
        <PwaRegister />
        <AuthHashHandler />
        <BrandPages />
        {children}
      </body>
    </html>
  );
}
