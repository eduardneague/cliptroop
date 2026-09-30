"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAGE_ORDER, STAGE_LABELS, stageColor } from "@/modules/long-videos/lib/stages";
import { sendNotifications } from "@/lib/notify";
import type { PipelineStage, RoleId } from "@/lib/permissions/roles";
import { getMembership, canActOnStage } from "@/lib/permissions/membership";
import { isMaster, ROLES, PIPELINE_STAGES, roleAllowsStage } from "@/lib/permissions/roles";
import { displayName } from "@/lib/avatar";
import { buildMentionCatalog, resolveMentionRecipients } from "@/lib/mentions";

/**
 * Loads a project (via RLS — so it only returns if the caller can see
 * it) and checks the caller is a Master of the project's OWN team.
 * Always derive the team from the project itself, never from a teamId
 * the browser sent.
 */
async function requireProjectMaster(projectId: string) {
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("long_video_projects")
    .select("id, team_id, stage, title")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { ok: false as const, error: "Project not found." };

  const membership = await getMembership(supabase, project.team_id);
  if (!isMaster(membership?.roles ?? [])) {
    return { ok: false as const, error: "Only the master can do this." };
  }
  return { ok: true as const, supabase, project };
}

/**
 * Deletes a project permanently — master-only, checked here before doing
 * anything. Uses the admin client for the actual deletion so we can also
 * clean up the project's uploaded files (thumbnails, chat attachments),
 * which live in storage and aren't covered by the database's own cascade
 * deletes on the comment/title/assignee rows.
 */
export async function deleteProject(projectId: string, _teamId?: string) {
  // The team is taken from the project itself — previously a master of
  // team A could pass their own teamId and delete team B's project.
  const check = await requireProjectMaster(projectId);
  if (!check.ok) {
    return { error: check.error === "Only the master can do this." ? "Only the master can delete a project." : check.error };
  }

  const admin = createAdminClient();

  const [{ data: thumbFiles }, { data: attachFiles }] = await Promise.all([
    admin.storage.from("thumbnails").list(projectId),
    admin.storage.from("comment-attachments").list(projectId),
  ]);
  if (thumbFiles && thumbFiles.length > 0) {
    await admin.storage.from("thumbnails").remove(thumbFiles.map((f) => `${projectId}/${f.name}`));
  }
  if (attachFiles && attachFiles.length > 0) {
    await admin.storage.from("comment-attachments").remove(attachFiles.map((f) => `${projectId}/${f.name}`));
  }

  const { error } = await admin.from("long_video_projects").delete().eq("id", projectId);
  if (error) return { error: "Couldn't delete the project. Try again." };

  revalidatePath("/videos");
  redirect("/videos");
}

const VIDEO_TYPES = ["Hub", "Help", "Hero"];

