"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { TrashIcon } from "@/components/ui/icons";
import { BarDelete, BarMenu, ListPicker, PickBar, PickButton, usePick, type BarBusy } from "@/components/ui/list-pick";
import { itemsAway } from "@/lib/remove-animation";
import { deleteMessage, deleteWhat, exportMessage, FORMAT_NAME, numbersText, SHORTS, type ExportFormat } from "@/lib/bulk-text";
import { deleteShorts } from "@/app/(dashboard)/shorts/actions";
import { FileTypeIcon } from "./file-type-icon";
import { SHORT_STAGE_COLOR, SHORT_STAGE_LABELS, type ShortStage } from "../lib/constants";
import { useMoveShorts } from "../lib/use-move-shorts";
import { MOVABLE } from "./row-menu";

/*
 * Picking several shorts at once (1.38.0 on the table; 1.40.0 on the cards too, the picking itself shared with long
 * videos: components/ui/list-pick.tsx). The bar at the foot exports each picked short's script (PDF or Word, in one
 * zip); masters also move them all to a step (with Undo) and, 1.40.0, delete them (asked first: the owner, "i want to
 * be able to delete as well from the select thing … i want confirmation on deletion"). Deleting strikes each through
 * and takes it off the list, then the server is asked; any it couldn't delete come back.
 */

export type PickItem = { id: string; number: number; title: string; stage: ShortStage };

/** Around the shorts list (the bar of filters too), as a table or as cards. */
export function ShortsPicker({ items, canMove, canDelete, children }: { items: PickItem[]; canMove: boolean; canDelete: boolean; children: React.ReactNode }) {
  return (
    <ListPicker ids={items.map((i) => i.id)} bar={<ShortsBar items={items} canMove={canMove} canDelete={canDelete} />}>
      {children}
    </ListPicker>
  );
}

/** "Select" / "Done", beside the cards-or-table switch. */
export function PickShortsButton() {
  return <PickButton what="shorts" hint="Select shorts to export, move or delete" />;
}

/** The bar at the foot while picking: export, move (masters), delete (masters). */
function ShortsBar({ items, canMove, canDelete }: { items: PickItem[]; canMove: boolean; canDelete: boolean }) {
  const p = usePick()!;
  const toast = useToast();
  const confirm = useConfirm();
  const step = useMoveShorts();
  const [menu, setMenu] = useState<"export" | "move" | null>(null);
  const [busy, setBusy] = useState<BarBusy>(null);
  const chosen = items.filter((i) => p.picked.has(i.id));
  const n = chosen.length;
  const working = !!busy || step.pending;

  async function doExport(format: ExportFormat) {
    setMenu(null);
    if (!n) return;
    const making = (done: number, total: number) => setBusy({ text: total > 1 ? `Making ${Math.min(done + 1, total)} of ${total}…` : `Making the ${FORMAT_NAME[format]}…`, progress: total > 1 ? done / total : undefined });
    making(0, n);
    try {
      const { exportShortScripts } = await import("../lib/export-shorts");
      const r = await exportShortScripts(
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

  async function doMove(to: ShortStage) {
    setMenu(null);
    // Posted ones stay posted (1.40.0: left out, as the menu counted; un-marking a platform reopens one).
    const stays = chosen.filter((c) => c.stage === "posted");
    const moves = chosen.filter((c) => c.stage !== to && c.stage !== "posted").map((c) => ({ id: c.id, to }));
    if (!moves.length) {
      toast.success(`Already in ${SHORT_STAGE_LABELS[to]}.`);
      return;
    }
    const one = moves.length === 1 ? chosen.find((c) => c.id === moves[0].id) : null;
    const ok = await confirm({
      title: one ? `Move #${one.number} to ${SHORT_STAGE_LABELS[to]}?` : `Move ${moves.length} shorts to ${SHORT_STAGE_LABELS[to]}?`,
      description: `A correction by hand: nobody is told. Undo puts each one back where it was.${stays.length ? ` ${numbersText(stays.map((x) => x.number))} ${stays.length === 1 ? "is posted, so it stays" : "are posted, so they stay"}.` : ""}`,
      confirmLabel: one ? "Move it" : `Move ${moves.length} shorts`,
    });
    if (ok) await step.run(moves);
  }

  async function doDelete() {
    setMenu(null);
    if (!n) return;
    const ok = await confirm({
      title: n === 1 ? `Delete ${deleteWhat(chosen)}?` : `Delete ${n} shorts?`,
      description:
        n === 1
          ? "It's removed permanently with its history, and the other auto-scheduled shorts re-date to close the gap."
          : `${deleteWhat(chosen)} are removed permanently with their history, and the other auto-scheduled shorts re-date to close the gaps.`,
      confirmLabel: n === 1 ? "Delete short" : `Delete ${n} shorts`,
      danger: true,
    });
    if (!ok) return;
    const ids = chosen.map((c) => c.id);
    setBusy({ text: n === 1 ? "Deleting…" : `Deleting ${n} shorts…` });
    // Each struck through and off the list first, then the server; whatever it couldn't delete comes back.
    const anim = itemsAway(ids.map((id) => document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)).filter((el): el is HTMLElement => !!el));
    try {
      if (anim) await anim.out;
      // The gaps close while the server is asked (the list is drawn again when it answers), as for one (1.38.0).
      const asked = deleteShorts(ids);
      const closing = anim?.collapse();
      const r = await asked;
      if (r.error !== undefined) {
        anim?.restore();
        toast.error(r.error);
        return;
      }
      if (r.failed.length) anim?.restore();
      else await closing;
      const msg = deleteMessage(r, SHORTS);
      if (msg.ok) toast.success(msg.text, anim ? { sound: false } : undefined);
      else toast.error(msg.text);
    } catch {
      anim?.restore();
      toast.error("Couldn't delete them. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PickBar total={items.length} one="short" many="shorts" busy={busy} label="Picked shorts">
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
          items={MOVABLE.map((s) => {
            const go = chosen.filter((c) => c.stage !== s && c.stage !== "posted").length;
            return {
              key: s,
              label: SHORT_STAGE_LABELS[s],
              hint: go === n ? undefined : go ? `${go} of ${n}` : "All there",
              icon: <span className="w-2 h-2 mx-[3px] rounded-[3px]" style={{ background: SHORT_STAGE_COLOR[s] }} />,
              disabled: !go,
              onPick: () => void doMove(s),
            };
          })}
        />
      )}
      {canDelete && <BarDelete onClick={() => void doDelete()} disabled={!n || working} icon={<TrashIcon className="w-4 h-4" />} />}
    </PickBar>
  );
}
