"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { ArrowRightIcon, MoreIcon, TrashIcon } from "@/components/ui/icons";
import { DeleteVideoDialog } from "./delete-video-dialog";

/**
 * ⋯ on a long video in the list (1.27.5, masters): open it, or delete it
 * (DeleteVideoDialog: what it holds, then its name typed). Sits above the
 * card's or row's own link.
 */
export function VideoMenu({ id, teamId, number, title, className = "" }: { id: string; teamId: string; number: number; title: string; className?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const item = "w-full flex items-center gap-2.5 text-left rounded-lg px-3 h-9 text-[13px] font-semibold hover:bg-surface-2 focus:bg-surface-2 focus:outline-none";
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={`Actions for #${number}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${className}`}
      >
        <MoreIcon className="w-4 h-4" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={220} label={`Actions for #${number}`}>
        <div className="p-1">
          <Link role="menuitem" href={`/videos/${id}`} className={`${item} text-ink`} onClick={() => setOpen(false)}>
            <ArrowRightIcon className="w-3.5 h-3.5 text-ink-soft" />
            Open
          </Link>
          <div className="my-1 h-px bg-line/10" />
          <button
            type="button"
            role="menuitem"
            className={`${item} text-red hover:!bg-red/10`}
            onClick={() => {
              setOpen(false);
              setDeleting(true);
            }}
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Delete…
          </button>
        </div>
      </AnchoredMenu>
      {deleting && <DeleteVideoDialog video={{ id, teamId, number, title }} onClose={() => setDeleting(false)} />}
    </>
  );
}
