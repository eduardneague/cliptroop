"use client";

import { useId, useRef } from "react";
import { EyeIcon, PhotoIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { ColorPicker } from "@/components/ui/color-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { audienceFromRead, kitTotals, manualFromRead, totalsFromRead } from "../lib/manual";
import { growthPct, ratePct, type KitAudience, type KitPlatformNumbers, type MediaKitNumbers } from "../lib/numbers";
import { big, dayRange, pct, shortDay, signedPct } from "../lib/scene";
import { builtOn, usualTitle } from "../lib/layout";
import {
  KIT_PERIODS,
  KIT_PLATFORMS,
  KIT_PLATFORM_NAME,
  LIMITS,
  emptyManualAudience,
  emptyManualPlatform,
  emptyTotals,
  isEmail,
  isWebsite,
  type KitPlatform,
  type KitSection,
  type ManualAudience,
  type ManualPlatform,
  type ManualTotals,
  type KitTitle,
  type MediaKitSettings,
  type RatePackage,
  type TitlePage,
} from "../lib/settings";
import { ClipLogo } from "@/components/ui/clip-logo";
import { APP_NAME } from "@/lib/brand";
import { BrandsEditor, CURRENCY_OPTIONS, RatesEditor, TextArea, TextField, TitleField, Toggle, type BrandLogos } from "./kit-fields";
import { AutoManual, ManualAudienceFields, ManualPlatformFields, ManualTotalsFields } from "./kit-manual";
import { CoverGridPicker, VideoPicksField } from "./kit-video-picker";
import { pageAnchorFor } from "./use-kit-sync";

/*
 * The media kit's form (1.39.0), in the order of the kit's pages: each part says which page it makes, has that page's
 * switch, lights up while you're at it (its page lights up in the preview beside it), and shows its own numbers as
 * read (Auto) or as you type them (Manual). On a phone, "See this page" shows it in the preview.
 */

export type KitForm = {
  s: MediaKitSettings;
  set: (patch: Partial<MediaKitSettings>) => void;
  /** A change made from the setup as it is at that moment (several fields at once). */
  update: (fn: (s: MediaKitSettings) => Partial<MediaKitSettings>) => void;
  teamId: string;
  teamName: string;
  teamColor: string;
  latest: string;
  /** The numbers as read (null until they come). */
  read: MediaKitNumbers | null;
  loading: boolean;
  /** The platforms that can be in the kit (with numbers, or added by hand) and the ones that are. */
  available: KitPlatform[];
  chosen: KitPlatform[];
  /** The kit's platforms as its pages draw them (typed-in numbers laid over), in order. */
  kit: KitPlatformNumbers[];
  /** The pages the kit has now, by anchor. */
  pages: Set<string>;
  /** The part being edited. */
  active: string | null;
  /** On a phone: show a part's page in the preview. Side by side: null. */
  see: ((anchor: string) => void) | null;
  photo: { url: string | null; uploading: boolean; add: (file: File | undefined) => void; remove: () => void };
  /** The wall the cover gets on Auto. */
  autoGrid: "shorts" | "longs" | "mixed";
  /** 1.44.0: the brands' logos (their links, the ones going up, adding more). */
  logos: BrandLogos;
  /** 1.44.0: the cover's title as the kit's name breaks on it (the cover's own title starts from it). */
  coverLines: string[];
};

/** 1.44.0: a page's own title, switched on or off, typed (kept while it's off). */
function PageTitle({ f, page, label }: { f: KitForm; page: TitlePage; label?: string }) {
  return <TitleField value={f.s.titles[page]} usual={usualTitle(page, f.s)} label={label} onChange={(t: KitTitle) => f.update((s) => ({ titles: { ...s.titles, [page]: t } }))} />;
}

// ---- A part --------------------------------------------------------------------------------------------------------

function owns(anchor: string, active: string | null, group?: string) {
  if (!active) return false;
  return active === anchor || (!!group && active.startsWith(`${group}:`));
}

/** One part of the form: its title, what it's for, its page's switch, then its fields (when the page is in the kit). */
export function Part({ f, anchor, group, title, hint, page, children }: { f: KitForm; anchor: string; group?: string; title: string; hint?: string; page?: KitSection; children?: React.ReactNode }) {
  const id = useId();
  const on = page ? f.s.sections[page] : true;
  const lit = owns(anchor, f.active, group);
  return (
    <section
      data-kit-anchor={anchor}
      aria-labelledby={id}
      className={`rounded-2xl border bg-surface p-4 sm:p-5 transition-[border-color,box-shadow] duration-300 ${lit ? "border-amber/55 shadow-[0_0_0_3px_rgb(var(--amber)/0.12)]" : "border-line/10"}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 id={id} data-part-title tabIndex={-1} className="text-[15px] font-bold outline-none">
            {title}
          </h2>
          {hint && <p className="text-[12.5px] text-ink-soft mt-0.5">{hint}</p>}
        </div>
        {page && <PageSwitch title={title} on={on} onChange={(v) => f.update((s) => ({ sections: { ...s.sections, [page]: v } }))} />}
      </div>
      {on && children && <div className="space-y-4 mt-4">{children}</div>}
      {on && !group && <SeePage f={f} anchor={anchor} />}
    </section>
  );
}

/** A page in or out of the kit. */
function PageSwitch({ title, on, onChange }: { title: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${title} in the kit`}
      onClick={() => onChange(!on)}
      className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg pl-2 pr-1.5 h-8 -mr-1.5 -mt-1 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2/70 transition-colors"
    >
      <span>{on ? "In the kit" : "Left out"}</span>
      <span className={`relative w-8 h-[18px] rounded-[6px] flex-shrink-0 transition-colors ${on ? "bg-amber" : "bg-line/20"}`}>
        <span className={`absolute top-[3px] w-3 h-3 rounded-[4px] bg-white transition-all ${on ? "left-[17px]" : "left-[3px]"}`} />
      </span>
    </button>
  );
}

/** On a phone: this part's page, in the preview. */
function SeePage({ f, anchor }: { f: KitForm; anchor: string }) {
  if (!f.see || anchor === "kit" || anchor === "look" || !f.pages.has(pageAnchorFor(anchor))) return null;
  return (
    <div className="mt-3 flex justify-end">
      <button type="button" onClick={() => f.see?.(anchor)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
        <EyeIcon className="w-4 h-4" />
        See this page
      </button>
    </div>
  );
}

/** A platform's block inside a part (its own anchor: its own page). */
function Block({ f, anchor, platform, aside, children }: { f: KitForm; anchor: string; platform: KitPlatform; aside?: React.ReactNode; children: React.ReactNode }) {
  const lit = f.active === anchor;
  return (
    <div data-kit-anchor={anchor} className={`rounded-xl border p-3 sm:p-3.5 transition-colors duration-300 ${lit ? "border-amber/45 bg-amber/[0.05]" : "border-line/12 bg-surface-2/30"}`}>
      <div className="flex items-center gap-2.5 min-h-8">
        <PlatformIcon platform={platform} className="w-5 h-5 flex-shrink-0" />
        <h3 data-part-title tabIndex={-1} className="text-[13.5px] font-bold flex-1 min-w-0 truncate outline-none">
          {KIT_PLATFORM_NAME[platform]}
        </h3>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
      <SeePage f={f} anchor={anchor} />
    </div>
  );
}

// ---- Your kit --------------------------------------------------------------------------------------------------------

export function KitPart({ f }: { f: KitForm }) {
  const { s, set, update, read, available, chosen } = f;
  const readPs = read?.platforms ?? [];
  const isRead = (p: KitPlatform) => readPs.some((x) => x.platform === p);
  const togglePlatform = (p: KitPlatform) => {
    const on = chosen.includes(p);
    if (on && chosen.length === 1) return;
    const next = on ? chosen.filter((x) => x !== p) : [...chosen, p];
    set({ platforms: next.length === available.length ? [] : next });
  };
  const addByHand = (p: KitPlatform) =>
    update((s) => ({
      extra: [...s.extra.filter((x) => x !== p), p],
      platforms: s.platforms.length ? [...s.platforms.filter((x) => x !== p), p] : s.platforms,
      manual: { ...s.manual, platforms: { ...s.manual.platforms, [p]: { ...(s.manual.platforms[p] ?? emptyManualPlatform()), on: true } } },
    }));
  const addable = KIT_PLATFORMS.filter((p) => !isRead(p) && !s.extra.includes(p));
  return (
    <Part f={f} anchor="kit" title="Your kit" hint="Its name, the channels in it, and the days the numbers cover.">
      <TextField label="Kit name" value={s.title} onChange={(v) => set({ title: v })} max={LIMITS.title} placeholder={f.teamName} hint="On the cover and at the foot of every page. Leave it empty to use the team's name." />
      <div>
        <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Channels</p>
        {f.loading && !read ? (
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton h-10 w-32 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((p) => {
              const on = chosen.includes(p);
              const r = readPs.find((x) => x.platform === p);
              return (
                <button
                  key={p}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => togglePlatform(p)}
                  title={on && chosen.length === 1 ? "A kit needs at least one channel" : undefined}
                  className={`inline-flex items-center gap-2 rounded-xl border pl-2 pr-3 h-10 text-[13px] font-semibold transition-colors ${on ? "border-amber/60 bg-amber/[0.08] text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
                >
                  <PlatformIcon platform={p} className={`w-5 h-5 ${on ? "" : "opacity-50 grayscale"}`} />
                  <span>{KIT_PLATFORM_NAME[p]}</span>
                  {r?.handle ? <span className="text-[12px] font-normal text-ink-faint max-w-[9rem] truncate">{r.handle}</span> : !r ? <span className="text-[12px] font-normal text-ink-faint">by hand</span> : null}
                </button>
              );
            })}
            {addable.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => addByHand(p)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line/25 pl-2 pr-3 h-10 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/45"
                aria-label={`Add ${KIT_PLATFORM_NAME[p]} by hand`}
              >
                <PlusIcon className="w-4 h-4" />
                <PlatformIcon platform={p} className="w-4 h-4 opacity-60 grayscale" />
                {KIT_PLATFORM_NAME[p]}
              </button>
            ))}
          </div>
        )}
        <p className="text-[12px] text-ink-faint mt-1.5">
          {!readPs.length && !f.loading
            ? "No channel has numbers yet: connect one in Team → Connected accounts, or add one here and type its numbers in."
            : addable.length
              ? "A channel that isn't connected can be added by hand: you type its numbers in."
              : null}
        </p>
      </div>
      {chosen.length > 1 && (
        <div>
          <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Kits</p>
          <Segmented
            ariaLabel="One kit or one per platform"
            value={s.split}
            onChange={(v) => set({ split: v })}
            options={[
              { value: "together", label: "One kit, all together" },
              { value: "each", label: `One per platform (${chosen.length})` },
            ]}
          />
        </div>
      )}
      <div>
        <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Numbers from</p>
        <Segmented ariaLabel="The days the numbers cover" value={s.period} onChange={(v) => set({ period: v, ...(v === "custom" && (!s.from || !s.to) ? { from: null, to: f.latest } : {}) })} options={KIT_PERIODS.map((p) => ({ value: p.id, label: p.label }))} />
        {s.period === "custom" && (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap text-[13px]">
            <DatePicker value={s.from} onChange={(d) => set({ from: d, ...(s.to && d > s.to ? { to: d } : {}) })} ariaLabel="First day" triggerClassName={`${dateChip} ${s.from ? "" : "text-ink-faint"}`}>
              {s.from ? shortDay(s.from, true) : "First day"}
            </DatePicker>
            <span className="text-ink-faint">to</span>
            <DatePicker value={s.to} onChange={(d) => set({ to: d > f.latest ? f.latest : d, ...(s.from && d < s.from ? { from: d } : {}) })} ariaLabel="Last day" triggerClassName={dateChip}>
              {s.to ? shortDay(s.to, true) : "Last day"}
            </DatePicker>
          </div>
        )}
        {read && (
          <p className="text-[12px] text-ink-faint mt-1.5">
            {dayRange(read.window.from, read.window.to)}. The platforms share each day&rsquo;s numbers the morning after.
          </p>
        )}
      </div>
    </Part>
  );
}

const dateChip = "inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-9 font-semibold hover:bg-surface-2";

// ---- Look ------------------------------------------------------------------------------------------------------------

export function LookPart({ f }: { f: KitForm }) {
  const { s, set } = f;
  return (
    <Part f={f} anchor="look" title="Look" hint="Your colour runs through every page; the ink is a deep shade of it.">
      <div className="flex items-center gap-4 flex-wrap">
        <Segmented ariaLabel="Light or dark pages" value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={!s.accent}
            onClick={() => set({ accent: "" })}
            className={`inline-flex items-center gap-2 rounded-lg border px-2.5 h-9 text-[12.5px] font-semibold ${!s.accent ? "border-amber/60 bg-amber/[0.08]" : "border-line/15 text-ink-soft hover:text-ink"}`}
          >
            <span className="w-4 h-4 rounded-[5px] border border-line/15" style={{ background: f.teamColor }} />
            Team colour
          </button>
          <span className="text-[12.5px] text-ink-faint">or</span>
          <ColorPicker value={s.accent || f.teamColor} onChange={(hex) => set({ accent: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : "" })} />
        </div>
      </div>
    </Part>
  );
}

// ---- Cover -----------------------------------------------------------------------------------------------------------

export function CoverPart({ f }: { f: KitForm }) {
  const { s, set } = f;
  const fileRef = useRef<HTMLInputElement>(null);
  const picks = s.coverPicks;
  const few = picks.on && picks.list.length > 0 && picks.list.length <= 3;
  return (
    <Part f={f} anchor="cover" page="cover" title="Cover" hint="Your name, one line about you, and beside them your videos, a photo, or one big number.">
      <TitleField
        label="Title"
        lines
        value={s.titles.cover}
        usual={f.coverLines.join(" ")}
        start={f.coverLines.join("\n")}
        onChange={(t) => f.update((cur) => ({ titles: { ...cur.titles, cover: t } }))}
      />
      <TextField label="One line about the channel" value={s.tagline} onChange={(v) => set({ tagline: v })} max={LIMITS.tagline} placeholder="Slow travel, long roads and the people we meet on the way." hint="Under the name." />
      <div>
        <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Beside your name</p>
        <Segmented
          ariaLabel="The cover's picture"
          value={s.cover}
          onChange={(v) => set({ cover: v })}
          options={[
            { value: "videos", label: "Your videos" },
            { value: "photo", label: "A photo" },
            { value: "plain", label: "One big number" },
          ]}
        />
      </div>
      {s.cover === "videos" && (
        <>
          <div>
            <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Which videos</p>
            <VideoPicksField
              ariaLabel="Which videos on the cover"
              picks={picks}
              onChange={(coverPicks) => set({ coverPicks })}
              max={LIMITS.coverPicks}
              teamId={f.teamId}
              title="Pick the cover's videos"
              bestLabel="Your most viewed"
              emptyHint={`Up to ${LIMITS.coverPicks}, Shorts and long videos alike. Until you pick some, the cover shows your most viewed.`}
              columns={4}
            />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">The wall</p>
            {few ? (
              <p className="text-[12.5px] text-ink-soft">{picks.list.length === 1 ? "One video shows big, on its own." : `${picks.list.length === 2 ? "Two" : "Three"} videos show big, together. Pick four or more for a wall.`}</p>
            ) : (
              <>
                <CoverGridPicker value={s.coverGrid} onChange={(coverGrid) => set({ coverGrid })} auto={f.autoGrid} />
                <p className="text-[12px] text-ink-faint mt-1.5">
                  {s.coverGrid === "mixed" || (s.coverGrid === "auto" && f.autoGrid === "mixed") ? "Tall and wide take turns, so Shorts and long videos sit together." : s.coverGrid === "longs" || (s.coverGrid === "auto" && f.autoGrid === "longs") ? "Two columns of wide thumbnails." : "Three columns of tall thumbnails."}
                </p>
              </>
            )}
          </div>
        </>
      )}
      {s.cover === "photo" && (
        <div className="flex items-center gap-3">
          {f.photo.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.photo.url} alt="The cover photo" className="w-16 h-20 rounded-lg object-cover border border-line/10" />
          ) : (
            <span className="w-16 h-20 rounded-lg bg-surface-2 flex items-center justify-center text-ink-faint">
              <PhotoIcon className="w-6 h-6" />
            </span>
          )}
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={f.photo.uploading} className="rounded-lg border border-line/15 px-3 h-9 text-[13px] font-semibold hover:bg-surface-2 disabled:opacity-60">
                {f.photo.uploading ? "Adding…" : f.photo.url ? "Change the photo" : "Add a photo"}
              </button>
              {f.photo.url && (
                <button type="button" onClick={f.photo.remove} aria-label="Remove the photo" className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-ink-soft hover:text-coral hover:bg-surface-2">
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[12px] text-ink-faint">{f.photo.url ? "Shown tall, beside your name." : "A photo of you or your team, up to 5 MB. Until there's one, the cover shows your videos."}</p>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => (f.photo.add(e.target.files?.[0]), (e.target.value = ""))} />
        </div>
      )}
      {s.cover === "plain" && <p className="text-[12.5px] text-ink-soft">Your views over the period, big, on your colour.</p>}
    </Part>
  );
}

// ---- About us --------------------------------------------------------------------------------------------------------

export function AboutPart({ f }: { f: KitForm }) {
  const { s, set } = f;
  return (
    <Part f={f} anchor="about" page="about" title="About us" hint="Your own words, set big, beside your photo or a few of your videos.">
      <PageTitle f={f} page="about" />
      <TextArea label="About us" value={s.about} onChange={(v) => set({ about: v })} max={LIMITS.about} placeholder="What you make, for whom, how often, and since when." hint={s.about ? undefined : "The page shows once there's something here."} rows={4} />
    </Part>
  );
}

// ---- At a glance -------------------------------------------------------------------------------------------------------

/** The numbers read, in a line (what Auto puts on the page). */
function readLine(p: Pick<KitPlatformNumbers, "followers" | "followersNet" | "views" | "engagement" | "posted">): string {
  const parts: string[] = [];
  if (p.followers !== null) {
    const g = growthPct(p.followers, p.followersNet);
    parts.push(`${big(p.followers)} followers${g !== null ? ` (${signedPct(g)})` : ""}`);
  }
  if (p.views !== null) parts.push(`${big(p.views)} views`);
  const er = ratePct(p.engagement, p.views);
  if (er !== null) parts.push(`${pct(er)} engagement`);
  if (p.posted) parts.push(`${p.posted} ${p.posted === 1 ? "video" : "videos"} posted`);
  return parts.join(", ");
}

export function GlancePart({ f }: { f: KitForm }) {
  const { s, update } = f;
  const m = s.manual.glance;
  const auto = kitTotals(f.kit);
  const setM = (next: ManualTotals) => update((s) => ({ manual: { ...s.manual, glance: next } }));
  const switchTo = (manual: boolean) =>
    update((s) => {
      const cur = s.manual.glance;
      const blank = [cur.followers, cur.growth, cur.views, cur.viewsChange, cur.engagementRate, cur.avgViews, cur.posted].every((v) => v === null);
      const glance = manual && blank ? { ...emptyTotals(), ...totalsFromRead(kitTotals(f.kit)), on: true } : { ...cur, on: manual };
      return { manual: { ...s.manual, glance } };
    });
  const line = [auto.followers !== null ? `${big(auto.followers)} followers` : null, auto.views !== null ? `${big(auto.views)} views` : null, auto.engagementRate !== null ? `${pct(auto.engagementRate)} engagement` : null, auto.avgViews !== null ? `${big(auto.avgViews)} average views` : null].filter(Boolean).join(", ");
  return (
    <Part f={f} anchor="glance" page="glance" title="At a glance" hint="Every platform added up, with the views per day.">
      <PageTitle f={f} page="glance" />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <AutoManual label="At a glance's numbers" manual={m.on} onChange={switchTo} autoLabel="Added up" />
      </div>
      {m.on ? (
        <>
          <ManualTotalsFields m={m} onChange={setM} />
          <p className="text-[12px] text-ink-faint">The cover and the last page show these too. An empty box is left off the page.</p>
        </>
      ) : (
        <p className="text-[12.5px] text-ink-soft">{line || "Nothing to add up yet."}</p>
      )}
    </Part>
  );
}

// ---- A page per platform -----------------------------------------------------------------------------------------------

export function PlatformsPart({ f }: { f: KitForm }) {
  const { s, update, read } = f;
  const readOf = (p: KitPlatform) => read?.platforms.find((x) => x.platform === p) ?? null;
  const setM = (p: KitPlatform, next: ManualPlatform) => update((s) => ({ manual: { ...s.manual, platforms: { ...s.manual.platforms, [p]: next } } }));
  const switchTo = (p: KitPlatform, manual: boolean) =>
    update((s) => {
      const cur = s.manual.platforms[p];
      const r = readOf(p);
      const blank = !cur || (!cur.handle && !cur.chartPoints.length && [cur.followers, cur.growth, cur.views, cur.viewsChange, cur.engagementRate, cur.avgViews, cur.avgViewsLong, cur.avgViewsShort, cur.posted, cur.watchHours].every((v) => v === null));
      const next: ManualPlatform = manual && blank && r ? { ...emptyManualPlatform(), ...manualFromRead(r), on: true } : { ...(cur ?? emptyManualPlatform()), on: manual };
      return { manual: { ...s.manual, platforms: { ...s.manual.platforms, [p]: next } } };
    });
  const removeByHand = (p: KitPlatform) => update((s) => ({ extra: s.extra.filter((x) => x !== p), platforms: s.platforms.filter((x) => x !== p) }));
  const first = f.chosen[0];
  return (
    <Part f={f} anchor={first ? `platform:${first}` : "platforms"} group="platform" page="platforms" title="A page per platform" hint="Followers, views, engagement and the most viewed videos, for each platform.">
      {f.chosen.length ? (
        f.chosen.map((p) => {
          const r = readOf(p);
          const m = s.manual.platforms[p] ?? emptyManualPlatform();
          const byHand = !r;
          return (
            <Block
              key={p}
              f={f}
              anchor={`platform:${p}`}
              platform={p}
              aside={
                byHand ? (
                  <button type="button" onClick={() => removeByHand(p)} className="inline-flex items-center gap-1.5 rounded-lg px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-coral hover:bg-surface-2">
                    <TrashIcon className="w-3.5 h-3.5" />
                    Take it out
                  </button>
                ) : (
                  <AutoManual label={`${KIT_PLATFORM_NAME[p]}'s numbers`} manual={m.on} onChange={(v) => switchTo(p, v)} />
                )
              }
            >
              <div className="mb-2.5">
                <PageTitle f={f} page={`platform:${p}`} />
              </div>
              {byHand || m.on ? (
                <>
                  {byHand && <p className="text-[12px] text-ink-faint mb-3">Not connected: the page shows what you type here. An empty box is left off.</p>}
                  <ManualPlatformFields platform={p} m={m} onChange={(next) => setM(p, next)} hasDaily={!!r?.daily.some((v) => v !== null)} />
                </>
              ) : (
                <p className="text-[12.5px] text-ink-soft">{r && readLine(r) ? `${readLine(r)}.` : "No numbers read for these days yet."}</p>
              )}
            </Block>
          );
        })
      ) : (
        <p className="text-[12.5px] text-ink-soft">Add a channel above and its page shows here.</p>
      )}
    </Part>
  );
}

