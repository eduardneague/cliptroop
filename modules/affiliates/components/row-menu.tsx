"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, EditIcon, ExternalIcon, MoreIcon, TrashIcon } from "@/components/ui/icons";
import { itemsAway } from "@/lib/remove-animation";
import { deleteAffiliates, setAffiliatesStatus } from "@/app/(dashboard)/affiliates/actions";
import { AFFILIATE_STATUSES, descriptionText, STATUS_COLOR, STATUS_LABEL, type Affiliate, type AffiliateStatus } from "../lib/rules";
import { copyWhenReady, useAffiliates } from "./affiliates-context";

/**
 * ⋯ on an affiliate (1.56.0). Everyone: copy its code, its link, or the lines for a video's description; open the
 * product or the affiliate platform. Masters and the people they let in: edit it, mark it Active, Paused or Ended, and
 * delete it (asked first; one with a login needs the password, as changing its login does).
 */
export function AffiliateMenu({ affiliate, className = "" }: { affiliate: Affiliate; className?: string }) {
  const ctx = useAffiliates();
  const toast = useToast();
  const confirm = useConfirm();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "status">("main");
  const [busy, setBusy] = useState(false);
  const a = affiliate;
  const manage = !!ctx?.manage;
  const item = "w-full flex items-center gap-2.5 text-left rounded-lg px-3 h-9 text-[13px] font-semibold hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent";

  async function copy(text: string, what: string) {
    setOpen(false);
    if (await copyWhenReady(Promise.resolve(text))) toast.success(`${what} copied`);
    else toast.error("Couldn't copy. Select it and copy it by hand.");
  }

  async function status(to: AffiliateStatus) {
    setOpen(false);
    if (!ctx || to === a.status) return;
    setBusy(true);
    try {
      const r = await setAffiliatesStatus(ctx.teamId, [a.id], to);
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(`${a.name}: ${STATUS_LABEL[to]}`);
    } catch {
      toast.error("Couldn't change it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(again = true) {
    setOpen(false);
    if (!ctx) return;
    if (again) {
      const ok = await confirm({
        title: `Delete ${a.name}?`,
        description: a.login ? "It goes for good, with its login (written down for the masters). The videos it links stay." : "It goes for good. The videos it links stay.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      if (a.login && !(await ctx.ensureUnlocked())) return;
    }
    setBusy(true);
    const el = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(a.id)}"]`);
    const anim = el ? itemsAway([el]) : null;
    try {
      if (anim) await anim.out;
      const asked = deleteAffiliates(ctx.teamId, [a.id]);
      const closing = anim?.collapse();
      const r = await asked;
      if (r.error !== undefined) {
        anim?.restore();
        if (r.locked && again && (await ctx.ensureUnlocked())) return void (await remove(false));
        return void toast.error(r.error);
      }
      if (r.failed.length) {
        anim?.restore();
        return void toast.error(`${a.name} couldn't be deleted. Refresh and try again.`);
      }
      await closing;
      toast.success(`${a.name} deleted`, anim ? { sound: false } : undefined);
    } catch {
      anim?.restore();
      toast.error("Couldn't delete it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setView("main");
          setOpen((o) => !o);
        }}
        aria-label={`Actions for ${a.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${className}`}
      >
        {busy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin" aria-hidden /> : <MoreIcon className="w-4 h-4" />}
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={248} label={view === "status" ? `${a.name}: status` : `Actions for ${a.name}`}>
        {view === "status" ? (
          <div key="status" className="p-1 menu-slide-in">
            <button type="button" role="menuitem" className={`${item} !text-ink-soft`} onClick={() => setView("main")}>
              <ChevronLeftIcon className="w-3.5 h-3.5" />
              Status
            </button>
            <div className="my-1 h-px bg-line/10" />
            {AFFILIATE_STATUSES.map((s) => (
              <button key={s} type="button" role="menuitemradio" aria-checked={s === a.status} className={`${item} font-medium text-ink`} onClick={() => void status(s)}>
                <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: STATUS_COLOR[s] }} aria-hidden />
                <span className="flex-1 min-w-0">{STATUS_LABEL[s]}</span>
                {s === a.status && <CheckIcon className="w-3.5 h-3.5 text-ink-faint" />}
              </button>
            ))}
          </div>
        ) : (
          <div key="main" className="p-1">
            {manage && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-ink`}
                  onClick={() => {
                    setOpen(false);
                    ctx?.openEditor(a);
                  }}
                >
                  <EditIcon className="w-3.5 h-3.5 text-ink-soft" />
                  Edit
                </button>
                <div className="my-1 h-px bg-line/10" />
              </>
            )}
            {a.code && (
              <button type="button" role="menuitem" className={`${item} text-ink`} onClick={() => void copy(a.code!, `Code ${a.code}`)}>
                <CopyIcon className="w-3.5 h-3.5 text-ink-soft" />
                Copy the code
              </button>
            )}
            {a.productUrl && (
              <button type="button" role="menuitem" className={`${item} text-ink`} onClick={() => void copy(a.productUrl!, "Product link")}>
                <CopyIcon className="w-3.5 h-3.5 text-ink-soft" />
                Copy the product link
              </button>
            )}
            <button type="button" role="menuitem" className={`${item} text-ink`} onClick={() => void copy(descriptionText([a]), "Lines for a description")}>
              <CopyIcon className="w-3.5 h-3.5 text-ink-soft" />
              Copy for a description
            </button>
            {(a.productUrl || a.platformUrl) && <div className="my-1 h-px bg-line/10" />}
            {a.productUrl && (
              <a role="menuitem" href={a.productUrl} target="_blank" rel="noopener noreferrer nofollow" className={`${item} text-ink`} onClick={() => setOpen(false)}>
                <ExternalIcon className="w-3.5 h-3.5 text-ink-soft" />
                Open the product
              </a>
            )}
            {a.platformUrl && (
              <a role="menuitem" href={a.platformUrl} target="_blank" rel="noopener noreferrer" className={`${item} text-ink`} onClick={() => setOpen(false)}>
                <ExternalIcon className="w-3.5 h-3.5 text-ink-soft" />
                Open the affiliate platform
              </a>
            )}
            {manage && (
              <>
                <div className="my-1 h-px bg-line/10" />
                <button type="button" role="menuitem" aria-haspopup="menu" className={`${item} text-ink`} disabled={busy} onClick={() => setView("status")}>
                  <span className="w-3.5 h-3.5 flex items-center justify-center" aria-hidden>
                    <span className="w-2 h-2 rounded-[3px]" style={{ background: STATUS_COLOR[a.status] }} />
                  </span>
                  <span className="flex-1 min-w-0">Status</span>
                  <span className="text-[11px] font-normal text-ink-faint">{STATUS_LABEL[a.status]}</span>
                  <ChevronRightIcon className="w-3.5 h-3.5 text-ink-faint" />
                </button>
                <div className="my-1 h-px bg-line/10" />
                <button type="button" role="menuitem" className={`${item} text-red hover:!bg-red/10`} disabled={busy} onClick={() => void remove()}>
                  <TrashIcon className="w-3.5 h-3.5" />
                  Delete…
                </button>
              </>
            )}
          </div>
        )}
      </AnchoredMenu>
    </>
  );
}
