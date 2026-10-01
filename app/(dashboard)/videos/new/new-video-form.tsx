"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createProject } from "./actions";
import { ArrowLeftIcon, CloseIcon, PlusIcon } from "@/components/ui/icons";
import { DatePicker } from "@/components/ui/date-picker";
import { KindIcon } from "@/components/ui/kind-icon";
import { PersonSelect, type PersonKind } from "@/modules/short-videos/components/person-select";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";

const TYPES = ["Hub", "Help", "Hero"];
const STEPS: { stage: "research" | "script" | "film" | "edit" | "package" | "publish"; label: string; kind: PersonKind }[] = [
  { stage: "research", label: "Researcher", kind: "researcher" },
  { stage: "script", label: "Scripter", kind: "scripter" },
  { stage: "film", label: "Filmer", kind: "filmer" },
  { stage: "edit", label: "Editor", kind: "editor" },
  { stage: "package", label: "Packager", kind: "packager" },
  { stage: "publish", label: "Scheduler", kind: "scheduler" },
];
const PLATFORMS = [
  { id: "youtube", name: "YouTube" },
  { id: "facebook", name: "Facebook" },
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
];

const field = "w-full rounded-xl border border-line/15 bg-surface px-3.5 h-11 text-[14px] outline-none focus:ring-2 focus:ring-amber transition-shadow";
const label = "block text-[12px] font-semibold text-ink-soft mb-1.5";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
        {hint && <p className="text-[12.5px] text-ink-faint mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * New long video: the Ideate template (titles, type, theme, hook), when,
 * who works on each step (pre-filled with the team defaults) and where it
 * goes. Every field lives in state, so nothing typed is ever lost if the
 * submission fails.
 */
export function NewVideoForm({
  people,
  defaults,
}: {
  people: TeamPerson[];
  defaults: Record<"research" | "script" | "film" | "edit" | "package" | "publish", string | null>;
}) {
  const [state, formAction, pending] = useActionState(createProject, undefined);
  const [types, setTypes] = useState<string[]>([]);
  const [theme, setTheme] = useState("");
  const [subtheme, setSubtheme] = useState("");
  const [titles, setTitles] = useState<string[]>(["", ""]);
  const [picked, setPicked] = useState(0);
  const [hook, setHook] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [crew, setCrew] = useState(defaults);
  const [platforms, setPlatforms] = useState<string[]>(["youtube"]);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-3xl mx-auto">
      <Link href="/videos" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-4">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Long videos
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <KindIcon kind="long" tile className="w-5 h-5" />
        <h1 className="text-[26px] sm:text-[30px] font-display font-semibold leading-tight">New long video</h1>
      </div>

      <form action={formAction} className="space-y-5">
        <Section title="Titles" hint="2 to 5 options. Pick the main one: it becomes the video's name.">
          <div className="space-y-2">
            {titles.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPicked(i)}
                  aria-pressed={picked === i}
                  title="Use as the main title"
                  className={`flex-shrink-0 rounded-lg px-2.5 h-11 text-[12px] font-bold transition-colors ${picked === i ? "bg-amber text-white" : "border border-line/20 text-ink-soft hover:text-ink"}`}
                >
                  {picked === i ? "Main" : i + 1}
                </button>
                <input
                  name="titles"
                  value={t}
                  onChange={(e) => setTitles((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                  maxLength={100}
                  placeholder={i === 0 ? "I Tested a $200 Fake iPhone…" : "Another title"}
                  className={field}
                />
                {titles.length > 2 && (
                  <button
                    type="button"
                    aria-label="Remove this title"
                    onClick={() => {
                      setTitles((all) => all.filter((_, j) => j !== i));
                      setPicked((p) => (p === i ? 0 : p > i ? p - 1 : p));
                    }}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <input type="hidden" name="pickedTitle" value={picked} />
            {titles.length < 5 && (
              <button type="button" onClick={() => setTitles((t) => [...t, ""])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line/25 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink">
                <PlusIcon className="w-3.5 h-3.5" />
                Add a title
              </button>
            )}
          </div>
        </Section>

        <Section title="Idea">
          <div>
            <span className={label}>Type</span>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <label key={t} className={`cursor-pointer rounded-full border px-4 h-10 inline-flex items-center text-[13.5px] font-semibold transition-colors ${types.includes(t) ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}>
                  <input type="checkbox" name="type" value={t} checked={types.includes(t)} onChange={() => setTypes((all) => (all.includes(t) ? all.filter((x) => x !== t) : [...all, t]))} className="sr-only" />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Theme</span>
              <input name="theme" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="TECH" className={field} />
            </label>
            <label className="block">
              <span className={label}>Subtheme (optional)</span>
              <input name="subtheme" value={subtheme} onChange={(e) => setSubtheme(e.target.value)} placeholder="Scam help" className={field} />
            </label>
          </div>
          <label className="block">
            <span className={label}>Hook</span>
            <textarea
              name="hook"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              rows={3}
              placeholder="This is an iPhone 17 Pro Max, and this is another one. One of them is fake…"
              className={`${field} h-auto py-3 resize-y`}
            />
          </label>
        </Section>

        <Section title="When and where">
          <div>
            <span className={label}>Expected date (optional)</span>
            <input type="hidden" name="expected_date" value={date ?? ""} />
            <div className="flex items-center gap-2">
              <DatePicker value={date ?? ""} onChange={setDate} ariaLabel="Expected date" triggerClassName={`${field} text-left inline-flex items-center w-auto px-4`}>
                {date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Pick a date"}
              </DatePicker>
              {date && (
                <button type="button" onClick={() => setDate(null)} className="text-[13px] font-semibold text-ink-soft hover:text-ink">
                  Clear
                </button>
              )}
            </div>
          </div>
          <div>
            <span className={label}>Where it goes</span>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const on = platforms.includes(p.id);
                return (
                  <label key={p.id} className={`cursor-pointer inline-flex items-center gap-2 rounded-full border pl-1.5 pr-3.5 h-10 text-[13.5px] font-semibold transition-colors ${on ? "border-amber/50 bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}>
                    <input
                      type="checkbox"
                      name="platforms"
                      value={p.id}
                      checked={on}
                      onChange={() => setPlatforms((all) => (all.includes(p.id) ? (all.length > 1 ? all.filter((x) => x !== p.id) : all) : [...all, p.id]))}
                      className="sr-only"
                    />
                    <PlatformIcon platform={p.id as "youtube"} className={`w-7 h-7 rounded-full ${on ? "" : "opacity-50 grayscale"}`} />
                    {p.name}
                  </label>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="People" hint="Pre-filled with the team's defaults (Team → Defaults). They're notified when their step starts.">
          <div className="grid gap-3 sm:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.stage}>
                <span className={label}>{s.label}</span>
                <PersonSelect kind={s.kind} people={people} value={crew[s.stage]} onChange={(v) => setCrew((c) => ({ ...c, [s.stage]: v }))} />
                <input type="hidden" name={`person_${s.stage}`} value={crew[s.stage] ?? ""} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Notes" hint="Optional.">
          <label className="block">
            <span className={label}>Notes</span>
            <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="EDU: must research fake iPhones" className={`${field} h-auto py-3 resize-y`} />
          </label>
          <label className="block">
            <span className={label}>Budget</span>
            <textarea name="budget_notes" value={budget} onChange={(e) => setBudget(e.target.value)} rows={2} placeholder="Fake iPhone 17 Pro Max: 1000 to 1500 RON" className={`${field} h-auto py-3 resize-y`} />
          </label>
        </Section>

        {state?.error && (
          <p role="alert" className="rounded-xl border border-red/30 bg-red/10 text-red text-[13.5px] px-4 py-3">
            {state.error}
          </p>
        )}
        <div className="flex items-center gap-2 sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:bottom-4 z-10">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-6 h-12 text-[15px] shadow-[0_10px_30px_-10px_rgb(var(--amber)/0.7)] hover:brightness-105 disabled:opacity-60"
          >
            {pending && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Create video
          </button>
          <Link href="/videos" className="rounded-xl border border-line/15 bg-surface px-5 h-12 inline-flex items-center text-[14px] font-semibold text-ink-soft hover:text-ink">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