// ---- Audience ----------------------------------------------------------------------------------------------------------

function audienceLine(a: KitAudience | null): string | null {
  if (!a) return null;
  const top = <T extends { share: number }>(xs: T[]) => xs.reduce<T | null>((b, x) => (!b || x.share > b.share ? x : b), null);
  const g = top(a.genders);
  const age = top(a.ages);
  const c = a.countries.find((x) => x.code);
  return [g ? `${pct(g.share)} ${g.label.toLowerCase()}` : null, age ? `most aged ${age.label}` : null, c ? `most in ${c.label}` : null].filter(Boolean).join(", ") || null;
}

export function AudiencePart({ f }: { f: KitForm }) {
  const { s, set, update, read } = f;
  const readOf = (p: KitPlatform) => read?.platforms.find((x) => x.platform === p) ?? null;
  const setM = (p: KitPlatform, next: ManualAudience) => update((s) => ({ manual: { ...s.manual, audience: { ...s.manual.audience, [p]: next } } }));
  const switchTo = (p: KitPlatform, manual: boolean) =>
    update((s) => {
      const cur = s.manual.audience[p];
      const blank = !cur || ([cur.women, cur.men, cur.other, ...Object.values(cur.ages)].every((v) => v === null) && !cur.countries.length);
      const next: ManualAudience = manual && blank ? { ...emptyManualAudience(), ...audienceFromRead(readOf(p)?.audience ?? null), on: true } : { ...(cur ?? emptyManualAudience()), on: manual };
      return { manual: { ...s.manual, audience: { ...s.manual.audience, [p]: next } } };
    });
  // The kit draws who watches for its first four platforms.
  const ps = f.chosen.slice(0, 4);
  const first = ps[0];
  return (
    <Part f={f} anchor={first ? `audience:${first}` : "audience"} group="audience" page="audience" title="Audience" hint="Who watches: women and men, ages, and where they are, a page for each platform.">
      <TextArea label="Who watches, in your words" value={s.audienceNote} onChange={(v) => set({ audienceNote: v })} max={LIMITS.audienceNote} placeholder="Curious travellers in their late twenties and thirties who buy good gear once." hint="Over the audience pages." rows={2} />
      {ps.map((p) => {
        const r = readOf(p);
        const m = s.manual.audience[p] ?? emptyManualAudience();
        const line = audienceLine(r?.audience ?? null);
        return (
          <Block key={p} f={f} anchor={`audience:${p}`} platform={p} aside={<AutoManual label={`Who watches on ${KIT_PLATFORM_NAME[p]}`} manual={m.on} onChange={(v) => switchTo(p, v)} />}>
            <div className="mb-2.5">
              <PageTitle f={f} page={`audience:${p}`} />
            </div>
            {m.on ? (
              <ManualAudienceFields m={m} onChange={(next) => setM(p, next)} />
            ) : line ? (
              <p className="text-[12.5px] text-ink-soft">{`${line}.`}</p>
            ) : (
              <p className="text-[12.5px] text-ink-soft">{r ? `${KIT_PLATFORM_NAME[p]} hasn't shared who watches yet (it does once there are enough viewers), so there's no page for it. Switch to Manual to type it in.` : "Not connected. Switch to Manual to type who watches."}</p>
            )}
          </Block>
        );
      })}
    </Part>
  );
}

