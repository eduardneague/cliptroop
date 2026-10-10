import { Skeleton } from "@/components/ui/skeleton";
import { ROLES } from "@/lib/permissions/roles";

/** Team settings tabs, in order ("Defaults" is for masters only). Shared by the page, its loading screen and its skeletons. */
export const TEAM_TABS = [
  { id: "members", label: "Members" },
  { id: "defaults", label: "Defaults", masterOnly: true },
  { id: "objectives", label: "Objectives" },
  { id: "accounts", label: "Connected accounts" },
  { id: "appearance", label: "Appearance" },
  { id: "team", label: "Team" },
] as const;
export type TeamTab = (typeof TEAM_TABS)[number]["id"];

export function teamTab(raw: string | null | undefined): TeamTab {
  return TEAM_TABS.some((t) => t.id === raw) ? (raw as TeamTab) : "members";
}

const H2 = "text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft";

/** A titled card, the way the Team page draws its sections. */
function Card({ title, text, tone = "plain", children }: { title: string; text?: string; tone?: "plain" | "danger"; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border p-6 ${tone === "danger" ? "border-red/20 bg-red/5" : "border-line/10 bg-surface"}`}>
      <h2 className={`${H2} ${tone === "danger" ? "!text-red" : ""} ${text ? "mb-1" : "mb-4"}`}>{title}</h2>
      {text && <p className="text-[12px] text-ink-soft mb-5">{text}</p>}
      {children}
    </section>
  );
}

/** A label above a field. */
function Field({ w = "w-24", h = "h-10" }: { w?: string; h?: string }) {
  return (
    <div>
      <Skeleton className={`h-3 ${w} mb-2`} />
      <Skeleton className={`${h} w-full rounded-lg`} />
    </div>
  );
}

/**
 * One Team settings tab while it loads (switching tabs, or the page opening):
 * the same sections with their real titles, only the team's data shimmers.
 */
export function TeamTabSkeleton({ tab }: { tab: TeamTab }) {
  if (tab === "defaults") {
    const label = "text-[12px] font-semibold text-ink-soft mb-2";
    const people = (names: string[], cols: string) => (
      <div className={`grid gap-x-3 gap-y-3 ${cols}`}>
        {names.map((n) => (
          <div key={n}>
            <div className="text-[11.5px] text-ink-soft mb-1.5">{n}</div>
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        ))}
      </div>
    );
    return (
      <div className="grid gap-6 xl:grid-cols-2 items-start" aria-hidden>
        <Card title="Short videos" text="Your daily rhythm, and who works on new shorts by default.">
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {["Shorts per day", "Post on weekends", "Time zone"].map((n) => (
                <div key={n}>
                  <div className={label}>{n}</div>
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-11 rounded-full flex-shrink-0" />
              <span className="text-[13px] font-semibold">Roll unposted shorts forward</span>
            </div>
            <div>
              <div className={label}>Default type for new shorts</div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-20 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-16 rounded-lg" />
              </div>
            </div>
            <div>
              <div className={label}>YouTube description</div>
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
            <div>
              <div className={label}>Default people for new shorts</div>
              {people(["Scripter", "Editor", "Reviewer", "Scheduler"], "grid-cols-2 sm:grid-cols-4")}
            </div>
          </div>
        </Card>
        <Card title="Long videos" text="What every new long video starts with.">
          <div className="space-y-5">
            <div>
              <div className={label}>Default description</div>
              <Skeleton className="h-[138px] w-full rounded-lg" />
            </div>
            <div>
              <div className={label}>Default people</div>
              {people(["Researcher", "Scripter", "Filmer", "Editor", "Packager", "Scheduler"], "grid-cols-2")}
            </div>
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </Card>
        <Card title="Video files" text="Shorts’ uploaded videos take the most space. Once a short is posted everywhere, its files are deleted after this long.">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold">Delete video files after posting</div>
                <div className="text-[11.5px] text-ink-faint">Counted from the last platform a short went out on. Checked every night.</div>
              </div>
              <Skeleton className="h-10 w-40 rounded-lg flex-shrink-0" />
            </div>
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </Card>
        <Card title="Scripts" text="Script → Review → Staging: who’s next when a script is handed on.">
          <div className="space-y-5">
            {["Review", "Staging"].map((n) => (
              <div key={n}>
                <div className="text-[11.5px] font-semibold text-ink-soft mb-0.5">{n}</div>
                <Skeleton className="h-3 w-3/4 mb-2" />
                <Skeleton className="h-8 w-32 rounded-lg" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }
  if (tab === "objectives") {
    return (
      <section className="rounded-xl border border-line/10 bg-surface p-6" aria-hidden>
        <div className="flex items-start gap-3 flex-wrap mb-5">
          <div className="flex-1 min-w-[min(100%,16rem)]">
            <h2 className={`${H2} mb-1`}>Objectives</h2>
            <Skeleton className="h-3 w-full max-w-xl mt-2" />
            <Skeleton className="h-3 w-2/3 max-w-md mt-1.5" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="rounded-2xl border border-line/15 divide-y divide-line/10 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className={`h-3.5 ${["w-40", "w-52", "w-36"][i]}`} />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <div className="hidden md:block w-[300px] space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (tab === "accounts") {
    return (
      <Card title="Connected accounts" text="Where approved shorts get posted, and where Analytics reads its numbers. Sign-ins are stored encrypted and never leave the server.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
          {["YouTube", "Instagram", "TikTok", "Facebook"].map((name) => (
            <div key={name} className="rounded-xl border border-line/10 bg-surface-2/40 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="w-7 h-7 rounded-lg flex-shrink-0" />
                <span className="text-[15px] font-semibold flex-1">{name}</span>
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="flex items-center gap-2.5">
                <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Skeleton className="h-9 rounded-lg" />
                <Skeleton className="h-9 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }
  if (tab === "appearance") {
    return (
      <div className="grid gap-6 lg:grid-cols-2 items-start" aria-hidden>
        <Card title="Colors" text="The colours for shorts and long videos, used everywhere in the app.">
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              {["Shorts", "Long videos"].map((n) => (
                <div key={n} className="space-y-2.5">
                  <div className="text-[12px] font-semibold text-ink-soft">{n}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Array.from({ length: 11 }, (_, i) => (
                      <Skeleton key={i} className="w-8 h-8 rounded-lg" />
                    ))}
                  </div>
                  <Skeleton className="h-9 w-full max-w-sm rounded-lg" />
                </div>
              ))}
            </div>
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </Card>
        <section className="rounded-xl border border-line/10 bg-surface p-6">
          <h2 className={`${H2} mb-1`}>Role colors</h2>
          <p className="text-[12px] text-ink-soft mb-4">Used for role badges, @mentions, and everywhere a role shows up.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ROLES.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line/10 px-3 py-3">
                <Skeleton className="w-7 h-7 rounded-md flex-shrink-0" />
                <span className="text-[12.5px] font-semibold">{r.name}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }
  if (tab === "team") {
    return (
      <div className="grid gap-6 lg:grid-cols-2 items-start" aria-hidden>
        <Card title="Workspace">
          <div className="mb-4">
            <Field w="w-24" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-2xl" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </Card>
        <Card title="Transfer ownership" tone="danger" text="Send someone a request to become this team’s owner. Nothing changes until they accept. You stay the owner until then.">
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="mt-5 pt-5 border-t border-red/20">
            <h3 className="text-[12px] font-bold text-red mb-1">Delete team</h3>
            <p className="text-[12px] text-ink-soft mb-3">Permanent. Every project, comment, and member goes with it.</p>
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </Card>
      </div>
    );
  }
  return (
    <section aria-hidden>
      <div className="flex items-center gap-2 mb-3">
        <h2 className={H2}>Members</h2>
        <Skeleton className="h-5 w-7 rounded-full" />
        <span className="flex-1" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="rounded-2xl border border-line/15 bg-surface divide-y divide-line/10 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className={`h-3.5 ${["w-32", "w-40", "w-28", "w-36", "w-24", "w-32"][i]}`} />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="hidden sm:flex items-center gap-1.5">
              <Skeleton className="h-6 w-16 rounded-full" />
              {i % 2 === 0 && <Skeleton className="h-6 w-20 rounded-full" />}
            </div>
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        ))}
      </div>
    </section>
  );
}
