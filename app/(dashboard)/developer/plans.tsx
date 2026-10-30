import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/avatar";
import { PLAN_FACTS, gbLabel, isPlanId, planPrice, storageGbFor } from "@/lib/plans";
import { PlanTeams, type PlanTeam } from "./plans-client";
import { card, h2 } from "./ui";

/**
 * Developer → Plans (1.45.0): every team's plan and the storage its files take, the teams asking for one first. The
 * owner: "no free trial for now, no free plan for now… each plan should have some storage related to it". A team made
 * by someone who signed up on the website has none: its masters ask (the Plan page), you're told, and you set it here
 * once it's agreed (setTeamPlan, actions.ts). Read with the server's key, after the page's developer check.
 */
export async function PlansTab() {
  const admin = createAdminClient();
  const [teams, members] = await Promise.all([
    admin
      .from("teams")
      .select("id, name, color, logo_url, owner_id, created_at, plan, plan_storage_gb, plan_set_at, plan_requested, plan_requested_at, plan_request_note, plan_requested_by")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("team_members").select("team_id").eq("status", "active").limit(20000),
  ]);
  if (teams.error) {
    const missing = /plan|column|schema cache/i.test(teams.error.message);
    return <Problem text={missing ? "Run migration 0124 on this database first: it adds each team's plan." : "The teams couldn't be read. Try again in a moment."} />;
  }
  type Row = {
    id: string;
    name: string;
    color: string | null;
    logo_url: string | null;
    owner_id: string | null;
    created_at: string;
    plan: string | null;
    plan_storage_gb: number | null;
    plan_set_at: string | null;
    plan_requested: string | null;
    plan_requested_at: string | null;
    plan_request_note: string | null;
    plan_requested_by: string | null;
  };
  const rows = (teams.data ?? []) as Row[];
  const peopleIds = [...new Set(rows.flatMap((t) => [t.owner_id, t.plan_requested_by]).filter((x): x is string => !!x))];
  const { data: people } = peopleIds.length ? await admin.from("profiles").select("id, username, full_name, email").in("id", peopleIds) : { data: [] };
  const who = new Map(((people ?? []) as { id: string; username: string | null; full_name: string | null; email: string | null }[]).map((p) => [p.id, p]));
  const count = new Map<string, number>();
  for (const m of (members.data ?? []) as { team_id: string }[]) count.set(m.team_id, (count.get(m.team_id) ?? 0) + 1);
  // What each team's files take: the same function the team sees (0124), the first 150 teams (newest first).
  const used = new Map<string, number>();
  await Promise.all(
    rows.slice(0, 150).map(async (t) => {
      const { data } = await admin.rpc("team_storage_usage", { p_team: t.id });
      const b = (data as { bytes?: unknown } | null)?.bytes;
      if (typeof b === "number" || (typeof b === "string" && /^\d+$/.test(b))) used.set(t.id, Number(b));
    }),
  );

  const list: PlanTeam[] = rows.map((t) => {
    const plan = isPlanId(t.plan) ? t.plan : null;
    const owner = t.owner_id ? who.get(t.owner_id) : undefined;
    const asker = t.plan_requested_by ? who.get(t.plan_requested_by) : undefined;
    return {
      id: t.id,
      name: t.name,
      color: t.color ?? "#E8630D",
      logoUrl: t.logo_url,
      createdAt: t.created_at,
      owner: owner ? displayName(owner.username, owner.full_name, owner.email) : "—",
      ownerEmail: owner?.email ?? null,
      members: count.get(t.id) ?? 0,
      plan,
      storageOverride: typeof t.plan_storage_gb === "number" ? t.plan_storage_gb : null,
      storageGb: storageGbFor(plan, t.plan_storage_gb),
      usedBytes: used.has(t.id) ? used.get(t.id)! : null,
      setAt: t.plan_set_at,
      requested: isPlanId(t.plan_requested) ? t.plan_requested : null,
      requestedAt: t.plan_requested_at,
      note: t.plan_request_note,
      askedBy: asker ? displayName(asker.username, asker.full_name, asker.email) : null,
      askedByEmail: asker?.email ?? null,
    };
  });
  const asking = list.filter((t) => t.requested && t.requested !== t.plan).length;
  const without = list.filter((t) => !t.plan).length;

  return (
    <div className="space-y-5">
      <section className={`${card} p-4 sm:p-5`}>
        <h2 className={h2}>Plans</h2>
        <p className="mt-2 text-[13px] text-ink-soft leading-relaxed max-w-3xl">
          Studio ({planPrice("studio", false)} a person a month, {planPrice("studio", true)} yearly; {gbLabel(PLAN_FACTS.studio.storageGb)}) or Network (priced with the team; {gbLabel(PLAN_FACTS.network.storageGb)}). A team made by someone who signed up has none: its pages
          show the plans until you set one here, and the database refuses its files and social accounts. Its masters ask from the Plan page; you get a
          notification and an email. Set the plan once it&rsquo;s agreed and paid: the team&rsquo;s masters are told, and it opens at once.
        </p>
        <p className="mt-3 text-[13px] tabular-nums">
          <b>{list.length}</b> {list.length === 1 ? "team" : "teams"} · <b>{asking}</b> asking · <b>{without}</b> without a plan
        </p>
        <div className="mt-4">
          <PlanTeams teams={list} />
        </div>
        <details className="mt-4 text-[12.5px] text-ink-soft">
          <summary className="cursor-pointer font-semibold text-ink-soft hover:text-ink">Without this page (Supabase)</summary>
          <p className="mt-2 leading-relaxed max-w-3xl">
            In the SQL editor: <code className="font-mono text-[12px]">update teams set plan = &apos;studio&apos;, plan_set_at = now() where id = &apos;…&apos;;</code>{" "}
            (<code className="font-mono text-[12px]">null</code> takes it away; <code className="font-mono text-[12px]">plan_storage_gb</code> sets a team&rsquo;s own
            storage).
          </p>
        </details>
      </section>
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return <p className="rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5">{text}</p>;
}