// ---- Best videos -------------------------------------------------------------------------------------------------------

export function VideosPart({ f }: { f: KitForm }) {
  const { s, set } = f;
  return (
    <Part f={f} anchor="videos" page="videos" title={s.videoPicks.on && s.videoPicks.list.length ? "Videos we're proud of" : "Best videos"} hint="The most viewed of the period, or the ones you pick.">
      <PageTitle f={f} page="videos" />
      <VideoPicksField
        ariaLabel="Which videos to feature"
        picks={s.videoPicks}
        onChange={(videoPicks) => set({ videoPicks })}
        max={LIMITS.videoPicks}
        teamId={f.teamId}
        title="Pick the videos to feature"
        bestLabel="Most viewed"
        emptyHint={`Up to ${LIMITS.videoPicks}, in the order you want them. Until you pick some, the page shows your most viewed.`}
      />
      {!s.videoPicks.on && (
        <div>
          <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">How many</p>
          <Segmented ariaLabel="How many best videos" value={String(s.videos) as "3" | "6"} onChange={(v) => set({ videos: v === "3" ? 3 : 6 })} options={[{ value: "3", label: "3 videos" }, { value: "6", label: "6 videos" }]} />
        </div>
      )}
    </Part>
  );
}

// ---- Brands, rates, contact ------------------------------------------------------------------------------------------

