/**
 * Settings → Account, Help & feedback and the Danger zone (1.34.2): the
 * pieces their pages and their loading skeletons share (the cards, a
 * setting's row, the words), so the skeleton is the page with only what's
 * yours shimmering. No client code here: the loading screen imports it.
 */

export const H2 = "text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft";
export const CARD = "rounded-xl border border-line/10 bg-surface p-6";
/** A setting's button. */
export const BTN =
  "inline-flex items-center justify-center rounded-lg border border-line/20 px-4 h-10 text-[13.5px] font-semibold whitespace-nowrap hover:border-line/40 hover:bg-surface-2 transition-colors disabled:opacity-60";

/** Account's sub-page with what can't be undone (kept off the tab itself, so nobody lands there by accident). */
export const DANGER_HREF = "/settings?tab=account&view=danger";
export const ACCOUNT_HREF = "/settings?tab=account";

export const TEXT = {
  signingIn: "Signing in",
  email: "Email",
  emailText: "You sign in with this. Password reset emails go here too.",
  password: "Password",
  passwordText: "A new one signs out every other device signed in to your account. This one stays signed in.",
  devices: "Devices",
  thisDevice: "This device",
  thisDeviceText: "Log out here. Your other devices stay signed in.",
  otherDevices: "Your other devices",
  otherDevicesText: "Lost a phone, or signed in on someone else's computer? Sign out every other device at once.",
  developer: "Developer",
  developerText: "Only developer accounts see these.",
  danger: "Danger zone",
  dangerText: "Delete your account",
  dangerIntro: "What's here can't be undone, so each step asks you first.",
  report: "Report a bug or suggest something",
  tutorial: "Tutorial",
} as const;

/**
 * One setting: what it is on the left, its value or button on the right
 * (under it on a phone); more of it (a form) below. The line between rows is
 * on the outer box, the id (what a link glows round) on the inner, rounded
 * one: a rounded box with the line would curve the line's ends.
 */
export function Row({
  id,
  title,
  text,
  action,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  text?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div id={id} className="rounded-lg scroll-mt-24">
        <div className="flex flex-col items-start sm:flex-row sm:items-center justify-between gap-3 sm:gap-6">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">{title}</div>
            {text && <div className="mt-0.5 max-w-xl text-[12px] text-ink-faint leading-relaxed">{text}</div>}
          </div>
          {action && <div className="min-w-0 max-w-full sm:flex-shrink-0">{action}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A card of settings: its title, then its rows with a line between each. */
export function Group({ id, title, sub, children }: { id?: string; title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className={`${CARD} scroll-mt-24`}>
      <h2 className={H2}>{title}</h2>
      {sub && <p className="mt-1 text-[12.5px] text-ink-soft">{sub}</p>}
      <div className="mt-5 divide-y divide-line/10">{children}</div>
    </section>
  );
}
