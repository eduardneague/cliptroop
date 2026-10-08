import { CheckIcon, PostingIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Count } from "./landing-client";

/*
 * The six scenes' little demos (sample data, nobody real). Server
 * components: the motion is CSS (landing.css), started and paused by
 * <Play>. Their resting state is the finished frame.
 */

type Css = React.CSSProperties & Record<`--${string}`, string>;
const d = (s: number): Css => ({ "--d": `${s}s` });

const PEOPLE = {
  ana: { name: "Ana", color: "#E8630D" },
  radu: { name: "Radu", color: "#2F56C2" },
  ioana: { name: "Ioana", color: "#158273" },
  mihai: { name: "Mihai", color: "#583AC8" },
} as const;
type Who = keyof typeof PEOPLE;

function Face({ who, className = "w-6 h-6 text-[10px]", style }: { who: Who; className?: string; style?: React.CSSProperties }) {
  const p = PEOPLE[who];
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold text-white ring-2 ring-surface flex-shrink-0 ${className}`} style={{ background: p.color, ...style }} title={p.name}>
      {p.name[0]}
    </span>
  );
}

const card = "rounded-[22px] border border-line/10 bg-surface shadow-[0_24px_60px_-28px_rgb(var(--line)/0.35)]";

/* 1. Plan --------------------------------------------------------------------- */
const PILLS: { day: number; kind: "short" | "long"; label: string; d: number }[] = [
  { day: 1, kind: "short", label: "#226", d: 0.2 },
  { day: 2, kind: "short", label: "#227", d: 0.35 },
  { day: 3, kind: "long", label: "Bakery tour", d: 0.5 },
  { day: 6, kind: "short", label: "#228", d: 0.65 },
  { day: 7, kind: "short", label: "#229", d: 0.8 },
  { day: 8, kind: "short", label: "#230", d: 0.95 },
  { day: 10, kind: "long", label: "Q&A", d: 1.1 },
  { day: 13, kind: "short", label: "#232", d: 1.25 },
  { day: 14, kind: "short", label: "#233", d: 1.4 },
  { day: 15, kind: "short", label: "#234", d: 1.55 },
  { day: 17, kind: "long", label: "Street food", d: 1.7 },
  { day: 20, kind: "short", label: "#235", d: 1.85 },
  { day: 21, kind: "short", label: "#236", d: 2 },
  { day: 22, kind: "short", label: "#237", d: 2.15 },
  { day: 24, kind: "long", label: "Studio vlog", d: 2.3 },
  { day: 27, kind: "short", label: "#238", d: 2.45 },
  { day: 28, kind: "short", label: "#239", d: 2.6 },
];
const OFF = [4, 11, 18, 25];

export function PlanVignette() {
  // October 2026 starts on a Thursday: 3 empty cells first (weeks start Monday).
  const lead = 3;
  const cells = Array.from({ length: 35 }, (_, i) => i - lead + 1);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-[19px] font-semibold">October</div>
        <div className="flex items-center gap-3 text-[11.5px] text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-short" /> Short
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-long" /> Long video
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-semibold text-ink-faint mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => (
          <span key={i}>{x}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          const pills = PILLS.filter((p) => p.day === day);
          const off = OFF.includes(day);
          const today = day === 8;
          return (
            <div
              key={i}
              className={`relative min-h-[52px] sm:min-h-[62px] rounded-lg p-1 text-left ${day < 1 || day > 31 ? "opacity-0" : "bg-surface-2/70"} ${today ? "ring-2 ring-amber" : ""}`}
            >
              {day >= 1 && day <= 31 && <span className={`block text-[10.5px] font-semibold ${today ? "text-amber" : "text-ink-faint"}`}>{day}</span>}
              {off && <span className="absolute inset-x-1 bottom-1 top-[18px] rounded-md ld-stripes-thin opacity-25" title="Day off" />}
              {pills.map((p) => (
                <span
                  key={p.label}
                  className={`ld-a ld-day-pill mt-0.5 block truncate rounded-[5px] px-1 text-[9.5px] sm:text-[10px] font-bold leading-[16px] text-white ${p.kind === "short" ? "bg-short" : "bg-long"}`}
                  style={d(p.d)}
                >
                  {p.label}
                </span>
              ))}
              {day === 29 && (
                // The pinned one being moved two days on.
                <span className="ld-a ld-day-move relative z-10 mt-0.5 block truncate rounded-[5px] px-1 text-[9.5px] sm:text-[10px] font-bold leading-[16px] text-white bg-short ring-2 ring-surface shadow-lg" style={{ "--dx": "calc(200% + 8px)" } as Css}>
                  #240
                </span>
              )}
              {day === 29 && (
                <svg viewBox="0 0 16 16" className="ld-a ld-cursor absolute left-5 top-7 z-20 w-4 h-4 drop-shadow" style={{ "--dx": "calc(200% + 8px)" } as Css} aria-hidden>
                  <path d="M2 1.5 L13 8.2 L8.2 9.1 L10.6 14 L8.6 14.9 L6.3 10 L2.6 13.2 Z" fill="white" stroke="rgb(var(--ld-ink))" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-soft">
        <span className="w-6 h-3 rounded-sm ld-stripes-thin opacity-50" /> Days off are skipped. Shorts in the queue get dated by themselves.
      </div>
    </div>
  );
}

/* 2. Script ------------------------------------------------------------------- */
export function ScriptVignette() {
  const lines = [
    { w: "92%", d: 0.2 },
    { w: "78%", d: 0.7 },
    { w: "86%", d: 1.2 },
    { w: "54%", d: 1.7 },
    { w: "88%", d: 2.2 },
    { w: "70%", d: 2.7 },
  ];
  const steps = [
    { name: "Script", who: "ana" as Who, d: 3.2 },
    { name: "Review", who: "radu" as Who, d: 4.6 },
    { name: "Staging", who: "ioana" as Who, d: 6.2 },
  ];
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-line/10">
        <span className="font-mono text-[12px] text-ink-faint">#231</span>
        <span className="font-semibold text-[14px] truncate">Why cats knock things over</span>
        <span className="flex-1" />
        <span className="hidden sm:flex -space-x-1.5">
          <Face who="ana" />
          <Face who="radu" />
        </span>
      </div>
      <div className="relative px-4 sm:px-5 pt-4 pb-5 grid grid-cols-[1fr_auto] gap-4">
        <div className="space-y-2.5 min-w-0">
          <div className="text-[11px] font-semibold text-ink-faint">Hook</div>
          {lines.map((l, i) => (
            <span key={i} className="ld-a ld-type block h-[9px] rounded-full bg-ink/15" style={{ width: l.w, ...d(l.d) }} />
          ))}
        </div>
        {/* A sketched editing idea. */}
        <div className="w-[88px] sm:w-[104px] aspect-[9/16] rounded-xl border border-dashed border-line/25 bg-surface-2/60 p-2 relative">
          <svg viewBox="0 0 60 100" className="w-full h-full text-ink/45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M8 70 h44" />
            <rect x="34" y="52" width="12" height="18" rx="2" />
            <path d="M14 70 q4 -16 12 -16 q6 0 6 8" />
            <circle cx="22" cy="46" r="6" />
            <path d="M18 41 l-2 -5 M26 41 l2 -5" />
            <path className="text-amber" stroke="rgb(var(--amber))" d="M38 46 q6 -10 12 -4" strokeDasharray="3 3" />
          </svg>
        </div>
        <div className="ld-a ld-pop absolute left-[16%] sm:left-[22%] top-[52%] max-w-[230px] rounded-xl rounded-tl-sm bg-surface border border-line/15 shadow-xl px-3 py-2 flex gap-2" style={d(1.9)}>
          <Face who="radu" className="w-5 h-5 text-[9px]" />
          <span className="text-[12px] leading-snug">
            <b>Radu</b> Open on the cat already on the shelf.
          </span>
        </div>
      </div>
      <div className="border-t border-line/10 px-4 sm:px-5 py-3 flex items-center gap-2 flex-wrap">
        {steps.map((s, i) => (
          <span key={s.name} className="inline-flex items-center gap-2">
            {i > 0 && <span className="w-5 h-px bg-line/25" />}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line/15 pl-1 pr-2.5 h-8 text-[12.5px] font-semibold">
              <span className="relative w-6 h-6">
                <Face who={s.who} className="w-6 h-6 text-[10px] ring-0" />
                <span className="ld-a ld-tick absolute -right-1 -bottom-1 w-3.5 h-3.5 rounded-full bg-green text-white grid place-items-center ring-2 ring-surface" style={d(s.d)}>
                  <CheckIcon className="w-2 h-2" />
                </span>
              </span>
              {s.name}
            </span>
          </span>
        ))}
        <span className="ld-a ld-pop ml-auto rounded-full bg-amber/12 text-amber px-3 h-7 inline-flex items-center text-[12px] font-bold" style={d(4.9)}>
          Radu, it&rsquo;s your turn
        </span>
      </div>
    </div>
  );
}

/* 3. Film & edit -------------------------------------------------------------- */
const STAGES: { name: string; who: Who }[] = [
  { name: "Script", who: "ana" },
  { name: "Editing", who: "ioana" },
  { name: "In review", who: "radu" },
  { name: "Ready", who: "mihai" },
  { name: "Posted", who: "mihai" },
];

export function PipelineVignette() {
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="ld-strip relative rounded-xl py-[22px] px-2">
        <div className="relative grid grid-cols-5">
          {/* The short riding along. */}
          <div className="ld-a ld-rider absolute inset-y-0 left-0 w-1/5 p-1">
            <div className="h-full rounded-lg ring-[3px] ring-amber bg-amber/10" />
          </div>
          {STAGES.map((s, i) => (
            <div key={s.name} className="relative p-1">
              <div className="h-[104px] sm:h-[120px] rounded-lg bg-white/[0.04] border border-white/10 flex flex-col items-center justify-center gap-2 px-1 text-center">
                <Face who={s.who} className="ld-a ld-who w-7 h-7 text-[11px] ring-0" style={d(i * 2)} />
                <span className="ld-a ld-stage text-[10.5px] sm:text-[12px] font-bold leading-tight" style={{ ...d(i * 2), color: "rgb(var(--ld-chalk) / 0.85)" }}>
                  {s.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <span className="w-12 h-[72px] rounded-md overflow-hidden relative bg-gradient-to-b from-sky-300 to-amber/70">
          <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-4 rounded-t-full bg-[rgb(43_33_24)]" />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate">
            <span className="font-mono text-ink-faint mr-1.5">#231</span>Why cats knock things over
          </div>
          <div className="text-[12px] text-ink-soft">Each step has its person. Done moves it on and tells the next one.</div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-amber text-white px-3 h-8 text-[12px] font-bold">
          <CheckIcon className="w-3.5 h-3.5" />
          Mark done
        </span>
      </div>
    </div>
  );
}

/* 4. Review ------------------------------------------------------------------- */
const NOTES: { at: number; tc: string; who: Who; text: string; d: number }[] = [
  { at: 22, tc: "0:04.2", who: "radu", text: "Cut here, it drags.", d: 1.5 },
  { at: 48, tc: "0:09.6", who: "ana", text: "Captions bigger please", d: 3.3 },
  { at: 74, tc: "0:14.1", who: "radu", text: "Love this beat", d: 5.1 },
];

export function ReviewVignette() {
  return (
    <div className={`${card} p-4 sm:p-5 grid grid-cols-[minmax(0,150px)_1fr] sm:grid-cols-[180px_1fr] gap-4 sm:gap-5`}>
      <div>
        {/* A vertical cut, drawn. */}
        <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gradient-to-b from-[#F7C59F] via-[#F2A35E] to-[#7A4B2A]">
          <span className="absolute left-[18%] right-[18%] top-[56%] h-[7%] rounded bg-[#4A2F1C]" />
          <span className="absolute left-[30%] top-[40%] w-[30%] aspect-square rounded-full bg-[#2B2118]" />
          <span className="absolute left-[30%] top-[36%] w-[9%] aspect-square rotate-45 bg-[#2B2118]" />
          <span className="absolute left-[51%] top-[36%] w-[9%] aspect-square rotate-45 bg-[#2B2118]" />
          <span className="absolute right-[16%] top-[48%] w-[12%] h-[8%] rounded-sm bg-[#FFF4E6]" />
          <span className="absolute inset-x-3 bottom-3 rounded-md bg-black/45 text-white text-[10px] font-bold text-center py-1">wait for it…</span>
          <span className="ld-a ld-stamp absolute left-1/2 top-[18%] -translate-x-1/2 rounded-md border-[3px] border-green text-green bg-white/85 px-2 py-0.5 font-display font-bold text-[18px] uppercase tracking-wide">
            Approved
          </span>
        </div>
        <div className="relative mt-3 h-1.5 rounded-full bg-line/15">
          <span className="ld-a ld-progress absolute inset-0 rounded-full bg-amber" />
          <span className="ld-a ld-playhead absolute -top-1 w-3.5 h-3.5 -ml-[7px] rounded-full bg-amber ring-2 ring-surface" style={{ left: "100%" }} />
          {NOTES.map((n) => (
            <span key={n.tc} className="ld-a ld-pin absolute -top-[15px] w-2.5 h-2.5 rounded-full rounded-br-none rotate-45 ring-2 ring-surface" style={{ left: `${n.at}%`, background: PEOPLE[n.who].color, transform: "translate(-50%, 0)", ...d(n.d) }} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-faint">
          <span>0:00</span>
          <span>0:19</span>
        </div>
      </div>
      <div className="min-w-0 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-md bg-surface-2 px-2 h-6 inline-flex items-center text-[11.5px] font-bold">v3</span>
          <span className="text-[12px] text-ink-soft truncate">compared with v2</span>
        </div>
        <ul className="space-y-2">
          {NOTES.map((n) => (
            <li key={n.tc} className="ld-a ld-pop rounded-xl border border-line/10 bg-surface-2/60 px-3 py-2 flex gap-2.5" style={d(n.d)}>
              <Face who={n.who} className="w-6 h-6 text-[10px]" />
              <span className="min-w-0">
                <span className="block font-mono text-[11px] text-amber font-semibold">{n.tc}</span>
                <span className="block text-[12.5px] leading-snug">{n.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <span className="mt-auto pt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-green">
          <CheckIcon className="w-3.5 h-3.5" />
          Approved on the third cut
        </span>
      </div>
    </div>
  );
}

/* 5. Post --------------------------------------------------------------------- */
const LANES: { p: "youtube" | "instagram" | "tiktok"; name: string; d: number; dur: string }[] = [
  { p: "youtube", name: "YouTube", d: 0, dur: "9s" },
  { p: "instagram", name: "Instagram", d: 0.5, dur: "9s" },
  { p: "tiktok", name: "TikTok", d: 1, dur: "9s" },
];

export function PostVignette() {
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold truncate">
            <span className="font-mono text-ink-faint mr-1.5">#231</span>Why cats knock things over
          </div>
          <div className="text-[12px] text-ink-soft">Scheduled for Friday, 17:00</div>
        </div>
        <span className="ld-a ld-press inline-flex items-center gap-2 rounded-xl bg-amber text-white px-3.5 h-10 text-[13px] font-bold whitespace-nowrap">
          <PostingIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Post everywhere now</span>
          <span className="sm:hidden">Post now</span>
        </span>
      </div>
      <ul className="space-y-2.5">
        {LANES.map((l) => (
          <li key={l.p} className="rounded-xl bg-surface-2/60 border border-line/10 px-3 py-2.5 flex items-center gap-3">
            <PlatformIcon platform={l.p} className="w-8 h-8 rounded-lg flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="font-semibold">{l.name}</span>
                <span className="relative h-5 w-20 text-right">
                  <span className="ld-a ld-pending absolute inset-0 text-ink-soft" style={d(l.d)}>
                    Uploading
                  </span>
                  <span className="ld-a ld-live absolute inset-0 inline-flex items-center justify-end gap-1 text-green font-bold" style={d(l.d)}>
                    <CheckIcon className="w-3.5 h-3.5" />
                    Live
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-line/10 overflow-hidden">
                <span className="ld-a ld-bar block h-full rounded-full bg-amber" style={d(l.d)} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* 6. Measure ------------------------------------------------------------------ */
const COUNTRIES = [
  ["Romania", 41],
  ["Moldova", 12],
  ["Italy", 8],
  ["Spain", 6],
] as const;

export function MeasureVignette() {
  const pts = [8, 22, 18, 34, 30, 46, 41, 58, 55, 70, 66, 84];
  const w = 300;
  const h = 110;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - (v / 90) * h] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {[
          { label: "Views", v: 1284000 },
          { label: "Watch hours", v: 9420 },
          { label: "New followers", v: 3180 },
        ].map((k) => (
          <div key={k.label} className="rounded-xl bg-surface-2/60 border border-line/10 px-3 py-2.5">
            <div className="text-[11px] text-ink-soft">{k.label}</div>
            <div className="font-display text-[19px] sm:text-[22px] font-semibold leading-tight">
              <Count to={k.v} />
            </div>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px] overflow-visible" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="ld-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--amber))" stopOpacity="0.28" />
            <stop offset="1" stopColor="rgb(var(--amber))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke="rgb(var(--line) / 0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path className="ld-a ld-area" d={area} fill="url(#ld-area)" />
        <path className="ld-a ld-draw" d={line} fill="none" stroke="rgb(var(--amber))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <ul className="mt-4 space-y-1.5">
        {COUNTRIES.map(([c, v], i) => (
          <li key={c} className="grid grid-cols-[72px_1fr_36px] items-center gap-2 text-[12px]">
            <span className="text-ink-soft">{c}</span>
            <span className="h-2 rounded-full bg-line/10 overflow-hidden">
              <span className="ld-a ld-grow block h-full rounded-full bg-amber/80" style={{ width: `${(v / 41) * 100}%`, ...d(0.3 + i * 0.25) }} />
            </span>
            <span className="text-right tabular-nums font-semibold">{v}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Phone ----------------------------------------------------------------------- */
export function PhoneVignette() {
  const notes = [
    { who: "ana" as Who, title: "Ana sent #231 to review", text: "It's your turn: Why cats knock things over", d: 0.4 },
    { who: "mihai" as Who, title: "#231 is live on TikTok", text: "Posted at 17:00, as planned", d: 2.2 },
    { who: "radu" as Who, title: "Weekly planning in 1 hour", text: "Studio, 11:00. 3 action items on the agenda", d: 4 },
  ];
  return (
    <div className="relative mx-auto w-[260px] sm:w-[290px] aspect-[9/19] rounded-[44px] bg-[rgb(43_33_24)] p-[10px] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.55)]">
      <div className="relative h-full rounded-[36px] overflow-hidden bg-gradient-to-b from-[#3A2C20] via-[#5A3A22] to-[#E8630D]">
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-black" />
        <div className="pt-14 text-center text-white">
          <div className="text-[13px] font-semibold opacity-80">Friday 9 October</div>
          <div className="font-display text-[54px] leading-none font-semibold tracking-tight">16:58</div>
        </div>
        <ul className="absolute inset-x-2.5 top-[40%] space-y-2">
          {notes.map((n) => (
            <li key={n.title} className="ld-a ld-note rounded-2xl bg-white/80 backdrop-blur px-3 py-2.5 flex gap-2.5 text-[#2B2118]" style={d(n.d)}>
              <span className="w-8 h-8 rounded-lg bg-[#FFF4E6] grid place-items-center flex-shrink-0 overflow-hidden">
                <svg viewBox="18 20 84 84" className="w-7 h-7" aria-hidden>
                  <rect x="30" y="50" width="60" height="50" rx="10" fill="#FFF4E6" stroke="#2B2118" strokeWidth="3.4" />
                  <rect x="29" y="38" width="62" height="10" rx="3" fill="#E8630D" stroke="#2B2118" strokeWidth="2.8" />
                  <ellipse cx="48" cy="77" rx="3.6" ry="4.6" fill="#2B2118" />
                  <ellipse cx="72" cy="77" rx="3.6" ry="4.6" fill="#2B2118" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-bold leading-tight">{n.title}</span>
                <span className="block text-[11.5px] leading-snug opacity-75 truncate">{n.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
