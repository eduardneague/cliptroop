import type { Metadata } from "next";
import { publicMetadata } from "@/lib/public-pages";

export const metadata: Metadata = publicMetadata("/login", "Sign in");

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
