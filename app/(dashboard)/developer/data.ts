import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * What the developer pages read about the whole app. Everything here uses
 * the service role: call it only after isDeveloper() said yes.
 */

export type UsageTeam = {
  id: string;
  name: string;
  createdAt: string;
  members: number;
  shorts: number;
  longs: number;
  videoFiles: number;
  videoBytes: number;
  files: number;
  storageBytes: number;
  rows: number;
  /** Its share of the database, estimated from its rows in each table. */
  dbBytes: number;
  postsPublished: number;
  lastActivity: string | null;
};
export type UsagePerson = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  createdAt: string;
  lastSignIn: string | null;
  teams: string[];
  videos: number;
  videoBytes: number;
  files: number;
  fileBytes: number;
  tasksDone: number;
};
export type Usage = {
  at: string;
  database: { bytes: number };
  storage: { bytes: number; files: number };
  counts: {
    people: number;
    people7: number;
    people30: number;
    newPeople30: number;
    teams: number;
    shorts: number;
    longs: number;
    videoFiles: number;
    videoBytes: number;
    videoFilesCleaned: number;
    scripts: number;
    postsPublished: number;
    tasksDone: number;
  };
  buckets: { id: string; files: number; bytes: number; last: string | null }[];
  tables: { schema: string; name: string; bytes: number; rows: number; exact: boolean }[];
  uploads: { day: string; files: number; bytes: number }[];
  teams: UsageTeam[];
  people: UsagePerson[];
};

/** Everything stored, in one call (developer_usage(), migration 0075). */
export async function loadUsage(): Promise<{ usage: Usage | null; error: string | null }> {
  const { data, error } = await createAdminClient().rpc("developer_usage");
  if (error) return { usage: null, error: /developer_usage|function|schema cache/i.test(error.message) ? "Usage needs migration 0075 on this database." : error.message };
  return { usage: data as Usage, error: null };
}

/**
 * The Supabase plan's included amounts (supabase.com/pricing, Oct 2026).
 * SUPABASE_PLAN=pro on a project that pays for Pro; anything else = Free.
 */
export function planLimits() {
  const pro = (process.env.SUPABASE_PLAN || "").trim().toLowerCase() === "pro";
  const GB = 1024 ** 3;
  return pro
    ? { name: "Pro", database: 8 * GB, storage: 100 * GB, egress: "250 GB", people: "100,000", upload: "500 GB" }
    : { name: "Free", database: 500 * 1024 ** 2, storage: 1 * GB, egress: "5 GB", people: "50,000", upload: "50 MB" };
}

/** This project's usage page in Supabase (egress and sign-ins are only counted there). */
export function supabaseUsageUrl() {
  const host = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
    } catch {
      return "";
    }
  })();
  const ref = /^([a-z0-9]{16,})\.supabase\.co$/.exec(host)?.[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}/usage` : "https://supabase.com/dashboard";
}

const BUCKETS: Record<string, string> = {
  "review-videos": "Short videos (uploads for review and posting)",
  "package-thumbs": "Long video thumbnails (Package)",
  thumbnails: "Long video thumbnails (older)",
  "mockup-library": "Mockup library",
  "comment-attachments": "Comment attachments",
  "script-images": "Pictures in scripts",
  "script-sketches": "Editing idea sketches",
  "team-logos": "Team logos",
  avatars: "Profile pictures",
  feedback: "Bug report files",
};
export const bucketLabel = (id: string) => BUCKETS[id] ?? id;

/** App-wide posting in the last / next 24 hours, and accounts to reconnect. */
export async function postingPulse() {
  const admin = createAdminClient();
  const now = Date.now();
  const ago = new Date(now - 24 * 3_600_000).toISOString();
  const ahead = new Date(now + 24 * 3_600_000).toISOString();
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const [published, failed, scheduled, reconnect] = await Promise.all([
    count(admin.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", ago)),
    count(admin.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", ago)),
    count(admin.from("social_posts").select("id", { count: "exact", head: true }).in("status", ["scheduled", "uploading", "processing", "waiting"]).lte("scheduled_at", ahead)),
    count(admin.from("social_accounts").select("id", { count: "exact", head: true }).eq("status", "needs_reconnect")),
  ]);
  return { published, failed, scheduled, reconnect };
}
