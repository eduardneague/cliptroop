"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { LockIcon, TrashIcon } from "@/components/ui/icons";
import { BarDelete, BarMenu, ListPicker, PickBar, PickButton, usePick, type BarBusy } from "@/components/ui/list-pick";
import type { PipelineStage } from "@/lib/permissions/roles";
import { itemsAway } from "@/lib/remove-animation";
import { deleteMessage, deleteWhat, exportMessage, FORMAT_NAME, LONG_VIDEOS, numbersText, type ExportFormat } from "@/lib/bulk-text";
import { deleteLongVideos, type LongDeleted } from "@/app/(dashboard)/videos/bulk-actions";
import { FileTypeIcon } from "@/modules/short-videos/components/file-type-icon";
import { STAGE_LABELS, stageColor } from "../lib/stages";
import { useMoveVideos } from "../lib/use-move-videos";
import { LONG_MOVABLE } from "./video-menu";
import { oneAtATime } from "@/lib/permissions/delete-rules";

/*
 * Picking several long videos at once (1.40.0, as the shorts: the owner, "i want this same logic to apply to long
 * videos too, it might be useful one day"), on the table or the cards (components/ui/list-pick.tsx). The bar exports
 * each one's script (PDF or Word, in one zip); masters move them to a step (Undo) and delete them, which asks for their
 * password ("deleting in bulk should require you to input the password and only the master can do that"): nothing is
 * touched until it's right; then each is struck through and taken off the list. 1.41.0: whoever the team's owner lets
 * delete long videos deletes here too, with their password: one at a time (the bar's Delete waits for just one), or
 * several when the owner lets them (lib/permissions/delete-rules.ts).
 */

export type VideoPickItem = { id: string; number: number; title: string; stage: PipelineStage };

export function VideosPicker({ items, canMove, canDelete, deleteMany = canDelete, children }: { items: VideoPickItem[]; canMove: boolean; canDelete: boolean; /** Several at once (else one at a time). */ deleteMany?: boolean; children: React.ReactNode }) {
  return (
    <ListPicker ids={items.map((i) => i.id)} bar={<VideosBar items={items} canMove={canMove} canDelete={canDelete} deleteMany={deleteMany} />}>
      {children}
    </ListPicker>
  );
}

/** "Select" / "Done", beside the cards-or-table switch. */
export function PickVideosButton() {
  return <PickButton what="long videos" hint="Select long videos to export, move or delete" />;
}

