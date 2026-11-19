"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEditor, EditorContent, useEditorState, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { PaperLines } from "./script-skeleton";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { createClient } from "@/lib/supabase/client";
import { prepareSketchUpload, saveScript } from "@/app/(dashboard)/scripts/actions";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowLeftIcon,
  BoldIcon,
  CheckIcon,
  ChevronDownIcon,
  DocumentIcon,
  DownloadIcon,
  HighlighterIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletIcon,
  ListCheckIcon,
  ListNumberIcon,
  MoonIcon,
  QuoteIcon,
  RedoIcon,
  StrikeIcon,
  SunIcon,
  UnderlineIcon,
  UndoIcon,
  MoreIcon,
  PageBreakIcon,
  WidthIcon,
  CommentIcon,
  ScissorsIcon,
  FrameIcon,
  CloudCheckIcon,
  CloudOffIcon,
  CloudUpIcon,
  RetryIcon,
} from "@/components/ui/icons";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { ANY_EDIT, CommentHighlights, commentAt, commentKey, findQuote, findText, quoteAt, type CommentMark, type PendingMark, type PostingComment } from "../lib/anchors";
import { SearchHit, searchHitKey } from "../lib/search-hit";
import { LiveCursors } from "../lib/live-cursors";
import { useLiveCursors, type StepsMessage } from "./use-live-cursors";
import { useLiveEdits, type LiveStatus } from "./use-live-edits";
import { newClientId } from "../lib/collab";
import { docText, LiveSteps, openable } from "../lib/live-doc";
import { barRoom, type BarRoom } from "../lib/bar-room";
import type { LiveStart } from "../lib/queries";
import { LiveFaces } from "./live-faces";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { GrammarMarks } from "../grammar/plugin";
import { HeadingKeys } from "../lib/heading-keys";
import { PageBreak } from "../lib/page-break";
import { TEXT_COLORS, TextColor, textColor } from "../lib/text-color";
import { ScriptKeys, ScriptOrderedList } from "../lib/script-keys";
import { printScript, watchPrinting } from "../lib/print-script";
import { imageFiles, pastePlan } from "../lib/paste-images";
import { LinkCard, LinkWindow, openInTab } from "./link-ui";
import { smallHeadingsToH3 } from "../lib/headings";
import { repairDoc } from "../lib/repair";
import { useGrammar, type Grammar } from "../grammar/use-grammar";
import { GrammarLayer, GrammarToolbarButton } from "../grammar/grammar-ui";
import { CATEGORY_COLOR, type GrammarCategory } from "../grammar/types";
import { dock, useDock } from "../lib/dock";
import { CommentComposer, KIND_COLOR } from "./comment-composer";
import type { CommentKind, FrameRef } from "../lib/kinds";
import { FrameLinkPictures, frameLinkKey, framesInDoc, withFramePictures, type FrameLook, type Json as FrameJson } from "../lib/frame-links";
import { FRAME_OPEN_EVENT } from "./script-image";
import { blockRange } from "./use-script-images";
import { FrameLinkCard } from "./frame-link-card";
import { frameById, useFrameLibrary, useLibraryVersion } from "@/modules/frames/components/frame-store";
import { frameHref, frameIdOfHref, type FrameGuide, type FrameLibrary } from "@/modules/frames/lib/model";
import type { PickHow, PickPurpose } from "@/modules/frames/components/frame-picker";
import type { MentionPerson } from "../lib/mention-people";
import type { Scene } from "../sketch/engine";
import { Leaves } from "@/components/ui/leaves";
import { SAVE_NOW_EVENT, type SaveNow } from "../lib/save-now";

// Frame guides (1.54.0): the picker and the big view load when they're first opened.
const FramePicker = dynamic(() => import("@/modules/frames/components/frame-picker").then((m) => m.FramePicker), { ssr: false });
const FrameViewer = dynamic(() => import("@/modules/frames/components/frame-details").then((m) => m.FrameViewer), { ssr: false });
/** Open a frame guide big, from anywhere on the script's page (a frame guide's card in the comments, say). */
export const FRAME_VIEW_EVENT = "vp-frame-view";
export function viewFrame(id: string, ref?: FrameRef | null) {
  window.dispatchEvent(new CustomEvent(FRAME_VIEW_EVENT, { detail: { id, ref: ref ?? null } }));
}
/** A frame of the library, as a script shows it. */
export function frameRefOf(f: FrameGuide, lib: Pick<FrameLibrary, "collections"> | null): FrameRef {
  const c = lib?.collections.find((x) => x.id === f.collectionId);
  return { id: f.id, number: f.number, title: f.title, url: f.url, thumb: f.thumb, w: f.w, h: f.h, tint: f.tint, collection: c ? { name: c.name, color: c.color } : null };
}

// The Sketch Studio is only loaded when someone presses Draw.
const SketchStudio = dynamic(() => import("../sketch/sketch-studio").then((m) => m.SketchStudio), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-paper/90 text-[13px] font-semibold text-ink-soft">Opening the Sketch Studio…</div>
  ),
});
const DRAFT_KEY = (id: string) => `vp:comment-draft:${id}`;
type SketchDraft = { scene: Scene; blob: Blob; w: number; h: number; url: string };
import { ScriptImage } from "./script-image";
import { useScriptImages } from "./use-script-images";
import { countWords, SCRIPT_TEMPLATE, spokenLength } from "../lib/text";
import { sounds } from "@/lib/sounds";

const HIGHLIGHTS = [
  { name: "Yellow", color: "#FDE68A" },
  { name: "Green", color: "#BBF7D0" },
  { name: "Blue", color: "#BFDBFE" },
  { name: "Pink", color: "#FBCFE8" },
  { name: "Orange", color: "#FED7AA" },
];

type Status = "saved" | "unsaved" | "saving" | "error" | "conflict";
const PAPER_KEY = "vp:script-paper";
const WIDTH_KEY = "vp:script-width";
/** "Ctrl+" (or "⌘" on a Mac) in the shortcuts shown. */
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
/** The app's own bar at the top of every page (h-14). */
const APP_BAR = 56;
/**
 * Where the header sticks on a computer: under the app's bar, which floats a little lower with the glass look (1.31.9,
 * --shell-top). 1.55.1: with the bar floating, right against it (--script-head-top, globals.css): the two are one card.
 */
const UNDER_BAR = `var(--script-head-top, var(--shell-top, ${APP_BAR}px))`;
type Width = "normal" | "wide" | "full";
/** How wide the long page gets (1.23.0): Normal, Wide or the whole width. */
const STRIP_W: Record<Width, string> = { normal: "max-w-3xl", wide: "max-w-[1080px]", full: "max-w-none" };
const WIDTH_LABEL: Record<Width, string> = { normal: "Normal", wide: "Wide", full: "Full width" };

type Json = { type: string; content?: Json[] };

/**
 * The editor adds an empty paragraph at the end when you click past the
 * last block. That isn't a real change: drop trailing empty paragraphs
 * before comparing or saving.
 */
function normalized(doc: Json): Json {
  const content = [...(doc.content ?? [])];
  while (content.length > 1) {
    const last = content[content.length - 1];
    if (last.type === "paragraph" && !last.content?.length) content.pop();
    else break;
  }
  return { ...doc, content };
}

/** What the top bar says while writing live. */
const LIVE_TEXT: Record<LiveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  offline: "Offline: saving when you're back",
  stale: "Reload to keep writing",
  newer: "ClipTroop was updated: reload",
  readonly: "View only",
};

