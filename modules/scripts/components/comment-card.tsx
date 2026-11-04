"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ago } from "@/components/ui/ago";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { CheckIcon, CloseIcon, EditIcon, RetryIcon, TrashIcon } from "@/components/ui/icons";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { deleteComment, editComment, resolveComment } from "@/app/(dashboard)/scripts/actions";
import { wordColor } from "@/lib/word-color";
import type { ScriptComment } from "../lib/queries";
import type { PostingComment } from "../lib/anchors";
import type { MentionPerson } from "../lib/mention-people";
import { CommentComposer, KIND_COLOR, KIND_LABEL, KindMark, MentionText, QuoteBlock, WholeDocTag } from "./comment-composer";

/*
 * One comment or editing idea (1.50.0): the same card in the comments panel and in the small box that opens on its
 * words. Who wrote it and when ("edited" once its author changed it), what it's on (its words, as many lines as they
 * run over, or the whole document), what it says, and what you may do: change it (its author), resolve or reopen it
 * (the people working on the script), delete it (its author, or a master).
 */

type Me = { userId: string; master: boolean } | null;

/** Resolving hides a comment / editing idea from the list: ask first. */
export function confirmResolve(confirm: ReturnType<typeof useConfirm>, c: ScriptComment) {
  const idea = c.kind === "edit_idea";
  return confirm({
    title: idea ? "Resolve this editing idea?" : "Resolve this comment?",
    description: `It's marked as done and hidden from the list (Show resolved brings it back). You can reopen it any time.`,
    confirmLabel: "Resolve",
  });
}

/** Deleting can't be undone: ask first. */
export function confirmDelete(confirm: ReturnType<typeof useConfirm>, c: ScriptComment) {
  const idea = c.kind === "edit_idea";
  return confirm({
    title: idea ? "Delete this editing idea?" : "Delete this comment?",
    description: c.sketch ? "Its drawing is deleted too. This can't be undone." : "This can't be undone.",
    confirmLabel: "Delete",
    danger: true,
  });
}

/** A drawing alone has a caption of "Sketch": that's not words to show. */
const onlySketch = (c: ScriptComment) => !!c.sketch && c.body.trim() === "Sketch";

/** A comment's text (mentions highlighted) and its sketch, if it has one. */
export function CommentBody({ c, people, roleColors, onSketch }: { c: ScriptComment; people: MentionPerson[]; roleColors: Record<string, string>; onSketch: () => void }) {
  return (
    <>
      {!onlySketch(c) && (
        <p className="text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap break-words">
          <MentionText text={c.body} people={people} roleColors={roleColors} />
        </p>
      )}
      {c.sketch && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSketch();
          }}
          className="group/sk relative mt-2 block w-full rounded-lg border border-line/15 bg-white overflow-hidden hover:border-line/35 transition-colors"
          aria-label="Open the sketch"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.sketch.url} alt="Sketch" loading="lazy" className="w-full max-h-40 object-contain" />
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 text-white px-1.5 h-5 inline-flex items-center text-[10.5px] font-semibold opacity-0 group-hover/sk:opacity-100 transition-opacity">View</span>
        </button>
      )}
    </>
  );
}

export function KindChip({ kind }: { kind: ScriptComment["kind"] }) {
  const color = KIND_COLOR[kind];
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 h-5 text-[10.5px] font-bold flex-shrink-0" style={{ color: wordColor(color), background: `color-mix(in srgb, ${color} 13%, transparent)` }}>
      <KindMark kind={kind} className="w-3 h-3" />
      {KIND_LABEL[kind]}
    </span>
  );
}

const ACTION = "inline-flex items-center gap-1 rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft transition-colors disabled:opacity-50";

