"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { useToast } from "@/components/ui/toast-provider";
import { BankIcon, CheckIcon, MoneyIcon } from "@/components/ui/icons";
import { wordColor } from "@/lib/word-color";
import { setCompanyPayout } from "@/app/(dashboard)/sponsorships/actions";
import { PAYOUT_COLOR, PAYOUT_HINT, PAYOUT_LABEL, PAYOUTS, type Company, type Payout } from "../lib/rules";
import { useAffiliates } from "./affiliates-context";

/*
 * Where a company's money goes (1.60.0; the owner: "a setting where i can select where the money goes to, either bank
 * account or paypal or other payments like this, not with details just like a quick icon with those thing"). A small
 * icon in its colour beside the company's deal, with the name where there's room (no real logos: plain icons, and the
 * name). The people who manage sponsorships click it to pick (or say nothing); the company's window has it too.
 * Everyone else sees it, or nothing when it isn't said.
 */

// Plain icons of its own (kept here, not with the app's: only this page draws them, and every page loads those).
type IconProps = { className?: string };
function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {children}
    </svg>
  );
}
/** A wallet (1.60.0: money paid to an online account, as PayPal). */
function WalletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M16.75 6.25V5.1a1.4 1.4 0 0 0-1.75-1.35L5.25 6.25" />
      <rect x="3.5" y="6.25" width="17" height="13.25" rx="2.25" />
      <path d="M20.5 11.25h-3.75a1.75 1.75 0 0 0 0 3.5h3.75" />
    </Svg>
  );
}
/** Money sent across (1.60.0: a transfer service). */
function TransferIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8.5h15l-3.5-3.5M20 15.5H5l3.5 3.5" />
    </Svg>
  );
}
/** The world (1.60.0: paid from abroad). */
function GlobeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M3.25 12h17.5M12 3.25c2.35 2.4 3.5 5.3 3.5 8.75s-1.15 6.35-3.5 8.75c-2.35-2.4-3.5-5.3-3.5-8.75S9.65 5.65 12 3.25Z" />
    </Svg>
  );
}
/** A payment card (1.60.0). */
function CardIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M6.5 14.75h3.5" />
    </Svg>
  );
}
/** A present (1.60.0: store credit, gift cards). */
function GiftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.75" y="8.5" width="16.5" height="4" rx="1" />
      <path d="M5.25 12.5v6.25a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V12.5M12 8.5v11.75" />
      <path d="M12 8.5c-1.1-2.85-4.85-3.65-5.2-1.45-.25 1.7 2.75 1.45 5.2 1.45Zm0 0c1.1-2.85 4.85-3.65 5.2-1.45.25 1.7-2.75 1.45-5.2 1.45Z" />
    </Svg>
  );
}
const ICONS: Record<Payout, (p: { className?: string }) => React.ReactElement> = {
  bank: BankIcon,
  paypal: WalletIcon,
  wise: TransferIcon,
  payoneer: GlobeIcon,
  revolut: CardIcon,
  credit: GiftIcon,
  other: MoneyIcon,
};

export function PayoutIcon({ payout, className = "w-3.5 h-3.5" }: { payout: Payout; className?: string }) {
  const Icon = ICONS[payout];
  return <Icon className={className} />;
}

/** The chip's colours for a way (its colour, softly behind). */
export const payoutStyle = (p: Payout) => ({ color: wordColor(PAYOUT_COLOR[p]), background: `color-mix(in srgb, ${PAYOUT_COLOR[p]} 14%, rgb(var(--surface)))` });

/**
 * The company's payout as a chip. `label`: classes for its name (e.g. "max-lg:sr-only": the icon alone where the
 * column is narrow; "sr-only": always the icon alone).
 */
