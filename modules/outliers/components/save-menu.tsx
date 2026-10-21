"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { createFolder, removeSave, saveChannel, saveVideo } from "@/app/(dashboard)/outliers/actions";
import type { SaveRef } from "../lib/types";
import { BookmarkIcon, folderColor } from "./bits";
import { useOutliersSaves } from "./context";

/*
 * Saving a video or a channel (1.27.0): the bookmark on every card. With no
 * folders yet it saves at once; with folders it opens a menu to tick the
 * folders it goes in (a video can be in several), make a new one, or take
 * it out. Everything changes on the page at once and is put back if the
 * server says no.
 */

let tmp = 0;

export function useSaving(ref: string, kind: "video" | "channel") {
  const { teamId, folders, setFolders, saves, addSave, dropSave } = useOutliersSaves();
  const toast = useToast();
  const mine = saves.get(ref) ?? [];
  const bump = (folderId: string | null, by: number) => {
    if (!folderId) return;
    setFolders((fs) => fs.map((f) => (f.id === folderId ? { ...f, count: Math.max(0, f.count + by) } : f)));
  };
  const save = async (folderId: string | null) => {
    const temp: SaveRef = { ref, folderId, id: `tmp-${++tmp}` };
    addSave(temp);
    bump(folderId, 1);
    try {
      const r = kind === "video" ? await saveVideo(teamId, ref, folderId) : await saveChannel(teamId, ref, folderId);
      dropSave(temp.id);
      if (r.error !== undefined) {
        bump(folderId, -1);
        toast.error(r.error);
        return false;
      }
      addSave({ ref, folderId, id: r.id });
      return true;
    } catch {
      dropSave(temp.id);
      bump(folderId, -1);
      toast.error("Couldn't save it. Check your connection and try again.");
      return false;
    }
  };
  const unsave = async (s: SaveRef) => {
    dropSave(s.id);
    bump(s.folderId, -1);
    if (s.id.startsWith("tmp-")) return true;
    try {
      const r = await removeSave(teamId, s.id);
      if (r.error !== undefined) {
        addSave(s);
        bump(s.folderId, 1);
        toast.error(r.error);
        return false;
      }
      return true;
    } catch {
      addSave(s);
      bump(s.folderId, 1);
      toast.error("Couldn't remove it. Check your connection and try again.");
      return false;
    }
  };
  return { teamId, folders, setFolders, mine, saved: mine.length > 0, save, unsave };
}

/** The bookmark: on a picture (`overlay`), or a normal button (`label` shows the word). */
export function SaveButton({
  videoId,
  channelId,
  overlay = false,
  label = false,
  menu: forceMenu = false,
  className = "",
}: {
  videoId?: string;
  channelId?: string;
  overlay?: boolean;
  label?: boolean;
  /** Always open the folder menu (the panels), even with no folders yet. */
  menu?: boolean;
  className?: string;
}) {
  const ref = videoId ?? channelId ?? "";
  const kind = videoId ? "video" : "channel";
  const s = useSaving(ref, kind);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const useMenu = forceMenu || s.folders.length > 0;

  const click = async () => {
    if (useMenu) return setOpen((o) => !o);
    if (s.saved) {
      for (const x of s.mine) await s.unsave(x);
      toast.success("Removed from Saved", { sound: false });
    } else if (await s.save(null)) toast.success(kind === "video" ? "Saved. It's in the Saved tab." : "Channel saved. It's in the Saved tab.");
  };

  const what = kind === "video" ? "video" : "channel";
  const base = overlay
    ? `absolute top-2 right-2 z-[1] inline-flex items-center justify-center w-8 h-8 rounded-lg backdrop-blur-sm transition-[opacity,background-color] ${s.saved ? "bg-amber text-white opacity-100" : "bg-black/55 text-white hover:bg-black/75 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"} ${open ? "!opacity-100" : ""}`
    : `inline-flex items-center justify-center gap-1.5 rounded-lg border h-9 text-[13px] font-semibold transition-colors ${label ? "px-3" : "w-9"} ${s.saved ? "border-amber/40 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30 hover:bg-surface-2/60"}`;

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={click}
        aria-haspopup={useMenu ? "menu" : undefined}
        aria-expanded={useMenu ? open : undefined}
        aria-label={s.saved ? `Saved: change where this ${what} is saved` : `Save this ${what}`}
        title={s.saved ? "Saved" : "Save"}
        className={`${base} ${className}`}
      >
        <BookmarkIcon filled={s.saved} className={overlay ? "w-[15px] h-[15px]" : "w-4 h-4"} />
        {label && <span>{s.saved ? "Saved" : "Save"}</span>}
      </button>
      {useMenu && <FolderMenu open={open} onClose={() => setOpen(false)} anchor={anchor} s={s} kind={kind} />}
    </>
  );
}

