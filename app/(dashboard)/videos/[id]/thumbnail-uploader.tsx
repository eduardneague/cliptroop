"use client";

import { CloseIcon } from "@/components/ui/icons";

import { compressImage, IMAGE_PRESETS, safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";

type Thumbnail = { id: string; path: string; url: string };

export function ThumbnailUploader({
  projectId,
  thumbnails,
  canEdit,
}: {
  projectId: string;
  thumbnails: Thumbnail[];
  canEdit: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let failed = 0;

    for (const original of Array.from(files)) {
      if (!original.type.startsWith("image/")) {
        toast.error("Only image files are allowed.");
        failed++;
        continue;
      }
      if (original.size > 25 * 1024 * 1024) {
        toast.error("Keep each image under 25MB.");
        failed++;
        continue;
      }

      const file = await compressImage(original, IMAGE_PRESETS.thumbnail);
      const path = `${projectId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("thumbnails")
        .upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type });

      if (uploadError) {
        toast.error("Upload failed. You may not have permission to add thumbnails here.");
        failed++;
        continue;
      }

      await supabase.from("project_thumbnails").insert({
        project_id: projectId,
        storage_path: path,
        position: thumbnails.length,
      });
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (failed < files.length) toast.success("Thumbnail added");
    router.refresh();
  }

  async function handleRemove(id: string, path: string) {
    const ok = await confirm({
      title: "Remove this thumbnail?",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    await supabase.storage.from("thumbnails").remove([path]);
    await supabase.from("project_thumbnails").delete().eq("id", id);
    setBusy(false);
    toast.success("Thumbnail removed");
    router.refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-3">
        {thumbnails.map((t) => (
          <div
            key={t.id}
            className="relative aspect-video rounded-lg overflow-hidden border border-line/10 bg-surface-2 group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" decoding="async" src={t.url} alt="" className="w-full h-full object-cover" />
            {canEdit && (
              <button
                onClick={() => handleRemove(t.id, t.path)}
                disabled={busy}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/60 text-white text-[11px] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red transition-all"
                aria-label="Remove thumbnail"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="aspect-video rounded-lg border border-dashed border-line/25 flex items-center justify-center text-ink-soft text-[12px] font-medium hover:border-amber hover:text-amber transition-colors disabled:opacity-50"
          >
            {busy ? "Uploading…" : "+ Add image"}
          </button>
        )}
      </div>

      {thumbnails.length < 2 && (
        <p className="text-[11px] text-ink-soft mb-1.5">
          Add at least 2 thumbnail sketches.
        </p>
      )}
      {!canEdit && thumbnails.length === 0 && (
        <p className="text-[12px] text-ink-soft">No thumbnails yet.</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
