"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { useConfirm } from "@/components/ui/confirm-provider";
import { CheckIcon, EditIcon, LinkIcon, MoreIcon, PlusIcon, ShortsIcon, TrashIcon, VideoIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { startNavProgress } from "@/components/ui/nav-progress";
import { createFolder, deleteFolder, moveSave, noteSave, removeSave, renameFolder, saveVideoLink, startFromIdea } from "@/app/(dashboard)/outliers/actions";
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
 * started from one says so. 1.55.9: a video found on YouTube itself is added
 * from its link (Add a video), into the folder that's open.
 */

type What = "all" | "video" | "idea" | "channel";

export function SavedTab({ data }: { data: SavedData }) {
  const ctx = useOutliers();
  const saves = useOutliersSaves();
  const nav = useShellNav();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [items, setItems] = useState(data.items);
  const [what, setWhat] = useState<What>("all");
  const [naming, setNaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  // The card just added from a link: lit up for a moment.
  const [fresh, setFresh] = useState<string | null>(null);
  // The form closed (done or not): the keyboard goes back to Add a video.
  const addBtn = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const closeAdd = () => {
    refocus.current = true;
    setAdding(false);
  };
  useEffect(() => {
    if (adding || !refocus.current) return;
    refocus.current = false;
    addBtn.current?.focus();
  }, [adding]);
  useEffect(() => setItems(data.items), [data.items]);
  useEffect(() => {
    if (!fresh) return;
    const t = window.setTimeout(() => setFresh(null), 2400);
    return () => window.clearTimeout(t);
  }, [fresh]);

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

  // The folder open now: an add can finish after another one was opened.
  const viewing = useRef(folder);
  useEffect(() => {
    viewing.current = folder;
  }, [folder]);
  // A video added from its link: on the page at once, like a bookmark (counted in its folder, the bookmark filled).
  const added = (item: SavedItem | null) => {
    closeAdd();
    toast.success(current ? `Saved in “${current.name}”` : "Video saved");
    if (!item) return router.refresh();
    const view = viewing.current;
    if (!view || (view === "unsorted" ? !item.folderId : view === item.folderId)) setItems((xs) => [item, ...xs.filter((x) => x.id !== item.id)]);
    if (item.video) saves.addSave({ ref: item.video.id, folderId: item.folderId, id: item.id });
    if (item.folderId) saves.setFolders((fs) => fs.map((f) => (f.id === item.folderId ? { ...f, count: f.count + 1 } : f)));
    if (what === "idea" || what === "channel") setWhat("all");
    setFresh(item.id);
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
        {/* Phones: a row to swipe through. Wider: the folders wrap (a column from lg), nothing slides sideways (1.30.1). */}
        <div className="relative flex lg:flex-col gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 lg:sticky lg:top-[calc(var(--shell-top,3.5rem)+var(--ol-bar,104px)+0.75rem)]">
          {folderBtn(null, "Everything", null)}
          {saves.folders.map((f) => folderBtn(f.id, f.name, f.count, f.color))}
          {naming === "new" ? (
            <form
              className="flex-shrink-0 flex items-center gap-1 lg:mt-1 lg:w-full"
              onSubmit={(e) => {
                e.preventDefault();
                make();
              }}
            >
              <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus maxLength={40} placeholder="Folder name" onBlur={() => !newName.trim() && setNaming(null)} className="w-40 lg:w-auto lg:flex-1 min-w-0 rounded-lg border border-line/15 bg-surface px-2.5 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber" />
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
          {/* Room for the folder's name: on a phone the buttons go under it rather than squeeze it. */}
          <div className="min-w-0 flex-1 basis-56">
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
          <div className="flex items-center gap-1.5">
            {!adding && (
              <button ref={addBtn} type="button" onClick={() => setAdding(true)} className={BTN}>
                <PlusIcon className="w-3.5 h-3.5" />
                Add a video
              </button>
            )}
            {current && naming !== current.id && (
              <>
                <button type="button" onClick={() => setNaming(current.id)} className={BTN}>
                  <EditIcon className="w-3.5 h-3.5" />
                  Rename
                </button>
                <button type="button" onClick={() => remove(current)} className={`${BTN} hover:!text-red`} aria-label="Delete folder">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
        {adding && <AddVideo folder={current} onAdded={added} onClose={closeAdd} />}
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
              <SavedCard key={item.id} item={item} fresh={item.id === fresh} folders={saves.folders} onRemove={() => drop(item)} onMove={(to) => move(item, to)} />
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
            {!items.length && "Tap the bookmark on any video, idea or channel to keep it here for the team. Found a video on YouTube yourself? Add a video, and paste its link."}
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

/**
 * Add a video (1.55.9): a link to one found on YouTube, saved in the folder
 * that's open (or none), read with its numbers and score when Outliers
 * doesn't have it. What went wrong shows under the link, which stays to fix.
 */
function AddVideo({ folder, onAdded, onClose }: { folder: Folder | null; onAdded: (item: SavedItem | null) => void; onClose: () => void }) {
  const ctx = useOutliers();
  const input = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reading a video (and its channel) YouTube hasn't been asked about takes a few seconds: said after a moment.
  useEffect(() => {
    if (!busy) return setSlow(false);
    const t = window.setTimeout(() => setSlow(true), 900);
    return () => window.clearTimeout(t);
  }, [busy]);
  const submit = async () => {
    const l = link.trim();
    if (!l || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await saveVideoLink(ctx.teamId, l, folder?.id ?? null);
      if (r.error === undefined) return onAdded(r.item);
      setError(r.error);
    } catch {
      setError("Couldn't save it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
    input.current?.select();
  };
  return (
    <form
      aria-label="Add a video from its link"
      aria-busy={busy}
      className="mb-5 rounded-2xl border border-line/10 bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* Phones: the link on a line of its own, the buttons under it. */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-0">
          <LinkIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" aria-hidden />
          <input
            ref={input}
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Escape" && !busy && onClose()}
            readOnly={busy}
            autoFocus
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={500}
            placeholder="Paste a YouTube link: a video or a Short"
            aria-label="YouTube link"
            aria-invalid={error ? true : undefined}
            aria-describedby="ol-add-video-note"
            className="w-full rounded-lg border border-line/15 bg-surface pl-9 pr-3 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button type="submit" disabled={busy || !link.trim()} className={BTN_MAIN}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={BTN}>
            Cancel
          </button>
        </div>
      </div>
      <p id="ol-add-video-note" aria-live="polite" className={`mt-2 px-0.5 text-[12px] leading-snug ${error ? "text-red" : "text-ink-faint"}`}>
        {error ?? (slow ? "Reading it from YouTube, with its channel's videos for the score…" : folder ? `It goes in “${folder.name}”, with its views and outlier score.` : "It's saved without a folder, with its views and outlier score.")}
      </p>
    </form>
  );
}

function SavedCard({ item, fresh = false, folders, onRemove, onMove }: { item: SavedItem; fresh?: boolean; folders: Folder[]; onRemove: () => void; onMove: (to: string | null) => void }) {
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
    <li className={`rounded-2xl border border-line/10 bg-surface p-3 flex flex-col min-w-0 transition-shadow duration-700 ${fresh ? "ring-2 ring-amber/60" : ""}`}>
      {item.kind === "video" && item.video ? (
        item.video.kind === "short" ? (
          <ShortCard v={item.video} staged />
        ) : (
          <VideoCard v={item.video} />
        )
      ) : item.kind === "channel" && item.channel ? (
        <button type="button" onClick={() => ctx.openChannel(item.channel!.id, item.channel!)} className="flex items-center gap-3 text-left rounded-xl p-1 hover:bg-surface-2/60">
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
          <Link href={`/videos/${item.projectId}`} className={`${BTN} !h-8 text-[12.5px]`}>
            <VideoIcon className="w-3.5 h-3.5 text-long" />
            Started: open the video
          </Link>
        ) : item.shortId ? (
          <Link href={`/shorts/${item.shortId}`} className={`${BTN} !h-8 text-[12.5px]`}>
            <ShortsIcon className="w-3.5 h-3.5 text-short" />
            Started: open the Short
          </Link>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => start(idea.kind === "short" ? "short" : "long")} className={`${BTN_MAIN} !h-8 text-[12.5px]`}>
              {idea.kind === "short" ? <ShortsIcon className="w-3.5 h-3.5" /> : <VideoIcon className="w-3.5 h-3.5" />}
              {busy ? "Opening…" : idea.kind === "short" ? "Start a Short" : "Start a video"}
            </button>
            <button type="button" disabled={busy} onClick={() => start(idea.kind === "short" ? "long" : "short")} className={`${BTN} !h-8 text-[12.5px]`}>
              {idea.kind === "short" ? "As a long video" : "As a Short"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
