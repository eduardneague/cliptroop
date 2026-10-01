"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { ChevronDownIcon, CloseIcon, PlusIcon } from "@/components/ui/icons";
import { ScriptEditor } from "./script-editor";
import { ScriptImage } from "./script-image";
import type { DocListItem, ScriptComment, ScriptRow } from "../lib/queries";
import { findQuote } from "../lib/anchors";
import { addComment, createDoc, deleteComment, deleteDoc, getDocContent, renameDoc, resolveComment, saveScript } from "@/app/(dashboard)/scripts/actions";
import { Dialog } from "@/components/ui/dialog";

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
  roleColors,
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
  /** The team's role colours (dots, comment colours). */
  roleColors: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [sideOpen, setSideOpen] = useState(!!side);
  const [chatOpen, setChatOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const colorOf = (c: ScriptComment) => commentColor(c, roleColors);
  const open = comments.filter((c) => !c.resolved).length;

  const href = (next: { doc?: string; side?: string | null }) => {
    const q = new URLSearchParams(params.toString());
    q.delete("kind");
    if (next.doc) q.set("doc", next.doc);
    if (next.side === null) q.delete("side");
    else if (next.side) q.set("side", next.side);
    return `?${q.toString()}`;
  };

  const marks = useMemo(
    () => comments.map((c) => ({ id: c.id, quote: c.quote, occurrence: c.occurrence, resolved: c.resolved, color: commentColor(c, roleColors) })),
    [comments, roleColors]
  );

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
        setChatOpen(true);
      }}
      onAddComment={async (quote, occurrence, body, kind) => {
        const r = await addComment({ scriptId: doc.id, quote, occurrence, body, kind });
        if (r.error !== undefined) return r.error;
        setChatOpen(true);
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
          <SideBySideMenu
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
      leftRail={<DocRail owner={owner} docs={docs} current={doc.id} canCreate={canCreate} canEdit={canEdit} href={(id) => href({ doc: id })} roleColors={roleColors} />}
      sideBySide={
        sideOpen && side ? (
          <SidePage
            side={side}
            canEdit={side.kind === "research" ? canCreate.research : canCreate.script}
            swap={href({ doc: side.id, side: doc.id })}
            close={() => {
              setSideOpen(false);
              router.push(href({ side: null }), { scroll: false });
            }}
          />
        ) : undefined
      }
      mobileDocs={<MobileDocs owner={owner} docs={docs} current={doc} canCreate={canCreate} href={(id) => href({ doc: id })} roleColors={roleColors} />}
      renderCommentPopover={(id, close) => {
        const c = comments.find((x) => x.id === id);
        if (!c) return null;
        const color = colorOf(c);
        return (
          <div className="rounded-2xl border border-line/15 bg-surface shadow-2xl p-3 animate-[modalin_.12s_var(--ease-out)]" style={{ boxShadow: `inset 3px 0 0 ${color}, 0 20px 50px -20px rgb(0 0 0 / .5)` }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[12.5px] font-bold" style={{ color }}>{c.author?.name ?? "Someone"}</span>
              <span className="rounded-full px-2 h-5 inline-flex items-center text-[10.5px] font-bold text-white" style={{ background: color }}>
                {c.kind === "edit_idea" ? "Editing idea" : "Comment"}
              </span>
              <span className="ml-auto text-[11px] text-ink-faint">{relativeTime(c.createdAt)}</span>
            </div>
            <p className="text-[13.5px] text-ink whitespace-pre-wrap">{c.body}</p>
            <div className="flex items-center gap-1 mt-2 -mb-1">
              <button
                type="button"
                onClick={async () => {
                  const r = await resolveComment(c.id, !c.resolved);
                  if (r.error) toast.error(r.error);
                  else {
                    close();
                    router.refresh();
                  }
                }}
                className="rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
              >
                {c.resolved ? "Reopen" : "Resolve"}
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  setActive(c.id);
                  setChatOpen(true);
                }}
                className="rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
              >
                All comments
              </button>
              <span className="flex-1" />
              <button type="button" onClick={close} aria-label="Close" className="w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }}
      rightPanel={
        <CommentsChat
          open={chatOpen}
          setOpen={setChatOpen}
          comments={comments}
          active={active}
          onPick={setActive}
          docContent={doc.content}
          colorOf={colorOf}
          roleColors={roleColors}
        />
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
  roleColors,
}: {
  owner: Owner;
  docs: DocListItem[];
  current: string;
  canCreate: { script: boolean; research: boolean };
  canEdit: boolean;
  href: (id: string) => string;
  roleColors: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
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
    <nav className="lg:sticky lg:top-[10.5rem] lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto px-3 lg:px-4 pt-3 lg:py-6" aria-label="Documents">
      <div className="flex lg:flex-col gap-3 lg:gap-5 p-1">
        {groups.map((g) => (
          <div key={g.kind} className="flex lg:flex-col gap-1 flex-shrink-0">
            <div className="hidden lg:block px-2.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{g.label}</div>
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
                      prefetch={false}
                      onDoubleClick={(e) => {
                        if (!canEdit) return;
                        e.preventDefault();
                        setRenaming(d.id);
                      }}
                      title={canEdit ? "Double-click to rename" : undefined}
                      aria-current={d.id === current ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg pl-3 pr-8 h-9 lg:h-10 text-[13.5px] whitespace-nowrap transition-colors ${
                        d.id === current ? "bg-amber/12 text-ink font-bold ring-1 ring-amber/40" : "text-ink-soft hover:text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: DOT[d.name] ?? "transparent", boxShadow: DOT[d.name] ? undefined : "inset 0 0 0 1.5px rgb(var(--line) / 0.35)" }}
                      />
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
          router.push(href(id), { scroll: false });
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
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-60 rounded-xl border border-line/15 bg-surface shadow-2xl p-1.5 animate-[modalin_.12s_var(--ease-out)]">
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
}: {
  owner: Owner;
  docs: DocListItem[];
  current: ScriptRow;
  canCreate: { script: boolean; research: boolean };
  href: (id: string) => string;
  roleColors: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [adding, setAdding] = useState<"script" | "research" | null>(null);
  const DOT: Record<string, string | undefined> = { Script: roleColors.scripter, Review: roleColors.master, Staging: roleColors.editor, Research: roleColors.researcher };
  const groups = [
    { kind: "script" as const, label: "Versions", can: canCreate.script },
    ...("long" in owner ? [{ kind: "research" as const, label: "Research", can: canCreate.research }] : []),
  ];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 pl-2.5 pr-2 h-9 text-[13px] font-bold max-w-[9.5rem]">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOT[current.name] ?? "rgb(var(--line) / .4)" }} />
        <span className="truncate">{current.name}</span>
        <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0 text-ink-soft" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-surface border-t border-line/15 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] animate-[modalin_.15s_var(--ease-out)]" onClick={(e) => e.stopPropagation()}>
            {groups.map((g) => (
              <div key={g.kind} className="mb-2">
                <div className="px-2 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">{g.label}</div>
                {docs
                  .filter((d) => d.kind === g.kind)
                  .map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.push(href(d.id), { scroll: false });
                      }}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 h-12 text-[15px] ${d.id === current.id ? "bg-amber/10 font-bold" : "hover:bg-surface-2"}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DOT[d.name] ?? "rgb(var(--line) / .4)" }} />
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
        </div>
      )}
      <AddDocDialog
        kind={adding}
        owner={owner}
        suggested={adding === "research" ? `Research ${docs.filter((d) => d.kind === "research").length + 1}` : `Version ${docs.filter((d) => d.kind === "script").length + 1}`}
        onClose={() => setAdding(null)}
        onCreated={(id) => {
          setAdding(null);
          setOpen(false);
          router.push(href(id), { scroll: false });
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
function SidePage({ side, canEdit, swap, close }: { side: ScriptRow; canEdit: boolean; swap: string; close: () => void }) {
  const toast = useToast();
  const version = useRef(side.version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "conflict">("saved");
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: canEdit,
      extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false }), Highlight.configure({ multicolor: true }), TextAlign.configure({ types: ["heading", "paragraph"] }), TaskList, TaskItem.configure({ nested: true }), ScriptImage],
      content: side.content,
      editorProps: { attributes: { class: "script-doc outline-none" } },
      onUpdate: ({ editor: e }) => {
        if (!canEdit) return;
        setStatus("unsaved");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
          setStatus("saving");
          const text = e.getText();
          const r = await saveScript({ scriptId: side.id, expectedVersion: version.current, content: e.getJSON(), text, wordCount: text.trim() ? text.trim().split(/\s+/).length : 0 });
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
        }, 1200);
      },
    },
    [side.id]
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <div className="min-w-0">
      {/* Same height as the main page's title row, so both pages line up. */}
      <div className="h-8 mb-2 flex items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-soft truncate">
          {side.kind === "research" ? "Research · " : ""}
          {side.name}
        </span>
        <span className={`text-[11.5px] font-semibold ${status === "conflict" ? "text-red" : status === "saved" ? "text-green" : "text-ink-soft"}`}>
          {!canEdit ? "View only" : status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "conflict" ? "Not saved" : "Unsaved"}
        </span>
        <span className="flex-1" />
        <Link href={swap} scroll={false} prefetch={false} className="rounded-md px-2 h-7 inline-flex items-center text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Open here
        </Link>
        <button type="button" onClick={close} aria-label="Close side by side" className="w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div data-paper="light" className="script-paper mx-auto w-full max-w-[794px] rounded-md border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)] px-6 sm:px-[72px] py-10 sm:py-[72px] min-h-[60vh]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

const ROLE_ORDER = ["scripter", "researcher", "editor", "filmer", "packager", "publisher", "master"];
/** Editing ideas: the editor colour. Comments: the author's main role colour. */
function commentColor(c: ScriptComment, roleColors: Record<string, string>) {
  if (c.kind === "edit_idea") return roleColors.editor;
  const role = ROLE_ORDER.find((r) => c.authorRoles.includes(r) && r !== "master") ?? (c.authorRoles.includes("master") ? "master" : null);
  return role ? roleColors[role] : roleColors.master;
}

/** Comments as a small chat: a floating button, a panel on desktop, a sheet on phones. */
function CommentsChat({
  open,
  setOpen,
  comments,
  active,
  onPick,
  docContent,
  colorOf,
  roleColors,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  comments: ScriptComment[];
  active: string | null;
  onPick: (id: string) => void;
  docContent: Record<string, unknown>;
  colorOf: (c: ScriptComment) => string;
  roleColors: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "comment" | "edit_idea">("all");
  const [showResolved, setShowResolved] = useState(false);
  const openCount = comments.filter((c) => !c.resolved).length;
  const list = comments.filter((c) => (showResolved || !c.resolved) && (filter === "all" || c.kind === filter));
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open, comments.length]);
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
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="no-print fixed z-30 right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-6 inline-flex items-center gap-2 rounded-full bg-surface-2 text-ink border border-line/20 pl-4 pr-3 h-11 text-[13.5px] font-bold shadow-[0_12px_30px_-10px_rgb(0_0_0/0.6)] hover:border-line/40 hover:scale-[1.03] transition-transform"
        >
          Comments
          <span className={`rounded-full px-2 h-6 inline-flex items-center text-[12px] ${openCount ? "bg-amber text-white" : "bg-line/15 text-ink-soft"}`}>{openCount}</span>
        </button>
      )}
      {open && (
        <section
          className="no-print fixed z-40 inset-x-0 bottom-0 h-[78dvh] rounded-t-2xl lg:inset-auto lg:right-6 lg:bottom-6 lg:w-[400px] lg:h-[min(620px,calc(100dvh-9rem))] lg:rounded-2xl bg-surface border border-line/15 shadow-2xl flex flex-col animate-[modalin_.18s_var(--ease-out)]"
          aria-label="Comments"
        >
          <header className="px-4 pt-3.5 pb-2.5 border-b border-line/10 space-y-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold">Comments</h2>
              <span className="text-[12.5px] text-ink-soft">{openCount} open</span>
              <span className="flex-1" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close comments" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Show">
              {([
                ["all", "All", null],
                ["comment", "Comments", roleColors.master],
                ["edit_idea", "Editing ideas", roleColors.editor],
              ] as const).map(([k, label, dot]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={filter === k}
                  onClick={() => setFilter(k)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-[12.5px] font-semibold transition-colors ${filter === k ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
                >
                  {dot && <span className="w-2 h-2 rounded-full" style={{ background: dot }} />}
                  {label}
                </button>
              ))}
            </div>
          </header>
          <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
            {!list.length && (
              <p className="text-[13px] text-ink-soft text-center px-6 py-10">
                {comments.length ? "Nothing here with this filter." : "Select text in the script, then choose Comment or Editing idea."}
              </p>
            )}
            {list.map((c) => {
              const color = colorOf(c);
              return (
                <article
                  key={c.id}
                  onClick={() => onPick(c.id)}
                  className={`rounded-2xl p-3 cursor-pointer transition-shadow ${c.resolved ? "opacity-55" : ""} ${c.id === active ? "ring-2 ring-offset-2 ring-offset-surface" : ""}`}
                  style={{ background: `color-mix(in srgb, ${color} 11%, transparent)`, boxShadow: `inset 3px 0 0 ${color}`, ...(c.id === active ? { ["--tw-ring-color" as string]: color } : {}) }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: color }}>
                      {(c.author?.name ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-[12.5px] font-bold truncate" style={{ color }}>
                      {c.author?.name ?? "Someone"}
                    </span>
                    <span className="rounded-full px-2 h-5 inline-flex items-center text-[10.5px] font-bold text-white flex-shrink-0" style={{ background: color }}>
                      {c.kind === "edit_idea" ? "Editing idea" : "Comment"}
                    </span>
                    <span className="ml-auto text-[11px] text-ink-faint whitespace-nowrap">{relativeTime(c.createdAt)}</span>
                  </div>
                  <div className="text-[12px] text-ink-soft pl-2 mb-1.5 line-clamp-2 border-l-2" style={{ borderColor: color }}>
                    “{c.quote}”{missing.has(c.id) && <span className="ml-1.5 rounded bg-surface-2 px-1.5 text-[10.5px] font-bold">text changed</span>}
                  </div>
                  <p className="text-[13.5px] whitespace-pre-wrap">{c.body}</p>
                  <div className="flex items-center gap-1 mt-1.5 -mb-1">
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
              );
            })}
          </div>
          <footer className="px-4 py-2.5 border-t border-line/10 flex items-center gap-2 text-[12px] text-ink-soft pb-[calc(env(safe-area-inset-bottom)+0.625rem)]">
            <span className="flex-1">Select text to add one.</span>
            {comments.some((c) => c.resolved) && (
              <button type="button" onClick={() => setShowResolved((v) => !v)} className="font-semibold hover:text-ink">
                {showResolved ? "Hide resolved" : `Show resolved (${comments.filter((c) => c.resolved).length})`}
              </button>
            )}
          </footer>
        </section>
      )}
    </>
  );
}
