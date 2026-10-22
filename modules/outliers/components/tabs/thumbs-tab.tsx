"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { CloseIcon, ImageIcon, ShuffleIcon } from "@/components/ui/icons";
import { HomeMock, MobileMock, ScaleFrame, type MockCard } from "@/modules/studio/components/mockups";
import { ago, compact, duration } from "../../lib/filters";
import { avatarAt, thumbUrl } from "../../lib/ingest";
import { multText } from "../../lib/scores";
import { hasColorFamily, similarThumbs } from "../../lib/similar";
import type { OutlierVideo } from "../../lib/types";
import type { Period, ThumbsData } from "../../lib/view";
import { BRIGHTNESS_HELP, BTN, COLOURFUL_HELP, EmptyNote, FIELD, Mult, pct255, SectionHead, SourceNote, Thumb } from "../bits";
import { useOutliersNav, useOutliers } from "../context";
import { useShellNav } from "../shell-nav";

/*
 * Thumbnails (1.27.0): a wall of the niche's outlier thumbnails, the colours
 * outliers use more (or less) than everyone else, thumbnails like any one
 * of them, and "Preview yours among them": your thumbnail and title on a
 * YouTube home page between real outliers from the niche.
 */

const FAMILY_HEX: Record<string, string> = { red: "#e0393e", orange: "#f08a24", yellow: "#f2c230", green: "#3aa655", teal: "#1fa5a0", blue: "#2f6fd6", purple: "#7c4dd6", pink: "#e0559a", dark: "#1b1b1f", light: "#f3f1ea", grey: "#8c8c8c" };

