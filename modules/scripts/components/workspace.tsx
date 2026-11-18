"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { ChevronDownIcon, CloseIcon, ExpandIcon, PlusIcon } from "@/components/ui/icons";
import { ScriptEditor } from "./script-editor";
import { ScriptImage } from "./script-image";
import { PageBreak } from "../lib/page-break";
import { TextColor } from "../lib/text-color";
import { HeadingKeys } from "../lib/heading-keys";
import { ScriptKeys, ScriptOrderedList } from "../lib/script-keys";
import { imageFiles, pastePlan } from "../lib/paste-images";
import { useScriptImages } from "./use-script-images";
import { smallHeadingsToH3 } from "../lib/headings";
import { newClientId } from "../lib/collab";
import { docText, LiveSteps, openable } from "../lib/live-doc";
import { LiveCursors } from "../lib/live-cursors";
import { useLiveCursors, type StepsMessage } from "./use-live-cursors";
import { useLiveEdits, type LiveStatus } from "./use-live-edits";
import type { DocListItem, ScriptComment, ScriptRow } from "../lib/queries";
import { findQuote, type PostingComment } from "../lib/anchors";
import { dock, useDock } from "../lib/dock";
import { addComment, copyCommentsFrom, createDoc, deleteDoc, getDocContent, listScriptComments, renameDoc, resolveComments, saveScript } from "@/app/(dashboard)/scripts/actions";
import { Dialog } from "@/components/ui/dialog";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Lightbox } from "@/components/ui/lightbox";
import { CommentComposer, KindMark } from "./comment-composer";
import { CommentCard, PostingCard } from "./comment-card";
import { frameRefOf, viewFrame } from "./script-editor";
import { KIND_COLOR, frameRefName, type CommentKind, type FrameRef } from "../lib/kinds";
import { frameUses } from "../lib/frame-links";
import { frameById, loadLibrary } from "@/modules/frames/components/frame-store";
import type { FrameGuide } from "@/modules/frames/lib/model";
import dynamic from "next/dynamic";
import { sounds } from "@/lib/sounds";
import type { MentionPerson } from "../lib/mention-people";
import type { ScriptFlow } from "../lib/flow";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";
import { FlowStrip, type FlowPermissions } from "./script-flow";
import { PendingLink, PendingNav, usePendingNav } from "@/components/ui/pending-nav";
import { Leaves } from "@/components/ui/leaves";
import { createClient } from "@/lib/supabase/client";
import { colorForId } from "@/lib/avatar";
import { MAX_QUOTE, toLeaf } from "../lib/comment-limits";
import { COMMENTS_EVENT, commentsChanged } from "../lib/comment-events";

type Owner = { short: string } | { long: string };

/**
 * The script workspace: documents on the left (versions + research), the
 * editor in the middle, and a right panel for a side-by-side document or
 * the comments. Built around the regular ScriptEditor.
 * Opening another document answers at once: it lights up in the list and
 * the page shows shimmering lines until its text is here.
 */
export function ScriptWorkspace(props: React.ComponentProps<typeof Workspace>) {
  return (
    <PendingNav>
      <Workspace {...props} />
    </PendingNav>
  );
}

