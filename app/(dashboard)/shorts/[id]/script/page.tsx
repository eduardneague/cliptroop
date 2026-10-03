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
import { ensureDefaultDocs, getDoc, listComments } from "@/modules/scripts/lib/queries";
import { getScriptFlow, isStepPerson } from "@/modules/scripts/lib/flow";
import { setShortScripter } from "@/app/(dashboard)/shorts/actions";
import { ScriptWorkspace } from "@/modules/scripts/components/workspace";
import { getRoleColors } from "@/lib/permissions/team-role-colors";
import { mentionPeople } from "@/modules/scripts/lib/mention-people";

// Always fresh: documents change while you work (never show a stale copy).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = await getShortDetail(id);
  return { title: short ? `Script · #${short.number} ${short.title}` : "Script" };
}

export default async function ShortScriptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string; side?: string }>;
}) {
  const { id } = await params;
  const { doc: docParam, side: sideParam } = await searchParams;
  const short = await getShortDetail(id);
  if (!short) notFound();

  const supabase = await createClient();
  const [membership, people, roleColors] = await Promise.all([getMembership(supabase, short.teamId), listTeamPeople(short.teamId), getRoleColors(supabase, short.teamId)]);
  const roles = membership?.roles ?? [];
  // Masters, plus this short's scripters (default scripter + anyone added).
  const canEdit = isMaster(roles) || (!!membership && short.scripterIds.includes(membership.teamMemberId));
  // Masters and schedulers decide who the scripters are.
  const canManageScripters = isMaster(roles) || roles.includes("publisher");
  const me = membership?.teamMemberId ?? null;

  // Versions: Script · Review · Staging (+ any added), created on first open.
  const docs = await ensureDefaultDocs({ short: id }, { script: canEdit, research: false });
  const current = docs.find((d) => d.id === docParam) ?? docs.find((d) => d.kind === "script");
  if (!current) {
    return (
      <div className="px-4 sm:px-10 py-8 max-w-2xl mx-auto">
        <Link href={`/shorts/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-5">
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          #{short.number} {short.title}
        </Link>
        <p className="rounded-xl border border-line/10 bg-surface px-5 py-4 text-[13.5px] text-ink-soft">No script has been written for this short yet.</p>
      </div>
    );
  }
  const sideItem = docs.find((d) => d.id === sideParam && d.id !== current.id);
  const [doc, side, comments, flow] = await Promise.all([
    getDoc(current.id),
    sideItem ? getDoc(sideItem.id) : Promise.resolve(null),
    listComments(current.id, short.teamId),
    getScriptFlow(docs, short.teamId, short.scripterIds),
  ]);
  if (!doc) notFound();

  // Who does what on this short (for @mention suggestions).
  const jobs: Record<string, string[]> = {};
  const job = (memberId: string | undefined | null, label: string) => {
    if (memberId) jobs[memberId] = [...(jobs[memberId] ?? []), label];
  };
  short.scripterIds.forEach((m) => job(m, "Scripter"));
  job(short.editor?.memberId, "Editor");
  job(short.reviewer?.memberId, "Reviewer");
  job(short.scheduler?.memberId, "Scheduler");

  return (
    <ScriptWorkspace
      owner={{ short: id }}
      docs={docs}
      doc={doc}
      // Reviewers edit Review, staging people edit Staging (0062).
      canEdit={canEdit || isStepPerson(flow, doc.id, me)}
      canCreate={{ script: canEdit, research: false }}
      side={side}
      comments={comments}
      roleColors={roleColors}
      people={mentionPeople(people, jobs)}
      title={short.title}
      number={short.number}
      backHref={`/shorts/${id}`}
      backLabel="Back to the short"
      topBarExtra={
        flow.ready ? undefined : <ScriptersButton shortId={id} number={short.number} people={people} scripterIds={short.scripterIds} canManage={canManageScripters} />
      }
      flow={{
        data: flow,
        team: people,
        videoId: id,
        scripterAction: setShortScripter,
        can: {
          scripters: canManageScripters,
          people: canManageScripters || canEdit,
          handOff: { write: canEdit, review: isMaster(roles) || isStepPerson(flow, flow.steps.find((s) => s.step === "review")?.docId ?? "", me) },
        },
      }}
      lastEdited={doc.updatedBy && doc.version > 1 ? `Last edited by ${doc.updatedBy.name}, ${relativeTime(doc.updatedAt)}` : null}
    />
  );
}
