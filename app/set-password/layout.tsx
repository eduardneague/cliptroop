import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/toast-provider";

export const metadata: Metadata = { title: "Set up your account" };

// Toasts: the phone step (notifications) reports through them.
export default function SetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
