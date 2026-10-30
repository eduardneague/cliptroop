"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DownloadIcon, ExpandIcon, LockIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { createClient } from "@/lib/supabase/client";
import { compressImage, isPictureType, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { pictureTooBig } from "@/lib/image/limits";
import { downloadBytes } from "@/lib/pdf-kit";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { loadMediaKitNumbers, mediaKitCoverLink, mediaKitLogoLinks, saveMediaKit } from "@/app/(dashboard)/analytics/media-kit-actions";
import { autoCoverGrid, buildKits, coverTitle, kitPlatforms, type Kit } from "../lib/layout";
import { kitUploadPath, nameFromFile, prepareLogo } from "../lib/logo-file";
import { applyManual } from "../lib/manual";
import { loadKitMeasure } from "../lib/fonts";
import { renderKitPdf } from "../lib/render-pdf";
import type { Measure, Page } from "../lib/scene";
import type { MediaKitNumbers } from "../lib/numbers";
import { brandLogos, LIMITS, newId, readKitSettings, type KitBrand, type KitTemplateInfo, type MediaKitSettings } from "../lib/settings";
import { NUMBER_PAGES, pagesTouched, touches } from "../lib/touched";
import type { KitPerson } from "../lib/access";
import { KitPageSvg, KIT_FONT_CSS } from "./kit-page-svg";
import { KitPageBusy, usePicturesComing } from "./kit-page-busy";
import { KitPresenter, type PresenterStart } from "./kit-presenter";
import { AboutPart, AudiencePart, ContactPart, CoverPart, GlancePart, KitPart, LookPart, PartnersPart, PlatformsPart, RatesPart, VideosPart, type KitForm } from "./kit-sections";
import { barBottom, pageAnchorFor, useKitSync, useWide } from "./use-kit-sync";
import { KitTemplates, type TemplateBase } from "./kit-templates";
import { KitAccess } from "./kit-access";

/*
 * Analytics → Media kit (1.37.0): what a sponsor asks for, made from the team's own numbers. Set it up on the left,
 * see every page on the right exactly as the PDF will be, download one kit or one per platform.
 *
 * 1.39.0: the form follows the kit's pages, part by part, and keeps up with the preview (use-kit-sync.ts): the part
 * you're at lights up with its page, a click on a page takes you to its part. Every part with numbers can be typed in
 * (Manual) instead of read (Auto); the videos on the cover and the videos page can be picked; the cover's wall comes in
 * three shapes; the kit shows full screen (kit-presenter.tsx). On a phone, the download sits in a bar of its own above
 * the tab bar.
 *
 * 1.40.0: Masters and the people they let in open it and save it (access.ts; Masters choose who: kit-access.tsx), and
 * the setup is kept as named templates, to open next time and change what's needed (kit-templates.tsx).
 */

export type MediaKitTabData =
  | { allowed: false }
  | {
      allowed: true;
      teamId: string;
      teamName: string;
      teamColor: string;
      logoUrl: string | null;
      /** Migration 0114 has run (the setup can be saved). */
      ready: boolean;
      saved: MediaKitSettings;
      coverUrl: string | null;
      /** 1.44.0: an hour's links to the brands' logos, by their paths. */
      logoUrls: Record<string, string>;
      /** The numbers for the saved period, sent after the page. */
      numbers: Promise<{ data?: MediaKitNumbers; error?: string }>;
      latest: string;
      /** 1.40.0: who's looking (their id). */
      me: string;
      /** The team's templates, newest change first; `templatesReady`: migration 0118 has run. */
      templates: KitTemplateInfo[];
      templatesReady: boolean;
      /** The template the setup was opened from, as it is now (to tell whether the setup differs from it). */
      base: TemplateBase | null;
      /** Masters: the team, and who of it they've let in (null for everyone else); `accessReady`: migration 0117 has run. */
      access: KitPerson[] | null;
      accessReady: boolean;
    };

export function MediaKitTab({ data }: { data: MediaKitTabData }) {
  if (!data.allowed)
    return (
      <div className="rounded-2xl border border-line/10 bg-surface p-8 text-center flex flex-col items-center">
        <span className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-ink-soft">
          <LockIcon className="w-6 h-6" />
        </span>
        <p className="text-[15px] font-semibold mt-3">The media kit is private</p>
        <p className="text-[13px] text-ink-soft mt-1 max-w-sm">It has the team&rsquo;s rates, so only masters and the people they choose open it. Ask a master to let you in.</p>
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
  const [present, setPresent] = useState<PresenterStart | null>(null);
  /** A template opened: the form is drawn afresh (nothing half-typed carries over). */
  const [formKey, setFormKey] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const wide = useWide();
  const sync = useKitSync({ editor: editorRef, preview: previewRef, wide });

  const set = useCallback((patch: Partial<MediaKitSettings>) => setS((prev) => ({ ...prev, ...patch })), []);
  const update = useCallback((fn: (s: MediaKitSettings) => Partial<MediaKitSettings>) => setS((prev) => ({ ...prev, ...fn(prev) })), []);

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

  // 1.44.0: the brands' logos, the same way: signed for an hour (again before then, on coming back to the page, and for a
  // download); one just added is drawn from its own copy (blob:). A logo with no link yet (another tab added it) is signed.
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>(props.logoUrls ?? {});
  const logoUrlsNow = useRef(logoUrls);
  logoUrlsNow.current = logoUrls;
  const logosSigned = useRef(Date.now());
  const logoPaths = useMemo(() => brandLogos(s), [s]);
  const logoKey = logoPaths.join("|");
  const renewLogos = useCallback(async (): Promise<Record<string, string> | null> => {
    const have = logoUrlsNow.current;
    const stored = logoPaths.filter((p) => !have[p]?.startsWith("blob:"));
    const missing = stored.some((p) => !have[p]);
    if (!stored.length || (!missing && Date.now() - logosSigned.current < COVER_RENEW_MS)) return null;
    try {
      const r = await mediaKitLogoLinks(props.teamId, stored);
      if (r.error !== undefined) return null;
      logosSigned.current = Date.now();
      setLogoUrls((prev) => ({ ...prev, ...r.urls }));
      return { ...logoUrlsNow.current, ...r.urls };
    } catch {
      return null;
    }
    // logoKey stands for logoPaths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoKey, props.teamId]);
  useEffect(() => {
    if (!logoPaths.length) return;
    if (logoPaths.some((p) => !logoUrlsNow.current[p])) void renewLogos();
    const renew = () => {
      if (document.visibilityState === "visible") void renewLogos();
    };
    const t = window.setInterval(renew, 5 * 60_000);
    document.addEventListener("visibilitychange", renew);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", renew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoKey, renewLogos]);

  // 1.40.0: a template opened (kit-templates.tsx): its setup on screen, with a fresh link to its photo (1.44.0: and its
  // logos). It's saved as the setup a moment later, as any change is; the numbers follow its period.
  const replace = useCallback((next: MediaKitSettings, cover: string | null, logos: Record<string, string> = {}) => {
    coverSigned.current = Date.now();
    logosSigned.current = Date.now();
    setCoverUrl(cover);
    setLogoUrls((prev) => ({ ...prev, ...logos }));
    setS(next);
    setFormKey((k) => k + 1);
  }, []);

  // The numbers: the saved period's came with the page; another period is asked for (the latest asked wins).
  const keyOf = (x: Pick<MediaKitSettings, "period" | "from" | "to">) => `${x.period}|${x.period === "custom" ? `${x.from}|${x.to}` : ""}`;
  const periodKey = keyOf(s);
  const initialKey = useRef(keyOf(props.saved)).current;
  const keyNow = useRef(periodKey);
  keyNow.current = periodKey;
  /** Which period the numbers on show are for (null: the page's own haven't come yet). */
  const [numsKey, setNumsKey] = useState<string | null>(null);
  // 1.41.0: the picked videos, read again with the numbers (a new period doesn't wait on them, nor reloads for them).
  const picksNow = useRef<{ platform: string; id: string }[]>([]);
  picksNow.current = [...s.videoPicks.list, ...s.coverPicks.list].map((v) => ({ platform: v.platform, id: v.id }));
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
        const r = await loadMediaKitNumbers(props.teamId, s.period, s.from, s.to, picksNow.current);
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

  // Saved a moment after each change.
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    if (!props.ready) return;
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
  }, [s, props.ready, props.teamId]);

  // The kit(s), laid out a beat after each change (the form stays quick).
  const deferred = useLaidOut(s);
  const images = useMemo(() => ({ logo: props.logoUrl, cover: deferred.cover === "photo" ? coverUrl : null, brands: logoUrls }), [props.logoUrl, coverUrl, deferred.cover, logoUrls]);
  const kits = useMemo<Kit[] | null>(() => (nums && measure ? buildKits(nums, readKitSettings(deferred, props.teamId), measure, images) : null), [nums, measure, deferred, images, props.teamId]);

  // The platforms: read, and added by hand; the kit's own, with what's typed in laid over.
  const applied = useMemo(() => (nums ? applyManual(nums, s) : null), [nums, s]);
  const available = applied?.platforms.map((p) => p.platform) ?? [];
  const chosen = s.platforms.length ? available.filter((p) => s.platforms.includes(p)) : available;
  const kitPs = useMemo(() => (applied ? kitPlatforms(applied, s) : []), [applied, s]);
  const autoGrid = useMemo(() => (nums ? autoCoverGrid(nums, deferred) : "shorts"), [nums, deferred]);
  const pages = useMemo(() => new Set((kits ?? []).flatMap((k) => k.pages.map((p) => p.anchor ?? ""))), [kits]);
  // 1.44.0: the cover's title as the kit's name breaks on it (the cover's own title starts from it).
  const kitName = s.title || props.teamName || "Our channel";
  const coverLines = useMemo(() => (measure ? coverTitle(measure, kitName, null).lines : [kitName]), [measure, kitName]);

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
      // 1.44.0: a name short enough to be kept (a long one was dropped on saving, and the cover lost its photo).
      const path = kitUploadPath(props.teamId, "cover", file.name, file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
      const { error } = await createClient().storage.from("media-kit").upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type });
      if (error) {
        toast.error(props.ready ? "Couldn't add the photo. Check your connection and try again (for people a master let in, migrations 0116 and 0117 come first)." : "Run migration 0114 first.");
        return;
      }
      setCoverUrl(URL.createObjectURL(file));
      set({ coverPath: path, cover: "photo" });
    } finally {
      setUploading(false);
    }
  }

  // 1.44.0: brands' logos. Several files at once (or dropped): a brand each, named from its file; one on a brand: its
  // logo. Each is made ready first (its margin cut away: logo-file.ts), then stored in the team's folder; its row says
  // it's going up, and so does the brands page.
  const [logosBusy, setLogosBusy] = useState<ReadonlySet<string>>(new Set());
  const busyLogo = (id: string, on: boolean) =>
    setLogosBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const sNow = useRef(s);
  sNow.current = s;
  async function addLogos(files: File[], brandId?: string) {
    const pics = files.filter((f) => f.type.startsWith("image/"));
    if (!pics.length) return toast.error("Pick a picture: PNG, JPG, WebP or SVG.");
    const room = brandId ? 1 : Math.max(0, LIMITS.brands - s.brands.length);
    if (!room) return toast.error(`A kit shows up to ${LIMITS.brands} brands. Remove one to add another.`);
    if (pics.length > room) toast.error(`Only ${room} more ${room === 1 ? "brand fits" : "brands fit"} (${LIMITS.brands} at most): the first ${room} were added.`);
    const jobs = pics.slice(0, room).map((file) => ({ file, id: brandId ?? newId() }));
    if (!brandId) update((cur) => ({ brands: [...cur.brands, ...jobs.map(({ file, id }): KitBrand => ({ id, name: nameFromFile(file.name, LIMITS.brandName), logo: null, quote: "", by: "" }))] }));
    jobs.forEach(({ id }) => busyLogo(id, true));
    await Promise.all(
      jobs.map(async ({ file, id }, i) => {
        try {
          const tooBig = pictureTooBig(file);
          if (tooBig) return void toast.error(tooBig);
          const ready = await prepareLogo(file);
          if (!ready) return void toast.error(`Couldn't read ${file.name} as a picture. Try a PNG, JPG, WebP or SVG.`);
          const path = kitUploadPath(props.teamId, "logo", file.name, ready.type === "image/webp" ? "webp" : "png", i);
          const { error } = await createClient().storage.from("media-kit").upload(path, ready, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: ready.type });
          if (error) return void toast.error(props.ready ? `Couldn't add ${file.name}. Check your connection and try again.` : "Run migration 0114 first.");
          // Its brand taken out while it went up: nothing will use it.
          if (!sNow.current.brands.some((b) => b.id === id)) return void createClient().storage.from("media-kit").remove([path]);
          setLogoUrls((prev) => ({ ...prev, [path]: URL.createObjectURL(ready) }));
          update((cur) => ({ brands: cur.brands.map((b) => (b.id === id ? { ...b, logo: path } : b)) }));
        } finally {
          busyLogo(id, false);
        }
      })
    );
  }

  async function download(which: number[]) {
    if (!nums || !measure || making) return;
    setMaking({ kit: which[0] ?? 0, step: "Starting…" });
    try {
      // From the setup as it is now (not the preview's moment-old copy), with live links to the photo and the logos.
      const cover = s.cover !== "photo" ? null : storedCover ? ((await renewCover()) ?? coverUrl) : coverUrl;
      const brands = (await renewLogos()) ?? logoUrls;
      const fresh = buildKits(nums, readKitSettings(s, props.teamId), measure, { logo: props.logoUrl, cover, brands });
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

  // A phone: the form and the preview take turns; "See this page" and a page's "Edit" go from one to the other.
  const pending = useRef<{ to: "page" | "part"; anchor: string } | null>(null);
  const { activate, goToPart } = sync;
  const see = useCallback(
    (anchor: string) => {
      pending.current = { to: "page", anchor };
      activate(anchor, "page");
      setView("preview");
    },
    [activate]
  );
  const editPart = useCallback(
    (anchor: string) => {
      pending.current = { to: "part", anchor };
      activate(anchor, "page");
      setView("setup");
    },
    [activate]
  );
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const el =
      p.to === "page"
        ? previewRef.current?.querySelector<HTMLElement>(`[data-page-anchor="${CSS.escape(pageAnchorFor(p.anchor))}"]`)
        : editorRef.current?.querySelector<HTMLElement>(`[data-kit-anchor="${CSS.escape(p.anchor)}"]`);
    if (el) window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - barBottom() - 12) });
  }, [view]);

  const kitCount = kits?.length ?? (s.split === "each" && chosen.length > 1 ? chosen.length : 1);
  const pageCount = kits?.reduce((n, k) => n + k.pages.length, 0) ?? 0;
  const lit = sync.active ? pageAnchorFor(sync.active) : null;
  /** Full screen from the page you're at (else the first). */
  const presentHere = () => {
    if (!kits?.length) return;
    for (let k = 0; k < kits.length; k++) {
      const i = kits[k].pages.findIndex((p) => p.anchor === lit);
      if (i >= 0) return setPresent({ kit: k, page: i });
    }
    setPresent({ kit: 0, page: 0 });
  };

  const f: KitForm = {
    s,
    set,
    update,
    teamId: props.teamId,
    teamName: props.teamName,
    teamColor: props.teamColor,
    latest: props.latest,
    read: nums,
    loading: loadingNums,
    available,
    chosen,
    kit: kitPs,
    pages,
    active: sync.active,
    see: wide ? null : see,
    photo: { url: coverUrl, uploading, add: (file) => void uploadCover(file), remove: () => (setCoverUrl(null), set({ coverPath: null, cover: "videos" })) },
    autoGrid,
    logos: { urls: logoUrls, busy: logosBusy, add: (files, brandId) => void addLogos(files, brandId) },
    coverLines,
  };

  const downloadLabel = making ? making.step : kitCount > 1 ? `Download ${kitCount} PDFs` : "Download PDF";
  const downloadButton = (big: boolean) => (
    <button
      type="button"
      onClick={() => download((kits ?? []).map((_, i) => i))}
      disabled={!kits || !!making}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-bold px-4 ${big ? "h-11" : "h-10"} text-[13.5px] disabled:opacity-60 hover:brightness-110 transition-[filter] whitespace-nowrap min-w-0`}
    >
      {making ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin flex-shrink-0" aria-hidden /> : <DownloadIcon className="w-4 h-4 flex-shrink-0" />}
      <span className="truncate">{downloadLabel}</span>
    </button>
  );
  const presentButton = (
    <button type="button" onClick={presentHere} disabled={!kits} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line/15 bg-surface px-3.5 h-10 text-[13.5px] font-semibold hover:bg-surface-2 disabled:opacity-50 whitespace-nowrap" title="See the kit full screen">
      <ExpandIcon className="w-4 h-4" />
      Full screen
    </button>
  );

  // 1.41.0: the pages being drawn again show it, each on its own (kit-page-busy.tsx): the ones a change redraws while
  // the new layout is on its way (the laid-out setup is behind), the numbers' pages while another period's numbers come,
  // the cover (and About us, which shows its photo) while a photo goes up, and any page whose new pictures are coming.
  const touched = useMemo(() => (kits && deferred !== s ? pagesTouched(deferred, s) : null), [kits, deferred, s]);
  const reloading = loadingNums && !!nums;
  const picturesComing = usePicturesComing(kits);
  const updating = (p: Page) => touches(touched, p.anchor) || (reloading && touches(NUMBER_PAGES, p.anchor)) || (uploading && (p.anchor === "cover" || p.anchor === "about")) || (logosBusy.size > 0 && p.anchor === "partners") || picturesComing(p);

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
          <section key={k.fileName} aria-label={k.title} className="space-y-4">
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
            {k.pages.map((p, pi) => {
              const on = !!lit && p.anchor === lit;
              const where = `page ${pi + 1}: ${p.label}`;
              const busy = updating(p);
              return (
                <figure key={pi} data-page-anchor={p.anchor} aria-busy={busy || undefined} className="group/page">
                  <button
                    type="button"
                    onClick={() => (wide ? p.anchor && goToPart(p.anchor) : setPresent({ kit: ki, page: pi }))}
                    aria-label={wide ? `Edit ${where}` : `See ${where}, full screen`}
                    className={`relative block w-full rounded-xl overflow-hidden border bg-surface transition-[border-color,box-shadow] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${on ? "border-amber/70 shadow-[0_0_0_3px_rgb(var(--amber)/0.28)]" : "border-line/10 shadow-sm hover:border-line/30"} ${wide ? "cursor-pointer" : "cursor-zoom-in"}`}
                  >
                    <KitPageSvg page={p} links={false} className="block w-full h-auto" title={`${k.title}, ${where}`} />
                    {busy && <KitPageBusy bg={p.bg} />}
                  </button>
                  <figcaption className="flex items-center gap-2 mt-1.5 px-0.5 min-h-7 text-[12px]">
                    <span className={`tabular-nums ${on ? "text-ink font-semibold" : "text-ink-faint"}`}>{pi + 1}</span>
                    <span className={`truncate ${on ? "text-ink font-semibold" : "text-ink-faint"}`}>{p.label}</span>
                    {on && <span className="rounded-md bg-amber/15 text-amber px-1.5 py-px text-[11px] font-bold flex-shrink-0">Editing</span>}
                    <span className="flex-1" />
                    {wide ? (
                      <button type="button" onClick={() => setPresent({ kit: ki, page: pi })} className="inline-flex items-center gap-1 rounded-md px-1.5 h-7 font-semibold text-ink-faint hover:text-ink hover:bg-surface-2 opacity-0 group-hover/page:opacity-100 focus-visible:opacity-100 transition-opacity" aria-label={`See ${where}, full screen`}>
                        <ExpandIcon className="w-3.5 h-3.5" />
                        Full screen
                      </button>
                    ) : (
                      p.anchor && (
                        <button type="button" onClick={() => editPart(p.anchor!)} className="inline-flex items-center rounded-md px-2 h-7 font-semibold text-ink-soft hover:text-ink hover:bg-surface-2" aria-label={`Edit ${where}`}>
                          Edit
                        </button>
                      )
                    )}
                  </figcaption>
                </figure>
              );
            })}
          </section>
        ))
      )}
    </div>
  );

  return (
    <div className="pb-28 lg:pb-0">
      <style>{KIT_FONT_CSS}</style>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-[20px] font-bold">Media kit</h2>
          <p className="text-[13.5px] text-ink-soft mt-1">The deck sponsors ask for: your reach, your audience, your best videos, your rates and how to reach you, made from your own numbers. Set it up, check every page, download the PDF.</p>
          <p className="text-[12px] mt-1.5" role="status">
            {!props.ready ? (
              <span className="text-coral">Run migration 0114 to save your setup. You can still make and download kits.</span>
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
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <KitTemplates teamId={props.teamId} me={props.me} ready={props.templatesReady} s={s} deferred={deferred} initial={props.templates} initialBase={props.base} set={set} replace={replace} />
            {props.access && <KitAccess teamId={props.teamId} me={props.me} ready={props.accessReady} people={props.access} />}
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-2.5">
          {kits && <span className="text-[12.5px] text-ink-faint mr-1">{kits.length > 1 ? `${kits.length} kits, ${pageCount} pages` : `${pageCount} pages`}</span>}
          {presentButton}
          {downloadButton(false)}
        </div>
      </div>

      <div className="lg:hidden mb-4">
        <Segmented ariaLabel="Set up or preview" value={view} onChange={setView} options={[{ value: "setup", label: "Set up" }, { value: "preview", label: kits ? `Preview (${pageCount} pages)` : "Preview" }]} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-6 items-start">
        <div ref={editorRef} className={`space-y-4 ${view === "setup" ? "" : "hidden lg:block"}`}>
          <Fragment key={formKey}>
            <KitPart f={f} />
            <LookPart f={f} />
            <CoverPart f={f} />
            <AboutPart f={f} />
            {s.split === "together" && chosen.length > 1 && <GlancePart f={f} />}
            <PlatformsPart f={f} />
            <AudiencePart f={f} />
            <VideosPart f={f} />
            <PartnersPart f={f} />
            <RatesPart f={f} />
            <ContactPart f={f} />
          </Fragment>
        </div>
        <div
          ref={previewRef}
          className={`${view === "preview" ? "" : "hidden lg:block"} lg:sticky lg:top-[calc(var(--shell-top,3.5rem)+1rem)] lg:max-h-[calc(100dvh-var(--shell-top,3.5rem)-2rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain lg:-mr-2 lg:pr-2 lg:pt-1 widget-scroll`}
        >
          {preview}
        </div>
      </div>

      {/* A phone: the kit's two actions in a bar of their own, above the tab bar. */}
      <div className="lg:hidden fixed z-30 inset-x-0 mx-auto md:mx-0 md:left-auto md:right-6 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] md:bottom-6 w-[min(30rem,calc(100vw-1.5rem))] rounded-2xl border border-line/15 bg-surface shadow-xl glass-pane p-2 flex items-center gap-2">
        <button type="button" onClick={presentHere} disabled={!kits} aria-label="See the kit full screen" className="w-11 h-11 rounded-xl border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-50 flex-shrink-0">
          <ExpandIcon className="w-5 h-5" />
        </button>
        <p className="flex-1 min-w-0 text-[12px] leading-tight px-0.5">
          <span className="block font-semibold text-ink truncate">{kits ? (kits.length > 1 ? `${kits.length} kits, ${pageCount} pages` : `${pageCount} pages`) : "Laying out…"}</span>
          <span className={`block truncate ${save.kind === "error" || !props.ready ? "text-coral" : "text-ink-faint"}`}>{!props.ready ? "The setup isn't saved yet" : save.kind === "saving" ? "Saving…" : save.kind === "error" ? "Not saved" : "Saved as you go"}</span>
        </p>
        <div className="flex-shrink min-w-0">{downloadButton(true)}</div>
      </div>

      {present && kits && <KitPresenter kits={kits} start={present} onClose={() => setPresent(null)} onDownload={(k) => download([k])} making={making} />}
    </div>
  );
}

/** A stored photo's link is signed for an hour; it's signed again after 45 minutes. */
const COVER_RENEW_MS = 45 * 60_000;

/**
 * The setup the preview is laid out from (1.41.0): the form's, a moment later, so the form stays quick. Not React's
 * useDeferredValue any more: React draws that "later" together with every transition in flight, and each server action
 * is one (the save a moment after a change, another period's numbers), so the preview waited for the save's round trip
 * before showing a change (seconds on a slow connection). This is an ordinary update, after the next paint: the pages
 * it changes say Updating first, should it take a while (kit-page-busy.tsx); in a hidden tab, soon anyway.
 */
function useLaidOut(s: MediaKitSettings): MediaKitSettings {
  const [laid, setLaid] = useState(s);
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => {
    if (laid === s) return;
    let done = false;
    let t = 0;
    const go = () => {
      if (done) return;
      done = true;
      setLaid(latest.current);
    };
    const raf = requestAnimationFrame(() => {
      t = window.setTimeout(go, 0);
    });
    const fallback = window.setTimeout(go, 150);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.clearTimeout(fallback);
    };
  }, [s, laid]);
  return laid;
}

