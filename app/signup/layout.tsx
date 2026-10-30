import type { Metadata } from "next";
import { publicMetadata } from "@/lib/public-pages";

export const metadata: Metadata = publicMetadata("/signup", "Create an account", "Create a ClipTroop account, name your team and choose its plan.");

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
