"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { useConfirm } from "@/components/ui/confirm-provider";
import { CheckIcon, EditIcon, MoreIcon, PlusIcon, ShortsIcon, TrashIcon, VideoIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { startNavProgress } from "@/components/ui/nav-progress";
import { createFolder, deleteFolder, moveSave, noteSave, removeSave, renameFolder, startFromIdea } from "@/app/(dashboard)/outliers/actions";
import { NICHE_COLORS } from "../../lib/explore";
import { FORMAT_BY_ID } from "../../lib/formats";
import type { Folder, SavedItem } from "../../lib/types";
import type { SavedData } from "../../lib/view";
import { BTN, BTN_MAIN, ChannelAvatar, EmptyNote, folderColor, Mult, TimeAgo } from "../bits";
import { compact } from "../../lib/filters";
import { useOutliers, useOutliersSaves } from "../context";
import { formatColor } from "../idea-card";
import { useShellNav } from "../shell-nav";
import { ShortCard, VideoCard } from "../video-card";

/*
 * Saved (1.27.0): the team's folders of videos, ideas and channels, with a
 * note on each. Ideas start a long video or a Short from here; whatever was
 * started from one says so.
 */

type What = "all" | "video" | "idea" | "channel";

export function SavedTab({ data }: { data: SavedData }) {
  const ctx = useOutliers();
  const saves = useOutliersSaves();
  const nav = useShellNav();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState(data.items);
  const [what, setWhat] = useState<What>("all");
  const [naming, setNaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  useEffect(() => setItems(data.items), [data.items]);

  const folder = data.folder;
  const current = folder && folder !== "unsorted" ? saves.folders.find((f) => f.id === folder) ?? null : null;
  const shown = useMemo(() => items.filter((i) => what === "all" || i.kind === what), [items, what]);
  const counts = useMemo(() => ({ video: items.filter((i) => i.kind === "video").length, idea: items.filter((i) => i.kind === "idea").length, channel: items.filter((i) => i.kind === "channel").length }), [items]);
  const total = saves.folders.reduce((s, f) => s + f.count, 0);

  const goFolder = (id: string | null) => nav.go({ tab: "saved", params: { folder: id } }, { replace: true });

  const make = async () => {
    const n = newName.trim();
    if (!n) return;
    try {
      const r = await createFolder(ctx.teamId, n, NICHE_COLORS[saves.folders.length % NICHE_COLORS.length]);
      if (r.error !== undefined) return toast.error(r.error);
      saves.setFolders((fs) => [...fs, { id: r.id, name: n.slice(0, 40), color: NICHE_COLORS[fs.length % NICHE_COLORS.length], position: fs.length, createdBy: null, count: 0 }]);
      setNewName("");
      setNaming(null);
      goFolder(r.id);
    } catch {
      toast.error("Couldn't make the folder. Try again.");
    }
  };
  const rename = async (f: Folder, name: string, color?: string) => {
    const n = name.trim();
    if (!n) return;
    const before = saves.folders;
    saves.setFolders((fs) => fs.map((x) => (x.id === f.id ? { ...x, name: n, color: color ?? x.color } : x)));
    try {
      const r = await renameFolder(ctx.teamId, f.id, n, color);
      if (r.error !== undefined) {
        saves.setFolders(before);
        toast.error(r.error);
      }
    } catch {
      saves.setFolders(before);
      toast.error("Couldn't rename the folder. Try again.");
    }
  };
  const remove = async (f: Folder) => {
    const ok = await confirm({ title: `Delete “${f.name}”?`, description: "What's in it stays saved, without a folder.", confirmLabel: "Delete folder", danger: true });
    if (!ok) return;
    try {
      const r = await deleteFolder(ctx.teamId, f.id);
      if (r.error !== undefined) return toast.error(r.error);
      saves.setFolders((fs) => fs.filter((x) => x.id !== f.id));
      toast.success("Folder deleted");
      goFolder(null);
    } catch {
      toast.error("Couldn't delete the folder. Try again.");
    }
  };

  const drop = async (item: SavedItem) => {
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    saves.dropSave(item.id);
    if (item.folderId) saves.setFolders((fs) => fs.map((f) => (f.id === item.folderId ? { ...f, count: Math.max(0, f.count - 1) } : f)));
    try {
      const r = await removeSave(ctx.teamId, item.id);
      if (r.error !== undefined) {
        setItems((xs) => [item, ...xs]);
        toast.error(r.error);
      } else toast.success("Removed from Saved", { sound: false });
    } catch {
      setItems((xs) => [item, ...xs]);
      toast.error("Couldn't remove it. Try again.");
    }
  };
  const move = async (item: SavedItem, to: string | null) => {
    if (item.folderId === to) return;
    setItems((xs) => (folder ? xs.filter((x) => x.id !== item.id) : xs.map((x) => (x.id === item.id ? { ...x, folderId: to } : x))));
    saves.setFolders((fs) => fs.map((f) => (f.id === item.folderId ? { ...f, count: Math.max(0, f.count - 1) } : f.id === to ? { ...f, count: f.count + 1 } : f)));
    const ref = item.video?.id ?? item.channel?.id;
    if (ref) {
      saves.dropSave(item.id);
      saves.addSave({ ref, folderId: to, id: item.id });
    }
    try {
      const r = await moveSave(ctx.teamId, item.id, to);
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(to ? `Moved to ${saves.folders.find((f) => f.id === to)?.name ?? "the folder"}` : "Moved out of the folder", { sound: false });
    } catch {
      toast.error("Couldn't move it. Try again.");
    }
  };

  const folderBtn = (id: string | null, label: string, count: number | null, color?: string) => {
    const on = (folder ?? null) === id;
    return (
      <button key={id ?? "all"} type="button" onClick={() => goFolder(id)} aria-current={on ? "true" : undefined} className={`flex-shrink-0 lg:w-full flex items-center gap-2.5 rounded-lg px-3 h-9 lg:h-10 text-left text-[13px] font-semibold transition-colors ${on ? "bg-surface text-ink shadow-[inset_0_0_0_1px_rgb(var(--line)/0.14)]" : "text-ink-soft hover:text-ink hover:bg-surface/60"}`}>
        {color ? <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: folderColor(color) }} aria-hidden /> : null}
        <span className="flex-1 truncate">{label}</span>
        {count !== null && <span className="text-[11.5px] text-ink-faint tabular-nums">{count}</span>}
      </button>
    );
  };

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
      <nav aria-label="Folders" className="mb-5 lg:mb-0">
        <div className="relative flex lg:flex-col gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:sticky lg:top-[4.5rem]">
          {folderBtn(null, "Everything", null)}
          {saves.folders.map((f) => folderBtn(f.id, f.name, f.count, f.color))}
          {naming === "new" ? (
            <form
              className="flex-shrink-0 flex items-center gap-1 lg:mt-1"
              onSubmit={(e) => {
                e.preventDefault();
                make();
              }}
            >
              <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus maxLength={40} placeholder="Folder name" onBlur={() => !newName.trim() && setNaming(null)} className="w-40 lg:w-full rounded-lg border border-line/15 bg-surface px-2.5 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber" />
              <button type="submit" aria-label="Make the folder" className="w-9 h-9 rounded-lg bg-amber text-white flex items-center justify-center flex-shrink-0">
                <CheckIcon className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setNaming("new")} className="flex-shrink-0 lg:w-full inline-flex items-center gap-2 rounded-lg px-3 h-9 lg:h-10 text-[13px] font-semibold text-ink-faint hover:text-ink border border-dashed border-line/20 lg:mt-1">
              <PlusIcon className="w-3.5 h-3.5" />
              New folder
            </button>
          )}
        </div>
      </nav>

      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="min-w-0 flex-1">
            {current && naming === current.id ? (
              <FolderEditor f={current} onDone={(name, color) => (rename(current, name, color), setNaming(null))} onCancel={() => setNaming(null)} />
            ) : (
              <h2 className="font-display text-[22px] font-semibold leading-tight truncate flex items-center gap-2">
                {current && <span className="w-3 h-3 rounded-[3px]" style={{ background: folderColor(current.color) }} aria-hidden />}
                {current ? current.name : folder === "unsorted" ? "Not in a folder" : "Everything saved"}
              </h2>
            )}
            <p className="text-[12.5px] text-ink-faint mt-0.5">{folder ? `${items.length} saved here` : `${items.length} saved by the team${total ? ` · ${total} in folders` : ""}`}</p>
          </div>
          {current && naming !== current.id && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setNaming(current.id)} className={BTN}>
                <EditIcon className="w-3.5 h-3.5" />
                Rename
              </button>
              <button type="button" onClick={() => remove(current)} className={`${BTN} hover:!text-red`} aria-label="Delete folder">
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <Segmented
          ariaLabel="What"
          size="sm"
          value={what}
          onChange={setWhat}
          className="mb-5"
          options={[
            { value: "all", label: "All", count: items.length },
            { value: "video", label: "Videos", count: counts.video },
            { value: "idea", label: "Ideas", count: counts.idea },
            { value: "channel", label: "Channels", count: counts.channel },
          ]}
        />
        {shown.length ? (
          <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((item) => (
              <SavedCard key={item.id} item={item} folders={saves.folders} onRemove={() => drop(item)} onMove={(to) => move(item, to)} />
            ))}
          </ul>
        ) : (
          <EmptyNote
            title={items.length ? "Nothing of this kind here" : folder ? "This folder is empty" : "Nothing saved yet"}
            action={
              !items.length ? (
                <Link href={nav.href({ tab: "home" })} className={BTN_MAIN}>
                  Find outliers
                </Link>
              ) : undefined
            }
          >
            {!items.length && "Tap the bookmark on any video, idea or channel to keep it here for the team."}
          </EmptyNote>
        )}
      </div>
    </div>
  );
}