export function ScriptEditor({
  scriptId,
  teamId,
  initialContent,
  initialVersion,
  canEdit,
  title,
  number,
  backHref,
  backLabel,
  lastEdited,
  topBarExtra,
  subBar,
  docName,
  rightPanel,
  sideBySide,
  mobileDocs,
  renderCommentPopover,
  comments = [],
  activeCommentId = null,
  onAddComment,
  onCommentClick,
  copySources = [],
  onCopyFrom,
  onCopyComments,
  people = [],
  roleColors = {},
  switching = false,
  me = null,
  posting = null,
  onPosting,
  onRemoteComments,
  find = null,
  liveStart = null,
  barFlow,
}: {
  /** Words to show (a search result, ?find=): marked for a moment, scrolled to. */
  find?: string | null;
  scriptId: string;
  teamId: string;
  initialContent: Record<string, unknown>;
  initialVersion: number;
  canEdit: boolean;
  title: string;
  number: number;
  backHref: string;
  backLabel: string;
  lastEdited: string | null;
  /** Extra controls for the top bar (e.g. the short's scripters). */
  topBarExtra?: React.ReactNode;
  /** A strip under the top bar (the Script → Review → Staging flow). */
  subBar?: React.ReactNode;
  /** The document's name (e.g. "Review"), shown in the top bar. */
  docName?: string;
  /** Right: extra panel (a sheet on phones). */
  rightPanel?: React.ReactNode;
  /** Another document shown as an equal page next to this one (desktop). */
  sideBySide?: React.ReactNode;
  /** The documents dropdown: by the title on phones, at the start of the bar on a computer (1.55.4: the only list of
   * the documents; the column on the left is gone). */
  mobileDocs?: React.ReactNode;
  /** The popover shown when a highlighted comment is clicked. */
  renderCommentPopover?: (id: string, close: () => void) => React.ReactNode;
  /** Inline comments (anyone on the team can add them). */
  comments?: CommentMark[];
  activeCommentId?: string | null;
  onAddComment?: (quote: string, occurrence: number, body: string, kind: CommentKind, sketch?: { path: string; w: number; h: number } | null, frameId?: string | null) => Promise<string | null>;
  onCommentClick?: (id: string) => void;
  /** "Copy from…" when this document is empty. */
  copySources?: { id: string; name: string }[];
  /** Another document's text, and how many open comments / editing ideas it has. */
  onCopyFrom?: (id: string) => Promise<{ content: Record<string, unknown>; comments: number } | null>;
  /** 1.27.5: its comments and editing ideas come too (asked when it has any). */
  onCopyComments?: (fromId: string) => Promise<void>;
  /** Teammates for @mentions (with what they do on this video). */
  people?: MentionPerson[];
  roleColors?: Record<string, string>;
  /** Another document is on its way: the page shows shimmering lines meanwhile. */
  switching?: boolean;
  /** Who's writing (the team's dictionary: which words they may remove). */
  me?: { userId: string; master: boolean } | null;
  /** A comment being sent: the text shows "Posting…" on its words until it's saved. */
  posting?: PostingComment | null;
  onPosting?: (p: PostingComment | null) => void;
  /** Someone else in the script changed the comments (1.54.1): fetch them again. */
  onRemoteComments?: () => void;
  /**
   * Writing together, live (1.55.0, 0134): where the text above is (which steps it has) and the steps after it. Null:
   * the old way (one person's save at a time), before 0134 runs.
   */
  liveStart?: LiveStart | null;
  /** 1.55.2: People and the step's button, for the one bar (labels: room for its words). */
  barFlow?: (o: { labels: boolean }) => React.ReactNode;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status>("saved");
  const statusRef = useRef(status);
  statusRef.current = status;
  const [words, setWords] = useState(0);
  const [paper, setPaper] = useState<"light" | "dark">("light");
  const [width, setWidth] = useState<Width>("normal");
  /**
   * Live (1.55.0): everyone's changes go in as they're made (no saves of the whole script, no "saved a newer version").
   * Fixed for the page's life: the editor is made for one way or the other.
   */
  const [liveAt] = useState(liveStart);
  const liveMode = !!liveAt;
  const liveModeRef = useRef(liveMode);
  /** This tab's id among the pages writing the script. */
  const [clientId] = useState(newClientId);
  /** Someone else saved a newer version while you're here (1.53.5): who. */
  const [newer, setNewer] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const paperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const versionRef = useRef(initialVersion);
  const pendingRef = useRef(false);
  const inflightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  // What the database has. A "change" only counts if the document differs
  // from this, so clicks and no-op edits never trigger a save.
  const savedJsonRef = useRef<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  /** The script's live channel (1.53.5): a save tells the others. */
  const liveRef = useRef<{ announceSaved: (version: number) => void } | null>(null);
  const commentStateRef = useRef<{ comments: CommentMark[]; active: string | null; pending: PendingMark; onBlocked?: (id: string) => void }>({ comments, active: activeCommentId, pending: null });
  /** A change to a comment's words was turned down (anchors.ts): what to do about it (set below). */
  const blockedRef = useRef<(id: string) => void>(() => {});

  useEffect(() => {
    try {
      const v = localStorage.getItem(PAPER_KEY);
      if (v === "light" || v === "dark") setPaper(v);
      const wd = localStorage.getItem(WIDTH_KEY);
      if (wd === "normal" || wd === "wide" || wd === "full") setWidth(wd);
    } catch {
      /* private mode: stay light */
    }
  }, []);

  // ---- saving ---------------------------------------------------------------

  const flush = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !pendingRef.current || inflightRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    // Pictures with their real addresses (1.27.5); one still uploading: saved once it's up.
    const json = imagesRef.current.forSave(normalized(editor.getJSON() as Json));
    if (!json) {
      timerRef.current = setTimeout(() => void flushRef.current(), 700);
      return;
    }
    pendingRef.current = false;
    inflightRef.current = true;
    setStatus("saving");
    const text = editor.getText({ blockSeparator: "\n" });
    const jsonText = JSON.stringify(json);
    if (jsonText === savedJsonRef.current) {
      inflightRef.current = false;
      setStatus("saved");
      return;
    }
    const res = await saveScript({
      scriptId,
      expectedVersion: versionRef.current,
      content: json,
      text,
      wordCount: countWords(text),
      path: backHref,
    });
    inflightRef.current = false;
    if (res.ok) {
      versionRef.current = res.version;
      savedJsonRef.current = jsonText;
      liveRef.current?.announceSaved(res.version);
      setNewer(null);
      if (pendingRef.current) {
        setStatus("unsaved");
        timerRef.current = setTimeout(() => void flushRef.current(), 400);
      } else setStatus("saved");
    } else if ("conflict" in res) {
      setStatus("conflict");
      editor.setEditable(false);
    } else {
      pendingRef.current = true; // keep the changes; retry on the next edit or Ctrl+S
      setStatus("error");
      toast.error(res.error);
    }
  }, [scriptId, backHref, toast]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const schedule = useCallback(() => {
    pendingRef.current = true;
    setStatus((s) => (s === "conflict" ? s : "unsaved"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), 900);
  }, []);

  // ---- images -----------------------------------------------------------------
  // Pasted, dropped or picked: on the page at once, uploaded in the background (1.27.5).
  const images = useScriptImages(editorRef, { teamId, scriptId, onError: (m) => toast.error(m) });
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const uploading = images.uploading;

  // ---- frame guides (1.54.0) ------------------------------------------------------
  // What the script knows about each frame (the team's library, read only once the script uses frames or the picker
  // opens) and what a click on one does: the pictures under linked words (frame-links.ts).
  const frameLookRef = useRef<{ look: (id: string) => FrameLook; onOpen: (id: string) => void }>({ look: () => undefined, onOpen: () => {} });

  // ---- editor -------------------------------------------------------------------

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Clicking a link shows where it goes (and Ctrl + click opens it): see the link card.
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
        codeBlock: false,
        code: false,
        // Ours: lettered and roman lists too (1.27.5).
        orderedList: false,
      }),
      ScriptOrderedList,
      // Tab in the text, lists from "1." / "a." (1.27.5).
      ScriptKeys,
      Highlight.configure({ multicolor: true }),
      // The words' own colour (1.53.1).
      TextColor,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ScriptImage,
      CharacterCount,
      CommentHighlights(() => commentStateRef.current),
      Placeholder.configure({ placeholder: canEdit ? "Start writing the script…" : "No script written yet." }),
      HeadingKeys,
      // Ctrl+Enter: a page break (1.23.1), for Word exports and printing (1.25.0: the script is one long page).
      PageBreak,
      // Writing suggestions (1.23.0): only where you can write.
      ...(canEdit ? [GrammarMarks] : []),
      // What the search bar found, marked for a moment (1.26.0).
      SearchHit,
      // The others in this script: their cursors (1.53.5).
      LiveCursors,
      // Words linked to a frame guide: its picture right under them (1.54.0).
      FrameLinkPictures(() => frameLookRef.current),
      // Everyone's changes as they're made (1.55.0).
      ...(liveAt ? [LiveSteps.configure({ version: liveAt.docVersion, client: clientId })] : []),
    ],
    content: openable(initialContent),
    editorProps: {
      attributes: { class: "script-doc outline-none", spellcheck: "true" },
      // Pictures inside pasted text (Word, Google Docs, Firefox): uploaded like files (1.27.5).
      transformPastedHTML: (html) => imagesRef.current.fromHtml(smallHeadingsToH3(html)),
      handlePaste: (_view, event) => {
        if (!canEdit) return false;
        const dt = event.clipboardData;
        const files = imageFiles(dt);
        const plan = pastePlan({ files: files.length, html: dt?.getData("text/html") ?? "", text: dt?.getData("text/plain") ?? "" });
        // A screenshot or a copied picture: just the picture.
        if (plan === "files") {
          imagesRef.current.insert(files);
          return true;
        }
        // Text with pictures that only came as files: the text first, then the pictures.
        if (plan === "files-after") setTimeout(() => imagesRef.current.insert(files), 0);
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !canEdit) return false;
        const files = imageFiles(event.dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        imagesRef.current.insert(files, pos);
        return true;
      },
    },
    onCreate: ({ editor }) => {
      savedJsonRef.current = JSON.stringify(normalized(editor.getJSON() as Json));
      setWords(countWords(editor.getText()));
    },
    onUpdate: ({ editor }) => {
      setWords(countWords(editor.getText()));
      if (!canEdit) return;
      // (Undo / redo can bring back a picture's device link: its real one again.)
      queueMicrotask(() => imagesRef.current.settle());
      // Live: the changes go in by themselves (use-live-edits.ts).
      if (liveMode) return;
      if (JSON.stringify(normalized(editor.getJSON() as Json)) === savedJsonRef.current) {
        // Back to exactly what's saved (e.g. undo, or a no-op edit).
        if (!inflightRef.current) {
          pendingRef.current = false;
          if (timerRef.current) clearTimeout(timerRef.current);
          setStatus((st) => (st === "conflict" ? st : "saved"));
        }
        return;
      }
      schedule();
    },
  });
  editorRef.current = editor;

  // ---- who else is here (1.53.5) ------------------------------------------------
  // The owner: "if theres any way to add the cursor thing without adding strain on aynthing, we shoiuld do it".
  // Their faces in the top bar, their cursors in the text, and when one of them saves a newer version, a word about it
  // (theirs isn't in your copy until you reload). use-live-cursors.ts says what it costs: next to nothing.
  const editsRef = useRef<{ onSteps: (m: StepsMessage) => void; onJoined: () => void; saveNow: () => Promise<boolean> } | null>(null);
  const live = useLiveCursors({
    editor,
    scriptId,
    me: me?.userId ?? null,
    people,
    onSaved: (by, version) => {
      // Live: an older page saved the whole script (its text starts again from theirs): fetched at once.
      if (liveMode) editsRef.current?.onJoined();
      else if (version > versionRef.current) setNewer(by);
    },
    onComments: onRemoteComments,
    onSteps: (m) => editsRef.current?.onSteps(m),
    onJoined: () => editsRef.current?.onJoined(),
  });
  liveRef.current = live;

  // ---- writing together, live (1.55.0) --------------------------------------------
  // The owner: "we need to make it so that two or three or however many people can write at once and the page reloads
  // quickly and updates automatically for everyone at the same time". Every change goes in as it's made, everyone
  // else's comes in as they make it (use-live-edits.ts, lib/collab.ts, 0134).
  const edits = useLiveEdits({
    editor: liveMode ? editor : null,
    scriptId,
    client: clientId,
    start: liveAt,
    canEdit,
    me: me?.userId ?? null,
    broadcast: (m) => live.sendSteps(m),
    connected: live.connected,
    textOf: docText,
    prepare: openable,
    uploading: () => imagesRef.current.pending(),
    onReplaced: () => toast.success("This document's text was replaced (sent on from the step before, say): you're seeing the new text.", { sound: false }),
    onError: (m) => toast.error(m),
  });
  editsRef.current = edits;
  const liveStuck = liveMode && (edits.status === "stale" || edits.status === "newer");
  // Stuck (the text replaced under changes of yours, or a newer ClipTroop): nothing more is typed that can't be saved.
  useEffect(() => {
    if (editor && !editor.isDestroyed && liveStuck) editor.setEditable(false);
  }, [editor, liveStuck]);
  const newerName = newer ? (people.find((p) => p.userId === newer)?.name ?? "Someone") : null;

  // ---- frame guides (1.54.0): the frames this script uses, the picker, a frame big ------------------------------
  const [frameIds, setFrameIds] = useState<string[]>([]);
  useEffect(() => {
    if (!editor) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      t = null;
      if (editor.isDestroyed) return;
      // Linked words only: their pictures need the library (a frame's picture carries its own address).
      const ids = framesInDoc(editor.getJSON() as FrameJson, "links");
      setFrameIds((old) => (old.join() === ids.join() ? old : ids));
    };
    read();
    const onUpdate = () => {
      if (!t) t = setTimeout(read, 600);
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      if (t) clearTimeout(t);
    };
  }, [editor]);
  const [picker, setPicker] = useState<{ purpose: PickPurpose; words?: string; range?: { from: number; to: number }; linkAt?: number } | null>(null);
  const [viewing, setViewing] = useState<{ id: string; ref: FrameRef | null } | null>(null);
  // A frame guide being written: its frame.
  const [draftFrame, setDraftFrame] = useState<FrameRef | null>(null);
  // The library is read only when it's needed: linked words to draw, the picker, a frame opened big.
  const frameLib = useFrameLibrary(teamId, frameIds.length > 0 || !!picker || !!viewing);
  const libVersion = useLibraryVersion(teamId);
  const look = useCallback(
    (id: string): FrameLook => {
      const f = frameById(teamId, id);
      if (f) return { id: f.id, number: f.number, title: f.title, url: f.url, thumb: f.thumb, w: f.w, h: f.h, tint: f.tint };
      return frameLib.lib && !frameLib.lib.missing ? null : undefined;
    },
    [teamId, frameLib.lib]
  );
  frameLookRef.current = { look, onOpen: (id) => setViewing({ id, ref: null }) };
  // The library arrived (or changed): the pictures under linked words, drawn again.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(frameLinkKey, true).setMeta("addToHistory", false));
  }, [editor, libVersion, frameLib.lib]);
  // A frame's picture in the text (its tag), a frame guide's card in the comments: the frame, big.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onPicture = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; ref: FrameRef | null }>).detail;
      if (d && typeof d.id === "string") setViewing({ id: d.id, ref: d.ref ?? null });
    };
    const onView = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; ref: FrameRef | null }>).detail;
      if (d && typeof d.id === "string") setViewing({ id: d.id, ref: d.ref ?? null });
    };
    dom.addEventListener(FRAME_OPEN_EVENT, onPicture);
    window.addEventListener(FRAME_VIEW_EVENT, onView);
    return () => {
      dom.removeEventListener(FRAME_OPEN_EVENT, onPicture);
      window.removeEventListener(FRAME_VIEW_EVENT, onView);
    };
  }, [editor]);
  // A frame that isn't in the library (deleted, another team's): said so.
  useEffect(() => {
    if (viewing && !viewing.ref && frameLib.lib && !frameById(teamId, viewing.id)) {
      setViewing(null);
      toast.error("That frame guide isn't in your team's Frame Guides any more.");
    }
  }, [viewing, frameLib.lib, teamId, toast]);
  const viewed: FrameGuide | null = viewing
    ? frameById(teamId, viewing.id) ??
      (viewing.ref
        ? { ...viewing.ref, collectionId: "", notes: "", creator: "", sourceUrl: null, keywords: [], categories: [], createdBy: null, createdAt: "" }
        : null)
    : null;
  /** The document as it's exported and printed: linked frames' pictures under their words, with captions. */
  const forExport = useCallback((json: Record<string, unknown>) => withFramePictures(json as FrameJson, look) as unknown as Record<string, unknown>, [look]);
  const forExportRef = useRef(forExport);
  forExportRef.current = forExport;

  // ---- printing (1.27.5): Ctrl+P prints the same plain copy as Export → PDF ----
  const printTitle = useRef("");
  printTitle.current = `#${number} ${title}`;
  useEffect(() => watchPrinting(() => ({ editor: editorRef.current, title: printTitle.current, prepare: (json) => forExportRef.current(json) })), []);

  // ---- opened from the search bar: the words found, marked and in view (1.26.0) ----
  const foundRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${scriptId}|${find ?? ""}`;
    if (!editor || editor.isDestroyed || !find || foundRef.current === key) return;
    const t = window.setTimeout(() => {
      if (editor.isDestroyed) return;
      foundRef.current = key;
      const r = findText(editor.state.doc, find);
      if (r) {
        editor.view.dispatch(editor.state.tr.setMeta(searchHitKey, r));
        try {
          const at = editor.view.domAtPos(r.from);
          const el = at.node.nodeType === Node.TEXT_NODE ? at.node.parentElement : (at.node as HTMLElement);
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {}
        window.setTimeout(() => {
          if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(searchHitKey, null));
        }, 6000);
      }
      // Done: a reload shouldn't mark it again.
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("find");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      } catch {}
    }, 250);
    return () => window.clearTimeout(t);
  }, [editor, find, scriptId]);

  // ---- writing suggestions (Grammarly style) ------------------------------------
  const grammar = useGrammar(canEdit ? editor : null, { enabled: canEdit, scriptId, teamId, me });
  const panel = useDock();
  const grammarOpen = panel === "grammar";
  // The browser's own spell check steps aside while ours is on (no double red lines), and stays off when you've turned
  // suggestions off (1.54.1: "completely": no red lines at all).
  const browserSpell = !grammar.live && grammar.settings.on;
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dom.setAttribute("spellcheck", browserSpell ? "true" : "false");
  }, [browserSpell, editor]);
  // Leaving the script closes the panel (the next page starts fresh).
  useEffect(() => () => dock.close("grammar"), []);

  // ---- links: where they go when you point at them, and the page next to the script (1.23.0) ----
  const [linkCard, setLinkCard] = useState<{ href: string; el: HTMLAnchorElement; pinned: boolean } | null>(null);
  const [linkHref, setLinkHref] = useState<string | null>(null);
  const linkOpen = !!linkHref && panel === "link";
  const linkCardRef = useRef(linkCard);
  linkCardRef.current = linkCard;
  const linkTimers = useRef<{ show?: ReturnType<typeof setTimeout>; hide?: ReturnType<typeof setTimeout> }>({});
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const t = linkTimers.current;
    const anchorOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null);
    const over = (e: MouseEvent) => {
      const a = anchorOf(e.target);
      if (!a) return;
      clearTimeout(t.hide);
      if (linkCardRef.current?.pinned) return;
      clearTimeout(t.show);
      t.show = setTimeout(() => setLinkCard({ href: a.getAttribute("href") ?? "", el: a, pinned: false }), 380);
    };
    const out = (e: MouseEvent) => {
      if (!anchorOf(e.target)) return;
      clearTimeout(t.show);
      if (linkCardRef.current?.pinned) return;
      t.hide = setTimeout(() => setLinkCard((c) => (c && !c.pinned ? null : c)), 260);
    };
    const click = (e: MouseEvent) => {
      const a = anchorOf(e.target);
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      // Never away from the script by accident: Ctrl or ⌘ + click opens a new tab, a click shows the link.
      e.preventDefault();
      clearTimeout(t.show);
      if (e.metaKey || e.ctrlKey) return openInTab(href);
      setLinkCard({ href, el: a, pinned: true });
    };
    dom.addEventListener("mouseover", over);
    dom.addEventListener("mouseout", out);
    dom.addEventListener("click", click);
    return () => {
      dom.removeEventListener("mouseover", over);
      dom.removeEventListener("mouseout", out);
      dom.removeEventListener("click", click);
      clearTimeout(t.show);
      clearTimeout(t.hide);
    };
  }, [editor]);
  // Another panel opened: the link's window closes.
  useEffect(() => {
    if (panel !== "link" && linkHref) setLinkHref(null);
  }, [panel, linkHref]);
  useEffect(() => () => dock.close("link"), []);
  const closeLinkCard = useCallback(() => setLinkCard(null), []);
  /** The link's own words in the document (to change or remove it). */
  const linkAt = (el: HTMLElement) => {
    if (!editor) return null;
    try {
      return editor.view.posAtDOM(el, 0);
    } catch {
      return null;
    }
  };

  // Selecting text shows a floating "Comment" button (even when view-only).
  const [sel, setSel] = useState<{ quote: string; occurrence: number; top: number; left: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftKind, setDraftKind] = useState<CommentKind>("comment");
  // The comment open at its words; `suggestion`: a writing suggestion on the same words (1.27.5).
  const [pop, setPop] = useState<{ id: string; top: number; left: number; suggestion?: string | null } | null>(null);
  // A writing suggestion's card asked for from a comment ("Suggestion here").
  const [grCard, setGrCard] = useState<{ id: string; n: number } | null>(null);
  // A drawing for the editing idea being written, and the studio itself.
  const [sketch, setSketch] = useState<SketchDraft | null>(null);
  const [studio, setStudio] = useState(false);
  const [sending, setSending] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [backup, setBackup] = useState<{ quote: string; occurrence: number; kind: CommentKind; text: string; scene: Scene | null; frame?: FrameRef | null } | null>(null);
  // "Copy from…" a document with comments: bring them too? (1.27.5)
  const [copyAsk, setCopyAsk] = useState<{ id: string; name: string; content: Record<string, unknown>; comments: number } | null>(null);
  const [copying, setCopying] = useState(false);
  async function finishCopy(withComments: boolean) {
    const ask = copyAsk;
    const editor = editorRef.current;
    if (!ask || !editor || copying) return;
    setCopying(true);
    editor.chain().setMeta(ANY_EDIT, true).setContent(repairDoc(ask.content), { emitUpdate: true }).run();
    // Saved first, so the comments land on text that's there.
    if (liveMode) await editsRef.current?.saveNow();
    else await flushRef.current();
    if (withComments && onCopyComments) await onCopyComments(ask.id);
    setCopying(false);
    setCopyAsk(null);
  }
  const draftRef = useRef<{ text: string | null; sketch: boolean }>({ text: null, sketch: false });
  draftRef.current = { text: draft, sketch: !!sketch };
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const f = () => setIsPhone(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  // Comments changed (or another one is active, or one is being written): redraw the highlights.
  const drafting = draft !== null;
  useEffect(() => {
    const pending: PendingMark =
      drafting && sel
        ? { quote: sel.quote, occurrence: sel.occurrence, kind: draftKind }
        : posting
          ? // 1.54.1: once it's saved (it has its id) it's on the page as itself: just a "Posted" tag for a moment.
            { quote: posting.quote, occurrence: posting.occurrence, kind: posting.kind, label: posting.id ? "Posted" : "Posting…", done: !!posting.id }
          : null;
    commentStateRef.current = { comments, active: activeCommentId, pending, onBlocked: (id) => blockedRef.current(id) };
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(commentKey, true));
  }, [comments, activeCommentId, editor, drafting, sel, draftKind, posting]);
  // The commenters' photos next to the lines they commented on (1.23.0), in
  // the page's right margin.
  const [faces, setFaces] = useState<{ top: number; list: CommentMark[] }[]>([]);
  useEffect(() => {
    if (!editor) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const paperEl = paperRef.current;
        if (!paperEl || editor.isDestroyed) return;
        const box = paperEl.getBoundingClientRect();
        const rows: { top: number; list: CommentMark[] }[] = [];
        for (const c of comments) {
          if (c.resolved) continue;
          const el = paperEl.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(c.id)}"]`);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          // Centred on the line the comment starts on; one row per line.
          const top = r.top - box.top + (r.height - 24) / 2;
          const row = rows.find((x) => Math.abs(x.top - top) < 16);
          if (row) row.list.push(c);
          else rows.push({ top, list: [c] });
        }
        setFaces(rows);
      });
    };
    measure();
    editor.on("update", measure);
    const ro = new ResizeObserver(measure);
    if (contentRef.current) ro.observe(contentRef.current);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      editor.off("update", measure);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [editor, comments, switching]);
  const openFace = (id: string, top: number) => {
    const w = paperRef.current?.clientWidth ?? 600;
    if (renderCommentPopover) setPop({ id, top: top + 32, left: Math.max(8, w - 352) });
    else onCommentClick?.(id);
  };

  // Jump to the comment picked in the list: once, as it's picked. 1.55.5: it ran again whenever the comments changed (a
  // comment or an editing idea added, someone else's coming in, the list fetched again), taking the page back to the
  // one picked earlier, up or down (the owner: "after adding an editing idea or a comment, it sometimes scrolls either
  // up or down"). One not on the page yet (the list still on its way): as soon as it is.
  const jumpedTo = useRef<string | null>(null);
  useEffect(() => {
    if (!activeCommentId) {
      jumpedTo.current = null;
      return;
    }
    if (!editor || jumpedTo.current === activeCommentId) return;
    const c = comments.find((x) => x.id === activeCommentId);
    const r = c ? findQuote(editor.state.doc, c.quote, c.occurrence) : null;
    if (!r) return;
    jumpedTo.current = activeCommentId;
    const node = editor.view.domAtPos(r.from).node as HTMLElement;
    (node.nodeType === 1 ? node : node.parentElement)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeCommentId, comments, editor]);

  useEffect(() => {
    if (!editor || !onAddComment) return;
    const update = () => {
      // Writing a comment: it stays on the text it was started on.
      if (draftRef.current.text !== null) return;
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        if (draft === null) setSel(null);
        return;
      }
      // 1.50.0: any number of lines and paragraphs (it was one paragraph only).
      const q = quoteAt(editor.state.doc, from, to);
      if (!q) return setSel(null);
      const box = paperRef.current?.getBoundingClientRect();
      const end = editor.view.coordsAtPos(to);
      if (!box) return;
      setSel({ quote: q.quote, occurrence: q.occurrence, top: end.bottom - box.top + 6, left: Math.min(end.left - box.left, (paperRef.current?.clientWidth ?? 600) - 140) });
    };
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("selectionUpdate", update);
    };
  }, [editor, onAddComment, draft]);

  // ---- writing a comment: never lost by accident ---------------------------------
  // A comment box on the last lines hangs below the page, and the page grows to hold it. 1.55.5: as it closed (posted,
  // or let go) the page got shorter at once, and if you'd scrolled down to its Send button the page jumped up. Now the
  // page keeps that room (in the same moment the box goes) until it's out of sight below.
  const composerRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLDivElement>(null);
  const [hold, setHold] = useState(0);
  const keepRoom = useCallback(() => {
    const c = composerRef.current?.getBoundingClientRect();
    const a = areaRef.current?.getBoundingClientRect();
    if (!c || !a) return;
    const over = Math.ceil(c.bottom - a.bottom);
    if (over > 0) setHold((h) => h + over + 4);
  }, []);
  useEffect(() => {
    if (!hold) return;
    const check = () => {
      const el = holdRef.current;
      if (el && el.getBoundingClientRect().top >= window.innerHeight) setHold(0);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [hold]);
  const clearDraft = useCallback(() => {
    keepRoom();
    setDraft(null);
    setSel(null);
    setDraftFrame(null);
    setSketch((sk) => {
      if (sk) URL.revokeObjectURL(sk.url);
      return null;
    });
    // (Posted or thrown away: nothing left to bring back.)
    setBackup(null);
    try {
      localStorage.removeItem(DRAFT_KEY(scriptId));
    } catch {}
  }, [scriptId, keepRoom]);
  async function requestDiscard() {
    if ((draft ?? "").trim() || sketch || (draftKind === "frame" && draftFrame)) {
      const ok = await confirm({
        title: draftKind === "edit_idea" ? "Discard this editing idea?" : draftKind === "frame" ? "Discard this frame guide?" : "Discard this comment?",
        description: sketch ? "What you wrote and your drawing will be lost." : "What you wrote will be lost.",
        confirmLabel: "Discard",
        danger: true,
      });
      if (!ok) return;
    }
    clearDraft();
  }
  async function submitDraft() {
    if (!sel || draft === null || !onAddComment || sending) return;
    if (draftKind === "frame" && !draftFrame) return setPicker({ purpose: "note", words: sel.quote });
    const was = { sel, text: draft, kind: draftKind, sketch, frame: draftKind === "frame" ? draftFrame : null };
    const body = draft;
    setSending(true);
    // It shows at once: the composer closes, the words say "Posting…" and the
    // comments list shows it loading. If it fails, everything comes back.
    onPosting?.({ quote: sel.quote, occurrence: sel.occurrence, kind: draftKind, body: body.trim() || (sketch ? "Sketch" : ""), sketchUrl: sketch?.url ?? null, frame: was.frame });
    keepRoom();
    setDraft(null);
    setSel(null);
    const restore = () => {
      setSel(was.sel);
      setDraftKind(was.kind);
      setDraftFrame(was.frame);
      setDraft(was.text);
      onPosting?.(null);
    };
    let sk: { path: string; w: number; h: number } | null = null;
    if (was.sketch) {
      // The drawing goes up first (PNG + its editable version), then the idea.
      // The server hands out signed upload links after checking you're on
      // this document's team, so storage policies can't get in the way.
      const target = await prepareSketchUpload(scriptId);
      if (target.error !== undefined) {
        setSending(false);
        restore();
        toast.error(target.error);
        return;
      }
      const bucket = createClient().storage.from("script-sketches");
      const [up] = await Promise.all([
        bucket.uploadToSignedUrl(target.png.path, target.png.token, was.sketch.blob, { contentType: "image/png", cacheControl: UPLOAD_CACHE_CONTROL }),
        target.json.token
          ? bucket.uploadToSignedUrl(target.json.path, target.json.token, new Blob([JSON.stringify(was.sketch.scene)], { type: "application/json" }), { contentType: "application/json" })
          : null,
      ]);
      if (up.error) {
        setSending(false);
        restore();
        toast.error(`Couldn't upload the drawing (${up.error.message}). Try again.`);
        return;
      }
      sk = { path: target.png.path, w: was.sketch.w, h: was.sketch.h };
    }
    const err = await onAddComment(was.sel.quote, was.sel.occurrence, body, was.kind, sk, was.frame?.id ?? null);
    setSending(false);
    if (err) {
      restore();
      toast.error(err);
    } else {
      sounds.send();
      clearDraft();
    }
  }
  // ---- a frame picked (1.54.0): a frame guide on the words, the words linked to it, or its picture in the script ----
  function onFramePicked(f: FrameGuide, how: PickHow) {
    const p = picker;
    setPicker(null);
    const ed = editorRef.current;
    if (!p || !ed || ed.isDestroyed) return;
    const ref = frameRefOf(f, frameLib.lib);
    // The frame guide being written: this frame instead.
    if (p.purpose === "note") return setDraftFrame(ref);
    const href = frameHref(f.id, window.location.origin);
    // Linked words: to this frame instead.
    if (p.purpose === "relink") {
      if (typeof p.linkAt === "number") ed.chain().focus().setTextSelection(p.linkAt).extendMarkRange("link").setLink({ href }).run();
      return;
    }
    if (how === "note") {
      if (!sel) return toast.error("Select the words again, then Frame guide.");
      setDraftKind("frame");
      setDraftFrame(ref);
      setDraft("");
      setBackup(null);
      return;
    }
    const range = p.range ?? { from: ed.state.selection.from, to: ed.state.selection.to };
    if (how === "link") {
      if (range.from === range.to) return toast.error("Select the words to link first.");
      ed.chain().focus().setTextSelection(range).setLink({ href }).setTextSelection(range.to).run();
      return;
    }
    // Its picture: under the words (or where the cursor is), like a picture put in.
    const node = { type: "image", attrs: { src: f.url, alt: f.title || `Frame #${f.number}`, align: "left", width: f.h > f.w ? 33 : 60, frame: f.id, frameN: f.number, frameTitle: f.title || null } };
    const at = blockRange(ed, range.to);
    ed.chain()
      .focus()
      .insertContentAt(at, node)
      .command(({ tr }) => {
        const img = tr.doc.nodeAt(at.from);
        if (!img || img.type.name !== "image") return true;
        const end = at.from + img.nodeSize;
        const next = tr.doc.nodeAt(end);
        if (!next || !next.isTextblock) tr.insert(end, ed.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, end + 1));
        return true;
      })
      .scrollIntoView()
      .run();
  }

  // A copy of the unsent comment on this device (a reload or a closed tab can't lose it).
  useEffect(() => {
    if (draft === null || !sel) return;
    const t = setTimeout(() => {
      try {
        const scene = sketch && JSON.stringify(sketch.scene).length < 1_500_000 ? sketch.scene : null;
        const frame = draftKind === "frame" ? draftFrame : null;
        if (!draft.trim() && !scene && !frame) return localStorage.removeItem(DRAFT_KEY(scriptId));
        localStorage.setItem(DRAFT_KEY(scriptId), JSON.stringify({ quote: sel.quote, occurrence: sel.occurrence, kind: draftKind, text: draft, scene, frame, at: Date.now() }));
      } catch {
        /* full or private: the warnings still protect it */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft, draftKind, sel, sketch, scriptId, draftFrame]);
  // Found one from last time? Offer it back: once, when the script opens
  // (1.23.2: it looked again every time the page around it redrew, so it
  // found the comment being written, or one just posted or drawn, and kept
  // offering it back).
  const backupChecked = useRef<string | null>(null);
  const canComment = !!onAddComment;
  useEffect(() => {
    if (!editor || !canComment || backupChecked.current === scriptId) return;
    backupChecked.current = scriptId;
    // (Already writing one: that's the one in the copy.)
    if (draftRef.current.text !== null) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY(scriptId));
      if (!raw) return;
      const b = JSON.parse(raw);
      if (Date.now() - (b.at ?? 0) > 14 * 86_400_000 || !findQuote(editor.state.doc, b.quote, b.occurrence)) return localStorage.removeItem(DRAFT_KEY(scriptId));
      const frame = b.kind === "frame" && b.frame && typeof b.frame.id === "string" && typeof b.frame.url === "string" ? (b.frame as FrameRef) : null;
      setBackup({ quote: b.quote, occurrence: b.occurrence ?? 0, kind: b.kind === "edit_idea" ? "edit_idea" : frame ? "frame" : "comment", text: String(b.text ?? ""), scene: b.scene ?? null, frame });
    } catch {}
  }, [editor, canComment, scriptId]);
  async function restoreBackup() {
    const b = backup;
    if (!b || !editor) return;
    setBackup(null);
    const r = findQuote(editor.state.doc, b.quote, b.occurrence);
    if (!r) return toast.error("That text has changed since.");
    editor.chain().setTextSelection(r).scrollIntoView().run();
    // The selection listener places the composer; then fill it in.
    requestAnimationFrame(async () => {
      setDraftKind(b.kind);
      setDraftFrame(b.kind === "frame" ? b.frame ?? null : null);
      setDraft(b.text);
      if (b.scene?.els?.length) {
        const { exportPng } = await import("../sketch/engine");
        const png = await exportPng(b.scene.els, 1600, b.scene.paper === "dark" ? "dark" : "light");
        if (png) setSketch({ scene: b.scene, ...png, url: URL.createObjectURL(png.blob) });
      }
    });
  }

  // Asked to save now (1.54.1: before it's handed on, so the next step gets the last words and pictures): saved, then
  // the answer. Pictures still uploading are waited for.
  useEffect(() => {
    const onSaveNow = (e: Event) => {
      const d = (e as CustomEvent<SaveNow>).detail;
      if (!d || d.scriptId !== scriptId || !canEdit) return;
      d.claim();
      // Live: everything in, and the text saved at the version now.
      if (liveMode) {
        void (editsRef.current?.saveNow() ?? Promise.resolve(false)).then((ok) => d.done(ok));
        return;
      }
      void (async () => {
        const until = Date.now() + 15_000;
        while (Date.now() < until) {
          if (statusRef.current === "conflict") return d.done(false);
          if (!pendingRef.current && !inflightRef.current && !imagesRef.current.pending()) return d.done(statusRef.current !== "error");
          if (pendingRef.current && !inflightRef.current) void flushRef.current();
          await new Promise((r) => setTimeout(r, 150));
        }
        d.done(false);
      })();
    };
    window.addEventListener(SAVE_NOW_EVENT, onSaveNow);
    return () => window.removeEventListener(SAVE_NOW_EVENT, onSaveNow);
  }, [scriptId, canEdit, liveMode]);

  // Save shortcut, unsaved-changes warning, and a final save when leaving.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (editsRef.current && liveModeRef.current) void editsRef.current.saveNow();
        else void flushRef.current();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (pendingRef.current || inflightRef.current || draftRef.current.text?.trim() || draftRef.current.sketch) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
      if (pendingRef.current) void flushRef.current();
    };
  }, []);

  /** How wide the paper is, in pixels (the popovers stay on it). */
  const frameW = () => paperRef.current?.clientWidth ?? 600;

  // A change to a comment's words was turned down (1.55.0, anchors.ts): its words give a little shake, and a word says
  // why, with the comment one click away (to resolve or delete it). Once every few seconds, not on every key.
  const blockedAt = useRef(0);
  const openComment = (id: string) => {
    const el = paperRef.current?.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(id)}"]`);
    const box = paperRef.current?.getBoundingClientRect();
    if (el && box && renderCommentPopover) {
      const r = el.getBoundingClientRect();
      setPop({ id, top: r.bottom - box.top + 6, left: Math.max(8, Math.min(r.left - box.left, frameW() - 348)), suggestion: null });
    } else onCommentClick?.(id);
  };
  blockedRef.current = (id: string) => {
    const spans = paperRef.current?.querySelectorAll<HTMLElement>(`[data-comment-id="${CSS.escape(id)}"]`) ?? [];
    spans.forEach((sp) => {
      sp.classList.remove("is-locked");
      void sp.offsetWidth;
      sp.classList.add("is-locked");
      setTimeout(() => sp.classList.remove("is-locked"), 650);
    });
    const now = Date.now();
    if (now - blockedAt.current < 3000) return;
    blockedAt.current = now;
    const c = commentStateRef.current.comments.find((x) => x.id === id);
    const what = c?.kind === "edit_idea" ? "an editing idea" : c?.kind === "frame" ? "a frame guide" : "a comment";
    toast.error(`These words have ${what} on them. Resolve or delete it first, then change them.`, { action: { label: "Show it", onClick: () => openComment(id) }, sound: false });
  };

  const remember = (key: string, v: string) => {
    try {
      localStorage.setItem(key, v);
    } catch {
      /* ignore */
    }
  };
  function chooseWidth(v: Width) {
    setWidth(v);
    remember(WIDTH_KEY, v);
    // The side-by-side page follows.
    window.dispatchEvent(new CustomEvent("vp-width", { detail: v }));
  }

  function togglePaper() {
    const next = paper === "light" ? "dark" : "light";
    setPaper(next);
    // The side-by-side page follows.
    window.dispatchEvent(new CustomEvent("vp-paper", { detail: next }));
    try {
      localStorage.setItem(PAPER_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const empty = useEditorState({
    editor,
    selector: (s) => {
      if (!s.editor) return true;
      let image = false;
      s.editor.state.doc.descendants((n) => {
        if (n.type.name === "scriptImage" || n.type.name === "image") image = true;
        return !image;
      });
      return !image && s.editor.state.doc.textContent.trim() === "";
    },
  });

  // The header's size (1.23.1): it stays on screen as you scroll, so the link
  // window and a page scrolled to sit under it.
  const headRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef<HTMLDivElement>(null);
  // (w: the bar's width, 1.55.2; as the page opens, as wide as most screens: then it fits itself.)
  const [head, setHead] = useState({ h: 0, tool: 0, phone: false, w: 1600, docs: 100 });
  const docsRef = useRef<HTMLDivElement>(null);
  const hasTools = canEdit && !!editor;
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 640px)");
    const measure = () => {
      const h = el.offsetHeight;
      const tool = toolRef.current?.offsetHeight ?? 0;
      const phone = !mq.matches;
      const w = Math.round(el.offsetWidth);
      const docs = Math.round(docsRef.current?.offsetWidth || 100);
      setHead((x) => (x.h === h && x.tool === tool && x.phone === phone && x.w === w && x.docs === docs ? x : { h, tool, phone, w, docs }));
      document.documentElement.style.setProperty("--script-head-bottom", phone ? `${APP_BAR + tool}px` : `calc(${UNDER_BAR} + ${h}px)`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (toolRef.current) ro.observe(toolRef.current);
    if (docsRef.current) ro.observe(docsRef.current);
    mq.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
      document.documentElement.style.removeProperty("--script-head-bottom");
    };
  }, [hasTools]);
  // Phones: only the formatting bar stays (the rest slides up under the app's bar, which is drawn above it).
  // (Relative, not static, when it scrolls away: its glass layer is drawn inside it.)
  const headStyle: React.CSSProperties = head.phone
    ? hasTools
      ? { top: APP_BAR - Math.max(0, head.h - head.tool), zIndex: 15 }
      : { position: "relative" }
    : { top: UNDER_BAR, zIndex: 15 };

  const statusText: Record<Status, string> = {
    saved: "Saved",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    error: "Not saved. Press Ctrl+S to retry.",
    conflict: "Someone else saved a newer version.",
  };
  const statusShort: Record<Status, string> = { saved: "Saved", unsaved: "Unsaved", saving: "Saving…", error: "Not saved", conflict: "Not saved" };

  // What the one bar holds at its width (1.55.2).
  const others = live.here.length;
  const room = barRoom(head.w, { faces: others ? 34 + 20 * (Math.min(others, 3) - 1) + (others > 3 ? 20 : 0) : 0, flow: !!barFlow, docs: head.docs });

  // The save state, as a sign (1.55.2): a cloud with a tick, one on its way, a dot for changes not saved yet; in words
  // only when something needs you (offline, not saved, reload). The whole sentence: its tooltip, and read out.
  const save: { text: string; short: string; sign: "saved" | "saving" | "unsaved" | "bad" | "reload" | "quiet"; reload?: string } =
    canEdit && liveMode
      ? liveStuck
        ? {
            text: LIVE_TEXT[edits.status],
            short: "Reload",
            sign: "reload",
            reload: edits.status === "newer" ? "ClipTroop was updated while this page was open. Reload to keep writing." : "This document's text was replaced while you were writing. Reload to keep writing.",
          }
        : {
            text: LIVE_TEXT[edits.status],
            short: edits.status === "offline" ? "Offline" : LIVE_TEXT[edits.status],
            sign: edits.status === "saved" ? "saved" : edits.status === "offline" ? "bad" : edits.status === "readonly" ? "quiet" : "saving",
          }
      : canEdit
        ? {
            text: statusText[status],
            short: statusShort[status],
            sign: status === "error" || status === "conflict" ? "bad" : status === "saved" ? "saved" : status === "saving" ? "saving" : "unsaved",
          }
        : { text: "View only", short: "View only", sign: "quiet" };
  const saveMark =
    save.sign === "reload" ? (
      <button
        type="button"
        onClick={() => window.location.reload()}
        title={save.reload}
        className="inline-flex items-center gap-1.5 rounded-full bg-red/10 text-red pl-2 pr-2.5 h-7 text-[12px] font-semibold hover:bg-red/15 flex-shrink-0"
      >
        <RetryIcon className="w-3.5 h-3.5" />
        {save.short}
      </button>
    ) : save.sign === "bad" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red/10 text-red pl-2 pr-2.5 h-7 text-[12px] font-semibold whitespace-nowrap flex-shrink-0" title={save.text}>
        <CloudOffIcon className="w-4 h-4" />
        {save.short}
      </span>
    ) : save.sign === "quiet" ? (
      <span className="px-1.5 text-[12px] font-semibold text-ink-soft whitespace-nowrap flex-shrink-0">{save.text}</span>
    ) : (
      <span className="w-8 h-8 flex items-center justify-center flex-shrink-0" title={save.text} role="img" aria-label={save.text}>
        {save.sign === "saved" ? (
          <CloudCheckIcon className="w-[18px] h-[18px] text-green" />
        ) : save.sign === "saving" ? (
          <CloudUpIcon className="w-[18px] h-[18px] text-ink-soft animate-pulse" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-amber" />
        )}
      </span>
    );
  const hereFaces = <LiveFaces here={live.here} people={people} onJump={live.jumpTo} />;
  const BarSep = () => <span className="w-px h-5 bg-line/15 mx-1 flex-shrink-0" aria-hidden />;
  const exportDocx = async () => {
    if (!editor) return;
    toast.success("Preparing the Word file…");
    // The Word library is big: load it only when someone exports.
    const { exportScriptDocx } = await import("../lib/export-docx");
    await exportScriptDocx(forExport(editor.getJSON() as Record<string, unknown>) as never, `#${number} ${title}`, safeFileName(`${number}-${title}`, "").replace(/\.$/, ""));
  };
  const exportPdf = () => editor && void printScript(editor, `#${number} ${title}`, forExport);

  // The one bar's ends (bigger screens): the way back and the documents; who's here, the save state, the words, the
  // page's buttons, and the step's.
  const barLead = (
    <div className="hidden sm:flex items-center gap-1 flex-shrink-0 min-w-0 pl-2 lg:pl-3">
      <Link
        href={backHref}
        aria-label={backLabel}
        title={`${backLabel}: #${number} ${title}`}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0"
      >
        <ArrowLeftIcon className="w-4 h-4" />
      </Link>
      {mobileDocs ? (
        <div ref={docsRef} className="flex-shrink-0">
          {mobileDocs}
        </div>
      ) : docName ? (
        <span className="rounded-md bg-surface-2 px-2 py-1 text-[12px] font-bold text-ink-soft flex-shrink-0">{docName}</span>
      ) : null}
      {room.title && (
        <span className="min-w-0 max-w-[16rem] truncate pl-1.5 text-[12.5px] font-semibold text-ink-soft" title={`#${number} ${title}`}>
          <span className="font-mono text-ink-faint mr-1">#{number}</span>
          {title}
        </span>
      )}
    </div>
  );
  const barTail = (
    <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0 pl-1 pr-2 lg:pr-3">
      {hereFaces}
      {newerName && status !== "conflict" && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          title={`${newerName} saved changes to this script. Reload to see them (anything you haven't saved yet can't be saved over theirs).`}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue/10 text-blue pl-2 pr-2.5 h-7 text-[12px] font-semibold hover:bg-blue/15 flex-shrink-0"
        >
          <RetryIcon className="w-3.5 h-3.5" />
          {newerName}
        </button>
      )}
      {saveMark}
      <span className="sr-only" aria-live="polite">
        {save.text}
      </span>
      {room.words && (
        <span className="px-1.5 text-[12px] text-ink-soft tabular-nums whitespace-nowrap flex-shrink-0" title={`${words} words · about ${spokenLength(words)} to say`}>
          {words.toLocaleString("en-US")} words · {spokenLength(words)}
        </span>
      )}
      <BarSep />
      {room.tools && <WidthMenu value={width} onChange={chooseWidth} />}
      {topBarExtra}
      {room.tools ? (
        <>
          <button
            type="button"
            onClick={togglePaper}
            aria-label={paper === "light" ? "Dark paper" : "Light paper"}
            title={paper === "light" ? "Dark paper" : "Light paper"}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0"
          >
            {paper === "light" ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
          </button>
          <ExportMenu onDocx={exportDocx} onPdf={exportPdf} />
        </>
      ) : (
        <MobileMenu className="" label="Page" paper={paper} onPaper={togglePaper} width={width} onWidth={chooseWidth} onDocx={exportDocx} onPdf={exportPdf} />
      )}
      {barFlow && (
        <>
          <BarSep />
          {barFlow({ labels: room.flowLabels })}
        </>
      )}
    </div>
  );

  return (
    <div className="script-print-root min-h-[calc(100dvh-3.5rem)] flex flex-col">
      {/* The header stays while you scroll (1.23.1), under the app's own bar. 1.53.1: with the glass look on, one pane of
          glass like the app's bars (globals.css, [data-script-head]; 1.55.1: hanging from the floating bar as one card);
          data-paper tells it which paper goes under it.
          1.55.2: on a bigger screen it's one bar: the way back and the documents, the formatting, then who's here, the
          save state, the words, the page's buttons and the step's (the owner: "get rid of that part completely, make
          icons basically"). Phones keep the title and the steps above the formatting bar; those slide up under the
          app's bar, the formatting bar stays (headStyle). */}
      <div ref={headRef} data-script-head="" data-paper={paper} className="no-print sticky isolate bg-paper" style={headStyle}>
        <div className="sm:hidden">
          <div data-head-row="" className="flex items-center gap-2 px-3 h-12 border-b border-line/10">
            <Link href={backHref} aria-label={backLabel} className="w-8 h-8 -ml-1 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink flex-shrink-0">
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
              <span className="font-mono text-ink-soft mr-1.5">#{number}</span>
              {title}
            </div>
            {mobileDocs ? <div className="flex-shrink-0">{mobileDocs}</div> : null}
            {!canEdit && <span className="text-[12px] font-semibold text-ink-soft flex-shrink-0">View only</span>}
            <MobileMenu paper={paper} onPaper={togglePaper} onDocx={exportDocx} onPdf={exportPdf} />
          </div>
          {subBar}
        </div>
        <div ref={toolRef} data-head-row="" className={`${hasTools ? "flex" : "hidden sm:flex"} items-center min-h-12 border-b border-line/10 bg-paper`}>
          {barLead}
          {canEdit && editor ? (
            <Toolbar
              editor={editor}
              room={head.phone ? null : room}
              onImage={() => fileRef.current?.click()}
              onFrame={() => {
                const { from, to, empty } = editor.state.selection;
                const q = empty ? null : quoteAt(editor.state.doc, from, to);
                setPicker(q ? { purpose: "words", words: q.quote, range: { from, to } } : { purpose: "insert", range: { from, to } });
              }}
              uploading={uploading}
              grammar={grammar}
              grammarOpen={grammarOpen}
              onGrammar={() => (grammarOpen ? dock.close("grammar") : dock.open("grammar"))}
            />
          ) : (
            <span className="flex-1" />
          )}
          {barTail}
        </div>
      </div>

      {liveStuck && (
        <div className="no-print mx-auto mt-4 w-full max-w-3xl px-4">
          <div className="rounded-xl border border-amber/40 bg-amber/[0.06] px-4 py-3 flex items-center gap-3 flex-wrap">
            <p className="text-[13.5px] text-ink flex-1 min-w-[200px]">
              {edits.status === "newer"
                ? "ClipTroop was updated while this page was open. Reload to keep writing with everyone."
                : "This document’s text was replaced while you were writing (sent on from the step before, say), so your last changes can’t go on top of it. Copy anything you need, then reload."}
            </p>
            <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px]">
              Reload
            </button>
          </div>
        </div>
      )}

      {status === "conflict" && (
        <div className="no-print mx-auto mt-4 w-full max-w-3xl px-4">
          <div className="rounded-xl border border-amber/40 bg-amber/[0.06] px-4 py-3 flex items-center gap-3 flex-wrap">
            <p className="text-[13.5px] text-ink flex-1 min-w-[200px]">
              Someone else saved this script while you were editing. Reload to see their version. Your last
              changes weren&rsquo;t saved, so copy anything you need first.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px]"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) images.insert(files);
        }}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      {/* 1.55.4: no documents column on the left any more (the documents dropdown has them all: the owner, "its
          redundant at this point"). */}
      {/* Paper */}
      <div
        ref={areaRef}
        className={`relative flex-1 min-w-0 px-3 sm:px-8 py-6 sm:py-10 ${sideBySide ? "lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start" : ""} ${linkOpen ? "lg:pr-[calc(min(46vw,760px)+2rem)]" : ""}`}
      >
        <div className="min-w-0">
        {sideBySide && <div className="hidden lg:flex h-8 mb-2 items-center text-[12px] font-bold uppercase tracking-wide text-ink-soft">{docName ?? "Script"}</div>}
        <div
          ref={paperRef}
          data-paper={paper}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            // Inside the open comment's own box: it handles its clicks.
            if (target.closest("[data-comment-pop]")) return;
            const el = target.closest<HTMLElement>("[data-comment-id]");
            let id = el?.dataset.commentId;
            // 1.54.1: else by where the click landed in the text (the element under the pointer can be redrawn between
            // press and release: a suggestion's underline, someone else's cursor), so a comment's words always open it.
            if (!id && editor && !editor.isDestroyed && target.closest(".ProseMirror") && !target.closest(".frame-below, .script-image")) {
              const hit = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
              id = (hit && commentAt(editor.state.doc, commentStateRef.current.comments, hit.pos)) ?? undefined;
            }
            // No comment here: a writing suggestion (if any) opens its own card (GrammarLayer).
            if (!id) return setPop(null);
            // A comment wins (1.27.5): it opens right where you clicked; a suggestion on the
            // same words is one click away ("Suggestion here"), never taken by accident.
            const gr = target.closest<HTMLElement>("[data-gr], [data-gr-wide]");
            const suggestion = gr ? (gr.dataset.gr ?? gr.dataset.grWide ?? null) : null;
            const box = paperRef.current?.getBoundingClientRect();
            const r = el ? el.getBoundingClientRect() : { bottom: e.clientY + 10, left: e.clientX - 24 };
            if (box && renderCommentPopover) {
              setPop({ id, top: r.bottom - box.top + 6, left: Math.max(8, Math.min(r.left - box.left, frameW() - 348)), suggestion });
            } else onCommentClick?.(id);
          }}
          className={`script-paper relative isolate transition-colors mx-auto w-full ${STRIP_W[width]} rounded-2xl px-5 sm:px-14 py-8 sm:py-14 border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)]`}
        >
          {switching && <PaperLines />}
          {canEdit && empty && !switching && (
            <div className="no-print mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 script-soft-border">
              {/* Phones: the text on its own line, the buttons underneath. */}
              <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0">
                <DocumentIcon className="w-5 h-5 script-soft flex-shrink-0 mt-0.5 sm:mt-0" />
                <p className="text-[13px] script-soft leading-snug">Start from a Hook, Body and Call to action outline?</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => editor?.chain().setMeta(ANY_EDIT, true).setContent(SCRIPT_TEMPLATE, { emitUpdate: true }).run()}
                className="rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] whitespace-nowrap"
              >
                Use template
              </button>
              {onCopyFrom && copySources.length > 0 && (
                <Select
                  value={null}
                  variant="pill"
                  className="!h-8 !border-solid !border-[rgb(var(--sp-line)/0.25)] !text-[rgb(var(--sp-soft))] hover:!text-[rgb(var(--sp-ink))]"
                  renderValue={() => <span className="truncate">Copy from…</span>}
                  placeholder="Copy from…"
                  ariaLabel="Copy from another document"
                  options={copySources.map((d) => ({ value: d.id, label: d.name }))}
                  onChange={async (id) => {
                    if (!id) return;
                    const got = await onCopyFrom(id);
                    if (!got || !editor) return;
                    // It has comments: bring them too? (1.27.5)
                    if (got.comments > 0 && onCopyComments) {
                      setCopyAsk({ id, name: copySources.find((d) => d.id === id)?.name ?? "that document", content: got.content, comments: got.comments });
                      return;
                    }
                    editor.chain().setMeta(ANY_EDIT, true).setContent(repairDoc(got.content), { emitUpdate: true }).run();
                  }}
                />
              )}
              </div>
            </div>
          )}
          {/* Hidden, not removed, while another document loads (the editor keeps its place). */}
          <div ref={contentRef} className={switching ? "hidden" : undefined}>
            <EditorContent editor={editor} />
          </div>
          {faces.length > 0 && !switching && (
            <div className="no-print hidden sm:block">
              {faces.map((row) => (
                <div key={row.list[0].id} className="absolute z-20 flex -space-x-2 right-2 lg:right-3" style={{ top: row.top }}>
                  {row.list.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFace(c.id, row.top);
                      }}
                      title={`${c.author?.name ?? "Someone"}: ${c.kind === "edit_idea" ? "editing idea" : c.kind === "frame" ? "frame guide" : "comment"}`}
                      aria-label={`${c.kind === "edit_idea" ? "Editing idea" : c.kind === "frame" ? "Frame guide" : "Comment"} by ${c.author?.name ?? "someone"}`}
                      className="relative rounded-full transition-transform hover:z-10 hover:scale-110"
                      style={{ boxShadow: `0 0 0 2px rgb(var(--sp-bg)), 0 0 0 3.5px ${KIND_COLOR[c.kind ?? "comment"]}` }}
                    >
                      <PersonAvatar name={c.author?.name ?? "?"} avatarUrl={c.author?.avatarUrl ?? null} color={c.author?.color ?? "#888"} className="w-6 h-6 text-[9.5px]" />
                    </button>
                  ))}
                  {row.list.length > 3 && (
                    <span className="relative w-6 h-6 rounded-full bg-surface-2 text-ink text-[10px] font-bold flex items-center justify-center" style={{ boxShadow: "0 0 0 2px rgb(var(--sp-bg))" }}>
                      +{row.list.length - 3}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {pop && renderCommentPopover && (
            <div data-comment-pop="" className="no-print absolute z-30 w-[340px] max-w-[calc(100%-16px)]" style={{ top: pop.top, left: pop.left }}>
              {renderCommentPopover(pop.id, () => setPop(null))}
              <SuggestionHere
                s={pop.suggestion ? grammar.items.find((x) => x.id === pop.suggestion) ?? null : null}
                onOpen={(id) => {
                  setPop(null);
                  setGrCard((c) => ({ id, n: (c?.n ?? 0) + 1 }));
                }}
              />
            </div>
          )}
          {sel && onAddComment && draft === null && !picker && (
            <Leaves>
              <div className="no-print absolute z-30" style={{ top: sel.top, left: Math.max(8, Math.min(sel.left, frameW() - (isPhone ? 262 : 372))) }}>
                {/* 1.50.0: the app's own colours (text-ink: on the white page the words went dark on a dark box), the kind's colour on its icon. */}
                <div className="pop-menu origin-top-left flex items-center gap-0.5 rounded-xl bg-surface text-ink border border-line/15 shadow-[0_14px_36px_-12px_rgb(0_0_0/0.45)] p-1">
                  {([
                    ["comment", "Comment", "Comment"],
                    ["edit_idea", "Editing idea", "Idea"],
                    ["frame", "Frame guide", "Frame"],
                  ] as const).map(([k, label, short]) => (
                    <button
                      key={k}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        // 1.54.0: a frame guide starts with its frame (the picker: a frame guide on the words, the
                        // words linked to it, or its picture under them).
                        if (k === "frame") {
                          const ed = editorRef.current;
                          if (!ed) return;
                          setPicker({ purpose: "words", words: sel.quote, range: { from: ed.state.selection.from, to: ed.state.selection.to } });
                          return;
                        }
                        setDraftKind(k);
                        setDraft("");
                        // (A new one takes the old one's place in the copy kept on this device.)
                        setBackup(null);
                      }}
                      title={k === "frame" ? "A reference frame for these words, from Frame Guides" : undefined}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 sm:h-8 text-[12.5px] font-semibold whitespace-nowrap text-ink hover:bg-surface-2 transition-colors"
                    >
                      <span className="inline-flex" style={{ color: KIND_COLOR[k] }} aria-hidden>
                        {k === "edit_idea" ? <ScissorsIcon className="w-3.5 h-3.5" /> : k === "frame" ? <FrameIcon className="w-3.5 h-3.5" /> : <CommentIcon className="w-3.5 h-3.5" />}
                      </span>
                      <span className="sm:hidden">{short}</span>
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                  {/* Several lines: say how many, so it's clear what the comment covers. */}
                  {/[\n\u0000\uFFFC]/.test(sel.quote) && <span className="pl-1.5 pr-2 text-[11.5px] text-ink-faint whitespace-nowrap">{sel.quote.split(/[\n\u0000\uFFFC]/).length} lines</span>}
                </div>
              </div>
            </Leaves>
          )}
          {sel && onAddComment && draft !== null && !isPhone && (
            <Leaves>
              <div ref={composerRef} className="no-print absolute z-30" style={{ top: sel.top, left: Math.max(8, Math.min(sel.left, frameW() - 348)) }}>
                <CommentComposer
                  kind={draftKind}
                  quote={sel.quote}
                  people={people}
                  roleColors={roleColors}
                  text={draft}
                  setText={setDraft}
                  sketchUrl={sketch?.url ?? null}
                  onDraw={draftKind === "edit_idea" ? () => setStudio(true) : undefined}
                  onRemoveSketch={() => setSketch(null)}
                  frame={draftKind === "frame" ? draftFrame : null}
                  onPickFrame={draftKind === "frame" ? () => setPicker({ purpose: "note", words: sel.quote }) : undefined}
                  onOpenFrame={draftFrame ? () => setViewing({ id: draftFrame.id, ref: draftFrame }) : undefined}
                  busy={sending}
                  onSubmit={() => void submitDraft()}
                  onCancel={() => void requestDiscard()}
                  variant="popover"
                />
              </div>
            </Leaves>
          )}
        </div>
        <p className="no-print mx-auto max-w-3xl mt-3 px-1 text-[11.5px] text-ink-soft md:hidden">
          {words} words · about {spokenLength(words)}
        </p>
        {lastEdited && <p className="no-print mx-auto max-w-3xl mt-1 px-1 text-[11.5px] text-ink-soft">{lastEdited}</p>}
        {/* The room a comment box hung into, kept until it's out of sight (1.55.5). */}
        {hold > 0 && <div ref={holdRef} aria-hidden className="no-print" style={{ height: hold }} />}
      </div>
      {sideBySide && <div className="hidden lg:block min-w-0">{sideBySide}</div>}
      </div>
      {rightPanel}
      {/* Phones: the comment being written is a sheet at the bottom. */}
      {sel && onAddComment && draft !== null && isPhone &&
        createPortal(
          <Leaves>
            <div className="no-print fixed inset-x-0 bottom-0 z-[95] rounded-t-2xl border-t border-line/15 bg-surface shadow-[0_-20px_50px_-20px_rgb(0_0_0/0.45)] pop-sheet">
              <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-line/20" aria-hidden />
              <CommentComposer
                kind={draftKind}
                quote={sel.quote}
                people={people}
                roleColors={roleColors}
                text={draft}
                setText={setDraft}
                sketchUrl={sketch?.url ?? null}
                onDraw={draftKind === "edit_idea" ? () => setStudio(true) : undefined}
                onRemoveSketch={() => setSketch(null)}
                frame={draftKind === "frame" ? draftFrame : null}
                onPickFrame={draftKind === "frame" ? () => setPicker({ purpose: "note", words: sel.quote }) : undefined}
                onOpenFrame={draftFrame ? () => setViewing({ id: draftFrame.id, ref: draftFrame }) : undefined}
                busy={sending}
                onSubmit={() => void submitDraft()}
                onCancel={() => void requestDiscard()}
                variant="sheet"
              />
            </div>
          </Leaves>,
          document.body
        )}
      <Dialog
        open={!!copyAsk}
        onClose={() => !copying && setCopyAsk(null)}
        title={`Copy ${copyAsk?.name ?? "it"} here?`}
        description={copyAsk ? `It has ${copyAsk.comments === 1 ? "an open comment or editing idea" : `${copyAsk.comments} open comments and editing ideas`}. Bring ${copyAsk.comments === 1 ? "it" : "them"} too? ${copyAsk.comments === 1 ? "It stays" : "They stay"} on the same words, with who wrote ${copyAsk.comments === 1 ? "it" : "them"}.` : undefined}
        footer={
          <>
            <button type="button" disabled={copying} onClick={() => setCopyAsk(null)} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={copying} onClick={() => void finishCopy(false)} className="rounded-lg border border-line/20 px-3.5 h-10 text-[13.5px] font-semibold text-ink hover:border-line/40 disabled:opacity-50">
              Just the text
            </button>
            <button type="button" data-autofocus disabled={copying} onClick={() => void finishCopy(true)} className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-60">
              {copying && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
              Text and comments
            </button>
          </>
        }
      >
        <p className="text-[13px] text-ink-soft">Resolved ones come along as resolved, and drawings on editing ideas are copied with them.</p>
      </Dialog>
      <GrammarLayer
        editor={editor}
        g={grammar}
        // Words with a comment open the comment (1.27.5): their suggestion is a button on it.
        skipInside={renderCommentPopover || onCommentClick ? "[data-comment-id]" : undefined}
        request={grCard}
        open={grammarOpen}
        onOpen={() => dock.open("grammar")}
        onClose={() => dock.close("grammar")}
        fab={!panel || panel === "grammar"}
      />
      {/* 1.54.0: words linked to a frame guide show the frame instead of where the link goes. */}
      {linkCard && editor && frameIdOfHref(linkCard.href) && (
        <FrameLinkCard
          look={look(frameIdOfHref(linkCard.href)!)}
          anchor={linkCard.el}
          pinned={linkCard.pinned}
          canEdit={canEdit}
          onEnter={() => clearTimeout(linkTimers.current.hide)}
          onLeave={() => {
            if (linkCard.pinned) return;
            linkTimers.current.hide = setTimeout(() => setLinkCard((c) => (c && !c.pinned ? null : c)), 260);
          }}
          onClose={closeLinkCard}
          onOpen={() => {
            const id = frameIdOfHref(linkCard.href);
            setLinkCard(null);
            if (id) setViewing({ id, ref: null });
          }}
          onChange={() => {
            const pos = linkAt(linkCard.el);
            setLinkCard(null);
            if (pos !== null) setPicker({ purpose: "relink", linkAt: pos, words: linkCard.el.textContent ?? undefined });
          }}
          onRemove={() => {
            const pos = linkAt(linkCard.el);
            setLinkCard(null);
            if (pos === null) return;
            editor.chain().focus().setTextSelection(pos).extendMarkRange("link").unsetLink().run();
          }}
        />
      )}
      {linkCard && editor && !frameIdOfHref(linkCard.href) && (
        <LinkCard
          href={linkCard.href}
          anchor={linkCard.el}
          pinned={linkCard.pinned}
          canEdit={canEdit}
          onEnter={() => clearTimeout(linkTimers.current.hide)}
          onLeave={() => {
            if (linkCard.pinned) return;
            linkTimers.current.hide = setTimeout(() => setLinkCard((c) => (c && !c.pinned ? null : c)), 260);
          }}
          onClose={closeLinkCard}
          onOpenHere={() => {
            setLinkCard(null);
            setLinkHref(linkCard.href);
            dock.open("link");
          }}
          onChange={(href) => {
            const pos = linkAt(linkCard.el);
            setLinkCard(null);
            if (pos === null) return;
            editor.chain().focus().setTextSelection(pos).extendMarkRange("link").setLink({ href }).run();
          }}
          onRemove={() => {
            const pos = linkAt(linkCard.el);
            setLinkCard(null);
            if (pos === null) return;
            editor.chain().focus().setTextSelection(pos).extendMarkRange("link").unsetLink().run();
          }}
          onCopied={() => toast.success("Link copied.")}
        />
      )}
      {linkOpen && (
        <LinkWindow
          href={linkHref!}
          onClose={() => {
            setLinkHref(null);
            dock.close("link");
          }}
        />
      )}
      {picker && (
        <FramePicker
          teamId={teamId}
          purpose={picker.purpose}
          words={picker.words}
          canEdit={canEdit}
          canNote={!!onAddComment}
          onPick={onFramePicked}
          onClose={() => setPicker(null)}
        />
      )}
      {viewed && (
        <FrameViewer
          f={viewed}
          lib={frameLib.lib}
          onClose={() => setViewing(null)}
        />
      )}
      {studio && (
        <SketchStudio
          initial={sketch?.scene ?? null}
          onCancel={() => setStudio(false)}
          onConfirm={(r) => {
            setSketch((old) => {
              if (old) URL.revokeObjectURL(old.url);
              return { ...r, url: URL.createObjectURL(r.blob) };
            });
            setStudio(false);
          }}
        />
      )}
      {backup && draft === null && (
        <div className="no-print fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:bottom-6 w-[min(30rem,calc(100vw-1.5rem))] rounded-2xl border bg-surface shadow-2xl px-4 py-3 flex items-center gap-3 animate-[toastin_.25s_ease]" style={{ borderColor: `color-mix(in srgb, ${KIND_COLOR[backup.kind]} 45%, transparent)` }}>
          <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: KIND_COLOR[backup.kind] }} />
          <p className="flex-1 min-w-0 text-[13px]">
            You have an unsent {backup.kind === "edit_idea" ? "editing idea" : backup.kind === "frame" ? "frame guide" : "comment"} on <span className="font-semibold">“{backup.quote.slice(0, 40)}{backup.quote.length > 40 ? "…" : ""}”</span>.
          </p>
          <button type="button" onClick={() => void restoreBackup()} className="rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px] flex-shrink-0">
            Restore
          </button>
          <button
            type="button"
            onClick={() => {
              setBackup(null);
              try {
                localStorage.removeItem(DRAFT_KEY(scriptId));
              } catch {}
            }}
            className="rounded-lg px-2 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink flex-shrink-0"
          >
            Discard
          </button>
        </div>
      )}
      </div>
    </div>
  );
}



// ---------------------------------------------------------------------------

function Toolbar({
  editor,
  onImage,
  onFrame,
  uploading,
  grammar,
  grammarOpen,
  onGrammar,
  room,
}: {
  editor: Editor;
  /** 1.55.2: what the one bar holds (barRoom); null: a phone (the basics, everything else under More). */
  room: BarRoom | null;
  onImage: () => void;
  /** 1.54.0: a frame guide (its picture here, or on the words picked). */
  onFrame: () => void;
  uploading: number;
  grammar: Grammar;
  grammarOpen: boolean;
  onGrammar: () => void;
}) {
  // Under More: on a phone everything but the basics; in the bar, what it has no room for (1.55.2).
  const [more, setMoreState] = useState<"phone" | "bar" | null>(null);
  const setMore = (v: boolean) => !v && setMoreState(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const moreBarBtn = useRef<HTMLButtonElement>(null);
  const sheet = room
    ? { strike: !room.marks, highlight: !room.marks, colors: !room.marks, checklist: !room.lists, quote: !room.lists, pageBreak: !room.pageBreak, undo: !room.undo, basics: !room.basics }
    : { strike: true, highlight: true, colors: true, checklist: true, quote: true, pageBreak: true, undo: true, basics: true };
  const barMore = !!room && (sheet.strike || sheet.checklist || sheet.pageBreak || sheet.undo || sheet.basics);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      color: textColor(e.getAttributes("textColor").color)?.key ?? null,
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }) || (!e.isActive({ textAlign: "center" }) && !e.isActive({ textAlign: "right" })),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      block: e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "p",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const B = ({
    on,
    label,
    shortcut,
    onClick,
    disabled,
    children,
  }: {
    on?: boolean;
    label: string;
    shortcut?: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
        on ? "bg-ink text-paper" : "text-ink-soft hover:text-ink hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
  const Sep = () => <span className="w-px h-6 bg-line/15 mx-1 flex-shrink-0" aria-hidden />;
  const c = () => editor.chain().focus();

  return (
    <>
      <div className="no-print flex-1 min-w-0 sm:overflow-x-auto no-scrollbar">
      <div role="toolbar" aria-label="Formatting" className="sm:mx-auto sm:w-max px-2 py-1.5 flex items-center gap-0.5">
        <div className={`${room && !room.score ? "w-[4.75rem]" : "w-32"} flex-shrink-0 mr-1`}>
          <Select
            value={s!.block}
            onChange={(v) => {
              // Always the level picked: picking the one it already is leaves it alone
              // (it used to switch the heading back to text).
              if (!v || v === s!.block) return;
              if (v === "p") c().setParagraph().run();
              else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
            }}
            options={[
              { value: "p", label: `Text · ${MOD}0` },
              { value: "h1", label: `Heading 1 · ${MOD}1` },
              { value: "h2", label: `Heading 2 · ${MOD}2` },
              { value: "h3", label: `Heading 3 · ${MOD}3` },
            ]}
            renderValue={(o) => (
              // (The bar at its narrowest: H1, H2, H3.)
              <span className="truncate">{o ? (room && !room.score && o.value !== "p" ? o.value.toUpperCase() : o.label.split(" · ")[0]) : "Text"}</span>
            )}
            ariaLabel="Text style"
            menuMinWidth={170}
          />
        </div>
        <B label="Bold" shortcut="Ctrl+B" on={s!.bold} onClick={() => c().toggleBold().run()}>
          <BoldIcon className="w-4 h-4" />
        </B>
        <B label="Italic" shortcut="Ctrl+I" on={s!.italic} onClick={() => c().toggleItalic().run()}>
          <ItalicIcon className="w-4 h-4" />
        </B>
        <B label="Underline" shortcut="Ctrl+U" on={s!.underline} onClick={() => c().toggleUnderline().run()}>
          <UnderlineIcon className="w-4 h-4" />
        </B>
        <span className="hidden sm:contents">
        {room?.marks && (
          <>
            <B label="Strikethrough" shortcut="Ctrl+Shift+S" on={s!.strike} onClick={() => c().toggleStrike().run()}>
              <StrikeIcon className="w-4 h-4" />
            </B>
            <HighlightMenu editor={editor} active={s!.highlight} />
            <TextColorMenu editor={editor} current={s!.color} />
          </>
        )}
        <Sep />
        <B label="Bullet list" on={s!.bullet} onClick={() => c().toggleBulletList().run()}>
          <ListBulletIcon className="w-4 h-4" />
        </B>
        {room?.basics && (
          <B label="Numbered list" on={s!.ordered} onClick={() => c().toggleOrderedList().run()}>
            <ListNumberIcon className="w-4 h-4" />
          </B>
        )}
        {room?.lists && (
          <>
            <B label="Checklist" on={s!.task} onClick={() => c().toggleTaskList().run()}>
              <ListCheckIcon className="w-4 h-4" />
            </B>
            <B label="Quote" on={s!.quote} onClick={() => c().toggleBlockquote().run()}>
              <QuoteIcon className="w-4 h-4" />
            </B>
          </>
        )}
        {room?.basics && (
          <>
            {/* (1.55.2: one button for the three, showing the one it is.) */}
            <AlignMenu editor={editor} at={s!.center ? "center" : s!.right ? "right" : "left"} />
            <Sep />
            <LinkButton editor={editor} active={s!.link} />
            <B label={uploading ? `Uploading ${uploading}…` : "Add image"} onClick={onImage}>
              {uploading ? (
                <span className="w-4 h-4 rounded-full border-2 border-ink-soft/40 border-t-amber animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
            </B>
            <B label="Frame guide: a reference shot from Frame Guides" onClick={onFrame}>
              <FrameIcon className="w-4 h-4" />
            </B>
          </>
        )}
        {room?.pageBreak && (
          <B label="Page break: the rest starts a new page" shortcut={`${MOD}Enter`} onClick={() => c().setPageBreak().run()}>
            <PageBreakIcon className="w-4 h-4" />
          </B>
        )}
        {room?.undo && (
          <>
            <Sep />
            <B label="Undo" shortcut="Ctrl+Z" disabled={!s!.canUndo} onClick={() => c().undo().run()}>
              <UndoIcon className="w-4 h-4" />
            </B>
            <B label="Redo" shortcut="Ctrl+Shift+Z" disabled={!s!.canRedo} onClick={() => c().redo().run()}>
              <RedoIcon className="w-4 h-4" />
            </B>
          </>
        )}
        {barMore && (
          <button
            ref={moreBarBtn}
            type="button"
            aria-label="More formatting"
            title="More formatting"
            aria-expanded={more === "bar"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMoreState((m) => (m === "bar" ? null : "bar"))}
            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${more === "bar" ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
          >
            <MoreIcon className="w-5 h-5" />
          </button>
        )}
        {(!room || room.sug) && (
          <>
            <Sep />
            <GrammarToolbarButton g={grammar} open={grammarOpen} onToggle={onGrammar} label={!!room?.sugLabel} score={!room || room.score} />
          </>
        )}
        </span>
        {/* Phones: everything else in one sheet (no sideways scrolling). */}
        <span className="flex-1 sm:hidden" />
        <span className="sm:hidden">
          <B label="Bullet list" on={s!.bullet} onClick={() => c().toggleBulletList().run()}>
            <ListBulletIcon className="w-4 h-4" />
          </B>
        </span>
        <button
          ref={moreBtn}
          type="button"
          aria-expanded={more === "phone"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setMoreState((m) => (m === "phone" ? null : "phone"))}
          className="sm:hidden h-9 px-2.5 rounded-lg text-[12.5px] font-bold text-ink-soft hover:text-ink hover:bg-surface-2"
        >
          More
        </button>
      </div>
      </div>
      <AnchoredMenu open={!!more} onClose={() => setMore(false)} anchor={more === "bar" ? moreBarBtn : moreBtn} label="Format">
        <div className="p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-3">Format</div>
            <div className="grid grid-cols-6 gap-1.5 [&_button]:w-full [&_button]:h-11">
              {sheet.strike && (
                <B label="Strikethrough" on={s!.strike} onClick={() => c().toggleStrike().run()}>
                  <StrikeIcon className="w-4 h-4" />
                </B>
              )}
              {sheet.highlight && (
                <B label="Highlight" on={s!.highlight} onClick={() => c().toggleHighlight().run()}>
                  <HighlighterIcon className="w-4 h-4" />
                </B>
              )}
              {sheet.basics && (
                <B label="Numbered list" on={s!.ordered} onClick={() => c().toggleOrderedList().run()}>
                  <ListNumberIcon className="w-4 h-4" />
                </B>
              )}
              {sheet.checklist && (
                <B label="Checklist" on={s!.task} onClick={() => c().toggleTaskList().run()}>
                  <ListCheckIcon className="w-4 h-4" />
                </B>
              )}
              {sheet.quote && (
                <B label="Quote" on={s!.quote} onClick={() => c().toggleBlockquote().run()}>
                  <QuoteIcon className="w-4 h-4" />
                </B>
              )}
              {sheet.basics && (
                <>
                  <B label="Add image" onClick={() => { setMore(false); onImage(); }}>
                    <ImageIcon className="w-4 h-4" />
                  </B>
                  <B label="Frame guide" onClick={() => { setMore(false); onFrame(); }}>
                    <FrameIcon className="w-4 h-4" />
                  </B>
                </>
              )}
              {sheet.pageBreak && (
                <B label="Page break" onClick={() => { setMore(false); c().setPageBreak().run(); }}>
                  <PageBreakIcon className="w-4 h-4" />
                </B>
              )}
              {sheet.basics && (
                <>
                  <B label="Align left" on={s!.left} onClick={() => c().setTextAlign("left").run()}>
                    <AlignLeftIcon className="w-4 h-4" />
                  </B>
                  <B label="Center" on={s!.center} onClick={() => c().setTextAlign("center").run()}>
                    <AlignCenterIcon className="w-4 h-4" />
                  </B>
                  <B label="Align right" on={s!.right} onClick={() => c().setTextAlign("right").run()}>
                    <AlignRightIcon className="w-4 h-4" />
                  </B>
                  <span className="col-span-1 flex items-center justify-center"><LinkButton editor={editor} active={s!.link} /></span>
                </>
              )}
              {sheet.undo && (
                <>
                  <B label="Undo" disabled={!s!.canUndo} onClick={() => c().undo().run()}>
                    <UndoIcon className="w-4 h-4" />
                  </B>
                  <B label="Redo" disabled={!s!.canRedo} onClick={() => c().redo().run()}>
                    <RedoIcon className="w-4 h-4" />
                  </B>
                </>
              )}
            </div>
            {sheet.colors && (
            <>
            {/* The words' own colour (1.53.1): the paper's, or one of the seven. */}
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mt-4 mb-2">Text color</div>
            <div className="grid grid-cols-8 gap-1.5" role="group" aria-label="Text color">
              <button
                type="button"
                aria-label="Default text color"
                aria-pressed={!s!.color}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => c().unsetTextColor().run()}
                className={`aspect-square w-full rounded-full flex items-center justify-center border border-line/30 text-ink ${!s!.color ? "ring-2 ring-amber ring-offset-2 ring-offset-surface" : ""}`}
              >
                <TextColorIcon color={null} className="w-4 h-4" />
              </button>
              {TEXT_COLORS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-label={`Text color: ${t.name}`}
                  aria-pressed={s!.color === t.key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => c().setTextColor(t.key).run()}
                  className={`aspect-square w-full rounded-full border border-black/10 ${s!.color === t.key ? "ring-2 ring-amber ring-offset-2 ring-offset-surface" : ""}`}
                  style={{ background: t.swatch }}
                />
              ))}
            </div>
            </>
            )}
        </div>
      </AnchoredMenu>
    </>
  );
}

/** Align left, centre or right (1.55.2): one button showing which, the three under it. */
function AlignMenu({ editor, at }: { editor: Editor; at: "left" | "center" | "right" }) {
  const { open, setOpen, btn, box, style } = usePopover(176);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useMenuKeyboard(open, box, btn, close);
  const ALIGN = [
    { key: "left" as const, name: "Align left", Icon: AlignLeftIcon },
    { key: "center" as const, name: "Center", Icon: AlignCenterIcon },
    { key: "right" as const, name: "Align right", Icon: AlignRightIcon },
  ];
  const Now = ALIGN.find((a) => a.key === at)!.Icon;
  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btn}
        type="button"
        aria-label="Alignment"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Alignment"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={`h-9 px-2 rounded-lg flex items-center gap-0.5 transition-colors ${open ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
      >
        <Now className="w-4 h-4" />
        <ChevronDownIcon className="w-3 h-3" />
      </button>
      {open &&
        createPortal(
          <Leaves>
            <div ref={box} role="menu" aria-label="Alignment" style={style} className="pop-menu z-[140] rounded-xl border border-line/15 bg-surface shadow-xl p-1">
              {ALIGN.map(({ key, name, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={at === key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setTextAlign(key).run();
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                >
                  <Icon className="w-4 h-4 text-ink-soft" />
                  <span className="flex-1 text-left">{name}</span>
                  {at === key && <CheckIcon className="w-4 h-4 text-amber" />}
                </button>
              ))}
            </div>
          </Leaves>,
          document.body
        )}
    </div>
  );
}

/**
 * Small popover anchored under a toolbar button. Rendered in a portal
 * with fixed positioning, so the scrolling toolbar can't clip it.
 */
function usePopover(width = 220) {
  const [open, setOpenState] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (v: boolean | ((o: boolean) => boolean)) => {
      setOpenState((prev) => {
        const next = typeof v === "function" ? v(prev) : v;
        if (next) {
          const r = btn.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8) });
        }
        return next;
      });
    },
    [width]
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || box.current?.contains(t)) return;
      setOpenState(false);
    };
    const onScroll = () => setOpenState(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const style = { position: "fixed" as const, top: pos.top, left: pos.left, width };
  return { open, setOpen, btn, box, style };
}

