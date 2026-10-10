import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotifications, teamMeta } from "@/lib/notify";
import { METRICS, cleanFilters, formatAmount, isMetricId, unitFor, type MetricId } from "./metrics";
import { dayInZone, localNow, periodEnd, periodLabel, periodPhrase, periodStart, shiftPeriod, daysBetween } from "./periods";
import { hitsFor } from "./hits";
import { periodResult } from "./compute";
import { loadSources } from "./sources";
import { OBJECTIVE_COLS, kindOf, loadOverrides, loadPeople, needsOf, targetIn, teamTimezone, winnerView, type ObjectiveRow } from "./board";

/*
 * The server's own count (admin client): after anything that can move an
 * objective (a short or long video posted, a step done, the morning's
 * platform numbers), every 10 minutes as a safety net (the status timer),
 * and when someone opens the page or the widget (at most every 30 s).
 *
 * It saves each objective's current period (and the one before, while late
 * posts or the morning's numbers can still finish it) through
 * objective_record (0078), which claims a win once per period. For each new
 * win the whole team gets a congratulations notification (+ push); everyone
 * looking at the app sees the confetti through realtime.
 */

type Won = { objective_id: string; period_start: string; value: number | string; target: number; winner: unknown };

/** What kinds of change can move which metrics (so a hook only recounts what it could have moved). */
export type Change = "posted" | "stage" | "created" | "people" | "numbers" | "any";
const MOVES: Record<Change, MetricId[] | null> = {
  posted: ["shorts_posted", "longs_posted", "posts_published"],
  stage: ["shorts_edited", "shorts_approved", "longs_filmed", "longs_edited", "longs_posted", "shorts_posted"],
  created: ["shorts_created", "longs_created"],
  people: null,
  numbers: ["views", "followers", "likes", "watch_hours"],
  any: null,
};

export async function syncObjectives(
  teamId: string,
  opts: {
    /** Objectives a master just set or changed: a target that's already met is recorded without a celebration. */
    quiet?: string[];
    /** Skip if the team was counted less than this many seconds ago. */
    throttle?: number;
    change?: Change;
  } = {}
): Promise<{ checked: number; wins: number; skipped?: boolean; error?: string }> {
  const admin = createAdminClient();
  if (opts.throttle) {
    const { data: ok, error } = await admin.rpc("objective_claim_sync", { p_team: teamId, p_seconds: opts.throttle });
    if (error || !ok) return { checked: 0, wins: 0, skipped: true };
  }
  const { data, error } = await admin.from("objectives").select(OBJECTIVE_COLS).eq("team_id", teamId).is("paused_at", null).limit(100);
  if (error || !data?.length) return { checked: 0, wins: 0, ...(error ? { error: error.message } : {}) };
  const only = MOVES[opts.change ?? "any"];
  const quiet = new Set(opts.quiet ?? []);
  const rows = (data as ObjectiveRow[]).filter((r) => isMetricId(r.metric) && (!only || only.includes(r.metric as MetricId) || quiet.has(r.id)));
  if (!rows.length) return { checked: 0, wins: 0 };

  const [tz, overrides, people] = await Promise.all([teamTimezone(admin, teamId), loadOverrides(admin, teamId), loadPeople(admin, teamId)]);
  const now = localNow(tz);
  // The period before is still checked for its first days: a post just before
  // midnight, or the morning's platform numbers for its last day.
  const periodsOf = (r: ObjectiveRow) => {
    const kind = kindOf(r.period);
    const cur = periodStart(kind, now.day);
    const prev = shiftPeriod(kind, cur, -1);
    const lateWindow = Math.max(2, METRICS[r.metric as MetricId].lagDays + 1);
    const created = dayInZone(r.created_at, tz);
    return (daysBetween(cur, now.day) <= lateWindow && periodEnd(kind, prev) >= created ? [prev, cur] : [cur]).map((s) => ({ start: s, end: periodEnd(kind, s) }));
  };
  const from = rows.map((r) => periodsOf(r)[0].start).sort()[0];
  const src = await loadSources(admin, teamId, needsOf(rows), from, now.day, tz);

  const payload: Record<string, unknown>[] = [];
  for (const r of rows) {
    const metric = r.metric as MetricId;
    const filters = cleanFilters(metric, r.filters);
    const periods = periodsOf(r);
    const hits = hitsFor({ metric, filters }, src, periods[0].start, now.day);
    for (const p of periods) {
      const res = periodResult(hits, p.start, p.end, targetIn(r, overrides, p.start));
      payload.push({
        objective_id: r.id,
        period_start: p.start,
        period_end: p.end,
        target: res.target,
        value: res.value,
        reached_at: res.reachedAt,
        winner: winnerView(res.winner, people),
        quiet: quiet.has(r.id),
      });
    }
  }

  const { data: won, error: recErr } = await admin.rpc("objective_record", { p_rows: payload });
  if (recErr) {
    console.error("[objectives] record", recErr.message);
    return { checked: rows.length, wins: 0, error: recErr.message };
  }
  const wins = ((won ?? []) as Won[]).filter((w) => w && w.objective_id);
  if (wins.length) await congratulate(admin, teamId, rows, wins, now.day);
  return { checked: rows.length, wins: wins.length };
}