function Workspace({
  owner,
  docs,
  doc,
  canEdit,
  canComment = canEdit,
  canCreate,
  side,
  comments: pageComments,
  title,
  number,
  backHref,
  backLabel,
  topBarExtra,
  lastEdited,
  roleColors,
  people = [],
  flow,
  me = null,
}: {
  owner: Owner;
  docs: DocListItem[];
  doc: ScriptRow;
  canEdit: boolean;
  /**
   * Add comments and editing ideas, resolve them: the people working on this
   * video's script (masters, its scripters, its Review / Staging people;
   * researchers on research). Everyone else on the team reads them.
   */
  canComment?: boolean;
  canCreate: { script: boolean; research: boolean };
  side: ScriptRow | null;
  comments: ScriptComment[];
  title: string;
  number: number;
  backHref: string;
  backLabel: string;
  topBarExtra?: React.ReactNode;
  lastEdited: string | null;
  /** The team's role colours (dots, comment colours). */
  roleColors: Record<string, string>;
  /** Teammates for @mentions, with what they do on this video. */
  people?: MentionPerson[];
  /** Who's looking: may they delete a comment (theirs, or any when master), and their dictionary words. */
  me?: { userId: string; master: boolean } | null;
  /** Script → Review → Staging (migration 0062): shown as a strip under the top bar. */
  flow?: {
    data: ScriptFlow;
    team: TeamPerson[];
    can: FlowPermissions;
    scripterAction: (id: string, memberId: string, add: boolean) => Promise<{ error?: string } | object>;
    videoId: string;
  };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  // The comments (1.55.0): the page's list, then fetched on their own whenever they change (yours: right away;
  // someone else's: when their page says so), never by drawing the whole page again (that sent people back to the top
  // of the script: "de fiecare dată când adaug un comentariu ... mă duce sus de tot").
  const [fetched, setFetched] = useState<{ doc: string; list: ScriptComment[] } | null>(null);
  useEffect(() => setFetched(null), [pageComments]);
  const serverComments = fetched?.doc === doc.id ? fetched.list : pageComments;
  const docIdNow = useRef(doc.id);
  docIdNow.current = doc.id;
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadComments = useCallback(() => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(async () => {
      const id = docIdNow.current;
      const r = await listScriptComments(id).catch(() => null);
      if (r && r.error === undefined && docIdNow.current === id) setFetched({ doc: id, list: r.comments });
    }, 250);
  }, []);
  useEffect(() => () => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
  }, []);
  // 1.54.1: a comment added here is on the page as soon as it's saved (built from what was sent), until the fetched
  // list has it. One deleted meanwhile goes too.
  const [added, setAdded] = useState<ScriptComment[]>([]);
  const comments = useMemo(() => {
    if (!added.length) return serverComments;
    const known = new Set(serverComments.map((c) => c.id));
    const extra = added.filter((c) => !known.has(c.id));
    return extra.length ? [...serverComments, ...extra] : serverComments;
  }, [serverComments, added]);
  useEffect(() => {
    setAdded((xs) => (xs.some((a) => serverComments.some((c) => c.id === a.id)) ? xs.filter((a) => !serverComments.some((c) => c.id === a.id)) : xs));
  }, [serverComments]);
  // Any change here (added, edited, resolved, deleted: comment-card.tsx says so): the comments fetched again.
  useEffect(() => {
    const onChange = (e: Event) => {
      const gone = (e as CustomEvent<{ deleted?: string } | null>).detail?.deleted;
      if (gone) setAdded((xs) => xs.filter((x) => x.id !== gone));
      reloadComments();
    };
    window.addEventListener(COMMENTS_EVENT, onChange);
    return () => window.removeEventListener(COMMENTS_EVENT, onChange);
  }, [reloadComments]);
  // Another document is on its way (clicked in the list, the steps or the menu).
  const pendingDoc = usePendingNav().pending;
  const switching = pendingDoc !== null && pendingDoc !== doc.id;
  const [sideOpen, setSideOpen] = useState(!!side);
  // ?comment=<id> (from a notification): open the comments on that one.
  const linked = params.get("comment");
  const [chatOpen, setChatOpen] = useState(!!linked && comments.some((c) => c.id === linked));
  const [active, setActive] = useState<string | null>(linked && comments.some((c) => c.id === linked) ? linked : null);
  const [zoomed, setZoomed] = useState<ScriptComment | null>(null);
  useEffect(() => {
    if (linked && comments.some((c) => c.id === linked)) {
      setChatOpen(true);
      setActive(linked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);
  const open = comments.filter((c) => !c.resolved).length;
  // One panel on the right at a time: the comments close when another opens.
  const panel = useDock();
  useEffect(() => {
    if (chatOpen) dock.open("comments");
    else dock.close("comments");
  }, [chatOpen]);
  useEffect(() => {
    if (panel && panel !== "comments") setChatOpen(false);
  }, [panel]);
  useEffect(() => () => dock.close("comments"), []);
  // A comment on its way: "Posting…" on its words until it's saved, then "Posted" for a moment (1.54.1).
  const [posting, setPosting] = useState<PostingComment | null>(null);
  const postingRef = useRef(posting);
  postingRef.current = posting;
  const me1 = me ? people.find((p) => p.userId === me.userId) : undefined;
  /** The comment just saved, as the server will list it. */
  const savedHere = (id: string, a: { quote: string; occurrence: number; body: string; kind: CommentKind; sketch?: { path: string; w: number; h: number } | null; frame?: FrameRef | null }): ScriptComment => ({
    id,
    kind: a.kind,
    authorRoles: me1?.roles ?? [],
    quote: a.quote ? toLeaf(a.quote).slice(0, MAX_QUOTE) : "",
    occurrence: a.quote ? Math.max(0, Math.floor(a.occurrence) || 0) : 0,
    body: a.body.replace(/\u0000/g, "").trim() || (a.sketch ? "Sketch" : ""),
    createdAt: new Date().toISOString(),
    editedAt: null,
    resolved: false,
    author: me ? { id: me.userId, name: me1?.name ?? "You", avatarUrl: me1?.avatarUrl ?? null, color: colorForId(me.userId) } : null,
    sketch: a.sketch ? { url: createClient().storage.from("script-sketches").getPublicUrl(a.sketch.path).data.publicUrl, w: a.sketch.w, h: a.sketch.h } : null,
    frame: a.kind === "frame" ? a.frame ?? null : null,
  });
  const posted = (c: ScriptComment) => {
    setAdded((xs) => [...xs.filter((x) => x.id !== c.id), c]);
    setPosting((p) => (p ? { ...p, id: c.id } : p));
    setTimeout(() => setPosting((p) => (p?.id === c.id ? null : p)), 1600);
    // (The others hear about it; the list here is fetched again: the COMMENTS_EVENT listener above.)
    commentsChanged();
  };
  const mayDelete = (c: ScriptComment) => !!me && (me.master || c.author?.id === me.userId);
  // 1.50.0: a comment on the whole document (on no words of it), written in the comments panel.
  const onAddGeneral = canComment
    ? async (body: string, kind: CommentKind, frame?: FrameRef | null) => {
        setPosting({ quote: "", occurrence: 0, kind, body, sketchUrl: null, frame: frame ?? null });
        const r = await addComment({ scriptId: doc.id, quote: "", occurrence: 0, body, kind, general: true, frameId: frame?.id ?? null }).catch(() => ({ error: "Couldn't reach ClipTroop. Check your connection and try again." }) as const);
        if (r.error !== undefined) {
          setPosting(null);
          return r.error;
        }
        posted(savedHere(r.id, { quote: "", occurrence: 0, body, kind, frame: frame ?? null }));
        setActive(r.id);
        return null;
      }
    : undefined;

  const href = (next: { doc?: string; side?: string | null }) => {
    const q = new URLSearchParams(params.toString());
    q.delete("kind");
    if (next.doc) q.set("doc", next.doc);
    if (next.side === null) q.delete("side");
    else if (next.side) q.set("side", next.side);
    return `?${q.toString()}`;
  };

  const marks = useMemo(
    () => comments.map((c) => ({ id: c.id, quote: c.quote, occurrence: c.occurrence, resolved: c.resolved, color: commentColor(c, roleColors), kind: c.kind, author: c.author })),
    [comments, roleColors]
  );

  return (
    <>
    <ScriptEditor
      key={doc.id}
      find={params.get("find")}
      switching={switching}
      scriptId={doc.id}
      teamId={doc.teamId}
      initialContent={doc.content}
      initialVersion={doc.version}
      liveStart={doc.live ?? null}
      canEdit={canEdit}
      title={title}
      number={number}
      backHref={backHref}
      backLabel={backLabel}
      docName={doc.name}
      lastEdited={lastEdited}
      comments={marks}
      activeCommentId={active}
      onCommentClick={(id) => {
        setActive(id);
        setChatOpen(true);
      }}
      people={people}
      roleColors={roleColors}
      me={me}
      posting={posting}
      // 1.53.3: posting shows only "Posting…" on the words; the comments stay as they were (the owner: "i dont want
      // the comments to pop up automatically, just the indicator that its posting").
      onPosting={setPosting}
      onRemoteComments={reloadComments}
      onAddComment={
        canComment
          ? async (quote, occurrence, body, kind, sketch, frameId) => {
              const r = await addComment({ scriptId: doc.id, quote, occurrence, body, kind, sketch, frameId }).catch(() => ({ error: "Couldn't reach ClipTroop. Check your connection and try again." }) as const);
              if (r.error !== undefined) {
                setPosting(null);
                return r.error;
              }
              // On the page as itself at once, "Posted" on its words for a moment (and nothing else opens: 1.53.3).
              const frame = kind === "frame" ? postingRef.current?.frame ?? null : null;
              posted(savedHere(r.id, { quote, occurrence, body, kind, sketch, frame: frame && frame.id === frameId ? frame : null }));
              return null;
            }
          : undefined
      }
      copySources={docs.filter((d) => d.id !== doc.id).map((d) => ({ id: d.id, name: `${d.kind === "research" ? "Research · " : ""}${d.name}` }))}
      onCopyFrom={async (id) => {
        const r = await getDocContent(id);
        if (r.error !== undefined) {
          toast.error(r.error);
          return null;
        }
        return { content: r.content, comments: canComment ? r.comments : 0 };
      }}
      onCopyComments={async (from) => {
        const r = await copyCommentsFrom(from, doc.id);
        if (r.error !== undefined) return void toast.error(r.error);
        if (r.copied) toast.success(r.copied === 1 ? "Copied, with its comment." : `Copied, with ${r.copied} comments and editing ideas.`);
        if (r.copied) commentsChanged();
      }}
      subBar={
        flow?.data.ready && doc.kind === "script" ? (
          <FlowStrip
            flow={flow.data}
            currentDocId={doc.id}
            people={flow.team}
            number={number}
            can={flow.can}
            scripterAction={flow.scripterAction}
            videoId={flow.videoId}
            href={(id) => href({ doc: id })}
            roleColors={roleColors}
          />
        ) : undefined
      }
      topBarExtra={
        <>
          {/* Keys: the first child is created on the server (React warns otherwise). */}
          <span key="extra" className="contents">
            {topBarExtra}
          </span>
          <SideBySideMenu
            key="side"
            docs={docs.filter((d) => d.id !== doc.id)}
            active={sideOpen ? side?.id ?? null : null}
            onPick={(id) => {
              setSideOpen(true);
              router.push(href({ side: id }), { scroll: false });
            }}
            onClose={() => {
              setSideOpen(false);
              router.push(href({ side: null }), { scroll: false });
            }}
          />
        </>
      }
      leftRail={<DocRail owner={owner} docs={docs} current={doc.id} sideId={sideOpen ? side?.id ?? null : null} canCreate={canCreate} canEdit={canEdit} href={(id) => href({ doc: id })} roleColors={roleColors} />}
      sideBySide={
        sideOpen && side ? (
          <SidePage
            key={side.id}
            side={side}
            me={me?.userId ?? null}
            people={people}
            canEdit={side.kind === "research" ? canCreate.research : canCreate.script}
            swap={href({ doc: side.id, side: doc.id })}
            close={() => {
              setSideOpen(false);
              router.push(href({ side: null }), { scroll: false });
            }}
          />
        ) : undefined
      }
      mobileDocs={<MobileDocs owner={owner} docs={docs} current={doc} canCreate={canCreate} href={(id) => href({ doc: id })} roleColors={roleColors} sideId={sideOpen ? side?.id ?? null : null} />}
      renderCommentPopover={(id, close) => {
        const c = comments.find((x) => x.id === id);
        if (!c) return null;
        return (
          <Leaves>
            <CommentCard
              // One per comment: another one's words open a fresh box (not this one half-changed).
              key={c.id}
              variant="popover"
              c={c}
              people={people}
              roleColors={roleColors}
              me={me}
              canComment={canComment}
              mayDelete={mayDelete(c)}
              onSketch={() => setZoomed(c)}
              onFrame={c.frame ? () => viewFrame(c.frame!.id, c.frame) : undefined}
              onDone={close}
              onClose={close}
              onAll={() => {
                close();
                setActive(c.id);
                setChatOpen(true);
              }}
            />
          </Leaves>
        );
      }}
      rightPanel={
        <CommentsChat
          // A fresh panel per document (its own comments, its own "text changed" check).
          key={doc.id}
          open={chatOpen}
          setOpen={setChatOpen}
          comments={comments}
          active={active}
          onPick={setActive}
          docId={doc.id}
          teamId={doc.teamId}
          docName={doc.name}
          number={number}
          docContent={doc.content}
          roleColors={roleColors}
          exportTitle={title}
          people={people}
          onSketch={setZoomed}
          canComment={canComment}
          mayDelete={mayDelete}
          // (Saved: it's in the list as itself.)
          posting={posting?.id ? null : posting}
          me={me}
          onAddGeneral={onAddGeneral}
        />
      }
    />
    {zoomed?.sketch && <Lightbox src={zoomed.sketch.url} alt={`Sketch: ${zoomed.body}`} download={`sketch-${zoomed.id.slice(0, 8)}.png`} onClose={() => setZoomed(null)} />}
    </>
  );
}

function DocRail({
  owner,
  docs,
  current,
  canCreate,
  canEdit,
  href,
  roleColors,
  sideId,
}: {
  owner: Owner;
  docs: DocListItem[];
  current: string;
  /** Open on the right: shown, but not openable on the left too. */
  sideId: string | null;
  canCreate: { script: boolean; research: boolean };
  canEdit: boolean;
  href: (id: string) => string;
  roleColors: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const nav = usePendingNav();
  // The document on its way counts as open already.
  const shown = nav.pending ?? current;
  const [renaming, setRenaming] = useState<string | null>(null);
  // The main documents carry the colour of the role that works on them.
  const DOT: Record<string, string | undefined> = {
    Script: roleColors.scripter,
    Review: roleColors.master,
    Staging: roleColors.editor,
    Research: roleColors.researcher,
  };
  const groups = [
    { kind: "script" as const, label: "Versions", add: "Add version", can: canCreate.script },
    ...("long" in owner ? [{ kind: "research" as const, label: "Research", add: "Add research", can: canCreate.research }] : []),
  ];
  const DEFAULTS = ["Script", "Review", "Staging", "Research"];

  const [adding, setAdding] = useState<"script" | "research" | null>(null);
  const add = (kind: "script" | "research") => setAdding(kind);

  return (
    <nav className="lg:sticky lg:top-[var(--script-head-bottom,10.5rem)] lg:max-h-[calc(100dvh-var(--script-head-bottom,10.5rem))] lg:overflow-y-auto lg:overflow-x-hidden px-3 lg:px-4 pt-3 lg:py-6" aria-label="Documents">
      <div className="flex lg:flex-col gap-3 lg:gap-5 p-1">
        {groups.map((g) => (
          <div key={g.kind} className="flex lg:flex-col gap-1 flex-shrink-0">
            <div className="hidden lg:block px-2.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{g.label}</div>
            {docs
              .filter((d) => d.kind === g.kind)
              .map((d) => (
                <div key={d.id} className="group relative flex-shrink-0">
                  {d.id === sideId ? (
                    <div className="flex items-center gap-2.5 rounded-lg pl-3 pr-3 h-9 lg:h-10 text-[13.5px] whitespace-nowrap text-ink-faint cursor-default" title="Open on the right">
                      <span aria-hidden className="w-2 h-2 rounded-[3px] flex-shrink-0 opacity-60" style={{ background: DOT[d.name] ?? "rgb(var(--line) / .4)" }} />
                      <span className="truncate">{d.name}</span>
                      <span className="hidden lg:inline ml-auto text-[10.5px] font-bold uppercase">On the right</span>
                    </div>
                  ) : renaming === d.id ? (
                    <input
                      autoFocus
                      defaultValue={d.name}
                      maxLength={60}
                      onBlur={async (e) => {
                        setRenaming(null);
                        const name = e.target.value.trim();
                        if (name && name !== d.name) {
                          const r = await renameDoc(d.id, name);
                          if (r.error !== undefined) toast.error(r.error);
                          else router.refresh();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="w-36 lg:w-full rounded-lg border border-amber bg-surface px-2.5 h-9 text-[13px] font-semibold outline-none"
                    />
                  ) : (
                    <PendingLink
                      href={href(d.id)}
                      navKey={d.id}
                      prefetch={false}
                      onDoubleClick={(e) => {
                        if (!canEdit) return;
                        e.preventDefault();
                        setRenaming(d.id);
                      }}
                      title={canEdit ? "Double-click to rename" : undefined}
                      aria-current={d.id === shown ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg pl-3 pr-8 h-9 lg:h-10 text-[13.5px] whitespace-nowrap transition-colors ${
                        d.id === shown ? "bg-amber/12 text-ink font-bold ring-1 ring-amber/40" : "text-ink-soft hover:text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="w-2 h-2 rounded-[3px] flex-shrink-0"
                        style={{ background: DOT[d.name] ?? "transparent", boxShadow: DOT[d.name] ? undefined : "inset 0 0 0 1.5px rgb(var(--line) / 0.35)" }}
                      />
                      <span className="truncate">{d.name}</span>
                      <span className="hidden lg:inline ml-auto text-[11px] font-normal text-ink-faint tabular-nums">{d.wordCount}w</span>
                    </PendingLink>
                  )}
                  {canEdit && !DEFAULTS.includes(d.name) && renaming !== d.id && (
                    <button
                      type="button"
                      aria-label={`Delete ${d.name}`}
                      onClick={async () => {
                        if (!(await confirm({ title: `Delete “${d.name}”?`, description: "Its text and comments are deleted.", confirmLabel: "Delete", danger: true }))) return;
                        const r = await deleteDoc(d.id);
                        if (r.error !== undefined) toast.error(r.error);
                        else router.push(href(docs.find((x) => x.kind === "script" && x.id !== d.id)?.id ?? current), { scroll: false });
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-ink-faint hover:text-red opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            {g.can && (
              <button
                type="button"
                onClick={() => add(g.kind)}
                className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 border border-dashed border-line/25"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                {g.add}
              </button>
            )}
          </div>
        ))}
      </div>
      <AddDocDialog
        kind={adding}
        owner={owner}
        suggested={adding === "research" ? `Research ${docs.filter((d) => d.kind === "research").length + 1}` : `Version ${docs.filter((d) => d.kind === "script").length + 1}`}
        onClose={() => setAdding(null)}
        onCreated={(id) => {
          setAdding(null);
          nav.go(href(id), id);
        }}
      />
    </nav>
  );
}

/** "+ Add version / research": name it, then confirm. */
function AddDocDialog({
  kind,
  owner,
  suggested,
  onClose,
  onCreated,
}: {
  kind: "script" | "research" | null;
  owner: Owner;
  suggested: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(""), [kind]);
  const submit = async () => {
    setBusy(true);
    const r = await createDoc({ ...("short" in owner ? { short: owner.short } : { long: owner.long }), kind: kind ?? "script", name: name.trim() || suggested });
    setBusy(false);
    if (r.error !== undefined) toast.error(r.error);
    else {
      toast.success(`“${name.trim() || suggested}” added`);
      onCreated(r.id);
    }
  };
  return (
    <Dialog
      open={!!kind}
      onClose={() => !busy && onClose()}
      title={kind === "research" ? "Add a research document" : "Add a script version"}
      description="It starts empty; you can copy another document into it."
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60">
            {busy ? "Adding…" : "Add"}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">Name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          maxLength={60}
          placeholder={suggested}
          className="w-full rounded-xl border border-line/15 bg-surface px-3.5 h-11 text-[14px] outline-none focus:ring-2 focus:ring-amber"
        />
      </label>
    </Dialog>
  );
}

/** Side by side: pick the document right from the button. */
function SideBySideMenu({ docs, active, onPick, onClose }: { docs: DocListItem[]; active: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !(e.target as HTMLElement).closest("[data-side-menu]") && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  return (
    <div className="relative hidden lg:block" data-side-menu>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 h-8 text-[12px] font-semibold ${active ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
      >
        Side by side
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <Leaves>
          <div className="pop-menu origin-top-right absolute right-0 top-[calc(100%+6px)] z-40 w-60 rounded-xl border border-line/15 bg-surface shadow-2xl p-1.5">
            <div className="px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Show next to this one</div>
            {docs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(d.id);
                }}
                className={`w-full text-left flex items-center gap-2 rounded-lg px-2.5 h-9 text-[13px] ${d.id === active ? "bg-amber/10 font-bold" : "hover:bg-surface-2"}`}
              >
                <span className="truncate">{d.kind === "research" ? "Research · " : ""}{d.name}</span>
              </button>
            ))}
            {active && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onClose();
                }}
                className="w-full text-left rounded-lg px-2.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 border-t border-line/10 mt-1"
              >
                Close side by side
              </button>
            )}
          </div>
        </Leaves>
      )}
    </div>
  );
}

/** Phones / tablets: the current document as a dropdown (a sheet with all of them). */
function MobileDocs({
  owner,
  docs,
  current,
  canCreate,
  href,
  roleColors,
  sideId,
}: {
  owner: Owner;
  docs: DocListItem[];
  current: ScriptRow;
  canCreate: { script: boolean; research: boolean };
  href: (id: string) => string;
  roleColors: Record<string, string>;
  sideId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const nav = usePendingNav();
  // The document on its way counts as open already.
  const shownDoc = (nav.pending && docs.find((d) => d.id === nav.pending)) || current;
  const [adding, setAdding] = useState<"script" | "research" | null>(null);
  const DOT: Record<string, string | undefined> = { Script: roleColors.scripter, Review: roleColors.master, Staging: roleColors.editor, Research: roleColors.researcher };
  const groups = [
    { kind: "script" as const, label: "Versions", can: canCreate.script },
    ...("long" in owner ? [{ kind: "research" as const, label: "Research", can: canCreate.research }] : []),
  ];
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 pl-2.5 pr-2 h-9 text-[13px] font-bold max-w-[9.5rem]">
        <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: DOT[shownDoc.name] ?? "rgb(var(--line) / .4)" }} />
        <span className="truncate">{shownDoc.name}</span>
        <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0 text-ink-soft" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} label="Documents">
          <div className="p-2">
            {groups.map((g) => (
              <div key={g.kind} className="mb-2">
                <div className="px-2 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">{g.label}</div>
                {docs
                  .filter((d) => d.kind === g.kind)
                  .map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={d.id === sideId}
                      onClick={() => {
                        setOpen(false);
                        nav.go(href(d.id), d.id);
                      }}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 h-12 text-[15px] disabled:opacity-45 ${d.id === shownDoc.id ? "bg-amber/10 font-bold" : "hover:bg-surface-2"}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: DOT[d.name] ?? "rgb(var(--line) / .4)" }} />
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto text-[12px] text-ink-faint">{d.wordCount} words</span>
                    </button>
                  ))}
                {g.can && (
                  <button type="button" onClick={() => setAdding(g.kind)} className="w-full flex items-center gap-2 rounded-xl px-3 h-11 text-[14px] font-semibold text-ink-soft hover:bg-surface-2">
                    <PlusIcon className="w-4 h-4" />
                    {g.kind === "research" ? "Add research" : "Add version"}
                  </button>
                )}
              </div>
            ))}
          </div>
      </AnchoredMenu>
      <AddDocDialog
        kind={adding}
        owner={owner}
        suggested={adding === "research" ? `Research ${docs.filter((d) => d.kind === "research").length + 1}` : `Version ${docs.filter((d) => d.kind === "script").length + 1}`}
        onClose={() => setAdding(null)}
        onCreated={(id) => {
          setAdding(null);
          setOpen(false);
          nav.go(href(id), id);
        }}
      />
    </>
  );
}

/**
 * Another document as an equal page next to the one being written. Its
 * title row lines up with the main page's; it's editable (with its own
 * autosave) for people who may edit it.
 */
function SidePage({
  side,
  canEdit,
  swap,
  close,
  me = null,
  people = [],
}: {
  side: ScriptRow;
  canEdit: boolean;
  swap: string;
  close: () => void;
  me?: string | null;
  people?: MentionPerson[];
}) {
  const toast = useToast();
  const version = useRef(side.version);
  // Written live with everyone (1.55.0), like the page on the left: this tab's id, and where the text starts.
  const [liveAt] = useState(side.live ?? null);
  const liveMode = !!liveAt;
  const [clientId] = useState(newClientId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "conflict">("saved");
  // Dark / light paper and the page width follow the main page.
  const [paper, setPaper] = useState<"light" | "dark">("light");
  const [wide, setWide] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("vp:script-paper");
      if (v === "light" || v === "dark") setPaper(v);
      const w = localStorage.getItem("vp:script-width");
      setWide(w === "wide" || w === "full");
    } catch {
      /* private mode */
    }
    const on = (e: Event) => setPaper((e as CustomEvent<"light" | "dark">).detail);
    const onWidth = (e: Event) => setWide((e as CustomEvent<string>).detail !== "normal");
    window.addEventListener("vp-paper", on);
    window.addEventListener("vp-width", onWidth);
    return () => {
      window.removeEventListener("vp-paper", on);
      window.removeEventListener("vp-width", onWidth);
    };
  }, []);
  // Pictures pasted or dropped here too (1.27.5): shown at once, saved once uploaded.
  const editorRef = useRef<Editor | null>(null);
  const images = useScriptImages(editorRef, { teamId: side.teamId, scriptId: side.id, onError: (m) => toast.error(m) });
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const save = async (e: Editor) => {
    const content = imagesRef.current.forSave(e.getJSON());
    // (A picture still uploading: once it's up.)
    if (!content) {
      timer.current = setTimeout(() => void save(e), 700);
      return;
    }
    setStatus("saving");
    const text = e.getText();
    const r = await saveScript({ scriptId: side.id, expectedVersion: version.current, content, text, wordCount: text.trim() ? text.trim().split(/\s+/).length : 0 });
    if (r.ok) {
      version.current = r.version;
      setStatus("saved");
    } else if ("conflict" in r) {
      setStatus("conflict");
      toast.error(`Someone else saved “${side.name}”. Reload to see their version.`);
    } else {
      setStatus("unsaved");
      toast.error(r.error);
    }
  };
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: canEdit,
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false, orderedList: false }),
        ScriptOrderedList,
        ScriptKeys,
        Highlight.configure({ multicolor: true }),
        TextColor,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        ScriptImage,
        HeadingKeys,
        PageBreak,
        ...(liveAt ? [LiveCursors, LiveSteps.configure({ version: liveAt.docVersion, client: clientId })] : []),
      ],
      content: openable(side.content),
      editorProps: {
        attributes: { class: "script-doc outline-none" },
        transformPastedHTML: (html) => imagesRef.current.fromHtml(smallHeadingsToH3(html)),
        handlePaste: (_view, event) => {
          if (!canEdit) return false;
          const dt = event.clipboardData;
          const files = imageFiles(dt);
          const plan = pastePlan({ files: files.length, html: dt?.getData("text/html") ?? "", text: dt?.getData("text/plain") ?? "" });
          if (plan === "files") {
            imagesRef.current.insert(files);
            return true;
          }
          if (plan === "files-after") setTimeout(() => imagesRef.current.insert(files), 0);
          return false;
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved || !canEdit) return false;
          const files = imageFiles(event.dataTransfer);
          if (!files.length) return false;
          event.preventDefault();
          imagesRef.current.insert(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
          return true;
        },
      },
      onUpdate: ({ editor: e }) => {
        if (!canEdit) return;
        queueMicrotask(() => imagesRef.current.settle());
        // Live: the changes go in by themselves.
        if (liveMode) return;
        setStatus("unsaved");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void save(e), 1200);
      },
    },
    [side.id]
  );
  editorRef.current = editor;
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  // Live: the others in this document (their cursors here too), and everyone's changes as they're made.
  const editsRef = useRef<{ onSteps: (m: StepsMessage) => void; onJoined: () => void } | null>(null);
  const live = useLiveCursors({
    editor: liveMode ? editor : null,
    scriptId: side.id,
    me,
    people,
    onSaved: () => editsRef.current?.onJoined(),
    onSteps: (m) => editsRef.current?.onSteps(m),
    onJoined: () => editsRef.current?.onJoined(),
    // (The comments here are the page on the left's.)
    shareComments: false,
  });
  const edits = useLiveEdits({
    editor: liveMode ? editor : null,
    scriptId: side.id,
    client: clientId,
    start: liveAt,
    canEdit,
    me,
    broadcast: (m) => live.sendSteps(m),
    connected: live.connected,
    textOf: docText,
    prepare: openable,
    uploading: () => imagesRef.current.pending(),
    onError: (m) => toast.error(m),
  });
  editsRef.current = edits;
  const liveStuck = liveMode && (edits.status === "stale" || edits.status === "newer");
  useEffect(() => {
    if (editor && !editor.isDestroyed && liveStuck) editor.setEditable(false);
  }, [editor, liveStuck]);
  const label = !canEdit
    ? "View only"
    : liveMode
      ? SIDE_LIVE[edits.status]
      : status === "saved"
        ? "Saved"
        : status === "saving"
          ? "Saving…"
          : status === "conflict"
            ? "Not saved"
            : "Unsaved";
  const bad = liveMode ? edits.status === "offline" || liveStuck : status === "conflict";
  const good = liveMode ? edits.status === "saved" : status === "saved";
  return (
    <div className="min-w-0">
      {/* Same height as the main page's title row, so both pages line up. */}
      <div className="h-8 mb-2 flex items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-soft truncate">
          {side.kind === "research" ? "Research · " : ""}
          {side.name}
        </span>
        {liveStuck ? (
          <button type="button" onClick={() => window.location.reload()} className="text-[11.5px] font-semibold text-red hover:underline">
            {label}
          </button>
        ) : (
          <span className={`text-[11.5px] font-semibold ${bad ? "text-red" : good ? "text-green" : "text-ink-soft"}`}>{label}</span>
        )}
        <span className="flex-1" />
        <Link href={swap} scroll={false} prefetch={false} className="rounded-md px-2 h-7 inline-flex items-center text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Open here
        </Link>
        <button type="button" onClick={close} aria-label="Close side by side" className="w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div data-paper={paper} className={`script-paper mx-auto w-full ${wide ? "max-w-none" : "max-w-[794px]"} rounded-md border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)] px-6 sm:px-[72px] py-10 sm:py-[72px] min-h-[60vh] transition-colors`}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/** The document next to another, written live (1.55.0): what its title row says. */
const SIDE_LIVE: Record<LiveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  offline: "Offline",
  stale: "Reload to keep writing",
  newer: "Reload to keep writing",
  readonly: "View only",
};

