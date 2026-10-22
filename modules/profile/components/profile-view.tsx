"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { CheckIcon, ImageIcon, LockIcon, PaletteIcon, PhotoIcon, PlusIcon, SettingsIcon } from "@/components/ui/icons";
import { GridBoard, type GridCardMeta } from "@/modules/dashboard/components/grid-board";
import { DashboardBackdrop } from "@/modules/dashboard/components/backdrop";
import { useAvatarUpload } from "@/app/(dashboard)/settings/use-avatar-upload";
import { achievementsFor, FRAMES, levelProgress, levelTint, type FrameId, type ProfileStats } from "@/lib/profile/progress";
import { colorCss, DEFAULT_COLORS, sameColors, type ProfileColors } from "@/lib/profile/colors";
import { ABOUT_MAX, addShowcase, DEFAULT_PROFILE_LAYOUT, limitsFor, SHOWCASES, type ProfileLayout, type Showcase, type ShowcaseType } from "../layout";
import { saveProfilePage } from "../actions";
import { AchievementBadge, LevelBadge, ProfileAvatar, XpBar } from "./parts";
import { ColorRow, ColorsPreview } from "./colors";
import { renderShowcase, type ShowcaseData } from "./showcases";

/**
 * A profile (1.28.0), like a Steam profile: your picture in a frame your
 * level unlocked, your level and XP, a few achievements, and showcases you
 * arrange like the dashboard's widgets (drag, resize, add, remove), over a
 * background from your wallpapers. "Customize profile" (yours only) edits
 * all of it, and whether it's public; Save keeps it.
 *
 * 1.29.5: your colours (frame, XP bar, glow; Customize → Colours), your
 * picture changes with a click on it, and About me (and the featured
 * achievement) save from their own window, with or without Customize.
 */

export type PageLook = { public: boolean; layout: ProfileLayout; frame: FrameId; bgPath: string | null; colors: ProfileColors };
export type OwnWallpaper = { path: string; url: string; video: boolean; luma: number | null };

const noop = () => () => {};
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);
const BG_DIM = 18;
const NEEDS_0099 = "Colours need the latest database update (migration 0099).";

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden>
      <div className="h-3 w-1/3 rounded bg-line/15" />
      <div className="h-3 w-2/3 rounded bg-line/10" />
    </div>
  );
}

const HINTS = {
  narrow: "Make the window wider to move and resize showcases.",
  wide: "Drag a showcase to move it. Pull any edge or corner to resize. Arrow keys move the selected one, Shift + arrows resize.",
};