function FolderEditor({ f, onDone, onCancel }: { f: Folder; onDone: (name: string, color: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(f.name);
  const [color, setColor] = useState(f.color);
  return (
    <form
      className="flex items-center gap-2 flex-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(name, color);
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} className="rounded-lg border border-line/15 bg-surface px-3 h-10 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-amber" aria-label="Folder name" />
      <div className="flex gap-1">
        {["amber", ...NICHE_COLORS.slice(0, 9)].map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c} className={`w-6 h-6 rounded-md ring-offset-2 ring-offset-paper ${color === c ? "ring-2 ring-ink" : ""}`} style={{ background: folderColor(c) }} />
        ))}
      </div>
      <button type="submit" className={BTN_MAIN}>
        Save
      </button>
      <button type="button" onClick={onCancel} className={BTN}>
        Cancel
      </button>
    </form>
  );
}

function SavedCard({ item, folders, onRemove, onMove }: { item: SavedItem; folders: Folder[]; onRemove: () => void; onMove: (to: string | null) => void }) {
  const ctx = useOutliers();
  const toast = useToast();
  const [note, setNote] = useState(item.note ?? "");
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const saveNote = async () => {
    setEditing(false);
    if ((item.note ?? "") === note.trim()) return;
    try {
      const r = await noteSave(ctx.teamId, item.id, note);
      if (r.error !== undefined) toast.error(r.error);
    } catch {
      toast.error("Couldn't save the note. Try again.");
    }
  };
  const folderName = item.folderId ? folders.find((f) => f.id === item.folderId)?.name : null;

  return (
    <li className="rounded-2xl border border-line/10 bg-surface p-3 flex flex-col min-w-0">
      {item.kind === "video" && item.video ? (
        item.video.kind === "short" ? (
          <div className="max-w-[200px]">
            <ShortCard v={item.video} />
          </div>
        ) : (
          <VideoCard v={item.video} />
        )
      ) : item.kind === "channel" && item.channel ? (
        <button type="button" onClick={() => ctx.openChannel(item.channel!.id)} className="flex items-center gap-3 text-left rounded-xl p-1 hover:bg-surface-2/60">
          <ChannelAvatar src={item.channel.avatar} title={item.channel.title} size={52} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold truncate">{item.channel.title}</span>
            <span className="block text-[12px] text-ink-faint">
              {compact(item.channel.subs)} subscribers · usual {compact(item.channel.longMedian ?? item.channel.shortMedian)}
            </span>
          </span>
          {item.channel.best !== null && <Mult score={item.channel.best} size="sm" />}
        </button>
      ) : item.kind === "idea" && item.idea ? (
        <SavedIdeaBody item={item} />
      ) : (
        <p className="text-[13px] text-ink-faint p-2">This video isn&rsquo;t kept any more (YouTube&rsquo;s data is kept 30 days unless it&rsquo;s saved).</p>
      )}

      <div className="mt-3 pt-3 border-t border-line/[0.08]">
        {editing ? (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote();
              if (e.key === "Escape") {
                setNote(item.note ?? "");
                setEditing(false);
              }
            }}
            autoFocus
            rows={2}
            maxLength={1000}
            placeholder="A note for the team"
            className="w-full resize-none rounded-lg bg-surface-2 px-2.5 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-amber"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className={`w-full text-left text-[12.5px] leading-relaxed rounded-lg px-2 py-1 -mx-2 hover:bg-surface-2 ${note ? "text-ink-soft" : "text-ink-faint"}`}>
            {note || "Add a note"}
          </button>
        )}
        <div className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-faint">
          <span className="min-w-0 flex-1 truncate">
            {item.savedBy ? `${item.savedBy.name} · ` : ""}
            <TimeAgo iso={item.savedAt} />
            {folderName && <> · {folderName}</>}
          </span>
          <button ref={anchor} type="button" onClick={() => setMenu((m) => !m)} aria-label="More" aria-haspopup="menu" aria-expanded={menu} className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
            <MoreIcon className="w-4 h-4" />
          </button>
          <AnchoredMenu open={menu} onClose={() => setMenu(false)} anchor={anchor} width={240} label="Saved item">
            <div className="p-1.5">
              {folders.length > 0 && <p className="px-3 pt-1 pb-1 text-[11.5px] font-semibold text-ink-faint">Move to</p>}
              {folders.map((f) => (
                <button
                  key={f.id ?? "none"}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onMove(f.id);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-left text-[13px] hover:bg-surface-2"
                >
                  {f.id ? <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: folderColor(f.color) }} aria-hidden /> : <span className="w-2.5" />}
                  <span className="flex-1 truncate">{f.name}</span>
                  {item.folderId === f.id && <CheckIcon className="w-3.5 h-3.5 text-amber" />}
                </button>
              ))}
              {item.folderId && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onMove(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-left text-[13px] hover:bg-surface-2"
                >
                  <span className="w-2.5" />
                  <span className="flex-1 truncate">Take out of {folderName ?? "its folder"}</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onRemove();
                }}
                className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-left text-[13px] text-red hover:bg-red/10 mt-1"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                Remove from Saved
              </button>
            </div>
          </AnchoredMenu>
        </div>
      </div>
    </li>
  );
}

