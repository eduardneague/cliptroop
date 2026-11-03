"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { DateChip } from "@/components/ui/date-picker";
import { SettingsIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";
import type { PipelineStage } from "@/lib/permissions/roles";
import { AssigneeRow, ScriptersRow } from "./assignee-row";
import { renameLongVideo, setLongPlatforms, updateExpectedDate, updateTypeTheme } from "./actions";
import { cleanName, NameField } from "@/components/ui/editable-title";
import { FORM_LIMITS } from "@/lib/form-limits";
import { setLongInAppReview } from "./review/actions";

type Assignee = { rowId: string; teamMemberId: string; name: string; color: string };
const TYPES = ["Hub", "Help", "Hero"];
const PLATFORMS = [
  { id: "youtube", name: "YouTube" },
  { id: "facebook", name: "Facebook" },
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
];
const STEPS: { stage: PipelineStage; label: string }[] = [
  { stage: "research", label: "Researcher" },
  { stage: "script", label: "Scripters" },
  { stage: "film", label: "Filmer" },
  { stage: "edit", label: "Editor" },
  { stage: "package", label: "Packager" },
  { stage: "publish", label: "Scheduler" },
];
const field = "w-full rounded-xl border border-line/15 bg-surface px-3.5 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber";
const label = "block text-[12px] font-semibold text-ink-soft mb-1.5";

/**
 * Long video settings: everything chosen when it was created, its name
 * first (1.33.1). People changes notify whoever is newly tagged (assigning
 * sends it). A name still being typed is saved when the window closes.
 */
export function LongVideoSettings({
  projectId,
  teamId,
  title,
  videoType,
  theme: theme0,
  subtheme: subtheme0,
  expectedDate,
  platforms: platforms0,
  people,
  assignees,
  scripterIds,
  inAppReview: inApp0 = null,
  teamInAppReview = false,
}: {
  projectId: string;
  teamId: string;
  title: string;
  videoType: string[];
  theme: string;
  subtheme: string | null;
  expectedDate: string | null;
  platforms: string[];
  people: TeamPerson[];
  assignees: Record<string, Assignee[]>;
  scripterIds: string[];
  /** Review in ClipTroop: this video's own choice (null = the team's). */
  inAppReview?: boolean | null;
  /** The team's choice (Team → Defaults). */
  teamInAppReview?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [types, setTypes] = useState(videoType);
  const [theme, setTheme] = useState(theme0);
  const [subtheme, setSubtheme] = useState(subtheme0 ?? "");
  const [platforms, setPlatforms] = useState(platforms0);
  const [inApp, setInApp] = useState<boolean | null>(inApp0);
  const [name, setName] = useState(title);
  // The name as saved: the page's, or the one just saved here (before the page catches up).
  const [savedName, setSavedName] = useState(title);
  useEffect(() => setSavedName(title), [title]);
  const [naming, startNaming] = useTransition();
  const rename = (next: string) =>
    startNaming(async () => {
      const r = await renameLongVideo(projectId, next);
      if (r.error) toast.error(r.error);
      else {
        setSavedName(next);
        toast.success(`Renamed to “${next}”`);
        router.refresh();
      }
    });
  const close = () => {
    const next = cleanName(name);
    if (next && next !== savedName && !naming) rename(next);
    setOpen(false);
  };
  const dirty = types.join() !== videoType.join() || theme !== theme0 || subtheme !== (subtheme0 ?? "");

  const run = (fn: () => Promise<{ error?: string } | object | undefined>, ok: string) =>
    start(async () => {
      const r = (await fn()) as { error?: string } | undefined;
      if (r?.error) toast.error(r.error);
      else {
        toast.success(ok);
        router.refresh();
      }
    });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(savedName);
          setOpen(true);
        }}
        aria-label="Video settings"
        title="Video settings"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
      >
        <SettingsIcon className="w-[18px] h-[18px]" />
      </button>
      <Dialog open={open} onClose={close} title="Video settings" description="Everything set when the video was created." width="sm:max-w-2xl">
        <div className="space-y-6">
          <section>
            <span className={label}>Name</span>
            <NameField value={name} saved={savedName} onChange={setName} onSave={() => rename(cleanName(name))} max={FORM_LIMITS.videoTitle} pending={naming} />
          </section>

          <section className="space-y-3 pt-5 border-t border-line/10">
            <div>
              <span className={label}>Type</span>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={types.includes(t)}
                    onClick={() => setTypes((all) => (all.includes(t) ? all.filter((x) => x !== t) : [...all, t]))}
                    className={`rounded-lg border px-4 h-9 text-[13px] font-semibold transition-colors ${types.includes(t) ? "border-amber bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Theme</span>
                <input value={theme} onChange={(e) => setTheme(e.target.value)} className={field} />
              </label>
              <label className="block">
                <span className={label}>Subtheme</span>
                <input value={subtheme} onChange={(e) => setSubtheme(e.target.value)} className={field} />
              </label>
            </div>
            {dirty && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => updateTypeTheme(projectId, teamId, types, theme, subtheme), "Saved")}
                className="rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px] disabled:opacity-60"
              >
                Save type and theme
              </button>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2 pt-5 border-t border-line/10">
            <div>
              <span className={label}>Expected date</span>
              <DateChip
                value={expectedDate}
                onChange={(d) => run(() => updateExpectedDate(projectId, teamId, d), "Date changed")}
                onClear={() => run(() => updateExpectedDate(projectId, teamId, ""), "Date cleared")}
                ariaLabel="Expected date"
              />
            </div>
            <div>
              <span className={label}>Where it goes</span>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => {
                  const on = platforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      title={p.name}
                      onClick={() => {
                        const next = on ? platforms.filter((x) => x !== p.id) : [...platforms, p.id];
                        if (!next.length) return toast.error("Keep at least one platform.");
                        setPlatforms(next);
                        run(() => setLongPlatforms(projectId, next), "Platforms updated");
                      }}
                      className={`rounded-lg p-0.5 border transition-colors ${on ? "border-amber" : "border-transparent opacity-45 grayscale hover:opacity-80"}`}
                    >
                      <PlatformIcon platform={p.id as "youtube"} className="w-8 h-8 rounded-md" />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="pt-5 border-t border-line/10">
            <span className={label}>Review</span>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-line/15 p-1" role="radiogroup" aria-label="Review">
              {([
                [null, `Like the team (${teamInAppReview ? "in ClipTroop" : "outside"})`],
                [true, "In ClipTroop"],
                [false, "Outside ClipTroop"],
              ] as const).map(([v, text]) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={inApp === v}
                  disabled={pending}
                  onClick={() => {
                    if (inApp === v) return;
                    const before = inApp;
                    setInApp(v);
                    start(async () => {
                      const r = await setLongInAppReview(projectId, v);
                      if (r.error !== undefined) {
                        setInApp(before);
                        toast.error(r.error);
                      } else {
                        toast.success("Review setting saved");
                        router.refresh();
                      }
                    });
                  }}
                  className={`rounded-lg px-3 h-8 text-[12.5px] font-semibold transition-colors ${inApp === v ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
                >
                  {text}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-ink-faint mt-2">In ClipTroop, the editor uploads the edit here and the master leaves notes on it before approving.</p>
          </section>

          <section className="pt-5 border-t border-line/10">
            <div className="text-[12px] font-semibold text-ink-soft mb-3">People</div>
            <div className="space-y-3">
              {STEPS.map((s) => (
                <div key={s.stage} className="grid sm:grid-cols-[7.5rem_1fr] gap-1.5 sm:gap-3 items-center">
                  <span className="text-[13px] font-semibold">{s.label}</span>
                  {s.stage === "script" ? (
                    <ScriptersRow projectId={projectId} people={people} scripterIds={scripterIds} isMaster />
                  ) : (
                    <AssigneeRow projectId={projectId} stage={s.stage} isMaster assignees={assignees[s.stage] ?? []} people={people} />
                  )}
                </div>
              ))}
            </div>
            <p className="text-[12px] text-ink-faint mt-3">Whoever you add is notified right away.</p>
          </section>
        </div>
      </Dialog>
    </>
  );
}
