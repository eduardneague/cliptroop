import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { Brand } from "@/components/ui/clip-logo";
import { Mascot } from "@/components/ui/mascot";
import { ArrowRightIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false, follow: false } };

/**
 * Where deleting your account ends (1.49.1). The owner (Nov 3 2026): "you should get a page saying your account has
 * been successfully delted … after that page, refreshing or a quick link to go back to the ladning page". Public and
 * the same for everyone (nothing about the account is left to show), so refreshing it shows it again.
 */
export default function AccountDeletedPage() {
  return (
    <main className="min-h-screen flex items-start sm:items-center justify-center p-4 sm:p-6 bg-paper">
      <div className="w-full max-w-md rounded-3xl border border-line/10 bg-surface p-6 sm:p-9 shadow-sm my-4 text-center">
        <Brand className="mb-6 justify-center" />
        <Mascot size={112} className="mx-auto mb-3" />
        <h1 className="font-display text-[28px] leading-tight font-semibold mb-2">Your account has been deleted</h1>
        <p className="text-[14.5px] text-ink-soft leading-relaxed mb-7">
          Everything that was yours is gone: your profile, picture, wallpapers, to-dos and settings. What you made on teams stays with them, without your name. Thanks for using {APP_NAME}.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-semibold text-[15px] h-12 px-6 hover:brightness-110 w-full sm:w-auto"
        >
          Go to the home page
          <ArrowRightIcon className="w-4 h-4" />
        </Link>
      </div>
    </main>
  );
}
