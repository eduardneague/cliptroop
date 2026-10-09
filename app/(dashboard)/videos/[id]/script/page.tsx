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
import { getScriptFlow, isStepPerson } from "@/modules/scripts/lib/flow";
import { flowStartDocId } from "@/modules/scripts/lib/flow-start";
import { ensureDefaultDocs, getDoc, listComments } from "@/modules/scripts/lib/queries";
import { ScriptWorkspace } from "@/modules/scripts/components/workspace";
import { mentionPeople } from "@/modules/scripts/lib/mention-people";
import { getRoleColors } from "@/lib/permissions/team-role-colors";

// Always fresh: documents change while you work (never show a stale copy).
export const dynamic = "force-dynamic";
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
  const [membership, { data: scripterRows }, people, { data: assigneeRows }, roleColors] = await Promise.all([
    getMembership(supabase, project.team_id),
    supabase.from("long_video_scripters").select("team_member_id").eq("project_id", id),
    listTeamPeople(project.team_id),
    supabase.from("project_assignees").select("stage, team_member_id").eq("project_id", id),
    getRoleColors(supabase, project.team_id),
  ]);
  const roles = membership?.roles ?? [];
  const scripterIds = (scripterRows ?? []).map((r) => r.team_member_id as string);
  const canEditScript = isMaster(roles) || (!!membership && scripterIds.includes(membership.teamMemberId));
  const canEditResearch = canEditScript || roles.includes("researcher");

  const docs = await ensureDefaultDocs({ long: id }, { script: canEditScript, research: canEditResearch });
  const flowPromise = getScriptFlow(docs, project.team_id, scripterIds);
  flowPromise.catch(() => {}); // awaited below; this only stops an early failure being reported twice
  // No document asked for: research when coming from Research, else where the
  // script is now (after "Ready for review", the Review doc).
  const asked = docs.find((d) => d.id === docParam);
  const startId = asked || kind === "research" ? null : flowStartDocId(await flowPromise);
  const current =
    asked ?? docs.find((d) => d.id === startId) ?? docs.find((d) => d.kind === (kind === "research" ? "research" : "script")) ?? docs[0];
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
  const [doc, side, comments, flow] = await Promise.all([
    getDoc(current.id),
    sideItem ? getDoc(sideItem.id) : Promise.resolve(null),
    listComments(current.id, project.team_id),
    flowPromise,
  ]);
  const me = membership?.teamMemberId ?? null;
  if (!doc) notFound();

  // Who does what on this video (for @mention suggestions).
  const STEP_JOB: Record<string, string> = { ideate: "Ideas", research: "Researcher", script: "Scripter", film: "Filmer", edit: "Editor", review: "Reviewer", package: "Packager", publish: "Scheduler" };
  const jobs: Record<string, string[]> = {};
  const job = (memberId: string, label: string) => {
    if (!(jobs[memberId] ?? []).includes(label)) jobs[memberId] = [...(jobs[memberId] ?? []), label];
  };
  scripterIds.forEach((m) => job(m, "Scripter"));
  (assigneeRows ?? []).forEach((r) => STEP_JOB[r.stage as string] && job(r.team_member_id as string, STEP_JOB[r.stage as string]));

  return (
    <ScriptWorkspace
      owner={{ long: id }}
      docs={docs}
      doc={doc}
      // Reviewers edit Review, staging people edit Staging (0062).
      canEdit={doc.kind === "research" ? canEditResearch : canEditScript || isStepPerson(flow, doc.id, me)}
      // Comments and editing ideas: masters, the scripters, the Review / Staging people, researchers on research (0072).
      canComment={canEditScript || (doc.kind === "research" && canEditResearch) || flow.steps.some((s) => isStepPerson(flow, s.docId, me))}
      canCreate={{ script: canEditScript, research: canEditResearch }}
      side={side}
      comments={comments}
      roleColors={roleColors}
      people={mentionPeople(people, jobs)}
      title={project.title}
      number={project.entry_number}
      backHref={`/videos/${id}?tab=${doc.kind === "research" ? "research" : "script"}`}
      backLabel="Back to the video"
      topBarExtra={
        flow.ready ? undefined : <ScriptersButton shortId={id} number={project.entry_number} people={people} scripterIds={scripterIds} canManage={isMaster(roles)} action={setLongScripter} />
      }
      flow={{
        data: flow,
        team: people,
        videoId: id,
        scripterAction: setLongScripter,
        can: {
          scripters: isMaster(roles),
          people: isMaster(roles) || roles.includes("publisher") || canEditScript,
          handOff: { write: canEditScript, review: isMaster(roles) || isStepPerson(flow, flow.steps.find((s) => s.step === "review")?.docId ?? "", me) },
          finish: canEditScript || flow.steps.some((s) => isStepPerson(flow, s.docId, me)),
        },
      }}
      lastEdited={doc.updatedBy && doc.version > 1 ? `Last edited by ${doc.updatedBy.name}, ${relativeTime(doc.updatedAt)}` : null}
    />
  );
}
