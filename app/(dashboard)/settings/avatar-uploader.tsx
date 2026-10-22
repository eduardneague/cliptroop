"use client";

import { initialsFor } from "@/lib/avatar";
import { useAvatarUpload } from "./use-avatar-upload";

export function AvatarUploader({
  userId,
  avatarUrl,
  displayName,
  color,
}: {
  userId: string;
  avatarUrl: string | null;
  displayName: string;
  color: string;
}) {
  const { busy, pick, field } = useAvatarUpload(userId);

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0 overflow-hidden"
        style={{ background: color }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initialsFor(displayName)
        )}
      </div>
      <button
        onClick={pick}
        disabled={busy}
        className="rounded-lg border border-line/15 px-3.5 py-2 text-[12.5px] font-semibold text-ink-soft hover:border-amber hover:text-amber transition-colors disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Change photo"}
      </button>
      {field}
    </div>
  );
}
