"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useEditor, EditorContent, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { createClient } from "@/lib/supabase/client";
import { saveScript } from "@/app/(dashboard)/scripts/actions";
import { useToast } from "@/components/ui/toast-provider";
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
} from "@/components/ui/icons";
import { CommentHighlights, commentKey, findQuote, occurrenceAt, type CommentMark } from "../lib/anchors";
import { ScriptImage } from "./script-image";
import { countWords, EMPTY_DOC, SCRIPT_TEMPLATE, spokenLength } from "../lib/text";

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
  comments = [],
  activeCommentId = null,
  onAddComment,
  onCommentClick,
  copySources = [],
  onCopyFrom,
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
  /** Right: side-by-side document or comments (a sheet on phones). */
  rightPanel?: React.ReactNode;
  /** Inline comments (anyone on the team can add them). */
  comments?: CommentMark[];
  activeCommentId?: string | null;
  onAddComment?: (quote: string, occurrence: number, body: string) => Promise<string | null>;
  onCommentClick?: (id: string) => void;
  /** "Copy from…" when this document is empty. */
  copySources?: { id: string; name: string }[];
  onCopyFrom?: (id: string) => Promise<Record<string, unknown> | null>;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<Status>("saved");
  const [words, setWords] = useState(0);
  const [paper, setPaper] = useState<"light" | "dark">("light");
  const [view, setView] = useState<"strip" | "pages" | "spread">("strip");
  // Spread (pages side by side) is a desktop view; phones fall back to Pages.
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const shown = view === "spread" && !wide ? "pages" : view;
  const [spreadPages, setSpreadPages] = useState(1);
  // Spread zoom: at least two pages fit across (never below 45%).
  const [spreadScale, setSpreadScale] = useState(1);
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
  const commentStateRef = useRef<{ comments: CommentMark[]; active: string | null }>({ comments, active: activeCommentId });

  useEffect(() => {
    try {
      const v = localStorage.getItem(PAPER_KEY);
      if (v === "light" || v === "dark") setPaper(v);
      const w = localStorage.getItem(VIEW_KEY);
      if (w === "strip" || w === "pages" || w === "spread") setView(w);
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

  // Comments changed (or another one is active): redraw the highlights.
  useEffect(() => {
    commentStateRef.current = { comments, active: activeCommentId };
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(commentKey, true));
  }, [comments, activeCommentId, editor]);
  // Jump to the comment picked in the list.
  useEffect(() => {
    if (!editor || !activeCommentId) return;
    const c = comments.find((x) => x.id === activeCommentId);
    const r = c ? findQuote(editor.state.doc, c.quote, c.occurrence) : null;
    if (!r) return;
    const node = editor.view.domAtPos(r.from).node as HTMLElement;
    (node.nodeType === 1 ? node : node.parentElement)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeCommentId, comments, editor]);

  // Selecting text shows a floating "Comment" button (even when view-only).
  const [sel, setSel] = useState<{ quote: string; occurrence: number; top: number; left: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (!editor || !onAddComment) return;
    const update = () => {
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

  // Save shortcut, unsaved-changes warning, and a final save when leaving.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flushRef.current();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (pendingRef.current || inflightRef.current) {
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

  // Spread: pages side by side (CSS columns, each column one A4 page).
  useEffect(() => {
    if (shown !== "spread" || !editor) return;
    const paperEl = paperRef.current;
    const contentEl = contentRef.current;
    if (!paperEl || !contentEl) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        paperEl.style.width = `${SPREAD_STEP * 60}px`;
        const last = contentEl.querySelector(".ProseMirror")?.lastElementChild as HTMLElement | null;
        // offsetLeft is in the page's own (unzoomed) coordinates.
        const right = last ? last.offsetLeft + last.offsetWidth : SPREAD_PAGE;
        const pages = Math.max(1, Math.ceil((right - SPREAD_PAD + 1) / SPREAD_STEP));
        paperEl.style.width = `${pages * SPREAD_STEP - SPREAD_GAP}px`;
        setSpreadPages(pages);
      });
    };
    measure();
    editor.on("update", measure);
    window.addEventListener("resize", measure);
    // Zoom so two pages fit the space next to the documents / side panel.
    const area = areaRef.current;
    const fit = () => {
      if (!area) return;
      const avail = area.clientWidth - 48;
      const scale = Math.max(0.45, Math.min(1, avail / (2 * SPREAD_STEP - SPREAD_GAP)));
      scaleRef.current = scale;
      setSpreadScale(scale);
    };
    fit();
    const ro = area ? new ResizeObserver(fit) : null;
    if (area) ro?.observe(area);
    return () => {
      cancelAnimationFrame(raf);
      editor.off("update", measure);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
      paperEl.style.width = "";
      scaleRef.current = 1;
    };
  }, [shown, editor]);

  function chooseView(v: "strip" | "pages" | "spread") {
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
    try {
      localStorage.setItem(PAPER_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const empty = useEditorState({ editor, selector: (s) => (s.editor ? s.editor.isEmpty : true) });

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
      <div className="no-print flex items-center gap-3 px-4 sm:px-6 h-14 border-b border-line/10 bg-paper/90 backdrop-blur sticky top-14 z-20">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink flex-shrink-0">
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
        <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          <span className="font-mono text-ink-soft mr-1.5">#{number}</span>
          {title}
          {docName && <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-bold text-ink-soft">{docName}</span>}
        </div>
        <span className="hidden md:inline text-[12px] text-ink-soft tabular-nums">
          {words} words · about {spokenLength(words)}
          {shown === "pages" ? ` · ${pageLayout.pages} page${pageLayout.pages === 1 ? "" : "s"}` : shown === "spread" ? ` · ${spreadPages} page${spreadPages === 1 ? "" : "s"}` : ""}
        </span>
        <div role="radiogroup" aria-label="View" className="hidden sm:flex items-center rounded-lg border border-line/15 p-0.5 flex-shrink-0">
          {([
            ["strip", "Strip"],
            ["pages", "Pages"],
            ["spread", "Spread"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => chooseView(v)}
              title={v === "spread" ? "Pages side by side" : v === "pages" ? "Pages one under another" : "One long page"}
              className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${v === "spread" ? "hidden lg:block" : ""} ${
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
        {topBarExtra}
        <button
          type="button"
          onClick={togglePaper}
          aria-label={paper === "light" ? "Dark paper" : "Light paper"}
          title={paper === "light" ? "Dark paper" : "Light paper"}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
        >
          {paper === "light" ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
        </button>
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
      {leftRail && <div className="no-print lg:w-56 flex-shrink-0 lg:border-r border-line/10">{leftRail}</div>}
      {/* Paper */}
      <div ref={areaRef} className={`flex-1 min-w-0 px-3 sm:px-6 py-6 sm:py-10 ${shown === "spread" ? "overflow-x-auto" : ""}`}>
        <div style={shown === "spread" ? { width: (spreadPages * SPREAD_STEP - SPREAD_GAP) * spreadScale, height: SPREAD_PAGE_H * spreadScale } : undefined}>
        <div
          ref={paperRef}
          data-paper={paper}
          data-view={shown}
          style={
            shown === "pages"
              ? { minHeight: pageLayout.pages * pageLayout.pageH }
              : shown === "spread"
                ? {
                    height: SPREAD_PAGE_H,
                    padding: SPREAD_PAD,
                    columnWidth: SPREAD_PAGE - SPREAD_PAD * 2,
                    columnGap: SPREAD_PAD * 2 + SPREAD_GAP,
                    columnFill: "auto",
                    // The app's background between pages.
                    backgroundImage: `linear-gradient(to right, transparent 0 ${SPREAD_PAGE}px, rgb(var(--paper)) ${SPREAD_PAGE}px ${SPREAD_STEP}px)`,
                    backgroundSize: `${SPREAD_STEP}px 100%`,
                    transform: spreadScale !== 1 ? `scale(${spreadScale})` : undefined,
                    transformOrigin: "top left",
                  }
                : undefined
          }
          onClick={(e) => {
            const id = (e.target as HTMLElement).closest<HTMLElement>("[data-comment-id]")?.dataset.commentId;
            if (id) onCommentClick?.(id);
          }}
          className={`script-paper script-print relative isolate transition-colors ${
            shown === "spread"
              ? "rounded-md"
              : `mx-auto w-full border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)] ${
                  shown === "pages" ? "max-w-[794px] rounded-md px-6 sm:px-[72px] py-10 sm:py-[72px]" : "max-w-3xl rounded-2xl px-5 sm:px-14 py-8 sm:py-14"
                }`
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
            <div className="no-print mb-6 flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 script-soft-border">
              <DocumentIcon className="w-5 h-5 script-soft flex-shrink-0" />
              <p className="text-[13px] script-soft flex-1">Start from a Hook, Body and Call to action outline?</p>
              <button
                type="button"
                onClick={() => editor?.commands.setContent(SCRIPT_TEMPLATE, { emitUpdate: true })}
                className="rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px]"
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
          )}
          <div ref={contentRef}>
            <EditorContent editor={editor} />
          </div>
          {sel && onAddComment && (
            <div className="no-print absolute z-30" style={{ top: sel.top, left: Math.max(8, sel.left) }}>
              {draft === null ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setDraft("")}
                  className="rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px] shadow-lg animate-[modalin_.12s_var(--ease-out)]"
                >
                  Comment
                </button>
              ) : (
                <div className="w-[280px] rounded-xl border border-line/15 bg-surface shadow-2xl p-2.5 space-y-2 animate-[modalin_.12s_var(--ease-out)]">
                  <div className="text-[11.5px] text-ink-soft truncate">“{sel.quote}”</div>
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Escape") {
                        setDraft(null);
                        setSel(null);
                      }
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
                        const err = await onAddComment(sel.quote, sel.occurrence, draft);
                        if (err) toast.error(err);
                        else {
                          setDraft(null);
                          setSel(null);
                        }
                      }
                    }}
                    rows={3}
                    maxLength={2000}
                    placeholder="Your comment…"
                    className="w-full rounded-lg border border-line/15 bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:ring-2 focus:ring-amber"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(null);
                        setSel(null);
                      }}
                      className="rounded-lg px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!draft.trim()}
                      onClick={async () => {
                        const err = await onAddComment(sel.quote, sel.occurrence, draft);
                        if (err) toast.error(err);
                        else {
                          setDraft(null);
                          setSel(null);
                        }
                      }}
                      className="rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px] disabled:opacity-50"
                    >
                      Comment
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
        <p className="no-print mx-auto max-w-3xl mt-3 px-1 text-[11.5px] text-ink-soft md:hidden">
          {words} words · about {spokenLength(words)}
        </p>
        {lastEdited && <p className="no-print mx-auto max-w-3xl mt-1 px-1 text-[11.5px] text-ink-soft">{lastEdited}</p>}
      </div>
      {rightPanel}
      </div>
    </div>
  );
}

// Spread view: A4 at 96 dpi, 72px margins, 32px between pages.
const SPREAD_PAGE = 794;
const SPREAD_PAGE_H = 1123;
const SPREAD_PAD = 72;
const SPREAD_GAP = 32;
const SPREAD_STEP = SPREAD_PAGE + SPREAD_GAP;

// ---------------------------------------------------------------------------

function Toolbar({ editor, onImage, uploading }: { editor: Editor; onImage: () => void; uploading: number }) {
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
      className="no-print sticky top-28 z-10 border-b border-line/10 bg-paper/95 backdrop-blur"
    >
      <div className="mx-auto max-w-5xl px-3 sm:px-6 py-1.5 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
        <div className="w-36 flex-shrink-0 mr-1">
          <Select
            value={s!.block}
            onChange={(v) => {
              if (v === "p") c().setParagraph().run();
              else c().toggleHeading({ level: Number(v?.slice(1)) as 1 | 2 | 3 }).run();
            }}
            options={[
              { value: "p", label: "Text" },
              { value: "h1", label: "Heading 1" },
              { value: "h2", label: "Heading 2" },
              { value: "h3", label: "Heading 3" },
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
      </div>
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
