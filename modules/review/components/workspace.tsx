"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import { relativeTime } from "@/lib/relative-time";
import { CheckIcon, CloseIcon } from "@/components/ui/icons";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { addNote, deleteNote, editNote, setNoteResolved } from "@/app/(dashboard)/shorts/[id]/review/actions";
import { playbackUrl, prefetchPlayback } from "../lib/playback";
import { formatBytes, formatTime } from "../lib/limits";
import type { Person, ReviewNote, VideoVersion } from "../lib/queries";
import { ReviewPlayer, type PlayerHandle } from "./player";
import { VersionUploader } from "./uploader";
import { CompareView } from "./compare";
import { sounds } from "@/lib/sounds";

type Filter = "open" | "all";
type Pending = { tempId: string; versionId: string; parentId: string | null; body: string; time: number | null };
type Note = ReviewNote & { pending?: boolean };
type Thread = { note: Note; replies: Note[] };

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

function Spinner({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <span className={`${className} inline-block rounded-full border-2 border-current border-t-transparent animate-spin`} aria-hidden />;
}
function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-3.9A8 8 0 1 1 20 12Z" />
    </svg>
  );
}
function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

export function ReviewWorkspace({
  shortId,
  teamId,
  versions,
  notes,
  me,
  canUpload,
  isMaster,
}: {
  shortId: string;
  teamId: string;
  versions: VideoVersion[];
  notes: ReviewNote[];
  me: Person;
  canUpload: boolean;
  isMaster: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const player = useRef<PlayerHandle>(null);
  const deskComposer = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [refreshing, startRefresh] = useTransition();

  // v1 → v2 → v3, left to right.
  const ordered = useMemo(() => [...versions].sort((a, b) => a.number - b.number), [versions]);
  const live = ordered.filter((v) => !v.deleted);
  const latest = live[live.length - 1] ?? null;

  const [versionId, setVersionId] = useState<string | null>(latest?.id ?? null);
  const version = versions.find((v) => v.id === versionId) ?? null;
  const [src, setSrc] = useState<string | null>(null);
  const [srcError, setSrcError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [filter, setFilter] = useState<Filter>("open");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [seekingId, setSeekingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [comparing, setComparing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (!versionId && latest) setVersionId(latest.id);
  }, [latest, versionId]);

  // Just uploaded a version that isn't in the page data yet: keep
  // refreshing (up to 5 times) until it arrives, never leave a stale page.
  const waitingFor = versionId && !versions.some((v) => v.id === versionId) ? versionId : null;
  const waitTries = useRef(0);
  useEffect(() => {
    if (!waitingFor) {
      waitTries.current = 0;
      return;
    }
    if (waitTries.current >= 5) return;
    const t = setTimeout(() => {
      waitTries.current += 1;
      router.refresh();
    }, 1200);
    return () => clearTimeout(t);
  }, [waitingFor, versions, router]);

  // Notes shown while saving disappear once the fresh list has arrived.
  useEffect(() => {
    if (!refreshing) setPending([]);
  }, [refreshing]);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setSrcError(null);
    if (!versionId) return;
    void playbackUrl(versionId).then((res) => {
      if (cancelled) return;
      if (res.url) setSrc(res.url);
      else setSrcError(res.error ?? "Couldn't open the video.");
    });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  // Links for every version, up front: switching versions is instant.
  const liveIds = live.map((v) => v.id).join(",");
  useEffect(() => {
    if (liveIds) prefetchPlayback(liveIds.split(","));
  }, [liveIds]);

  // Live updates from everyone else.
  useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const later = () => {
      if (t) clearTimeout(t);
      t = setTimeout(refresh, 250);
    };
    const ch = supabase
      .channel(`review-${shortId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "short_video_comments", filter: `short_id=eq.${shortId}` }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "short_video_versions", filter: `short_id=eq.${shortId}` }, later)
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      void supabase.removeChannel(ch);
    };
  }, [shortId, refresh]);

  const openComposer = useCallback(() => {
    player.current?.pause();
    if (isDesktop()) deskComposer.current?.focus();
    else setComposerOpen(true);
  }, []);

  // C = note at this moment. N = the notes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "c") {
        e.preventDefault();
        openComposer();
      } else if (k === "n") {
        e.preventDefault();
        if (isDesktop()) listRef.current?.focus();
        else setSheet((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openComposer]);

  const all: Note[] = useMemo(() => {
    const saved = notes.filter((n) => n.versionId === versionId);
    const temp: Note[] = pending
      .filter((p) => p.versionId === versionId)
      .map((p) => ({
        id: p.tempId,
        versionId: p.versionId,
        parentId: p.parentId,
        body: p.body,
        time: p.time,
        createdAt: new Date().toISOString(),
        editedAt: null,
        resolvedAt: null,
        resolvedBy: null,
        author: me,
        pending: true,
      }));
    return [...saved, ...temp];
  }, [notes, pending, versionId, me]);

  const threads: Thread[] = useMemo(
    () =>
      all
        .filter((n) => !n.parentId)
        .sort((a, b) => (a.time ?? -1) - (b.time ?? -1) || a.createdAt.localeCompare(b.createdAt))
        .map((t) => ({ note: t, replies: all.filter((r) => r.parentId === t.id) })),
    [all]
  );
  const openCount = threads.filter((t) => !t.note.resolvedAt).length;
  const shown = filter === "open" ? threads.filter((t) => !t.note.resolvedAt) : threads;
  const markers = threads
    .filter((t) => t.note.time !== null && !t.note.pending)
    .map((t) => ({
      id: t.note.id,
      time: t.note.time as number,
      resolved: !!t.note.resolvedAt,
      label: t.note.body.slice(0, 60),
      author: t.note.author,
    }));

  // "You are here": the latest note at or before the playhead.
  const activeId = useMemo(() => {
    let best: { id: string; time: number } | null = null;
    for (const t of threads) {
      const tm = t.note.time;
      if (tm !== null && tm <= now + 0.05 && (!best || tm >= best.time)) best = { id: t.note.id, time: tm };
    }
    return best?.id ?? null;
  }, [threads, now]);

  const people = useMemo(() => {
    const m = new Map<string, Person>();
    notes.forEach((n) => n.author && m.set(n.author.id, n.author));
    m.set(me.id, me);
    return m;
  }, [notes, me]);

  const post = useCallback(
    async (body: string, time: number | null, parentId: string | null = null) => {
      if (!versionId || !body.trim()) return false;
      const tempId = `temp-${crypto.randomUUID()}`;
      setPending((p) => [...p, { tempId, versionId, parentId, body: body.trim(), time }]);
      const res = await addNote({ versionId, body, time, parentId });
      if (res.error !== undefined) {
        setPending((p) => p.filter((x) => x.tempId !== tempId));
        toast.error(res.error);
        return false;
      }
      refresh();
      return true;
    },
    [versionId, toast, refresh]
  );

  async function resolve(id: string, value: boolean) {
    if (value) {
      const ok = await confirm({
        title: "Resolve this note?",
        description: "It moves to All. You can reopen it any time.",
        confirmLabel: "Resolve",
      });
      if (!ok) return;
    }
    setBusyId(id);
    const res = await setNoteResolved(id, value);
    setBusyId(null);
    if (res.error !== undefined) toast.error(res.error);
    else refresh();
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Delete this note?", confirmLabel: "Delete", danger: true }))) return;
    setBusyId(id);
    const res = await deleteNote(id);
    setBusyId(null);
    if (res.error !== undefined) toast.error(res.error);
    else refresh();
  }

  async function edit(id: string, body: string) {
    setBusyId(id);
    const res = await editNote(id, body);
    setBusyId(null);
    if (res.error !== undefined) toast.error(res.error);
    else refresh();
  }

  function jump(id: string, t: number) {
    setSeekingId(id);
    player.current?.seek(t);
  }

  const nextNumber = (ordered[ordered.length - 1]?.number ?? 0) + 1;

  const list = (
    <NotesList
      listRef={listRef}
      threads={shown}
      totalThreads={threads.length}
      activeId={activeId}
      highlight={highlight}
      seekingId={seekingId}
      busyId={busyId}
      me={me}
      isMaster={isMaster}
      people={people}
      onJump={jump}
      onReply={(parentId, body) => post(body, null, parentId)}
      onResolve={resolve}
      onEdit={edit}
      onDelete={remove}
    />
  );

  const filterToggle = (
    <div className="flex items-center rounded-lg border border-line/15 p-0.5" role="radiogroup" aria-label="Show">
      {([
        ["open", `Open ${openCount}`],
        ["all", `All ${threads.length}`],
      ] as const).map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={filter === k}
          onClick={() => setFilter(k)}
          className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${filter === k ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={comparing ? "" : "grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]"}>
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {ordered.length > 0 && (
            <VersionPicker
              versions={ordered}
              value={versionId}
              latestId={latest?.id ?? null}
              onChange={(id) => {
                setVersionId(id);
                setComparing(false);
              }}
            />
          )}
          {live.length >= 2 && (
            <button
              type="button"
              onClick={() => setComparing((c) => !c)}
              aria-pressed={comparing}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[13px] font-semibold border transition-colors ${
                comparing ? "border-amber bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <rect x="3" y="4" width="8" height="16" rx="1.5" />
                <rect x="13" y="4" width="8" height="16" rx="1.5" />
              </svg>
              {comparing ? "Exit compare" : "Compare"}
            </button>
          )}
          <span className="flex-1" />
          {canUpload && !comparing && (
            <VersionUploader teamId={teamId} shortId={shortId} nextNumber={nextNumber} onUploaded={(id) => setVersionId(id)} prominent={versions.length === 0} />
          )}
        </div>

        {comparing ? (
          <CompareView versions={versions} onClose={() => setComparing(false)} />
        ) : version ? (
          <>
            <ReviewPlayer
              ref={player}
              src={src}
              error={srcError}
              markers={markers}
              onTime={setNow}
              onSeeked={() => setSeekingId(null)}
              onMarker={(id) => {
                setHighlight(id);
                setFilter("all");
                setSeekingId(id);
                document.getElementById(`note-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }}
            />
            <p className="text-[12px] text-ink-soft">
              v{version.number} · {formatBytes(version.size)}
              {version.width && version.height ? ` · ${version.width}×${version.height}` : ""}
              {version.uploadedBy ? ` · uploaded by ${version.uploadedBy.name}` : ""}, {relativeTime(version.createdAt)}
              <span className="hidden md:inline"> · Space play · J/L 5s · , . frame · C note · N notes</span>
            </p>
          </>
        ) : versionId || versions.length > 0 || refreshing ? (
          // A video is on its way (just uploaded, or still loading): skeleton, never "No video yet".
          <div role="status" aria-label="Loading the video" className="rounded-2xl overflow-hidden bg-black ring-1 ring-white/5">
            <div className="h-[50vh] lg:h-[min(72vh,780px)] flex items-center justify-center">
              <div className="h-[86%] aspect-[9/16] rounded-xl bg-white/[0.06] animate-pulse" />
            </div>
            <div className="h-[84px] bg-[#0f0e0c]" />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line/25 bg-surface/50 px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">No video yet</p>
            <p className="mt-1 text-[13px] text-ink-soft">
              {canUpload ? "Upload the first version to start the review." : "The editor will upload the video here."}
            </p>
          </div>
        )}
      </div>

      {/* Desktop: notes beside the video */}
      {!comparing && (
        <aside className="hidden lg:flex min-w-0 rounded-2xl border border-line/10 bg-surface flex-col max-h-[calc(72vh+140px)]">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-ink-soft">
              <ChatIcon className="w-4 h-4" />
              Notes {version ? `on v${version.number}` : ""}
            </h2>
            {filterToggle}
          </div>
          {version && (
            <div className="px-4 pb-3 border-b border-line/10">
              <Composer inputRef={deskComposer} now={now} me={me} onPost={post} onFocus={() => player.current?.pause()} />
            </div>
          )}
          {list}
        </aside>
      )}

      {/* Phones and tablets: Notes + "+" in the bottom-left corner */}
      {!comparing && version && (
        <div className="lg:hidden fixed left-4 z-40 flex items-center gap-2" style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="inline-flex items-center gap-2 rounded-full bg-ink text-paper pl-3.5 pr-4 h-11 text-[13.5px] font-bold shadow-lg active:scale-95 transition-transform"
            aria-label={`Notes, ${openCount} open`}
          >
            <ChatIcon className="w-[18px] h-[18px]" />
            Notes
            {openCount > 0 && <span className="rounded-full bg-amber text-white text-[11px] px-1.5 min-w-[20px] text-center">{openCount}</span>}
          </button>
          <button
            type="button"
            onClick={openComposer}
            className="w-11 h-11 rounded-full bg-amber text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Add a note at this moment"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      )}

      {sheet && (
        <BottomSheet title={`Notes${version ? ` on v${version.number}` : ""}`} onClose={() => setSheet(false)} extra={filterToggle}>
          {list}
        </BottomSheet>
      )}

      {composerOpen && (
        <TopComposer
          now={now}
          me={me}
          onClose={() => setComposerOpen(false)}
          onPost={async (body, time) => {
            const ok = await post(body, time);
            if (ok) setComposerOpen(false);
            return ok;
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function VersionPicker({
  versions,
  value,
  latestId,
  onChange,
}: {
  versions: VideoVersion[];
  value: string | null;
  latestId: string | null;
  onChange: (id: string) => void;
}) {
  const options = versions.map((v) => ({
    value: v.id,
    label: `v${v.number}${v.id === latestId ? " · latest" : ""}`,
    hint: v.deleted ? "Cleaned up after posting" : `${formatBytes(v.size)} · ${relativeTime(v.createdAt)}`,
    disabled: v.deleted,
  }));
  const dropdown = (
    <div className="w-44">
      <Select value={value} onChange={(v) => v && onChange(v)} options={options} ariaLabel="Version" />
    </div>
  );
  // More than 3 versions, or a phone: a dropdown. Otherwise tabs, v1 first.
  if (versions.length > 3) return dropdown;
  return (
    <>
      <div className="sm:hidden">{dropdown}</div>
      <div className="hidden sm:flex items-center gap-1 rounded-xl border border-line/10 bg-surface p-1" role="tablist" aria-label="Versions">
        {versions.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={v.id === value}
            disabled={v.deleted}
            onClick={() => onChange(v.id)}
            title={v.deleted ? "Cleaned up after posting" : `${v.fileName} · ${formatBytes(v.size)}`}
            className={`px-3 h-8 rounded-lg text-[13px] font-bold whitespace-nowrap transition-all disabled:opacity-40 ${
              v.id === value ? "bg-ink text-paper shadow-sm" : "text-ink-soft hover:text-ink hover:bg-surface-2"
            }`}
          >
            v{v.number}
            {v.id === latestId && <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-wide opacity-70">latest</span>}
          </button>
        ))}
      </div>
    </>
  );
}

function Composer({
  inputRef,
  now,
  me,
  onPost,
  onFocus,
  autoFocus,
}: {
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  now: number;
  me: Person;
  onPost: (body: string, time: number | null) => Promise<boolean>;
  onFocus?: () => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [atTime, setAtTime] = useState(true);
  const [busy, setBusy] = useState(false);
  // The moment freezes once you start typing, so it doesn't drift.
  const [moment, setMoment] = useState(now);
  useEffect(() => {
    if (!draft) setMoment(now);
  }, [now, draft]);

  async function submit() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const ok = await onPost(draft, atTime ? moment : null);
    setBusy(false);
    if (ok) {
      setDraft("");
      sounds.send();
    }
  }

  return (
    <div>
      <div className="flex gap-2.5">
        <PersonAvatar name={me.name} avatarUrl={me.avatarUrl} color={me.color} className="w-8 h-8 text-[11px] mt-0.5" />
        <textarea
          ref={inputRef}
          value={draft}
          autoFocus={autoFocus}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={onFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
          }}
          rows={2}
          maxLength={4000}
          placeholder={atTime ? `Note at ${formatTime(moment, true)}…` : "Note about the whole video…"}
          className="flex-1 min-w-0 rounded-xl border border-line/15 bg-surface px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-amber resize-y"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 pl-[42px]">
        <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-soft cursor-pointer">
          <input type="checkbox" checked={atTime} onChange={(e) => setAtTime(e.target.checked)} className="accent-[rgb(var(--amber))]" />
          At <span className="font-bold tabular-nums text-ink">{formatTime(moment, true)}</span>
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !draft.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-3.5 h-8 text-[12.5px] disabled:opacity-45 active:scale-95 transition-transform"
        >
          {busy ? <Spinner /> : <SendIcon className="w-3.5 h-3.5" />}
          Post
        </button>
      </div>
    </div>
  );
}

function TopComposer({
  now,
  me,
  onClose,
  onPost,
}: {
  now: number;
  me: Person;
  onClose: () => void;
  onPost: (body: string, time: number | null) => Promise<boolean>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[115]">
      <div className="absolute inset-0 bg-black/35 animate-[fadein_.15s_ease]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Add a note"
        className="absolute inset-x-3 rounded-2xl border border-line/15 bg-surface shadow-2xl p-4 animate-[sheetdown_.28s_var(--ease-out)]"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-bold uppercase tracking-wide text-ink-soft">New note</span>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
        <Composer now={now} me={me} onPost={onPost} autoFocus />
      </div>
    </div>,
    document.body
  );
}

function BottomSheet({ title, extra, onClose, children }: { title: string; extra?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/45 animate-[fadein_.15s_ease]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 max-h-[78dvh] flex flex-col rounded-t-2xl border border-line/15 bg-surface shadow-2xl animate-[sheetup_.32s_var(--ease-out)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line/25" aria-hidden />
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <h2 className="text-[13px] font-bold">{title}</h2>
          <div className="flex items-center gap-2">
            {extra}
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function NotesList({
  listRef,
  threads,
  totalThreads,
  activeId,
  highlight,
  seekingId,
  busyId,
  me,
  isMaster,
  people,
  onJump,
  onReply,
  onResolve,
  onEdit,
  onDelete,
}: {
  listRef: React.RefObject<HTMLOListElement | null>;
  threads: Thread[];
  totalThreads: number;
  activeId: string | null;
  highlight: string | null;
  seekingId: string | null;
  busyId: string | null;
  me: Person;
  isMaster: boolean;
  people: Map<string, Person>;
  onJump: (id: string, t: number) => void;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  onResolve: (id: string, v: boolean) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <ol ref={listRef} tabIndex={-1} className="motion-stagger flex-1 overflow-y-auto overscroll-contain styled-scroll p-2 space-y-1.5 outline-none">
      {threads.length === 0 && (
        <li className="px-3 py-8 text-center text-[13px] text-ink-soft">
          {totalThreads === 0 ? "No notes yet. Press C to add one." : "All notes are resolved."}
        </li>
      )}
      {threads.map((t) => (
        <NoteThread
          key={t.note.id}
          thread={t}
          active={activeId === t.note.id}
          highlighted={highlight === t.note.id}
          seeking={seekingId === t.note.id}
          busyId={busyId}
          me={me}
          isMaster={isMaster}
          resolver={t.note.resolvedBy ? people.get(t.note.resolvedBy) ?? null : null}
          onJump={onJump}
          onReply={onReply}
          onResolve={onResolve}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ol>
  );
}

function NoteThread({
  thread,
  active,
  highlighted,
  seeking,
  busyId,
  me,
  isMaster,
  resolver,
  onJump,
  onReply,
  onResolve,
  onEdit,
  onDelete,
}: {
  thread: Thread;
  active: boolean;
  highlighted: boolean;
  seeking: boolean;
  busyId: string | null;
  me: Person;
  isMaster: boolean;
  resolver: Person | null;
  onJump: (id: string, t: number) => void;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  onResolve: (id: string, v: boolean) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { note, replies } = thread;
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function sendReply() {
    if (!reply.trim() || sending) return;
    setSending(true);
    const ok = await onReply(note.id, reply);
    setSending(false);
    if (ok) {
      sounds.send();
      setReply("");
      setReplying(false);
    }
  }

  const entry = (n: Note, small = false) => (
    <div className="flex gap-2.5 min-w-0">
      {n.author && (
        <PersonAvatar
          name={n.author.name}
          avatarUrl={n.author.avatarUrl}
          color={n.author.color}
          className={small ? "w-6 h-6 text-[9px] mt-0.5" : "w-8 h-8 text-[11px] mt-0.5"}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-semibold text-ink-soft truncate">{n.author?.name ?? "Someone"}</span>
          <span className="text-ink-faint whitespace-nowrap">
            {n.pending ? "posting…" : relativeTime(n.createdAt)}
            {n.editedAt ? " · edited" : ""}
          </span>
          {n.pending && <Spinner className="w-3 h-3 text-ink-soft" />}
          <span className="flex-1" />
          {!n.pending && (n.author?.id === me.id || isMaster) && editing !== n.id && (
            <span className="flex items-center gap-2 text-[11.5px] text-ink-soft sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              {n.author?.id === me.id && (
                <button
                  type="button"
                  className="hover:text-ink"
                  onClick={() => {
                    setEditing(n.id);
                    setEditText(n.body);
                  }}
                >
                  Edit
                </button>
              )}
              <button type="button" className="hover:text-red" onClick={() => void onDelete(n.id)}>
                {busyId === n.id ? <Spinner className="w-3 h-3" /> : "Delete"}
              </button>
            </span>
          )}
        </div>
        {editing === n.id ? (
          <textarea
            value={editText}
            autoFocus
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onEdit(n.id, editText).then(() => setEditing(null));
              }
              if (e.key === "Escape") setEditing(null);
            }}
            rows={2}
            className="mt-1 w-full rounded-lg border border-line/15 bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-amber"
          />
        ) : (
          <p className={`mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${n.pending ? "text-ink-soft" : "text-ink/85"}`}>{n.body}</p>
        )}
      </div>
    </div>
  );

  return (
    <li
      id={`note-${note.id}`}
      className={`group rounded-xl px-3 py-3 transition-[background,opacity] duration-300 ${note.pending ? "animate-[modalin_.25s_var(--ease-out)]" : ""} ${
        note.resolvedAt ? "opacity-60" : ""
      } ${!active && !highlighted ? "hover:bg-surface-2/60" : ""}`}
      style={
        active || highlighted
          ? {
              // "You are here" (or just clicked): a soft tint, no border.
              background: active
                ? "linear-gradient(90deg, rgb(var(--amber) / 0.15), rgb(var(--amber) / 0.03) 75%)"
                : "rgb(var(--amber) / 0.07)",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2 mb-2">
        {note.time !== null ? (
          <button
            type="button"
            disabled={note.pending}
            onClick={() => onJump(note.id, note.time as number)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[14px] font-bold tabular-nums transition-all active:scale-95 ${
              active ? "bg-amber text-white shadow-sm" : "bg-amber/15 text-amber hover:bg-amber/25"
            }`}
            title="Jump to this moment"
          >
            {seeking ? <Spinner className="w-3.5 h-3.5" /> : <PlayGlyph className="w-3.5 h-3.5" />}
            {formatTime(note.time, true)}
          </button>
        ) : (
          <span className="rounded-lg bg-surface-2 text-ink-soft px-2.5 h-8 inline-flex items-center text-[12px] font-bold">Whole video</span>
        )}
        {note.resolvedAt && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-green">
            <CheckIcon className="w-3.5 h-3.5" />
            Resolved
            {resolver && <PersonAvatar name={resolver.name} avatarUrl={resolver.avatarUrl} color={resolver.color} className="w-4 h-4 text-[7px]" />}
          </span>
        )}
      </div>

      {entry(note)}
      {replies.length > 0 && (
        <div className="mt-2.5 ml-[42px] space-y-2.5 border-l border-line/15 pl-3">
          {replies.map((r) => (
            <div key={r.id} className={r.pending ? "animate-[modalin_.25s_var(--ease-out)]" : ""}>
              {entry(r, true)}
            </div>
          ))}
        </div>
      )}

      {!note.pending && (
        <div className="mt-2 ml-[42px] flex items-center gap-3 text-[12px]">
          <button type="button" className="font-semibold text-ink-soft hover:text-ink" onClick={() => setReplying((v) => !v)}>
            Reply
          </button>
          <button
            type="button"
            onClick={() => void onResolve(note.id, !note.resolvedAt)}
            disabled={busyId === note.id}
            className={`inline-flex items-center gap-1 font-semibold ${note.resolvedAt ? "text-ink-soft hover:text-ink" : "text-ink-soft hover:text-green"}`}
          >
            {busyId === note.id ? <Spinner className="w-3.5 h-3.5" /> : <CheckIcon className="w-3.5 h-3.5" />}
            {note.resolvedAt ? "Reopen" : "Resolve"}
          </button>
        </div>
      )}

      {replying && (
        <div className="mt-2 ml-[42px] flex items-center gap-2 animate-[modalin_.2s_var(--ease-out)]">
          <PersonAvatar name={me.name} avatarUrl={me.avatarUrl} color={me.color} className="w-6 h-6 text-[9px]" />
          <div className="relative flex-1 min-w-0">
            <input
              autoFocus
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void sendReply();
                }
                if (e.key === "Escape") setReplying(false);
              }}
              placeholder="Reply…"
              className="w-full rounded-full border border-line/15 bg-surface pl-3.5 pr-10 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber"
            />
            <button
              type="button"
              onClick={() => void sendReply()}
              disabled={!reply.trim() || sending}
              aria-label="Send reply"
              className="absolute right-1 top-1 w-7 h-7 rounded-full bg-amber text-white flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform"
            >
              {sending ? <Spinner className="w-3 h-3" /> : <SendIcon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
