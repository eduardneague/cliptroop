import Link from "next/link";
import { colorForId } from "@/lib/avatar";
import { onFill } from "@/lib/contrast";
import { wordColor } from "@/lib/word-color";
import { ExternalIcon, PlayIcon, ShortsIcon, VideoIcon } from "@/components/ui/icons";
import { domainOf, initialOf, pathOf, STATUS_COLOR, STATUS_HINT, STATUS_LABEL, type AffiliateStatus, type LinkedVideo } from "../lib/rules";

/*
 * The small parts the Affiliates list is drawn with (1.56.0), on the server and in the browser alike: a brand's
 * initial, its status, a link shown as where it goes, a linked video.
 */

/** The brand's initial in its own colour (where the number is on the shorts list: picking puts a tick box there). */
export function BrandBadge({ id, name, className = "w-7 h-7 text-[12px]" }: { id: string; name: string; className?: string }) {
  const c = colorForId(id);
  return (
    <span data-row-num="" className={`${className} rounded-lg flex items-center justify-center font-bold flex-shrink-0 select-none`} style={{ background: c, color: onFill(c) }} aria-hidden>
      {initialOf(name)}
    </span>
  );
}

export function StatusPill({ status }: { status: AffiliateStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md font-bold whitespace-nowrap text-[10.5px] px-2 py-0.5"
      style={{ color: wordColor(c), background: `color-mix(in srgb, ${c} 14%, rgb(var(--surface)))` }}
      title={STATUS_HINT[status]}
    >
      <span className="w-1.5 h-1.5 rounded-[2px]" style={{ background: c }} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** A link shown as where it goes ("gravastar.com" and, quieter, the rest), opening in a new tab. */
export function OutLink({ url, label, className = "" }: { url: string; label?: string; className?: string }) {
  const rest = pathOf(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={url}
      className={`relative z-10 group/link inline-flex items-center gap-1 min-w-0 max-w-full text-[12.5px] hover:underline decoration-ink-faint/60 underline-offset-2 ${className}`}
    >
      <span className="font-semibold text-ink truncate flex-shrink-0 max-w-full">{label ?? domainOf(url)}</span>
      {!label && rest && <span className="text-ink-faint truncate min-w-0">{rest}</span>}
      <ExternalIcon className="w-3 h-3 flex-shrink-0 text-ink-faint opacity-0 group-hover/link:opacity-100 transition-opacity" aria-hidden />
    </a>
  );
}

/** A linked long video or Short: its number and title, to its page; YouTube beside it once it's out. */
export function VideoChip({ video, wide = false }: { video: LinkedVideo; wide?: boolean }) {
  const Icon = video.kind === "short" ? ShortsIcon : VideoIcon;
  return (
    <span className={`relative z-10 inline-flex items-center gap-1 min-w-0 ${wide ? "max-w-full" : "max-w-[15rem]"}`}>
      <Link
        href={video.kind === "short" ? `/shorts/${video.id}` : `/videos/${video.id}`}
        title={`${video.kind === "short" ? "Short" : "Long video"}${video.number !== null ? ` #${video.number}` : ""}: ${video.title} (${video.stageLabel})`}
        className="inline-flex items-center gap-1.5 min-w-0 rounded-md bg-surface-2 hover:bg-line/10 px-2 h-6 text-[11.5px] font-semibold text-ink-soft hover:text-ink transition-colors"
      >
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${video.kind === "short" ? "text-short" : "text-long"}`} />
        {video.number !== null && <span className="font-mono text-[10.5px] text-ink-faint tabular-nums">#{video.number}</span>}
        <span className="truncate">{video.title}</span>
      </Link>
      {video.watchUrl && (
        <a
          href={video.watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Watch “${video.title}” on YouTube`}
          title="Watch it on YouTube"
          className="w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center text-ink-faint hover:text-red hover:bg-red/10 transition-colors"
        >
          <PlayIcon className="w-3 h-3" />
        </a>
      )}
    </span>
  );
}
