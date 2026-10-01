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
import { ScriptWorkspace } from "@/modules/scripts/components/workspace";

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
  const membership = await getMembership(supabase, short.teamId);
  const roles = membership?.roles ?? [];
  // Masters, plus this short's scripters (default scripter + anyone added).
  const canEdit = isMaster(roles) || (!!membership && short.scripterIds.includes(membership.teamMemberId));
  // Masters and schedulers decide who the scripters are.
  const canManageScripters = isMaster(roles) || roles.includes("publisher");

  // Versions: Script · Review · Staging (+ any added), created on first open.
  const [docs, people] = await Promise.all([ensureDefaultDocs({ short: id }, { script: canEdit, research: false }), listTeamPeople(short.teamId)]);
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
  const [doc, side, comments] = await Promise.all([getDoc(current.id), sideItem ? getDoc(sideItem.id) : Promise.resolve(null), listComments(current.id)]);
  if (!doc) notFound();

  return (
    <ScriptWorkspace
      owner={{ short: id }}
      docs={docs}
      doc={doc}
      canEdit={canEdit}
      canCreate={{ script: canEdit, research: false }}
      side={side}
      comments={comments}
      title={short.title}
      number={short.number}
      backHref={`/shorts/${id}`}
      backLabel="Back to the short"
      topBarExtra={
        <ScriptersButton shortId={id} number={short.number} people={people} scripterIds={short.scripterIds} canManage={canManageScripters} />
      }
      lastEdited={doc.updatedBy && doc.version > 1 ? `Last edited by ${doc.updatedBy.name}, ${relativeTime(doc.updatedAt)}` : null}
    />
  );
}
