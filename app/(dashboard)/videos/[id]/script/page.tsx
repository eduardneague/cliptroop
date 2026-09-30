import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { relativeTime } from "@/lib/relative-time";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { getProject } from "@/modules/long-videos/lib/queries";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import { ScriptersButton } from "@/modules/short-videos/components/scripters-button";
import { getOrCreateLongScript } from "@/modules/scripts/lib/queries";
import { ScriptEditor } from "@/modules/scripts/components/script-editor";
import { setLongScripter } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? `Script · #${project.entry_number} ${project.title}` : "Script" };
}

/** Same script editor as shorts: the video's scripters and masters can edit. */
export default async function LongScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const supabase = await createClient();
  const [membership, { data: scripterRows }, people] = await Promise.all([
    getMembership(supabase, project.team_id),
    supabase.from("long_video_scripters").select("team_member_id").eq("project_id", id),
    listTeamPeople(project.team_id),
  ]);
  const roles = membership?.roles ?? [];
  const scripterIds = (scripterRows ?? []).map((r) => r.team_member_id as string);
  const canEdit = isMaster(roles) || (!!membership && scripterIds.includes(membership.teamMemberId));
  const script = await getOrCreateLongScript(id, canEdit);

  if (!script) {
    return (
      <div className="px-4 sm:px-10 py-8 max-w-2xl mx-auto">
        <Link href={`/videos/${id}?tab=script`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-5">
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          #{project.entry_number} {project.title}
        </Link>
        <p className="rounded-xl border border-line/10 bg-surface px-5 py-4 text-[13.5px] text-ink-soft">No script has been written for this video yet.</p>
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
      title={project.title}
      number={project.entry_number}
      backHref={`/videos/${id}?tab=script`}
      backLabel="Back to the video"
      topBarExtra={
        <ScriptersButton
          shortId={id}
          number={project.entry_number}
          people={people}
          scripterIds={scripterIds}
          canManage={isMaster(roles)}
          action={setLongScripter}
        />
      }
      lastEdited={script.updatedBy && script.version > 1 ? `Last edited by ${script.updatedBy.name}, ${relativeTime(script.updatedAt)}` : null}
    />
  );
}
