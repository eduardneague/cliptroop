import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { relativeTime } from "@/lib/relative-time";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { getShortDetail, listTeamPeople } from "@/modules/short-videos/lib/queries";
import { ScriptersButton } from "@/modules/short-videos/components/scripters-button";
import { getOrCreateShortScript } from "@/modules/scripts/lib/queries";
import { ScriptEditor } from "@/modules/scripts/components/script-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = await getShortDetail(id);
  return { title: short ? `Script · #${short.number} ${short.title}` : "Script" };
}

export default async function ShortScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = await getShortDetail(id);
  if (!short) notFound();

  const supabase = await createClient();
  const membership = await getMembership(supabase, short.teamId);
  const roles = membership?.roles ?? [];
  // Masters, plus this short's scripters (default scripter + anyone added).
  const canEdit = isMaster(roles) || (!!membership && short.scripterIds.includes(membership.teamMemberId));

  const [script, people] = await Promise.all([getOrCreateShortScript(id, canEdit), listTeamPeople(short.teamId)]);
  // Masters and schedulers decide who the scripters are.
  const canManageScripters = isMaster(roles) || roles.includes("publisher");

  if (!script) {
    return (
      <div className="px-4 sm:px-10 py-8 max-w-2xl mx-auto">
        <Link href={`/shorts/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-5">
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          #{short.number} {short.title}
        </Link>
        <p className="rounded-xl border border-line/10 bg-surface px-5 py-4 text-[13.5px] text-ink-soft">
          No script has been written for this short yet.
        </p>
      </div>
    );
  }

  return (
    <ScriptEditor
      scriptId={script.id}
      teamId={script.teamId}
      initialContent={script.content}
      initialVersion={script.version}
      canEdit={canEdit}
      title={short.title}
      number={short.number}
      backHref={`/shorts/${id}`}
      backLabel="Back to the short"
      topBarExtra={
        <ScriptersButton
          shortId={id}
          number={short.number}
          people={people}
          scripterIds={short.scripterIds}
          canManage={canManageScripters}
        />
      }
      lastEdited={
        script.updatedBy && script.version > 1
          ? `Last edited by ${script.updatedBy.name}, ${relativeTime(script.updatedAt)}`
          : null
      }
    />
  );
}
