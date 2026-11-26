"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { CopyIcon, DownloadIcon, TrashIcon } from "@/components/ui/icons";
import { BarDelete, BarMenu, ListPicker, PickBar, PickButton, usePick, type BarBusy } from "@/components/ui/list-pick";
import { itemsAway } from "@/lib/remove-animation";
import { deleteProducts, setProductsChecked, setProductsKinds, setProductsStatus } from "@/app/(dashboard)/sponsorships/actions";
import {
  AFFILIATE_STATUSES,
  CHECK_COLOR,
  CHECK_LABEL,
  CHECK_STATES,
  checkState,
  csvName,
  DEAL_KINDS,
  descriptionText,
  itemsOf,
  KIND_COLOR,
  KIND_LABEL,
  sponsorshipsCsv,
  STATUS_COLOR,
  STATUS_LABEL,
  type AffiliateStatus,
  type CheckState,
  type DealKind,
  type ShownCompany,
} from "../lib/rules";
import { copyWhenReady, useAffiliates } from "./affiliates-context";

/*
 * Picking several products at once (1.56.0 sponsorships; 1.58.0 the products, a company's heading picks all of its
 * own here), as the shorts list's (components/ui/list-pick.tsx: Select, Shift for a run, Ctrl/Cmd+A for all, Esc to
 * stop). The bar at the foot: everyone copies the lines for a video's description and exports them as a spreadsheet
 * (never a login); Masters and the people they let in mark them (one menu: Verified, Not working or Not verified; their
 * type, 1.57.0: Affiliate, Review or Paid, that one only, both or all three on one in its own ⋯ or window; Active,
 * Paused or Ended) and delete them (asked first; their companies stay). Copy and Export are icons, so all of it fits
 * the bar, a phone's too.
 */

export function AffiliatesPicker({ companies, children }: { companies: ShownCompany[]; children: React.ReactNode }) {
  const items = itemsOf(companies);
  return (
    <ListPicker ids={items.map((i) => i.product.id)} bar={<AffiliatesBar companies={companies} />}>
      {children}
    </ListPicker>
  );
}

export function PickAffiliatesButton() {
  return <PickButton what="products" hint="Select products to copy, export, mark or delete" />;
}

