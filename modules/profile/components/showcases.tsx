"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useBox } from "@/modules/dashboard/components/widget-box";
import { Dialog } from "@/components/ui/dialog";
import { CheckIcon, ClockIcon, EditIcon, FlameIcon, StarIcon, TrophyIcon, VideoIcon } from "@/components/ui/icons";
import { CATEGORY_LABEL, FRAMES, levelProgress, STEP_CATEGORIES, TIER_LABEL, type AchievementState, type ProfileStats } from "@/lib/profile/progress";
import type { Showcase } from "../layout";
import { AchievementBadge, LevelBadge, ProfileAvatar, shortDate, XpBar } from "./parts";

/*
 * What a profile's showcases draw (1.28.0). Each fits the box it's given
 * (useBox), like the dashboard's widgets. Numbers come from profile_stats
 * (0093); null = none yet (the database before 0093). Since 1.29.5 the
 * bars and icons are in the profile's XP bar colour, and the achievements
 * are worked out once for the whole page.
 */

export type ShowcaseData = {
  stats: ProfileStats | null;
  name: string;
  avatarUrl: string | null;
  color: string;
  isSelf: boolean;
  /** null: hidden from you (they keep their teams private). */
  teams: { id: string; name: string; color: string; logo_url: string | null }[] | null;
  /** Every achievement, reached ones first (achievementsFor), worked out once for the page. */
  achievements: AchievementState[];
  /** The XP bar's colour, as CSS: the bars and icons here too. */
  barTint: string;
  /** The frame's colour at a level, as CSS (the next frame's preview). */
  frameAt: (level: number) => string;
  /** Yours: opens a showcase's own settings (About me's words). */
  onEdit?: (id: string) => void;
};

const fmt = (n: number) => n.toLocaleString("en-US");
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-[12.5px] text-ink-faint">{children}</p>;

export function renderShowcase(s: Showcase, d: ShowcaseData) {
  switch (s.type) {
    case "level":
      return <LevelShowcase d={d} />;
    case "stats":
      return <StatsShowcase d={d} />;
    case "contributions":
      return <ContributionsShowcase d={d} />;
    case "achievements":
      return <AchievementsShowcase d={d} />;
    case "specialties":
      return <SpecialtiesShowcase d={d} />;
    case "about":
      return <AboutShowcase text={typeof s.settings?.text === "string" ? s.settings.text : ""} isSelf={d.isSelf} onEdit={d.onEdit ? () => d.onEdit?.(s.id) : undefined} />;
    case "teams":
      return <TeamsShowcase teams={d.teams} />;
    case "featured":
      return <FeaturedShowcase d={d} id={typeof s.settings?.id === "string" ? s.settings.id : null} />;
  }
}

function LevelShowcase({ d }: { d: ShowcaseData }) {
  const box = useBox();
  if (!d.stats) return <Empty>Levels come with the next database update.</Empty>;
  const p = levelProgress(d.stats.xp);
  const next = FRAMES.find((f) => f.level > p.level);
  const big = box.h >= 120;
  const tall = box.h >= 210;
  return (
    <div className="flex flex-col h-full min-h-0 justify-center gap-2.5">
      <div className="flex items-center gap-3">
        <LevelBadge level={p.level} size={big ? 56 : 44} />
        <div className="min-w-0">
          <div className="font-display text-[20px] font-semibold leading-tight">Level {p.level}</div>
          <div className="text-[12px] text-ink-faint tabular-nums">{fmt(d.stats.xp)} XP in all</div>
        </div>
      </div>
      <div>
        <XpBar share={p.share} tint={d.barTint} />
        <div className="mt-1 flex justify-between text-[11.5px] text-ink-soft tabular-nums">
          <span>
            {fmt(p.into)} / {fmt(p.need)} XP
          </span>
          <span>{fmt(p.left)} to level {p.level + 1}</span>
        </div>
      </div>
      {next && big && (
        <div className="flex items-center gap-2 text-[11.5px] text-ink-soft">
          <ProfileAvatar url={d.avatarUrl} name={d.name} color={d.color} size={22} frame={next.id} tint={d.frameAt(next.level)} />
          <span>
            Next frame: <span className="font-semibold text-ink">{next.name}</span> at level {next.level}
          </span>
        </div>
      )}
      {tall && (
        <p className="text-[11.5px] text-ink-faint leading-snug">
          Every step you finish on a video gives XP: bigger steps more (editing a long video, 90), and a quarter more when it&rsquo;s done by its date.
        </p>
      )}
    </div>
  );
}

