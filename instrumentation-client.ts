import { startNavProgress } from "@/lib/nav-events";

/**
 * Runs in the browser before the app starts (Next.js loads this file by
 * name). Every move inside the app (a link, router.push, back / forward)
 * starts the thin bar at the top at once, and keeps the page nudged until
 * it has arrived (see components/ui/nav-progress.tsx).
 */
export function onRouterTransitionStart(url: string) {
  startNavProgress(url);
}