export function ProfileView({
  person,
  isSelf,
  page,
  bg: savedBg,
  stats,
  teams,
  wallpapers,
  actions,
  ready,
  colorsReady = true,
  startEditing = false,
}: {
  person: { id: string; name: string; username: string | null; avatarUrl: string | null; color: string; bio: string | null; joined: string };
  isSelf: boolean;
  page: PageLook;
  bg: { url: string; video: boolean; luma: number | null } | null;
  stats: ProfileStats | null;
  teams: ShowcaseData["teams"];
  /** Yours (for the background picker). */
  wallpapers: OwnWallpaper[];
  /** Invite to team (a master looking at someone). */
  actions?: React.ReactNode;
  /** Migration 0093 is in. */
  ready: boolean;
  /** Migration 0099 is in (the colours). */
  colorsReady?: boolean;
  startEditing?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const mounted = useMounted();
  const [saved, setSaved] = useState<PageLook>(page);
  const [draft, setDraft] = useState<PageLook | null>(null);
  const [saving, setSaving] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "add" | "frame" | "bg" | "colors">(null);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  // Your new picture shows at once (the page reloads behind it).
  const [avatarUrl, setAvatarUrl] = useState(person.avatarUrl);
  const avatar = useAvatarUpload(person.id, setAvatarUrl);
  useEffect(() => setSaved(page), [page]);
  useEffect(() => setAvatarUrl(person.avatarUrl), [person.avatarUrl]);
  useEffect(() => {
    if (startEditing && isSelf && ready) setDraft(structuredClone(page));
    // Only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = draft ?? saved;
  const editing = !!draft;
  const canEdit = isSelf && ready;
  const progress = stats ? levelProgress(stats.xp) : null;
  const level = progress?.level ?? 0;
  const levelHex = levelTint(level);
  // The colours as CSS (1.29.5): the level's, the theme's, or one picked.
  const frameCss = colorCss(shown.colors.frame, levelHex);
  const barCss = colorCss(shown.colors.bar, levelHex);
  const frameAt = (lv: number) => colorCss(shown.colors.frame, levelTint(lv));
  // Worked out once for the whole page (the header, the showcases and the pickers all use them).
  const achievements = useMemo(() => (stats ? achievementsFor(stats) : []), [stats]);
  const reached = useMemo(() => achievements.filter((a) => a.unlocked), [achievements]);
  const limits = useMemo(() => limitsFor(shown.layout.items), [shown.layout.items]);
  const data: ShowcaseData = {
    stats,
    name: person.name,
    avatarUrl,
    color: person.color,
    isSelf,
    teams,
    achievements,
    barTint: barCss,
    frameAt,
    onEdit: canEdit ? setSettingsFor : undefined,
  };
  // The gear on About me and Featured: yours only (it showed for visitors too, and did nothing).
  const showcaseMeta = (s: Showcase): GridCardMeta => {
    const m = SHOWCASES[s.type];
    return { name: m.name, stack: m.stack, hasSettings: !!m.hasSettings && canEdit, size: { w: m.w, h: m.h } };
  };
  // The background: while editing, the one picked (from your wallpapers). Once saved, the one saved, from
  // the moment Save is pressed (1.29.4: it went back to the old one until the page had reloaded, a flash).
  const bg = useMemo(() => {
    const path = (draft ?? saved).bgPath;
    if (!draft && path === page.bgPath) return savedBg;
    const w = path ? wallpapers.find((x) => x.path === path) : null;
    return w ? { url: w.url, video: w.video, luma: w.luma } : path === page.bgPath ? savedBg : null;
  }, [draft, saved, page.bgPath, savedBg, wallpapers]);
  const editingItem = shown.layout.items.find((s) => s.id === settingsFor) ?? null;
  const onBoard = new Set(shown.layout.items.map((s) => s.type));
  const missing = (Object.keys(SHOWCASES) as ShowcaseType[]).filter((t) => !onBoard.has(t));

  const change = (f: (d: PageLook) => PageLook) => setDraft((d) => (d ? f(d) : d));
  const setColor = (k: keyof ProfileColors, v: string) => change((d) => ({ ...d, colors: { ...d.colors, [k]: v } }));

  /** Saves `next`. `stay`: keep customizing afterwards (a showcase's own Save while customizing). */
  async function persist(next: PageLook, { stay = false, done = "Profile saved" } = {}) {
    setSaving(true);
    const r = await saveProfilePage({
      layout: next.layout,
      frame: next.frame,
      bgPath: next.bgPath,
      public: next.public,
      // Only when they changed: a database without 0099 still saves the rest.
      ...(sameColors(next.colors, saved.colors) ? {} : { colors: next.colors }),
    });
    setSaving(false);
    if (r.error) {
      toast.error(r.error);
      return false;
    }
    setSaved(next);
    setDraft(stay ? structuredClone(next) : null);
    toast.success(done);
    router.refresh();
    return true;
  }

  /** A showcase's settings (About me's words, the featured achievement), saved right away. */
  async function saveSettings(id: string, settings: Record<string, unknown>, done: string) {
    const base = draft ?? saved;
    const next: PageLook = { ...base, layout: { ...base.layout, items: base.layout.items.map((s) => (s.id === id ? { ...s, settings: { ...s.settings, ...settings } } : s)) } };
    if (await persist(next, { stay: !!draft, done })) setSettingsFor(null);
  }

  function add(type: ShowcaseType) {
    if (!draft) return;
    const r = addShowcase(draft.layout, type);
    setDraft({ ...draft, layout: r.layout });
    setFresh(r.id);
    setTimeout(() => setFresh((f) => (f === r.id ? null : f)), 900);
    setDialog(null);
  }

  function updateSettings(id: string, settings: Record<string, unknown>) {
    change((d) => ({ ...d, layout: { ...d.layout, items: d.layout.items.map((s) => (s.id === id ? { ...s, settings: { ...s.settings, ...settings } } : s)) } }));
  }

  const wrapStyle = bg ? ({ ...(bg.luma === null ? {} : { "--bg-luma": bg.luma / 100 }), "--bg-dim": BG_DIM / 100 } as CSSProperties) : undefined;
  const picture = <ProfileAvatar url={avatarUrl} name={person.name} color={person.color} size={104} frame={shown.frame} tint={frameCss} />;

  return (
    <div data-dash-bg={bg ? "" : undefined} className={`px-3 sm:px-5 xl:px-6 py-4 sm:py-6 w-full max-w-[1120px] mx-auto ${bg ? "wall-tone" : ""}`} style={wrapStyle}>
      {bg && <DashboardBackdrop src={bg.url} video={bg.video} dim={BG_DIM} luma={bg.luma} />}

      <section
        className="prof-head prof-frost relative rounded-2xl border border-line/10 bg-surface p-5 sm:p-7 overflow-hidden"
        data-glow={shown.colors.glow === "off" ? "off" : undefined}
        style={{ "--pg": colorCss(shown.colors.glow, levelHex) } as CSSProperties}
      >
        <div className="relative flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
            {isSelf ? (
              <button type="button" onClick={avatar.pick} disabled={avatar.busy} data-busy={avatar.busy ? "" : undefined} className="pf-change" aria-label="Change your picture" title="Change your picture">
                {picture}
                <span className="pf-change-face" aria-hidden>
                  {avatar.busy ? <span className="pf-spin animate-spin" /> : <PhotoIcon className="w-7 h-7" />}
                </span>
              </button>
            ) : (
              picture
            )}
            {isSelf && avatar.field}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[24px] sm:text-[30px] font-semibold leading-tight break-words">{person.name}</h1>
              <p className="text-[12.5px] text-ink-soft">
                {person.username ? `@${person.username} · ` : ""}Joined {new Date(person.joined).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                {isSelf && !shown.public && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 h-5 text-[11px] font-semibold text-ink-soft align-middle">
                    <LockIcon className="w-3 h-3" />
                    Private
                  </span>
                )}
              </p>
              {person.bio && <p className="mt-2 text-[13.5px] text-ink/90 leading-relaxed max-w-xl break-words">{person.bio}</p>}
              {reached.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5" aria-label="Latest achievements">
                  {reached.slice(0, 4).map((a) => (
                    <AchievementBadge key={a.id} a={a} size={30} />
                  ))}
                </div>
              )}
            </div>
          </div>
          {progress && (
            <div className="md:w-64 flex-shrink-0 rounded-xl border border-line/10 bg-surface-2/50 p-3.5">
              <div className="flex items-center gap-3">
                <LevelBadge level={progress.level} size={46} />
                <div className="min-w-0">
                  <div className="font-display text-[18px] font-semibold leading-tight">Level {progress.level}</div>
                  <div className="text-[11.5px] text-ink-soft tabular-nums">{progress.left.toLocaleString("en-US")} XP to the next</div>
                </div>
              </div>
              <XpBar share={progress.share} tint={barCss} className="mt-3" />
              <div className="mt-1 text-[11px] text-ink-soft tabular-nums">
                {progress.into.toLocaleString("en-US")} / {progress.need.toLocaleString("en-US")} XP
              </div>
            </div>
          )}
        </div>
        {(isSelf || actions) && !editing && (
          <div className="relative mt-5 flex items-center gap-2 flex-wrap">
            {isSelf && (
              <button
                type="button"
                onClick={() => (ready ? setDraft(structuredClone(saved)) : toast.error("This needs the latest database update (migration 0093)."))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 hover:bg-surface-2"
              >
                <SettingsIcon className="w-4 h-4" />
                Customize profile
              </button>
            )}
            {actions}
          </div>
        )}
      </section>

      {editing && (
        <div className="dash-tool mt-4 flex items-center gap-1.5 flex-wrap rounded-xl animate-[modalin_.2s_var(--ease-out)]" role="toolbar" aria-label="Customize profile">
          <button type="button" onClick={() => setDialog("add")} disabled={!missing.length} className="inline-flex items-center gap-1.5 rounded-lg border border-amber/50 bg-amber/10 px-3 h-8 text-[12.5px] font-bold text-amber hover:bg-amber/15 disabled:opacity-50">
            <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
            Add showcase
          </button>
          <button type="button" onClick={() => setDialog("frame")} className="rounded-lg border border-line/20 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
            Frame
          </button>
          <button
            type="button"
            onClick={() => (colorsReady ? setDialog("colors") : toast.error(NEEDS_0099))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink"
          >
            <PaletteIcon className="w-3.5 h-3.5" />
            Colours
          </button>
          <button type="button" onClick={() => setDialog("bg")} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
            <ImageIcon className="w-3.5 h-3.5" />
            Background
          </button>
          <div role="radiogroup" aria-label="Who sees your profile" className="inline-flex rounded-lg border border-line/20 p-0.5">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={draft.public === v}
                onClick={() => change((d) => ({ ...d, public: v }))}
                className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${draft.public === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {v ? "Public" : "Private"}
              </button>
            ))}
          </div>
          <span className="w-px h-5 bg-line/15 mx-0.5" />
          <button type="button" onClick={() => change((d) => ({ ...d, layout: structuredClone(DEFAULT_PROFILE_LAYOUT) }))} className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
            Reset
          </button>
          <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
            Cancel
          </button>
          <button type="button" onClick={() => void persist(draft)} disabled={saving} className="ml-auto rounded-lg bg-amber text-white font-bold px-4 h-8 text-[12.5px] disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
          <p className="basis-full text-[11.5px] text-ink-faint px-1">
            {draft.public ? "Public: everyone signed in sees your profile." : "Private: others see only your name and picture."}
          </p>
        </div>
      )}

      <div className="mt-4">
        <GridBoard
          items={shown.layout.items}
          fill
          limits={limits}
          editing={editing}
          mounted={mounted}
          fresh={fresh}
          meta={showcaseMeta}
          render={(s) => renderShowcase(s, data)}
          skeleton={<Skeleton />}
          onChange={(items) => change((d) => ({ ...d, layout: { v: 1, items } }))}
          onSettings={setSettingsFor}
          narrowAt={760}
          cq="prof-cq"
          hints={HINTS}
        />
        {!shown.layout.items.length && <p className="text-center text-[13px] text-ink-faint py-8">{editing ? "Add a showcase to fill your profile." : isSelf ? "Your profile is empty. Customize it to add showcases." : ""}</p>}
      </div>

      <Dialog open={dialog === "add"} onClose={() => setDialog(null)} title="Add a showcase">
        <div className="grid gap-2">
          {missing.map((t) => (
            <button key={t} type="button" onClick={() => add(t)} className="text-left rounded-xl border border-line/15 px-4 py-3 hover:border-amber/50 hover:bg-amber/5 transition-colors">
              <span className="block text-[13.5px] font-semibold">{SHOWCASES[t].name}</span>
              <span className="block text-[12px] text-ink-faint">{SHOWCASES[t].description}</span>
            </button>
          ))}
          {!missing.length && <p className="text-[13px] text-ink-faint">Every showcase is on your profile.</p>}
        </div>
      </Dialog>

      <Dialog open={dialog === "frame"} onClose={() => setDialog(null)} title="Picture frame" description={`You're level ${level}. New frames unlock as you level up.`} width="sm:max-w-xl">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5" role="radiogroup" aria-label="Picture frame">
          {FRAMES.map((f) => {
            const locked = f.level > level;
            const on = draft?.frame === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={locked}
                onClick={() => {
                  change((d) => ({ ...d, frame: f.id }));
                  setDialog(null);
                }}
                className={`relative flex flex-col items-center gap-2 rounded-xl border px-2 pt-4 pb-2.5 transition-colors ${on ? "border-amber ring-2 ring-amber/30" : "border-line/15 hover:border-line/35"} disabled:hover:border-line/15`}
              >
                <span className={locked ? "opacity-35 grayscale" : ""}>
                  <ProfileAvatar url={avatarUrl} name={person.name} color={person.color} size={52} frame={f.id} tint={frameAt(Math.max(level, f.level))} />
                </span>
                <span className="text-[12px] font-semibold leading-tight text-center">{f.name}</span>
                <span className="text-[10.5px] text-ink-faint inline-flex items-center gap-1">
                  {locked ? (
                    <>
                      <LockIcon className="w-3 h-3" />
                      Level {f.level}
                    </>
                  ) : on ? (
                    <>
                      <CheckIcon className="w-3 h-3" />
                      On
                    </>
                  ) : f.level ? (
                    `Level ${f.level}`
                  ) : (
                    "Always"
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {draft && colorsReady && (
          <div className="mt-4 pt-4 border-t border-line/10">
            <ColorRow label="Colour" value={draft.colors.frame} level={levelHex} onChange={(v) => setColor("frame", v)} />
          </div>
        )}
      </Dialog>

      <Dialog
        open={dialog === "colors" && !!draft}
        onClose={() => setDialog(null)}
        title="Colours"
        description="Your frame, your XP bar and the glow in your header. Everyone who visits sees them."
        footer={
          <>
            <button
              type="button"
              onClick={() => change((d) => ({ ...d, colors: DEFAULT_COLORS }))}
              disabled={!!draft && sameColors(draft.colors, DEFAULT_COLORS)}
              className="mr-auto rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50"
            >
              Back to level colours
            </button>
            <button type="button" onClick={() => setDialog(null)} className="rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px]">
              Done
            </button>
          </>
        }
      >
        {draft && (
          <div className="space-y-5">
            <ColorsPreview person={{ name: person.name, avatarUrl, color: person.color }} level={level} share={progress?.share ?? 0} frame={draft.frame} colors={draft.colors} />
            <ColorRow
              label="Frame"
              hint={draft.frame === "none" ? "You have no frame yet: pick one with Frame." : "The ring around your picture."}
              value={draft.colors.frame}
              level={levelHex}
              onChange={(v) => setColor("frame", v)}
            />
            <ColorRow label="XP bar" hint="Also the bars and icons in your showcases." value={draft.colors.bar} level={levelHex} onChange={(v) => setColor("bar", v)} />
            <ColorRow label="Glow" hint="The soft light in your header's corner." value={draft.colors.glow} level={levelHex} canBeOff onChange={(v) => setColor("glow", v)} />
            <p className="text-[11.5px] text-ink-faint leading-snug">
              Level: your level&rsquo;s colour, new every 10 levels. Theme: the colour theme of whoever is looking.
            </p>
          </div>
        )}
      </Dialog>

      <Dialog open={dialog === "bg"} onClose={() => setDialog(null)} title="Profile background" description="One of your wallpapers, behind your profile for everyone who visits." width="sm:max-w-xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => {
              change((d) => ({ ...d, bgPath: null }));
              setDialog(null);
            }}
            className={`aspect-video rounded-xl border-2 border-dashed text-[12.5px] font-semibold ${draft?.bgPath === null ? "border-amber text-ink" : "border-line/20 text-ink-soft hover:border-line/40"}`}
          >
            None
          </button>
          {wallpapers.map((w) => (
            <button
              key={w.path}
              type="button"
              onClick={() => {
                change((d) => ({ ...d, bgPath: w.path }));
                setDialog(null);
              }}
              aria-label="Use this wallpaper"
              className={`relative aspect-video rounded-xl overflow-hidden ${draft?.bgPath === w.path ? "ring-2 ring-amber ring-offset-2 ring-offset-surface" : "ring-1 ring-line/15 hover:ring-line/35"}`}
            >
              {w.video ? (
                <video src={w.url} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-faint">
          {wallpapers.length ? "Add or change wallpapers in " : "You haven't saved any wallpapers yet. Add some in "}
          <Link href="/settings?tab=preferences#background" className="font-semibold text-amber hover:brightness-110">
            Settings
          </Link>
          .
        </p>
      </Dialog>

      <AboutDialog
        open={editingItem?.type === "about"}
        initial={typeof editingItem?.settings?.text === "string" ? editingItem.settings.text : ""}
        saving={saving}
        onClose={() => setSettingsFor(null)}
        onSave={(text) => editingItem && void saveSettings(editingItem.id, { text }, "About me saved")}
      />

      <Dialog open={editingItem?.type === "featured"} onClose={() => setSettingsFor(null)} title={SHOWCASES.featured.name} description="The one achievement to show big. Without one picked, your rarest.">
        <div className="grid gap-1.5">
          {reached.map((a) => {
            const on = editingItem?.settings?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                disabled={saving}
                onClick={() => {
                  if (!editingItem) return;
                  // Customizing: it goes with the rest when you save. Otherwise saved right away.
                  if (draft) {
                    updateSettings(editingItem.id, { id: a.id });
                    setSettingsFor(null);
                  } else void saveSettings(editingItem.id, { id: a.id }, "Featured achievement saved");
                }}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${on ? "border-amber bg-amber/5" : "border-line/15 hover:border-line/35"}`}
              >
                <AchievementBadge a={a} size={34} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{a.name}</span>
                  <span className="block text-[11.5px] text-ink-faint">{a.text}</span>
                </span>
                {on && <CheckIcon className="w-4 h-4 text-amber ml-auto" />}
              </button>
            );
          })}
          {!reached.length && <p className="text-[13px] text-ink-faint">Reach an achievement first, then pick it here.</p>}
        </div>
      </Dialog>
    </div>
  );
}

/** About me's words, with their own Save (1.29.5: before, the words waited for Customize's Save, or were lost). */
function AboutDialog({ open, initial, saving, onClose, onSave }: { open: boolean; initial: string; saving: boolean; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);
  const changed = text !== initial;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={SHOWCASES.about.name}
      description="A few lines in your own words, for everyone who visits your profile."
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-3.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(text)} disabled={saving || !changed} className="rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px] disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <textarea
        data-autofocus
        value={text}
        maxLength={ABOUT_MAX}
        rows={8}
        aria-label="About me"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && changed && !saving) {
            e.preventDefault();
            onSave(text);
          }
        }}
        className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13.5px] leading-relaxed focus:outline-none focus:border-amber"
        placeholder="What you do on the team, what you love making, what you're learning…"
      />
      <div className="mt-1 text-right text-[11.5px] text-ink-faint tabular-nums">
        {text.length} / {ABOUT_MAX}
      </div>
    </Dialog>
  );
}
