import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { colorForId, displayName } from "@/lib/avatar";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import type { PipelineStage } from "@/lib/permissions/roles";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { getProject } from "@/modules/long-videos/lib/queries";
import { STAGE_LABELS, stageColor } from "@/modules/long-videos/lib/stages";
import { listNotes, listVersions } from "@/modules/review/lib/queries";
import { ReviewWorkspace } from "@/modules/review/components/workspace";
import { wordColor } from "@/lib/word-color";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? `Review · #${project.entry_number} ${project.title}` : "Review" };
}

/** A long video's review in ClipTroop (1.25.0): the same workspace as a short's, wide. */
export default async function LongReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const supabase = await createClient();
  const user = await getCachedUser();
  const [membership, versions, notes, { data: profile }] = await Promise.all([
    getMembership(supabase, project.team_id as string),
    listVersions(id, "long"),
    listNotes(id, "long"),
    supabase.from("profiles").select("username, full_name, email, avatar_url").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  const me = {
    id: user?.id ?? "",
    name: displayName(profile?.username, profile?.full_name, profile?.email),
    avatarUrl: (profile?.avatar_url as string | null) ?? null,
    color: colorForId(user?.id ?? "x"),
  };
  const roles = membership?.roles ?? [];
  const master = isMaster(roles);
  const stage = project.stage as PipelineStage;
  // Masters, schedulers and editors upload, while the video is in Edit
  // (the database checks the same people, 0089).
  const canUpload = stage === "edit" && (master || roles.includes("publisher") || roles.includes("editor"));
  const c = stageColor(stage);

  return (
    <div className="px-4 sm:px-8 py-6 max-w-[1500px] mx-auto">
      <Link href={`/videos/${id}?tab=${stage === "edit" ? "edit" : "review"}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-3">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Back to the video
      </Link>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <h1 className="text-[22px] sm:text-[26px] font-display font-semibold leading-tight">
          <span className="font-mono text-ink-soft text-[0.7em] mr-2">#{project.entry_number}</span>
          {project.title}
        </h1>
        <span
          className="inline-flex items-center gap-1.5 rounded-md font-bold whitespace-nowrap text-[12px] px-2.5 py-1"
          style={{ color: wordColor(c), background: `color-mix(in srgb, ${c} 14%, rgb(var(--surface)))` }}
        >
          <span className="w-1.5 h-1.5 rounded-[2px]" style={{ background: c }} aria-hidden />
          {STAGE_LABELS[stage]}
        </span>
      </div>
      <ReviewWorkspace
        kind="long"
        subjectId={id}
        teamId={project.team_id as string}
        versions={versions}
        notes={notes}
        me={me}
        canUpload={canUpload}
        isMaster={master}
        approvedId={(project.approved_version_id as string | null) ?? null}
      />
    </div>
  );
}