function AffiliatesBar({ companies }: { companies: ShownCompany[] }) {
  const p = usePick()!;
  const ctx = useAffiliates();
  const toast = useToast();
  const confirm = useConfirm();
  const [menu, setMenu] = useState<"mark" | null>(null);
  const [busy, setBusy] = useState<BarBusy>(null);
  const items = itemsOf(companies);
  const picked = items.filter((i) => p.picked.has(i.product.id));
  const chosen = picked.map((i) => i.product);
  const n = chosen.length;
  const manage = !!ctx?.manage;

  async function copyLines() {
    if (!n) return;
    if (await copyWhenReady(Promise.resolve(descriptionText(picked)))) toast.success(n === 1 ? "Lines for a description copied" : `Lines for ${n} products copied`);
    else toast.error("Couldn't copy. Check that the page may use the clipboard.");
  }

  function exportCsv() {
    if (!n) return;
    // A byte-order mark first, so Excel reads the names' accents right.
    const blob = new Blob(["﻿", sponsorshipsCsv(picked)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.success(n === 1 ? "Exported as a spreadsheet" : `${n} products exported as a spreadsheet`);
  }

  async function mark(to: AffiliateStatus) {
    setMenu(null);
    if (!ctx || !n) return;
    const moves = chosen.filter((c) => c.status !== to);
    if (!moves.length) return void toast.success(`Already ${STATUS_LABEL[to]}.`);
    setBusy({ text: moves.length === 1 ? "Changing…" : `Changing ${moves.length}…` });
    try {
      const r = await setProductsStatus(
        ctx.teamId,
        moves.map((m) => m.id),
        to
      );
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(r.changed === 1 ? `${moves[0].name}: ${STATUS_LABEL[to]}` : `${r.changed} products: ${STATUS_LABEL[to]}`);
    } catch {
      toast.error("Couldn't change them. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  /** The picked ones marked Verified, Not working or Not verified (1.58.0; marking one again moves its date). */
  async function check(to: CheckState) {
    setMenu(null);
    if (!ctx || !n) return;
    setBusy({ text: n === 1 ? "Marking…" : `Marking ${n}…` });
    try {
      const r = await setProductsChecked(
        ctx.teamId,
        chosen.map((c) => c.id),
        to === "none" ? null : to
      );
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(r.changed === 1 ? `${chosen[0].name}: ${CHECK_LABEL[to]}` : `${r.changed} products: ${CHECK_LABEL[to]}`);
    } catch {
      toast.error("Couldn't mark them. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  /** The picked ones become this kind (only this one). */
  async function setKind(to: DealKind) {
    setMenu(null);
    if (!ctx || !n) return;
    const moves = chosen.filter((c) => !(c.kinds.length === 1 && c.kinds[0] === to));
    if (!moves.length) return void toast.success(`Already ${KIND_LABEL[to]}.`);
    setBusy({ text: moves.length === 1 ? "Changing…" : `Changing ${moves.length}…` });
    try {
      const r = await setProductsKinds(
        ctx.teamId,
        moves.map((m) => m.id),
        [to]
      );
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(r.changed === 1 ? `${moves[0].name}: ${KIND_LABEL[to]}` : `${r.changed} products: ${KIND_LABEL[to]}`);
    } catch {
      toast.error("Couldn't change them. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!ctx || !n) return;
    const ok = await confirm({
      title: n === 1 ? `Delete ${chosen[0].name}?` : `Delete ${n} products?`,
      description: `${n === 1 ? "It goes" : "They go"} for good. Their companies and the videos they link stay.`,
      confirmLabel: n === 1 ? "Delete" : `Delete ${n}`,
      danger: true,
    });
    if (!ok) return;
    const ids = chosen.map((c) => c.id);
    setBusy({ text: n === 1 ? "Deleting…" : `Deleting ${n}…` });
    const anim = itemsAway(ids.map((id) => document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)).filter((el): el is HTMLElement => !!el));
    try {
      if (anim) await anim.out;
      const asked = deleteProducts(ctx.teamId, ids);
      const closing = anim?.collapse();
      const r = await asked;
      if (r.error !== undefined) {
        anim?.restore();
        return void toast.error(r.error);
      }
      if (r.failed.length) anim?.restore();
      else await closing;
      if (!r.deleted.length) toast.error("Nothing was deleted. Refresh and try again.");
      else toast.success(r.deleted.length === 1 ? `${chosen.find((c) => c.id === r.deleted[0])?.name ?? "It"} deleted` : `${r.deleted.length} products deleted${r.failed.length ? `, ${r.failed.length} couldn't be` : ""}`, anim ? { sound: false } : undefined);
    } catch {
      anim?.restore();
      toast.error("Couldn't delete them. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PickBar total={items.length} one="product" many="products" busy={busy} label="Picked products">
      {/* (Icons: the bar has room for one menu with all the marks, and Delete, on a phone too.) */}
      <button
        type="button"
        onClick={() => void copyLines()}
        disabled={!n || !!busy}
        aria-label="Copy the lines for a description"
        title="Copy the name, link and code of each, for a video's description"
        className="inline-flex items-center justify-center rounded-lg w-9 h-9 border border-line/15 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent flex-shrink-0"
      >
        <CopyIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={exportCsv}
        disabled={!n || !!busy}
        aria-label="Export as a spreadsheet"
        title="A spreadsheet (CSV) of the picked ones, with their companies, without logins"
        className="inline-flex items-center justify-center rounded-lg w-9 h-9 border border-line/15 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent flex-shrink-0"
      >
        <DownloadIcon className="w-4 h-4" />
      </button>
      {manage && (
        <BarMenu
          label="Mark"
          open={menu === "mark"}
          onOpen={(o) => setMenu(o ? "mark" : null)}
          disabled={!n || !!busy}
          items={[
            ...CHECK_STATES.map((s) => {
              const already = chosen.filter((c) => checkState(c) === s).length;
              return {
                key: `checked-${s}`,
                section: "Verified or not",
                label: CHECK_LABEL[s],
                hint: already === n ? (s === "none" ? "All are" : "Again: today") : already ? `${already} of ${n} are` : undefined,
                icon: <span className="w-2 h-2 mx-[3px] rounded-[3px]" style={{ background: CHECK_COLOR[s] }} />,
                disabled: s === "none" && already === n,
                onPick: () => void check(s),
              };
            }),
            ...DEAL_KINDS.map((k) => {
              const go = chosen.filter((c) => !(c.kinds.length === 1 && c.kinds[0] === k)).length;
              return {
                key: `kind-${k}`,
                section: "Type (only this one)",
                label: KIND_LABEL[k],
                hint: go === n ? undefined : go ? `${go} of ${n}` : "All are",
                icon: <span className="w-2 h-2 mx-[3px] rounded-[3px]" style={{ background: KIND_COLOR[k] }} />,
                disabled: !go,
                onPick: () => void setKind(k),
              };
            }),
            ...AFFILIATE_STATUSES.map((s) => {
              const go = chosen.filter((c) => c.status !== s).length;
              return {
                key: `status-${s}`,
                section: "Status",
                label: STATUS_LABEL[s],
                hint: go === n ? undefined : go ? `${go} of ${n}` : "All are",
                icon: <span className="w-2 h-2 mx-[3px] rounded-[3px]" style={{ background: STATUS_COLOR[s] }} />,
                disabled: !go,
                onPick: () => void mark(s),
              };
            }),
          ]}
        />
      )}
      {manage && <BarDelete onClick={() => void remove()} disabled={!n || !!busy} icon={<TrashIcon className="w-4 h-4" />} />}
    </PickBar>
  );
}
