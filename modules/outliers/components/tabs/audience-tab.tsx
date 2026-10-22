"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Dialog } from "@/components/ui/dialog";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { addChannelsToNiche, nicheFromChannels } from "@/app/(dashboard)/outliers/actions";
import { compact } from "../../lib/filters";
import { countryName, langName } from "../../lib/regions";
import type { AudienceChannel, NicheInfo } from "../../lib/types";
import type { AudienceTabData } from "../../lib/view";
import { BTN, BTN_MAIN, ChannelAvatar, EmptyNote, FIELD, LABEL, NicheDot, PeopleIcon, SourceNote, Thumb, TimeAgo } from "../bits";
import { ChannelMenu, type MenuItem } from "../card-menu";
import { useOutliers, useOutliersBlocked } from "../context";
import { useShellNav } from "../shell-nav";
import { TrackButton } from "../track-button";

/*
 * Audience (1.29.0): the channels the team's viewers also watch, worked out
 * once a day from where YouTube sends viewers to the team's videos (the
 * videos they watched just before) and what YouTube suggests next to the
 * team's best videos. Pick some and add them to a niche (they always count
 * there), or make a niche of just them: then only their outliers show.
 */

export function AudienceTab({ data }: { data: AudienceTabData }) {
  const ctx = useOutliers();
  const nav = useShellNav();
  const toast = useToast();
  const { blocked } = useOutliersBlocked();
  const { audience } = data;
  const rows = useMemo(() => audience.rows.filter((r) => !blocked.has(r.id)), [audience.rows, blocked]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [inNiche, setInNiche] = useState<Map<string, Set<string>>>(new Map());
  const [making, setMaking] = useState(false);
  const own = ctx.niches;
  const nichesOf = (c: AudienceChannel) => new Set([...c.niches, ...(inNiche.get(c.id) ?? [])]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const addTo = async (n: NicheInfo, ids: string[]) => {
    if (!ids.length) return;
    try {
      const r = await addChannelsToNiche(ctx.teamId, n.id, ids, "audience");
      if (r.error !== undefined) return toast.error(r.error);
      setInNiche((m) => {
        const next = new Map(m);
        for (const id of ids) next.set(id, new Set([...(next.get(id) ?? []), n.id]));
        return next;
      });
      setPicked(new Set());
      toast.success(`${ids.length === 1 ? (rows.find((x) => x.id === ids[0])?.title ?? "The channel") : `${ids.length} channels`} added to ${n.name}. They always count there.`);
    } catch {
      toast.error("Couldn't add them. Try again.");
    }
  };
  const itemsFor = (c: AudienceChannel): MenuItem[] =>
    ctx.canManage
      ? own
          .filter((n) => !nichesOf(c).has(n.id))
          .slice(0, 6)
          .map((n) => ({ label: `Add to ${n.name}`, icon: <PlusIcon className="w-4 h-4" />, onClick: () => addTo(n, [c.id]), tone: "amber" as const }))
      : [];

  const intro = (
    <div className="mb-5 rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-violet/12 text-violet flex items-center justify-center flex-shrink-0">
        <PeopleIcon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[18px] font-semibold leading-snug">Channels your viewers also watch</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft max-w-3xl">
          From where YouTube sends viewers to your videos: the videos they watched just before yours, and what YouTube suggests next to your best ones. Add them to a niche, or make a niche of just them to see only their outliers.
          {audience.at && (
            <span className="text-ink-faint">
              {" "}
              Updated <TimeAgo iso={audience.at} />.
            </span>
          )}
        </p>
      </div>
      {rows.length > 0 && (
        <button type="button" onClick={() => nav.go({ tab: "search", params: { scope: "audience" } })} className={`${BTN} flex-shrink-0 self-start md:self-auto text-ink`}>
          See their outliers
        </button>
      )}
    </div>
  );

  if (!rows.length) {
    const note = audience.note;
    return (
      <div>
        {intro}
        {note === "no-youtube" || !data.youtube ? (
          <EmptyNote
            title="Connect your YouTube channel first"
            action={
              ctx.isMaster ? (
                <Link href="/team?tab=accounts" className={BTN_MAIN}>
                  Connect it
                </Link>
              ) : undefined
            }
          >
            This list comes from your channel&rsquo;s own numbers on YouTube.{ctx.isMaster ? " Nothing is posted or changed on it." : " Ask a master to connect it in Team → Connected accounts."}
          </EmptyNote>
        ) : note === "no-analytics" ? (
          <EmptyNote
            title="YouTube didn't share where your views come from"
            action={
              ctx.isMaster ? (
                <Link href="/team?tab=accounts" className={BTN}>
                  Connected accounts
                </Link>
              ) : undefined
            }
          >
            Connect the channel again and allow its analytics, then this fills within a day.
          </EmptyNote>
        ) : note === "nothing-yet" ? (
          <EmptyNote title="Not enough views yet">YouTube shows where viewers come from once your videos have a few thousand views. This list fills by itself.</EmptyNote>
        ) : (
          <EmptyNote title="Working it out">This list is worked out once a day from your channel&rsquo;s numbers. It shows here within a day.</EmptyNote>
        )}
      </div>
    );
  }

  const ids = [...picked];
  return (
    <div>
      {intro}
      {ctx.canManage && picked.size > 0 && (
        <div className="sticky z-[5] mb-4" style={{ top: "calc(3.5rem + var(--ol-bar, 104px) + 8px)" }}>
          <div className="rounded-xl border border-amber/30 bg-surface shadow-lg px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold px-1">{picked.size} picked</span>
            <span className="flex-1" />
            {own.length > 0 && <AddToNiche niches={own} onPick={(n) => addTo(n, ids)} />}
            <button type="button" onClick={() => setMaking(true)} className={BTN_MAIN}>
              Make a niche of these
            </button>
            <button type="button" onClick={() => setPicked(new Set())} className={BTN}>
              Clear
            </button>
          </div>
        </div>
      )}
      <p className="mb-3 text-[13px] text-ink-soft">
        <span className="font-semibold text-ink tabular-nums">{rows.length}</span> channels, the ones sending you the most viewers first
        {ctx.canManage && <span className="text-ink-faint"> · tick the ones to add</span>}
      </p>
      <ul className="grid gap-3 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
        {rows.map((c) => (
          <AudienceCard key={c.id} c={c} on={picked.has(c.id)} onToggle={ctx.canManage ? () => toggle(c.id) : undefined} niches={own.filter((n) => nichesOf(c).has(n.id))} items={itemsFor(c)} />
        ))}
      </ul>
      <SourceNote className="mt-8" />
      <MakeNicheDialog open={making} onClose={() => setMaking(false)} ids={ids} onMade={(id) => nav.go({ tab: "home", niche: id })} />
    </div>
  );
}

function AudienceCard({ c, on, onToggle, niches, items }: { c: AudienceChannel; on: boolean; onToggle?: () => void; niches: NicheInfo[]; items: MenuItem[] }) {
  const ctx = useOutliers();
  const short = ctx.kind === "short";
  const where = [c.handle, countryName(c.country) || null, c.lang && c.lang !== "en" ? langName(c.lang) : null].filter(Boolean).join(" · ");
  return (
    <li className={`rounded-2xl border bg-surface p-3.5 transition-colors ${on ? "border-amber/50 ring-1 ring-amber/30" : "border-line/10"}`}>
      <div className="flex items-center gap-3">
        {onToggle && (
          <button type="button" role="checkbox" aria-checked={on} aria-label={`Pick ${c.title}`} onClick={onToggle} className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${on ? "bg-amber border-amber text-white" : "border-line/30 hover:border-line/50"}`}>
            {on && <CheckIcon className="w-3.5 h-3.5" />}
          </button>
        )}
        <button type="button" onClick={() => ctx.openChannel(c.id, c)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <ChannelAvatar src={c.avatar} title={c.title || "?"} size={42} />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold truncate hover:underline">{c.title || "A channel"}</span>
            <span className="block text-[11.5px] text-ink-faint truncate">{where || `${compact(c.subs)} subscribers`}</span>
          </span>
        </button>
        <TrackButton channelId={c.id} label={false} size="sm" />
        <ChannelMenu c={c} items={items} />
      </div>
      <div className="mt-3 flex flex-col min-[480px]:flex-row min-[480px]:items-end gap-3">
        <div className="min-w-0 flex-1 grid grid-cols-3 gap-2 text-[12px]">
          <span title="Views YouTube sent your videos from this channel's (last 90 days, as far as YouTube says)">
            <span className="block text-ink-faint whitespace-nowrap">Sent you</span>
            <span className="block font-semibold tabular-nums text-ink">{c.views ? compact(c.views) : "a few"}</span>
          </span>
          <span title="How many of your videos it sent viewers to">
            <span className="block text-ink-faint whitespace-nowrap">Next to</span>
            <span className="block font-semibold tabular-nums text-ink">
              {c.ours} of yours
            </span>
          </span>
          <span>
            <span className="block text-ink-faint whitespace-nowrap">{short ? "Usual Short" : "Usual video"}</span>
            <span className="block font-semibold tabular-nums text-ink">{compact(short ? c.shortMedian : c.longMedian)}</span>
          </span>
        </div>
        {c.top.length > 0 && (
          <div className="flex -space-x-2 flex-shrink-0 self-start min-[480px]:self-auto" aria-label="Its videos that sent you viewers">
            {c.top.slice(0, 3).map((id) => (
              <button key={id} type="button" onClick={() => ctx.openVideo(id)} title="Open this video" className="relative w-[64px] aspect-video rounded-md overflow-hidden bg-surface-2 ring-2 ring-surface hover:z-[1] hover:scale-105 transition-transform">
                <Thumb id={id} kind="long" sizes="64px" />
              </button>
            ))}
          </div>
        )}
      </div>
      {niches.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {niches.map((n) => (
            <span key={n.id} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 h-6 text-[11.5px] font-semibold text-ink-soft">
              <NicheDot color={n.color} />
              In {n.name}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function AddToNiche({ niches, onPick }: { niches: NicheInfo[]; onPick: (n: NicheInfo) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={`${BTN} text-ink`}>
        Add to a niche
        <ChevronDownIcon className="w-4 h-4 text-ink-faint" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={anchor} width={260} label="Niches">
        <div className="p-1.5">
          {niches.map((n) => (
            <button
              key={n.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(n);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-left text-[13.5px] hover:bg-surface-2"
            >
              <NicheDot color={n.color} />
              <span className="flex-1 truncate">{n.name}</span>
            </button>
          ))}
        </div>
      </AnchoredMenu>
    </>
  );
}

function MakeNicheDialog({ open, onClose, ids, onMade }: { open: boolean; onClose: () => void; ids: string[]; onMade: (id: string) => void }) {
  const ctx = useOutliers();
  const toast = useToast();
  const [name, setName] = useState("Channels my viewers watch");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const r = await nicheFromChannels(ctx.teamId, name.trim(), ids);
      if (r.error !== undefined) return toast.error(r.error);
      toast.success(`${name.trim()} is ready. Their videos are read now.`);
      onClose();
      onMade(r.id);
    } catch {
      toast.error("Couldn't make the niche. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Make a niche of these"
      description={`A niche of just these ${ids.length} channels: only their outliers show in it. You can add channels or keywords to it later.`}
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy || !name.trim()} className={BTN_MAIN}>
            {busy ? "Making it…" : "Make the niche"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className={LABEL}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={FIELD} data-autofocus />
        </label>
      </form>
    </Dialog>
  );
}