export function PayoutChip({ company, label = "" }: { company: Pick<Company, "id" | "name" | "payout">; label?: string }) {
  const ctx = useAffiliates();
  const toast = useToast();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ctx?.extras) return null;
  const p = company.payout;
  if (!p && !ctx.manage) return null;
  const said = p ? `Paid to: ${PAYOUT_LABEL[p]}` : "Where its money goes isn't set";
  const iconOnly = label === "sr-only";
  const cls = `relative z-10 inline-flex items-center gap-1 rounded-md font-bold whitespace-nowrap text-[11px] h-6 flex-shrink-0 ${iconOnly ? "w-6 justify-center" : "px-1.5"} ${
    p ? "" : "border border-dashed border-line/30 text-ink-faint"
  }`;
  const face = (
    <>
      {busy ? (
        <span className="w-3 h-3 rounded-full border-2 border-current/30 border-t-current animate-spin flex-shrink-0" aria-hidden />
      ) : p ? (
        <PayoutIcon payout={p} className="w-3.5 h-3.5 flex-shrink-0" />
      ) : (
        <MoneyIcon className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      <span className={label}>{p ? PAYOUT_LABEL[p] : "Paid to"}</span>
    </>
  );

  if (!ctx.manage)
    return (
      <span className={cls} style={p ? payoutStyle(p) : undefined} title={said} data-payout={p ?? ""}>
        {face}
      </span>
    );

  async function pick(to: Payout | null) {
    setOpen(false);
    if (!ctx || to === p) return;
    setBusy(true);
    try {
      const r = await setCompanyPayout(ctx.teamId, company.id, to);
      if (r.error !== undefined) toast.error(r.error);
      else toast.success(to ? `${company.name}: paid to ${PAYOUT_LABEL[to]}` : `${company.name}: where its money goes isn't set`);
    } catch {
      toast.error("Couldn't change it. Check your connection and try again.");
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
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        aria-label={`${company.name}: ${p ? `paid to ${PAYOUT_LABEL[p]}` : "where its money goes isn't set"}. Change it`}
        title={`${said}. Click to change it.`}
        data-payout={p ?? ""}
        className={`${cls} transition-[filter,background-color] hover:brightness-95 ${p ? "" : "hover:text-ink hover:border-line/50"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber`}
        style={p ? payoutStyle(p) : undefined}
      >
        {face}
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={272} label={`${company.name}: where its money goes`}>
        <div className="p-1 max-h-[min(26rem,70vh)] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll">
          <p className="px-3 pt-1.5 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Where its money goes</p>
          {PAYOUTS.map((o) => (
            <button
              key={o}
              type="button"
              role="menuitemradio"
              aria-checked={o === p}
              onClick={() => void pick(o)}
              className="w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-1.5 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
            >
              <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={payoutStyle(o)} aria-hidden>
                <PayoutIcon payout={o} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-ink">{PAYOUT_LABEL[o]}</span>
                <span className="block text-[11.5px] text-ink-faint truncate">{PAYOUT_HINT[o]}</span>
              </span>
              {o === p && <CheckIcon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />}
            </button>
          ))}
          {p && (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={false}
              onClick={() => void pick(null)}
              className="mt-1 w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2 border-t border-line/10 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none text-[13px] font-semibold text-ink-soft"
            >
              Not set
            </button>
          )}
        </div>
      </AnchoredMenu>
    </>
  );
}

/** The company's window: the ways as chips, one picked (a click on it again: none). */
export function PayoutPicker({ value, onChange, labelledBy }: { value: Payout | null; onChange: (p: Payout | null) => void; labelledBy: string }) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-1.5">
      {PAYOUTS.map((o) => {
        const on = o === value;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : o)}
            title={PAYOUT_HINT[o]}
            className={`inline-flex items-center gap-1.5 rounded-lg h-8 px-2.5 text-[12.5px] font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
              on ? "border-transparent" : "border-line/15 text-ink-soft hover:text-ink hover:bg-surface-2"
            }`}
            style={on ? payoutStyle(o) : undefined}
          >
            <PayoutIcon payout={o} />
            {PAYOUT_LABEL[o]}
          </button>
        );
      })}
    </div>
  );
}
