"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { CopyIcon, DownloadIcon, TrashIcon } from "@/components/ui/icons";
import { BarDelete, BarMenu, ListPicker, PickBar, PickButton, usePick, type BarBusy } from "@/components/ui/list-pick";
import { itemsAway } from "@/lib/remove-animation";
import { deleteAffiliates, setAffiliatesStatus } from "@/app/(dashboard)/affiliates/actions";
import { affiliatesCsv, AFFILIATE_STATUSES, csvName, descriptionText, STATUS_COLOR, STATUS_LABEL, type Affiliate, type AffiliateStatus } from "../lib/rules";
import { copyWhenReady, useAffiliates } from "./affiliates-context";

/*
 * Picking several affiliates at once (1.56.0), as the shorts list's (components/ui/list-pick.tsx: Select, Shift for a
 * run, Ctrl/Cmd+A for all, Esc to stop). The bar at the foot: everyone copies the lines for a video's description and
 * exports them as a spreadsheet (never a login); Masters and the people they let in mark them Active, Paused or Ended
 * and delete them (asked first; ones with a login need the password).
 */

export function AffiliatesPicker({ items, children }: { items: Affiliate[]; children: React.ReactNode }) {
  return (
    <ListPicker ids={items.map((i) => i.id)} bar={<AffiliatesBar items={items} />}>
      {children}
    </ListPicker>
  );
}

export function PickAffiliatesButton() {
  return <PickButton what="affiliates" hint="Select affiliates to copy, export, mark or delete" />;
}

function AffiliatesBar({ items }: { items: Affiliate[] }) {
  const p = usePick()!;
  const ctx = useAffiliates();
  const toast = useToast();
  const confirm = useConfirm();
  const [menu, setMenu] = useState<"status" | null>(null);
  const [busy, setBusy] = useState<BarBusy>(null);
  const chosen = items.filter((i) => p.picked.has(i.id));
  const n = chosen.length;
  const manage = !!ctx?.manage;

  async function copyLines() {
    if (!n) return;
    if (await copyWhenReady(Promise.resolve(descriptionText(chosen)))) toast.success(n === 1 ? "Lines for a description copied" : `Lines for ${n} affiliates copied`);
    else toast.error("Couldn't copy. Check that the page may use the clipboard.");
  }

  function exportCsv() {
    if (!n) return;
    // A byte-order mark first, so Excel reads the names' accents right.
    const blob = new Blob(["﻿", affiliatesCsv(chosen)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.success(n === 1 ? "Exported as a spreadsheet" : `${n} affiliates exported as a spreadsheet`);
  }

  async function mark(to: AffiliateStatus) {
    setMenu(null);
    if (!ctx || !n) return;
    const moves = chosen.filter((c) => c.status !== to);
    if (!moves.length) return void toast.success(`Already ${STATUS_LABEL[to]}.`);
    setBusy({ text: moves.length === 1 ? "Changing…" : `Changing ${moves.length}…` });
    try {
      const r = await setAffiliatesStatus(
        ctx.teamId,
        moves.map((m) => m.id),
        to
      );
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(r.changed === 1 ? `${moves[0].name}: ${STATUS_LABEL[to]}` : `${r.changed} affiliates: ${STATUS_LABEL[to]}`);
    } catch {
      toast.error("Couldn't change them. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(again = true) {
    if (!ctx || !n) return;
    const logins = chosen.filter((c) => c.login).length;
    if (again) {
      const ok = await confirm({
        title: n === 1 ? `Delete ${chosen[0].name}?` : `Delete ${n} affiliates?`,
        description: `${n === 1 ? "It goes" : "They go"} for good${logins ? `, with ${logins === 1 ? "a login" : `${logins} logins`} (written down for the masters)` : ""}. The videos they link stay.`,
        confirmLabel: n === 1 ? "Delete" : `Delete ${n}`,
        danger: true,
      });
      if (!ok) return;
      if (logins && !(await ctx.ensureUnlocked())) return;
    }
    const ids = chosen.map((c) => c.id);
    setBusy({ text: n === 1 ? "Deleting…" : `Deleting ${n}…` });
    const anim = itemsAway(ids.map((id) => document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)).filter((el): el is HTMLElement => !!el));
    try {
      if (anim) await anim.out;
      const asked = deleteAffiliates(ctx.teamId, ids);
      const closing = anim?.collapse();
      const r = await asked;
      if (r.error !== undefined) {
        anim?.restore();
        if (r.locked && again && (await ctx.ensureUnlocked())) {
          setBusy(null);
          return void (await remove(false));
        }
        return void toast.error(r.error);
      }
      if (r.failed.length) anim?.restore();
      else await closing;
      if (!r.deleted.length) toast.error("Nothing was deleted. Refresh and try again.");
      else toast.success(r.deleted.length === 1 ? `${chosen.find((c) => c.id === r.deleted[0])?.name ?? "It"} deleted` : `${r.deleted.length} affiliates deleted${r.failed.length ? `, ${r.failed.length} couldn't be` : ""}`, anim ? { sound: false } : undefined);
    } catch {
      anim?.restore();
      toast.error("Couldn't delete them. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PickBar total={items.length} one="affiliate" many="affiliates" busy={busy} label="Picked affiliates">
      <button
        type="button"
        onClick={() => void copyLines()}
        disabled={!n || !!busy}
        title="The name, link and code of each, for a video's description"
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 h-9 text-[13px] font-semibold border border-line/15 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap"
      >
        <CopyIcon className="w-4 h-4" />
        <span className="max-sm:hidden">Copy</span>
      </button>
      <button
        type="button"
        onClick={exportCsv}
        disabled={!n || !!busy}
        title="A spreadsheet (CSV) of the picked ones, without logins"
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 h-9 text-[13px] font-semibold border border-line/15 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap"
      >
        <DownloadIcon className="w-4 h-4" />
        <span className="max-sm:hidden">Export</span>
      </button>
      {manage && (
        <BarMenu
          label="Status"
          open={menu === "status"}
          onOpen={(o) => setMenu(o ? "status" : null)}
          disabled={!n || !!busy}
          items={AFFILIATE_STATUSES.map((s) => {
            const go = chosen.filter((c) => c.status !== s).length;
            return {
              key: s,
              label: STATUS_LABEL[s],
              hint: go === n ? undefined : go ? `${go} of ${n}` : "All are",
              icon: <span className="w-2 h-2 mx-[3px] rounded-[3px]" style={{ background: STATUS_COLOR[s] }} />,
              disabled: !go,
              onPick: () => void mark(s),
            };
          })}
        />
      )}
      {manage && <BarDelete onClick={() => void remove()} disabled={!n || !!busy} icon={<TrashIcon className="w-4 h-4" />} />}
    </PickBar>
  );
}
