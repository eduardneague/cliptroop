"use client";

import { ErrorScreen } from "@/components/ui/error-screen";

/** A page outside the app's shell broke (sign-in, public pages). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} />;
}
