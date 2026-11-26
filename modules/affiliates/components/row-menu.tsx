"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, EditIcon, ExternalIcon, LockIcon, MoreIcon, PlusIcon, SearchIcon, TrashIcon, UserIcon } from "@/components/ui/icons";
import { itemsAway } from "@/lib/remove-animation";
import { deleteCompanies, deleteProducts, moveProducts, setProductsKinds, setProductsStatus } from "@/app/(dashboard)/sponsorships/actions";
import { AFFILIATE_STATUSES, companyDescription, dealOf, DEAL_KINDS, descriptionText, KIND_COLOR, KIND_HINT, KIND_LABEL, kindsText, STATUS_COLOR, STATUS_LABEL, type AffiliateStatus, type Company, type DealKind, type Product } from "../lib/rules";
import { copyWhenReady, useAffiliates, type CompanyRef } from "./affiliates-context";

/*
 * ⋯ on a company and on a product (1.56.0 on a sponsorship; 1.58.0 the two). Everyone: copy a code, a link, or the
 * lines for a video's description; open the product or the affiliate platform. Masters and the people they let in:
 * the company's login, shown or a part copied without showing it; edit either, add a product to a company, move a
 * company's products (or one) to another company; a product's kind (tick or untick Affiliate, Review, Paid; at least
 * one stays) and status; delete either (asked first; a company goes with its products, and one with a login needs the
 * password, as changing its login does).
 */

const ITEM = "w-full flex items-center gap-2.5 text-left rounded-lg px-3 h-9 text-[13px] font-semibold hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent";

