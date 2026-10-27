"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DownloadIcon, LockIcon, PhotoIcon, TrashIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { ColorPicker } from "@/components/ui/color-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast-provider";
import { createClient } from "@/lib/supabase/client";
import { compressImage, isPictureType, safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { pictureTooBig } from "@/lib/image/limits";
import { downloadBytes } from "@/lib/pdf-kit";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { loadMediaKitNumbers, mediaKitCoverLink, saveMediaKit } from "@/app/(dashboard)/analytics/media-kit-actions";
import { buildKits, type Kit } from "../lib/layout";
import { loadKitMeasure } from "../lib/fonts";
import { renderKitPdf } from "../lib/render-pdf";
import { dayRange, shortDay } from "../lib/scene";
import type { Measure } from "../lib/scene";
import type { MediaKitNumbers } from "../lib/numbers";
import { KIT_PERIODS, KIT_PLATFORM_NAME, KIT_SECTIONS, KIT_SECTION_LABEL, LIMITS, isEmail, isWebsite, readKitSettings, type KitPlatform, type KitSection, type MediaKitSettings } from "../lib/settings";
import { CURRENCY_OPTIONS, PartnersEditor, QuotesEditor, RatesEditor, Section, TextArea, TextField, Toggle } from "./kit-fields";
import { KitPageSvg, KIT_FONT_CSS } from "./kit-page-svg";

/*
 * Analytics → Media kit (1.37.0): what a sponsor asks for, made from the team's own numbers. Set it up on the left
 * (the channels, the period, the pages, the look, your words, rates or "on request", brands, contact), see every page
 * on the right exactly as the PDF will be, download one kit or one per platform. Masters' changes are saved for the
 * next time; anyone else who may make a kit (revenue access) uses them for their own download.
 */

export type MediaKitTabData =
  | { allowed: false }
  | {
      allowed: true;
      teamId: string;
      teamName: string;
      teamColor: string;
      logoUrl: string | null;
      canSave: boolean;
      /** Migration 0114 has run (the setup can be saved). */
      ready: boolean;
      saved: MediaKitSettings;
      coverUrl: string | null;
      /** The numbers for the saved period, sent after the page. */
      numbers: Promise<{ data?: MediaKitNumbers; error?: string }>;
      latest: string;
    };

export function MediaKitTab({ data }: { data: MediaKitTabData }) {
  if (!data.allowed)
    return (
      <div className="rounded-2xl border border-line/10 bg-surface p-8 text-center flex flex-col items-center">
        <span className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-ink-soft">
          <LockIcon className="w-6 h-6" />
        </span>
        <p className="text-[15px] font-semibold mt-3">The media kit is private</p>
        <p className="text-[13px] text-ink-soft mt-1 max-w-sm">It has the team&rsquo;s rates, so only masters, and the people a master gives revenue access, can make it.</p>
      </div>
    );
  return <Builder {...data} />;
}

type BuilderProps = Extract<MediaKitTabData, { allowed: true }>;
type SaveState = { kind: "idle" | "saving" | "saved" | "error"; text?: string };

function Builder(props: BuilderProps) {
  const toast = useToast();
  const [s, setS] = useState<MediaKitSettings>(props.saved);
  const [nums, setNums] = useState<MediaKitNumbers | null>(null);
  const [numsError, setNumsError] = useState<string | null>(null);
  const [loadingNums, setLoadingNums] = useState(true);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(props.coverUrl);
  const [uploading, setUploading] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [view, setView] = useState<"setup" | "preview">("setup");
  const [making, setMaking] = useState<{ kit: number; step: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<MediaKitSettings>) => setS((prev) => ({ ...prev, ...patch }));

  // A stored photo's link lasts an hour from when the page was made: it's signed again before then (and on coming back
  // to the page), and for a download, so the preview and the PDF keep the photo however long the page stays open.
  // A photo just added is drawn from its own copy (blob:), no link needed.
  const coverSigned = useRef(Date.now());
  const coverPath = s.coverPath;
  const storedCover = !!coverPath && !!coverUrl && !coverUrl.startsWith("blob:");
  const renewCover = useCallback(async (): Promise<string | null> => {
    if (!coverPath || Date.now() - coverSigned.current < COVER_RENEW_MS) return null;
    try {
      const r = await mediaKitCoverLink(props.teamId, coverPath);
      if (r.error !== undefined) return null;
      coverSigned.current = Date.now();
      setCoverUrl(r.url);
      return r.url;
    } catch {
      return null;
    }
  }, [coverPath, props.teamId]);
  useEffect(() => {
    if (!storedCover) return;
    const renew = () => {
      if (document.visibilityState === "visible") void renewCover();
    };
    const t = window.setInterval(renew, 5 * 60_000);
    document.addEventListener("visibilitychange", renew);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", renew);
    };
  }, [storedCover, renewCover]);

  // The numbers: the saved period's came with the page; another period is asked for (the latest asked wins).
  const keyOf = (x: Pick<MediaKitSettings, "period" | "from" | "to">) => `${x.period}|${x.period === "custom" ? `${x.from}|${x.to}` : ""}`;
  const periodKey = keyOf(s);
  const initialKey = useRef(keyOf(props.saved)).current;
  const keyNow = useRef(periodKey);
  keyNow.current = periodKey;
  /** Which period the numbers on show are for (null: the page's own haven't come yet). */
  const [numsKey, setNumsKey] = useState<string | null>(null);
  useEffect(() => {
    props.numbers.then((r) => {
      if (keyNow.current !== initialKey) return;
      if (r.data) setNums(r.data);
      setNumsError(r.error ?? null);
      setLoadingNums(false);
      setNumsKey(initialKey);
    });
  }, [props.numbers, initialKey]);
  useEffect(() => {
    if (periodKey === numsKey || (periodKey === initialKey && numsKey === null)) return;
    if (s.period === "custom" && (!s.from || !s.to)) return;
    const key = periodKey;
    setLoadingNums(true);
    const t = setTimeout(async () => {
      try {
        const r = await loadMediaKitNumbers(props.teamId, s.period, s.from, s.to);
        if (keyNow.current !== key) return;
        if (r.error !== undefined) setNumsError(r.error);
        else {
          setNums(r.data);
          setNumsError(null);
          setNumsKey(key);
        }
      } catch {
        if (keyNow.current === key) setNumsError("Couldn't get the numbers. Check your connection and try again.");
      } finally {
        if (keyNow.current === key) setLoadingNums(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [periodKey, numsKey, initialKey, props.teamId, s.period, s.from, s.to]);

  // The PDF's fonts, to measure the preview with.
  useEffect(() => {
    loadKitMeasure().then(setMeasure, () => setFontError("The preview couldn't load its fonts. Reload the page to try again."));
  }, []);

  // Masters: saved a moment after each change.
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    if (!props.canSave || !props.ready) return;
    setSave({ kind: "saving" });
    const t = setTimeout(async () => {
      try {
        const r = await saveMediaKit(props.teamId, s);
        setSave(r.error !== undefined ? { kind: "error", text: r.error } : { kind: "saved" });
      } catch {
        setSave({ kind: "error", text: "Couldn't save. Check your connection." });
      }
    }, 900);
    return () => clearTimeout(t);
  }, [s, props.canSave, props.ready, props.teamId]);

  // The kit(s), laid out a beat after typing (the form stays quick).
  const deferred = useDeferredValue(s);
  const images = useMemo(() => ({ logo: props.logoUrl, cover: deferred.cover === "photo" ? coverUrl : null }), [props.logoUrl, coverUrl, deferred.cover]);
  const kits = useMemo<Kit[] | null>(() => (nums && measure ? buildKits(nums, readKitSettings(deferred, props.teamId), measure, images) : null), [nums, measure, deferred, images, props.teamId]);

  const available = nums?.platforms.map((p) => p.platform) ?? [];
  const chosen = s.platforms.length ? s.platforms.filter((p) => available.includes(p)) : available;
  const togglePlatform = (p: KitPlatform) => {
    const on = chosen.includes(p);
    if (on && chosen.length === 1) return;
    const next = on ? chosen.filter((x) => x !== p) : [...chosen, p];
    set({ platforms: next.length === available.length ? [] : next });
  };

  async function uploadCover(original: File | undefined) {
    if (!original) return;
    if (!original.type.startsWith("image/")) return toast.error("Pick a picture: JPG, PNG or WebP.");
    const tooBig = pictureTooBig(original);
    if (tooBig) return toast.error(tooBig);
    setUploading(true);
    try {
      const file = await compressImage(original, { maxWidth: 1600, maxHeight: 2000, quality: 0.86 });
      if (!isPictureType(file.type) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error("Use a JPG, PNG or WebP picture.");
        return;
      }
      const path = `${props.teamId}/cover-${Date.now()}-${safeFileName(file.name)}`;
      const { error } = await createClient().storage.from("media-kit").upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type });
      if (error) {
        toast.error(props.ready ? "Couldn't add the photo. Only masters can." : "Run migration 0114 first.");
        return;
      }
      setCoverUrl(URL.createObjectURL(file));
      set({ coverPath: path, cover: "photo" });
    } finally {
      setUploading(false);
    }
  }

  async function download(which: number[]) {
    if (!nums || !measure || making) return;
    setMaking({ kit: which[0] ?? 0, step: "Starting…" });
    try {
      // From the setup as it is now (not the preview's moment-old copy), with a live link to the photo.
      const cover = s.cover !== "photo" ? null : storedCover ? ((await renewCover()) ?? coverUrl) : coverUrl;
      const fresh = buildKits(nums, readKitSettings(s, props.teamId), measure, { logo: props.logoUrl, cover });
      for (const i of which) {
        const kit = fresh[i];
        if (!kit) continue;
        setMaking({ kit: i, step: "Starting…" });
        const bytes = await renderKitPdf(kit, { author: props.teamName, generatedAt: nums.generatedAt }, (step, done, total) =>
          setMaking({ kit: i, step: total ? `${step.replace(/…$/, "")} ${done} of ${total}` : step })
        );
        downloadBytes(bytes, kit.fileName);
        // Several files: a breath between them, so the browser takes each.
        if (which.length > 1) await new Promise((r) => setTimeout(r, 500));
      }
      toast.success(which.length > 1 ? `${which.length} media kits downloaded` : "Media kit downloaded");
    } catch {
      toast.error("Couldn't make the PDF. Check your connection and try again.");
    } finally {
      setMaking(null);
    }
  }

  const emailProblem = s.contact.email && !isEmail(s.contact.email) ? "That doesn't look like an email address. It's left out of the kit until it does." : null;
  const siteProblem = s.contact.website && !isWebsite(s.contact.website) ? "That doesn't look like a website. It's left out of the kit until it does." : null;
  const kitCount = kits?.length ?? (s.split === "each" && chosen.length > 1 ? chosen.length : 1);
  const pageCount = kits?.reduce((n, k) => n + k.pages.length, 0) ?? 0;

  const downloadButton = (
    <button
      type="button"
      onClick={() => download((kits ?? []).map((_, i) => i))}
      disabled={!kits || !!making}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-60 hover:brightness-110 transition-[filter] whitespace-nowrap"
    >
      {making ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden /> : <DownloadIcon className="w-4 h-4" />}
      {making ? making.step : kitCount > 1 ? `Download ${kitCount} PDFs` : "Download PDF"}
    </button>
  );

  const setup = (
    <div className="space-y-4">
      <Section title="What's in it" hint="The channels, the days the numbers cover, and the pages.">
        <div>
          <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Channels</p>
          {loadingNums && !nums ? (
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <span key={i} className="skeleton h-9 w-36 rounded-xl" />
              ))}
            </div>
          ) : available.length ? (
            <div className="flex flex-wrap gap-2">
              {nums!.platforms.map((p) => {
                const on = chosen.includes(p.platform);
                return (
                  <button
                    key={p.platform}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => togglePlatform(p.platform)}
                    title={on && chosen.length === 1 ? "A kit needs at least one channel" : undefined}
                    className={`inline-flex items-center gap-2 rounded-xl border pl-2 pr-3 h-10 text-[13px] font-semibold transition-colors ${on ? "border-amber/60 bg-amber/[0.08] text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
                  >
                    <PlatformIcon platform={p.platform} className={`w-5 h-5 ${on ? "" : "opacity-50 grayscale"}`} />
                    <span>{KIT_PLATFORM_NAME[p.platform]}</span>
                    {p.handle && <span className="text-[12px] font-normal text-ink-faint max-w-[9rem] truncate">{p.handle}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-ink-soft">No channel has numbers yet. Connect YouTube, Instagram, TikTok or Facebook in Team → Connected accounts, and the kit fills in. Until then it has your words, rates and contact.</p>
          )}
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
          <Segmented ariaLabel="The days the numbers cover" value={s.period} onChange={(v) => set({ period: v, ...(v === "custom" && (!s.from || !s.to) ? { from: null, to: props.latest } : {}) })} options={KIT_PERIODS.map((p) => ({ value: p.id, label: p.label }))} />
          {s.period === "custom" && (
            <div className="flex items-center gap-2 mt-2.5 flex-wrap text-[13px]">
              <DatePicker value={s.from} onChange={(d) => set({ from: d, ...(s.to && d > s.to ? { to: d } : {}) })} ariaLabel="First day" triggerClassName={`${dateChip} ${s.from ? "" : "text-ink-faint"}`}>
                {s.from ? shortDay(s.from, true) : "First day"}
              </DatePicker>
              <span className="text-ink-faint">to</span>
              <DatePicker value={s.to} onChange={(d) => set({ to: d > props.latest ? props.latest : d, ...(s.from && d < s.from ? { from: d } : {}) })} ariaLabel="Last day" triggerClassName={dateChip}>
                {s.to ? shortDay(s.to, true) : "Last day"}
              </DatePicker>
            </div>
          )}
          {nums && (
            <p className="text-[12px] text-ink-faint mt-1.5">
              {dayRange(nums.window.from, nums.window.to)}. The platforms share each day&rsquo;s numbers the morning after.
            </p>
          )}
        </div>
        <div>
          <p className="text-[12.5px] font-semibold text-ink-soft mb-1">Pages</p>
          <div className="grid sm:grid-cols-2 gap-x-2 -mx-3">
            {KIT_SECTIONS.map((k: KitSection) => (
              <Toggle key={k} label={KIT_SECTION_LABEL[k]} on={s.sections[k]} onChange={(on) => set({ sections: { ...s.sections, [k]: on } })} />
            ))}
          </div>
        </div>
        {s.sections.videos && (
          <div>
            <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Best videos</p>
            <Segmented ariaLabel="How many best videos" value={String(s.videos) as "3" | "6"} onChange={(v) => set({ videos: v === "3" ? 3 : 6 })} options={[{ value: "3", label: "3 videos" }, { value: "6", label: "6 videos" }]} />
          </div>
        )}
      </Section>

      <Section title="Look" hint="Your colour runs through every page; the ink is a deep shade of it.">
        <div className="flex items-center gap-4 flex-wrap">
          <Segmented ariaLabel="Light or dark pages" value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={!s.accent}
              onClick={() => set({ accent: "" })}
              className={`inline-flex items-center gap-2 rounded-lg border px-2.5 h-9 text-[12.5px] font-semibold ${!s.accent ? "border-amber/60 bg-amber/[0.08]" : "border-line/15 text-ink-soft hover:text-ink"}`}
            >
              <span className="w-4 h-4 rounded-[5px] border border-line/15" style={{ background: props.teamColor }} />
              Team colour
            </button>
            <span className="text-[12.5px] text-ink-faint">or</span>
            <ColorPicker value={s.accent || props.teamColor} onChange={(hex) => set({ accent: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : "" })} />
          </div>
        </div>
        <div>
          <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Cover</p>
          <Segmented
            ariaLabel="The cover's picture"
            value={s.cover}
            onChange={(v) => set({ cover: v })}
            options={[
              { value: "videos", label: "Your best videos" },
              { value: "photo", label: "A photo" },
              { value: "plain", label: "One big number" },
            ]}
          />
          {s.cover === "photo" && (
            <div className="flex items-center gap-3 mt-3">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="The cover photo" className="w-16 h-20 rounded-lg object-cover border border-line/10" />
              ) : (
                <span className="w-16 h-20 rounded-lg bg-surface-2 flex items-center justify-center text-ink-faint">
                  <PhotoIcon className="w-6 h-6" />
                </span>
              )}
              <div className="space-y-1.5">
                {props.canSave ? (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-lg border border-line/15 px-3 h-9 text-[13px] font-semibold hover:bg-surface-2 disabled:opacity-60">
                      {uploading ? "Adding…" : coverUrl ? "Change the photo" : "Add a photo"}
                    </button>
                    {coverUrl && (
                      <button type="button" onClick={() => (setCoverUrl(null), set({ coverPath: null, cover: "videos" }))} aria-label="Remove the photo" className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-ink-soft hover:text-coral hover:bg-surface-2">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-ink-soft">Only masters can add the photo.</p>
                )}
                <p className="text-[12px] text-ink-faint">{coverUrl ? "Shown tall, beside your name." : "A photo of you or your team, up to 5 MB. Until there's one, the cover shows your best videos."}</p>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => (uploadCover(e.target.files?.[0]), (e.target.value = ""))} />
            </div>
          )}
        </div>
      </Section>

      <Section title="About you" hint="Your words, on the cover and the pages that introduce you.">
        <TextField label="Kit name" value={s.title} onChange={(v) => set({ title: v })} max={LIMITS.title} placeholder={props.teamName} hint="Leave it empty to use the team's name." />
        <TextField label="One line about the channel" value={s.tagline} onChange={(v) => set({ tagline: v })} max={LIMITS.tagline} placeholder="Slow travel, long roads and the people we meet on the way." hint="On the cover, under the name." />
        <TextArea label="About us" value={s.about} onChange={(v) => set({ about: v })} max={LIMITS.about} placeholder="What you make, for whom, how often, and since when." hint="Its own page after the cover, set big, beside your photo or best videos." rows={4} />
        <TextArea label="Who watches" value={s.audienceNote} onChange={(v) => set({ audienceNote: v })} max={LIMITS.audienceNote} placeholder="Curious travellers in their late twenties and thirties who buy good gear once." hint="Over the audience pages." rows={2} />
      </Section>

      <Section title="Rates" hint="Show your prices, or say they're on request. Packages say what a sponsor can buy either way.">
        <div className="flex items-center gap-3 flex-wrap">
          <Segmented ariaLabel="Prices or on request" value={s.rates.show ? "show" : "request"} onChange={(v) => set({ rates: { ...s.rates, show: v === "show" } })} options={[{ value: "show", label: "Show prices" }, { value: "request", label: "On request" }]} />
          {s.rates.show && (
            <div className="w-28">
              <Select value={s.rates.currency} onChange={(v) => v && set({ rates: { ...s.rates, currency: v } })} options={CURRENCY_OPTIONS} ariaLabel="Currency" />
            </div>
          )}
        </div>
        <RatesEditor rates={s.rates} onChange={(rates) => set({ rates })} />
        <TextArea label={s.rates.show ? "A note under the prices" : "A line under “Rates on request”"} value={s.rates.note} onChange={(v) => set({ rates: { ...s.rates, note: v } })} max={LIMITS.rateNote} placeholder={s.rates.show ? "Prices exclude VAT. Every package includes a link in the description." : "Tell us about your campaign and we’ll send a quote that fits it."} rows={2} />
      </Section>

      <Section title="Brands and kind words" hint="Who you've worked with, and what they said. Their page shows when there's something on it.">
        <PartnersEditor partners={s.partners} onChange={(partners) => set({ partners })} />
        <QuotesEditor quotes={s.testimonials} onChange={(testimonials) => set({ testimonials })} />
      </Section>

      <Section title="Contact" hint="On the last page; the email and website are links in the PDF.">
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField label="Name" value={s.contact.name} onChange={(v) => set({ contact: { ...s.contact, name: v } })} max={LIMITS.name} placeholder="Who sponsors write to" />
          <TextField label="Email" type="email" inputMode="email" value={s.contact.email} onChange={(v) => set({ contact: { ...s.contact, email: v } })} max={LIMITS.email} placeholder="partners@yourchannel.com" problem={emailProblem} />
          <TextField label="Phone" type="tel" inputMode="tel" value={s.contact.phone} onChange={(v) => set({ contact: { ...s.contact, phone: v } })} max={LIMITS.phone} placeholder="+40 712 345 678" />
          <TextField label="Website" inputMode="url" value={s.contact.website} onChange={(v) => set({ contact: { ...s.contact, website: v } })} max={LIMITS.website} placeholder="yourchannel.com" problem={siteProblem} />
        </div>
        <TextField label="Closing line" value={s.contact.cta} onChange={(v) => set({ contact: { ...s.contact, cta: v } })} max={LIMITS.cta} placeholder="Let’s make something together." />
      </Section>
    </div>
  );

  const preview = (
    <div className="space-y-6" aria-busy={loadingNums || !measure || undefined}>
      {(numsError || fontError) && <p className="rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5">{numsError ?? fontError}</p>}
      {!kits ? (
        <div className="space-y-4" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton w-full aspect-video rounded-xl" />
          ))}
        </div>
      ) : (
        kits.map((k, ki) => (
          <section key={k.fileName} aria-label={k.title} className={`space-y-3 transition-opacity ${loadingNums ? "opacity-60" : ""}`}>
            {kits.length > 1 && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {k.platforms.map((p) => (
                    <PlatformIcon key={p} platform={p} className="w-5 h-5 flex-shrink-0" />
                  ))}
                  <h3 className="text-[14px] font-bold truncate">{k.title}</h3>
                  <span className="text-[12px] text-ink-faint flex-shrink-0">{k.pages.length} pages</span>
                </div>
                <button type="button" onClick={() => download([ki])} disabled={!!making} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink disabled:opacity-50 flex-shrink-0">
                  <DownloadIcon className="w-3.5 h-3.5" />
                  {making?.kit === ki ? making.step : "Download"}
                </button>
              </div>
            )}
            {k.pages.map((p, pi) => (
              <figure key={pi} className="rounded-xl overflow-hidden border border-line/10 shadow-sm bg-surface">
                <KitPageSvg page={p} className="block w-full h-auto" title={`${k.title}, page ${pi + 1}: ${p.label}`} />
              </figure>
            ))}
          </section>
        ))
      )}
    </div>
  );

  return (
    <div className="pb-24 lg:pb-0">
      <style>{KIT_FONT_CSS}</style>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-[20px] font-bold">Media kit</h2>
          <p className="text-[13.5px] text-ink-soft mt-1">The deck sponsors ask for: your reach, your audience, your best videos, your rates and how to reach you, made from your own numbers. Set it up, check every page, download the PDF.</p>
          <p className="text-[12px] mt-1.5" role="status">
            {!props.ready ? (
              <span className="text-coral">Run migration 0114 to save your setup. You can still make and download kits.</span>
            ) : !props.canSave ? (
              <span className="text-ink-faint">Only masters save the setup. Your changes here are for your own download.</span>
            ) : save.kind === "saving" ? (
              <span className="text-ink-faint">Saving…</span>
            ) : save.kind === "saved" ? (
              <span className="text-ink-faint">Saved. The next kit starts from here.</span>
            ) : save.kind === "error" ? (
              <span className="text-coral">{save.text}</span>
            ) : (
              <span className="text-ink-faint">Your changes save as you go.</span>
            )}
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-3">
          {kits && <span className="text-[12.5px] text-ink-faint">{kits.length > 1 ? `${kits.length} kits, ${pageCount} pages` : `${pageCount} pages`}</span>}
          {downloadButton}
        </div>
      </div>

      <div className="lg:hidden mb-4">
        <Segmented ariaLabel="Set up or preview" value={view} onChange={setView} options={[{ value: "setup", label: "Set up" }, { value: "preview", label: kits ? `Preview (${pageCount} pages)` : "Preview" }]} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-6 items-start">
        <div className={view === "setup" ? "" : "hidden lg:block"}>{setup}</div>
        <div className={`${view === "preview" ? "" : "hidden lg:block"} lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1 widget-scroll`}>{preview}</div>
      </div>

      <div className="lg:hidden fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-6 z-30 px-4 pointer-events-none">
        <div className="pointer-events-auto flex justify-end">{downloadButton}</div>
      </div>
    </div>
  );
}

/** A stored photo's link is signed for an hour; it's signed again after 45 minutes. */
const COVER_RENEW_MS = 45 * 60_000;

const dateChip = "inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-9 font-semibold hover:bg-surface-2";
