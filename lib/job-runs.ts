import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * The morning jobs' log (job_runs, migration 0082): a row when a run starts,
 * filled in when it finishes. A row that never gets its finish ran out of
 * time (the platform's function limit), which the status check reports.
 * Best effort: before 0082 (or with the database busy) the job runs anyway.
 */

type Admin = ReturnType<typeof createAdminClient>;

export async function jobStart(admin: Admin, job: "analytics" | "cleanup", team: string | null = null, platform: string | null = null): Promise<number | null> {
  try {
    const { data, error } = await admin.from("job_runs").insert({ job, team_id: team, platform }).select("id").single();
    return error ? null : ((data as { id: number }).id ?? null);
  } catch {
    return null;
  }
}

export async function jobEnd(admin: Admin, id: number | null, ok: boolean, detail: string | null) {
  if (id === null) return;
  try {
    await admin
      .from("job_runs")
      .update({ finished_at: new Date().toISOString(), ok, detail: detail ? detail.slice(0, 2000) : null })
      .eq("id", id);
  } catch {}
}

/** Runs older than 30 days go (the daily clean-up). */
export async function pruneJobRuns(admin: Admin) {
  try {
    await admin.from("job_runs").delete().lt("started_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  } catch {}
}