/**
 * 1.44.0: the brands, as quotes (each brand with a quote: its logo, its name and what they said, centred, up to six a
 * page) or as a wall of their logos (no names: the owner's "brand logos only").
 */
export function PartnersPart({ f }: { f: KitForm }) {
  const { s, set } = f;
  const quoted = s.brands.filter((b) => b.quote.trim()).length;
  return (
    <Part f={f} anchor="partners" page="partners" title="Brands and kind words" hint="Who you've worked with, and what they said. The page shows when there's something on it.">
      <PageTitle f={f} page="partners" />
      <div>
        <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Show</p>
        <Segmented
          ariaLabel="How the brands page shows them"
          value={s.brandsShow}
          onChange={(brandsShow) => set({ brandsShow })}
          options={[
            { value: "quotes", label: "Quotes" },
            { value: "logos", label: "Brand logos only" },
          ]}
        />
        <p className="text-[12px] text-ink-faint mt-1.5">
          {s.brandsShow === "quotes"
            ? `Each brand with a quote: its logo, its name and what they said, centred, up to six a page${quoted ? ` (${quoted} ${quoted === 1 ? "quote" : "quotes"} now)` : ""}.`
            : "Every brand's logo on a wall, no names (a brand without a logo shows its name). Up to 48."}
        </p>
      </div>
      <BrandsEditor brands={s.brands} show={s.brandsShow} onChange={(brands) => set({ brands })} logos={f.logos} />
    </Part>
  );
}

