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
import { ensureDefaultDocs, getDoc, listComments } from "@/modules/scripts/lib/queries";
import { ScriptWorkspace } from "@/modules/scripts/components/workspace";
import { setLongScripter } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? `Script · #${project.entry_number} ${project.title}` : "Script" };
}

/**
 * Script versions (Script · Review · Staging · …) and research documents,
 * side by side if needed. Scripts: the video's scripters + masters edit.
 * Research: masters, researchers and the scripters edit.
 */
export default async function LongScriptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string; side?: string; kind?: string }>;
}) {
  const { id } = await params;
  const { doc: docParam, side: sideParam, kind } = await searchParams;
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
  const canEditScript = isMaster(roles) || (!!membership && scripterIds.includes(membership.teamMemberId));
  const canEditResearch = canEditScript || roles.includes("researcher");

  const docs = await ensureDefaultDocs({ long: id }, { script: canEditScript, research: canEditResearch });
  const current =
    docs.find((d) => d.id === docParam) ?? docs.find((d) => d.kind === (kind === "research" ? "research" : "script")) ?? docs[0];
  const back = (
    <Link href={`/videos/${id}?tab=${kind === "research" ? "research" : "script"}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-5">
      <ArrowLeftIcon className="w-3.5 h-3.5" />#{project.entry_number} {project.title}
    </Link>
  );
  if (!current) {
    return (
      <div className="px-4 sm:px-10 py-8 max-w-2xl mx-auto">
        {back}
        <p className="rounded-xl border border-line/10 bg-surface px-5 py-4 text-[13.5px] text-ink-soft">Nothing has been written for this video yet.</p>
      </div>
    );
  }
  const sideItem = docs.find((d) => d.id === sideParam && d.id !== current.id);
  const [doc, side, comments] = await Promise.all([getDoc(current.id), sideItem ? getDoc(sideItem.id) : Promise.resolve(null), listComments(current.id)]);
  if (!doc) notFound();

  return (
    <ScriptWorkspace
      owner={{ long: id }}
      docs={docs}
      doc={doc}
      canEdit={doc.kind === "research" ? canEditResearch : canEditScript}
      canCreate={{ script: canEditScript, research: canEditResearch }}
      side={side}
      comments={comments}
      title={project.title}
      number={project.entry_number}
      backHref={`/videos/${id}?tab=${doc.kind === "research" ? "research" : "script"}`}
      backLabel="Back to the video"
      topBarExtra={
        <ScriptersButton shortId={id} number={project.entry_number} people={people} scripterIds={scripterIds} canManage={isMaster(roles)} action={setLongScripter} />
      }
      lastEdited={doc.updatedBy && doc.version > 1 ? `Last edited by ${doc.updatedBy.name}, ${relativeTime(doc.updatedAt)}` : null}
    />
  );
}
