import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/toast-provider";

export const metadata: Metadata = { title: "Get started", robots: { index: false, follow: false } };

// Toasts: the phone step (notifications) reports through them.
export default function GetStartedLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