export function RatesPart({ f }: { f: KitForm }) {
  const { s, set } = f;
  // 1.41.0: one kit per platform: each package says which kit it's in (packagesFor in layout.ts decides the same).
  const each = s.split === "each" && f.chosen.length > 1;
  const where = (p: RatePackage) => {
    if (!each) return null;
    if (p.platform === "any") return "In every kit (any platform).";
    if (f.chosen.includes(p.platform)) return `In the ${KIT_PLATFORM_NAME[p.platform]} kit.`;
    return `In every kit: ${KIT_PLATFORM_NAME[p.platform]} has no kit of its own.`;
  };
  return (
    <Part f={f} anchor="rates" page="rates" title="Rates" hint="Show your prices, or say they're on request. Packages say what a sponsor can buy either way.">
      <PageTitle f={f} page="rates" />
      <div className="flex items-center gap-3 flex-wrap">
        <Segmented ariaLabel="Prices or on request" value={s.rates.show ? "show" : "request"} onChange={(v) => set({ rates: { ...s.rates, show: v === "show" } })} options={[{ value: "show", label: "Show prices" }, { value: "request", label: "On request" }]} />
        {s.rates.show && (
          <div className="w-28">
            <Select value={s.rates.currency} onChange={(v) => v && set({ rates: { ...s.rates, currency: v } })} options={CURRENCY_OPTIONS} ariaLabel="Currency" />
          </div>
        )}
      </div>
      <RatesEditor rates={s.rates} onChange={(rates) => set({ rates })} where={where} />
      <TextArea label={s.rates.show ? "A note under the prices" : "A line under “Rates on request”"} value={s.rates.note} onChange={(v) => set({ rates: { ...s.rates, note: v } })} max={LIMITS.rateNote} placeholder={s.rates.show ? "Prices exclude VAT. Every package includes a link in the description." : "Tell us about your campaign and we’ll send a quote that fits it."} rows={2} />
    </Part>
  );
}

