import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Is this copy's database up to date with the code (1.49.0)? Production ran 1.47.1's code on a database still at 1.27
 * (its migrations only run on a merge into main), and every newer feature failed its own way: "Run migrations 0112 and
 * 0113 first", email codes, deleting an account, the reset links. App setup now says it at the top, from one thing
 * each of these migrations made, newest first, read with the service key. A new migration moves NEWEST and adds its
 * check (tests/db-updates.test.ts holds the list to the files).
 */

type Admin = ReturnType<typeof createAdminClient>;
type Probe = { n: string; what: string; has: (admin: Admin) => Promise<boolean | null> };

/** A missing table or column (Postgres or the API's words for it); anything else is "couldn't tell". */
const missing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|schema cache|could not find/i.test(e.message ?? ""));

async function column(admin: Admin, table: string, cols: string): Promise<boolean | null> {
  const { error } = await admin.from(table).select(cols).limit(1);
  if (!error) return true;
  return missing(error) ? false : null;
}

export const PROBES: Probe[] = [
  {
    n: "0128",
    what: "free access while plans are off (files for teams without a plan)",
    has: async (admin) => {
      const { error } = await admin.rpc("plans_required");
      if (!error) return true;
      return missing(error) || error.code === "PGRST202" ? false : null;
    },
  },
  { n: "0127", what: "changing comments, comments on a whole document, comments over several lines", has: (a) => column(a, "script_comments", "edited_at") },
  {
    n: "0126",
    what: "TikTok's copies of videos (the tiktok-pull bucket)",
    has: async (admin) => {
      const { data, error } = await admin.storage.getBucket("tiktok-pull");
      if (data) return true;
      return error && /not found/i.test(error.message) ? false : null;
    },
  },
  { n: "0125", what: "two-step sign-in's email codes", has: (a) => column(a, "two_step_codes", "user_id") },
  { n: "0124", what: "team plans", has: (a) => column(a, "teams", "plan") },
  { n: "0120", what: "Business", has: (a) => column(a, "team_features", "*") },
  { n: "0119", what: "who may delete videos", has: (a) => column(a, "video_delete_access", "*") },
  { n: "0113", what: "the Filming step of shorts", has: (a) => column(a, "short_videos", "filmer_member_id, filmed_at, footage_path") },
  { n: "0110", what: "Developer → Speed", has: (a) => column(a, "web_vitals", "*") },
  { n: "0105", what: "the sign-in limits (and deleting an account)", has: (a) => column(a, "sign_in_failures", "*") },
  { n: "0093", what: "deleting an account, profile pages, glass looks", has: (a) => column(a, "profiles", "glass_style") },
  { n: "0092", what: "dashboard wallpapers", has: (a) => column(a, "profiles", "glass_ui") },
];

/** The newest migration this code expects. */
export const NEWEST = PROBES[0].n;

export type DbUpdates = { newest: string; missing: { n: string; what: string }[]; unsure: boolean };

/** Which of the checked migrations this database doesn't have yet (oldest first). Never throws. */
export async function readDbUpdates(): Promise<DbUpdates> {
  try {
    const admin = createAdminClient();
    const results = await Promise.all(PROBES.map(async (p) => ({ p, has: await p.has(admin).catch(() => null) })));
    return {
      newest: NEWEST,
      missing: results.filter((r) => r.has === false).map((r) => ({ n: r.p.n, what: r.p.what })).reverse(),
      unsure: results.some((r) => r.has === null),
    };
  } catch {
    return { newest: NEWEST, missing: [], unsure: true };
  }
}
