import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getTeamsAndCurrent } from "@/lib/teams";
import { displayName } from "@/lib/avatar";
import { LockIcon } from "@/components/ui/icons";
import { getBusinessGate, loadPeople, loadYear } from "@/modules/business/lib/server";
import { LANG_COOKIE, langOf, pick, words } from "@/modules/business/lib/i18n";
import { todayRo, yearOf } from "@/modules/business/lib/money";
import { BusinessApp } from "@/modules/business/components/business-app";
import { businessTab } from "@/modules/business/components/tabs";

export const dynamic = "force-dynamic";

const W = words({
  title: { en: "Business", ro: "Contabilitate" },
  noTeam: { en: "Create a team first.", ro: "Creează mai întâi o echipă." },
  theOwner: { en: "the team's owner", ro: "proprietarul echipei" },
  lockedTitle: { en: (name: string) => `Business is ${name}’s`, ro: (name: string) => `Contabilitatea o gestionează ${name}` },
  lockedBody: {
    en: (team: string, name: string) =>
      `${team}’s registers (cash book, fiscal register, inventory) open for the team’s owner and the people they choose. Ask ${name} to let you in from Business → Settings → Access.`,
    ro: (team: string, name: string) =>
      `Registrele echipei ${team} (registrul-jurnal, evidența fiscală, inventarul) le pot deschide doar proprietarul echipei și persoanele alese de acesta. Cere acces de la ${name}: se acordă din Contabilitate → Setări → Acces.`,
  },
});
const pageLang = async () => langOf((await cookies()).get(LANG_COOKIE)?.value);

/** The tab's title in the page's language. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: W.title[await pageLang()] };
}

/**
 * Business (1.42.0): the team's PFA registers. The owner (Oct 28 2026): "vreau să integrez în aplicație aceste 3
 * registre… doar pentru echipe pe care eu le selectez din baza de date ca developer… o pagină de business, construită
 * în engleză". The page exists only where a developer turned Business on (Developer → Features); there the team's
 * owner and the people they let in (view, or edit too) open it; everyone else on the team sees that it's the owner's.
 * One year at a time (?year=); the tabs (?tab=) share the year's books, so moving between them is instant. In English
 * or Romanian: the page's switch keeps it in a cookie, read here so the page opens in it.
 */
export default async function BusinessPage({ searchParams }: { searchParams: Promise<{ tab?: string; year?: string }> }) {
  const { tab: tabParam, year: yearParam } = await searchParams;
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const lang = await pageLang();
  const w = pick(W, lang);
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">{w.noTeam}</div>;
  const gate = await getBusinessGate(supabase, currentTeam.id);
  // Not on for this team (or the database is older than 0120): there's no such page.
  if (!gate.on) notFound();
  const { data: team } = await supabase.from("teams").select("owner_id").eq("id", currentTeam.id).maybeSingle();
  const ownerId = (team as { owner_id?: string } | null)?.owner_id ?? "";
  if (!gate.access) {
    const { data: owner } = ownerId ? await supabase.from("profiles").select("username, full_name, email").eq("id", ownerId).maybeSingle() : { data: null };
    const name = owner ? displayName((owner as { username: string | null }).username, (owner as { full_name: string | null }).full_name, (owner as { email: string | null }).email) : w.theOwner;
    return (
      <div className="px-4 sm:px-8 py-10 max-w-xl mx-auto">
        <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center">
            <LockIcon className="w-6 h-6 text-ink-soft" />
          </span>
          <h1 className="mt-4 font-display text-[22px] font-semibold">{w.lockedTitle(name)}</h1>
          <p className="mt-2 text-[13.5px] text-ink-soft leading-relaxed">{w.lockedBody(currentTeam.name, name)}</p>
        </div>
      </div>
    );
  }
  const today = todayRo();
  const asked = Number(yearParam);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : yearOf(today);
  const [books, people] = await Promise.all([loadYear(supabase, currentTeam.id, year, lang), gate.access === "owner" ? loadPeople(supabase, currentTeam.id, ownerId, lang) : Promise.resolve(null)]);
  return (
    <BusinessApp
      key={`${currentTeam.id}:${year}`}
      teamId={currentTeam.id}
      teamName={currentTeam.name}
      me={user.id}
      access={gate.access}
      initialTab={businessTab(tabParam)}
      initialLang={lang}
      today={today}
      data={books}
      people={people?.people ?? null}
    />
  );
}
