"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Switch } from "@/modules/short-videos/components/short-type";
import { AvatarImg } from "@/components/ui/avatar-img";
import type { CreatorInfo } from "./schedule-actions";

/*
 * The TikTok part of a short's Posting card (1.47.0: its own file). TikTok's Content Sharing Guidelines decide what's
 * on it and, where TikTok gives them, the words: who it posts to (the account's name and picture), the length limit, the
 * caption, who can see it (TikTok's own list for this account, no default), comments, duet and stitch (off until
 * ticked, greyed out where the account turned them off), the commercial content disclosure (off by default; Your
 * brand / Branded content with the label TikTok will show; nothing can be posted until one is ticked; branded content
 * can't be private), the declaration, and that TikTok takes a few minutes. tests/tiktok-review.test.ts holds it to that.
 */

const label = "block text-[11.5px] font-semibold text-ink-soft mb-1.5";

export const TIKTOK_PRIVACY: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};
// TikTok's own words for the post screen (Content Sharing Guidelines, 1.47.0).
export const TT_DISCLOSE_NEEDED = "You need to indicate if your content promotes yourself, a third party, or both.";
export const TT_BRANDED_NOT_PRIVATE = "Branded content visibility cannot be set to private.";
export const TT_PROCESSING = "It may take a few minutes for the video to process and be visible on your profile.";
/** Commercial content is on, but neither kind is ticked: TikTok says nothing may be posted until one is. */
export const ttDisclosureMissing = (v: { commercial: boolean; yourBrand: boolean; brandedContent: boolean }) => v.commercial && !v.yourBrand && !v.brandedContent;

export type TikTokState = {
  caption: string;
  privacy: string;
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercial: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
};

/** TikTok's declaration, worded as TikTok asks (Branded Content Policy only when branded content is ticked). */
export function TikTokDeclaration({ branded }: { branded: boolean }) {
  const link = "underline underline-offset-2 hover:text-ink";
  const music = (
    <a className={link} href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer">
      Music Usage Confirmation
    </a>
  );
  return (
    <p className="text-[11.5px] text-ink-soft">
      By posting, you agree to TikTok&rsquo;s{" "}
      {branded ? (
        <>
          <a className={link} href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener noreferrer">
            Branded Content Policy
          </a>{" "}
          and {music}
        </>
      ) : (
        music
      )}
      .
    </p>
  );
}