/** One colour per type, everywhere: comments the accent, editing ideas blue, frame guides teal (lib/kinds.ts). */
export const TYPE_COLOR = KIND_COLOR;
function commentColor(c: ScriptComment, _roleColors?: Record<string, string>) {
  return TYPE_COLOR[c.kind];
}

// The frame picker for a frame guide on the whole document (1.54.0): loaded when it's first opened.
const FramePicker = dynamic(() => import("@/modules/frames/components/frame-picker").then((m) => m.FramePicker), { ssr: false });

/**
 * Comments as a small chat: a floating button, a panel on desktop, a sheet on
 * phones. Every document has its own (this video's Script, Review, Staging,
 * Research…): the panel names the one it belongs to. Comments left on words
 * that were rewritten since are kept apart at the end, so they never look
 * like they came from somewhere else.
 *
 * 1.50.0, rebuilt (the owner: "the comments UI is pretty bad, we need improvements acros sthe board"): the same card
 * as the small box on the words (comment-card.tsx), with Edit for its author; counts on the filters; and a box at the
 * bottom for a comment or an editing idea on the whole document, on no words of it ("general comments as well, not
 * linked to anything in particular").
 */
export function CommentsChat({
  open,
  setOpen,
  comments,
  active,
  onPick,
  docId,
  teamId,
  docName,
  number,
  docContent,
  roleColors,
  exportTitle,
  people,
  onSketch,
  canComment,
  mayDelete,
  posting,
  me,
  onAddGeneral,
}: {
  canComment: boolean;
  mayDelete: (c: ScriptComment) => boolean;
  posting: PostingComment | null;
  me: { userId: string; master: boolean } | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  comments: ScriptComment[];
  active: string | null;
  onPick: (id: string) => void;
  docId: string;
  /** The team's (1.54.0: its frame guides). */
  teamId: string;
  docName: string;
  number: number;
  docContent: Record<string, unknown>;
  roleColors: Record<string, string>;
  exportTitle: string;
  people: MentionPerson[];
  onSketch: (c: ScriptComment) => void;
  /** A comment on the whole document: null when it's posted, else what went wrong. */
  onAddGeneral?: (body: string, kind: CommentKind, frame?: FrameRef | null) => Promise<string | null>;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<"all" | CommentKind>("all");
  // The big view, like the other chats.
  const [big, setBig] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const openCount = comments.filter((c) => !c.resolved).length;
  const shown = comments.filter((c) => showResolved || !c.resolved);
  const counts = { all: shown.length, comment: shown.filter((c) => c.kind === "comment").length, edit_idea: shown.filter((c) => c.kind === "edit_idea").length, frame: shown.filter((c) => c.kind === "frame").length };
  const list = shown.filter((c) => filter === "all" || c.kind === filter);
  const listRef = useRef<HTMLDivElement>(null);
  const hasPosting = !!posting;
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open, comments.length, hasPosting]);
  const sending = posting && !comments.some((c) => c.id === posting.id) ? posting : null;
  const meAs = me ? people.find((p) => p.userId === me.userId) ?? null : null;
  // Which quotes can no longer be found (the text was rewritten). Null until the text is read.
  const [missing, setMissing] = useState<Set<string> | null>(null);
  // Every node and mark a script can have (1.23.1: highlights, nested checklists and page
  // breaks too; 1.53.1: text colour): one this copy didn't know made it empty, and every comment looked rewritten.
  const ed = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false, orderedList: false }), ScriptOrderedList, Highlight.configure({ multicolor: true }), TextColor, TextAlign.configure({ types: ["heading", "paragraph"] }), TaskList, TaskItem.configure({ nested: true }), ScriptImage, PageBreak],
      content: docContent,
    },
    [docContent]
  );
  useEffect(() => {
    if (!ed) return;
    // A general one is on no words: it's never "on text that changed".
    setMissing(new Set(comments.filter((c) => c.quote && !findQuote(ed.state.doc, c.quote, c.occurrence)).map((c) => c.id)));
  }, [ed, comments]);
  const here = missing ? list.filter((c) => !missing.has(c.id)) : list;
  const gone = missing ? list.filter((c) => missing.has(c.id)) : [];
  const goneOpenIds = gone.filter((c) => !c.resolved).map((c) => c.id);
  // The rewritten ones fold away when there are others to read; they're open when they're all there is.
  const [goneShown, setGoneShown] = useState<boolean | null>(null);
  const showGone = goneShown ?? here.length === 0;
  const [resolvingGone, setResolvingGone] = useState(false);

  // The box for the whole document, and a copy of what's in it on this device (a reload can't lose it).
  const generalKey = `vp:general-comment:${docId}`;
  const [gKind, setGKind] = useState<CommentKind>("comment");
  const [gText, setGText] = useState("");
  const [gBusy, setGBusy] = useState(false);
  // 1.54.0: a frame guide on the whole document, and its picker.
  const [gFrame, setGFrame] = useState<FrameRef | null>(null);
  const [gPicking, setGPicking] = useState(false);
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(generalKey) ?? "null");
      if (b && typeof b.text === "string" && Date.now() - (b.at ?? 0) < 14 * 86_400_000) {
        setGText(b.text);
        const frame = b.kind === "frame" && b.frame && typeof b.frame.id === "string" ? (b.frame as FrameRef) : null;
        setGKind(b.kind === "edit_idea" ? "edit_idea" : frame ? "frame" : "comment");
        setGFrame(frame);
      }
    } catch {}
  }, [generalKey]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (!gText.trim() && !(gKind === "frame" && gFrame)) localStorage.removeItem(generalKey);
        else localStorage.setItem(generalKey, JSON.stringify({ kind: gKind, text: gText, frame: gKind === "frame" ? gFrame : null, at: Date.now() }));
      } catch {
        /* full or private: it's still in the box */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [gText, gKind, generalKey, gFrame]);
  async function sendGeneral() {
    const body = gText.trim();
    if (!onAddGeneral || gBusy) return;
    if (gKind === "frame" ? !gFrame : !body) return gKind === "frame" ? setGPicking(true) : undefined;
    const was = { text: gText, kind: gKind, frame: gFrame };
    setGBusy(true);
    // It shows at once, as "Posting…"; if it fails, the words come back to the box.
    setGText("");
    if (gKind === "frame") setGFrame(null);
    const err = await onAddGeneral(body, gKind, gKind === "frame" ? was.frame : null);
    setGBusy(false);
    if (err) {
      setGText(was.text);
      setGKind(was.kind);
      setGFrame(was.frame);
      toast.error(err);
      return;
    }
    sounds.send();
    try {
      localStorage.removeItem(generalKey);
    } catch {}
  }
  async function discardGeneral() {
    if (!gText.trim() && !(gKind === "frame" && gFrame)) return;
    const ok = await confirm({
      title: gKind === "edit_idea" ? "Discard this editing idea?" : gKind === "frame" ? "Discard this frame guide?" : "Discard this comment?",
      description: "What you wrote will be lost.",
      confirmLabel: "Discard",
      danger: true,
    });
    if (ok) {
      setGText("");
      setGFrame(null);
    }
  }

  // The shot list (1.54.0): every frame guide of the script in its order (on words, linked words, pictures), as Word
  // or a PDF, for whoever films it.
  const shotCount = comments.filter((c) => c.kind === "frame" && !c.resolved).length + (ed && !ed.isDestroyed ? frameUses(ed.state.doc).length : 0);
  async function exportShots(f: "docx" | "pdf") {
    const doc = ed && !ed.isDestroyed ? ed.state.doc : null;
    const uses = doc ? frameUses(doc) : [];
    if (uses.some((u) => !frameById(teamId, u.id))) await loadLibrary(teamId);
    const notes = comments
      .filter((c) => c.kind === "frame" && !c.resolved)
      .map((c) => ({
        at: !c.quote ? -1 : doc ? findQuote(doc, c.quote, c.occurrence)?.from ?? Infinity : Infinity,
        item: { quote: c.quote, idea: c.body, sketch: c.frame?.url ?? null, label: c.frame ? frameRefName(c.frame) : "Its frame was deleted from Frame Guides" },
      }));
    const inText = uses.flatMap((u) => {
      const fr = frameById(teamId, u.id);
      return fr ? [{ at: u.at, item: { quote: u.how === "picture" ? null : u.words, idea: "", sketch: fr.url, label: `${frameRefName(fr)}${u.how === "link" ? " (linked words)" : ""}` } }] : [];
    });
    const shots = [...notes, ...inText].sort((a, b) => a.at - b.at).map((x) => x.item);
    if (!shots.length) return toast.error("No frame guides in this script yet.");
    const { exportIdeasDocx, exportIdeasPdf } = await import("../lib/export-docx");
    if (f === "docx") await exportIdeasDocx(shots, exportTitle, `${exportTitle} - shot list`.replace(/[\\/:*?"<>|]+/g, ""), "Shot List");
    else if (!exportIdeasPdf(shots, exportTitle, "Shot List")) toast.error("Allow pop-ups to print the PDF.");
  }

  async function resolveGone() {
    if (!goneOpenIds.length || resolvingGone) return;
    const n = goneOpenIds.length;
    const ok = await confirm({
      title: `Resolve ${n === 1 ? "this one" : `these ${n}`}?`,
      description: `${n === 1 ? "It was" : "They were"} left on words that are no longer in ${docName}. Resolved ones stay under "Show resolved", and can be reopened.`,
      confirmLabel: "Resolve",
    });
    if (!ok) return;
    setResolvingGone(true);
    const r = await resolveComments(docId, goneOpenIds);
    setResolvingGone(false);
    if (r.error !== undefined) return toast.error(r.error);
    toast.success(r.resolved === 1 ? "Resolved." : `Resolved ${r.resolved}.`);
    commentsChanged();
  }

  const card = (c: ScriptComment) => (
    <CommentCard
      key={c.id}
      variant="list"
      c={c}
      people={people}
      roleColors={roleColors}
      me={me}
      canComment={canComment}
      mayDelete={mayDelete(c)}
      changed={!!missing?.has(c.id)}
      active={c.id === active}
      onPick={() => onPick(c.id)}
      onSketch={() => onSketch(c)}
      onFrame={c.frame ? () => viewFrame(c.frame!.id, c.frame) : undefined}
    />
  );

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="no-print glass-fab fixed z-30 right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-6 inline-flex items-center gap-2 rounded-xl bg-surface-2 text-ink border border-line/20 pl-4 pr-3 h-11 text-[13.5px] font-bold shadow-[0_12px_30px_-10px_rgb(0_0_0/0.6)] hover:border-line/40 hover:scale-[1.03] transition-transform"
        >
          Comments
          <span className={`rounded-lg px-2 h-6 inline-flex items-center text-[12px] ${openCount ? "bg-amber text-white" : "bg-line/15 text-ink-soft"}`}>{openCount}</span>
        </button>
      )}
      {open && big && (
        <Leaves>
          <div className="pop-dim no-print fixed inset-0 z-[39] bg-black/55" onClick={() => setBig(false)} aria-hidden />
        </Leaves>
      )}
      {open && (
        <Leaves>
          <section
            key={big ? "big" : "small"}
            className={`no-print fixed z-40 bg-surface text-ink border border-line/15 shadow-2xl flex flex-col pop-modal ${
              big
                ? "inset-2 sm:inset-6 lg:inset-x-[max(1.5rem,calc(50vw-28rem))] lg:inset-y-8 rounded-2xl"
                : "inset-x-2 bottom-2 h-[78dvh] rounded-2xl lg:inset-auto lg:right-6 lg:bottom-6 lg:w-[420px] lg:h-[min(660px,calc(100dvh-9rem))]"
            }`}
            aria-label="Comments"
          >
            <header className="px-4 pt-3.5 pb-3 border-b border-line/10 space-y-3">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-[15px] font-bold">Comments</h2>
                <span className="text-[12.5px] text-ink-soft whitespace-nowrap">{openCount} open</span>
                {/* Each document has its own comments: say which one these are. */}
                <span className="min-w-0 truncate rounded-md bg-surface-2 px-1.5 h-5 inline-flex items-center text-[11px] font-semibold text-ink-soft" title={`Comments on ${docName} of #${number} only`}>
                  {docName} · #{number}
                </span>
                <span className="flex-1" />
                <button type="button" onClick={() => setBig((b) => !b)} aria-label={big ? "Smaller" : "Bigger"} title={big ? "Smaller" : "Big view"} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                  <ExpandIcon className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close comments" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="flex rounded-xl bg-surface-2 p-0.5" role="radiogroup" aria-label="Show">
                {([
                  ["all", "All"],
                  ["comment", "Comments"],
                  ["edit_idea", "Ideas"],
                  ["frame", "Frames"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={filter === k}
                    onClick={() => setFilter(k)}
                    title={k === "edit_idea" ? "Editing ideas" : k === "frame" ? "Frame guides" : undefined}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-[10px] px-1.5 sm:px-2 h-8 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                      filter === k ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.18)] ring-1 ring-inset ring-line/10" : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {k !== "all" && <KindMark kind={k} />}
                    {label}
                    <span className={`tabular-nums text-[11.5px] ${filter === k ? "text-ink-soft" : "text-ink-faint"}`}>{counts[k]}</span>
                  </button>
                ))}
              </div>
            </header>
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden styled-scroll px-3 py-3 space-y-2.5">
              {!list.length && !sending && (
                <div className="text-center px-6 py-10">
                  <p className="text-[13.5px] font-semibold text-ink">{comments.length ? "Nothing here with this filter." : `No comments on ${docName} yet.`}</p>
                  {!comments.length && (
                    <p className="mt-1.5 text-[12.5px] text-ink-soft leading-relaxed">
                      Select any words in it, a line or several, then choose Comment, Editing idea or Frame guide{canComment && onAddGeneral ? ". Or write one below for the whole document." : "."}
                    </p>
                  )}
                </div>
              )}
              {here.map(card)}
              {sending && <PostingCard p={sending} meAs={meAs} />}
              {gone.length > 0 && (
                <div className={here.length ? "pt-2" : ""}>
                  <div className="rounded-xl border border-dashed border-line/20 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setGoneShown(!showGone)}
                      aria-expanded={showGone}
                      className="w-full flex items-center gap-2 text-left text-[12.5px] font-semibold text-ink-soft hover:text-ink"
                    >
                      <ChevronDownIcon className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${showGone ? "" : "-rotate-90"}`} />
                      <span className="flex-1">On text that changed since · {gone.length}</span>
                    </button>
                    <p className="mt-1 text-[11.5px] text-ink-faint leading-snug">
                      Left on earlier words of this {docName} that were rewritten or deleted since. Nothing here comes from another script or video.
                    </p>
                    {canComment && goneOpenIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void resolveGone()}
                        disabled={resolvingGone}
                        className="mt-2 rounded-md border border-line/20 px-2.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 disabled:opacity-60"
                      >
                        {resolvingGone ? "Resolving…" : goneOpenIds.length === 1 ? "Resolve it" : `Resolve all ${goneOpenIds.length}`}
                      </button>
                    )}
                  </div>
                  {showGone && <div className="mt-2.5 space-y-2.5 animate-[fadein_.2s_ease]">{gone.map(card)}</div>}
                </div>
              )}
            </div>
            {canComment && onAddGeneral && (
              <div className="px-3 pt-2.5 pb-2 border-t border-line/10">
                <CommentComposer
                  variant="panel"
                  kind={gKind}
                  setKind={(k) => {
                    setGKind(k);
                    // A frame guide starts with its frame.
                    if (k === "frame" && !gFrame) setGPicking(true);
                  }}
                  quote=""
                  people={people}
                  roleColors={roleColors}
                  text={gText}
                  setText={setGText}
                  frame={gKind === "frame" ? gFrame : null}
                  onPickFrame={() => setGPicking(true)}
                  onOpenFrame={gFrame ? () => viewFrame(gFrame.id, gFrame) : undefined}
                  busy={gBusy}
                  onSubmit={() => void sendGeneral()}
                  onCancel={() => void discardGeneral()}
                />
                {gPicking && (
                  <FramePicker
                    teamId={teamId}
                    purpose="general"
                    canEdit={false}
                    canNote
                    onPick={(f: FrameGuide) => {
                      setGPicking(false);
                      setGKind("frame");
                      setGFrame(frameRefOf(f, null));
                    }}
                    onClose={() => setGPicking(false)}
                  />
                )}
              </div>
            )}
            <footer className="px-4 py-2.5 border-t border-line/10 flex items-center gap-2 flex-wrap text-[12px] text-ink-soft pb-[calc(env(safe-area-inset-bottom)+0.625rem)]">
              <span className="flex-1 min-w-[8rem]">{canComment ? "Or select words to comment on them." : "Only this video's scripters and its Review and Staging people can comment."}</span>
              {comments.some((c) => c.kind === "edit_idea") && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-semibold">Export ideas</span>
                  {(["docx", "pdf"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={async () => {
                        // Editing ideas in the order they appear in the script (the ones on the whole document first).
                        const ideas = comments
                          .filter((c) => c.kind === "edit_idea" && !c.resolved)
                          .map((c) => ({ c, at: !c.quote ? -1 : ed ? findQuote(ed.state.doc, c.quote, c.occurrence)?.from ?? Infinity : Infinity }))
                          .sort((a, b) => a.at - b.at)
                          .map(({ c }) => ({ quote: c.quote, idea: c.sketch && c.body.trim() === "Sketch" ? "" : c.body, sketch: c.sketch?.url ?? null }));
                        if (!ideas.length) return toast.error("No open editing ideas to export.");
                        const { exportIdeasDocx, exportIdeasPdf } = await import("../lib/export-docx");
                        if (f === "docx") await exportIdeasDocx(ideas, exportTitle, `${exportTitle} - editing ideas`.replace(/[\\/:*?"<>|]+/g, ""));
                        else if (!exportIdeasPdf(ideas, exportTitle)) toast.error("Allow pop-ups to print the PDF.");
                      }}
                      className="rounded-md border border-line/20 px-2 h-7 font-bold uppercase text-[10.5px] text-ink hover:border-line/40"
                    >
                      {f === "docx" ? "Word" : "PDF"}
                    </button>
                  ))}
                </span>
              )}
              {shotCount > 0 && (
                <span className="inline-flex items-center gap-1" title="Every frame guide of the script, in its order, for whoever films it">
                  <span className="font-semibold">Shot list</span>
                  {(["docx", "pdf"] as const).map((f) => (
                    <button key={f} type="button" onClick={() => void exportShots(f)} className="rounded-md border border-line/20 px-2 h-7 font-bold uppercase text-[10.5px] text-ink hover:border-line/40">
                      {f === "docx" ? "Word" : "PDF"}
                    </button>
                  ))}
                </span>
              )}
              {comments.some((c) => c.resolved) && (
                <button type="button" onClick={() => setShowResolved((v) => !v)} className="font-semibold hover:text-ink">
                  {showResolved ? "Hide resolved" : `Show resolved (${comments.filter((c) => c.resolved).length})`}
                </button>
              )}
            </footer>
          </section>
        </Leaves>
      )}
    </>
  );
}
