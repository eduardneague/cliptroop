"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { relativeTime } from "@/lib/relative-time";
import { CheckIcon, CopyIcon, ExternalIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { markEdited, markFilmed, reviewLong, saveLongDescription, setLongPlatforms, setLongPosted } from "./actions";

const PLATFORMS = [
  { id: "youtube", name: "YouTube" },
  { id: "facebook", name: "Facebook" },
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
] as const;

const field = "w-full rounded-xl border border-line/15 bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-amber transition-shadow";

/** The "your turn" box: orange, one clear action. */
function TurnBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-amber bg-amber/10 p-5 space-y-3.5 animate-[modalin_.25s_var(--ease-out)]">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber">{title}</h3>
      {children}
    </section>
  );
}

/** A finished step: who, when, and what they said. */
function DoneBox({ title, by, at, children }: { title: string; by: string | null; at: string | null; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface-2/40 p-4 flex gap-3">
      <span className="w-7 h-7 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: "rgb(var(--teal))" }}>
        <CheckIcon className="w-4 h-4" />
      </span>
      <div className="min-w-0 space-y-1.5">
        <div className="text-[14px] font-semibold">{title}</div>
        {(by || at) && (
          <div className="text-[12.5px] text-ink-soft">
            {by ? `by ${by}` : ""}
            {by && at ? ", " : ""}
            {at ? relativeTime(at) : ""}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

function CopyText({ text }: { text: string }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface border border-line/15 px-3 py-2 min-w-0">
      <code className="text-[13px] truncate flex-1">{text}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text);
          toast.success("Copied");
        }}
        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft hover:text-ink flex-shrink-0"
      >
        <CopyIcon className="w-3.5 h-3.5" />
        Copy
      </button>
    </div>
  );
}

function useStep() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  /** Runs a step action; `goTo` opens the step the video moved to. */
  const run = (fn: () => Promise<{ error?: string; stage?: string }>, ok: string, goTo?: string) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else {
        toast.success(ok);
        const target = goTo ?? (r.stage === "done" || r.stage === "publish" ? r.stage : undefined);
        if (target) router.push(`?tab=${target}`, { scroll: false });
        else router.refresh();
      }
    });
  return { pending, run };
}

function Spinner() {
  return <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />;
}

// ---------------------------------------------------------------------------

export function FilmPanel({
  projectId,
  isCurrent,
  canAct,
  filmedAt,
  filmedBy,
  nasPath,
}: {
  projectId: string;
  isCurrent: boolean;
  canAct: boolean;
  filmedAt: string | null;
  filmedBy: string | null;
  nasPath: string | null;
}) {
  const [path, setPath] = useState(nasPath ?? "");
  const { pending, run } = useStep();
  const confirm = useConfirm();

  if (isCurrent && canAct) {
    return (
      <TurnBox title="Film">
        <p className="text-[14px]">When the footage is on the NAS, mark it here. The editor gets notified.</p>
        <label className="block">
          <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">NAS folder (optional)</span>
          <input value={path} onChange={(e) => setPath(e.target.value)} maxLength={500} placeholder="e.g. /volume1/raw/fake-iphone" className={field} />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            if (!(await confirm({ title: "Filmed and uploaded to the NAS?", description: "It moves to Edit and the editor is notified.", confirmLabel: "Yes, it's on the NAS" }))) return;
            run(() => markFilmed(projectId, path), "Marked as filmed", "edit");
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-11 text-[14px] disabled:opacity-60"
        >
          {pending && <Spinner />}
          Filmed and uploaded to the NAS
        </button>
      </TurnBox>
    );
  }
  if (filmedAt) {
    return (
      <DoneBox title="Filmed and uploaded to the NAS" by={filmedBy} at={filmedAt}>
        {nasPath && <CopyText text={nasPath} />}
      </DoneBox>
    );
  }
  return <p className="text-[14px] text-ink-soft">{isCurrent ? "Waiting for the filmer." : "Not filmed yet."}</p>;
}

export function EditPanel({
  projectId,
  isCurrent,
  canAct,
  editedAt,
  editedBy,
  editNote,
  reviewNote,
  nasPath,
}: {
  projectId: string;
  isCurrent: boolean;
  canAct: boolean;
  editedAt: string | null;
  editedBy: string | null;
  editNote: string | null;
  reviewNote: string | null;
  nasPath: string | null;
}) {
  const [note, setNote] = useState("");
  const { pending, run } = useStep();
  const confirm = useConfirm();
  return (
    <div className="space-y-4">
      {isCurrent && reviewNote && (
        <section className="rounded-2xl border border-amber bg-amber/10 p-4" role="status">
          <div className="text-[11px] font-bold uppercase tracking-wide text-amber mb-1">Changes requested</div>
          <p className="text-[14px] whitespace-pre-wrap">{reviewNote}</p>
        </section>
      )}
      {nasPath && (
        <div>
          <div className="text-[12px] font-semibold text-ink-soft mb-1.5">Footage on the NAS</div>
          <CopyText text={nasPath} />
        </div>
      )}
      {isCurrent && canAct ? (
        <TurnBox title="Edit">
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">A note for the review (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} rows={3} placeholder="Anything the master should check?" className={field} />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (!(await confirm({ title: "Mark editing complete?", description: "It moves to Review and the master is notified.", confirmLabel: "Editing complete" }))) return;
              run(() => markEdited(projectId, note), "Editing marked complete", "review");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-11 text-[14px] disabled:opacity-60"
          >
            {pending && <Spinner />}
            Mark editing complete
          </button>
        </TurnBox>
      ) : editedAt ? (
        <DoneBox title="Editing complete" by={editedBy} at={editedAt}>
          {editNote && <p className="text-[13.5px] whitespace-pre-wrap">{editNote}</p>}
        </DoneBox>
      ) : (
        <p className="text-[14px] text-ink-soft">{isCurrent ? "Waiting for the editor." : "Not edited yet."}</p>
      )}
    </div>
  );
}

