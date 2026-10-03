"use client";

import { ErrorScreen } from "@/components/ui/error-screen";

/** A page inside the app broke: the menu and top bar stay, this part says so. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} compact />;
}