function VideosBar({ items, canMove, canDelete, deleteMany }: { items: VideoPickItem[]; canMove: boolean; canDelete: boolean; deleteMany: boolean }) {
  const p = usePick()!;
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const step = useMoveVideos();
  const [menu, setMenu] = useState<"export" | "move" | null>(null);
  const [busy, setBusy] = useState<BarBusy>(null);
  const [deleting, setDeleting] = useState<VideoPickItem[] | null>(null);
  const chosen = items.filter((i) => p.picked.has(i.id));
  const n = chosen.length;
  const working = !!busy || step.pending;

  async function doExport(format: ExportFormat) {
    setMenu(null);
    if (!n) return;
    const making = (done: number, total: number) => setBusy({ text: total > 1 ? `Making ${Math.min(done + 1, total)} of ${total}…` : `Making the ${FORMAT_NAME[format]}…`, progress: total > 1 ? done / total : undefined });
    making(0, n);
    try {
      const { exportLongScripts } = await import("../lib/export-videos");
      const r = await exportLongScripts(
        chosen.map((c) => c.id),
        format,
        making
      );
      if (r.error !== undefined) toast.error(r.error);
      else {
        const msg = exportMessage(r, format);
        if (msg.ok) toast.success(msg.text);
        else toast.error(msg.text);
      }
    } catch {
      toast.error("Couldn't make the files. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function doMove(to: PipelineStage) {
    setMenu(null);
    // Posted ones stay posted (the menu counted only the others).
    const stays = chosen.filter((c) => c.stage === "done");
    const moves = chosen.filter((c) => c.stage !== to && c.stage !== "done").map((c) => ({ id: c.id, to }));
    if (!moves.length) {
      toast.success(`Already in ${STAGE_LABELS[to]}.`);
      return;
    }
    const one = moves.length === 1 ? chosen.find((c) => c.id === moves[0].id) : null;
    const ok = await confirm({
      title: one ? `Move #${one.number} to ${STAGE_LABELS[to]}?` : `Move ${moves.length} long videos to ${STAGE_LABELS[to]}?`,
      description: `A correction by hand: nobody is told. Undo puts each one back where it was.${stayNote(stays)}`,
      confirmLabel: one ? "Move it" : `Move ${moves.length} videos`,
    });
    if (ok) await step.run(moves);
  }

  /** Deleted on the server (the password was right): each struck through and taken off the list, then it's drawn again. */
  async function gone(r: LongDeleted) {
    setDeleting(null);
    const ids = r.deleted.map((d) => d.id);
    const anim = itemsAway(ids.map((id) => document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)).filter((el): el is HTMLElement => !!el));
    if (anim) {
      await anim.out;
      await anim.collapse();
    }
    const msg = deleteMessage(r, LONG_VIDEOS);
    if (msg.ok) toast.success(msg.text, anim ? { sound: false } : undefined);
    else toast.error(msg.text);
    router.refresh();
  }

  return (
    <>
      <PickBar total={items.length} one="long video" many="long videos" busy={busy} label="Picked long videos">
        <BarMenu
          label="Export"
          open={menu === "export"}
          onOpen={(o) => setMenu(o ? "export" : null)}
          disabled={!n || working}
          items={[
            { key: "pdf", label: "PDF", hint: n > 1 ? `${n} files, in one zip` : "The script", icon: <FileTypeIcon kind="pdf" className="w-4 h-4 text-ink-soft" />, onPick: () => void doExport("pdf") },
            { key: "docx", label: "Word (.docx)", hint: n > 1 ? `${n} files, in one zip` : "The script", icon: <FileTypeIcon kind="docx" className="w-4 h-4 text-ink-soft" />, onPick: () => void doExport("docx") },
          ]}
        />
        {canMove && (
          <BarMenu
            label="Move to"
            short="Move"
            open={menu === "move"}
            onOpen={(o) => setMenu(o ? "move" : null)}
            disabled={!n || working}
            items={LONG_MOVABLE.map((s) => {
              const go = chosen.filter((c) => c.stage !== s && c.stage !== "done").length;
              return {
                key: s,
                label: STAGE_LABELS[s],
                hint: go === n ? undefined : go ? `${go} of ${n}` : "All there",
                icon: <span className="w-2 h-2 mx-[3px] rounded-[3px]" style={{ background: stageColor(s) }} />,
                disabled: !go,
                onPick: () => void doMove(s),
              };
            })}
          />
        )}
        {canDelete && (
          <BarDelete
            onClick={() => {
              setMenu(null);
              // 1.41.0: one at a time (the team's owner decides): said, nothing asked.
              if (!deleteMany && n > 1) return void toast.error(oneAtATime("long"));
              setDeleting(chosen);
            }}
            disabled={!n || working}
            hint={!deleteMany && n > 1 ? oneAtATime("long") : null}
            icon={<TrashIcon className="w-4 h-4" />}
          />
        )}
      </PickBar>
      {deleting && <DeleteVideosDialog videos={deleting} onClose={() => setDeleting(null)} onDeleted={(r) => void gone(r)} />}
    </>
  );
}

/** " #37 is posted, so it stays." (for a move that leaves posted ones where they are). */
const stayNote = (stays: { number: number }[]) => (stays.length ? ` ${numbersText(stays.map((x) => x.number))} ${stays.length === 1 ? "is posted, so it stays" : "are posted, so they stay"}.` : "");

/**
 * Deleting several long videos: which ones, what goes with them, and your password. A wrong password says so here and
 * deletes nothing; too many wrong ones wait, as signing in does.
 */
function DeleteVideosDialog({ videos, onClose, onDeleted }: { videos: VideoPickItem[]; onClose: () => void; onDeleted: (r: LongDeleted) => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const id = useId();
  const n = videos.length;

  // Straight into the password (after the window's own focus).
  useEffect(() => {
    const t = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  async function submit() {
    if (!password || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const r = await deleteLongVideos(
        videos.map((v) => v.id),
        password
      );
      if (r.error !== undefined) {
        if (r.password) {
          setProblem(r.error);
          setPassword("");
          requestAnimationFrame(() => field.current?.focus());
        } else {
          toast.error(r.error);
          onClose();
        }
        return;
      }
      onDeleted(r);
    } catch {
      setProblem("Couldn't delete them. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      title={n === 1 ? `Delete ${deleteWhat(videos)}?` : `Delete ${n} long videos?`}
      description={`${n === 1 ? "It goes" : "They go"} for good, with everything in ${n === 1 ? "it" : "them"}: scripts and research, comments, uploaded edits, thumbnails and notes.`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={pending} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!password || pending}
            className="inline-flex items-center gap-2 rounded-lg bg-red text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-45"
          >
            {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
            {pending ? "Deleting…" : n === 1 ? "Delete it forever" : `Delete ${n} forever`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="rounded-xl border border-line/15 divide-y divide-line/10 max-h-48 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll" aria-label="The videos">
          {videos.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2">
              <span className="font-mono text-[12px] text-ink-faint tabular-nums w-10 text-right flex-shrink-0">{`#${v.number}`}</span>
              <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{v.title}</span>
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ color: "rgb(var(--ink-soft))", background: "rgb(var(--surface-2))" }}>
                {STAGE_LABELS[v.stage]}
              </span>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={id} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft mb-1.5">
            <LockIcon className="w-3.5 h-3.5" />
            Your password
          </label>
          <input
            ref={field}
            id={id}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setProblem(null);
            }}
            aria-invalid={problem ? true : undefined}
            aria-describedby={`${id}-hint`}
            className={`w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-amber ${problem ? "border-red/60" : "border-line/15"}`}
          />
          <p id={`${id}-hint`} className={`text-[12px] mt-1.5 ${problem ? "text-red" : "text-ink-faint"}`} role={problem ? "alert" : undefined}>
            {problem ?? `${n === 1 ? "Deleting from the selection" : "Deleting several at once"} needs your password, so nothing goes by accident, or by someone else using your account.`}
          </p>
        </form>
      </div>
    </Dialog>
  );
}
