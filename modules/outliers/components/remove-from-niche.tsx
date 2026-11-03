"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { useConfirm } from "@/components/ui/confirm-provider";
import { ChevronDownIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { setChannelHidden } from "@/app/(dashboard)/outliers/actions";
import { NicheDot } from "./bits";
import { useOutliers } from "./context";

/*
 * Take a channel out of one of the team's niches, from the top of its panel
 * or one of its videos' (1.30.1): straight from the niche being looked at
 * (or the only one it's in), a menu when it's in several. Asks first; Undo
 * puts it back. Its videos stop showing in that niche; it stays everywhere
 * else (Channels → Removed brings it back). Masters and researchers only.
 */

type Niche = { id: string; name: string; color: string };

export function RemoveFromNiche({ channel, nicheIds, onChange }: { channel: { id: string; title: string }; nicheIds: string[]; onChange?: (nicheId: string, removed: boolean) => void }) {
  const ctx = useOutliers();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  // The team's own niches it's in (an explore niche isn't the team's to change).
  const niches: Niche[] = ctx.niches.filter((n) => nicheIds.includes(n.id)).map((n) => ({ id: n.id, name: n.name, color: n.color }));
  if (!ctx.canManage || !niches.length) return null;
  const direct = niches.length === 1 ? niches[0] : niches.find((n) => n.id === ctx.nicheId) ?? null;
  const name = channel.title || "this channel";

  const put = async (n: Niche, removed: boolean) => {
    const r = await setChannelHidden(ctx.teamId, n.id, channel.id, removed);
    if (r.error !== undefined) throw new Error(r.error);
    onChange?.(n.id, removed);
  };
  const remove = async (n: Niche) => {
    setOpen(false);
    if (busy) return;
    const ok = await confirm({
      title: `Remove ${name} from ${n.name}?`,
      description: `Its videos stop showing in ${n.name} and it doesn't count there any more. It stays everywhere else, and Channels → Removed brings it back.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await put(n, true);
      toast.success(`${name} is out of ${n.name}.`, {
        action: {
          label: "Undo",
          onClick: () => {
            put(n, false)
              .then(() => toast.success(`${name} is back in ${n.name}.`))
              .catch((e) => toast.error(e instanceof Error && e.message ? e.message : "Couldn't put it back. Try again."));
          },
        },
      });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Couldn't remove it. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/15 h-9 text-[13px] font-semibold text-ink-soft hover:text-red hover:border-red/40 transition-colors disabled:opacity-50";
  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={busy}
        onClick={() => (direct ? void remove(direct) : setOpen((o) => !o))}
        aria-haspopup={direct ? undefined : "menu"}
        aria-expanded={direct ? undefined : open}
        aria-label={direct ? `Remove ${name} from ${direct.name}` : `Remove ${name} from a niche`}
        title={direct ? `Remove from ${direct.name}: its videos stop showing there` : "Remove from one of your niches"}
        className={`${base} w-9 sm:w-auto sm:px-3`}
      >
        {busy ? <span className="w-4 h-4 rounded-full border-2 border-line/30 border-t-red animate-spin" aria-hidden /> : <NicheMinusIcon className="w-4 h-4" />}
        <span className="hidden sm:inline max-w-[14rem] truncate">{direct ? `Remove from ${direct.name}` : "Remove from niche"}</span>
        {!direct && <ChevronDownIcon className="hidden sm:block w-3.5 h-3.5 text-ink-faint" />}
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={anchor} width={260} label="Remove from a niche">
        <div className="p-1.5">
          <p className="px-3 pt-1 pb-1.5 text-[11.5px] font-semibold text-ink-faint">Remove {name} from</p>
          {niches.map((n) => (
            <button key={n.id} type="button" role="menuitem" onClick={() => void remove(n)} className="w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-left text-[13.5px] hover:bg-surface-2">
              <NicheDot color={n.color} />
              <span className="flex-1 truncate">{n.name}</span>
            </button>
          ))}
        </div>
      </AnchoredMenu>
    </>
  );
}

/** A niche's folder with a minus (take a channel out of it). */
function NicheMinusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3.75 7.25A2.25 2.25 0 0 1 6 5h3.4l2 2.25H18a2.25 2.25 0 0 1 2.25 2.25v7.25A2.25 2.25 0 0 1 18 19H6a2.25 2.25 0 0 1-2.25-2.25Z" />
      <path d="M9 13h6" />
    </svg>
  );
}
