import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { ArrowLeftIcon, CheckIcon, AlertIcon } from "@/components/ui/icons";
import { ScrollToCurrent } from "@/components/ui/scroll-to-current";
import {
  getShortDetail,
  getShortSettings,
  listDayLimits,
  getQueueStart,
  listPlannedDates,
  listTeamPeople,
} from "@/modules/short-videos/lib/queries";
import { shortPermissions } from "@/modules/short-videos/lib/permissions";
import { SHORT_STAGES, SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";
import { STAGE_STATE_COLOR } from "@/modules/long-videos/lib/stages";
import { formatShortDate, isOverdue, relativeDay } from "@/modules/short-videos/lib/dates";
import { ShortStagePill } from "@/modules/short-videos/components/stage-pill";
import { ShortsRealtime } from "@/modules/short-videos/components/shorts-realtime";
import { ShortTitle } from "./short-title";
import { DeleteShortButton } from "./delete-short-button";
import { WorkflowActions } from "./workflow-actions";
import { PostingCard } from "./posting-card";
import { ActivityCard } from "./activity-card";
import { ReviewCard } from "./review-card";
import { ChangesCard } from "./changes-card";
import { SettingsButton } from "./settings-button";
import { SchedulePanel } from "./schedule-panel";
import { ScriptCard } from "@/modules/scripts/components/script-card";
import { getShortScript } from "@/modules/scripts/lib/queries";
import { VideoCard } from "@/modules/review/components/video-card";
import { listNotes, listVersions } from "@/modules/review/lib/queries";
import { ShortTypeTag } from "@/modules/short-videos/components/short-type";
import { MobileCollapse } from "@/components/ui/mobile-collapse";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = await getShortDetail(id);
  return { title: short ? `#${short.number} ${short.title}` : "Short" };
}

