import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { colorForId, displayName } from "@/lib/avatar";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { getShortDetail } from "@/modules/short-videos/lib/queries";
import { ShortStagePill } from "@/modules/short-videos/components/stage-pill";
import { listNotes, listVersions } from "@/modules/review/lib/queries";
import { ReviewWorkspace } from "@/modules/review/components/workspace";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = await getShortDetail(id);
  return { title: short ? `Review · #${short.number} ${short.title}` : "Review" };
}

export default async function ShortReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = await getShortDetail(id);
  if (!short) notFound();

  const supabase = await createClient();
  const user = await getCachedUser();
  const [membership, versions, notes, { data: profile }] = await Promise.all([
    getMembership(supabase, short.teamId),
    listVersions(id),
    listNotes(id),
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
  // Masters, schedulers and this short's editor can upload versions.
  // Uploading new versions is part of editing (not review or later).
  const canUpload =
    short.stage === "editing" &&
    (master || roles.includes("publisher") || (!!membership && short.editor?.memberId === membership.teamMemberId));

  return (
    <div className="px-4 sm:px-8 py-6 max-w-[1500px] mx-auto">
      <Link href={`/shorts/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-3">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Back to the short
      </Link>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <h1 className="text-[22px] sm:text-[26px] font-display font-semibold leading-tight">
          <span className="font-mono text-ink-soft text-[0.7em] mr-2">#{short.number}</span>
          {short.title}
        </h1>
        <ShortStagePill stage={short.stage} size="md" />
      </div>
      <ReviewWorkspace
        shortId={id}
        teamId={short.teamId}
        versions={versions}
        notes={notes}
        me={me}
        canUpload={canUpload}
        isMaster={master}
      />
    </div>
  );
}
