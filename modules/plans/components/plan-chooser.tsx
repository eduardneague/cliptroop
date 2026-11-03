"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { PLAN_IDS, PLAN_FACTS, gbLabel, planPrice, type PlanId } from "@/lib/plans";
import { PLANS } from "@/lib/site/plans";
import { requestPlan } from "@/app/(dashboard)/plan/actions";

/**
 * Choosing a team's plan (1.45.0): on the Plan page, and in place of every page of a team that has none yet (made by
 * someone who signed up on the website). Its masters pick Studio or Network and say a little about the team; ClipTroop
 * is told and sets the plan (Developer → Plans). Nothing is charged here. Everyone else on the team sees the plans and
 * that a master chooses.
 */
export type PlanInfo = {
  teamId: string;
  teamName: string;
  master: boolean;
  email: string;
  plan: PlanId | null;
  storageGb: number | null;
  requested: PlanId | null;
  requestedAt: string | null;
  note: string | null;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function PlanChooser({ info, gate = false }: { info: PlanInfo; gate?: boolean }) {
  const router = useRouter();
  const [pick, setPick] = useState<PlanId>(info.requested ?? (info.plan === "studio" ? "network" : "studio"));
  const [note, setNote] = useState(info.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<{ plan: PlanId; at: string } | null>(info.requested && info.requestedAt ? { plan: info.requested, at: info.requestedAt } : null);
  const pendingChange = asked && asked.plan !== info.plan ? asked : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await requestPlan(info.teamId, pick, note);
      if (r.error) {
        setError(r.error);
        return;
      }
      setAsked({ plan: pick, at: r.at ?? new Date().toISOString() });
      router.refresh();
    } catch {
      setError("Couldn't send it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 sm:px-8 py-8 sm:py-12 max-w-4xl mx-auto">
      <p className="text-[13px] font-semibold text-ink-soft">{info.teamName}</p>
      <h1 className="mt-1 font-display text-[28px] sm:text-[34px] leading-[1.1] font-semibold text-balance">
        {info.plan ? `${PLAN_FACTS[info.plan].name}, with ${gbLabel(info.storageGb ?? PLAN_FACTS[info.plan].storageGb)} of storage` : gate ? "Choose a plan to open your team" : "Choose your team's plan"}
      </h1>
      <p className="mt-3 text-[14.5px] text-ink-soft leading-relaxed max-w-2xl">
        {info.plan
          ? "Your team has every feature. To move to the other plan, or for more storage, ask below: we write back by email and change it once it's agreed."
          : "ClipTroop has no free plan or trial. Pick the plan that fits and tell us about your team: we write back by email to agree the details and send the invoice. Your team opens as soon as its plan is on."}
      </p>

      {pendingChange && (
        <p role="status" className="mt-5 rounded-xl border border-amber/30 [background-color:color-mix(in_srgb,rgb(var(--amber))_9%,rgb(var(--surface)))] px-4 py-3 text-[13.5px] leading-relaxed">
          You asked for <b>{PLAN_FACTS[pendingChange.plan].name}</b> on {day(pendingChange.at)}. We&rsquo;ll write to you{info.email ? <> at <b className="break-all">{info.email}</b></> : null}
          {info.plan ? "." : "; the team opens as soon as its plan is on."}
        </p>
      )}

      <form onSubmit={submit} className="mt-6">
        <fieldset disabled={!info.master || busy}>
          <legend className="sr-only">Plan</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {PLAN_IDS.map((id) => {
              const p = PLANS.find((x) => x.id === id)!;
              const price = planPrice(id, false);
              const yearly = planPrice(id, true);
              const current = info.plan === id;
              const chosen = pick === id;
              return (
                <label
                  key={id}
                  className={`relative block rounded-2xl border p-5 transition-colors ${info.master ? "cursor-pointer" : ""} ${
                    chosen && info.master ? "border-amber bg-surface shadow-[0_0_0_1px_rgb(var(--amber))]" : "border-line/15 bg-surface hover:border-line/30"
                  }`}
                >
                  <input type="radio" name="plan" value={id} checked={chosen} onChange={() => setPick(id)} className="sr-only peer" />
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-[20px] font-semibold">{p.name}</span>
                    {current ? <span className="text-[11.5px] font-bold uppercase tracking-wide text-green">Your plan</span> : null}
                  </span>
                  <span className="mt-1 block text-[13px] text-ink-soft">{p.for}</span>
                  <span className="mt-4 flex items-baseline gap-2 flex-wrap">
                    {price ? (
                      <>
                        <span className="font-display text-[34px] leading-none font-semibold tabular-nums">{price}</span>
                        <span className="text-[13px] text-ink-soft">a person, a month</span>
                      </>
                    ) : (
                      <span className="font-display text-[26px] leading-none font-semibold">Priced with you</span>
                    )}
                  </span>
                  <span className="mt-1 block text-[12.5px] text-ink-faint tabular-nums">{yearly ? `${yearly} a person, a month, billed yearly` : "For several teams, by agreement"}</span>
                  {/* Spans (a label holds phrasing content only), read as a list. */}
                  <span role="list" className="mt-4 block space-y-1.5">
                    {p.includes.map((x) => (
                      <span role="listitem" key={x} className="flex gap-2 text-[13px] leading-snug">
                        <CheckIcon className="w-4 h-4 mt-px flex-shrink-0 text-amber" />
                        <span>{x}</span>
                      </span>
                    ))}
                  </span>
                  <span className="absolute inset-0 rounded-2xl pointer-events-none peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber" aria-hidden />
                </label>
              );
            })}
          </div>

          {info.master ? (
            <div className="mt-6 max-w-2xl">
              <label htmlFor="plan-note" className="block text-[13px] font-semibold">
                Anything we should know? <span className="font-normal text-ink-faint">Optional</span>
              </label>
              <textarea
                id="plan-note"
                name="note"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoComplete="off"
                placeholder="How many people make your videos, which channels, when you'd like to start…"
                className="mt-1.5 w-full rounded-xl border border-line/15 bg-paper px-3.5 py-2.5 text-[14px] leading-relaxed outline-none focus:border-amber/60 resize-y"
              />
              {note.length > 800 ? <p className="mt-1 text-[12px] text-ink-faint tabular-nums">{1000 - note.length} characters left</p> : null}
              {error ? (
                <p role="alert" className="mt-3 rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5">
                  {error}
                </p>
              ) : null}
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <button
                  type="submit"
                  disabled={busy || info.plan === pick}
                  className="h-11 px-5 rounded-xl bg-amber text-white text-[14px] font-semibold inline-flex items-center gap-2 disabled:opacity-60 transition-opacity"
                >
                  {busy ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden /> : null}
                  {info.plan === pick ? "This is your plan" : pendingChange?.plan === pick ? `Ask for ${PLAN_FACTS[pick].name} again` : `Ask for ${PLAN_FACTS[pick].name}`}
                </button>
                <span className="text-[12.5px] text-ink-faint">Nothing is charged here.</span>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-[13.5px] text-ink-soft max-w-2xl">Only the team&rsquo;s masters choose its plan. Ask one of them, and the team opens for everyone once it&rsquo;s on.</p>
          )}
        </fieldset>
      </form>

      <p className="mt-8 text-[12.5px] text-ink-faint leading-relaxed max-w-2xl">
        Prices are in US dollars. Compare the plans in full on the{" "}
        <Link href="/pricing" className="font-semibold text-ink-soft hover:text-amber underline-offset-2 hover:underline">
          pricing page
        </Link>
        {gate ? (
          <>
            . Your account stays yours in{" "}
            <Link href="/settings" className="font-semibold text-ink-soft hover:text-amber underline-offset-2 hover:underline">
              Settings
            </Link>
            .
          </>
        ) : (
          "."
        )}
      </p>
    </div>
  );
}