/** "🎉 Instagram-only reels: 3 of 3 reels this week." to everyone on the team (and their phones). */
async function congratulate(admin: ReturnType<typeof createAdminClient>, teamId: string, rows: ObjectiveRow[], wins: Won[], today: string) {
  const [{ data: members }, team] = await Promise.all([admin.from("team_members").select("user_id").eq("team_id", teamId).eq("status", "active"), teamMeta(admin, teamId)]);
  const recipients = [...new Set(((members ?? []) as { user_id: string | null }[]).map((m) => m.user_id).filter((u): u is string => !!u))];
  if (!recipients.length) return;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const notes = wins.flatMap((w) => {
    const r = byId.get(w.objective_id);
    if (!r) return [];
    const kind = kindOf(r.period);
    const value = Number(w.value);
    const target = Number(w.target);
    const filters = cleanFilters(r.metric as MetricId, r.filters);
    const label = periodLabel(kind, w.period_start, today);
    const valueText = formatAmount(r.metric, value);
    const targetText = formatAmount(r.metric, target);
    const unit = unitFor(r.metric, target, filters);
    const body = `🎉 ${r.title}: ${valueText} of ${targetText} ${unit} ${periodPhrase(label)}. Goal reached, well done everyone!`;
    const winner = w.winner && typeof w.winner === "object" ? w.winner : null;
    return recipients.map((recipient_id) => ({
      recipient_id,
      kind: "objective_reached",
      body,
      metadata: {
        team,
        objectiveId: r.id,
        objectiveTitle: r.title,
        color: r.color,
        periodLabel: label,
        periodStart: w.period_start,
        value,
        target,
        valueText,
        targetText,
        unit,
        winner,
        href: `/objectives?o=${r.id}`,
      },
    }));
  });
  if (notes.length) await sendNotifications(notes);
}

const log = (where: string) => (e: unknown) => console.error(`[objectives] ${where}`, e instanceof Error ? e.message : e);

/**
 * Count again after the response is sent (never slows anyone down, never
 * breaks the action that called it).
 */
export function queueObjectivesSync(teamId: string | null | undefined, opts: Parameters<typeof syncObjectives>[1] = {}) {
  if (!teamId) return;
  const run = () => syncObjectives(teamId, opts).then(() => undefined, log("sync"));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** The same, for a short or a long video (its team is looked up first). */
export function queueObjectivesSyncFor(kind: "short" | "long", id: string | null | undefined, change: Change = "any") {
  if (!id) return;
  const run = async () => {
    const { data } = await createAdminClient().from(kind === "short" ? "short_videos" : "long_video_projects").select("team_id").eq("id", id).maybeSingle();
    const teamId = (data as { team_id?: string } | null)?.team_id;
    if (teamId) await syncObjectives(teamId, { change });
  };
  try {
    after(() => run().catch(log("sync for")));
  } catch {
    void run().catch(log("sync for"));
  }
}

/**
 * The safety net (the status timer, every 10 minutes): every team with an
 * active objective that hasn't been counted in the last 5 minutes, within a
 * time budget.
 */
export async function syncAllObjectives(budgetMs = 15_000): Promise<{ teams: number; wins: number }> {
  const started = Date.now();
  const { data, error } = await createAdminClient().from("objectives").select("team_id").is("paused_at", null).limit(5000);
  if (error || !data?.length) return { teams: 0, wins: 0 };
  const teams = [...new Set((data as { team_id: string }[]).map((r) => r.team_id))];
  let wins = 0;
  let done = 0;
  for (const t of teams) {
    if (Date.now() - started > budgetMs) break;
    try {
      const r = await syncObjectives(t, { throttle: 300 });
      wins += r.wins;
      done++;
    } catch (e) {
      log("safety net")(e);
    }
  }
  return { teams: done, wins };
}
