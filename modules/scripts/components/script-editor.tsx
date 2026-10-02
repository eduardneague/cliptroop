"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEditor, EditorContent, useEditorState, type Editor } from "@tiptap/react";
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
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { compressImage, IMAGE_PRESETS, safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
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
} from "@/components/ui/icons";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { CommentHighlights, commentKey, findQuote, occurrenceAt, type CommentMark, type PendingMark } from "../lib/anchors";
import { CommentComposer, KIND_COLOR } from "./comment-composer";
import type { MentionPerson } from "../lib/mention-people";
import type { Scene } from "../sketch/engine";

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
import { countWords, EMPTY_DOC, SCRIPT_TEMPLATE, spokenLength } from "../lib/text";
import { sounds } from "@/lib/sounds";

/**
 * Where a block (like an image) can go near `pos`: right after the
 * paragraph/list/quote it's in, or in place of an empty paragraph. Never
 * inside a line of text (that's what caused "Inserted content deeper
 * than insertion position").
 */
function blockRange(editor: Editor, pos?: number) {
  const { doc, selection } = editor.state;
  const at = typeof pos === "number" ? Math.min(Math.max(pos, 0), doc.content.size) : selection.from;
  const $pos = doc.resolve(at);
  if ($pos.depth === 0) return { from: at, to: at };
  const top = $pos.node(1);
  const start = $pos.before(1);
  const end = $pos.after(1);
  if (top.type.name === "paragraph" && top.content.size === 0) return { from: start, to: end };
  return { from: end, to: end };
}

const HIGHLIGHTS = [
  { name: "Yellow", color: "#FDE68A" },
  { name: "Green", color: "#BBF7D0" },
  { name: "Blue", color: "#BFDBFE" },
  { name: "Pink", color: "#FBCFE8" },
  { name: "Orange", color: "#FED7AA" },
];

type Status = "saved" | "unsaved" | "saving" | "error" | "conflict";
const PAPER_KEY = "vp:script-paper";
const VIEW_KEY = "vp:script-view";
/** A4 is 1 : √2. Page height follows the paper's width. */
const A4_RATIO = 1123 / 794;

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

