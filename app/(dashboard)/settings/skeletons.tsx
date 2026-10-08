import { APP_NAME } from "@/lib/brand";
import { Skeleton } from "@/components/ui/skeleton";
import { InstallAppSkeleton, PushSettingsSkeleton } from "@/components/pwa";

/** Account settings tabs, in order (the page, its loading screen and its skeletons share them). */
export const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "teams", label: "Teams" },
  { id: "notifications", label: "Notifications & app" },
  { id: "preferences", label: "Preferences" },
  { id: "account", label: "Account" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export function settingsTab(raw: string | null | undefined): SettingsTab {
  return SETTINGS_TABS.some((t) => t.id === raw) ? (raw as SettingsTab) : "profile";
}

const H2 = "text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft";

/**
 * One Settings tab while it loads (switching tabs, or the page opening): the
 * same sections with their real titles, only what's yours shimmers.
 */
export function SettingsTabSkeleton({ tab }: { tab: SettingsTab }) {
  if (tab === "teams") {
    return (
      <section className="rounded-xl border border-line/10 bg-surface p-6" aria-hidden>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className={H2}>Your teams</h2>
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-line/10">
          <div>
            <div className="text-[13px] font-semibold">Show my teams publicly</div>
            <div className="text-[11.5px] text-ink-faint">When off, only people who share a team with you can see this list</div>
          </div>
          <Skeleton className="h-6 w-11 rounded-full flex-shrink-0" />
        </div>
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-line/10 px-3.5 py-2.5">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className={`h-3.5 ${i ? "w-24" : "w-32"}`} />
              <span className="flex-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (tab === "notifications") {
    return (
      <div className="grid gap-6 lg:grid-cols-2 items-start" aria-hidden>
        <section className="rounded-xl border border-line/10 bg-surface p-6 space-y-4">
          <div>
            <h2 className={`${H2} mb-1`}>{APP_NAME} on your phone</h2>
            <p className="text-[12.5px] text-ink-soft">
              Install it like an app, straight from the browser: its own icon, full screen, and notifications. No app store, works on iPhone and Android.
            </p>
          </div>
          <InstallAppSkeleton />
        </section>
        <section className="rounded-xl border border-line/10 bg-surface p-6 space-y-4">
          <div>
            <h2 className={`${H2} mb-1`}>Notifications on this device</h2>
            <p className="text-[12.5px] text-ink-soft">
              Everything that shows up in the bell (your turn on a video, a script to review, an action item, a meeting about to start…) also pops up here, even when{" "}
              {APP_NAME} is closed. Turn it on separately on each phone or computer.
            </p>
          </div>
          <PushSettingsSkeleton />
          <div className="pt-4 border-t border-line/10">
            <div className="text-[13px] font-semibold mb-2">Your devices</div>
            <div className="divide-y divide-line/10 rounded-xl border border-line/10">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className={`h-3.5 ${i ? "w-28" : "w-40"}`} />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }
  if (tab === "preferences") {
    const rows = [
      ["Appearance", "Switch between light and dark mode", "h-9 w-9"],
      ["Animations", "Soft motion when pages, lists and popups open. “Match device” turns them off if your device asks for less motion.", "h-9 w-56"],
      ["Sounds", "Quiet little sounds when you check things off, save, get a notification or drag something.", "h-9 w-24"],
    ];
    return (
      <section className="rounded-xl border border-line/10 bg-surface p-6" aria-hidden>
        <h2 className={`${H2} mb-4`}>Preferences</h2>
        {rows.map(([title, text, size], i) => (
          <div key={title} className={`flex items-center justify-between gap-4 ${i ? "mt-5 pt-5 border-t border-line/10" : ""}`}>
            <div>
              <div className="text-[13.5px] font-semibold">{title}</div>
              <div className="text-[11.5px] text-ink-faint">{text}</div>
            </div>
            <Skeleton className={`${size} rounded-lg flex-shrink-0`} />
          </div>
        ))}
        <div className="mt-5 pt-5 border-t border-line/10">
          <div className="text-[13.5px] font-semibold">Colours</div>
          <div className="text-[11.5px] text-ink-faint mb-3">
            The paper, cards and accent across the whole app, in light and dark mode. Only you see your choice; shorts, long videos, meetings and charts keep their colours.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }
  if (tab === "account") {
    return (
      <div aria-hidden>
        <section className="rounded-xl border border-line/10 bg-surface p-6 mb-6">
          <h2 className={H2}>Report a bug or suggest something</h2>
          <p className="text-[12.5px] text-ink-soft mt-1 mb-4">Something broken, or an idea that would make {APP_NAME} better? Only the developer sees what you send.</p>
          <div className="space-y-4">
            <div>
              <div className="text-[12.5px] font-semibold mb-2">What is it?</div>
              <div className="grid grid-cols-2 gap-2.5">
                {["Bug", "Suggestion"].map((t) => (
                  <div key={t} className="flex items-center gap-3 rounded-xl border border-line/15 px-3 py-3">
                    <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold">{t}</div>
                      <Skeleton className="h-3 w-3/4 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[12.5px] font-semibold mb-2">Details</div>
              <Skeleton className="h-[7.5rem] w-full rounded-xl" />
            </div>
            <div>
              <div className="text-[12.5px] font-semibold mb-2">Photos or videos</div>
              <div className="rounded-xl border border-dashed border-line/20 p-2.5">
                <Skeleton className="w-[5.5rem] h-[5.5rem] rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-10 w-24 rounded-lg" />
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-line/10 bg-surface p-6 space-y-4">
          <div>
            <h2 className={H2}>Account</h2>
            <Skeleton className="h-3.5 w-56 mt-2" />
          </div>
          <Skeleton className="h-11 w-full rounded-lg" />
        </section>
      </div>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr] items-start" aria-hidden>
      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className={`${H2} mb-4`}>Profile picture</h2>
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="w-24 h-24 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </section>
      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className={`${H2} mb-4`}>Profile</h2>
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
          <div>
            <Skeleton className="h-3 w-12 mb-2" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <div className="mt-4 pt-4 border-t border-line/10">
          <span className="block text-xs font-semibold text-ink-soft mb-1.5">Email</span>
          <Skeleton className="h-3.5 w-48" />
        </div>
      </section>
    </div>
  );
}