export function ContactPart({ f }: { f: KitForm }) {
  const { s, set } = f;
  const emailProblem = s.contact.email && !isEmail(s.contact.email) ? "That doesn't look like an email address. It's left out of the kit until it does." : null;
  const siteProblem = s.contact.website && !isWebsite(s.contact.website) ? "That doesn't look like a website. It's left out of the kit until it does." : null;
  return (
    <Part f={f} anchor="contact" page="contact" title="Contact" hint="The last page; the email and website are links in the PDF.">
      <TextField label="Closing line" value={s.contact.cta} onChange={(v) => set({ contact: { ...s.contact, cta: v } })} max={LIMITS.cta} placeholder="Let’s make something together." />
      <div className="grid sm:grid-cols-2 gap-3">
        <TextField label="Name" value={s.contact.name} onChange={(v) => set({ contact: { ...s.contact, name: v } })} max={LIMITS.name} placeholder="Who sponsors write to" />
        <TextField label="Email" type="email" inputMode="email" value={s.contact.email} onChange={(v) => set({ contact: { ...s.contact, email: v } })} max={LIMITS.email} placeholder="partners@yourchannel.com" problem={emailProblem} />
        <TextField label="Phone" type="tel" inputMode="tel" value={s.contact.phone} onChange={(v) => set({ contact: { ...s.contact, phone: v } })} max={LIMITS.phone} placeholder="+40 712 345 678" />
        <TextField label="Website" inputMode="url" value={s.contact.website} onChange={(v) => set({ contact: { ...s.contact, website: v } })} max={LIMITS.website} placeholder="yourchannel.com" problem={siteProblem} />
      </div>
      {/* 1.44.0: the owner's "turn the watermark into the cliptroop logo and says built with cliptroop on "date", but also a toggle to turn it off". */}
      <div className="flex items-center gap-3 rounded-xl border border-line/12 bg-surface-2/40 pl-3 pr-2.5 py-2.5">
        <ClipLogo size={26} id="kit-built-with" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold">Built with {APP_NAME}</p>
          <p className="text-[12px] text-ink-faint">{s.builtWith ? `${APP_NAME}'s logo and “Built with ${APP_NAME} on ${f.read ? builtOn(f.read) : "the day it's made"}” at the foot of this page.` : "Off: nothing at the foot of this page."}</p>
        </div>
        <Toggle on={s.builtWith} onChange={(builtWith) => set({ builtWith })} label={`Built with ${APP_NAME} on the last page`} />
      </div>
    </Part>
  );
}
