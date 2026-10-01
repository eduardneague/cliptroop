"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { relativeTime } from "@/lib/relative-time";
import { CloseIcon, PlusIcon } from "@/components/ui/icons";
import { ScriptEditor } from "./script-editor";
import { ScriptImage } from "./script-image";
import type { DocListItem, ScriptComment, ScriptRow } from "../lib/queries";
import { findQuote } from "../lib/anchors";
import { addComment, createDoc, deleteComment, deleteDoc, getDocContent, renameDoc, resolveComment } from "@/app/(dashboard)/scripts/actions";

type Owner = { short: string } | { long: string };

/**
 * The script workspace: documents on the left (versions + research), the
 * editor in the middle, and a right panel for a side-by-side document or
 * the comments. Built around the regular ScriptEditor.
 */
export function ScriptWorkspace({
  owner,
  docs,
  doc,
  canEdit,
  canCreate,
  side,
  comments,
  title,
  number,
  backHref,
  backLabel,
  topBarExtra,
  lastEdited,
}: {
  owner: Owner;
  docs: DocListItem[];
  doc: ScriptRow;
  canEdit: boolean;
  canCreate: { script: boolean; research: boolean };
  side: ScriptRow | null;
  comments: ScriptComment[];
  title: string;
  number: number;
  backHref: string;
  backLabel: string;
  topBarExtra?: React.ReactNode;
  lastEdited: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [panel, setPanel] = useState<"side" | "comments" | null>(side ? "side" : null);
  const [active, setActive] = useState<string | null>(null);
  const open = comments.filter((c) => !c.resolved).length;

  const href = (next: { doc?: string; side?: string | null }) => {
    const q = new URLSearchParams(params.toString());
    q.delete("kind");
    if (next.doc) q.set("doc", next.doc);
    if (next.side === null) q.delete("side");
    else if (next.side) q.set("side", next.side);
    return `?${q.toString()}`;
  };

  const marks = useMemo(() => comments.map((c) => ({ id: c.id, quote: c.quote, occurrence: c.occurrence, resolved: c.resolved })), [comments]);

  return (
    <ScriptEditor
      key={doc.id}
      scriptId={doc.id}
      teamId={doc.teamId}
      initialContent={doc.content}
      initialVersion={doc.version}
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
        setPanel("comments");
      }}
      onAddComment={async (quote, occurrence, body) => {
        const r = await addComment({ scriptId: doc.id, quote, occurrence, body });
        if (r.error !== undefined) return r.error;
        setPanel("comments");
        setActive(r.id);
        router.refresh();
        return null;
      }}
      copySources={docs.filter((d) => d.id !== doc.id).map((d) => ({ id: d.id, name: `${d.kind === "research" ? "Research · " : ""}${d.name}` }))}
      onCopyFrom={async (id) => {
        const r = await getDocContent(id);
        if (r.error !== undefined) {
          toast.error(r.error);
          return null;
        }
        return r.content;
      }}
      topBarExtra={
        <>
          {topBarExtra}
          <button
            type="button"
            onClick={() => setPanel((p) => (p === "side" ? null : "side"))}
            aria-pressed={panel === "side"}
            className={`hidden sm:inline-flex items-center rounded-lg border px-2.5 h-8 text-[12px] font-semibold ${panel === "side" ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
          >
            Side by side
          </button>
          <button
            type="button"
            onClick={() => setPanel((p) => (p === "comments" ? null : "comments"))}
            aria-pressed={panel === "comments"}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 h-8 text-[12px] font-semibold ${panel === "comments" ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
          >
            Comments
            {open > 0 && <span className="rounded-full bg-amber text-white px-1.5 text-[10.5px] font-bold">{open}</span>}
          </button>
        </>
      }
      leftRail={<DocRail owner={owner} docs={docs} current={doc.id} canCreate={canCreate} canEdit={canEdit} href={(id) => href({ doc: id })} />}
      rightPanel={
        panel && (
          <aside className="no-print fixed inset-x-0 bottom-0 top-24 z-40 lg:sticky lg:top-[10.5rem] lg:self-start lg:max-h-[calc(100dvh-11rem)] lg:z-auto lg:w-[42%] lg:max-w-[680px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-line/10 bg-paper lg:bg-transparent flex flex-col rounded-t-2xl lg:rounded-none shadow-2xl lg:shadow-none">
            <div className="flex items-center gap-1 px-3 h-12 border-b border-line/10 flex-shrink-0">
              {(["side", "comments"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPanel(t)}
                  className={`px-3 h-8 rounded-md text-[12.5px] font-semibold ${panel === t ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
                >
                  {t === "side" ? "Side by side" : `Comments${open ? ` · ${open}` : ""}`}
                </button>
              ))}
              <span className="flex-1" />
              <button type="button" onClick={() => setPanel(null)} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {panel === "side" ? (
                <SidePane docs={docs.filter((d) => d.id !== doc.id)} side={side} pick={(id) => router.push(href({ side: id }), { scroll: false })} swap={side ? href({ doc: side.id, side: doc.id }) : null} />
              ) : (
                <CommentList comments={comments} active={active} onPick={setActive} docContent={doc.content} />
              )}
            </div>
          </aside>
        )
      }
    />
  );
}

