import Link from "next/link";
import { LogoutButton } from "@/components/ui/logout-button";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { PendingLink } from "@/components/ui/pending-nav";
import { Mascot } from "@/components/ui/mascot";
import { ReplayTutorialButton } from "@/components/tutorial/tutorial";
import { APP_NAME } from "@/lib/brand";
import { ACCOUNT_HREF, BTN, CARD, DANGER_HREF, Group, H2, Row, TEXT } from "./account-parts";
import { PasswordSection } from "./password-section";
import { SignOutElsewhere } from "./sign-out-elsewhere";
import { DeleteAccount, type AccountTeam } from "./delete-account";
import { FeedbackForm, type SentReport } from "./feedback-form";
import { MovedHere } from "./moved-here";

/*
 * Settings → Account (1.34.2, the owner: "account settings needs an
 * overhaul, the report bug thing should be in a separate tab … the settings
 * within account should be easier to access and the danger zone to be in
 * another menu within account settings so you dont accidently or easily go
 * there"). The tab is your sign-in and your devices, a row each with its
 * button; the developer's pages for developers; then one quiet row into the
 * Danger zone, a page of its own. Reporting a bug and the tour moved to
 * Help & feedback.
 */

/** Account: signing in, devices, the developer's pages, and the way into the Danger zone. */
export function AccountOverview({ email, names, developer, twoStep = null }: { email: string; names: string[]; developer: boolean; twoStep?: "app" | "email" | null }) {
  return (
    <div className="space-y-6">
      {/* An old link to what moved (a bookmark of #report) goes where it is now. */}
      <MovedHere />
      <Group title={TEXT.signingIn}>
        <Row id="email" title={TEXT.email} text={TEXT.emailText} action={<span className="block text-[14px] font-semibold break-all sm:text-right">{email}</span>} />
        <PasswordSection email={email} names={names} />
        {/* 1.46.0: the second step every sign-in takes. */}
        <Row
          id="two-step"
          title="Two-step sign-in"
          text={
            twoStep === "app"
              ? "A code from your authenticator app, each time you sign in."
              : twoStep === "email"
                ? `A code by email to ${email}, each time you sign in.`
                : "Not set up yet: you'll be asked to the next time you sign in."
          }
          action={
            <Link href="/two-step/setup?change=1" className={BTN}>
              {twoStep ? "Change" : "Set it up"}
            </Link>
          }
        />
      </Group>

      <Group id="sessions" title={TEXT.devices}>
        <Row
          title={TEXT.thisDevice}
          text={TEXT.thisDeviceText}
          action={
            <LogoutButton className={BTN}>
              Log out
            </LogoutButton>
          }
        />
        <Row title={TEXT.otherDevices} text={TEXT.otherDevicesText} action={<SignOutElsewhere className={BTN} />} />
      </Group>

      {developer && (
        <Group title={TEXT.developer} sub={TEXT.developerText}>
          <DevLink href="/developer" title="Developer">
            The whole app: status, errors and reports, how much the database and storage hold, every team and person.
          </DevLink>
          <DevLink href="/setup" title="App setup">
            What to paste in Supabase, Google, Meta, TikTok and Vercel for this copy of {APP_NAME}, including the sign-in emails.
          </DevLink>
        </Group>
      )}

      {/* Last and quiet: one row into the Danger zone, never the button itself. */}
      <PendingLink
        href={DANGER_HREF}
        navKey="danger"
        className="group flex items-center gap-3.5 rounded-xl border border-line/10 px-5 py-4 hover:border-red/30 hover:bg-red/[0.04] transition-colors"
      >
        <span aria-hidden className="w-9 h-9 rounded-lg bg-surface-2 text-ink-faint group-hover:text-red flex items-center justify-center flex-shrink-0 transition-colors">
          <AlertIcon className="w-[18px] h-[18px]" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold">{TEXT.danger}</span>
          <span className="block text-[12.5px] text-ink-soft">{TEXT.dangerText}</span>
        </span>
        <ChevronRightIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
      </PendingLink>
    </div>
  );
}

function DevLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <Link href={href} className="flex items-center gap-3 rounded-lg -mx-2 px-2 py-2 hover:bg-surface-2 transition-colors">
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-semibold">{title}</span>
          <span className="block text-[12px] text-ink-faint leading-relaxed">{children}</span>
        </span>
        <ChevronRightIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
      </Link>
    </div>
  );
}

/** Account → Danger zone: back to Account, what it is, and deleting the account (still two more steps, each asking). */
export function DangerZone({ email, teams }: { email: string; teams: AccountTeam[] }) {
  return (
    <div className="space-y-5">
      <PendingLink
        href={ACCOUNT_HREF}
        navKey="account"
        className="inline-flex items-center gap-1 -ml-1.5 pl-1 pr-2.5 h-8 rounded-lg text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
      >
        <ChevronLeftIcon className="w-4 h-4" />
        Account
      </PendingLink>
      <div>
        <h2 className="font-display text-[22px] font-semibold leading-tight">{TEXT.danger}</h2>
        <p className="mt-1 text-[13px] text-ink-soft">{TEXT.dangerIntro}</p>
      </div>
      <DeleteAccount email={email} teams={teams} />
    </div>
  );
}

/** Help & feedback: report a bug or an idea (with what you sent before), and Clip's tour again. */
export function HelpTab({ userId, teamId, recent }: { userId: string; teamId: string | null; recent: SentReport[] }) {
  return (
    <div className="space-y-6">
      <section id="report" className={`${CARD} scroll-mt-24`}>
        <h2 className={H2}>{TEXT.report}</h2>
        <p className="text-[12.5px] text-ink-soft mt-1 mb-4">Something broken, or an idea that would make {APP_NAME} better? Only the developer sees what you send.</p>
        <FeedbackForm userId={userId} teamId={teamId} recent={recent} />
      </section>
      <section id="tutorial" className={`${CARD} scroll-mt-24`}>
        <h2 className={H2}>{TEXT.tutorial}</h2>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Mascot size={56} className="flex-shrink-0 -my-1" />
            <p className="text-[13.5px] text-ink-soft leading-relaxed">Clip&rsquo;s one-minute tour of {APP_NAME}: where everything is and how a video gets from idea to posted.</p>
          </div>
          <ReplayTutorialButton className="rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] hover:brightness-110 flex-shrink-0" />
        </div>
      </section>
    </div>
  );
}
