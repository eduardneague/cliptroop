"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/ui/icons";
import type { Plan } from "@/lib/site/plans";

/**
 * Pricing's plans (1.46.0): monthly or yearly, and how many people, with what the team pays worked out as you choose.
 * The owner: "make the pricing page much more beautiful … take up the entire space of the wrapper". The numbers move
 * to their new value (straight there with animations off); the plans are lib/site/plans.ts.
 */

const MAX_PEOPLE = 50;
const money = (n: number, currency: string) => `${currency}${Math.round(n).toLocaleString("en-US")}`;

function lessMotion() {
  if (typeof window === "undefined") return true;
  const m = document.documentElement.dataset.motion;
  if (m === "off") return true;
  if (m === "on") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A number that glides to its new value. */
function Tween({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || lessMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 480);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * eased;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="tabular-nums">{format(shown)}</span>;
}

export function PricingPlans({ plans, currency, talkHref }: { plans: Plan[]; currency: string; talkHref: string }) {
  const [yearly, setYearly] = useState(false);
  const [people, setPeople] = useState(5);
  const studio = plans.find((p) => p.featured) ?? plans[0];
  const others = plans.filter((p) => p !== studio);
  const each = (yearly ? studio.yearly : studio.monthly) ?? 0;
  const setN = (n: number) => setPeople(Math.max(1, Math.min(MAX_PEOPLE, Math.round(n) || 1)));
  const f = (n: number) => money(n, currency);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      {/* The choices: how you pay, and how many of you. */}
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-12 items-end" data-reveal>
        <div className="lg:col-span-7">
          <div role="radiogroup" aria-label="Billing" className="relative inline-grid grid-cols-2 rounded-2xl border border-line/15 bg-surface p-1">
            <span
              aria-hidden
              className="price-pill absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-amber"
              style={{ transform: yearly ? "translateX(100%)" : "none" }}
            />
            {[false, true].map((y) => (
              <button
                key={String(y)}
                type="button"
                role="radio"
                aria-checked={yearly === y}
                onClick={() => setYearly(y)}
                className={`relative z-[1] rounded-xl px-5 h-11 text-[14.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${yearly === y ? "text-white" : "text-ink-soft hover:text-ink"}`}
              >
                {y ? "Yearly, two months free" : "Monthly"}
              </button>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5">
          <label htmlFor="price-people" className="flex items-baseline justify-between gap-3 text-[14.5px] font-semibold">
            People on your team
            <span className="font-display text-[26px] leading-none tabular-nums">{people}</span>
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setN(people - 1)}
              disabled={people <= 1}
              aria-label="One person fewer"
              className="w-10 h-10 rounded-xl border border-line/15 bg-surface text-[18px] font-semibold disabled:opacity-40 hover:border-line/35"
            >
              −
            </button>
            <input
              id="price-people"
              type="range"
              min={1}
              max={MAX_PEOPLE}
              value={people}
              onChange={(e) => setN(Number(e.target.value))}
              className="price-range flex-1"
              style={{ ["--fill" as string]: `${((people - 1) / (MAX_PEOPLE - 1)) * 100}%` }}
            />
            <button
              type="button"
              onClick={() => setN(people + 1)}
              disabled={people >= MAX_PEOPLE}
              aria-label="One person more"
              className="w-10 h-10 rounded-xl border border-line/15 bg-surface text-[18px] font-semibold disabled:opacity-40 hover:border-line/35"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-12 items-stretch">
        {/* Studio: the price, and what your team pays. */}
        <section aria-labelledby={`plan-${studio.id}`} className="site-card lg:col-span-7 relative flex flex-col rounded-[28px] bg-[rgb(43_33_24)] text-[rgb(246_240_228)] p-7 sm:p-9 overflow-hidden dark:ring-1 dark:ring-amber/40" data-reveal>
          <span className="absolute left-9 right-9 top-0 h-[7px] rounded-b-[3px] ld-stripes-light" aria-hidden />
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h2 id={`plan-${studio.id}`} className="font-display text-[32px] font-semibold">
              {studio.name}
            </h2>
            <span className="text-[14px] text-[rgb(246_240_228/0.65)]">{studio.for}</span>
          </div>
          <div className="mt-7 grid gap-6 sm:grid-cols-2 sm:items-end">
            <div>
              <div className="font-display text-[64px] sm:text-[76px] font-semibold leading-[0.9]">
                <Tween value={each} format={f} />
              </div>
              <p className="mt-2 text-[14px] text-[rgb(246_240_228/0.65)]">a person, a month, billed {yearly ? "yearly" : "monthly"}</p>
            </div>
            <div className="rounded-2xl bg-[rgb(255_244_230/0.07)] border border-[rgb(255_244_230/0.12)] px-5 py-4" aria-live="polite">
              <div className="text-[13px] text-[rgb(246_240_228/0.65)]">
                Your team of {people} {people === 1 ? "person" : "people"}
              </div>
              <div className="mt-1 font-display text-[30px] font-semibold leading-tight">
                <Tween value={each * people} format={f} /> <span className="text-[15px] font-normal text-[rgb(246_240_228/0.65)]">a month</span>
              </div>
              <div className="mt-0.5 text-[13px] text-[rgb(246_240_228/0.65)]">
                {yearly ? (
                  <>
                    <Tween value={each * people * 12} format={f} /> a year, paid yearly
                  </>
                ) : (
                  <>
                    or <Tween value={(studio.yearly ?? 0) * people} format={f} /> a month, billed yearly
                  </>
                )}
              </div>
            </div>
          </div>
          <ul className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2 text-[15px] flex-1">
            {studio.includes.map((x) => (
              <li key={x} className="flex gap-2.5">
                <CheckIcon className="w-4 h-4 mt-1 flex-shrink-0 text-amber" />
                <span className="text-[rgb(246_240_228/0.85)]">{x}</span>
              </li>
            ))}
          </ul>
          <Link href="/signup" className="site-btn mt-9 inline-flex items-center justify-center rounded-xl bg-amber text-white h-12 px-6 text-[15px] font-semibold hover:brightness-110 sm:self-start">
            Create an account
          </Link>
        </section>

        {others.map((p, i) => (
          <section
            key={p.id}
            aria-labelledby={`plan-${p.id}`}
            className="site-card lg:col-span-5 flex flex-col rounded-[28px] border border-line/15 bg-surface p-7 sm:p-9"
            data-reveal
            style={{ ["--i" as string]: i + 1 }}
          >
            <h2 id={`plan-${p.id}`} className="font-display text-[32px] font-semibold">
              {p.name}
            </h2>
            <p className="mt-1.5 text-[15px] text-ink-soft">{p.for}</p>
            <div className="mt-7 font-display text-[44px] font-semibold leading-none">Priced with you</div>
            <p className="mt-2 text-[14px] text-ink-faint">{p.unit}</p>
            <ul className="mt-8 space-y-3 text-[15px] flex-1">
              {p.includes.map((x) => (
                <li key={x} className="flex gap-2.5">
                  <CheckIcon className="w-4 h-4 mt-1 flex-shrink-0 text-amber" />
                  <span className="text-ink-soft">{x}</span>
                </li>
              ))}
            </ul>
            <a href={talkHref} className="site-btn mt-9 inline-flex items-center justify-center rounded-xl border border-line/20 h-12 px-6 text-[15px] font-semibold hover:border-line/40 hover:bg-surface-2 sm:self-start">
              Talk to us about {p.name}
            </a>
          </section>
        ))}
      </div>
    </div>
  );
}
