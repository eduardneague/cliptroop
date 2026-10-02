import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership, canActOnStage } from "@/lib/permissions/membership";
import { isMaster, roleAllowsStage, ROLES } from "@/lib/permissions/roles";
import type { PipelineStage, RoleId } from "@/lib/permissions/roles";
import { STAGE_LABELS, STAGE_ORDER, STAGE_STATE_COLOR, stageState } from "@/modules/long-videos/lib/stages";
import { getCachedUser } from "@/lib/supabase/get-user";
import { colorForId, displayName } from "@/lib/avatar";
import { getRoleColors } from "@/lib/permissions/team-role-colors";
import { buildMentionCatalog } from "@/lib/mentions";
import { CheckIcon, ArrowLeftIcon } from "@/components/ui/icons";
import { AdvanceStageButton, RegressStageButton } from "./advance-button";
import { AssigneeRow, ScriptersRow } from "./assignee-row";
import { LongVideoSettings } from "./settings-dialog";
import { TitleList } from "./title-list";
import { ThumbnailUploader } from "./thumbnail-uploader";
import { InlineEditable } from "./inline-editable";
import { ExpectedDateEditor } from "./expected-date-editor";
import { TypeThemeEditor } from "./type-theme-editor";
import { NotesPanel } from "./notes-panel";
import { DeleteProjectButton } from "./delete-project-button";
import { postComment } from "./actions";
import type { Metadata } from "next";
import { getProject } from "@/modules/long-videos/lib/queries";
import { LinkPendingIndicator } from "@/components/ui/link-pending";
import { LongStepBar } from "./step-bar";
import { DescriptionEditor, EditPanel, FilmPanel, PostPanel, ReviewPanel } from "./step-panels";
import { ScriptCard } from "@/modules/scripts/components/script-card";
import { getLongScript } from "@/modules/scripts/lib/queries";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import { ScriptersButton } from "@/modules/short-videos/components/scripters-button";
import { setLongScripter } from "./actions";

