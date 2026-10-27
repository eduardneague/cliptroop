"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, MoreIcon, TrashIcon } from "@/components/ui/icons";
import type { PipelineStage } from "@/lib/permissions/roles";
import { exportMessage, type ExportFormat } from "@/lib/bulk-text";
import { FileTypeIcon } from "@/modules/short-videos/components/file-type-icon";
import { DeleteVideoDialog } from "./delete-video-dialog";
import { STAGE_LABELS, STAGE_ORDER, stageColor } from "../lib/stages";
import { useMoveVideos } from "../lib/use-move-videos";

/** The steps a master can move a long video to by hand (Posted comes by itself). */
export const LONG_MOVABLE = STAGE_ORDER.filter((s) => s !== "done");

/**
 * ⋯ on a long video in the list (1.27.5, masters: open it, or delete it). 1.40.0, as the shorts' ⋯ (the owner: "i want
 * this same logic to apply to long videos too"): everyone exports its script as a PDF or a Word file; masters also move
 * it to a step (a correction by hand, nobody is told, Undo in the toast) and delete it (DeleteVideoDialog: what it
 * holds, then its name typed). Sits above the card's or row's own link.
 */
export function VideoMenu({
  id,
  teamId,
  number,
  title,
  stage,
  isMaster,
  className = "",
}: {
  id: string;
  teamId: string;
  number: number;
  title: string;
  stage: PipelineStage;
  isMaster: boolean;
  className?: string;
}) {
  const toast = useToast();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "move">("main");
  const [back, setBack] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const step = useMoveVideos();
  const busy = step.pending || !!exporting;
  const item = "w-full flex items-center gap-2.5 text-left rounded-lg px-3 h-9 text-[13px] font-semibold hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent";

  async function handleExport(format: ExportFormat) {
    setOpen(false);
    setExporting(format);
    try {
      const { exportLongScripts } = await import("../lib/export-videos");
      const r = await exportLongScripts([id], format);
      if (r.error !== undefined) toast.error(r.error);
      else {
        const msg = exportMessage(r, format);
        if (msg.ok) toast.success(msg.text);
        else toast.error(msg.text);
      }
    } catch {
      toast.error("Couldn't make the file. Check your connection and try again.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setView("main");
          setBack(false);
          setOpen((o) => !o);
        }}
        aria-label={`Actions for #${number}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${className}`}
      >
        {busy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin" aria-hidden /> : <MoreIcon className="w-4 h-4" />}
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={240} label={view === "move" ? `Move #${number} to` : `Actions for #${number}`}>
        {view === "move" ? (
          <div key="move" className="p-1 menu-slide-in">
            <button
              type="button"
              role="menuitem"
              className={`${item} !text-ink-soft`}
              onClick={() => {
                setBack(true);
                setView("main");
              }}
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
              {`Move #${number} to`}
            </button>
            <div className="my-1 h-px bg-line/10" />
            {LONG_MOVABLE.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={s === stage}
                className={`${item} font-medium text-ink`}
                disabled={s === stage || busy}
                onClick={() => {
                  setOpen(false);
                  void step.run([{ id, to: s }]);
                }}
              >
                <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: s === stage ? stageColor(s) : "rgb(var(--ink-faint))" }} aria-hidden />
                <span className="flex-1 min-w-0">{STAGE_LABELS[s]}</span>
                {s === stage && <span className="text-[11px] font-normal text-ink-faint">Now</span>}
              </button>
            ))}
            <p className="px-3 pt-1.5 pb-1 text-[11px] leading-snug text-ink-faint border-t border-line/10 mt-1">A correction by hand: nobody is told. Posted comes by itself once it&rsquo;s marked posted.</p>
          </div>
        ) : (
          <div key="main" className={`p-1 ${back ? "menu-back-in" : ""}`}>
            <Link role="menuitem" href={`/videos/${id}`} className={`${item} text-ink`} onClick={() => setOpen(false)}>
              <ArrowRightIcon className="w-3.5 h-3.5 text-ink-soft" />
              Open
            </Link>
            <div className="my-1 h-px bg-line/10" />
            <button type="button" role="menuitem" className={`${item} text-ink`} disabled={busy} onClick={() => void handleExport("pdf")}>
              <FileTypeIcon kind="pdf" className="w-3.5 h-3.5 text-ink-soft" />
              Export script as PDF
            </button>
            <button type="button" role="menuitem" className={`${item} text-ink`} disabled={busy} onClick={() => void handleExport("docx")}>
              <FileTypeIcon kind="docx" className="w-3.5 h-3.5 text-ink-soft" />
              Export script as Word
            </button>
            {isMaster && (
              <>
                <div className="my-1 h-px bg-line/10" />
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  className={`${item} text-ink`}
                  disabled={busy || stage === "done"}
                  title={stage === "done" ? "Posted videos stay posted" : undefined}
                  onClick={() => setView("move")}
                >
                  <span className="w-3.5 h-3.5 flex items-center justify-center" aria-hidden>
                    <span className="w-2 h-2 rounded-[3px]" style={{ background: stageColor(stage) }} />
                  </span>
                  <span className="flex-1 min-w-0">Move to step</span>
                  <span className="text-[11px] font-normal text-ink-faint truncate max-w-[6rem]">{STAGE_LABELS[stage]}</span>
                  <ChevronRightIcon className="w-3.5 h-3.5 text-ink-faint" />
                </button>
                <div className="my-1 h-px bg-line/10" />
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-red hover:!bg-red/10`}
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    setDeleting(true);
                  }}
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  Delete…
                </button>
              </>
            )}
          </div>
        )}
      </AnchoredMenu>
      {deleting && <DeleteVideoDialog video={{ id, teamId, number, title }} onClose={() => setDeleting(false)} />}
    </>
  );
}