export function CommentCard({
  c,
  people,
  roleColors,
  me,
  canComment,
  mayDelete,
  changed = false,
  active = false,
  variant,
  onPick,
  onSketch,
  onDone,
  onAll,
  onClose,
}: {
  c: ScriptComment;
  people: MentionPerson[];
  roleColors: Record<string, string>;
  me: Me;
  /** May resolve and reopen (the people working on this script). */
  canComment: boolean;
  /** May delete (its author, or a master). */
  mayDelete: boolean;
  /** Its words are no longer in the document (rewritten or deleted since). */
  changed?: boolean;
  active?: boolean;
  /** list: in the comments panel; popover: the small box on its words. */
  variant: "list" | "popover";
  onPick?: () => void;
  onSketch: () => void;
  /** Resolved, reopened or deleted (the small box closes). */
  onDone?: () => void;
  /** The small box: open the panel on it, and close. */
  onAll?: () => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const color = KIND_COLOR[c.kind];
  const mine = !!me && !!c.author && c.author.id === me.userId;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"save" | "resolve" | "delete" | null>(null);
  // The words just saved, shown until the page has them.
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (saved !== null && c.body === saved) setSaved(null);
  }, [c.body, saved]);
  const shown = saved !== null ? { ...c, body: saved } : c;
  const edited = !!c.editedAt || saved !== null;
  const start = onlySketch(c) ? "" : c.body;

  // The small box: Esc closes it (unless a change is being written: that Esc is the box's own).
  useEffect(() => {
    if (variant !== "popover" || editing || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant, editing, onClose]);

  async function cancelEdit() {
    if (text.trim() !== start.trim()) {
      const ok = await confirm({ title: "Discard your changes?", description: "It stays as it was.", confirmLabel: "Discard", danger: true });
      if (!ok) return;
    }
    setEditing(false);
  }
  async function save() {
    const body = text.trim() || (c.sketch ? "Sketch" : "");
    if (!body) return toast.error("Write something, or delete it instead.");
    if (body === c.body) return setEditing(false);
    setBusy("save");
    const r = await editComment(c.id, body);
    setBusy(null);
    if (r.error) return toast.error(r.error);
    setSaved(body);
    setEditing(false);
    router.refresh();
  }
  async function resolve() {
    if (!c.resolved && !(await confirmResolve(confirm, c))) return;
    setBusy("resolve");
    const r = await resolveComment(c.id, !c.resolved);
    setBusy(null);
    if (r.error) return toast.error(r.error);
    onDone?.();
    router.refresh();
  }
  async function remove() {
    if (!(await confirmDelete(confirm, c))) return;
    setBusy("delete");
    const r = await deleteComment(c.id);
    setBusy(null);
    if (r.error) return toast.error(r.error);
    onDone?.();
    router.refresh();
  }

  const pop = variant === "popover";
  const head = (
    <div className="flex items-start gap-2.5">
      <PersonAvatar name={c.author?.name ?? "?"} avatarUrl={c.author?.avatarUrl ?? null} color={c.author?.color ?? "#888"} className="w-7 h-7 text-[10.5px] flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13px] font-semibold text-ink truncate">{c.author?.name ?? "Someone"}</span>
          <KindChip kind={c.kind} />
        </div>
        <div className="text-[11px] text-ink-faint leading-tight mt-0.5 whitespace-nowrap">
          <Ago iso={c.createdAt} />
          {edited && (
            <span title={c.editedAt ? `Changed ${new Date(c.editedAt).toLocaleString("en-US")}` : "Changed just now"}> · edited</span>
          )}
          {c.resolved && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-green">
              <CheckIcon className="w-3 h-3" />
              Resolved
            </span>
          )}
        </div>
      </div>
      {pop && onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  const place = (
    <div className="mt-2 space-y-1">
      {c.quote ? <QuoteBlock quote={c.quote} color={color} lines={pop ? 4 : 3} /> : <WholeDocTag color={color} />}
      {changed && (
        <span className="inline-flex rounded-md bg-surface-2 px-1.5 h-5 items-center text-[10.5px] font-bold text-ink-soft" title="These words were changed or deleted since">
          Text changed since
        </span>
      )}
    </div>
  );

  const body = editing ? (
    <div className="mt-2">
      <CommentComposer
        variant="edit"
        kind={c.kind}
        quote={c.quote}
        people={people}
        roleColors={roleColors}
        text={text}
        setText={setText}
        sketchUrl={c.sketch?.url ?? null}
        notifyBefore={c.body}
        busy={busy === "save"}
        onSubmit={() => void save()}
        onCancel={() => void cancelEdit()}
      />
    </div>
  ) : (
    <div className={`mt-2 ${pop ? "max-h-[38vh] overflow-y-auto overflow-x-hidden styled-scroll pr-0.5" : ""}`}>
      <CommentBody c={shown} people={people} roleColors={roleColors} onSketch={onSketch} />
    </div>
  );

  const canEdit = mine && canComment;
  const actions = !editing && (canEdit || canComment || mayDelete || onAll) && (
    <div className={`flex items-center gap-0.5 flex-wrap ${pop ? "mt-2.5 pt-2 border-t border-line/10" : "mt-2 -mb-1 -ml-1"}`}>
      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setText(start);
            setEditing(true);
          }}
          className={`${ACTION} hover:text-ink hover:bg-surface-2`}
        >
          <EditIcon className="w-3.5 h-3.5" />
          Edit
        </button>
      )}
      {canComment && (
        <button
          type="button"
          disabled={!!busy}
          onClick={(e) => {
            e.stopPropagation();
            void resolve();
          }}
          className={`${ACTION} hover:text-ink hover:bg-surface-2`}
        >
          {c.resolved ? <RetryIcon className="w-3.5 h-3.5" /> : <CheckIcon className="w-3.5 h-3.5" />}
          {busy === "resolve" ? (c.resolved ? "Reopening…" : "Resolving…") : c.resolved ? "Reopen" : "Resolve"}
        </button>
      )}
      {mayDelete && (
        <button
          type="button"
          disabled={!!busy}
          onClick={(e) => {
            e.stopPropagation();
            void remove();
          }}
          className={`${ACTION} hover:text-red hover:bg-red/10`}
        >
          <TrashIcon className="w-3.5 h-3.5" />
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      )}
      {pop && onAll && (
        <button type="button" onClick={onAll} className={`${ACTION} ml-auto hover:text-ink hover:bg-surface-2`}>
          All comments
        </button>
      )}
    </div>
  );

  if (pop) {
    return (
      <div
        className="pop-menu origin-top-left rounded-2xl border border-line/15 bg-surface text-ink p-3"
        style={{ boxShadow: `inset 0 3px 0 ${color}, 0 24px 60px -20px rgb(0 0 0 / 0.55)` }}
        // Inside the box: nothing closes it (the page around it closes it on a click).
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${KIND_LABEL[c.kind]} by ${c.author?.name ?? "someone"}`}
      >
        {head}
        {place}
        {body}
        {actions}
      </div>
    );
  }

  return (
    <article
      onClick={onPick}
      className={`rounded-xl border bg-surface p-3 transition-[border-color,box-shadow] ${onPick ? "cursor-pointer" : ""} ${active ? "border-transparent ring-2" : "border-line/10 hover:border-line/25"}`}
      style={{
        boxShadow: `inset 3px 0 0 ${color}`,
        ...(active ? { ["--tw-ring-color" as string]: `color-mix(in srgb, ${color} 60%, transparent)` } : {}),
      }}
    >
      <div className={c.resolved ? "opacity-70" : undefined}>
        {head}
        {place}
        {body}
      </div>
      {actions}
    </article>
  );
}

/** One on its way to the server: shown at once, until the saved one arrives. */
export function PostingCard({ p, meAs }: { p: PostingComment; meAs: MentionPerson | null }) {
  const color = KIND_COLOR[p.kind];
  return (
    <article
      aria-busy="true"
      aria-label={p.kind === "edit_idea" ? "Posting your editing idea" : "Posting your comment"}
      className="rounded-xl border border-line/10 bg-surface p-3 animate-[rise-in_.3s_var(--ease-out)]"
      style={{ boxShadow: `inset 3px 0 0 ${color}` }}
    >
      <div className="flex items-start gap-2.5">
        {meAs ? <PersonAvatar name={meAs.name} avatarUrl={meAs.avatarUrl} color={meAs.color} className="w-7 h-7 text-[10.5px] flex-shrink-0" /> : <SkeletonCircle className="w-7 h-7" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {meAs ? <span className="text-[13px] font-semibold text-ink truncate">{meAs.name}</span> : <Skeleton className="h-3 w-20" />}
            <KindChip kind={p.kind} />
          </div>
          <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-ink-faint whitespace-nowrap">
            <span className="w-3 h-3 rounded-full border-2 border-ink-faint/30 border-t-amber animate-spin" aria-hidden />
            Posting…
          </div>
        </div>
      </div>
      <div className="mt-2">{p.quote ? <QuoteBlock quote={p.quote} color={color} /> : <WholeDocTag color={color} />}</div>
      {p.body && p.body !== "Sketch" && <p className="mt-2 text-[13.5px] leading-relaxed text-ink/70 whitespace-pre-wrap break-words">{p.body}</p>}
      {p.sketchUrl && <Skeleton className="mt-2 h-20 w-full rounded-lg" />}
    </article>
  );
}