function DocRail({
  owner,
  docs,
  current,
  canCreate,
  canEdit,
  href,
}: {
  owner: Owner;
  docs: DocListItem[];
  current: string;
  canCreate: { script: boolean; research: boolean };
  canEdit: boolean;
  href: (id: string) => string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<string | null>(null);
  const groups = [
    { kind: "script" as const, label: "Versions", add: "Add version", can: canCreate.script },
    ...("long" in owner ? [{ kind: "research" as const, label: "Research", add: "Add research", can: canCreate.research }] : []),
  ];
  const DEFAULTS = ["Script", "Review", "Staging", "Research"];

  async function add(kind: "script" | "research") {
    const name = kind === "research" ? `Research ${docs.filter((d) => d.kind === "research").length + 1}` : `Version ${docs.filter((d) => d.kind === "script").length + 1}`;
    const r = await createDoc({ ...("short" in owner ? { short: owner.short } : { long: owner.long }), kind, name });
    if (r.error !== undefined) toast.error(r.error);
    else router.push(href(r.id), { scroll: false });
  }

  return (
    <nav className="lg:sticky lg:top-[10.5rem] lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto px-3 lg:px-2.5 pt-3 lg:py-4" aria-label="Documents">
      <div className="flex lg:flex-col gap-3 overflow-x-auto no-scrollbar">
        {groups.map((g) => (
          <div key={g.kind} className="flex lg:flex-col gap-1 flex-shrink-0">
            <div className="hidden lg:block px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{g.label}</div>
            {docs
              .filter((d) => d.kind === g.kind)
              .map((d) => (
                <div key={d.id} className="group relative flex-shrink-0">
                  {renaming === d.id ? (
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
                    <Link
                      href={href(d.id)}
                      scroll={false}
                      onDoubleClick={(e) => {
                        if (!canEdit) return;
                        e.preventDefault();
                        setRenaming(d.id);
                      }}
                      title={canEdit ? "Double-click to rename" : undefined}
                      aria-current={d.id === current ? "page" : undefined}
                      className={`flex items-center gap-2 rounded-lg pl-2.5 pr-7 h-9 lg:h-auto lg:py-2 text-[13px] whitespace-nowrap transition-colors ${
                        d.id === current ? "bg-amber/12 text-ink font-bold ring-1 ring-amber/40" : "text-ink-soft hover:text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span className="truncate">{d.name}</span>
                      <span className="hidden lg:inline ml-auto text-[11px] font-normal text-ink-faint tabular-nums">{d.wordCount}w</span>
                    </Link>
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
                onClick={() => void add(g.kind)}
                className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 border border-dashed border-line/25"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                {g.add}
              </button>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}

/** A second document, read-only, next to the one being written. */
function SidePane({ docs, side, pick, swap }: { docs: DocListItem[]; side: ScriptRow | null; pick: (id: string) => void; swap: string | null }) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false }), Highlight.configure({ multicolor: true }), TextAlign.configure({ types: ["heading", "paragraph"] }), TaskList, TaskItem.configure({ nested: true }), ScriptImage],
      content: side?.content ?? { type: "doc", content: [] },
      editorProps: { attributes: { class: "script-doc outline-none" } },
    },
    [side?.id]
  );
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={side?.id ?? ""}
          onChange={(e) => e.target.value && pick(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-line/20 bg-surface px-2.5 h-9 text-[13px] font-semibold"
          aria-label="Document to show next to this one"
        >
          <option value="">Pick a document…</option>
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.kind === "research" ? "Research · " : ""}
              {d.name}
            </option>
          ))}
        </select>
        {swap && (
          <Link href={swap} scroll={false} className="rounded-lg border border-line/20 px-3 h-9 inline-flex items-center text-[12.5px] font-semibold hover:border-line/40" title="Open this one in the editor">
            Open here
          </Link>
        )}
      </div>
      {side ? (
        <div data-paper="light" className="script-paper rounded-xl border border-line/10 px-5 py-6 text-[0.92em]">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <p className="text-[13px] text-ink-soft px-1">Pick research or another version to read it next to this one.</p>
      )}
    </div>
  );
}

function CommentList({
  comments,
  active,
  onPick,
  docContent,
}: {
  comments: ScriptComment[];
  active: string | null;
  onPick: (id: string) => void;
  docContent: Record<string, unknown>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [showResolved, setShowResolved] = useState(false);
  const list = comments.filter((c) => showResolved || !c.resolved);
  // Which quotes can no longer be found (the text was rewritten).
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const ed = useEditor({ immediatelyRender: false, editable: false, extensions: [StarterKit, ScriptImage, TaskList, TaskItem], content: docContent }, [docContent]);
  useEffect(() => {
    if (!ed) return;
    setMissing(new Set(comments.filter((c) => !findQuote(ed.state.doc, c.quote, c.occurrence)).map((c) => c.id)));
  }, [ed, comments]);

  async function act(fn: () => Promise<{ error?: string }>) {
    const r = await fn();
    if (r.error) toast.error(r.error);
    else router.refresh();
  }
  return (
    <div className="p-3 space-y-2">
      {!comments.length && <p className="text-[13px] text-ink-soft px-1">Select text in the script, then press Comment.</p>}
      {list.map((c) => (
        <article
          key={c.id}
          onClick={() => onPick(c.id)}
          className={`rounded-xl border p-3 cursor-pointer transition-colors ${c.id === active ? "border-amber bg-amber/[0.06]" : "border-line/10 hover:border-line/25"} ${c.resolved ? "opacity-60" : ""}`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: c.author?.color ?? "#888" }}>
              {(c.author?.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="text-[12.5px] font-semibold truncate">{c.author?.name ?? "Someone"}</span>
            <span className="text-[11.5px] text-ink-faint">{relativeTime(c.createdAt)}</span>
            {missing.has(c.id) && <span className="ml-auto rounded bg-surface-2 px-1.5 text-[10.5px] font-bold text-ink-soft">text changed</span>}
          </div>
          <div className="text-[12px] text-ink-soft border-l-2 border-amber/60 pl-2 mb-1.5 line-clamp-2">“{c.quote}”</div>
          <p className="text-[13.5px] whitespace-pre-wrap">{c.body}</p>
          <div className="flex items-center gap-1 mt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void act(() => resolveComment(c.id, !c.resolved));
              }}
              className="rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
            >
              {c.resolved ? "Reopen" : "Resolve"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void act(() => deleteComment(c.id));
              }}
              className="rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-red hover:bg-red/10"
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {comments.some((c) => c.resolved) && (
        <button type="button" onClick={() => setShowResolved((v) => !v)} className="w-full text-[12.5px] font-semibold text-ink-soft hover:text-ink py-2">
          {showResolved ? "Hide resolved" : `Show resolved (${comments.filter((c) => c.resolved).length})`}
        </button>
      )}
    </div>
  );
}