export function TikTokFields({
  v,
  set,
  creator,
  error,
  onRetry,
  tooLong,
  caption,
}: {
  v: TikTokState;
  set: (fn: (s: TikTokState) => TikTokState) => void;
  creator: CreatorInfo | null;
  error: string | null;
  /** Ask TikTok about the account again. */
  onRetry: () => void;
  tooLong: boolean;
  /** The caption: the shared one, or TikTok's own (1.34.3). */
  caption: React.ReactNode;
}) {
  // Branded content can't be private: ticking it while "Only me" is picked clears the choice (pick again, no default).
  const [clearedPrivate, setClearedPrivate] = useState(false);
  // TikTok can't take a post from this account now (or couldn't be reached): stop here, and ask again later.
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[12.5px] text-red" role="alert">
          {error}
        </p>
        <button type="button" onClick={onRetry} className="rounded-lg border border-line/20 px-3 h-8 text-[12.5px] font-semibold hover:border-line/40">
          Try again
        </button>
      </div>
    );
  }
  if (!creator) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading your TikTok account">
        <div className="skeleton h-9 w-48 rounded-lg" />
        <div className="skeleton h-20 w-full rounded-lg" />
      </div>
    );
  }
  const check = (key: "allowComments" | "allowDuet" | "allowStitch", text: string, disabled: boolean) => (
    <label className={`inline-flex items-center gap-1.5 text-[13px] ${disabled ? "opacity-50" : "cursor-pointer"}`} title={disabled ? "Turned off in this account's TikTok settings" : undefined}>
      <input type="checkbox" disabled={disabled} checked={!disabled && v[key]} onChange={(e) => set((s) => ({ ...s, [key]: e.target.checked }))} className="accent-[rgb(var(--amber))]" />
      {text}
    </label>
  );
  const brandedPrivate = v.commercial && v.brandedContent && v.privacy === "SELF_ONLY";
  const branded = v.commercial && v.brandedContent;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
        <AvatarImg src={creator.avatarUrl} className="w-6 h-6 rounded-full object-cover" />
        Posting to <b className="text-ink">{creator.nickname}</b>
      </div>
      {creator.maxDurationSec ? (
        <p className={`text-[12px] ${tooLong ? "text-red font-semibold" : "text-ink-soft"}`}>
          {tooLong ? `This account can post videos up to ${creator.maxDurationSec} seconds.` : `This account can post videos up to ${creator.maxDurationSec} seconds long.`}
        </p>
      ) : null}
      {caption}
      <div className="w-60">
        <span className={label}>Who can see this video</span>
        <Select
          value={v.privacy || null}
          onChange={(x) => {
            if (!x) return;
            setClearedPrivate(false);
            set((s) => ({ ...s, privacy: x }));
          }}
          options={creator.privacyOptions.map((o) => {
            const off = o === "SELF_ONLY" && branded;
            return { value: o, label: TIKTOK_PRIVACY[o] ?? o, disabled: off, ...(off ? { hint: TT_BRANDED_NOT_PRIVATE, title: TT_BRANDED_NOT_PRIVATE } : {}) };
          })}
          placeholder="Choose…"
          ariaLabel="Who can see this video"
        />
        {clearedPrivate && !v.privacy && <p className="mt-1.5 text-[12px] text-amber">{TT_BRANDED_NOT_PRIVATE} Choose who can see it.</p>}
      </div>
      <div>
        <span className={label}>Allow users to</span>
        <div className="flex flex-wrap gap-4">
          {check("allowComments", "Comment", creator.commentDisabled)}
          {check("allowDuet", "Duet", creator.duetDisabled)}
          {check("allowStitch", "Stitch", creator.stitchDisabled)}
        </div>
      </div>
      <div className="rounded-lg border border-line/10 p-3 space-y-2">
        <Switch
          checked={v.commercial}
          onChange={(on) => set((s) => ({ ...s, commercial: on, yourBrand: on ? s.yourBrand : false, brandedContent: on ? s.brandedContent : false }))}
          label="Disclose commercial content"
          hint="Turn on to disclose that this video promotes goods or services in exchange for something of value. Your video could promote yourself, a third party, or both."
        />
        {v.commercial && (
          <div className="pl-[52px] space-y-1.5">
            <label className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={v.yourBrand} onChange={(e) => set((s) => ({ ...s, yourBrand: e.target.checked }))} className="mt-0.5 accent-[rgb(var(--amber))]" />
              <span>
                Your brand
                <span className="block text-[11.5px] text-ink-soft">You are promoting yourself or your own business.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input
                type="checkbox"
                checked={v.brandedContent}
                onChange={(e) => {
                  const on = e.target.checked;
                  // Branded content can't be private: "Only me" goes, and they choose again.
                  if (on && v.privacy === "SELF_ONLY") setClearedPrivate(true);
                  set((s) => ({ ...s, brandedContent: on, privacy: on && s.privacy === "SELF_ONLY" ? "" : s.privacy }));
                }}
                className="mt-0.5 accent-[rgb(var(--amber))]"
              />
              <span>
                Branded content
                <span className="block text-[11.5px] text-ink-soft">You are promoting another brand or a third party.</span>
              </span>
            </label>
            {/* TikTok's label for the post, or what's still needed. */}
            <p className={`text-[12px] ${v.yourBrand || v.brandedContent ? "text-ink" : "text-amber font-semibold"}`} aria-live="polite">
              {v.brandedContent
                ? "Your video will be labeled as “Paid partnership”."
                : v.yourBrand
                  ? "Your video will be labeled as “Promotional content”."
                  : TT_DISCLOSE_NEEDED}
            </p>
            {brandedPrivate && <p className="text-[12px] text-red">{TT_BRANDED_NOT_PRIVATE} Pick another option.</p>}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <TikTokDeclaration branded={branded} />
        <p className="text-[11.5px] text-ink-soft">{TT_PROCESSING}</p>
      </div>
    </div>
  );
}
