"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { Select } from "@/components/ui/select";
import { saveSource } from "@/app/(dashboard)/business/actions";
import { words } from "../lib/i18n";
import { SOURCE_CATEGORIES, categoryLabel, type SourceCategory } from "../lib/kinds";
import { useBusiness, useWords } from "./context";
import { ProfileForm } from "./profile-form";
import { Field, card, field } from "./ui";

/*
 * Business (1.42.0), the first time: the PFA's details and where its books start, and its first income source (the
 * fiscal register keeps a page for each). Whoever only views it waits for the owner.
 */
const W = words({
  notSetUp: { en: "Not set up yet", ro: "Încă nu e configurată" },
  notSetUpBody: {
    en: "The owner hasn’t filled in the PFA’s details yet. The registers show up here once they have.",
    ro: "Proprietarul nu a completat încă datele PFA. Registrele apar aici după ce le completează.",
  },
  setUp: { en: "Set up the PFA", ro: "Configurează PFA-ul" },
  setUpBody: {
    en: "Its details go on every register’s header, as ANAF’s models have them. You can change any of it later in Settings.",
    ro: "Datele apar în antetul fiecărui registru, ca în modelele ANAF. Le poți modifica oricând din Setări.",
  },
  startRegisters: { en: "Start the registers", ro: "Începe registrele" },
  nameSource: { en: "Name the first income source.", ro: "Scrie denumirea primei surse de venit." },
  firstSource: { en: "The first income source", ro: "Prima sursă de venit" },
  firstSourceBody: {
    en: "The fiscal register keeps a page for each source of income. Most creators have one; add more later.",
    ro: "Registrul de evidență fiscală are câte o pagină pentru fiecare sursă de venit. Majoritatea creatorilor au una singură; poți adăuga altele mai târziu.",
  },
  name: { en: "Name", ro: "Denumirea" },
  category: { en: "Category of income", ro: "Categoria de venit" },
  ready: { en: "The registers are ready", ro: "Registrele sunt gata" },
  kept: { en: "What’s kept here", ro: "Ce se ține aici" },
  cashBook: { en: "The cash book", ro: "Registrul-jurnal de încasări și plăți" },
  cashBookText: {
    en: " (Registrul-jurnal de încasări și plăți): every receipt and payment, cash and bank apart, totalled every month.",
    ro: ": fiecare încasare și plată, separat pe numerar și bancă, cu totaluri lunare.",
  },
  fiscal: { en: "The fiscal register", ro: "Registrul de evidență fiscală" },
  fiscalText: {
    en: " (Registrul de evidență fiscală): the year’s income and deductible expenses, made from the cash book.",
    ro: ": veniturile și cheltuielile deductibile ale anului, întocmit pe baza registrului-jurnal.",
  },
  inventory: { en: "The inventory", ro: "Registrul-inventar" },
  inventoryText: {
    en: " (Registrul-inventar): what the business owns and owes on 31 December, started from the books.",
    ro: ": elementele de activ și datoriile la 31 decembrie, pornind de la registre.",
  },
  andAssets: {
    en: "And fixed assets with their amortization. Everything exports to Excel, CSV and PDF, in Romanian or English.",
    ro: "Plus mijloacele fixe și amortizarea lor. Totul se exportă în Excel, CSV și PDF, în română sau engleză.",
  },
  notAdvice: {
    en: "Not tax advice: the registers follow ANAF’s models; what’s deductible is your accountant’s call.",
    ro: "Nu este consultanță fiscală: registrele urmează modelele ANAF; ce este deductibil hotărăște contabilul tău.",
  },
});

export function SetupCard() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const [source, setSource] = useState("Creare de conținut");
  const [category, setCategory] = useState<SourceCategory>("independent");
  if (!b.edit)
    return (
      <div className={`${card} p-6 sm:p-8 text-center max-w-xl mx-auto`}>
        <p className="font-display text-[20px] font-semibold">{w.notSetUp}</p>
        <p className="mt-2 text-[13.5px] text-ink-soft">{w.notSetUpBody}</p>
      </div>
    );
  const needsSource = !b.s.sources.length;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem] items-start">
      <section className={`${card} p-5 sm:p-6`}>
        <h2 className="font-display text-[22px] font-semibold">{w.setUp}</h2>
        <p className="mt-1 text-[13.5px] text-ink-soft max-w-2xl">{w.setUpBody}</p>
        <div className="mt-5">
          <ProfileForm
            teamId={b.teamId}
            profile={b.s.profile}
            submitLabel={w.startRegisters}
            beforeSave={() => {
              if (needsSource && !source.trim()) {
                toast.error(w.nameSource);
                return false;
              }
              return true;
            }}
            extra={
              needsSource ? (
                <div className="rounded-xl border border-line/10 p-4 space-y-3">
                  <div>
                    <p className="text-[13.5px] font-semibold">{w.firstSource}</p>
                    <p className="text-[12.5px] text-ink-soft leading-snug">{w.firstSourceBody}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={w.name}>
                      <input className={field} value={source} onChange={(e) => setSource(e.target.value)} maxLength={120} />
                    </Field>
                    <Field label={w.category}>
                      <Select
                        value={category}
                        onChange={(v) => v && setCategory(v as SourceCategory)}
                        options={SOURCE_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c, b.lang), hint: b.lang === "en" ? categoryLabel(c, "ro") : undefined }))}
                        ariaLabel={w.category}
                        fullWidth
                      />
                    </Field>
                  </div>
                </div>
              ) : null
            }
            onSaved={async (profile) => {
              let sources = b.s.sources;
              if (needsSource) {
                const r = await saveSource(b.teamId, { name: source, category });
                if (r.error !== undefined) toast.error(r.error);
                else sources = [r.source];
              }
              b.patch((s) => ({ ...s, profile, setUp: true, sources }));
              toast.success(w.ready);
            }}
          />
        </div>
      </section>
      <aside className={`${card} p-5 text-[13px] text-ink-soft leading-relaxed space-y-3`}>
        <p className="text-[13.5px] font-semibold text-ink">{w.kept}</p>
        <p>
          <b className="text-ink">{w.cashBook}</b>
          {w.cashBookText}
        </p>
        <p>
          <b className="text-ink">{w.fiscal}</b>
          {w.fiscalText}
        </p>
        <p>
          <b className="text-ink">{w.inventory}</b>
          {w.inventoryText}
        </p>
        <p>{w.andAssets}</p>
        <p className="text-[12px] text-ink-faint">{w.notAdvice}</p>
      </aside>
    </div>
  );
}
