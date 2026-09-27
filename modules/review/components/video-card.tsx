import Link from "next/link";
import { relativeTime } from "@/lib/relative-time";
import { ExternalIcon } from "@/components/ui/icons";
import { formatBytes, formatTime } from "../lib/limits";
import type { VideoVersion } from "../lib/queries";
import { VersionUploader } from "./uploader";

/** The short's video at a glance: latest version, open notes, review. */
export function VideoCard({
  shortId,
  teamId,
  versions,
  openNotes,
  canUpload,
  prominent,
  legacyLink,
}: {
  shortId: string;
  teamId: string;
  versions: VideoVersion[];
  openNotes: number;
  canUpload: boolean;
  prominent: boolean;
  /** A Frame.io link from before in-app review, if any. */
  legacyLink: string | null;
}) {
  const latest = versions.find((v) => !v.deleted) ?? null;
  const next = (versions[0]?.number ?? 0) + 1;

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

      {latest ? (
        <p className="text-[13.5px] text-ink">
          <b>v{latest.number}</b>
          {latest.duration ? ` · ${formatTime(latest.duration)}` : ""} · {formatBytes(latest.size)}
          <span className="block text-[12px] text-ink-soft mt-0.5">
            {latest.uploadedBy ? `Uploaded by ${latest.uploadedBy.name}, ` : "Uploaded "}
            {relativeTime(latest.createdAt)}
            {versions.length > 1 ? ` · ${versions.length} versions` : ""}
          </span>
        </p>
      ) : legacyLink ? (
        <a href={legacyLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink hover:underline">
          <ExternalIcon className="w-4 h-4 text-green" />
          Frame.io link (from before in-app review)
        </a>
      ) : (
        <p className="text-[13.5px] text-ink-soft">{canUpload ? "No video yet. Upload the first version." : "The editor will upload the video here."}</p>
      )}

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
        {canUpload && <VersionUploader teamId={teamId} shortId={shortId} nextNumber={next} prominent={!latest && prominent} />}
      </div>
    </section>
  );
}
