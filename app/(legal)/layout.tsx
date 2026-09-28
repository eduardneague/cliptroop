import Link from "next/link";

/** Public pages (no sign-in): privacy policy and terms. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="max-w-3xl mx-auto px-5 pt-8 pb-4 flex items-center justify-between">
        <Link href="/" className="font-display text-[20px] font-semibold">VPlanner</Link>
        <nav className="flex gap-4 text-[13px] text-ink-soft">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-5 pb-16 legal">{children}</main>
    </div>
  );
}