// The steps ARE the tabs.
const TABS: PipelineStage[] = STAGE_ORDER;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project?.title ?? "Project" };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  const supabase = await createClient();

  // The project decides which team we're looking at — NOT the workspace
  // switcher. (Opening a notification for a project in another team
  // used to evaluate your roles against the wrong team.)
  const [project, currentUser] = await Promise.all([getProject(id), getCachedUser()]);
  if (!project) notFound();
  const teamId: string = project.team_id;
  // Opens on the video's current step (any step can be opened any time).
  const tab: PipelineStage = TABS.includes(tabParam as PipelineStage) ? (tabParam as PipelineStage) : (project.stage as PipelineStage);

  // Everything below depends only on the project id / team id, so it all
  // runs in parallel — one round of waiting instead of a chain.
  const [
    membership,
    roleColors,
    { data: titles },
    { data: teamMembers },
    { data: assigneeRows },
    { data: comments },
    { data: thumbnailRows },
    { data: attachmentRows },
    { data: postRows },
    { data: scripterRows },
    { data: teamDefaults },
    script,
    people,
  ] = await Promise.all([
    getMembership(supabase, teamId),
    getRoleColors(supabase, teamId),
    supabase
      .from("project_titles")
      .select("id, title, is_picked, position")
      .eq("project_id", id)
      .order("position"),
    supabase
      .from("team_members")
      .select("id, user_id, profiles(username, full_name, email, avatar_url), member_roles(role)")
      .eq("team_id", teamId)
      .eq("status", "active"),
    supabase
      .from("project_assignees")
      .select("id, stage, team_member_id")
      .eq("project_id", id),
    // Only the open tab's notes (+ their attachments) — not every stage's.
    supabase
      .from("project_comments")
      .select("id, stage, body, created_at, author_id")
      .eq("project_id", id)
      .eq("stage", tab)
      .order("created_at"),
    supabase
      .from("project_thumbnails")
      .select("id, storage_path, position")
      .eq("project_id", id)
      .order("position"),
    supabase
      .from("comment_attachments")
      .select("id, comment_id, file_name, file_path, file_size, mime_type, project_comments!inner(project_id, stage)")
      .eq("project_comments.project_id", id)
      .eq("project_comments.stage", tab),
    supabase.from("long_video_posts").select("platform, url, posted_at, posted_by").eq("project_id", id),
    supabase.from("long_video_scripters").select("team_member_id").eq("project_id", id),
    supabase.from("teams").select("default_long_description").eq("id", teamId).maybeSingle(),
    getLongScript(id),
    listTeamPeople(teamId),
  ]);
  // Package: the Studio's winner (or first variation) for the summary card.
  const { data: packageRows } = await supabase
    .from("package_entries")
    .select("title, thumbnail_storage_path, is_winner")
    .eq("project_id", id)
    .order("position");
  const packageCount = packageRows?.length ?? 0;
  const winners = (packageRows ?? []).filter((r) => r.is_winner);
  const winner = winners[0] ?? null;
  // Up to 3 winners (A/B test); otherwise the first variation.
  const cardRows = winners.length ? winners : (packageRows ?? []).slice(0, 1);
  const cardPaths = cardRows.map((r) => r.thumbnail_storage_path as string | null).filter((x): x is string => !!x);
  const { data: cardSigned } = cardPaths.length ? await supabase.storage.from("package-thumbs").createSignedUrls(cardPaths, 3600) : { data: [] };
  const cardUrls = (cardSigned ?? []).map((d) => d.signedUrl).filter(Boolean) as string[];

  const userIsMaster = isMaster(membership?.roles ?? []);
  const myRoles = membership?.roles ?? [];
  const scripterIds = (scripterRows ?? []).map((r) => r.team_member_id as string);

  const memberColors = ["#E8630D", "#178C7C", "#3159C9", "#6B4FD6", "#B84070", "#B4890E", "#2B9757"];
  const membersById = new Map(
    (teamMembers ?? []).map((m, i) => {
      const profile = m.profiles as unknown as { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
      const roles = (m.member_roles ?? []).map((r: { role: RoleId }) => r.role);
      return [
        m.id,
        {
          name: displayName(profile?.username, profile?.full_name, profile?.email),
          roles,
          color: memberColors[i % memberColors.length],
        },
      ];
    })
  );

  const roleOrder = (r: RoleId) => ROLES.findIndex((x) => x.id === r);
  const peopleByUserId = new Map(
    (teamMembers ?? []).map((m) => {
      const profile = m.profiles as unknown as { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
      // Canonical order (Master first, then pipeline order) so the two
      // pills shown in chat are always the most meaningful ones.
      const roles = (m.member_roles ?? [])
        .map((r: { role: RoleId }) => r.role)
        .sort((a: RoleId, b: RoleId) => roleOrder(a) - roleOrder(b));
      const name = displayName(profile?.username, profile?.full_name, profile?.email);
      return [m.user_id, { name, roles, color: colorForId(m.user_id), avatarUrl: profile?.avatar_url ?? null }];
    })
  );

  const thumbnailBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;
  const attachmentBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comment-attachments/`;
  const attachmentsByCommentId = new Map<string, { id: string; name: string; url: string; size: number; mimeType: string }[]>();
  (attachmentRows ?? []).forEach((a) => {
    const list = attachmentsByCommentId.get(a.comment_id) ?? [];
    list.push({
      id: a.id,
      name: a.file_name,
      url: a.file_path.startsWith("http") ? a.file_path : attachmentBase + a.file_path,
      size: a.file_size,
      mimeType: a.mime_type,
    });
    attachmentsByCommentId.set(a.comment_id, list);
  });
  const thumbnails = (thumbnailRows ?? []).map((t) => ({
    id: t.id,
    path: t.storage_path,
    url: thumbnailBase + t.storage_path,
  }));

  const nameOf = (userId: string | null | undefined) => (userId ? peopleByUserId.get(userId)?.name ?? null : null);
  const updatedByName = project.updated_by
    ? peopleByUserId.get(project.updated_by)?.name ?? null
    : null;

  const mentionCatalog = buildMentionCatalog(
    Array.from(peopleByUserId.entries()).map(([userId, info]) => ({ userId, name: info.name })),
    ROLES.map((r) => ({ id: r.id, name: r.name }))
  );

  const currentIndex = STAGE_ORDER.indexOf(project.stage as PipelineStage);
  const nextStage = STAGE_ORDER[currentIndex + 1];

  const filmAssignees = (assigneeRows ?? []).filter((a) => a.stage === "film").map((a) => a.team_member_id as string);
  const assigneesForTab = (assigneeRows ?? [])
    .filter((a) => a.stage === tab)
    .map((a) => {
      const info = membersById.get(a.team_member_id);
      return {
        rowId: a.id,
        teamMemberId: a.team_member_id,
        name: info?.name ?? "Unknown",
        color: info?.color ?? "#999",
      };
    });

  const eligibleForTab = Array.from(membersById.entries())
    .filter(([, info]) => info.roles.some((r) => roleAllowsStage(r, tab)))
    .map(([teamMemberId, info]) => ({
      teamMemberId,
      name: info.name,
      color: info.color,
      roles: info.roles
        .map((r) => ROLES.find((role) => role.id === r)?.name)
        .join(", "),
    }));

  const commentsForTab = (comments ?? []).filter((c) => c.stage === tab);
  // Ideate is the team's brainstorm — every member can post there. Other
  // stages: people with a role for that stage, or a Master (same rule
  // the database enforces, migration 0025).
  const canComment = tab === "ideate" ? !!membership : canActOnStage(membership, tab);

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1400px] mx-auto">
      <Link
        href="/videos"
        className="flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-4"
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Long videos
      </Link>

      {/* Title row: number + title, delete tucked away on the right */}
      <div className="flex items-start gap-3 mb-1.5">
        <h1 className="flex-1 min-w-0 font-display text-[26px] sm:text-3xl font-semibold leading-tight">
          <span className="font-mono text-[15px] sm:text-[17px] font-semibold text-ink-faint align-middle mr-2 tabular-nums">
            #{project.entry_number}
          </span>
          {project.title}
        </h1>
        {userIsMaster && (
          <div className="flex-shrink-0 pt-0.5 flex items-center gap-1">
            <LongVideoSettings
              projectId={id}
              teamId={teamId}
              videoType={project.video_type ?? []}
              theme={project.theme ?? ""}
              subtheme={project.subtheme}
              expectedDate={project.expected_date}
              platforms={(project.platforms as string[] | null) ?? ["youtube"]}
              people={people}
              scripterIds={scripterIds}
              assignees={Object.fromEntries(
                ["research", "film", "edit", "package", "publish"].map((st) => [
                  st,
                  (assigneeRows ?? [])
                    .filter((a) => a.stage === st)
                    .map((a) => ({ rowId: a.id, teamMemberId: a.team_member_id, name: membersById.get(a.team_member_id)?.name ?? "Unknown", color: membersById.get(a.team_member_id)?.color ?? "#999" })),
                ])
              )}
            />
            <DeleteProjectButton projectId={id} teamId={teamId} projectTitle={project.title} />
          </div>
        )}
      </div>

      {/* Quiet metadata line */}
      <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 -ml-2 mb-4">
        <TypeThemeEditor
          projectId={id}
          teamId={teamId}
          videoType={project.video_type ?? []}
          theme={project.theme ?? ""}
          subtheme={project.subtheme}
          canEdit={canActOnStage(membership, "ideate")}
          color={colorForId(project.theme || "theme")}
        />
        <span className="text-ink-faint/50 text-[13px]" aria-hidden>·</span>
        <ExpectedDateEditor
          projectId={id}
          teamId={teamId}
          date={project.expected_date}
          canEdit={canActOnStage(membership, "ideate")}
        />
      </div>

      {/* The steps are the tabs: every step can be opened at any time. */}
      <LongStepBar projectId={id} stage={project.stage as PipelineStage} tab={tab} />

      {/* Looking at another step: one click back to where the video is. */}
      {tab !== project.stage && (
        <div className="mb-5 flex items-center gap-3 flex-wrap rounded-xl border border-amber/40 bg-amber/10 px-4 py-2.5 animate-[modalin_.2s_var(--ease-out)]">
          <span className="text-[13.5px]">
            Viewing the <b>{STAGE_LABELS[tab]}</b> step. This video is in <b>{STAGE_LABELS[project.stage as PipelineStage]}</b>.
          </span>
          <span className="flex-1" />
          <Link
            href={`/videos/${id}?tab=${project.stage}`}
            scroll={false}
            className="rounded-lg bg-amber text-white font-bold px-3.5 h-9 inline-flex items-center text-[13px] hover:brightness-110"
          >
            Go to {STAGE_LABELS[project.stage as PipelineStage]}
          </Link>
        </div>
      )}

      {/* Master: move the video by hand (the step buttons move it too). */}
      {project.stage !== "done" && userIsMaster && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {currentIndex > 0 && <RegressStageButton projectId={project.id} prevLabel={STAGE_LABELS[STAGE_ORDER[currentIndex - 1]]} prevStage={STAGE_ORDER[currentIndex - 1]} />}
          {nextStage && <AdvanceStageButton projectId={project.id} nextLabel={STAGE_LABELS[nextStage as PipelineStage]} nextStage={nextStage as string} />}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Main tab content */}
        <div className="rounded-xl border border-line/10 bg-surface p-6">
          {tab === "ideate" ? (
            <div className="space-y-4">
              {/* The idea template, at a glance */}
              {(() => {
                const checks = [
                  { label: "2+ titles", ok: (titles ?? []).length >= 2 },
                  { label: "Hook", ok: !!project.hook?.trim() },
                  { label: "2–5 thumbnail sketches", ok: thumbnails.length >= 2 },
                  { label: "Budget", ok: !!project.budget_notes?.trim() },
                ];
                const done = checks.filter((c) => c.ok).length;
                return (
                  <div className="rounded-2xl border border-line/10 bg-surface-2/30 px-4 py-3 flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Idea checklist</span>
                    {checks.map((c) => (
                      <span
                        key={c.label}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[12px] font-semibold ${c.ok ? "bg-green/12 text-green" : "bg-surface-2 text-ink-soft"}`}
                      >
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${c.ok ? "bg-green text-white" : "border border-line/30"}`}>{c.ok ? "✓" : ""}</span>
                        {c.label}
                      </span>
                    ))}
                    <span className="ml-auto text-[12px] font-bold tabular-nums text-ink-soft">{done}/{checks.length}</span>
                  </div>
                );
              })()}

              <section className="rounded-2xl border border-line/10 bg-surface-2/20 p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h3 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">Titles</h3>
                  <span className="text-[12px] text-ink-faint">{(titles ?? []).length} option{(titles ?? []).length === 1 ? "" : "s"} · ★ marks the main one</span>
                </div>
                <TitleList projectId={id} teamId={teamId} titles={titles ?? []} canPick={userIsMaster} canEditText={canActOnStage(membership, "ideate")} />
              </section>

              <section className="rounded-2xl border border-amber/25 bg-amber/[0.05] p-4 sm:p-5">
                <h3 className="text-[13px] font-display font-semibold uppercase tracking-wide text-amber mb-2.5">Hook</h3>
                <InlineEditable
                  projectId={id}
                  teamId={teamId}
                  field="hook"
                  value={project.hook}
                  canEdit={canActOnStage(membership, "ideate")}
                  placeholder="What's the first thing said on screen?"
                  lastEditedAt={project.updated_at}
                  lastEditedBy={updatedByName}
                  emphasize
                />
              </section>

              <section className="rounded-2xl border border-line/10 bg-surface-2/20 p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h3 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">Thumbnail sketches</h3>
                  <span className={`text-[12px] font-semibold ${thumbnails.length >= 2 && thumbnails.length <= 5 ? "text-green" : "text-ink-faint"}`}>{thumbnails.length} of 2–5</span>
                </div>
                <ThumbnailUploader projectId={id} thumbnails={thumbnails} canEdit={canActOnStage(membership, "ideate")} />
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-line/10 bg-surface-2/20 p-4 sm:p-5">
                  <h3 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-2.5">Budget</h3>
                  <InlineEditable projectId={id} teamId={teamId} field="budget_notes" value={project.budget_notes} canEdit={canActOnStage(membership, "ideate")} placeholder="A rough estimate, links to what to buy…" />
                </section>
                <section className="rounded-2xl border border-line/10 bg-surface-2/20 p-4 sm:p-5">
                  <h3 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-2.5">Notes</h3>
                  <InlineEditable projectId={id} teamId={teamId} field="notes" value={project.notes} canEdit={canActOnStage(membership, "ideate")} placeholder="Anything else (optional)" />
                </section>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {tab !== "done" && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2.5">{tab === "script" ? "Scripters" : `People · ${STAGE_LABELS[tab]}`}</div>
                  {tab === "script" ? (
                    <ScriptersRow projectId={id} people={people} scripterIds={scripterIds} isMaster={userIsMaster} />
                  ) : (
                    <AssigneeRow projectId={id} stage={tab} isMaster={userIsMaster} assignees={assigneesForTab} people={people} />
                  )}
                </div>
              )}
              {tab === "research" && (
                <Link
                  href={`/videos/${id}/script?kind=research`}
                  className="group flex items-center gap-4 rounded-2xl border border-line/15 bg-surface-2/40 p-4 hover:border-amber transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft">Research</span>
                    <span className="block text-[15px] font-semibold mt-0.5">Research documents</span>
                    <span className="block text-[12.5px] text-ink-soft mt-0.5">Same editor as the script. Open it next to the script with Side by side.</span>
                  </span>
                  <span className="rounded-lg bg-amber text-white font-bold px-4 h-10 inline-flex items-center text-[13.5px] flex-shrink-0 group-hover:brightness-110">Open</span>
                </Link>
              )}
              {tab === "script" && (
                <div className="space-y-3">
                  <ScriptCard
                    href={`/videos/${id}/script`}
                    script={script}
                    canEdit={userIsMaster || (!!membership && scripterIds.includes(membership.teamMemberId))}
                    prominent={project.stage === "script"}
                    showScripters={false}
                  />
                </div>
              )}
              {tab === "film" && (
                <FilmPanel
                  projectId={id}
                  isCurrent={project.stage === "film"}
                  canAct={
                    userIsMaster ||
                    // The assigned filmer (or any filmer if nobody is assigned), like the database rule.
                    (filmAssignees.length ? !!membership && filmAssignees.includes(membership.teamMemberId) : myRoles.includes("filmer"))
                  }
                  filmedAt={project.filmed_at}
                  filmedBy={nameOf(project.filmed_by)}
                  nasPath={project.nas_path}
                />
              )}
              {tab === "edit" && (
                <EditPanel
                  projectId={id}
                  isCurrent={project.stage === "edit"}
                  canAct={userIsMaster || myRoles.includes("editor")}
                  editedAt={project.edited_at}
                  editedBy={nameOf(project.edited_by)}
                  editNote={project.edit_note}
                  reviewNote={project.review_note}
                  nasPath={project.nas_path}
                />
              )}
              {tab === "review" && (
                <ReviewPanel
                  projectId={id}
                  isCurrent={project.stage === "review"}
                  canReview={userIsMaster}
                  editedAt={project.edited_at}
                  editedBy={nameOf(project.edited_by)}
                  editNote={project.edit_note}
                  reviewedAt={project.reviewed_at}
                  reviewedBy={nameOf(project.reviewed_by)}
                  approved={STAGE_ORDER.indexOf(project.stage as PipelineStage) > STAGE_ORDER.indexOf("review")}
                />
              )}
              {tab === "package" && (
                <Link
                  href={`/videos/${id}/studio`}
                  className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-2xl border border-line/15 bg-surface-2/40 p-3.5 hover:border-amber transition-colors"
                >
                  <span className="flex gap-1.5 flex-shrink-0 [&>img]:flex-1 sm:[&>img]:flex-none">
                    {cardUrls.length ? (
                      cardUrls.map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={u} src={u} alt="" className={`${cardUrls.length > 1 ? "w-24" : "w-40"} aspect-video rounded-lg object-cover bg-surface-2`} />
                      ))
                    ) : (
                      <span className="w-full sm:w-40 aspect-video rounded-lg bg-surface-2 flex items-center justify-center text-[11.5px] text-ink-soft px-2 text-center">No thumbnails yet</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft">Thumbnail Studio</span>
                    <span className="block text-[15px] font-semibold mt-0.5 truncate">{winner?.title ?? "Add your thumbnails and titles"}</span>
                    <span className="block text-[12.5px] text-ink-soft mt-0.5">
                      {packageCount
                        ? `${packageCount} variation${packageCount === 1 ? "" : "s"} · ${
                            winners.length > 1 ? `A/B test · ${winners.length} winners` : winners.length ? "winner picked" : "no winner yet"
                          }`
                        : "Preview them on YouTube: home, search, mobile, TV…"}
                    </span>
                  </span>
                  <span className="rounded-lg bg-amber text-white font-bold px-4 h-10 inline-flex items-center justify-center text-[13.5px] flex-shrink-0 group-hover:brightness-110">Open Thumbnail Studio</span>
                </Link>
              )}
              {tab === "package" && (
                <DescriptionEditor
                  projectId={id}
                  value={project.description ?? null}
                  teamDefault={(teamDefaults?.default_long_description as string | undefined) ?? ""}
                  canEdit={canActOnStage(membership, "package")}
                />
              )}
              {(tab === "publish" || tab === "done") && (
                <PostPanel
                  projectId={id}
                  isCurrent={project.stage === "publish" || project.stage === "done"}
                  canAct={userIsMaster || myRoles.includes("publisher")}
                  isMaster={userIsMaster}
                  platforms={(project.platforms as string[] | null) ?? ["youtube"]}
                  posts={(postRows ?? []).map((r) => ({
                    platform: r.platform as string,
                    url: (r.url as string | null) ?? null,
                    postedAt: r.posted_at as string,
                    postedBy: nameOf(r.posted_by as string | null),
                  }))}
                />
              )}
            </div>
          )}
        </div>

        <NotesPanel
          stageLabel={STAGE_LABELS[tab]}
          comments={commentsForTab.map((c) => {
            const person = peopleByUserId.get(c.author_id);
            return {
              id: c.id,
              name: person?.name ?? "Unknown",
              avatarColor: person?.color ?? "#999",
              avatarUrl: person?.avatarUrl ?? null,
              roles: (person?.roles ?? []).map((r) => ({
                name: ROLES.find((role) => role.id === r)?.name ?? r,
                color: roleColors[r],
              })),
              createdAt: c.created_at,
              body: c.body,
              canDelete: userIsMaster || c.author_id === currentUser?.id,
              attachments: attachmentsByCommentId.get(c.id) ?? [],
            };
          })}
          canComment={canComment}
          projectId={id}
          postAction={postComment.bind(null, id, tab)}
          mentionCatalog={mentionCatalog}
          roleColors={roleColors}
          me={(() => {
            const self = currentUser ? peopleByUserId.get(currentUser.id) : undefined;
            if (!currentUser || !self) return null;
            return {
              id: currentUser.id,
              name: self.name,
              avatarColor: self.color,
              avatarUrl: self.avatarUrl,
              roles: self.roles.map((r) => ({
                name: ROLES.find((role) => role.id === r)?.name ?? r,
                color: roleColors[r],
              })),
            };
          })()}
        />
      </div>
    </div>
  );
}
