"use client";

import { Ago } from "@/components/ui/ago";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalIcon } from "@/components/ui/icons";
import { formatBytes, formatTime } from "../lib/limits";
import type { VideoVersion } from "../lib/queries";
import { VersionUploader } from "./uploader";
import { lengthNotes } from "@/lib/short-length";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";

/** The short's video at a glance: latest version, open notes, review. */
export function VideoCard({
  shortId,
  teamId,
  versions,
  openNotes,
  canUpload,
  prominent,
  platforms = [],
}: {
  shortId: string;
  teamId: string;
  versions: VideoVersion[];
  openNotes: number;
  canUpload: boolean;
  prominent: boolean;
  /** Where the short is planned to go: a video too long for one of them says so here. */
  platforms?: readonly string[];
}) {
  const router = useRouter();
  const latest = versions.find((v) => !v.deleted) ?? null;
  const next = (versions[0]?.number ?? 0) + 1;

  // Just uploaded: show it straight away, and make sure the page really
  // catches up (retry the refresh if it comes back without the new video).
  const [pending, setPending] = useState<{ id: string; number: number } | null>(null);
  const tries = useRef(0);
  const arrived = !!pending && versions.some((v) => v.id === pending.id);
  useEffect(() => {
    if (!pending) return;
    if (arrived) {
      setPending(null);
      tries.current = 0;
      return;
    }
    if (tries.current >= 5) return;
    const t = setTimeout(() => {
      tries.current += 1;
      router.refresh();
    }, 1200);
    return () => clearTimeout(t);
  }, [pending, arrived, versions, router]);

  return (
    <section className={`rounded-2xl bg-surface p-4 sm:p-5 ${prominent ? "border border-amber" : "border border-line/10"}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className={`text-[11px] font-bold uppercase tracking-wide ${prominent ? "text-amber" : "text-ink-soft"}`}>Video</h2>
        {latest && openNotes > 0 && (
          <span className="text-[12px] font-semibold text-amber">
            {openNotes} open note{openNotes === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {pending && !arrived ? (
        <p className="text-[13.5px] text-ink flex items-center gap-2" role="status">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-amber border-t-transparent animate-spin" />
          <span>
            <b>v{pending.number}</b> uploaded <span className="text-ink-soft">· updating…</span>
          </span>
        </p>
      ) : latest ? (
        <p className="text-[13.5px] text-ink">
          <b>v{latest.number}</b>
          {latest.duration ? ` · ${formatTime(latest.duration)}` : ""} · {formatBytes(latest.size)}
          <span className="block text-[12px] text-ink-soft mt-0.5">
            {latest.uploadedBy ? `Uploaded by ${latest.uploadedBy.name}, ` : "Uploaded "}
            <Ago iso={latest.createdAt} />
            {versions.length > 1 ? ` · ${versions.length} versions` : ""}
          </span>
        </p>
      ) : (
        <p className="text-[13.5px] text-ink-soft">{canUpload ? "No video yet. Upload the first version." : "The editor will upload the video here."}</p>
      )}

      {latest && !(pending && !arrived) && <LengthNotes duration={latest.duration} platforms={platforms} />}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {latest && (
          <Link
            href={`/shorts/${shortId}/review`}
            className={`inline-flex items-center gap-1.5 rounded-lg font-bold px-3.5 h-9 text-[13px] transition-[filter] ${
              prominent ? "bg-amber text-white hover:brightness-110" : "border border-line/15 text-ink hover:border-line/30"
            }`}
          >
            Open review
          </Link>
        )}
        {canUpload && !(pending && !arrived) && (
          <VersionUploader
            teamId={teamId}
            shortId={shortId}
            nextNumber={next}
            prominent={!latest && prominent}
            onUploaded={(id) => {
              tries.current = 0;
              setPending({ id, number: next });
            }}
          />
        )}
      </div>
    </section>
  );
}

/** "Too long for Facebook" and the like, one line per platform. */
export function LengthNotes({ duration, platforms, className = "mt-3" }: { duration: number | null; platforms: readonly string[]; className?: string }) {
  const notes = lengthNotes(duration, platforms);
  if (!notes.length) return null;
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {notes.map((n) => (
        <li
          key={n.platform}
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px] leading-snug ${n.level === "block" ? "bg-red/[0.07] text-red" : "bg-amber/10 text-ink"}`}
        >
          <PlatformIcon platform={n.platform} className="w-4 h-4 rounded mt-[1px] flex-shrink-0" />
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}