export async function updateTypeTheme(
  projectId: string,
  teamId: string,
  videoType: string[],
  theme: string,
  subtheme: string
) {
  if (videoType.length === 0) return { error: "Pick at least one type." };
  if (!theme.trim()) return { error: "Theme can't be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? []) && !canActOnStage(membership, "ideate")) {
    return { error: "You don't have access to edit this." };
  }

  const { error } = await supabase
    .from("long_video_projects")
    .update({
      video_type: videoType.filter((t) => VIDEO_TYPES.includes(t)),
      theme: theme.trim(),
      subtheme: subtheme.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", projectId);

  if (error) return { error: "Couldn't save. Try again." };

  revalidatePath(`/videos/${projectId}`);

  revalidatePath("/videos");

  revalidatePath("/calendar");
  revalidatePath("/videos");
  return { success: true };
}

export async function updateExpectedDate(
  projectId: string,
  teamId: string,
  date: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "That date isn't valid." };

  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? []) && !canActOnStage(membership, "ideate")) {
    return { error: "You don't have access to edit this." };
  }

  const { error } = await supabase
    .from("long_video_projects")
    .update({ expected_date: date || null, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", projectId);

  if (error) return { error: "Couldn't save. Try again." };

  revalidatePath(`/videos/${projectId}`);

  revalidatePath("/videos");

  revalidatePath("/calendar");
  revalidatePath("/videos");
  return { success: true };
}

const EDITABLE_FIELDS = ["hook", "notes", "budget_notes"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * Inline-edit for the free-text Ideate fields. Same access rule as the
 * rest of Ideate (ideate-stage holders, or master) — checked here in
 * addition to the RLS policy on long_video_projects, since this can be
 * called at any point in the project's life, not just while it's
 * actually in the Ideate stage.
 */
export async function updateIdeateField(
  projectId: string,
  teamId: string,
  field: EditableField,
  value: string
) {
  if (!EDITABLE_FIELDS.includes(field)) return { error: "Not editable." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? []) && !canActOnStage(membership, "ideate")) {
    return { error: "You don't have access to edit this." };
  }

  const { error } = await supabase
    .from("long_video_projects")
    .update({ [field]: value || null, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", projectId);

  if (error) return { error: "Couldn't save. Try again." };

  revalidatePath(`/videos/${projectId}`);

  revalidatePath("/videos");

  revalidatePath("/calendar");
  return { success: true, updatedAt: new Date().toISOString() };
}

/**
 * The inverse of advanceStage — moves a project one stage backward.
 * Master-only, same as advancing; the RLS update policy is the real
 * enforcement.
 */
export async function regressStage(projectId: string) {
  const check = await requireProjectMaster(projectId);
  if (!check.ok) return { error: check.error };
  const { supabase, project } = check;

  const currentIndex = STAGE_ORDER.indexOf(project.stage as PipelineStage);
  const prev = STAGE_ORDER[currentIndex - 1];
  if (!prev) return { error: "Already at the first stage." };

  const { error } = await supabase
    .from("long_video_projects")
    .update({ stage: prev })
    .eq("id", projectId);

  if (error) {
    return {
      error:
        "Couldn't move this back. You may not have permission to do this.",
    };
  }

  const { data: assignees } = await supabase
    .from("project_assignees")
    .select("team_members(user_id)")
    .eq("project_id", projectId)
    .eq("stage", prev);

  const recipients = (assignees ?? [])
    .map((a) => (a.team_members as unknown as { user_id: string })?.user_id)
    .filter(Boolean);

  if (recipients.length > 0) {
    await sendNotifications(
      recipients.map((recipient_id) => ({
        recipient_id,
        project_id: projectId,
        stage: prev,
        body: `"${project.title}" moved back to ${STAGE_LABELS[prev]}.`,
      }))
    );
  }

  revalidatePath(`/videos/${projectId}`);

  revalidatePath("/videos");

  revalidatePath("/calendar");
  revalidatePath("/videos");
  return { success: true };
}

/**
 * Advances a project to its next stage. Only the master can do this —
 * the button is hidden from everyone else in the UI, but the database's
 * RLS policy is what actually stops anyone from bypassing that by
 * calling this directly.
 */
export async function advanceStage(projectId: string) {
  const check = await requireProjectMaster(projectId);
  if (!check.ok) return { error: check.error };
  const { supabase, project } = check;

  const currentIndex = STAGE_ORDER.indexOf(project.stage as PipelineStage);
  const next = STAGE_ORDER[currentIndex + 1];
  if (!next) return { error: "Already at the final stage." };

  const { error } = await supabase
    .from("long_video_projects")
    .update({ stage: next })
    .eq("id", projectId);

  if (error) {
    return {
      error:
        "Couldn't advance the project. You may not have permission to do this.",
    };
  }

  // Notify whoever is already assigned to the new stage.
  const { data: assignees } = await supabase
    .from("project_assignees")
    .select("team_members(user_id)")
    .eq("project_id", projectId)
    .eq("stage", next);

  const recipients = (assignees ?? [])
    .map((a) => (a.team_members as unknown as { user_id: string })?.user_id)
    .filter(Boolean);

  if (recipients.length > 0) {
    await sendNotifications(
      recipients.map((recipient_id) => ({
        recipient_id,
        project_id: projectId,
        stage: next,
        kind: "stage_ready",
        metadata: {
          projectTitle: project.title,
          stageLabel: STAGE_LABELS[next],
          stageColor: stageColor(next),
        },
        body: `"${project.title}" moved into ${STAGE_LABELS[next]}. You have work to do.`,
      }))
    );
  }

  revalidatePath(`/videos/${projectId}`);

  revalidatePath("/videos");

  revalidatePath("/calendar");
  revalidatePath("/videos");
  return { success: true };
}

export async function assignMember(
  projectId: string,
  stage: PipelineStage,
  teamMemberId: string
) {
  if (!PIPELINE_STAGES.includes(stage)) return { error: "Unknown stage." };

  const check = await requireProjectMaster(projectId);
  if (!check.ok) return { error: check.error };
  const { supabase, project } = check;

  const { data: member } = await supabase
    .from("team_members")
    .select("user_id, member_roles(role)")
    .eq("id", teamMemberId)
    .eq("team_id", project.team_id)
    .eq("status", "active")
    .maybeSingle();

  if (!member) return { error: "They're not an active member of this team." };

  const roles = ((member.member_roles ?? []) as { role: RoleId }[]).map((r) => r.role);
  if (!roles.some((r) => roleAllowsStage(r, stage))) {
    return { error: "They need a role that covers this stage first." };
  }

  const { error } = await supabase
    .from("project_assignees")
    .insert({ project_id: projectId, stage, team_member_id: teamMemberId });

  if (error) {
    if (error.code === "23505") return { error: "They're already assigned here." };
    return { error: "Couldn't assign. Try again." };
  }

  if (member.user_id) {
    await sendNotifications({
      recipient_id: member.user_id,
      project_id: projectId,
      stage,
      kind: "stage_assignment",
      metadata: {
        projectTitle: project.title,
        stageLabel: STAGE_LABELS[stage],
        stageColor: stageColor(stage),
      },
      body: `You've been tagged on "${project.title}" for ${STAGE_LABELS[stage]}.`,
    });
  }

  revalidatePath(`/videos/${projectId}`);

  revalidatePath("/videos");

  revalidatePath("/calendar");
  return { success: true };
}

export async function removeAssignee(projectId: string, assigneeRowId: string) {
  const check = await requireProjectMaster(projectId);
  if (!check.ok) return { error: check.error };

  const { error } = await check.supabase
    .from("project_assignees")
    .delete()
    .eq("id", assigneeRowId)
    .eq("project_id", projectId);
  if (error) return { error: "Couldn't unassign. Try again." };

  revalidatePath(`/videos/${projectId}`);

  revalidatePath("/videos");

  revalidatePath("/calendar");
  return { success: true };
}

/**
 * An attachment path must be a file in THIS project's storage folder,
 * or a Giphy GIF URL. Anything else is dropped (the database enforces
 * the same rule since 0022).
 */
function isAllowedAttachmentPath(path: unknown, projectId: string): path is string {
  if (typeof path !== "string" || path.length > 1024) return false;
  if (path.startsWith(`${projectId}/`) && !path.includes("..")) return true;
  return /^https:\/\/([a-z0-9-]+\.)?giphy\.com\//.test(path);
}

export async function postComment(
  projectId: string,
  stage: PipelineStage,
  formData: FormData
): Promise<{ error?: string }> {
  if (!PIPELINE_STAGES.includes(stage)) return { error: "Unknown stage." };
  const body = String(formData.get("body") ?? "").trim().slice(0, 10000);
  const attachmentsRawForCheck = String(formData.get("attachments") ?? "[]");
  const hasAttachments = attachmentsRawForCheck !== "[]" && attachmentsRawForCheck !== "";
  if (!body && !hasAttachments) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data: project } = await supabase
    .from("long_video_projects")
    .select("team_id, title")
    .eq("id", projectId)
    .single();
  if (!project) return { error: "Project not found." };

  const { data: newComment, error } = await supabase
    .from("project_comments")
    .insert({
      project_id: projectId,
      stage,
      author_id: user.id,
      body,
    })
    .select("id")
    .single();
  if (error || !newComment) {
    return { error: "Couldn't post. You may not have access to this stage." };
  }

  const attachmentsRaw = String(formData.get("attachments") ?? "[]");
  try {
    const attachments = JSON.parse(attachmentsRaw) as {
      name: string;
      path: string;
      size: number;
      type: string;
    }[];
    const safe = Array.isArray(attachments)
      ? attachments.filter((a) => a && isAllowedAttachmentPath(a.path, projectId)).slice(0, 20)
      : [];
    if (safe.length > 0) {
      await supabase.from("comment_attachments").insert(
        safe.map((a) => ({
          comment_id: newComment.id,
          file_name: String(a.name ?? "file").slice(0, 255),
          file_path: a.path,
          file_size: Number(a.size) || 0,
          mime_type: String(a.type ?? "application/octet-stream").slice(0, 255),
        }))
      );
    }
  } catch {
    // Malformed attachments payload — the comment itself still posted fine.
  }

  // Resolve @mentions (@name, @RoleName, @all) into real notifications.
  const [{ data: teamMembers }, { data: authorProfile }] = await Promise.all([
    supabase
      .from("team_members")
      .select("user_id, profiles(username, full_name, email), member_roles(role)")
      .eq("team_id", project.team_id)
      .eq("status", "active"),
    supabase
      .from("profiles")
      .select("username, full_name, email, avatar_url")
      .eq("id", user.id)
      .single(),
  ]);

  const members = (teamMembers ?? []).map((m) => {
    const profile = m.profiles as unknown as { username: string | null; full_name: string | null; email: string | null } | null;
    return {
      userId: m.user_id as string,
      name: displayName(profile?.username, profile?.full_name, profile?.email),
      roles: (m.member_roles ?? []).map((r: { role: RoleId }) => r.role),
    };
  });

  const catalog = buildMentionCatalog(
    members.map((m) => ({ userId: m.userId, name: m.name })),
    ROLES.map((r) => ({ id: r.id, name: r.name }))
  );
  const recipientIds = resolveMentionRecipients(body, catalog, members);
  recipientIds.delete(user.id);

  if (recipientIds.size > 0) {
    const authorName = displayName(authorProfile?.username, authorProfile?.full_name, authorProfile?.email);
    const snippet = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    await sendNotifications(
      Array.from(recipientIds).map((recipient_id) => ({
        recipient_id,
        project_id: projectId,
        stage,
        kind: "mention",
        metadata: {
          actor: { name: authorName, avatarUrl: authorProfile?.avatar_url ?? null },
          projectTitle: project.title,
          stageLabel: STAGE_LABELS[stage],
          stageColor: stageColor(stage),
          snippet,
        },
        body: `${authorName} mentioned you in ${STAGE_LABELS[stage]} on "${project.title}": "${snippet}"`,
      }))
    );
  }

  revalidatePath(`/videos/${projectId}`);

  revalidatePath("/videos");

  revalidatePath("/calendar");
  return {};
}

export async function deleteComment(commentId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    return { error: "Couldn't delete. You may not have permission." };
  }

  revalidatePath(`/videos/${projectId}`);

  revalidatePath("/videos");

  revalidatePath("/calendar");
  return { success: true };
}