function StatsShowcase({ d }: { d: ShowcaseData }) {
  const s = d.stats;
  if (!s) return <Empty>Numbers come with the next database update.</Empty>;
  const reached = d.achievements.filter((a) => a.unlocked).length;
  // Each with its icon (1.29.5), in the XP bar's colour.
  const items = [
    { label: "Steps finished", value: fmt(s.tasks), Icon: CheckIcon },
    { label: "On time", value: s.dated ? `${Math.round((s.onTime / s.dated) * 100)}%` : "–", Icon: ClockIcon },
    { label: "Videos worked on", value: fmt(s.videos), Icon: VideoIcon },
    { label: "Best streak", value: s.streak.best ? `${s.streak.best}` : "–", unit: s.streak.best ? (s.streak.best === 1 ? "day" : "days") : undefined, Icon: FlameIcon },
    { label: "Achievements", value: `${reached}`, Icon: TrophyIcon },
    { label: "XP", value: fmt(s.xp), Icon: StarIcon },
  ];
  return (
    <div className="stat-cq h-full flex items-center" style={{ "--pb": d.barTint } as CSSProperties}>
      <div className="stat-grid w-full" data-n={items.length}>
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="pf-stat-icon" aria-hidden>
                <it.Icon className="w-3 h-3" strokeWidth={2.25} />
              </span>
              <span className="font-display text-[22px] font-semibold leading-none tabular-nums truncate">
                {it.value}
                {it.unit && <span className="ml-1 font-body text-[12.5px] font-semibold text-ink-soft">{it.unit}</span>}
              </span>
            </div>
            <div className="mt-1 text-[11.5px] text-ink-faint truncate">{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const MIX = [0, 30, 55, 78, 100];
const heat = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

function ContributionsShowcase({ d }: { d: ShowcaseData }) {
  const box = useBox();
  const s = d.stats;
  // Too narrow for the whole year (phones): it scrolls, starting at this week.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [box.w]);
  // 53 weeks, Monday first, ending this week (UTC days, like the numbers).
  const weeks = useMemo(() => {
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 52 * 7 - ((end.getUTCDay() + 6) % 7));
    const out: string[][] = [];
    const cur = new Date(start);
    for (let w = 0; w < 53; w++) {
      const col: string[] = [];
      for (let k = 0; k < 7; k++) {
        col.push(utcDay(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      out.push(col);
    }
    return out;
  }, []);
  if (!s) return <Empty>Contributions come with the next database update.</Empty>;
  const today = utcDay(new Date());
  const year = Object.entries(s.days).reduce((t, [, n]) => t + n, 0);
  const cell = Math.max(6, Math.min(15, Math.floor((box.w - 4) / 53) - 2, Math.floor((box.h - 34) / 7) - 2));
  const step = cell + 2;
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[12px] text-ink-soft mb-2">
        <span>
          <span className="font-semibold text-ink tabular-nums">{fmt(year)}</span> in the last year
        </span>
        <span>
          <span className="font-semibold text-ink tabular-nums">{s.streak.current}</span> day streak
        </span>
        <span>
          <span className="font-semibold text-ink tabular-nums">{s.streak.best}</span> best
        </span>
      </div>
      <div ref={scroller} className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden styled-scroll flex">
        <div className="relative mx-auto flex-shrink-0" style={{ width: 53 * step, height: 7 * step }} role="img" aria-label={`${year} finished steps in the last year`}>
          {weeks.map((col, w) =>
            col.map((day, k) => {
              const n = s.days[day] ?? 0;
              return (
                <span
                  key={day}
                  title={day > today ? undefined : `${n} on ${new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                  className="absolute rounded-[3px]"
                  style={{
                    left: w * step,
                    top: k * step,
                    width: cell,
                    height: cell,
                    opacity: day > today ? 0 : 1,
                    background: n ? `color-mix(in srgb, rgb(var(--amber)) ${MIX[heat(n)]}%, rgb(var(--line) / 0.12))` : "rgb(var(--line) / 0.12)",
                  }}
                />
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

function AchievementsShowcase({ d }: { d: ShowcaseData }) {
  const box = useBox();
  const [all, setAll] = useState(false);
  const list = d.achievements;
  if (!d.stats) return <Empty>Achievements come with the next database update.</Empty>;
  const reached = list.filter((a) => a.unlocked).length;
  const size = box.w < 260 ? 36 : 44;
  const perRow = Math.max(1, Math.floor((box.w + 8) / (size + 8)));
  const rows = Math.max(1, Math.floor((box.h - 30 + 8) / (size + 8)));
  const fits = perRow * rows;
  const shown = list.length > fits ? list.slice(0, fits - 1) : list;
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-baseline gap-2 mb-2 text-[12px] text-ink-soft">
        <span>
          <span className="font-semibold text-ink tabular-nums">{reached}</span> of {list.length} reached
        </span>
        <button type="button" onClick={() => setAll(true)} className="ml-auto text-[12px] font-semibold text-amber hover:brightness-110">
          See all
        </button>
      </div>
      <div className="flex flex-wrap gap-2 content-start overflow-hidden">
        {shown.map((a) => (
          <AchievementBadge key={a.id} a={a} size={size} />
        ))}
        {shown.length < list.length && (
          <button type="button" onClick={() => setAll(true)} className="rounded-full border border-dashed border-line/30 text-[11.5px] font-semibold text-ink-soft hover:text-ink" style={{ width: size, height: size }}>
            +{list.length - shown.length}
          </button>
        )}
      </div>
      <Dialog open={all} onClose={() => setAll(false)} title={`Achievements: ${reached} of ${list.length}`} width="sm:max-w-xl">
        <ul className="divide-y divide-line/10">
          {list.map((a) => (
            <AchievementRow key={a.id} a={a} />
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

function AchievementRow({ a }: { a: AchievementState }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <AchievementBadge a={a} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-[13.5px] font-semibold ${a.unlocked ? "" : "text-ink-soft"}`}>{a.name}</span>
          <span className="pf-tier text-[10.5px] font-bold" data-tier={a.tier}>
            {TIER_LABEL[a.tier]}
          </span>
        </div>
        <div className="text-[12px] text-ink-faint">{a.text}</div>
      </div>
      <div className="text-right text-[11.5px] text-ink-soft tabular-nums flex-shrink-0">
        {a.unlocked ? (
          shortDate(a.at)
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="w-16 h-1.5 rounded-full bg-line/15 overflow-hidden">
              <span className="block h-full rounded-full bg-ink-faint" style={{ width: `${(a.have / a.goal) * 100}%` }} />
            </span>
            {a.have}/{a.goal}
          </span>
        )}
      </div>
    </li>
  );
}

function SpecialtiesShowcase({ d }: { d: ShowcaseData }) {
  const box = useBox();
  if (!d.stats) return <Empty>This comes with the next database update.</Empty>;
  const rows = STEP_CATEGORIES.map((c) => ({ c, n: d.stats!.by[c] ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, Math.max(1, Math.floor((box.h + 6) / 30)));
  if (!rows.length) return <Empty>{d.isSelf ? "Finish a step on a video and it shows here." : "Nothing finished yet."}</Empty>;
  const max = rows[0].n;
  const tint = d.barTint;
  return (
    <ul className="flex flex-col gap-2 justify-center h-full">
      {rows.map(({ c, n }) => (
        <li key={c} className="grid grid-cols-[minmax(5rem,auto)_1fr_auto] items-center gap-2.5 text-[12.5px]">
          <span className="text-ink-soft truncate">{CATEGORY_LABEL[c].name}</span>
          <span className="h-2.5 rounded-full bg-line/12 overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (n / max) * 100)}%`, background: tint }} />
          </span>
          <span className="font-semibold tabular-nums">{fmt(n)}</span>
        </li>
      ))}
    </ul>
  );
}

function AboutShowcase({ text, isSelf, onEdit }: { text: string; isSelf: boolean; onEdit?: () => void }) {
  if (!text.trim())
    return isSelf && onEdit ? (
      <div className="h-full flex flex-col items-start justify-center gap-2">
        <p className="text-[12.5px] text-ink-faint">Nothing here yet. Write a few lines about yourself.</p>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/40">
          <EditIcon className="w-3.5 h-3.5" />
          Write about me
        </button>
      </div>
    ) : (
      <Empty>Nothing here yet.</Empty>
    );
  return <p className="text-[13.5px] text-ink-soft leading-relaxed whitespace-pre-line overflow-y-auto styled-scroll h-full">{text}</p>;
}

function TeamsShowcase({ teams }: { teams: ShowcaseData["teams"] }) {
  if (teams === null) return <Empty>Their teams are private.</Empty>;
  if (!teams.length) return <Empty>Not on a team yet.</Empty>;
  return (
    <div className="flex flex-wrap gap-2 content-start overflow-y-auto styled-scroll h-full">
      {teams.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-2 rounded-lg border border-line/10 pl-1 pr-3 h-9">
          <span className="w-7 h-7 rounded-md overflow-hidden flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: t.color }}>
            {t.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo_url} alt="" loading="lazy" className="w-full h-full object-cover" />
            ) : (
              t.name.slice(0, 2).toUpperCase()
            )}
          </span>
          <span className="text-[13px] font-semibold truncate max-w-[12rem]">{t.name}</span>
        </span>
      ))}
    </div>
  );
}

const TIER_ORDER = { legendary: 3, epic: 2, rare: 1, common: 0 } as const;

function FeaturedShowcase({ d, id }: { d: ShowcaseData; id: string | null }) {
  const box = useBox();
  const list = useMemo(() => d.achievements.filter((a) => a.unlocked), [d.achievements]);
  if (!d.stats) return <Empty>Achievements come with the next database update.</Empty>;
  // The one picked, else the rarest reached.
  const a = list.find((x) => x.id === id) ?? [...list].sort((x, y) => TIER_ORDER[y.tier] - TIER_ORDER[x.tier] || (y.at ?? "").localeCompare(x.at ?? ""))[0];
  if (!a) return <Empty>{d.isSelf ? "Reach an achievement and it can stand here." : "Nothing reached yet."}</Empty>;
  const size = Math.max(56, Math.min(104, box.h - 76, box.w - 40));
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-2">
      <span className="pf-featured">
        <AchievementBadge a={a} size={size} />
      </span>
      <div>
        <div className="font-display text-[17px] font-semibold leading-tight">{a.name}</div>
        <div className="text-[12px] text-ink-faint">
          <span className="pf-tier font-bold" data-tier={a.tier}>
            {TIER_LABEL[a.tier]}
          </span>{" "}
          · {shortDate(a.at)}
        </div>
      </div>
    </div>
  );
}