function HighlightMenu({ editor, active }: { editor: Editor; active: boolean }) {
  const { open, setOpen, btn, box, style } = usePopover(176);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useMenuKeyboard(open, box, btn, close);
  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btn}
        type="button"
        aria-label="Highlight"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Highlight"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={`h-9 px-2 rounded-lg flex items-center gap-0.5 transition-colors ${
          active ? "bg-ink text-paper" : "text-ink-soft hover:text-ink hover:bg-surface-2"
        }`}
      >
        <HighlighterIcon className="w-4 h-4" />
        <ChevronDownIcon className="w-3 h-3" />
      </button>
      {open && createPortal(
        <Leaves>
          <div ref={box} role="menu" aria-label="Highlight color" style={style} className="pop-menu z-[140] rounded-xl border border-line/15 bg-surface shadow-xl p-1">
            {HIGHLIGHTS.map((h) => (
              <button
                key={h.color}
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().setHighlight({ color: h.color }).run();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
              >
                <span className="w-5 h-5 rounded-md border border-black/10" style={{ background: h.color }} />
                {h.name}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-soft hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
            >
              <span className="w-5 h-5 rounded-md border border-line/30" />
              No highlight
            </button>
          </div>
        </Leaves>,
        document.body
      )}
    </div>
  );
}

/**
 * The words' own colour (1.53.1), beside Highlight: seven colours that read on light and dark paper (lib/text-color.ts),
 * or the paper's own. The bar under the A shows the colour where the cursor is.
 */
function TextColorMenu({ editor, current }: { editor: Editor; current: string | null }) {
  const { open, setOpen, btn, box, style } = usePopover(176);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useMenuKeyboard(open, box, btn, close);
  const now = textColor(current);
  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btn}
        type="button"
        aria-label={now ? `Text color: ${now.name}` : "Text color"}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Text color"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="h-9 px-2 rounded-lg flex items-center gap-0.5 transition-colors text-ink-soft hover:text-ink hover:bg-surface-2"
      >
        <TextColorIcon color={now?.swatch ?? null} className="w-4 h-4" />
        <ChevronDownIcon className="w-3 h-3" />
      </button>
      {open && createPortal(
        <Leaves>
          <div ref={box} role="menu" aria-label="Text color" style={style} className="pop-menu z-[140] rounded-xl border border-line/15 bg-surface shadow-xl p-1">
            {TEXT_COLORS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="menuitemradio"
                aria-checked={current === t.key}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().setTextColor(t.key).run();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
              >
                <span className="w-5 h-5 rounded-md border border-black/10" style={{ background: t.swatch }} />
                <span className="flex-1 text-left">{t.name}</span>
                {current === t.key && <CheckIcon className="w-3.5 h-3.5 text-ink-soft" />}
              </button>
            ))}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!current}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetTextColor().run();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-soft hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
            >
              <span className="w-5 h-5 rounded-md border border-line/30 flex items-center justify-center text-ink">
                <TextColorIcon color={null} className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 text-left">Default</span>
              {!current && <CheckIcon className="w-3.5 h-3.5 text-ink-soft" />}
            </button>
          </div>
        </Leaves>,
        document.body
      )}
    </div>
  );
}

/** An A over a bar: the bar in the colour (none: the ink, faded). Drawn like the app's icons (components/ui/icons.tsx). */
function TextColorIcon({ color, className }: { color: string | null; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="m6.5 15.5 5.5-12 5.5 12M8.8 10.5h6.4" />
      <rect x="4" y="18" width="16" height="3.5" rx="1.2" stroke="none" fill={color ?? "currentColor"} opacity={color ? 1 : 0.35} />
    </svg>
  );
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const { open, setOpen, btn, box, style } = usePopover(288);
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl((editor.getAttributes("link").href as string) ?? "");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, editor]);

  function apply() {
    const v = url.trim();
    if (!v) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: /^https?:\/\//i.test(v) ? v : `https://${v}` }).run();
    setOpen(false);
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btn}
        type="button"
        aria-label="Link"
        aria-pressed={active}
        title="Link (Ctrl+K)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          active ? "bg-ink text-paper" : "text-ink-soft hover:text-ink hover:bg-surface-2"
        }`}
      >
        <LinkIcon className="w-4 h-4" />
      </button>
      {open && createPortal(
        <Leaves>
          <div ref={box} style={style} className="pop-menu z-[140] rounded-xl border border-line/15 bg-surface shadow-xl p-2">
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                  editor.commands.focus();
                }
              }}
              placeholder="Paste a link, Enter to apply"
              className="w-full rounded-lg border border-line/15 bg-surface px-3 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber"
            />
            <p className="mt-1.5 px-1 text-[11px] text-ink-soft">Leave empty and press Enter to remove the link.</p>
          </div>
        </Leaves>,
        document.body
      )}
    </div>
  );
}

function ExportMenu({ onDocx, onPdf }: { onDocx: () => void; onPdf: () => void }) {
  const { open, setOpen, btn, box } = usePopover(208);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useMenuKeyboard(open, box, btn, close);
  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        aria-label="Export"
        title="Export: Word or PDF"
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${open ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
      >
        <DownloadIcon className="w-4 h-4" />
      </button>
      {open && (
        <Leaves>
          <div ref={box} role="menu" aria-label="Export" className="pop-menu origin-top-right absolute right-0 top-[calc(100%+4px)] z-30 w-52 rounded-xl border border-line/15 bg-surface shadow-xl p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDocx();
              }}
              className="w-full text-left rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
            >
              Word document (.docx)
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPdf();
              }}
              className="w-full text-left rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
            >
              PDF
              <span className="block text-[11px] text-ink-soft">Opens print. Choose &ldquo;Save as PDF&rdquo;.</span>
            </button>
          </div>
        </Leaves>
      )}
    </div>
  );
}

/** Page width (1.23.0): Normal, Wide or Full. */
function WidthMenu({ value, onChange }: { value: Width; onChange: (w: Width) => void }) {
  const { open, setOpen, btn, box } = usePopover(232);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useMenuKeyboard(open, box, btn, close);
  const HINT: Record<Width, string> = { normal: "Lines that are easy to read", wide: "Longer lines", full: "The whole width" };
  return (
    <div className="relative hidden md:block flex-shrink-0">
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        aria-label="Page width"
        title={`Page width: ${WIDTH_LABEL[value]}`}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${open ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
      >
        <WidthIcon className="w-4 h-4" />
      </button>
      {open && (
        <Leaves>
          <div ref={box} role="menu" aria-label="Page width" className="pop-menu origin-top-right absolute right-0 top-[calc(100%+4px)] z-30 w-60 rounded-xl border border-line/15 bg-surface shadow-xl p-1">
            {(["normal", "wide", "full"] as const).map((w) => (
              <button
                key={w}
                type="button"
                role="menuitemradio"
                aria-checked={value === w}
                onClick={() => {
                  onChange(w);
                  setOpen(false);
                }}
                className="w-full text-left rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-ink">{WIDTH_LABEL[w]}</span>
                  <span className="block text-[11px] text-ink-soft">{HINT[w]}</span>
                </span>
                {value === w && <CheckIcon className="w-4 h-4 text-amber flex-shrink-0" />}
              </button>
            ))}
          </div>
        </Leaves>
      )}
    </div>
  );
}

/**
 * Phones: paper and export in one menu (the top bar is narrow). 1.55.2: the one bar too, where it's short of room
 * ("Page": with the page width as well).
 */
function MobileMenu({
  paper,
  onPaper,
  onDocx,
  onPdf,
  width,
  onWidth,
  className = "sm:hidden",
  label = "More",
}: {
  paper: "light" | "dark";
  onPaper: () => void;
  onDocx: () => void;
  onPdf: () => void;
  width?: Width;
  onWidth?: (w: Width) => void;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const item = "w-full text-left px-4 h-11 text-[14px] font-semibold flex items-center justify-between hover:bg-surface-2";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className={`${className} flex-shrink-0`}>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-label={label} title={label === "More" ? undefined : "Page width, paper and export"} aria-expanded={open} className="w-8 h-8 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
        <MoreIcon className="w-5 h-5" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} label={label}>
        <div className="py-1.5">
          {width && onWidth && (
            <>
              <div className="px-4 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Page width</div>
              {(["normal", "wide", "full"] as const).map((w) => (
                <button key={w} type="button" role="menuitemradio" aria-checked={width === w} className={item} onClick={run(() => onWidth(w))}>
                  {WIDTH_LABEL[w]}
                  {width === w && <CheckIcon className="w-4 h-4 text-amber" />}
                </button>
              ))}
              <div className="my-1.5 border-t border-line/10" />
            </>
          )}
          <button type="button" className={item} onClick={run(onPaper)}>
            {paper === "light" ? "Dark paper" : "Light paper"}
          </button>
          <button type="button" className={item} onClick={run(onDocx)}>
            Export as Word
          </button>
          <button type="button" className={item} onClick={run(onPdf)}>
            Print / PDF
          </button>
        </div>
      </AnchoredMenu>
    </div>
  );
}

/**
 * Under a comment opened on words that also have a writing suggestion
 * (1.27.5): the suggestion, one click away, so clicking the words for the
 * comment never takes a fix by accident.
 */
function SuggestionHere({ s, onOpen }: { s: { id: string; title: string; category: GrammarCategory } | null; onOpen: (id: string) => void }) {
  if (!s) return null;
  const color = CATEGORY_COLOR[s.category];
  return (
    <button
      type="button"
      onClick={() => onOpen(s.id)}
      className="mt-1.5 w-full flex items-center gap-2 rounded-xl border border-line/15 bg-surface px-3 h-9 text-left text-[12.5px] shadow-xl hover:border-line/30 animate-[modalin_.12s_var(--ease-out)]"
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} aria-hidden />
      <span className="font-semibold text-ink-soft flex-shrink-0">Suggestion here</span>
      <span className="min-w-0 flex-1 truncate text-ink">{s.title}</span>
      <ChevronDownIcon className="w-3.5 h-3.5 -rotate-90 text-ink-soft flex-shrink-0" />
    </button>
  );
}
