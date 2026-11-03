import type { Metadata } from "next";
import { Brand } from "@/components/ui/clip-logo";
import { ConfirmProvider } from "@/components/ui/confirm-provider";
import "@/components/landing/landing.css";
import "@/components/site/site.css";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Two-step sign-in's pages (1.46.0): a card on its own, before the app opens. */
export default function TwoStepLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="ld min-h-dvh bg-paper text-ink flex flex-col">
      <div className="h-2 ld-stripes" aria-hidden />
      <div className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-[460px] rounded-[26px] border border-line/10 bg-surface px-6 py-8 sm:px-9 sm:py-10 shadow-[0_30px_60px_-40px_rgb(var(--line)/0.5)]">
          <Brand className="mb-7" />
          {/* Sign out asks first (LogoutButton), so it needs the confirm window here too. */}
          <ConfirmProvider>{children}</ConfirmProvider>
        </div>
      </div>
    </main>
  );
}