export function ReviewPanel({
  projectId,
  isCurrent,
  canReview,
  editedAt,
  editedBy,
  editNote,
  reviewedAt,
  reviewedBy,
  approved,
}: {
  projectId: string;
  isCurrent: boolean;
  canReview: boolean;
  editedAt: string | null;
  editedBy: string | null;
  editNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  approved: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const { pending, run } = useStep();
  const confirm = useConfirm();
  return (
    <div className="space-y-4">
      {editedAt && (
        <div className="rounded-2xl border border-line/10 bg-surface-2/40 p-4">
          <div className="text-[12px] text-ink-soft">
            Editing completed {editedBy ? `by ${editedBy}, ` : ""}
            {relativeTime(editedAt)}
          </div>
          {editNote ? <p className="mt-1.5 text-[14px] whitespace-pre-wrap">{editNote}</p> : <p className="mt-1.5 text-[13.5px] text-ink-soft">No note.</p>}
        </div>
      )}
      {isCurrent && canReview ? (
        <TurnBox title="Review">
          {!asking ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  if (!(await confirm({ title: "Approve the edit?", description: "It moves to Package.", confirmLabel: "Approve" }))) return;
                  run(() => reviewLong(projectId, true, ""), "Approved", "package");
                }}
                className="inline-flex items-center gap-2 rounded-xl text-white font-bold px-5 h-11 text-[14px] disabled:opacity-60"
                style={{ background: "rgb(var(--green))" }}
              >
                {pending ? <Spinner /> : <CheckIcon className="w-4 h-4" />}
                Approve
              </button>
              <button type="button" onClick={() => setAsking(true)} className="rounded-xl border border-line/20 px-5 h-11 text-[14px] font-semibold hover:border-line/40">
                Request changes
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus maxLength={4000} rows={3} placeholder="What needs changing?" className={field} />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending || !note.trim()}
                  onClick={() => run(() => reviewLong(projectId, false, note), "Sent back to the editor", "edit")}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-11 text-[14px] disabled:opacity-50"
                >
                  {pending && <Spinner />}
                  Send back to editing
                </button>
                <button type="button" onClick={() => setAsking(false)} className="rounded-xl px-4 h-11 text-[14px] font-semibold text-ink-soft hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </TurnBox>
      ) : reviewedAt && approved ? (
        <DoneBox title="Approved" by={reviewedBy} at={reviewedAt} />
      ) : (
        <p className="text-[14px] text-ink-soft">{isCurrent ? "Waiting for the master's review." : "Not reviewed yet."}</p>
      )}
    </div>
  );
}

