"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, type PipelineStage } from "@/lib/permissions/roles";
import { confirmPassword } from "@/lib/auth/confirm-password";
import { queueObjectivesSync, queueObjectivesSyncFor } from "@/modules/objectives/lib/sync";
import { STAGE_ORDER } from "@/modules/long-videos/lib/stages";
import { removeLongVideo } from "@/modules/long-videos/lib/remove-video";

/*
 * Long videos from the list, one or several (1.40.0, as the shorts' 1.38.0: the owner, "i want this same logic to apply
 * to long videos too"). Moving them to a step: a master's correction, nobody is told, each on its own and each saying
 * where it came from (Undo). Deleting several at once: masters only, and only with their password typed again ("for
 * longs deleting in bulk should require you to input the password and only the master can do that … to ensure you
 * dont delete things by accident, or if someone takes charge of your account").
 */

type Result<T = object> = ({ error?: undefined } & T) | { error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LongMove = { id: string; to: PipelineStage };
export type LongMoves = {
  moved: { id: string; number: number; from: PipelineStage; to: PipelineStage }[];
  failed: { id: string; number: number | null; error: string }[];
};

/** The teams (of these) where the person asking is a Master. */
async function masterTeams(supabase: Awaited<ReturnType<typeof createClient>>, teams: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(
    [...new Set(teams)].map(async (t) => {
      const m = await getMembership(supabase, t);
      if (isMaster(m?.roles ?? [])) out.add(t);
    })
  );
  return out;
}

export async function moveLongVideosStage(moves: LongMove[]): Promise<Result<LongMoves>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!Array.isArray(moves) || moves.length === 0) return { moved: [], failed: [] };
  if (moves.length > 200) return { error: "Move at most 200 videos at once." };
  if (!moves.every((m) => m && typeof m.id === "string" && UUID.test(m.id) && STAGE_ORDER.includes(m.to))) return { error: "Couldn't move those videos. Refresh and try again." };
  if (moves.some((m) => m.to === "done")) return { error: "Posted comes by itself, once the video is marked posted." };

  const ids = [...new Set(moves.map((m) => m.id))];
  const { data: rows } = await supabase.from("long_video_projects").select("id, team_id, entry_number, stage").in("id", ids);
  const masters = await masterTeams(supabase, (rows ?? []).map((r) => r.team_id as string));

  const out: LongMoves = { moved: [], failed: [] };
  const teams = new Set<string>();
  for (const m of moves) {
    const v = (rows ?? []).find((r) => r.id === m.id);
    const number = (v?.entry_number as number | undefined) ?? null;
    const fail = (error: string) => out.failed.push({ id: m.id, number, error });
    if (!v) {
      fail("Not found.");
      continue;
    }
    const from = v.stage as PipelineStage;
    if (from === m.to) continue;
    if (!masters.has(v.team_id as string)) {
      fail("Only the master can move long videos.");
      continue;
    }
    if (from === "done") {
      fail("Posted and locked.");
      continue;
    }
    // Only if it's still where it was read (someone else may have moved it meanwhile).
    const { data, error } = await supabase.from("long_video_projects").update({ stage: m.to }).eq("id", m.id).eq("stage", from).select("id");
    if (error) {
      fail("Couldn't move it. Try again.");
      continue;
    }
    if (!data?.length) {
      fail("It moved on meanwhile. Refresh and try again.");
      continue;
    }
    out.moved.push({ id: m.id, number: number ?? 0, from, to: m.to });
    teams.add(v.team_id as string);
  }
  if (out.moved.length) {
    revalidatePath("/videos");
    revalidatePath("/calendar");
    for (const m of out.moved) {
      revalidatePath(`/videos/${m.id}`);
      queueObjectivesSyncFor("long", m.id, "stage");
    }
  }
  return out;
}

export type LongDeleted = { deleted: { id: string; number: number }[]; failed: { id: string; number: number | null; error: string }[] };
/** `password`: the error is about the password (the window keeps it open, for another try). */
export type LongDeleteResult = (LongDeleted & { error?: undefined }) | { error: string; password?: true };

/**
 * Several long videos deleted for good, with their files. The password first (`confirmPassword`: a wrong one says so
 * and nothing is touched; too many wrong ones wait, as signing in does), then a master of each video's own team (read
 * here, never taken from the browser), then each with its files (`removeLongVideo`). At most 50 at once.
 */
export async function deleteLongVideos(ids: string[], password: string): Promise<LongDeleteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!Array.isArray(ids) || ids.length === 0) return { deleted: [], failed: [] };
  if (ids.length > 50) return { error: "Delete at most 50 long videos at once." };
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) return { error: "Couldn't delete those videos. Refresh and try again." };

  const checked = await confirmPassword(user, password);
  if ("error" in checked) return { error: checked.error, password: true };

  const wanted = [...new Set(ids)];
  const { data: rows } = await supabase.from("long_video_projects").select("id, team_id, entry_number").in("id", wanted);
  const masters = await masterTeams(supabase, (rows ?? []).map((r) => r.team_id as string));
  const admin = createAdminClient();
  const out: LongDeleted = { deleted: [], failed: [] };
  const teams = new Set<string>();
  for (const id of wanted) {
    const v = (rows ?? []).find((r) => r.id === id);
    const number = (v?.entry_number as number | undefined) ?? null;
    if (!v) {
      out.failed.push({ id, number, error: "Not found." });
      continue;
    }
    if (!masters.has(v.team_id as string)) {
      out.failed.push({ id, number, error: "Only the master can delete long videos." });
      continue;
    }
    const r = await removeLongVideo(admin, { id, teamId: v.team_id as string });
    if (r.error) out.failed.push({ id, number, error: r.error });
    else {
      out.deleted.push({ id, number: number ?? 0 });
      teams.add(v.team_id as string);
    }
  }
  if (out.deleted.length) {
    // Not /videos itself: the list takes them away first (struck through, gone), then draws itself again.
    revalidatePath("/calendar");
    for (const t of teams) queueObjectivesSync(t);
  }
  return out;
}
