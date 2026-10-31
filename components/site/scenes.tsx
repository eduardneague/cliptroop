import { CheckIcon, SearchIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import "./site.css";

/*
 * The feature pages' own demos (1.45.0), beside the home page's six (components/landing/vignettes.tsx): sample data,
 * nobody real. The same rules: server components, CSS motion (site.css, landing.css) that runs only while on screen
 * (<Play>), and the resting state is the finished frame, which is all that shows with animations off.
 */

type Css = React.CSSProperties & Record<`--${string}`, string>;
const d = (s: number, extra: Record<`--${string}`, string> = {}): Css => ({ "--d": `${s}s`, ...extra });

const PEOPLE = {
  ana: { name: "Ana", color: "#E8630D" },
  radu: { name: "Radu", color: "#2F56C2" },
  ioana: { name: "Ioana", color: "#158273" },
  mihai: { name: "Mihai", color: "#583AC8" },
  elena: { name: "Elena", color: "#B84070" },
} as const;
type Who = keyof typeof PEOPLE;

function Face({ who, className = "w-6 h-6 text-[10px]" }: { who: Who; className?: string }) {
  const p = PEOPLE[who];
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold text-white ring-2 ring-surface flex-shrink-0 ${className}`} style={{ background: p.color }} title={p.name}>
      {p.name[0]}
    </span>
  );
}

const card = "rounded-[22px] border border-line/10 bg-surface shadow-[0_24px_60px_-28px_rgb(var(--line)/0.35)]";
const chip = "inline-flex items-center gap-1 rounded-md px-2 h-6 text-[11px] font-semibold";

/* Long videos: six steps toward a date ------------------------------------------------------------------------------ */
const LONG_STEPS: { name: string; who: Who; done: boolean }[] = [
  { name: "Research", who: "ioana", done: true },
  { name: "Script", who: "ana", done: true },
  { name: "Filming", who: "mihai", done: true },
  { name: "Editing", who: "radu", done: false },
  { name: "Package", who: "elena", done: false },
  { name: "Posting", who: "ana", done: false },
];

export function LongVideoVignette() {
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[19px] font-semibold leading-tight">Street food, one night in Bucharest</div>
          <div className="mt-1 text-[12px] text-ink-soft">Long video · 18 minutes</div>
        </div>
        <span className={`${chip} bg-amber/12 text-amber whitespace-nowrap`}>Due Nov 14</span>
      </div>
      <ol className="mt-5 grid grid-cols-6 gap-1.5">
        {LONG_STEPS.map((s, i) => (
          <li key={s.name} className="flex flex-col items-center gap-1.5 text-center">
            <span className="relative w-full h-1.5 rounded-[3px] bg-line/10">
              {s.done ? <span className="ld-a ld-bar absolute inset-0 rounded-[3px] bg-green" style={d(i * 0.9)} /> : null}
              {i === 3 ? <span className="ld-a ld-bar absolute inset-y-0 left-0 w-[55%] rounded-[3px] bg-amber" style={d(2.9)} /> : null}
            </span>
            <Face who={s.who} className="w-7 h-7 text-[11px]" />
            <span className={`text-[10.5px] sm:text-[11.5px] font-semibold leading-tight ${i === 3 ? "text-amber" : s.done ? "text-ink" : "text-ink-faint"}`}>{s.name}</span>
            {s.done ? (
              <span className="ld-a ld-tick w-4 h-4 rounded-[5px] bg-green text-white flex items-center justify-center" style={d(i * 0.9 + 0.6)}>
                <CheckIcon className="w-3 h-3" />
              </span>
            ) : (
              <span className="w-4 h-4" aria-hidden />
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-xl bg-paper/70 border border-line/10 px-3 py-2.5 flex items-center gap-2.5 text-[12.5px]">
        <Face who="radu" className="w-6 h-6 text-[10px]" />
        <span className="min-w-0">
          <b>Radu</b> is editing. <span className="text-ink-soft">Elena packages it next and is told the moment it&rsquo;s done.</span>
        </span>
      </div>
    </div>
  );
}

/* Meetings: who's coming, then what happens next ---------------------------------------------------------------------- */
export function MeetingVignette() {
  const items: { who: Who; text: string; due: string }[] = [
    { who: "radu", text: "Recut the bakery intro", due: "Fri" },
    { who: "ana", text: "Script the Q&A", due: "Mon" },
    { who: "elena", text: "Three thumbnails for the tour", due: "Tue" },
  ];
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[19px] font-semibold leading-tight">Weekly planning</div>
          <div className="mt-1 text-[12px] text-ink-soft">Thursday, 18:00 · Discord</div>
        </div>
        <div className="flex -space-x-1.5">
          {(["ana", "radu", "ioana", "elena"] as Who[]).map((w) => (
            <Face key={w} who={w} />
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Answers">
        <span className={`${chip} bg-green/12 text-green`}>Going 3</span>
        <span className={`${chip} bg-gold/15 text-gold`}>Maybe 1</span>
        <span className={`${chip} bg-line/10 text-ink-soft`}>Can&rsquo;t 0</span>
      </div>
      <div className="mt-4 text-[11.5px] font-semibold text-ink-faint">Action items</div>
      <ul className="mt-2 space-y-2">
        {items.map((it, i) => (
          <li key={it.text} className="ld-a ld-pop flex items-center gap-2.5 text-[13px]" style={d(0.8 + i * 1.2)}>
            <Face who={it.who} />
            <span className="flex-1 min-w-0 truncate">{it.text}</span>
            <span className="text-[11.5px] text-ink-faint tabular-nums">{it.due}</span>
          </li>
        ))}
      </ul>
      <div className="ld-a ld-pop mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[rgb(43_33_24)] text-[rgb(246_240_228)] px-3 h-8 text-[12px] font-semibold" style={d(4.6)}>
        <CheckIcon className="w-3.5 h-3.5 text-amber" />
        In everyone&rsquo;s tasks, with their dates
      </div>
    </div>
  );
}

/* Objectives: rings that fill, one reached ------------------------------------------------------------------------- */
function Ring({ pct, label, value, delay, reached = false }: { pct: number; label: string; value: string; delay: number; reached?: boolean }) {
  const r = 34;
  const len = 2 * Math.PI * r;
  const off = len * (1 - Math.min(1, pct));
  return (
    <div className="flex flex-col items-center text-center gap-2">
      <span className="relative w-[92px] h-[92px]">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(var(--line) / 0.1)" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={reached ? "rgb(var(--green))" : "rgb(var(--amber))"}
            strokeWidth="8"
            strokeLinecap="round"
            className="ld-a st-ring"
            style={d(delay, { "--len": `${len}`, "--off": `${off}` })}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-[17px] font-semibold tabular-nums">{value}</span>
      </span>
      <span className="text-[11.5px] leading-tight text-ink-soft max-w-[8rem]">{label}</span>
    </div>
  );
}

export function ObjectivesVignette() {
  return (
    <div className={`${card} p-4 sm:p-6 relative overflow-hidden`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-display text-[19px] font-semibold">This week</div>
        <span className="text-[12px] text-ink-faint">Streak: 6 weeks</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Ring pct={1} label="Shorts posted" value="14/14" delay={0.3} reached />
        <Ring pct={0.78} label="Views on TikTok" value="78%" delay={0.7} />
        <Ring pct={0.5} label="Long videos this month" value="2/4" delay={1.1} />
      </div>
      <div className="ld-a ld-stamp absolute right-5 top-14 rounded-lg border-2 border-green text-green px-2.5 py-1 font-display text-[18px] font-semibold" style={d(0)}>
        Reached!
      </div>
      {[
        [12, 18, "#E8630D"],
        [30, 8, "#2F56C2"],
        [70, 14, "#158273"],
        [86, 26, "#B84070"],
        [52, 4, "#B4890E"],
      ].map(([x, y, c], i) => (
        <span key={i} className="ld-a ld-pop absolute w-2 h-2 rounded-[2px]" style={{ ...d(2.2 + i * 0.12), left: `${x}%`, top: `${y}%`, background: String(c) }} aria-hidden />
      ))}
    </div>
  );
}

/* Projections: the line so far, and where it lands -------------------------------------------------------------------- */
export function ProjectionVignette() {
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[19px] font-semibold leading-tight">200K subscribers by December 31</div>
          <div className="mt-1 text-[12px] text-ink-soft">YouTube · set on August 1</div>
        </div>
        <span className={`${chip} bg-green/12 text-green whitespace-nowrap`}>On pace</span>
      </div>
      <svg viewBox="0 0 320 120" className="mt-4 w-full h-auto" aria-hidden>
        <line x1="0" y1="20" x2="320" y2="20" stroke="rgb(var(--amber))" strokeDasharray="3 5" strokeWidth="1.5" />
        <text x="316" y="14" textAnchor="end" fontSize="10" fill="rgb(var(--amber))" fontWeight="700">
          200K
        </text>
        <path d="M0 104 C30 100 50 96 80 90 S130 76 160 70 S190 58 205 55" fill="none" stroke="rgb(var(--ink))" strokeWidth="2.5" className="ld-a ld-draw" />
        <path d="M205 55 L320 22" fill="none" stroke="rgb(var(--ink) / 0.45)" strokeWidth="2" strokeDasharray="5 5" className="ld-a ld-area" />
        <circle cx="205" cy="55" r="4.5" fill="rgb(var(--amber))" className="ld-a ld-pop" style={d(3.2)} />
        <line x1="205" y1="62" x2="205" y2="116" stroke="rgb(var(--line) / 0.25)" strokeWidth="1" />
        <text x="208" y="114" fontSize="10" fill="rgb(var(--ink-faint))">
          today
        </text>
      </svg>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
        <div className="rounded-lg bg-paper/70 px-2.5 py-2">
          <div className="text-ink-faint">Now</div>
          <div className="font-semibold tabular-nums">161,240</div>
        </div>
        <div className="rounded-lg bg-paper/70 px-2.5 py-2">
          <div className="text-ink-faint">Pace now</div>
          <div className="font-semibold tabular-nums">412 a day</div>
        </div>
        <div className="rounded-lg bg-paper/70 px-2.5 py-2">
          <div className="text-ink-faint">Needs</div>
          <div className="font-semibold tabular-nums">380 a day</div>
        </div>
      </div>
    </div>
  );
}

/* Media kit: the pages, fanned out ------------------------------------------------------------------------------------ */
export function MediaKitVignette() {
  const page = "absolute inset-0 rounded-[14px] border border-line/10 shadow-[0_18px_40px_-22px_rgb(0_0_0/0.45)] overflow-hidden";
  return (
    <div className={`${card} px-6 pt-8 pb-6 sm:px-8 sm:pt-10 overflow-hidden`}>
      <div className="relative mx-auto mb-10 w-[46%] max-w-[210px] aspect-[1/1.414]">
        {/* Brands. */}
        <div className={`${page} ld-a st-fan bg-white p-3.5`} style={d(0.3, { "--r": "9deg", "--x": "38%", "--y": "4%" })}>
          <div className="text-[9px] font-bold text-[#2b2118]">Brands we&rsquo;ve worked with</div>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {["#2F56C2", "#158273", "#E8630D", "#583AC8", "#B4890E", "#B84070"].map((c) => (
              <span key={c} className="h-6 rounded-[4px] bg-[#f3f1ec] flex items-center justify-center" aria-hidden>
                <span className="w-7 h-2.5 rounded-full" style={{ background: c, opacity: 0.85 }} />
              </span>
            ))}
          </div>
        </div>
        {/* At a glance. */}
        <div className={`${page} ld-a st-fan bg-[#fbfaf7] p-3.5`} style={d(0.15, { "--r": "-7deg", "--x": "-34%", "--y": "3%" })}>
          <div className="text-[9px] font-bold text-[#2b2118]">At a glance</div>
          <div className="mt-2 font-display text-[22px] font-semibold text-[#2b2118] leading-none">4.8M</div>
          <div className="text-[8px] text-[#6b6255]">views, last 90 days</div>
          <div className="mt-3 space-y-1.5">
            {[0.9, 0.62, 0.4].map((w, i) => (
              <span key={i} className="block h-2 rounded-[3px] bg-[#e7e3db]">
                <span className="block h-full rounded-[3px] bg-[#C55100]" style={{ width: `${w * 100}%` }} />
              </span>
            ))}
          </div>
        </div>
        {/* Cover. */}
        <div className={`${page} bg-[#2b2118] text-[#f6f0e4] p-4 flex flex-col justify-end`}>
          <span className="block w-10 h-[5px] rounded-[2px] ld-stripes-light" aria-hidden />
          <div className="mt-2 font-display text-[24px] font-semibold leading-[1.02]">
            Viverro
            <br />
            Tech Design
          </div>
          <div className="mt-1 text-[8.5px] text-[#f6f0e4]/70">Media kit · 2026</div>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-[12px] text-ink-soft">
        <span className={`${chip} bg-line/10 text-ink`}>PDF</span>
        Cover, At a glance, Audience, Videos, Brands, Rates
      </div>
    </div>
  );
}

/* Team and roles ------------------------------------------------------------------------------------------------------ */
export function TeamVignette() {
  const rows: { who: Who; roles: string[] }[] = [
    { who: "ana", roles: ["Master", "Scripter"] },
    { who: "radu", roles: ["Editor"] },
    { who: "ioana", roles: ["Researcher", "Scripter"] },
    { who: "mihai", roles: ["Filmer"] },
    { who: "elena", roles: ["Packager", "Scheduler"] },
  ];
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="font-display text-[19px] font-semibold">Viverro · 5 people</div>
      <ul className="mt-4 divide-y divide-line/10">
        {rows.map((r, i) => (
          <li key={r.who} className="flex items-center gap-3 py-2.5">
            <Face who={r.who} className="w-8 h-8 text-[12px]" />
            <span className="w-14 text-[13.5px] font-semibold">{PEOPLE[r.who].name}</span>
            <span className="flex flex-wrap gap-1.5">
              {r.roles.map((role, k) => (
                <span key={role} className={`${chip} ld-a ld-pop ${role === "Master" ? "bg-amber text-white" : "bg-line/10 text-ink-soft"}`} style={d(0.3 + i * 0.35 + k * 0.15)}>
                  {role}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="ld-a ld-pop mt-3 flex items-center gap-2 rounded-xl border border-dashed border-line/25 px-3 h-10 text-[12.5px] text-ink-soft" style={d(2.6)}>
        <span className="w-6 h-6 rounded-full border border-dashed border-line/40" aria-hidden />
        Invite sent with the Editor role
      </div>
    </div>
  );
}

/* Dashboard: the widgets ---------------------------------------------------------------------------------------------- */
export function DashboardVignette() {
  const w = "ld-a ld-pop rounded-xl border border-line/10 bg-paper/60 p-2.5";
  const word = [
    ["C", "g"],
    ["L", "y"],
    ["I", "g"],
    ["P", "x"],
    ["S", "x"],
  ];
  return (
    <div className={`${card} p-3 sm:p-4`}>
      <div className="grid grid-cols-6 gap-2">
        <div className={`${w} col-span-4`} style={d(0.2)}>
          <div className="text-[11px] font-semibold text-ink-faint">Today</div>
          {["Edit #231", "Review the bakery cut", "Thumbnails for the tour"].map((t, i) => (
            <div key={t} className="mt-1.5 flex items-center gap-2 text-[12px]">
              <span className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center ${i === 0 ? "bg-green text-white" : "border border-line/30"}`}>{i === 0 ? <CheckIcon className="w-2.5 h-2.5" /> : null}</span>
              <span className={i === 0 ? "line-through text-ink-faint" : ""}>{t}</span>
            </div>
          ))}
        </div>
        <div className={`${w} col-span-2`} style={d(0.45)}>
          <div className="text-[11px] font-semibold text-ink-faint">Weather</div>
          <div className="mt-1 font-display text-[22px] font-semibold leading-none">14°</div>
          <div className="text-[10.5px] text-ink-soft">Clear, good light</div>
        </div>
        <div className={`${w} col-span-3`} style={d(0.7)}>
          <div className="text-[11px] font-semibold text-ink-faint">Views, 7 days</div>
          <svg viewBox="0 0 100 30" className="mt-1 w-full h-8" aria-hidden>
            <path d="M0 26 L16 22 L32 24 L48 15 L64 17 L80 8 L100 4" fill="none" stroke="rgb(var(--amber))" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
          <div className="flex gap-1.5 text-ink-soft">
            {(["youtube", "tiktok", "instagram", "facebook"] as const).map((p) => (
              <PlatformIcon key={p} platform={p} className="w-3.5 h-3.5" />
            ))}
          </div>
        </div>
        <div className={`${w} col-span-3`} style={d(0.95)}>
          <div className="text-[11px] font-semibold text-ink-faint">Daily word</div>
          <div className="mt-1.5 flex gap-1">
            {word.map(([l, c], i) => (
              <span
                key={i}
                className={`w-6 h-6 rounded-[5px] flex items-center justify-center text-[11px] font-bold ${c === "g" ? "bg-green text-white" : c === "y" ? "bg-gold text-white" : "bg-line/15 text-ink-soft"}`}
              >
                {l}
              </span>
            ))}
          </div>
          <div className="mt-1 text-[10.5px] text-ink-soft">Ioana got it in 3</div>
        </div>
        <div className={`${w} col-span-6 flex items-center gap-2.5`} style={d(1.2)}>
          <span className="text-[11px] font-semibold text-ink-faint">Next meeting</span>
          <span className="text-[12px] font-semibold">Weekly planning, Thursday 18:00</span>
          <span className={`${chip} ml-auto bg-green/12 text-green`}>Going</span>
        </div>
      </div>
    </div>
  );
}

/* Profiles: XP, a level, achievements --------------------------------------------------------------------------------- */
export function ProfileVignette() {
  const cells = Array.from({ length: 7 * 26 }, (_, i) => {
    const v = (i * 37 + (i % 7) * 11) % 10;
    return v > 6 ? 3 : v > 4 ? 2 : v > 2 ? 1 : 0;
  });
  const shade = ["bg-line/10", "bg-green/30", "bg-green/60", "bg-green"];
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex items-center gap-3.5">
        <span className="relative">
          <span className="block w-14 h-14 rounded-full p-[3px] bg-[conic-gradient(from_200deg,#E8630D,#B4890E,#158273,#E8630D)]">
            <span className="w-full h-full rounded-full bg-[#2F56C2] text-white font-bold text-[18px] flex items-center justify-center ring-2 ring-surface">R</span>
          </span>
          <span className="absolute -bottom-1 -right-1 rounded-md bg-[rgb(43_33_24)] text-[rgb(246_240_228)] text-[10px] font-bold px-1.5 py-0.5 tabular-nums">23</span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-display text-[19px] font-semibold leading-tight">Radu</div>
          <div className="text-[12px] text-ink-soft">Editor · Viverro</div>
          <div className="mt-2 h-2 rounded-[3px] bg-line/10 overflow-hidden">
            <span className="ld-a ld-grow block h-full w-[68%] rounded-[3px] bg-amber" />
          </div>
          <div className="mt-1 text-[11px] text-ink-faint tabular-nums">2,040 of 3,000 XP to level 24</div>
        </div>
      </div>
      <div className="mt-4 grid grid-flow-col grid-rows-7 grid-cols-[repeat(26,minmax(0,1fr))] gap-[2px]" aria-hidden>
        {cells.map((c, i) => (
          <span key={i} className={`aspect-square rounded-[2px] ${shade[c]}`} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {["Hundred cuts", "Always on time", "First outlier"].map((a, i) => (
          <span key={a} className={`${chip} ld-a ld-pop bg-amber/12 text-amber`} style={d(2.4 + i * 0.4)}>
            {a}
          </span>
        ))}
      </div>
      <div className="ld-a ld-pop mt-3 inline-flex items-center rounded-lg bg-[rgb(43_33_24)] text-[rgb(246_240_228)] px-3 h-8 text-[12px] font-bold tabular-nums" style={d(1.4)}>
        +40 XP · Editing done, on time
      </div>
    </div>
  );
}

/* Search: the box, typed, and what it finds ---------------------------------------------------------------------------- */
export function SearchVignette() {
  const groups: { title: string; rows: { text: React.ReactNode; hint: string }[] }[] = [
    { title: "Videos", rows: [{ text: "Bakery tour, behind the counter", hint: "Long video" }] },
    {
      title: "Scripts",
      rows: [
        {
          text: (
            <>
              &hellip;the <mark className="bg-amber/25 text-ink rounded-[3px] px-0.5">bakery</mark> opens at five, before the sun&hellip;
            </>
          ),
          hint: "Script, page 2",
        },
      ],
    },
    { title: "Meetings", rows: [{ text: "Bakery shoot, Saturday 7:00", hint: "Action items: 3" }] },
  ];
  return (
    <div className={`${card} p-3 sm:p-4`}>
      <div className="flex items-center gap-2.5 rounded-xl border border-amber/40 bg-paper/70 px-3 h-11 shadow-[0_0_0_3px_rgb(var(--amber)/0.12)]">
        <SearchIcon className="w-4 h-4 text-ink-faint" />
        <span className="relative text-[14px] font-medium">
          <span className="ld-a ld-type inline-block">bakery</span>
        </span>
        <span className="ml-auto rounded-md border border-line/15 px-1.5 h-6 inline-flex items-center text-[11px] text-ink-faint">Ctrl K</span>
      </div>
      <div className="mt-3 space-y-3">
        {groups.map((g, gi) => (
          <div key={g.title} className="ld-a ld-pop" style={d(1.4 + gi * 0.35)}>
            <div className="px-1 text-[11px] font-semibold text-ink-faint">{g.title}</div>
            {g.rows.map((r) => (
              <div key={g.title} className={`mt-1 flex items-center gap-3 rounded-lg px-2.5 h-10 text-[12.5px] ${gi === 1 ? "bg-amber/10" : ""}`}>
                <span className="flex-1 min-w-0 truncate">{r.text}</span>
                <span className="text-[11px] text-ink-faint whitespace-nowrap">{r.hint}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="ld-a ld-pop px-1 text-[11px] text-ink-faint" style={d(2.6)}>
          Also: <span className="text-ink-soft">Dark mode</span>, <span className="text-ink-soft">Plan a meeting</span>, <span className="text-ink-soft">New short</span>
        </div>
      </div>
    </div>
  );
}

/* Your look: one screen, four themes ---------------------------------------------------------------------------------- */
const THEMES = [
  { name: "Ink", paper: "#EDEEE7", surface: "#FFFFFF", ink: "#14110C", accent: "#C55100" },
  { name: "Sakura", paper: "#FBEFF1", surface: "#FFFFFF", ink: "#3A1C24", accent: "#D9577A" },
  { name: "Pine", paper: "#E6EFE8", surface: "#F7FBF8", ink: "#10241A", accent: "#1F7A4D" },
  { name: "Nord", paper: "#1F2430", surface: "#272D3A", ink: "#E6E9EF", accent: "#88C0D0" },
] as const;

function MiniApp({ t }: { t: (typeof THEMES)[number] }) {
  return (
    <div className="absolute inset-0 rounded-[14px] overflow-hidden grid grid-cols-[28%_1fr]" style={{ background: t.paper, color: t.ink }}>
      <div className="p-2.5 space-y-1.5" style={{ background: `color-mix(in srgb, ${t.surface} 55%, ${t.paper})` }}>
        <span className="block h-2.5 w-3/4 rounded-[3px]" style={{ background: t.accent }} />
        {[0.9, 0.7, 0.8, 0.6, 0.75].map((x, i) => (
          <span key={i} className="block h-2 rounded-[3px]" style={{ width: `${x * 100}%`, background: t.ink, opacity: 0.18 }} />
        ))}
      </div>
      <div className="p-2.5 space-y-2">
        <div className="text-[11px] font-bold">{t.name}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-10 rounded-[6px] p-1.5" style={{ background: t.surface, boxShadow: `0 0 0 1px color-mix(in srgb, ${t.ink} 10%, transparent)` }}>
              <span className="block h-1.5 w-1/2 rounded-[2px]" style={{ background: t.ink, opacity: 0.25 }} />
              <span className="mt-1.5 block h-3 w-3/4 rounded-[3px]" style={{ background: i === 0 ? t.accent : t.ink, opacity: i === 0 ? 1 : 0.12 }} />
            </span>
          ))}
        </div>
        <span className="inline-flex items-center rounded-[6px] px-2 h-5 text-[9px] font-bold text-white" style={{ background: t.accent }}>
          Mark done
        </span>
      </div>
    </div>
  );
}

export function LookVignette() {
  return (
    <div className={`${card} p-4 sm:p-6`}>
      <div className="relative w-full max-w-[460px] mx-auto aspect-[16/10] [zoom:1.15]">
        <MiniApp t={THEMES[0]} />
        {THEMES.slice(1).map((t, i) => (
          <div key={t.name} className="ld-a st-theme absolute inset-0" style={d((i + 1) * 3)}>
            <MiniApp t={t} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
        {THEMES.map((t) => (
          <span key={t.name} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-2 h-7 text-[11.5px] font-semibold">
            <span className="w-3 h-3 rounded-full" style={{ background: t.accent }} />
            {t.name}
          </span>
        ))}
        <span className="text-[11.5px] text-ink-faint">and 16 more</span>
      </div>
    </div>
  );
}