function SavedIdeaBody({ item }: { item: SavedItem }) {
  const ctx = useOutliers();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const idea = item.idea!;
  const f = idea.formatId ? FORMAT_BY_ID.get(idea.formatId) : undefined;
  const start = async (as: "long" | "short") => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await startFromIdea(ctx.teamId, idea, as, item.id);
      if (r.error !== undefined) {
        toast.error(r.error);
        setBusy(false);
        return;
      }
      startNavProgress(r.href);
      router.push(r.href);
    } catch {
      toast.error("Couldn't start it. Try again.");
      setBusy(false);
    }
  };
  return (
    <div className="p-1 flex flex-col">
      <div className="flex items-center gap-2 text-[12px] text-ink-soft min-w-0">
        <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: formatColor(idea.formatId) }} aria-hidden />
        <span className="truncate font-semibold">{f?.name ?? "Idea"}</span>
        <span className="rounded-md bg-surface-2 px-1.5 h-5 inline-flex items-center text-[11px] font-semibold text-ink-faint">{idea.type}</span>
        {idea.niche && <span className="truncate text-ink-faint">· {idea.niche}</span>}
      </div>
      <h3 className="mt-2 font-display text-[17px] leading-snug font-semibold">{idea.titles[0]}</h3>
      {idea.titles.length > 1 && (
        <ul className="mt-1.5 space-y-0.5">
          {idea.titles.slice(1).map((t) => (
            <li key={t} className="text-[12.5px] text-ink-soft leading-snug">
              {t}
            </li>
          ))}
        </ul>
      )}
      {idea.hook && <p className="mt-2 text-[12.5px] text-ink-soft border-l-2 border-amber/50 pl-2.5 leading-relaxed">{idea.hook}</p>}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {item.projectId ? (
          <Link href={`/videos/${item.projectId}`} className={`${BTN} h-8 text-[12.5px]`}>
            <VideoIcon className="w-3.5 h-3.5 text-long" />
            Started: open the video
          </Link>
        ) : item.shortId ? (
          <Link href={`/shorts/${item.shortId}`} className={`${BTN} h-8 text-[12.5px]`}>
            <ShortsIcon className="w-3.5 h-3.5 text-short" />
            Started: open the Short
          </Link>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => start(idea.kind === "short" ? "short" : "long")} className={`${BTN_MAIN} h-8 text-[12.5px]`}>
              {idea.kind === "short" ? <ShortsIcon className="w-3.5 h-3.5" /> : <VideoIcon className="w-3.5 h-3.5" />}
              {busy ? "Opening…" : idea.kind === "short" ? "Start a Short" : "Start a video"}
            </button>
            <button type="button" disabled={busy} onClick={() => start(idea.kind === "short" ? "long" : "short")} className={`${BTN} h-8 text-[12.5px]`}>
              {idea.kind === "short" ? "As a long video" : "As a Short"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
