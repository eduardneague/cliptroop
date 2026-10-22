"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { updateAvatar } from "./actions";

/**
 * Picking a new profile picture: Settings → Profile, and (1.29.5) your own
 * profile, by clicking your picture. Made small first (512 × 512; the
 * compressor loads only once a file is picked), stored in your own folder
 * of "avatars", then put on your account. `done(url)` gets the new picture
 * right away, before the page has reloaded.
 *
 * Render `field` (the hidden file input) once, call `pick()` to open it.
 */
export function useAvatarUpload(userId: string, done?: (url: string) => void) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(original: File | undefined) {
    if (!original || busy) return;
    if (!original.type.startsWith("image/")) {
      toast.error("Only image files are allowed.");
      return;
    }
    if (original.size > 25 * 1024 * 1024) {
      toast.error("Keep it under 25 MB.");
      return;
    }
    setBusy(true);
    try {
      const { compressImage, IMAGE_PRESETS, safeFileName, UPLOAD_CACHE_CONTROL } = await import("@/lib/image/compress");
      const file = await compressImage(original, IMAGE_PRESETS.avatar);
      const supabase = createClient();
      const path = `${userId}/avatar-${Date.now()}-${safeFileName(file.name)}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type });
      if (error) {
        toast.error("Upload failed.");
        return;
      }
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const r = await updateAvatar(url);
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      done?.(url);
      toast.success("Profile picture updated");
      router.refresh();
    } catch {
      toast.error("Upload failed.");
    } finally {
      setBusy(false);
      // The same file can be picked again.
      if (input.current) input.current.value = "";
    }
  }

  const field = <input ref={input} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden onChange={(e) => void upload(e.target.files?.[0])} />;
  return { busy, pick: () => input.current?.click(), field };
}