function FolderMenu({ open, onClose, anchor, s, kind }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; s: ReturnType<typeof useSaving>; kind: "video" | "channel" }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [making, setMaking] = useState(false);
  const inFolder = (id: string | null) => s.mine.find((x) => x.folderId === id) ?? null;
  const toggle = async (folderId: string | null) => {
    const there = inFolder(folderId);
    if (there) await s.unsave(there);
    else await s.save(folderId);
  };
  const make = async () => {
    const n = name.trim();
    if (!n || making) return;
    setMaking(true);
    try {
      const r = await createFolder(s.teamId, n);
      if (r.error !== undefined) return toast.error(r.error);
      s.setFolders((fs) => [...fs, { id: r.id, name: n.slice(0, 40), color: "amber", position: fs.length, createdBy: null, count: 0 }]);
      setName("");
      await s.save(r.id);
      toast.success(`Saved in “${n.slice(0, 40)}”`);
    } catch {
      toast.error("Couldn't make the folder. Try again.");
    } finally {
      setMaking(false);
    }
  };
  const row = "w-full flex items-center gap-2.5 px-3 h-10 text-left text-[13.5px] rounded-lg hover:bg-surface-2 focus-visible:bg-surface-2 outline-none";
  return (
    <AnchoredMenu open={open} onClose={onClose} anchor={anchor} width={280} label="Save to">
      <div className="p-1.5" data-floating-menu>
        <p className="px-3 pt-1.5 pb-1 text-[11.5px] font-semibold text-ink-faint">Save {kind === "video" ? "this video" : "this channel"} to</p>
        {[{ id: null as string | null, name: "Saved", color: "slate", count: -1 }, ...s.folders].map((f) => {
          const on = !!inFolder(f.id);
          return (
            <button key={f.id ?? "none"} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(f.id)} className={row}>
              <span className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center flex-shrink-0 ${on ? "bg-amber border-amber text-white" : "border-line/25"}`}>{on && <CheckIcon className="w-3 h-3" />}</span>
              {f.id && <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: folderColor(f.color) }} aria-hidden />}
              <span className="flex-1 truncate">{f.name}</span>
              {f.count >= 0 && <span className="text-[11.5px] text-ink-faint tabular-nums">{f.count}</span>}
            </button>
          );
        })}
        <form
          className="flex items-center gap-1.5 px-1.5 pt-1.5 mt-1 border-t border-line/10"
          onSubmit={(e) => {
            e.preventDefault();
            make();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="New folder" aria-label="New folder's name" className="flex-1 min-w-0 h-9 rounded-lg bg-surface-2 px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-amber/40" />
          <button type="submit" disabled={!name.trim() || making} aria-label="Make the folder and save here" className="w-9 h-9 rounded-lg bg-amber text-white flex items-center justify-center disabled:opacity-40">
            <PlusIcon className="w-4 h-4" />
          </button>
        </form>
        {s.saved && (
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              for (const x of s.mine) await s.unsave(x);
              onClose();
            }}
            className={`${row} mt-1 text-red`}
          >
            Remove from Saved
          </button>
        )}
      </div>
    </AnchoredMenu>
  );
}
