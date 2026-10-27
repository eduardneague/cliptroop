import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * A long video deleted for good, with its files (1.27.5 in deleteProject; 1.40.0 shared with deleting several at once,
 * videos/bulk-actions.ts). Only after the caller has checked it's a master of the video's own team: this uses the
 * service key. Its scripts' pictures and drawings, its thumbnails and chat attachments, its edits and Thumbnail Studio's
 * images go first (storage isn't covered by the database's own cascade), then the video and everything under it.
 */
export async function removeLongVideo(admin: Admin, video: { id: string; teamId: string }): Promise<{ error?: string }> {
  const { id: projectId, teamId } = video;
  // Its scripts' pictures and drawings (1.27.5): <team>/<script>/ in their buckets.
  const { data: docs } = await admin.from("scripts").select("id").eq("long_video_id", projectId);
  await Promise.all(
    (docs ?? []).flatMap((d) =>
      (["script-images", "script-sketches"] as const).map(async (bucket) => {
        const dir = `${teamId}/${d.id as string}`;
        const { data: files } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
        if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${dir}/${f.name}`));
      })
    )
  );

  // Its edits (1.25.0, up to 3 GB each) and Thumbnail Studio's images live
  // under <team>/<video>/: they go too, so nothing is left behind.
  const folder = `${teamId}/${projectId}`;
  const [{ data: thumbFiles }, { data: attachFiles }, { data: editFiles }, { data: studioFiles }] = await Promise.all([
    admin.storage.from("thumbnails").list(projectId),
    admin.storage.from("comment-attachments").list(projectId),
    admin.storage.from("long-review-videos").list(folder, { limit: 1000 }),
    admin.storage.from("package-thumbs").list(folder, { limit: 1000 }),
  ]);
  if (thumbFiles && thumbFiles.length > 0) {
    await admin.storage.from("thumbnails").remove(thumbFiles.map((f) => `${projectId}/${f.name}`));
  }
  if (attachFiles && attachFiles.length > 0) {
    await admin.storage.from("comment-attachments").remove(attachFiles.map((f) => `${projectId}/${f.name}`));
  }
  if (editFiles && editFiles.length > 0) {
    await admin.storage.from("long-review-videos").remove(editFiles.map((f) => `${folder}/${f.name}`));
  }
  if (studioFiles && studioFiles.length > 0) {
    await admin.storage.from("package-thumbs").remove(studioFiles.map((f) => `${folder}/${f.name}`));
  }

  const { error } = await admin.from("long_video_projects").delete().eq("id", projectId);
  if (error) return { error: "Couldn't delete the project. Try again." };
  return {};
}
