"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { ExternalIcon } from "@/components/ui/icons";
import type { OutlierVideo } from "../lib/types";
import { ChannelAvatar, DotsIcon, EyeOffIcon, youtubeChannel, youtubeVideo } from "./bits";
import { useOutliersBlocked, useOutliersNav } from "./context";

/*
 * A card's ⋯ menu (1.29.0): the channel's page, the video on YouTube, and
 * "Hide this channel": its videos leave every list at once and never show
 * in Outliers again (Outlier settings → Hidden channels brings it back).
 */
export function CardMenu({ v, overlay = false, className = "" }: { v: Pick<OutlierVideo, "id" | "channelId" | "channel">; overlay?: boolean; className?: string }) {
  const { openChannel } = useOutliersNav();
  const { hide } = useOutliersBlocked();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const base = overlay
    ? `absolute top-2 right-11 z-[1] inline-flex items-center justify-center w-8 h-8 rounded-lg bg-black/55 text-white backdrop-blur-sm hover:bg-black/75 transition-[opacity,background-color] [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${open ? "!opacity-100" : ""}`
    : "inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-2";
  const row = "w-full flex items-center gap-2.5 px-3 h-10 text-left text-[13.5px] rounded-lg hover:bg-surface-2 focus-visible:bg-surface-2 outline-none";
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`More for “${v.channel.title}”`} title="More" className={`${base} ${className}`}>
        <DotsIcon className="w-4 h-4" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={anchor} width={270} label="More">
        <div className="p-1.5">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openChannel(v.channelId, v.channel);
            }}
            className={row}
          >
            <ChannelAvatar src={v.channel.avatar} title={v.channel.title} size={22} />
            <span className="flex-1 truncate">Open {v.channel.title || "the channel"}</span>
          </button>
          <a href={youtubeVideo(v.id)} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)} className={row}>
            <ExternalIcon className="w-4 h-4 text-ink-faint" />
            <span className="flex-1">Watch on YouTube</span>
          </a>
          <div className="my-1 border-t border-line/10" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              hide(v.channelId, v.channel.title, v.channel.avatar);
            }}
            className={`${row} !h-auto py-2.5 items-start`}
          >
            <EyeOffIcon className="w-4 h-4 mt-0.5 text-red" />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-red truncate">Hide {v.channel.title || "this channel"}</span>
              <span className="block text-[11.5px] text-ink-faint leading-snug">Its videos never show in Outliers again. Bring it back in Outlier settings.</span>
            </span>
          </button>
        </div>
      </AnchoredMenu>
    </>
  );
}

export type MenuItem = { label: string; sub?: string; icon?: React.ReactNode; onClick: () => void; tone?: "amber" | "red" };

/**
 * A channel's ⋯ menu (1.29.0, Channels and Audience): its page here, on
 * YouTube, what the list adds (add to the niche, take it out), and hiding it.
 */
export function ChannelMenu({ c, items = [], className = "" }: { c: { id: string; title: string; avatar: string | null; handle?: string | null }; items?: MenuItem[]; className?: string }) {
  const { openChannel } = useOutliersNav();
  const { hide } = useOutliersBlocked();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const row = "w-full flex items-center gap-2.5 px-3 h-10 text-left text-[13.5px] rounded-lg hover:bg-surface-2 focus-visible:bg-surface-2 outline-none";
  const pick = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`More for ${c.title || "this channel"}`} title="More" className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-2 flex-shrink-0 ${className}`}>
        <DotsIcon className="w-4 h-4" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={anchor} width={280} label="More">
        <div className="p-1.5">
          <button type="button" role="menuitem" onClick={pick(() => openChannel(c.id, c))} className={row}>
            <ChannelAvatar src={c.avatar} title={c.title} size={22} />
            <span className="flex-1 truncate">Open {c.title || "the channel"}</span>
          </button>
          <a href={youtubeChannel(c.id, c.handle)} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)} className={row}>
            <ExternalIcon className="w-4 h-4 text-ink-faint" />
            <span className="flex-1">On YouTube</span>
          </a>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={pick(it.onClick)} className={`${row} ${it.sub ? "!h-auto py-2.5 items-start" : ""}`}>
              <span className={`w-4 h-4 flex-shrink-0 ${it.sub ? "mt-0.5" : ""} ${it.tone === "amber" ? "text-amber" : it.tone === "red" ? "text-red" : "text-ink-faint"}`}>{it.icon}</span>
              <span className="flex-1 min-w-0">
                <span className={`block truncate ${it.tone === "amber" ? "font-semibold text-amber" : it.tone === "red" ? "font-semibold text-red" : ""}`}>{it.label}</span>
                {it.sub && <span className="block text-[11.5px] text-ink-faint leading-snug">{it.sub}</span>}
              </span>
            </button>
          ))}
          <div className="my-1 border-t border-line/10" />
          <button type="button" role="menuitem" onClick={pick(() => hide(c.id, c.title, c.avatar))} className={`${row} !h-auto py-2.5 items-start`}>
            <EyeOffIcon className="w-4 h-4 mt-0.5 text-red" />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-red truncate">Hide {c.title || "this channel"}</span>
              <span className="block text-[11.5px] text-ink-faint leading-snug">Its videos never show in Outliers again. Bring it back in Outlier settings.</span>
            </span>
          </button>
        </div>
      </AnchoredMenu>
    </>
  );
}
