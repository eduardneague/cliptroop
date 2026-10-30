import Link from "next/link";
import { APP_NAME, APP_TAGLINE, CONTACT_EMAIL } from "@/lib/brand";
import { Brand } from "@/components/ui/clip-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HeaderScroll } from "@/components/landing/landing-client";
import { SiteMenu } from "./site-menu";
import "@/components/landing/landing.css";

/*
 * The website around the app (1.33.0): the home page, Features, Platforms,
 * Pricing, Security, Changelog, About, Contact and the legal pages share this
 * header and footer. The film-set look of the home page (components/landing):
 * Clip's ink and cream, the clapper amber, the stripes.
 */

export const SITE_NAV = [
  { href: "/features", label: "Features" },
  { href: "/platforms", label: "Platforms" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/changelog", label: "Changelog" },
] as const;

export const SITE_FOOTER = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/platforms", label: "Platforms" },
      { href: "/pricing", label: "Pricing" },
      { href: "/changelog", label: "Changelog" },
      { href: "/status", label: "Status" },
      { href: "/signup", label: "Create an account" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
      { href: "/data-deletion", label: "Data deletion" },
    ],
  },
] as const;

/** Buttons and links that look like them. */
export const btn =
  "inline-flex items-center justify-center rounded-xl font-semibold transition-[filter,background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
export const btnMain = `${btn} bg-amber text-white px-6 h-12 text-[15px] hover:brightness-110`;
export const btnQuiet = `${btn} border border-line/20 px-5 h-12 text-[15px] hover:border-line/40 hover:bg-surface`;
/** A link inside text. */
export const textLink = "text-ink underline underline-offset-2 decoration-line/30 hover:text-amber hover:decoration-amber";

/** "Ask about an account": an email when there's an address to write to, else the contact page. */
export function askHref(subject = `${APP_NAME} for our team`) {
  return CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}` : "/contact";
}

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header data-ld-header className="ld-header sticky top-0 z-40">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-2">
        <Link href="/" aria-label={`${APP_NAME} home`} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
          <Brand />
        </Link>
        <nav aria-label="Site" className="hidden md:flex items-center gap-0.5 ml-6 text-[14px] text-ink-soft">
          {SITE_NAV.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className={`rounded-lg px-3 h-9 inline-flex items-center hover:text-ink hover:bg-surface/70 ${current === l.href ? "text-ink font-semibold" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="flex-1" />
        <ThemeToggle />
        <Link href="/login" className="hidden md:inline-flex items-center rounded-xl px-3 h-10 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-surface/70">
          Sign in
        </Link>
        {/* 1.45.0: anyone can make an account. */}
        <Link href="/signup" className={`${btn} bg-amber text-white px-4 h-10 text-[14px] hover:brightness-110 whitespace-nowrap`}>
          <span className="sm:hidden">Sign up</span>
          <span className="hidden sm:inline">Create an account</span>
        </Link>
        <SiteMenu links={[...SITE_NAV, { href: "/login", label: "Sign in" }]} current={current} />
      </div>
      <HeaderScroll />
    </header>
  );
}

/** `flush`: the page ends with a full-width band, and the footer follows it straight on. */
export function SiteFooter({ flush = false }: { flush?: boolean }) {
  return (
    <footer className={flush ? "" : "border-t border-line/10 mt-24 sm:mt-32"}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))]">
        <div className="max-w-xs">
          <Brand />
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{APP_TAGLINE}</p>
          {CONTACT_EMAIL && (
            <p className="mt-3 text-[14px]">
              <a href={`mailto:${CONTACT_EMAIL}`} className={textLink}>
                {CONTACT_EMAIL}
              </a>
            </p>
          )}
        </div>
        {SITE_FOOTER.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-[13px] font-semibold text-ink">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-[14px] text-ink-soft">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      {/* The legal pages on every page, never behind a menu (the platforms' reviews ask for that). */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-faint">
        <span>
          © {new Date().getFullYear()} {APP_NAME}. Made for the teams behind the videos.
        </span>
        <Link href="/privacy" className="hover:text-ink underline-offset-2 hover:underline">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-ink underline-offset-2 hover:underline">
          Terms
        </Link>
        <Link href="/data-deletion" className="hover:text-ink underline-offset-2 hover:underline">
          Data deletion
        </Link>
      </div>
    </footer>
  );
}

/**
 * A page of the website: the header, the page, the footer. `current`: its address (the header marks it). `flush`: the
 * page ends with a full-width band (SiteFooter).
 */
export function SitePage({ current, flush, children }: { current?: string; flush?: boolean; children: React.ReactNode }) {
  return (
    <div className="ld min-h-dvh bg-paper text-ink">
      <a href="#page" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to the page
      </a>
      <SiteHeader current={current} />
      <main id="page">{children}</main>
      <SiteFooter flush={flush} />
    </div>
  );
}

/**
 * The top of a page: the clapper stripes, the title, one line about it. `children`: anything that belongs beside
 * the line (buttons).
 */
export function PageHead({ title, lead, children }: { title: string; lead: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-16">
      <span className="block w-14 h-[7px] rounded-[3px] ld-stripes" aria-hidden />
      <h1 className="mt-6 font-display font-semibold tracking-[-0.025em] leading-[1] text-[42px] sm:text-[60px] max-w-[16ch]">{title}</h1>
      <p className="mt-5 text-[17px] sm:text-[18px] leading-relaxed text-ink-soft max-w-[40rem]">{lead}</p>
      {children && <div className="mt-8 flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

/**
 * A part of a page: its title (and a line about it) on the left, staying in view while you read the right; one column
 * on a phone.
 */
export function SiteSection({ id, title, lead, children }: { id?: string; title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  const h = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={h} className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 grid gap-8 lg:gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <h2 id={h} className="font-display text-[30px] sm:text-[38px] font-semibold leading-[1.05] tracking-[-0.02em]">
          {title}
        </h2>
        {lead && <p className="mt-3 text-[16px] leading-relaxed text-ink-soft max-w-[28rem]">{lead}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** Names with a sentence or two each, under a hairline: the website's lists of facts. */
export function FactList({ items, columns = 2 }: { items: readonly { name: string; text: React.ReactNode }[]; columns?: 1 | 2 | 3 }) {
  const cols = columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";
  return (
    <dl className={`grid gap-x-10 gap-y-6 ${cols}`}>
      {items.map((x) => (
        <div key={x.name} className="border-t border-line/15 pt-4">
          <dt className="font-semibold text-[16px]">{x.name}</dt>
          <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{x.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The page's ending: where to go next. */
export function SiteCta({ title = "Bring your team", text, primary = { href: "/signup", label: "Create an account" } }: { title?: string; text: React.ReactNode; primary?: { href: string; label: string } }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-24 sm:mt-32">
      <div className="rounded-[28px] bg-[rgb(43_33_24)] text-[rgb(246_240_228)] px-6 sm:px-12 py-12 sm:py-14 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div className="max-w-[36rem]">
          <span className="block w-14 h-[7px] rounded-[3px] ld-stripes-light" aria-hidden />
          <h2 className="mt-5 font-display text-[32px] sm:text-[44px] font-semibold leading-[1.04] tracking-[-0.02em]">{title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[rgb(246_240_228/0.75)]">{text}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={primary.href} className={btnMain}>
            {primary.label}
          </Link>
          <Link href="/login" className={`${btn} border border-[rgb(246_240_228/0.25)] px-5 h-12 text-[15px] text-[rgb(246_240_228)] hover:border-[rgb(246_240_228/0.5)]`}>
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
