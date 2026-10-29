import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/avatar";
import { FeatureTeams, type FeatureTeam } from "./features-client";
import { card, h2 } from "./ui";

/**
 * Developer → Features (1.42.0): features only some teams get, switched on team by team. Today: Business, a PFA's
 * registers (the owner: "doar pentru echipe pe care eu le selectez din baza de date ca developer… o metodă prin care
 * pot da access la echipă la feature-ul ăsta ușor"). Read with the server's key (the developer check came first, on
 * the page); written only by setTeamFeature (actions.ts).
 */
export async function FeaturesTab() {
  const admin = createAdminClient();
  const [teams, features, members] = await Promise.all([
    admin.from("teams").select("id, name, color, logo_url, owner_id, created_at").order("name").limit(2000),
    admin.from("team_features").select("team_id, feature, enabled_at"),
    admin.from("team_members").select("team_id").eq("status", "active").limit(20000),
  ]);
  if (teams.error) return <Problem text="The teams couldn't be read. Try again in a moment." />;
  const ready = !features.error;
  const ownerIds = [...new Set(((teams.data ?? []) as { owner_id: string | null }[]).map((t) => t.owner_id).filter((x): x is string => !!x))];
  const { data: owners } = ownerIds.length ? await admin.from("profiles").select("id, username, full_name, email").in("id", ownerIds) : { data: [] };
  const ownerBy = new Map(((owners ?? []) as { id: string; username: string | null; full_name: string | null; email: string | null }[]).map((p) => [p.id, p]));
  const count = new Map<string, number>();
  for (const m of (members.data ?? []) as { team_id: string }[]) count.set(m.team_id, (count.get(m.team_id) ?? 0) + 1);
  const on = new Map(((features.data ?? []) as { team_id: string; feature: string; enabled_at: string }[]).filter((f) => f.feature === "business").map((f) => [f.team_id, f.enabled_at]));
  const list: FeatureTeam[] = ((teams.data ?? []) as { id: string; name: string; color: string | null; logo_url: string | null; owner_id: string | null }[]).map((t) => {
    const o = t.owner_id ? ownerBy.get(t.owner_id) : undefined;
    return {
      id: t.id,
      name: t.name,
      color: t.color ?? "#E8630D",
      logoUrl: t.logo_url,
      owner: o ? displayName(o.username, o.full_name, o.email) : "—",
      ownerEmail: o?.email ?? null,
      members: count.get(t.id) ?? 0,
      business: on.get(t.id) ?? null,
    };
  });
  return (
    <div className="space-y-5">
      <section className={`${card} p-4 sm:p-5`}>
        <h2 className={h2}>Business</h2>
        <p className="mt-2 text-[13px] text-ink-soft leading-relaxed max-w-3xl">
          A PFA&rsquo;s registers: the cash book (Registrul-jurnal de încasări și plăți), the fiscal register (Registrul de evidență fiscală) and the inventory
          (Registrul-inventar), with fixed assets and exports to Excel, CSV and PDF. Turn it on for a team and its owner sees <b className="text-ink">Business</b> in the
          menu at once (they&rsquo;re told); they choose who else sees it. Turned off, the team&rsquo;s registers stay, unseen, until it&rsquo;s on again.
        </p>
        {!ready ? (
          <p className="mt-3 rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5">Run migration 0120 on this database first.</p>
        ) : (
          <div className="mt-4">
            <FeatureTeams teams={list} />
          </div>
        )}
        <details className="mt-4 text-[12.5px] text-ink-soft">
          <summary className="cursor-pointer font-semibold text-ink-soft hover:text-ink">Without this page (Supabase)</summary>
          <p className="mt-2 leading-relaxed max-w-3xl">
            In Supabase → Table Editor → <code className="font-mono text-[12px]">team_features</code>, insert a row with the team&rsquo;s id and{" "}
            <code className="font-mono text-[12px]">business</code> as the feature; delete the row to turn it off. Or in the SQL editor:{" "}
            <code className="font-mono text-[12px] break-all">insert into team_features (team_id, feature) values (&apos;…team id…&apos;, &apos;business&apos;);</code>
          </p>
        </details>
      </section>
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <section className={`${card} p-6 text-center`}>
      <p className="text-[14px] font-semibold">Features aren&rsquo;t available</p>
      <p className="mt-1 text-[13px] text-ink-soft">{text}</p>
    </section>
  );
}