export default async function ShortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = await getShortDetail(id);
  if (!short) notFound();

  const supabase = await createClient();
  const membership = await getMembership(supabase, short.teamId);
  const roles = membership?.roles ?? [];
  const isAssignedEditor = !!membership && short.editor?.memberId === membership.teamMemberId;
  const isAssignedReviewer = !!membership && short.reviewer?.memberId === membership.teamMemberId;
  const perms = shortPermissions({
    roles,
    isAssignedEditor,
    isAssignedReviewer,
    stage: short.stage,
    scheduleMode: short.scheduleMode,
  });

  const [people, planned, settings, limits, queueStart, script, versions, notes] = await Promise.all([
    // Everyone sees the scripters' names; masters/schedulers also pick people.
    listTeamPeople(short.teamId),
    perms.canEditBasics ? listPlannedDates(short.teamId) : Promise.resolve([]),
    getShortSettings(short.teamId),
    perms.canEditBasics ? listDayLimits(short.teamId) : Promise.resolve({}),
    perms.canEditBasics ? getQueueStart(short.teamId) : Promise.resolve(null),
    getShortScript(short.id),
    listVersions(short.id),
    listNotes(short.id),
  ]);
  const latestVersion = versions.find((v) => !v.deleted) ?? null;

  // Automatic posting (approved shorts): accounts, this short's posts and
  // their history, the team's default times. Safe columns only.
  const posting = short.stage === "ready" || short.stage === "posted";
  const [{ data: socialAccounts }, { data: socialPosts }, { data: postTimes }] = posting
    ? await Promise.all([
        supabase.from("social_accounts").select("platform, display_name, username, avatar_url, status").eq("team_id", short.teamId),
        supabase
          .from("social_posts")
          .select("id, platform, status, progress, scheduled_at, last_error, attempts, next_attempt_at, permalink, note, external_id, options")
          .eq("short_id", short.id)
          .neq("status", "cancelled"),
        supabase.from("teams").select("post_time_youtube, post_time_instagram, post_time_tiktok").eq("id", short.teamId).maybeSingle(),
      ])
    : [{ data: null }, { data: null }, { data: null }];
  const { data: socialEvents } =
    socialPosts && socialPosts.length
      ? await supabase
          .from("social_post_events")
          .select("id, post_id, kind, message, created_at")
          .in("post_id", socialPosts.map((p) => p.id as string))
          .order("created_at", { ascending: true })
      : { data: [] };
  const openNotes = latestVersion
    ? notes.filter((n) => n.versionId === latestVersion.id && !n.parentId && !n.resolvedAt).length
    : 0;
  const canUploadVideo =
    perms.isMaster || roles.includes("publisher") || (!!membership && short.editor?.memberId === membership.teamMemberId);

  const currentIndex = SHORT_STAGES.indexOf(short.stage);
  const settingsData = {
    id: short.id,
    number: short.number,
    title: short.title,
    plannedDate: short.plannedDate,
    scheduleMode: short.scheduleMode,
    pinKind: short.pinKind,
    shortType: short.shortType,
    platforms: short.platforms,
    captionEnabled: short.captionEnabled,
    caption: short.caption,
    fileLink: short.fileLink,
    editorId: short.editor?.memberId ?? null,
    reviewerId: short.reviewer?.memberId ?? null,
    schedulerId: short.scheduler?.memberId ?? null,
    scripterIds: short.scripterIds,
  };
  const lastChanges = short.events.find((e) => e.kind === "stage" && e.fromStage === "review" && e.toStage === "editing") ?? null;
  const overdue = isOverdue(short.plannedDate, short.stage);
  const rel = relativeDay(short.plannedDate);

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1200px] mx-auto">
      <ShortsRealtime teamId={short.teamId} shortId={short.id} />

      <Link href="/shorts" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-4">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Short videos
      </Link>

      <div className="flex items-start gap-3 mb-2">
        <ShortTitle id={short.id} number={short.number} title={short.title} canEdit={perms.canEditBasics} />
        <div className="flex-shrink-0 pt-0.5 flex items-center gap-1">
          {perms.canEditBasics && (
            <SettingsButton
              short={settingsData}
              ctx={{
                planned,
                limits,
                perDay: settings.perDay,
                weekends: settings.weekends,
                queueStart,
                isMaster: perms.isMaster,
                people,
              }}
            />
          )}
          {perms.canDelete && <DeleteShortButton id={short.id} number={short.number} title={short.title} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-5 text-[13px] text-ink-soft">
        <ShortStagePill stage={short.stage} size="md" />
        <ShortTypeTag type={short.shortType} />
        {short.plannedDate ? (
          <span className={overdue ? "text-red font-semibold" : ""}>
            {overdue && <AlertIcon className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
            Planned {formatShortDate(short.plannedDate)}
            {rel ? ` · ${rel}` : ""}
            {overdue ? " · overdue" : ""}
          </span>
        ) : (
          <span className="text-ink-faint">No planned date</span>
        )}
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          {short.scheduleMode === "auto" ? "Auto date" : short.pinKind === "oneoff" ? "Fixed · just this one" : "Fixed · queue starts here"}
        </span>
        {short.createdBy && <span className="hidden sm:inline text-ink-faint">Created by {short.createdBy.name}</span>}
      </div>

      {/* Stage tracker — same state colors as long videos */}
      <ScrollToCurrent className="flex items-center mb-6 overflow-x-auto no-scrollbar pb-1">
        {SHORT_STAGES.map((s, i) => {
          const allDone = short.stage === "posted";
          const state = allDone || i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          const c = STAGE_STATE_COLOR[state];
          const on = state !== "upcoming";
          return (
            <div key={s} className="flex items-center flex-shrink-0" data-current={state === "current" ? "true" : undefined}>
              <div className="flex flex-col items-center gap-1.5 min-w-[78px]">
                <div
                  className={`rounded-full flex items-center justify-center font-bold border-2 ${
                    state === "current" ? "w-8 h-8 text-[12px] current-stage-pulse" : "w-7 h-7 text-[11px]"
                  }`}
                  style={{
                    borderColor: on ? c : "rgb(var(--line) / 0.2)",
                    background: on ? c : "transparent",
                    color: on ? "#fff" : "rgb(var(--ink-faint))",
                  }}
                >
                  {state === "done" ? <CheckIcon className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-[10.5px] font-bold whitespace-nowrap ${on ? "text-ink" : "text-ink-faint"}`}>
                  {SHORT_STAGE_LABELS[s]}
                </span>
              </div>
              {i < SHORT_STAGES.length - 1 && (
                <div
                  className="w-6 sm:w-10 h-[2px] mb-5"
                  style={{ background: allDone || i + 1 <= currentIndex ? STAGE_STATE_COLOR.done : "rgb(var(--line) / 0.15)" }}
                />
              )}
            </div>
          );
        })}
      </ScrollToCurrent>

      <WorkflowActions
        id={short.id}
        number={short.number}
        stage={short.stage}
        perms={perms}
        hasEditor={!!short.editor}
        editorName={short.editor?.name ?? null}
        reviewerName={short.reviewer?.name ?? null}
        hasFrameio={!!latestVersion || short.hasFrameio}
      />

      {/* Phones: one column. When it's time to post, the Posted card comes first. */}
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 sm:gap-6">
        {/* Below lg the two columns dissolve ("contents") and every card is
            placed on its own: action box, final file, script, activity last. */}
        <div className="contents lg:block lg:space-y-6 min-w-0">
          <div className={short.stage === "script" ? "order-1 lg:order-none" : "order-4 lg:order-none"}>
          <ScriptCard
            href={`/shorts/${short.id}/script`}
            script={script}
            // Masters, plus this short's scripters.
            canEdit={perms.isMaster || (!!membership && short.scripterIds.includes(membership.teamMemberId))}
            prominent={short.stage === "script"}
            scripters={people.filter((p) => short.scripterIds.includes(p.memberId))}
          />
          </div>

          {short.stage !== "script" && (
            <div className="order-3 lg:order-none">
              <VideoCard
                shortId={short.id}
                teamId={short.teamId}
                versions={versions}
                openNotes={openNotes}
                canUpload={canUploadVideo && short.stage !== "posted"}
                prominent={short.stage === "editing"}
                legacyLink={short.fileLink}
              />
            </div>
          )}
        </div>

        <div className="contents lg:block lg:space-y-6">
          {/* The right column follows the stage:
              Review → orange review box · Editing after a review → what to fix
              · Ready / Posted → Posted · otherwise → Post to. */}
          {short.stage === "review" && (
            <div className="order-2 lg:order-none">
            <ReviewCard
              id={short.id}
              number={short.number}
              link={short.fileLink}
              latestVersion={latestVersion?.number ?? null}
              openNotes={openNotes}
              canReview={perms.canReview}
              reviewerName={short.reviewer?.name ?? null}
            />
            </div>
          )}
          {short.stage === "editing" && short.reviewNote && (
            <div className="order-2 lg:order-none">
              <ChangesCard note={short.reviewNote} by={lastChanges?.actor?.name ?? null} at={lastChanges?.createdAt ?? null} />
            </div>
          )}
          {posting && (
            <div className="order-2 lg:order-none">
              <SchedulePanel
                shortId={short.id}
                teamId={short.teamId}
                title={short.title}
                caption={short.captionEnabled ? short.caption ?? "" : ""}
                plannedDate={short.plannedDate}
                platforms={short.platforms.filter((x): x is "youtube" | "instagram" | "tiktok" => x === "youtube" || x === "instagram" || x === "tiktok")}
                videoDuration={latestVersion?.duration ?? null}
                defaultTimes={{
                  youtube: String(postTimes?.post_time_youtube ?? "17:00").slice(0, 5),
                  instagram: String(postTimes?.post_time_instagram ?? "18:00").slice(0, 5),
                  tiktok: String(postTimes?.post_time_tiktok ?? "19:00").slice(0, 5),
                }}
                accounts={(socialAccounts ?? []).map((a) => ({
                  platform: a.platform as "youtube" | "instagram" | "tiktok",
                  name: (a.display_name as string | null) ?? (a.username as string | null) ?? "Connected account",
                  avatarUrl: (a.avatar_url as string | null) ?? null,
                  status: a.status as "active" | "needs_reconnect",
                }))}
                posts={(socialPosts ?? []).map((p) => ({
                  id: p.id as string,
                  platform: p.platform as "youtube" | "instagram" | "tiktok",
                  status: p.status as string,
                  progress: (p.progress as number) ?? 0,
                  scheduledAt: p.scheduled_at as string,
                  lastError: (p.last_error as string | null) ?? null,
                  attempts: (p.attempts as number) ?? 0,
                  nextAttemptAt: p.next_attempt_at as string,
                  permalink: (p.permalink as string | null) ?? null,
                  note: (p.note as string | null) ?? null,
                  externalId: (p.external_id as string | null) ?? null,
                  options: (p.options as Record<string, unknown>) ?? {},
                }))}
                events={(socialEvents ?? []).map((e) => ({
                  id: e.id as number,
                  postId: e.post_id as string,
                  kind: e.kind as string,
                  message: (e.message as string) ?? "",
                  at: e.created_at as string,
                }))}
                canManage={perms.isMaster || roles.includes("publisher")}
                isDev={process.env.VERCEL_ENV !== "production"}
              />
            </div>
          )}
          {(short.stage === "ready" || short.stage === "posted") && (
            <div className="order-2 lg:order-none">
            <PostingCard
              id={short.id}
              platforms={short.platforms}
              posts={short.posts}
              canPost={perms.isMaster || roles.includes("publisher")}
              stageAllowsPosting
            />
            </div>
          )}
          <MobileCollapse label="Activity" count={short.events.length} className="order-9 lg:order-none">
            <ActivityCard events={short.events} />
          </MobileCollapse>
        </div>
      </div>
    </div>
  );
}