export function PostPanel({
  projectId,
  isCurrent,
  canAct,
  isMaster,
  platforms,
  posts,
}: {
  projectId: string;
  /** The video is at Post or already Posted. */
  isCurrent: boolean;
  canAct: boolean;
  isMaster: boolean;
  platforms: string[];
  posts: { platform: string; url: string | null; postedAt: string; postedBy: string | null }[];
}) {
  const { pending, run } = useStep();
  const confirm = useConfirm();
  const [links, setLinks] = useState<Record<string, string>>(Object.fromEntries(posts.map((p) => [p.platform, p.url ?? ""])));
  const done = platforms.filter((p) => posts.some((x) => x.platform === p)).length;
  const all = done === platforms.length;

  /** Every switch asks first: the last one moves the video to Posted. */
  async function toggle(pid: string, name: string, posted: boolean) {
    const last = !posted && done === platforms.length - 1;
    const ok = await confirm(
      posted
        ? {
            title: `Unmark ${name}?`,
            description: all ? "The video moves back from Posted to the Post step." : "It goes back to not posted.",
            confirmLabel: "Unmark",
          }
        : {
            title: `Mark it posted on ${name}?`,
            description: last ? "That's the last platform: the video moves to Posted." : `${platforms.length - done - 1} platform${platforms.length - done - 1 === 1 ? "" : "s"} left after this one.`,
            confirmLabel: last ? "Mark posted · move to Posted" : "Mark posted",
          }
    );
    if (!ok) return;
    run(() => setLongPosted(projectId, pid, !posted, links[pid] ?? ""), posted ? "Unmarked" : last ? "Posted everywhere" : `Marked posted on ${name}`);
  }
  return (
    <div className="space-y-4">
      {isMaster && (
        <div>
          <div className="text-[12px] font-semibold text-ink-soft mb-2">Where this video goes</div>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={pending}
                  aria-pressed={on}
                  onClick={() => run(() => setLongPlatforms(projectId, on ? platforms.filter((x) => x !== p.id) : [...platforms, p.id]), "Platforms updated")}
                  className={`inline-flex items-center gap-2 rounded-lg border pl-1.5 pr-3.5 h-9 text-[13px] font-semibold transition-colors ${
                    on ? "border-amber/50 bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"
                  }`}
                >
                  <PlatformIcon platform={p.id} className={`w-6 h-6 rounded-md ${on ? "" : "opacity-50 grayscale"}`} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <section className={`rounded-2xl border p-5 space-y-3 ${isCurrent && !all ? "border-amber bg-amber/10" : "border-line/10 bg-surface-2/40"}`}>
        <div className="flex items-center gap-3">
          <h3 className={`text-[11px] font-bold uppercase tracking-wide ${isCurrent && !all ? "text-amber" : "text-ink-soft"}`}>Post</h3>
          <span className="flex-1" />
          <span className={`text-[13px] font-bold tabular-nums ${all ? "text-green" : "text-ink-soft"}`}>
            {all ? "Posted everywhere" : `${done} of ${platforms.length} posted`}
          </span>
        </div>
        {!isCurrent && <p className="text-[13.5px] text-ink-soft">Move the video to the Post step first.</p>}
        <ul className="space-y-2">
          {platforms.map((pid) => {
            const post = posts.find((x) => x.platform === pid);
            const meta = PLATFORMS.find((p) => p.id === pid);
            return (
              <li key={pid} className="rounded-xl bg-surface border border-line/10 p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={pid as "youtube"} className="w-8 h-8 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">{meta?.name ?? pid}</div>
                    <div className="text-[12px] text-ink-soft">
                      {post ? `Posted ${post.postedBy ? `by ${post.postedBy}, ` : ""}${relativeTime(post.postedAt)}` : "Not posted yet"}
                    </div>
                  </div>
                  {post?.url && (
                    <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-amber hover:opacity-80" aria-label="Open the post">
                      <ExternalIcon className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!post}
                    aria-label={`Posted on ${meta?.name ?? pid}`}
                    disabled={!isCurrent || !canAct || pending}
                    onClick={() => void toggle(pid, meta?.name ?? pid, !!post)}
                    className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
                    style={{ background: post ? "rgb(var(--green))" : "rgb(var(--line) / 0.25)" }}
                  >
                    <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${post ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {isCurrent && canAct && (
                  <div className="flex gap-2">
                    <input
                      value={links[pid] ?? ""}
                      onChange={(e) => setLinks((l) => ({ ...l, [pid]: e.target.value }))}
                      placeholder="Link to the post (optional)"
                      maxLength={500}
                      className="flex-1 min-w-0 rounded-lg border border-line/15 bg-surface px-3 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber"
                    />
                    {post && (links[pid] ?? "") !== (post.url ?? "") && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setLongPosted(projectId, pid, true, links[pid] ?? ""), "Link saved")}
                        className="rounded-lg border border-line/20 px-3 h-9 text-[12.5px] font-semibold hover:border-line/40"
                      >
                        Save link
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** Package: the final YouTube description (starts from the team default). */
export function DescriptionEditor({
  projectId,
  value,
  teamDefault,
  canEdit,
}: {
  projectId: string;
  value: string | null;
  teamDefault: string;
  canEdit: boolean;
}) {
  const initial = value ?? teamDefault;
  const [text, setText] = useState(initial);
  const { pending, run } = useStep();
  const toast = useToast();
  const dirty = text !== (value ?? "");
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[12px] font-semibold text-ink-soft">
          Description {value === null && teamDefault && <span className="font-normal">· from the team default, not saved yet</span>}
        </div>
        <div className="text-[11.5px] text-ink-faint tabular-nums">{text.length}/5000</div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!canEdit}
        maxLength={5000}
        rows={10}
        className={`${field} font-[inherit] leading-relaxed resize-y`}
        placeholder="The YouTube description…"
      />
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() => run(() => saveLongDescription(projectId, text), "Description saved")}
            className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px] disabled:opacity-45"
          >
            {pending && <Spinner />}
            Save description
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            toast.success("Description copied");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold hover:border-line/40"
        >
          <CopyIcon className="w-3.5 h-3.5" />
          Copy
        </button>
        {canEdit && teamDefault && text !== teamDefault && (
          <button type="button" onClick={() => setText(teamDefault)} className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink">
            Use the team default
          </button>
        )}
      </div>
    </div>
  );
}