function MenuButton({ label, open, busy, onClick, btn, className = "" }: { label: string; open: boolean; busy: boolean; onClick: () => void; btn: React.RefObject<HTMLButtonElement | null>; className?: string }) {
  return (
    <button
      ref={btn}
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-busy={busy || undefined}
      className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${className}`}
    >
      {busy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin" aria-hidden /> : <MoreIcon className="w-4 h-4" />}
    </button>
  );
}

/** Back to the menu's first page. */
function Back({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <>
      <button type="button" role="menuitem" className={`${ITEM} !text-ink-soft`} onClick={onClick}>
        <ChevronLeftIcon className="w-3.5 h-3.5" />
        {label}
      </button>
      <div className="my-1 h-px bg-line/10" />
    </>
  );
}

/** The team's other companies, to move products to (found by name when there are many). */
function CompanyList({ except, onPick }: { except: string; onPick: (c: CompanyRef) => void }) {
  const ctx = useAffiliates();
  const [q, setQ] = useState("");
  const find = useRef<HTMLInputElement>(null);
  const all = useMemo(() => (ctx?.companies ?? []).filter((c) => c.id !== except).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true })), [ctx?.companies, except]);
  const many = all.length > 8;
  useEffect(() => {
    if (many) requestAnimationFrame(() => find.current?.focus());
  }, [many]);
  const shown = q.trim() ? all.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())) : all;
  if (!all.length) return <p className="px-3 py-2 text-[12.5px] text-ink-faint">There&rsquo;s no other company yet.</p>;
  return (
    <>
      {many && (
        <div className="flex items-center gap-2 px-2.5 h-9 mb-1 rounded-lg bg-surface-2">
          <SearchIcon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
          <input
            ref={find}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown[0]) {
                e.preventDefault();
                onPick(shown[0]);
              }
            }}
            placeholder="Find a company"
            aria-label="Find a company"
            className="flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-ink-faint/70"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
      <div className="max-h-64 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll">
        {shown.map((c) => (
          <button key={c.id} type="button" role="menuitem" className={`${ITEM} font-medium text-ink`} onClick={() => onPick(c)}>
            <span className="flex-1 min-w-0 truncate">{c.name}</span>
            {c.code && <span className="font-mono text-[11px] text-ink-faint truncate max-w-[6rem]">{c.code}</span>}
          </button>
        ))}
        {!shown.length && <p className="px-3 py-2 text-[12.5px] text-ink-faint">No company called that.</p>}
      </div>
    </>
  );
}

async function copyText(toast: ReturnType<typeof useToast>, text: string, what: string) {
  if (await copyWhenReady(Promise.resolve(text))) toast.success(`${what} copied`);
  else toast.error("Couldn't copy. Select it and copy it by hand.");
}

/** ⋯ on a company's heading. */
export function CompanyMenu({ company, className = "" }: { company: Company; className?: string }) {
  const ctx = useAffiliates();
  const toast = useToast();
  const confirm = useConfirm();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "move">("main");
  const [busy, setBusy] = useState(false);
  const c = company;
  const manage = !!ctx?.manage;
  // Everything it has (the list may show only some of its products).
  const whole = ctx?.companies.find((x) => x.id === c.id) ?? c;
  const n = whole.products.length;

  async function move(to: CompanyRef) {
    setOpen(false);
    if (!ctx || !n) return;
    setBusy(true);
    try {
      const r = await moveProducts(
        ctx.teamId,
        whole.products.map((p) => p.id),
        to.id
      );
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(`${r.moved === 1 ? "1 product" : `${r.moved} products`} moved to ${to.name}. ${c.name} has none now: delete it from its ⋯ if it's done.`);
    } catch {
      toast.error("Couldn't move them. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(again = true) {
    setOpen(false);
    if (!ctx) return;
    if (again) {
      const ok = await confirm({
        title: `Delete ${c.name}?`,
        description: `It goes for good${n ? `, with its ${n === 1 ? "product" : `${n} products`}` : ""}${c.login ? `${n ? " and" : ", with"} its login (written down for the masters)` : ""}. The videos they link stay.`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      if (c.login && !(await ctx.ensureUnlocked())) return;
    }
    setBusy(true);
    const el = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(c.id)}"]`);
    const anim = el ? itemsAway([el]) : null;
    try {
      if (anim) await anim.out;
      const asked = deleteCompanies(ctx.teamId, [c.id]);
      const closing = anim?.collapse();
      const r = await asked;
      if (r.error !== undefined) {
        anim?.restore();
        if (r.locked && again && (await ctx.ensureUnlocked())) return void (await remove(false));
        return void toast.error(r.error);
      }
      if (r.failed.length) {
        anim?.restore();
        return void toast.error(`${c.name} couldn't be deleted. Refresh and try again.`);
      }
      await closing;
      toast.success(`${c.name} deleted`, anim ? { sound: false } : undefined);
    } catch {
      anim?.restore();
      toast.error("Couldn't delete it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const act = (f: () => void) => () => {
    setOpen(false);
    f();
  };

  return (
    <>
      <MenuButton
        btn={btn}
        label={`Actions for ${c.name}`}
        open={open}
        busy={busy}
        className={className}
        onClick={() => {
          setView("main");
          setOpen((o) => !o);
        }}
      />
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={260} label={view === "move" ? `Move ${c.name}'s products` : `Actions for ${c.name}`}>
        {view === "move" ? (
          <div key="move" className="p-1 menu-slide-in">
            <Back label={`Move ${n === 1 ? "its product" : `its ${n} products`} to`} onClick={() => setView("main")} />
            <CompanyList except={c.id} onPick={(to) => void move(to)} />
          </div>
        ) : (
          <div key="main" className="p-1">
            {manage && (
              <>
                <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => ctx?.openCompany(whole))}>
                  <EditIcon className="w-3.5 h-3.5 text-ink-soft" />
                  Edit the company
                </button>
                <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => ctx?.openProduct({ companyId: c.id }))}>
                  <PlusIcon className="w-3.5 h-3.5 text-ink-soft" />
                  Add a product
                </button>
                <div className="my-1 h-px bg-line/10" />
              </>
            )}
            {c.code && (
              <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => void copyText(toast, c.code!, `Code ${c.code}`))}>
                <CopyIcon className="w-3.5 h-3.5 text-ink-soft" />
                Copy the code
              </button>
            )}
            <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => void copyText(toast, companyDescription(c), "Lines for a description"))}>
              <CopyIcon className="w-3.5 h-3.5 text-ink-soft" />
              Copy for a description
            </button>
            {c.platformUrl && (
              <>
                <div className="my-1 h-px bg-line/10" />
                <a role="menuitem" href={c.platformUrl} target="_blank" rel="noopener noreferrer" className={`${ITEM} text-ink`} onClick={() => setOpen(false)}>
                  <ExternalIcon className="w-3.5 h-3.5 text-ink-soft" />
                  Open the affiliate platform
                </a>
              </>
            )}
            {manage && c.login && (
              <>
                <div className="my-1 h-px bg-line/10" />
                <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => void ctx?.show(c))}>
                  <LockIcon className="w-3.5 h-3.5 text-ink-soft" />
                  Show the login
                </button>
                <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => void ctx?.copyPart(c, "username"))}>
                  <UserIcon className="w-3.5 h-3.5 text-ink-soft" />
                  Copy the username
                </button>
                <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => void ctx?.copyPart(c, "password"))}>
                  <CopyIcon className="w-3.5 h-3.5 text-ink-soft" />
                  Copy the password
                </button>
              </>
            )}
            {manage && (
              <>
                <div className="my-1 h-px bg-line/10" />
                {n > 0 && (ctx?.companies.length ?? 0) > 1 && (
                  <button type="button" role="menuitem" aria-haspopup="menu" className={`${ITEM} text-ink`} disabled={busy} onClick={() => setView("move")}>
                    <span className="w-3.5 h-3.5" aria-hidden />
                    <span className="flex-1 min-w-0">Move its products to</span>
                    <ChevronRightIcon className="w-3.5 h-3.5 text-ink-faint" />
                  </button>
                )}
                <button type="button" role="menuitem" className={`${ITEM} text-red hover:!bg-red/10`} disabled={busy} onClick={() => void remove()}>
                  <TrashIcon className="w-3.5 h-3.5" />
                  Delete the company…
                </button>
              </>
            )}
          </div>
        )}
      </AnchoredMenu>
    </>
  );
}

