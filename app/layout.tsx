import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { AuthHashHandler } from "@/components/ui/auth-hash-handler";
import "./globals.css";

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
    default: "VPlanner",
    template: "%s · VPlanner",
  },
  description: "Internal content production dashboard.",
  // This app is invite-only and has no public content — nothing here
  // should ever show up in search results, regardless of auth state.
  // Individual pages can override this, but none currently need to.
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
            // Also applies the user's "Animations off" choice and colour theme before first paint.
            __html: `try{var d=document.documentElement;if(localStorage.getItem('vp-theme')==='dark')d.classList.add('dark');var m=localStorage.getItem('vp-motion');if(m==='off'||m==='on')d.dataset.motion=m;var p=localStorage.getItem('vp-palette');if(p&&/^[a-z]{2,20}$/.test(p))d.dataset.palette=p}catch(e){}`,
          }}
        />
      </head>
      <body className="font-body antialiased">
        <AuthHashHandler />
        {children}
      </body>
    </html>
  );
}
