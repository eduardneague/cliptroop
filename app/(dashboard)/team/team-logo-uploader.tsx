"use client";

import { compressImage, IMAGE_PRESETS, isPictureType, safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateTeamLogo } from "./actions";
import { useToast } from "@/components/ui/toast-provider";

export function TeamLogoUploader({
  teamId,
  logoUrl,
  initials,
  color,
}: {
  teamId: string;
  logoUrl: string | null;
  initials: string;
  color: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(original: File | undefined) {
    if (!original) return;
    if (!original.type.startsWith("image/")) {
      toast.error("Only image files are allowed.");
      return;
    }
    if (original.size > 25 * 1024 * 1024) {
      toast.error("Keep it under 25MB.");
      return;
    }
    setBusy(true);

    const file = await compressImage(original, IMAGE_PRESETS.logo);
    if (!isPictureType(file.type)) {
      toast.error("Use a picture: PNG, JPG, WebP or GIF.");
      setBusy(false);
      return;
    }
    const path = `${teamId}/logo-${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("team-logos")
      .upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type });
    if (uploadError) {
      toast.error("Upload failed. You may not have permission.");
      setBusy(false);
      return;
    }

    const { data } = supabase.storage.from("team-logos").getPublicUrl(path);
    const result = await updateTeamLogo(teamId, data.publicUrl);
    setBusy(false);
    if (result?.error) toast.error(result.error);
    else {
      toast.success("Workspace picture updated");
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0 overflow-hidden"
        style={{ background: color }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={logoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-line/15 px-3.5 py-2 text-[12.5px] font-semibold text-ink-soft hover:border-amber hover:text-amber transition-colors disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Change picture"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