/** ⋯ on a product. */
export function ProductMenu({ product, company, className = "" }: { product: Product; company: Company; className?: string }) {
  const ctx = useAffiliates();
  const toast = useToast();
  const confirm = useConfirm();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "status" | "kind" | "move">("main");
  const [busy, setBusy] = useState(false);
  const p = product;
  const manage = !!ctx?.manage;
  const deal = dealOf(p, company);

  async function run(work: () => Promise<{ error?: string }>, done: string) {
    setOpen(false);
    if (!ctx) return;
    setBusy(true);
    try {
      const r = await work();
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(done);
    } catch {
      toast.error("Couldn't change it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const status = (to: AffiliateStatus) => (to === p.status ? setOpen(false) : void run(() => setProductsStatus(ctx!.teamId, [p.id], to), `${p.name}: ${STATUS_LABEL[to]}`));

  /** A kind ticked or unticked (the last one stays: a product is at least one kind). */
  function toggleKind(k: DealKind) {
    const on = p.kinds.includes(k);
    if (on && p.kinds.length === 1) return void toast.error(`${p.name} is at least one kind. Tick another first.`);
    const next = on ? p.kinds.filter((x) => x !== k) : DEAL_KINDS.filter((x) => x === k || p.kinds.includes(x));
    void run(() => setProductsKinds(ctx!.teamId, [p.id], next), `${p.name}: ${kindsText(next)}`);
  }

  const move = (to: CompanyRef) => void run(() => moveProducts(ctx!.teamId, [p.id], to.id), `${p.name} moved to ${to.name}${p.ownCode ? "" : `: it goes by ${to.name}'s code now`}`);

  async function remove() {
    setOpen(false);
    if (!ctx) return;
    const ok = await confirm({ title: `Delete ${p.name}?`, description: `It goes for good. ${company.name} and the videos it links stay.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    setBusy(true);
    const el = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(p.id)}"]`);
    const anim = el ? itemsAway([el]) : null;
    try {
      if (anim) await anim.out;
      const asked = deleteProducts(ctx.teamId, [p.id]);
      const closing = anim?.collapse();
      const r = await asked;
      if (r.error !== undefined || r.failed.length) {
        anim?.restore();
        return void toast.error(r.error ?? `${p.name} couldn't be deleted. Refresh and try again.`);
      }
      await closing;
      toast.success(`${p.name} deleted`, anim ? { sound: false } : undefined);
    } catch {
      anim?.restore();
      toast.error("Couldn't delete it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const act = (f: () => void) => () => {
    setOpen(false);
    f();
  };

  return (
    <>
      <MenuButton
        btn={btn}
        label={`Actions for ${p.name}`}
        open={open}
        busy={busy}
        className={className}
        onClick={() => {
          setView("main");
          setOpen((o) => !o);
        }}
      />
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchor={btn}
        width={260}
        label={view === "status" ? `${p.name}: status` : view === "kind" ? `${p.name}: type` : view === "move" ? `Move ${p.name}` : `Actions for ${p.name}`}
      >
        {view === "kind" ? (
          <div key="kind" className="p-1 menu-slide-in">
            <Back label="Type" onClick={() => setView("main")} />
            {DEAL_KINDS.map((k) => (
              <button key={k} type="button" role="menuitemcheckbox" aria-checked={p.kinds.includes(k)} title={KIND_HINT[k]} className={`${ITEM} font-medium text-ink`} onClick={() => toggleKind(k)}>
                <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: KIND_COLOR[k] }} aria-hidden />
                <span className="flex-1 min-w-0">{KIND_LABEL[k]}</span>
                {p.kinds.includes(k) && <CheckIcon className="w-3.5 h-3.5 text-ink-faint" />}
              </button>
            ))}
          </div>
        ) : view === "status" ? (
          <div key="status" className="p-1 menu-slide-in">
            <Back label="Status" onClick={() => setView("main")} />
            {AFFILIATE_STATUSES.map((s) => (
              <button key={s} type="button" role="menuitemradio" aria-checked={s === p.status} className={`${ITEM} font-medium text-ink`} onClick={() => status(s)}>
                <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: STATUS_COLOR[s] }} aria-hidden />
                <span className="flex-1 min-w-0">{STATUS_LABEL[s]}</span>
                {s === p.status && <CheckIcon className="w-3.5 h-3.5 text-ink-faint" />}
              </button>
            ))}
          </div>
        ) : view === "move" ? (
          <div key="move" className="p-1 menu-slide-in">
            <Back label="Move it to" onClick={() => setView("main")} />
            <CompanyList except={company.id} onPick={move} />
          </div>
        ) : (
          <div key="main" className="p-1">
            {manage && (
              <>
                <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => ctx?.openProduct(p))}>
                  <EditIcon className="w-3.5 h-3.5 text-ink-soft" />
                  Edit
                </button>
                <div className="my-1 h-px bg-line/10" />
              </>
            )}
            {deal.code && (
              <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => void copyText(toast, deal.code!, `Code ${deal.code}`))}>
                <CopyIcon className="w-3.5 h-3.5 text-ink-soft" />
                <span className="flex-1 min-w-0">Copy the code</span>
                {!deal.own && <span className="text-[11px] font-normal text-ink-faint truncate max-w-[6.5rem]">{company.name}&rsquo;s</span>}
              </button>
            )}
            {p.productUrl && (
              <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => void copyText(toast, p.productUrl!, "Product link"))}>
                <CopyIcon className="w-3.5 h-3.5 text-ink-soft" />
                Copy the product link
              </button>
            )}
            <button type="button" role="menuitem" className={`${ITEM} text-ink`} onClick={act(() => void copyText(toast, descriptionText([{ product: p, company }]), "Lines for a description"))}>
              <CopyIcon className="w-3.5 h-3.5 text-ink-soft" />
              Copy for a description
            </button>
            {p.productUrl && (
              <>
                <div className="my-1 h-px bg-line/10" />
                <a role="menuitem" href={p.productUrl} target="_blank" rel="noopener noreferrer nofollow" className={`${ITEM} text-ink`} onClick={() => setOpen(false)}>
                  <ExternalIcon className="w-3.5 h-3.5 text-ink-soft" />
                  Open the product
                </a>
              </>
            )}
            {manage && (
              <>
                <div className="my-1 h-px bg-line/10" />
                <button type="button" role="menuitem" aria-haspopup="menu" className={`${ITEM} text-ink`} disabled={busy} onClick={() => setView("kind")}>
                  <span className="w-3.5 h-3.5 flex items-center justify-center gap-px" aria-hidden>
                    {p.kinds.map((k) => (
                      <span key={k} className="w-1 h-2.5 rounded-[1.5px]" style={{ background: KIND_COLOR[k] }} />
                    ))}
                  </span>
                  <span className="flex-1 min-w-0">Type</span>
                  <span className="text-[11px] font-normal text-ink-faint truncate max-w-[7rem]">{kindsText(p.kinds)}</span>
                  <ChevronRightIcon className="w-3.5 h-3.5 text-ink-faint" />
                </button>
                <button type="button" role="menuitem" aria-haspopup="menu" className={`${ITEM} text-ink`} disabled={busy} onClick={() => setView("status")}>
                  <span className="w-3.5 h-3.5 flex items-center justify-center" aria-hidden>
                    <span className="w-2 h-2 rounded-[3px]" style={{ background: STATUS_COLOR[p.status] }} />
                  </span>
                  <span className="flex-1 min-w-0">Status</span>
                  <span className="text-[11px] font-normal text-ink-faint">{STATUS_LABEL[p.status]}</span>
                  <ChevronRightIcon className="w-3.5 h-3.5 text-ink-faint" />
                </button>
                {(ctx?.companies.length ?? 0) > 1 && (
                  <button type="button" role="menuitem" aria-haspopup="menu" className={`${ITEM} text-ink`} disabled={busy} onClick={() => setView("move")}>
                    <span className="w-3.5 h-3.5" aria-hidden />
                    <span className="flex-1 min-w-0">Move to</span>
                    <ChevronRightIcon className="w-3.5 h-3.5 text-ink-faint" />
                  </button>
                )}
                <div className="my-1 h-px bg-line/10" />
                <button type="button" role="menuitem" className={`${ITEM} text-red hover:!bg-red/10`} disabled={busy} onClick={() => void remove()}>
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