export function ThumbsTab({ data }: { data: ThumbsData }) {
  const ctx = useOutliers();
  const nav = useShellNav();
  const short = ctx.kind === "short";
  const [family, setFamily] = useState<string | null>(null);
  const [like, setLike] = useState<OutlierVideo | null>(null);
  const [all, setAll] = useState(false);

  const shown = useMemo(() => {
    let rows = data.rows;
    if (family) rows = rows.filter((v) => hasColorFamily(v.colors, family));
    if (like) {
      const ranked = similarThumbs({ id: like.id, hash: like.thumbHash, colors: like.colors }, rows.map((v) => ({ id: v.id, hash: v.thumbHash, colors: v.colors })), 60);
      const byId = new Map(rows.map((v) => [v.id, v]));
      rows = [like, ...ranked.map((r) => byId.get(r.id)!).filter(Boolean)];
    }
    return rows;
  }, [data.rows, family, like]);

  const families = data.colors?.families.filter((f) => f.share >= 0.02).sort((a, b) => b.outShare - a.outShare) ?? [];

  return (
    <div className="space-y-12">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_25rem]">
        <section className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Segmented
              ariaLabel="How far back"
              size="sm"
              value={data.period}
              onChange={(p: Period) => nav.go({ tab: "thumbnails", params: { period: p === "year" ? null : p } }, { replace: true })}
              options={[
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
                { value: "year", label: "Year" },
              ]}
            />
            {/* The colours wrap when there's no room (1.30.1: nothing slides sideways, and the picked one's ring shows whole). */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Colour">
              <button type="button" aria-pressed={!family} onClick={() => setFamily(null)} className={`flex-shrink-0 rounded-lg border px-2.5 h-8 text-[12.5px] font-semibold ${!family ? "border-amber/60 bg-amber/12" : "border-line/15 text-ink-soft hover:text-ink"}`}>
                Every colour
              </button>
              {(families.length ? families.map((f) => f.id) : Object.keys(FAMILY_HEX)).map((id) => {
                const name = id[0].toUpperCase() + id.slice(1);
                return (
                  <button key={id} type="button" aria-pressed={family === id} aria-label={name} title={name} onClick={() => setFamily(family === id ? null : id)} className={`flex-shrink-0 w-8 h-8 rounded-lg ring-offset-2 ring-offset-paper border border-line/15 transition-transform hover:scale-105 ${family === id ? "ring-2 ring-ink" : ""}`} style={{ background: FAMILY_HEX[id] }} />
                );
              })}
            </div>
          </div>
          {like && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-blue/[0.07] border border-blue/20 px-3 py-2 text-[12.5px]">
              <span className="flex-1 min-w-0 truncate">
                Thumbnails like <span className="font-semibold">&ldquo;{like.title}&rdquo;</span>
              </span>
              <button type="button" onClick={() => setLike(null)} className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-ink">
                <CloseIcon className="w-3 h-3" />
                Show all
              </button>
            </div>
          )}
          {shown.length ? (
            <>
              <ul className={`grid gap-2 sm:gap-2.5 ${short ? "grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]" : "grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]"}`}>
                {shown.slice(0, all ? shown.length : 48).map((v, i) => (
                  <ThumbTile key={v.id} v={v} first={i < 8} onLike={() => setLike(v)} focused={like?.id === v.id} />
                ))}
              </ul>
              {!all && shown.length > 48 && (
                <div className="mt-5 flex justify-center">
                  <button type="button" onClick={() => setAll(true)} className={BTN}>
                    Show all {shown.length}
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyNote title={family ? "No outliers in that colour here" : "No outlier thumbnails yet"} finding={!family} />
          )}
        </section>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-[4.5rem] xl:self-start">
          {data.colors ? <ColorFacts c={data.colors} onPick={setFamily} picked={family} /> : <EmptyNote title="Colours show up once thumbnails are read" />}
        </aside>
      </div>

      {!short && <PreviewYours rows={data.rows} />}
      <SourceNote />
    </div>
  );
}

function ThumbTile({ v, first, onLike, focused }: { v: OutlierVideo; first: boolean; onLike: () => void; focused: boolean }) {
  const { openVideo } = useOutliersNav();
  const short = v.kind === "short";
  return (
    <li className={`thumb-tile group relative rounded-xl overflow-hidden bg-surface-2 ${short ? "aspect-[9/16]" : "aspect-video"} ${focused ? "ring-2 ring-blue ring-offset-2 ring-offset-paper" : ""}`} tabIndex={-1}>
      <button type="button" onClick={() => openVideo(v.id)} className="absolute inset-0" aria-label={`Open “${v.title}”`}>
        <Thumb id={v.id} kind={v.kind} eager={first} sizes={short ? "140px" : "(min-width: 1400px) 260px, 45vw"} tint={v.colors?.[0]} />
      </button>
      <Mult score={v.score} size="sm" on className="absolute top-1.5 left-1.5 pointer-events-none" />
      <div className="thumb-caption pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2.5 pb-2 pt-8">
        <p className="text-[12px] font-semibold leading-snug text-white line-clamp-2">{v.title}</p>
        <p className="text-[11px] text-white/75 truncate">
          {v.channel.title} · {compact(v.views)} views
        </p>
      </div>
      <button type="button" onClick={onLike} className="absolute top-1.5 right-1.5 rounded-md bg-black/60 text-white px-1.5 h-6 text-[11px] font-semibold backdrop-blur-sm [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" title="Thumbnails that look like this one">
        Like this
      </button>
    </li>
  );
}

function ColorFacts({ c, onPick, picked }: { c: NonNullable<ThumbsData["colors"]>; onPick: (f: string | null) => void; picked: string | null }) {
  const fams = [...c.families].filter((f) => f.share >= 0.02).sort((a, b) => b.lift - a.lift);
  const max = Math.max(0.01, ...fams.map((f) => Math.max(f.share, f.outShare)));
  return (
    <div className="rounded-2xl border border-line/10 bg-surface p-4">
      <h2 className="text-[14.5px] font-semibold">Colours that win here</h2>
      <p className="text-[12px] text-ink-faint mt-0.5">Share of outlier thumbnails (solid) against all thumbnails (light) with each main colour</p>
      <ul className="mt-4 space-y-2.5">
        {fams.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => onPick(picked === f.id ? null : f.id)} className={`w-full text-left rounded-lg -mx-1.5 px-1.5 py-1 ${picked === f.id ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className="w-3 h-3 rounded-[3px] border border-line/20" style={{ background: FAMILY_HEX[f.id] ?? "#888" }} aria-hidden />
                <span className="flex-1">{f.name}</span>
                <span className={`font-display font-semibold tabular-nums ${f.lift >= 1.15 ? "text-green" : f.lift <= 0.87 ? "text-red" : "text-ink-soft"}`}>{multText(f.lift)}</span>
              </div>
              <div className="mt-1 relative h-2 rounded-[3px] bg-line/[0.06] overflow-hidden">
                <span className="absolute inset-y-0 left-0 rounded-[3px] opacity-35" style={{ width: `${(f.share / max) * 100}%`, background: FAMILY_HEX[f.id] ?? "#888" }} />
                <span className="absolute left-0 top-[3px] h-[2px] rounded-[1px]" style={{ width: `${(f.outShare / max) * 100}%`, background: f.id === "light" ? "#999" : FAMILY_HEX[f.id] ?? "#888" }} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-2 gap-2.5 text-[12px]">
        {(
          [
            ["Brightness", c.lum, BRIGHTNESS_HELP],
            ["Colourfulness", c.sat, COLOURFUL_HELP],
          ] as const
        ).map(([label, v, help]) => (
          <div key={label} className="rounded-xl bg-surface-2/60 px-3 py-2.5" title={help}>
            <dt className="text-ink-faint underline decoration-dotted decoration-line/40 underline-offset-2 cursor-help w-fit">{label}</dt>
            <dd className="mt-0.5">
              <span className="font-display text-[18px] font-semibold tabular-nums">{pct255(v.out) !== null ? `${pct255(v.out)}%` : "–"}</span>
              <span className="text-ink-faint"> outliers · {pct255(v.all) !== null ? `${pct255(v.all)}%` : "–"} all</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-[11.5px] text-ink-faint leading-snug">
        Brightness: how light the picture is (0% black, 100% white). Colourfulness: how vivid its colours are (0% grey, 100% pure colour). The middle thumbnail of the outliers, next to the middle one of all.
      </p>
    </div>
  );
}

/** Your thumbnail and title on a YouTube home page between the niche's real outliers (nothing leaves this device). */
function PreviewYours({ rows }: { rows: OutlierVideo[] }) {
  const ctx = useOutliers();
  const [img, setImg] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState(ctx.teamName);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [view, setView] = useState<"home" | "mobile">("home");
  const [spot, setSpot] = useState(1);
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => void (img && URL.revokeObjectURL(img)), [img]);
  // On a phone, the phone's YouTube first (the computer one would be tiny).
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setView("mobile");
  }, []);
  const take = (f: File | null | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setImg((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  };
  const cards = useMemo<MockCard[]>(() => {
    const real = rows
      .filter((v) => v.kind !== "short")
      .slice(0, 16)
      .map((v) => ({ key: v.id, thumb: thumbUrl(v.id, "mq"), title: v.title, channel: v.channel.title, avatar: avatarAt(v.channel.avatar, 72), views: `${compact(v.views)} views`, age: ago(v.publishedAt), duration: duration(v.durationS) }));
    const mine: MockCard = { key: "mine", thumb: img, title: title.trim() || "Your title goes here", channel: channel || "Your channel", avatar: null, views: "No views yet", age: "Just now", duration: "12:34", mine: true };
    const out: MockCard[] = [...real];
    out.splice(Math.min(spot, out.length), 0, mine);
    return out;
  }, [rows, img, title, channel, spot]);

  return (
    <section>
      <SectionHead title="Preview yours among them" sub="Your thumbnail and title on YouTube between this niche's real outliers. Your picture stays on this device." />
      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] 2xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              take(e.dataTransfer.files?.[0]);
            }}
            className={`relative rounded-2xl border-2 border-dashed aspect-video overflow-hidden flex items-center justify-center transition-colors ${drag ? "border-amber bg-amber/5" : "border-line/20 bg-surface"}`}
          >
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="Your thumbnail" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="text-center px-4">
                <ImageIcon className="w-7 h-7 mx-auto text-ink-faint" />
                <p className="mt-2 text-[13px] font-semibold">Drop your thumbnail here</p>
                <p className="text-[11.5px] text-ink-faint">or pick a file (1280 × 720 works best)</p>
              </div>
            )}
            <button type="button" onClick={() => file.current?.click()} className="absolute inset-0" aria-label={img ? "Pick another thumbnail" : "Pick a thumbnail"} />
            <input ref={file} type="file" accept="image/*" className="sr-only" onChange={(e) => take(e.target.files?.[0])} />
          </div>
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Your title" className={FIELD} />
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">Channel name</span>
            <input value={channel} onChange={(e) => setChannel(e.target.value)} maxLength={60} className={FIELD} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented ariaLabel="Screen" size="sm" value={view} onChange={setView} options={[{ value: "home", label: "Computer" }, { value: "mobile", label: "Phone" }]} />
            <Segmented ariaLabel="Theme" size="sm" value={theme} onChange={setTheme} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
            <button type="button" onClick={() => setSpot((s) => (s + 3) % 8)} className={`${BTN} h-8`} title="Put it somewhere else on the page">
              <ShuffleIcon className="w-3.5 h-3.5" />
              Move it
            </button>
          </div>
        </div>
        <div className="min-w-0 rounded-2xl border border-line/10 overflow-hidden bg-surface-2/40">
          {view === "home" ? (
            <ScaleFrame width={1280} fill>
              <HomeMock cards={cards} theme={theme} />
            </ScaleFrame>
          ) : (
            <div className="py-6 px-4 flex justify-center">
              <div className="w-full max-w-[390px]">
                <ScaleFrame width={390}>
                  <MobileMock cards={[...cards].sort((a, b) => (a.mine ? -1 : b.mine ? 1 : 0)).slice(0, 4)} theme={theme} />
                </ScaleFrame>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