function isEmptyDoc(doc: unknown) {
  const d = doc as { content?: { type: string; content?: unknown[] }[] } | null;
  return !d?.content?.length || (d.content.length === 1 && d.content[0].type === "paragraph" && !d.content[0].content?.length);
}

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
  docName,
  leftRail,
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
  people = [],
  roleColors = {},
}: {
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
  /** The document's name (e.g. "Review"), shown in the top bar. */
  docName?: string;
  /** Left: the documents list (a strip on phones). */
  leftRail?: React.ReactNode;
  /** Right: extra panel (a sheet on phones). */
  rightPanel?: React.ReactNode;
  /** Another document shown as an equal page next to this one (desktop). */
  sideBySide?: React.ReactNode;
  /** Phones / tablets: the documents dropdown next to the title. */
  mobileDocs?: React.ReactNode;
  /** The popover shown when a highlighted comment is clicked. */
  renderCommentPopover?: (id: string, close: () => void) => React.ReactNode;
  /** Inline comments (anyone on the team can add them). */
  comments?: CommentMark[];
  activeCommentId?: string | null;
  onAddComment?: (quote: string, occurrence: number, body: string, kind: "comment" | "edit_idea", sketch?: { path: string; w: number; h: number } | null) => Promise<string | null>;
  onCommentClick?: (id: string) => void;
  /** "Copy from…" when this document is empty. */
  copySources?: { id: string; name: string }[];
  onCopyFrom?: (id: string) => Promise<Record<string, unknown> | null>;
  /** Teammates for @mentions (with what they do on this video). */
  people?: MentionPerson[];
  roleColors?: Record<string, string>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status>("saved");
  const [words, setWords] = useState(0);
  const [paper, setPaper] = useState<"light" | "dark">("light");
  const [view, setView] = useState<"strip" | "pages">("strip");
  const shown = view;
  const scaleRef = useRef(1);
  const areaRef = useRef<HTMLDivElement>(null);

  const paperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageLayout, setPageLayout] = useState({ pageH: 1123, pages: 1 });
  const [uploading, setUploading] = useState(0);

  const versionRef = useRef(initialVersion);
  const pendingRef = useRef(false);
  const inflightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  // What the database has. A "change" only counts if the document differs
  // from this, so clicks and no-op edits never trigger a save.
  const savedJsonRef = useRef<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const commentStateRef = useRef<{ comments: CommentMark[]; active: string | null; pending: PendingMark }>({ comments, active: activeCommentId, pending: null });

  useEffect(() => {
    try {
      const v = localStorage.getItem(PAPER_KEY);
      if (v === "light" || v === "dark") setPaper(v);
      const w = localStorage.getItem(VIEW_KEY);
      if (w === "strip" || w === "pages") setView(w);
      else if (w === "spread") setView("pages");
    } catch {
      /* private mode: stay light */
    }
  }, []);

  // ---- saving ---------------------------------------------------------------

  const flush = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !pendingRef.current || inflightRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = false;
    inflightRef.current = true;
    setStatus("saving");
    const text = editor.getText({ blockSeparator: "\n" });
    const json = normalized(editor.getJSON() as Json);
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

  const uploadImages = useCallback(
    async (files: File[], pos?: number) => {
      const editor = editorRef.current;
      if (!editor) return;
      const supabase = createClient();
      for (const original of files) {
        if (!original.type.startsWith("image/")) continue;
        if (original.size > 25 * 1024 * 1024) {
          toast.error(`${original.name} is too big (25 MB max).`);
          continue;
        }
        setUploading((n) => n + 1);
        try {
          const file = await compressImage(original, IMAGE_PRESETS.attachment);
          const path = `${teamId}/${scriptId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
          const { error } = await supabase.storage
            .from("script-images")
            .upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type });
          if (error) throw error;
          const { data } = supabase.storage.from("script-images").getPublicUrl(path);
          const node = { type: "image", attrs: { src: data.publicUrl, alt: original.name, align: "center", width: 60 } };
          editor.chain().focus().insertContentAt(blockRange(editor, pos), node).run();
        } catch {
          toast.error(`Couldn't upload ${original.name}.`);
        } finally {
          setUploading((n) => n - 1);
        }
      }
    },
    [scriptId, teamId, toast]
  );
  const uploadRef = useRef(uploadImages);
  uploadRef.current = uploadImages;

  // ---- editor -------------------------------------------------------------------

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: !canEdit, autolink: true, defaultProtocol: "https" },
        codeBlock: false,
        code: false,
      }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ScriptImage,
      CharacterCount,
      CommentHighlights(() => commentStateRef.current),
      Placeholder.configure({ placeholder: canEdit ? "Start writing the script…" : "No script written yet." }),
    ],
    content: isEmptyDoc(initialContent) ? EMPTY_DOC : initialContent,
    editorProps: {
      attributes: { class: "script-doc outline-none", spellcheck: "true" },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!canEdit || files.length === 0) return false;
        void uploadRef.current(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !canEdit) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void uploadRef.current(files, pos);
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

  // Selecting text shows a floating "Comment" button (even when view-only).
  const [sel, setSel] = useState<{ quote: string; occurrence: number; top: number; left: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftKind, setDraftKind] = useState<"comment" | "edit_idea">("comment");
  const [pop, setPop] = useState<{ id: string; top: number; left: number } | null>(null);
  // A drawing for the editing idea being written, and the studio itself.
  const [sketch, setSketch] = useState<SketchDraft | null>(null);
  const [studio, setStudio] = useState(false);
  const [sending, setSending] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [backup, setBackup] = useState<{ quote: string; occurrence: number; kind: "comment" | "edit_idea"; text: string; scene: Scene | null } | null>(null);
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
    commentStateRef.current = { comments, active: activeCommentId, pending: drafting && sel ? { quote: sel.quote, occurrence: sel.occurrence, kind: draftKind } : null };
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(commentKey, true));
  }, [comments, activeCommentId, editor, drafting, sel, draftKind]);
  // Jump to the comment picked in the list.
  useEffect(() => {
    if (!editor || !activeCommentId) return;
    const c = comments.find((x) => x.id === activeCommentId);
    const r = c ? findQuote(editor.state.doc, c.quote, c.occurrence) : null;
    if (!r) return;
    const node = editor.view.domAtPos(r.from).node as HTMLElement;
    (node.nodeType === 1 ? node : node.parentElement)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeCommentId, comments, editor]);

  useEffect(() => {
    if (!editor || !onAddComment) return;
    const update = () => {
      // Writing a comment: it stays on the text it was started on.
      if (draftRef.current.text !== null) return;
      const { from, to, empty } = editor.state.selection;
      const $from = editor.state.doc.resolve(from);
      const $to = editor.state.doc.resolve(to);
      if (empty || !$from.sameParent($to)) {
        if (draft === null) setSel(null);
        return;
      }
      const quote = editor.state.doc.textBetween(from, to, "\u0000").slice(0, 500);
      if (!quote.trim()) return setSel(null);
      const box = paperRef.current?.getBoundingClientRect();
      const end = editor.view.coordsAtPos(to);
      if (!box) return;
      const z = scaleRef.current;
      setSel({ quote, occurrence: occurrenceAt(editor.state.doc, quote, from), top: (end.bottom - box.top) / z + 6, left: Math.min((end.left - box.left) / z, box.width / z - 140) });
    };
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("selectionUpdate", update);
    };
  }, [editor, onAddComment, draft]);

  // ---- writing a comment: never lost by accident ---------------------------------
  const clearDraft = useCallback(() => {
    setDraft(null);
    setSel(null);
    setSketch((sk) => {
      if (sk) URL.revokeObjectURL(sk.url);
      return null;
    });
    try {
      localStorage.removeItem(DRAFT_KEY(scriptId));
    } catch {}
  }, [scriptId]);
  async function requestDiscard() {
    if ((draft ?? "").trim() || sketch) {
      const ok = await confirm({
        title: draftKind === "edit_idea" ? "Discard this editing idea?" : "Discard this comment?",
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
    setSending(true);
    let sk: { path: string; w: number; h: number } | null = null;
    if (sketch) {
      // The drawing goes up first (PNG + its editable version), then the idea.
      // The server hands out signed upload links after checking you're on
      // this document's team, so storage policies can't get in the way.
      const target = await prepareSketchUpload(scriptId);
      if (target.error !== undefined) {
        setSending(false);
        toast.error(target.error);
        return;
      }
      const bucket = createClient().storage.from("script-sketches");
      const [up] = await Promise.all([
        bucket.uploadToSignedUrl(target.png.path, target.png.token, sketch.blob, { contentType: "image/png", cacheControl: UPLOAD_CACHE_CONTROL }),
        target.json.token
          ? bucket.uploadToSignedUrl(target.json.path, target.json.token, new Blob([JSON.stringify(sketch.scene)], { type: "application/json" }), { contentType: "application/json" })
          : null,
      ]);
      if (up.error) {
        setSending(false);
        toast.error(`Couldn't upload the drawing (${up.error.message}). Try again.`);
        return;
      }
      sk = { path: target.png.path, w: sketch.w, h: sketch.h };
    }
    const err = await onAddComment(sel.quote, sel.occurrence, draft, draftKind, sk);
    setSending(false);
    if (err) toast.error(err);
    else {
      sounds.send();
      clearDraft();
    }
  }
  // A copy of the unsent comment on this device (a reload or a closed tab can't lose it).
  useEffect(() => {
    if (draft === null || !sel) return;
    const t = setTimeout(() => {
      try {
        const scene = sketch && JSON.stringify(sketch.scene).length < 1_500_000 ? sketch.scene : null;
        if (!draft.trim() && !scene) return localStorage.removeItem(DRAFT_KEY(scriptId));
        localStorage.setItem(DRAFT_KEY(scriptId), JSON.stringify({ quote: sel.quote, occurrence: sel.occurrence, kind: draftKind, text: draft, scene, at: Date.now() }));
      } catch {
        /* full or private: the warnings still protect it */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft, draftKind, sel, sketch, scriptId]);
  // Found one from last time? Offer it back.
  useEffect(() => {
    if (!editor || !onAddComment) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY(scriptId));
      if (!raw) return;
      const b = JSON.parse(raw);
      if (Date.now() - (b.at ?? 0) > 14 * 86_400_000 || !findQuote(editor.state.doc, b.quote, b.occurrence)) return localStorage.removeItem(DRAFT_KEY(scriptId));
      setBackup({ quote: b.quote, occurrence: b.occurrence ?? 0, kind: b.kind === "edit_idea" ? "edit_idea" : "comment", text: String(b.text ?? ""), scene: b.scene ?? null });
    } catch {}
  }, [editor, onAddComment, scriptId]);
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
      setDraft(b.text);
      if (b.scene?.els?.length) {
        const { exportPng } = await import("../sketch/engine");
        const png = await exportPng(b.scene.els, 1600, b.scene.paper === "dark" ? "dark" : "light");
        if (png) setSketch({ scene: b.scene, ...png, url: URL.createObjectURL(png.blob) });
      }
    });
  }

  // Save shortcut, unsaved-changes warning, and a final save when leaving.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flushRef.current();
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

  // Pages view: work out how many A4 sheets the script fills.
  useEffect(() => {
    if (shown !== "pages") return;
    const paperEl = paperRef.current;
    const contentEl = contentRef.current;
    if (!paperEl || !contentEl) return;
    const measure = () => {
      const width = paperEl.getBoundingClientRect().width;
      const pageH = Math.round(width * A4_RATIO);
      const styles = getComputedStyle(paperEl);
      const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const needed = contentEl.getBoundingClientRect().height + padding;
      setPageLayout({ pageH, pages: Math.max(1, Math.ceil(needed / pageH)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(paperEl);
    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [shown]);

  function chooseView(v: "strip" | "pages") {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
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

  const statusText: Record<Status, string> = {
    saved: "Saved",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    error: "Not saved. Press Ctrl+S to retry.",
    conflict: "Someone else saved a newer version.",
  };

  return (
    <div className="script-print-root min-h-[calc(100dvh-3.5rem)] flex flex-col">
      {/* Top bar */}
      <div className="no-print flex items-center gap-2 sm:gap-3 px-3 sm:px-6 h-14 border-b border-line/10 bg-paper/90 backdrop-blur sm:sticky sm:top-14 z-20">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink flex-shrink-0">
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
        <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          <span className="font-mono text-ink-soft mr-1.5">#{number}</span>
          {title}
          {docName && <span className={`ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-bold text-ink-soft ${mobileDocs ? "hidden lg:inline" : ""}`}>{docName}</span>}
        </div>
        {mobileDocs && <div className="lg:hidden flex-shrink-0">{mobileDocs}</div>}
        <span className="hidden md:inline text-[12px] text-ink-soft tabular-nums">
          {words} words · about {spokenLength(words)}
          {shown === "pages" ? ` · ${pageLayout.pages} page${pageLayout.pages === 1 ? "" : "s"}` : ""}
        </span>
        <div role="radiogroup" aria-label="View" className="hidden sm:flex items-center rounded-lg border border-line/15 p-0.5 flex-shrink-0">
          {([
            ["strip", "Strip"],
            ["pages", "Pages"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => chooseView(v)}
              title={v === "pages" ? "Pages one under another" : "One long page"}
              className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${
                view === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {canEdit ? (
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 text-[12px] font-semibold ${
              status === "error" || status === "conflict" ? "text-red" : status === "saved" ? "text-green" : "text-ink-soft"
            }`}
            aria-live="polite"
          >
            {status === "saved" && <CheckIcon className="w-3.5 h-3.5" />}
            {statusText[status]}
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-ink-soft">View only</span>
        )}
        <span className="hidden sm:contents">{topBarExtra}</span>
        <MobileMenu
          view={view}
          onView={chooseView}
          paper={paper}
          onPaper={togglePaper}
          onDocx={async () => {
            if (!editor) return;
            const { exportScriptDocx } = await import("../lib/export-docx");
            await exportScriptDocx(editor.getJSON() as never, `#${number} ${title}`, safeFileName(`${number}-${title}`, "").replace(/\.$/, ""));
          }}
          onPdf={() => window.print()}
        />
        <button
          type="button"
          onClick={togglePaper}
          aria-label={paper === "light" ? "Dark paper" : "Light paper"}
          title={paper === "light" ? "Dark paper" : "Light paper"}
          className="hidden sm:flex w-9 h-9 rounded-lg items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
        >
          {paper === "light" ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
        </button>
        <span className="hidden sm:contents">
        <ExportMenu
          onDocx={async () => {
            if (!editor) return;
            toast.success("Preparing the Word file…");
            // The Word library is big: load it only when someone exports.
            const { exportScriptDocx } = await import("../lib/export-docx");
            await exportScriptDocx(editor.getJSON() as never, `#${number} ${title}`, safeFileName(`${number}-${title}`, "").replace(/\.$/, ""));
          }}
          onPdf={() => window.print()}
        />
        </span>
      </div>

      {status === "conflict" && (
        <div className="no-print mx-auto mt-4 w-full max-w-3xl px-4">
          <div className="rounded-xl border border-amber bg-amber/10 px-4 py-3 flex items-center gap-3 flex-wrap">
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

      {/* Toolbar */}
      {canEdit && editor && <Toolbar editor={editor} onImage={() => fileRef.current?.click()} uploading={uploading} />}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void uploadImages(files);
        }}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      {leftRail && <div className="no-print hidden lg:block lg:w-60 flex-shrink-0 lg:border-r border-line/10">{leftRail}</div>}
      {/* Paper */}
      <div ref={areaRef} className={`flex-1 min-w-0 px-3 sm:px-8 py-6 sm:py-10 ${sideBySide ? "lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start" : ""}`}>
        <div className="min-w-0">
        {sideBySide && <div className="hidden lg:flex h-8 mb-2 items-center text-[12px] font-bold uppercase tracking-wide text-ink-soft">{docName ?? "Script"}</div>}

        <div
          ref={paperRef}
          data-paper={paper}
          data-view={shown}
          style={
            shown === "pages" ? { minHeight: pageLayout.pages * pageLayout.pageH } : undefined
          }
          onClick={(e) => {
            const el = (e.target as HTMLElement).closest<HTMLElement>("[data-comment-id]");
            const id = el?.dataset.commentId;
            if (!id) return setPop(null);
            // The comment opens right where you clicked.
            const box = paperRef.current?.getBoundingClientRect();
            const r = el!.getBoundingClientRect();
            if (box && renderCommentPopover) {
              const z = scaleRef.current;
              setPop({ id, top: (r.bottom - box.top) / z + 6, left: Math.max(8, Math.min((r.left - box.left) / z, box.width / z - 300)) });
            } else onCommentClick?.(id);
          }}
          className={`script-paper script-print relative isolate transition-colors mx-auto w-full border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)] ${
            shown === "pages" ? "max-w-[794px] rounded-md px-6 sm:px-[72px] py-10 sm:py-[72px]" : "max-w-3xl rounded-2xl px-5 sm:px-14 py-8 sm:py-14"
          }`}
        >
          {/* Pages view: where each A4 sheet ends. Drawn behind the text. */}
          {shown === "pages" &&
            Array.from({ length: pageLayout.pages - 1 }, (_, i) => (
              <div
                key={i}
                aria-hidden
                className="no-print pointer-events-none absolute left-0 right-0 -z-10 flex items-center"
                style={{ top: (i + 1) * pageLayout.pageH - 12, height: 24 }}
              >
                <div className="w-full h-3 bg-paper shadow-[inset_0_4px_6px_-4px_rgb(0_0_0/0.25),inset_0_-4px_6px_-4px_rgb(0_0_0/0.25)]" />
                <span className="absolute right-3 -bottom-4 text-[10.5px] font-semibold script-soft">Page {i + 2}</span>
              </div>
            ))}
          <h1 className="print-only text-[22px] font-bold mb-6">
            #{number} {title}
          </h1>
          {canEdit && empty && (
            <div className="no-print mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 script-soft-border">
              {/* Phones: the text on its own line, the buttons underneath. */}
              <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0">
                <DocumentIcon className="w-5 h-5 script-soft flex-shrink-0 mt-0.5 sm:mt-0" />
                <p className="text-[13px] script-soft leading-snug">Start from a Hook, Body and Call to action outline?</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => editor?.commands.setContent(SCRIPT_TEMPLATE, { emitUpdate: true })}
                className="rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] whitespace-nowrap"
              >
                Use template
              </button>
              {onCopyFrom && copySources.length > 0 && (
                <select
                  defaultValue=""
                  onChange={async (e) => {
                    const id = e.target.value;
                    e.target.value = "";
                    if (!id) return;
                    const content = await onCopyFrom(id);
                    if (content && editor) editor.commands.setContent(content, { emitUpdate: true });
                  }}
                  className="rounded-lg border px-2 h-8 text-[12.5px] font-semibold bg-transparent script-soft-border"
                  aria-label="Copy from another document"
                >
                  <option value="">Copy from…</option>
                  {copySources.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              </div>
            </div>
          )}
          <div ref={contentRef}>
            <EditorContent editor={editor} />
          </div>
          {pop && renderCommentPopover && (
            <div className="no-print absolute z-30 w-[300px]" style={{ top: pop.top, left: pop.left }}>
              {renderCommentPopover(pop.id, () => setPop(null))}
            </div>
          )}
          {sel && onAddComment && draft === null && (
            <div className="no-print absolute z-30" style={{ top: sel.top, left: Math.max(8, sel.left) }}>
              <div className="flex gap-1 rounded-xl bg-surface border border-line/15 shadow-xl p-1 animate-[modalin_.12s_var(--ease-out)]">
                {([
                  ["comment", "Comment"],
                  ["edit_idea", "Editing idea"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setDraftKind(k);
                      setDraft("");
                    }}
                    className="rounded-lg px-3 h-9 sm:h-8 text-[12.5px] font-bold whitespace-nowrap text-white hover:brightness-110"
                    style={{ background: KIND_COLOR[k] }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sel && onAddComment && draft !== null && !isPhone && (
            <div className="no-print absolute z-30" style={{ top: sel.top, left: Math.max(8, Math.min(sel.left, (paperRef.current?.clientWidth ?? 600) - 308)) }}>
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
                busy={sending}
                onSubmit={() => void submitDraft()}
                onCancel={() => void requestDiscard()}
                sheet={false}
              />
            </div>
          )}
        </div>
        <p className="no-print mx-auto max-w-3xl mt-3 px-1 text-[11.5px] text-ink-soft md:hidden">
          {words} words · about {spokenLength(words)}
        </p>
        {lastEdited && <p className="no-print mx-auto max-w-3xl mt-1 px-1 text-[11.5px] text-ink-soft">{lastEdited}</p>}
      </div>
      {sideBySide && <div className="hidden lg:block min-w-0">{sideBySide}</div>}
      </div>
      {rightPanel}
      {/* Phones: the comment being written is a sheet at the bottom. */}
      {sel && onAddComment && draft !== null && isPhone &&
        createPortal(
          <div className="no-print fixed inset-x-0 bottom-0 z-[95] rounded-t-2xl border-t border-line/15 bg-surface shadow-[0_-20px_50px_-20px_rgb(0_0_0/0.45)] animate-[sheetup_.22s_var(--ease-out)]">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line/20" aria-hidden />
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
              busy={sending}
              onSubmit={() => void submitDraft()}
              onCancel={() => void requestDiscard()}
              sheet
            />
          </div>,
          document.body
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
            You have an unsent {backup.kind === "edit_idea" ? "editing idea" : "comment"} on <span className="font-semibold">“{backup.quote.slice(0, 40)}{backup.quote.length > 40 ? "…" : ""}”</span>.
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

function Toolbar({ editor, onImage, uploading }: { editor: Editor; onImage: () => void; uploading: number }) {
  const [more, setMore] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
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
    <div
      role="toolbar"
      aria-label="Formatting"
      className="no-print sticky top-14 sm:top-28 z-10 border-b border-line/10 bg-paper/95 backdrop-blur"
    >
      <div className="mx-auto max-w-5xl px-2 sm:px-6 py-1.5 flex items-center gap-0.5 sm:overflow-x-auto no-scrollbar">
        <div className="w-28 sm:w-36 flex-shrink-0 mr-1">
          <Select
            value={s!.block}
            onChange={(v) => {
              if (v === "p") c().setParagraph().run();
              else c().toggleHeading({ level: Number(v?.slice(1)) as 1 | 2 | 3 }).run();
            }}
            options={[
              { value: "p", label: "Text · Ctrl+Alt+0" },
              { value: "h1", label: "Heading 1 · Ctrl+Alt+1" },
              { value: "h2", label: "Heading 2 · Ctrl+Alt+2" },
              { value: "h3", label: "Heading 3 · Ctrl+Alt+3" },
            ]}
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
        <B label="Strikethrough" shortcut="Ctrl+Shift+S" on={s!.strike} onClick={() => c().toggleStrike().run()}>
          <StrikeIcon className="w-4 h-4" />
        </B>
        <HighlightMenu editor={editor} active={s!.highlight} />
        <Sep />
        <B label="Bullet list" on={s!.bullet} onClick={() => c().toggleBulletList().run()}>
          <ListBulletIcon className="w-4 h-4" />
        </B>
        <B label="Numbered list" on={s!.ordered} onClick={() => c().toggleOrderedList().run()}>
          <ListNumberIcon className="w-4 h-4" />
        </B>
        <B label="Checklist" on={s!.task} onClick={() => c().toggleTaskList().run()}>
          <ListCheckIcon className="w-4 h-4" />
        </B>
        <B label="Quote" on={s!.quote} onClick={() => c().toggleBlockquote().run()}>
          <QuoteIcon className="w-4 h-4" />
        </B>
        <Sep />
        <B label="Align left" on={s!.left} onClick={() => c().setTextAlign("left").run()}>
          <AlignLeftIcon className="w-4 h-4" />
        </B>
        <B label="Center" on={s!.center} onClick={() => c().setTextAlign("center").run()}>
          <AlignCenterIcon className="w-4 h-4" />
        </B>
        <B label="Align right" on={s!.right} onClick={() => c().setTextAlign("right").run()}>
          <AlignRightIcon className="w-4 h-4" />
        </B>
        <Sep />
        <LinkButton editor={editor} active={s!.link} />
        <B label={uploading ? `Uploading ${uploading}…` : "Add image"} onClick={onImage}>
          {uploading ? (
            <span className="w-4 h-4 rounded-full border-2 border-ink-soft/40 border-t-amber animate-spin" />
          ) : (
            <ImageIcon className="w-4 h-4" />
          )}
        </B>
        <Sep />
        <B label="Undo" shortcut="Ctrl+Z" disabled={!s!.canUndo} onClick={() => c().undo().run()}>
          <UndoIcon className="w-4 h-4" />
        </B>
        <B label="Redo" shortcut="Ctrl+Shift+Z" disabled={!s!.canRedo} onClick={() => c().redo().run()}>
          <RedoIcon className="w-4 h-4" />
        </B>
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
          aria-expanded={more}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setMore((m) => !m)}
          className="sm:hidden h-9 px-2.5 rounded-lg text-[12.5px] font-bold text-ink-soft hover:text-ink hover:bg-surface-2"
        >
          More
        </button>
      </div>
      <AnchoredMenu open={more} onClose={() => setMore(false)} anchor={moreBtn} label="Format">
        <div className="p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-3">Format</div>
            <div className="grid grid-cols-6 gap-1.5 [&_button]:w-full [&_button]:h-11">
              <B label="Strikethrough" on={s!.strike} onClick={() => c().toggleStrike().run()}>
                <StrikeIcon className="w-4 h-4" />
              </B>
              <B label="Highlight" on={s!.highlight} onClick={() => c().toggleHighlight().run()}>
                <HighlighterIcon className="w-4 h-4" />
              </B>
              <B label="Numbered list" on={s!.ordered} onClick={() => c().toggleOrderedList().run()}>
                <ListNumberIcon className="w-4 h-4" />
              </B>
              <B label="Checklist" on={s!.task} onClick={() => c().toggleTaskList().run()}>
                <ListCheckIcon className="w-4 h-4" />
              </B>
              <B label="Quote" on={s!.quote} onClick={() => c().toggleBlockquote().run()}>
                <QuoteIcon className="w-4 h-4" />
              </B>
              <B label="Add image" onClick={() => { setMore(false); onImage(); }}>
                <ImageIcon className="w-4 h-4" />
              </B>
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
              <B label="Undo" disabled={!s!.canUndo} onClick={() => c().undo().run()}>
                <UndoIcon className="w-4 h-4" />
              </B>
              <B label="Redo" disabled={!s!.canRedo} onClick={() => c().redo().run()}>
                <RedoIcon className="w-4 h-4" />
              </B>
            </div>
        </div>
      </AnchoredMenu>
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
        <div ref={box} role="menu" aria-label="Highlight color" style={style} className="z-[140] rounded-xl border border-line/15 bg-surface shadow-xl p-1 animate-[modalin_.12s_ease]">
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
        </div>,
        document.body
      )}
    </div>
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
        <div ref={box} style={style} className="z-[140] rounded-xl border border-line/15 bg-surface shadow-xl p-2 animate-[modalin_.12s_ease]">
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
        </div>,
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/30"
      >
        <DownloadIcon className="w-4 h-4" />
        <span className="hidden sm:inline">Export</span>
      </button>
      {open && (
        <div ref={box} role="menu" aria-label="Export" className="absolute right-0 top-[calc(100%+4px)] z-30 w-52 rounded-xl border border-line/15 bg-surface shadow-xl p-1">
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
      )}
    </div>
  );
}

/** Phones: views, paper and export in one menu (the top bar is narrow). */
function MobileMenu({
  view,
  onView,
  paper,
  onPaper,
  onDocx,
  onPdf,
}: {
  view: "strip" | "pages";
  onView: (v: "strip" | "pages") => void;
  paper: "light" | "dark";
  onPaper: () => void;
  onDocx: () => void;
  onPdf: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const item = "w-full text-left px-4 h-11 text-[14px] font-semibold flex items-center justify-between hover:bg-surface-2";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="sm:hidden">
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-label="More" aria-expanded={open} className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
        <MoreIcon className="w-5 h-5" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} label="More">
        <div className="py-1.5">
          <div className="px-4 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">View</div>
          {([
            ["strip", "One long page"],
            ["pages", "Pages"],
          ] as const).map(([v, label]) => (
            <button key={v} type="button" className={item} onClick={run(() => onView(v))}>
              {label}
              {view === v && <CheckIcon className="w-4 h-4 text-amber" />}
            </button>
          ))}
          <div className="h-px bg-line/10 my-1" />
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
