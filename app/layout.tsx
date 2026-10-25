import { APP_NAME, APP_DESCRIPTION, APP_SHORT_NAME, APP_TAGLINE } from "@/lib/brand";
import { PwaRegister } from "@/components/pwa";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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
});

// Its italic only says a few words on the website (landing.css .ld-italic): a family of its own that isn't
// preloaded (1.32.3). In one call with the upright one, every page of the app preloaded it too.
const frauncesItalic = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-italic",
  weight: ["500", "600"],
  style: "italic",
  preload: false,
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // This page's nonce (1.31.16, the middleware's Content Security Policy): Next.js puts it on its own
  // scripts; the first-paint script below takes it too. Reading it makes every page render per visit,
  // which a nonce needs (a page built ahead would carry an old one).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${frauncesItalic.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          // The browser hides a nonce once the page has it, so the copy React sees differs: expected.
          suppressHydrationWarning
          // Runs before paint so dark mode doesn't flash light first.
          dangerouslySetInnerHTML={{
            // Also applies the user's "Animations off" choice, colour theme and glass look (1.27.5; its style, where,
            // the side bar and how see-through in 1.28.0; the colours behind it and solid at 0 in 1.29.2; Halo in 1.29.3) before first paint
            // (not on the brand pages: home, sign-in, status, legal; see lib/public-pages.ts).
            // 1.29.10: data-bars="classic" when the system's scroll bars take room (Windows, Linux): globals.css draws its own thin ones then.
            __html: `try{var d=document.documentElement;try{var S=document.createElement('div');S.style.cssText='position:absolute;top:-999px;width:80px;height:80px;overflow:scroll;visibility:hidden';d.appendChild(S);if(S.offsetWidth-S.clientWidth>0)d.dataset.bars='classic';d.removeChild(S)}catch(e){}if(localStorage.getItem('vp-theme')==='dark')d.classList.add('dark');var m=localStorage.getItem('vp-motion');if(m==='off'||m==='on')d.dataset.motion=m;var b=new RegExp(${JSON.stringify(BRAND_PAGES_RE)}).test(location.pathname);var p=localStorage.getItem('vp-palette');if(p&&/^[a-z]{2,20}$/.test(p)&&!b)d.dataset.palette=p;var L=null;try{L=JSON.parse(localStorage.getItem('vp-look')||'null')}catch(e){}if(!b&&(L?L.on===true:localStorage.getItem('vp-glass')==='on')){d.dataset.glass='on';if(L){if(L.style==='liquid'||L.style==='halo')d.dataset.glassStyle=L.style;if(L.scope==='everywhere')d.dataset.glassScope='everywhere';if(L.sidebar===true)d.dataset.glassSidebar='clear';if(typeof L.level==='number')d.style.setProperty('--glass-level',String(Math.max(0,Math.min(100,L.level))/100));if(L.level===0)d.dataset.glassOpaque='on';var P=L.paint;if(P&&/^(none|one|three)$/.test(P.wash)){d.dataset.glassWash=P.wash;var V=P.vars||{};for(var k in V){if(/^--wash-(light|dark|[123])$/.test(k)&&/^[0-9]{1,3} [0-9]{1,3} [0-9]{1,3}$/.test(V[k]))d.style.setProperty(k,V[k])}}}}}catch(e){}`,
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
