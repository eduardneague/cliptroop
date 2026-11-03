"use client";

import { Fragment, useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Dialog } from "@/components/ui/dialog";
import { ArrowRightIcon, ExternalIcon, InfoIcon } from "@/components/ui/icons";
import { pick, words, type Dict } from "../lib/i18n";
import type { Lang } from "../lib/kinds";
import { useBusiness, useWords } from "./context";
import { primary, secondary } from "./ui";

/*
 * Business (1.43.0): what each register is and how it's kept, behind an ⓘ at its top right (the owner: "pentru fiecare
 * dintre registrul-jurnal, evidența fiscală, inventar, mijloace fixe, aș vrea o iconiță de informație în dreapta sus
 * pe care dacă o apeși îți spune ce înseamnă și pentru ce este folosit fiecare, o descriere scurtă, și după aceea pot
 * apăsa mai multe detalii și să am toate informațiile up to date de acolo pe tab-uri organizate cu exemple de cum
 * trebuie să fac și cum se face treaba pe business, pe PFA, în situația aceasta"; and for the fiscal register's
 * "Rectificare": "am nevoie de un info să știu ce înseamnă și ce fac cu el"). A short description first, then a window
 * with tabs: in short, how it's kept, worked examples for a creator's PFA, how the page does it, the rules, and the
 * sources it was checked against (on 29 October 2026).
 *
 * The guides are written in a small markup, one string per tab, in both languages (so tests/business-words.test.ts
 * reads every Romanian word): a blank line between blocks; "## " a heading; "> " a tip; "• " a list; "1. " steps;
 * "|" a table's row (the first is its header); **bold**.
 */

export type RegisterId = "cashbook" | "fiscal" | "inventory" | "assets";

/** When the guides were last checked against their sources. */
const CHECKED = "2026-10-29";

const W = words({
  about: { en: "What this register is", ro: "Ce este acest registru" },
  aboutIt: { en: (name: string) => `About: ${name}`, ro: (name: string) => `Despre: ${name}` },
  more: { en: "More details", ro: "Mai multe detalii" },
  checked: { en: "Checked on 29.10.2026", ro: "Verificat la 29.10.2026" },
  footnote: {
    en: "Checked on 29 October 2026 against the sources listed. Rules change: ask your accountant before a decision that matters.",
    ro: "Verificat la 29 octombrie 2026 după sursele din listă. Regulile se schimbă: întreabă contabilul înainte de o decizie importantă.",
  },
  sources: { en: "Sources", ro: "Surse" },
  sourcesIntro: { en: "Where the rules above come from (in Romanian).", ro: "De unde provin regulile de mai sus." },
  close: { en: "Close", ro: "Închide" },
  tabs: { en: "Sections", ro: "Secțiuni" },
  rectify: { en: "What Rectificare means", ro: "Ce înseamnă Rectificare" },
  rectifyShort: {
    en: "Turn it on for a year whose fiscal register corrects one already done: usually because the tax return (Declarația unică) for that year was already filed and a corrected one (rectificativă) follows. The exported register then says “Rectificare: Da”.",
    ro: "Pornește-o pentru un an al cărui registru de evidență fiscală îl corectează pe unul deja întocmit: de obicei pentru că ai depus deja Declarația unică pentru acel an și urmează una rectificativă. Registrul exportat va avea „Rectificare: Da”.",
  },
  rectifyMore: { en: "What to do, step by step", ro: "Ce faci, pas cu pas" },
});

// --- The registers' guides -------------------------------------------------------------------------------------------

const CASHBOOK = words({
  name: { en: "Cash book", ro: "Registrul-jurnal de încasări și plăți" },
  short: {
    en: "Every receipt and payment of the business, in the order they happened, each with the document behind it (invoice, receipt, bank statement). Cash and bank apart, totalled every month. The fiscal register and the tax return are worked out from it.",
    ro: "Toate încasările și plățile activității, în ordinea în care s-au făcut, fiecare cu documentul care o justifică (factură, chitanță, extras de cont). Numerarul și banca separat, cu totaluri lunare. Din el se întocmesc registrul de evidență fiscală și Declarația unică.",
  },
  t1: { en: "In short", ro: "Pe scurt" },
  b1: {
    en: `**What it is.** The register where a PFA on the real system (sistem real) writes down, day by day, the money that comes into and goes out of the business. Its official model is form 14-1-1/b, from OMFP 170/2015.

**Who keeps it.** PFAs, sole and family businesses (II, IF) and the liberal professions that work out their net income on the real system. On an income norm (normă de venit) there are no single-entry books to keep, so it isn't required, but you can keep it for yourself.

**What goes in.**
• Receipts: money from clients, AdSense and other platforms' payouts, sponsorships, cash taken from the bank into the till.
• Payments: subscriptions, equipment, rent, fees, the contributions (CAS, CASS) and the income tax, cash paid into the bank.
• Your own money put in or taken out: not income or expenses, but money that moves.

**Why it matters.** The fiscal register's gross income and deductible expenses come from it, and from those the net income in the tax return (Declarația unică). A tax inspection starts from it and its documents.`,
    ro: `**Ce este.** Registrul în care un PFA în sistem real notează, zi de zi, banii care intră și ies din activitate. Modelul oficial este formularul 14-1-1/b din OMFP 170/2015.

**Cine îl ține.** PFA-urile, întreprinderile individuale și familiale (II, IF) și profesiile liberale care își stabilesc venitul net în sistem real. La normă de venit nu ai obligația să ții contabilitate în partidă simplă, deci registrul nu e obligatoriu, dar îl poți ține pentru evidența ta.

**Ce intră în el.**
• Încasări: bani de la clienți, plăți AdSense și de la alte platforme, sponsorizări, numerar ridicat din bancă în casă.
• Plăți: abonamente, echipamente, chirie, comisioane, contribuțiile (CAS, CASS) și impozitul pe venit, numerar depus la bancă.
• Banii tăi personali aduși în activitate sau retrași din ea: nu sunt venituri sau cheltuieli, dar sunt bani care se mișcă.

**De ce contează.** Din el rezultă venitul brut și cheltuielile deductibile din registrul de evidență fiscală, iar din acestea venitul net din Declarația unică. Un control fiscal pornește de la el și de la documentele lui.`,
  },
  t2: { en: "How to fill it in", ro: "Cum se completează" },
  b2: {
    en: `1. Write each operation on the day the money came in or went out (the day on the bank statement or the receipt), not the invoice's day.
2. Every line stands on a supporting document: an invoice, a receipt, a till receipt, a bank statement, a payment order, a platform's payment report.
3. Fill in the running number, the day, the document (its kind and number), the explanation, and the amount in its column: receipts or payments, cash or bank.
4. Foreign amounts go in lei at BNR's rate from the banking day before the operation; write the foreign amount and the rate in the explanation.
5. At the end of each month, add up the columns and work out the cash and bank balances. The cash balance can never go below zero.
6. A mistake isn't erased: on paper it's struck through with one line and written again, dated and signed; here, while the year is open you correct the line, and once it's closed you add a reversal (storno).

> Money moved between the PFA's account and your personal one isn't an expense or income: it's a withdrawal or a contribution, and it stays out of the fiscal register.`,
    ro: `1. Notează fiecare operațiune în ziua în care banii au intrat sau au ieșit (data din extrasul de cont sau din chitanță), nu în ziua facturii.
2. Fiecare rând are un document justificativ: factură, chitanță, bon fiscal, extras de cont, ordin de plată, raportul de plăți al platformei.
3. Completezi numărul curent, data, documentul (felul și numărul), explicația și suma în coloana ei: încasări sau plăți, numerar sau bancă.
4. Sumele în valută se trec în lei la cursul BNR din ziua bancară anterioară operațiunii; suma în valută și cursul le scrii la explicații.
5. La sfârșitul fiecărei luni se adună coloanele și se calculează soldurile casei și ale băncii. Soldul casei nu poate fi niciodată negativ.
6. O greșeală nu se șterge: pe hârtie se taie cu o linie și se scrie corect, cu dată și semnătură; aici, cât anul e deschis, corectezi rândul, iar după închiderea anului faci o stornare.

> Banii mutați între contul PFA-ului și contul tău personal nu sunt cheltuieli sau venituri: sunt retrageri sau aporturi și nu intră în evidența fiscală.`,
  },
  t3: { en: "Examples", ro: "Exemple" },
  b3: {
    en: `## A usual month for a content creator
| No. | Day | Document | Explanation | Receipts | Payments |
| 1 | 05.01 | Extras de cont 1 | Google AdSense, December: 1,000.00 USD × 4.3821 | 4,382.10 bank | |
| 2 | 08.01 | Factură IE-55821 | Adobe Creative Cloud subscription | | 289.99 bank |
| 3 | 12.01 | Factură VPL 0001 | Sponsored video, Brand Z SRL | 2,500.00 bank | |
| 4 | 15.01 | Extras de cont 1 | Cash taken out for the till | | 500.00 bank |
| 5 | 15.01 | Chitanță 1 | Cash taken out for the till | 500.00 cash | |
| 6 | 20.01 | Bon fiscal 0042 | Business meal with a client (protocol) | | 120.00 cash |

Lines 4 and 5 are the same money moved from the bank into the till: a payment from the bank and a cash receipt, neither income nor an expense. The business meal is deductible only up to 2% of the calculation base.

## A laptop for 8,999 lei
The payment goes in the cash book on the day you paid. It isn't a deductible expense straight away, though: from 5,000 lei (from 2026) the laptop is a fixed asset, deducted through depreciation, month by month, over the useful life you choose.

## A client who pays in euros
The invoice is for 1,000 EUR and the money arrives on 10.03. Write it in lei at BNR's rate from the banking day before (4.9771, say) and put “1,000.00 EUR × 4.9771” in the explanation.`,
    ro: `## O lună obișnuită pentru un creator de conținut
| Nr. | Data | Documentul | Explicații | Încasări | Plăți |
| 1 | 05.01 | Extras de cont 1 | Google AdSense, decembrie: 1.000,00 USD × 4,3821 | 4.382,10 bancă | |
| 2 | 08.01 | Factură IE-55821 | Abonament Adobe Creative Cloud | | 289,99 bancă |
| 3 | 12.01 | Factură VPL 0001 | Video sponsorizat, Brand Z SRL | 2.500,00 bancă | |
| 4 | 15.01 | Extras de cont 1 | Numerar ridicat pentru casă | | 500,00 bancă |
| 5 | 15.01 | Chitanță 1 | Numerar ridicat pentru casă | 500,00 numerar | |
| 6 | 20.01 | Bon fiscal 0042 | Masă de protocol cu un client | | 120,00 numerar |

Rândurile 4 și 5 sunt aceiași bani mutați din bancă în casă: o plată din bancă și o încasare în numerar, nici venit, nici cheltuială. Masa de protocol e deductibilă doar până la 2% din baza de calcul.

## Un laptop de 8.999 lei
Plata intră în registrul-jurnal în ziua în care ai plătit. Nu e însă o cheltuială deductibilă pe loc: de la 5.000 lei (din 2026) laptopul e mijloc fix și se deduce prin amortizare, lună de lună, pe durata de folosire aleasă.

## Un client care plătește în euro
Factura e de 1.000 EUR, iar banii intră pe 10.03. Treci suma în lei la cursul BNR din ziua bancară anterioară (de exemplu 4,9771) și scrii la explicații „1.000,00 EUR × 4,9771”.`,
  },
  t4: { en: "In the app", ro: "În aplicație" },
  b4: {
    en: `• The box above the table adds an operation: pick money in or out and bank or cash, type the day, the document, the explanation and the amount, then press Enter. What it is gets guessed from the explanation; change it if it's wrong.
• The paperclip beside the document attaches files to the new operation. The paperclip on a line adds a document to it straight away; you can also drop the file on the line.
• Any cell changes in place: click it and type, Enter saves, Esc leaves it. The line shows it's saving and lights up green once it's saved.
• Select (or the box that shows over a line's number) picks several operations: change what they are or their source together, copy them for Excel, or remove them.
• Paste from Excel adds many lines at once from a copied table.
• Needs a look shows the operations without a document, the ones left as “other”, and the days the cash goes below zero.
• Export (top right) downloads the register on its official model, as PDF or Excel, ready to print and sign.`,
    ro: `• Caseta de deasupra tabelului adaugă o operațiune: alegi încasare sau plată și bancă sau numerar, scrii data, documentul, explicația și suma, apoi apeși Enter. Ce reprezintă se estimează din explicație; îl schimbi dacă nu e corect.
• Agrafa de lângă document atașează fișierele noii operațiuni. Agrafa de pe un rând adaugă imediat un document la el; poți și trage fișierul peste rând.
• Orice celulă se modifică direct: clic pe ea și scrii, Enter salvează, Esc renunță. Rândul arată că se salvează și se aprinde verde când e gata.
• „Selectează” (sau căsuța care apare peste numărul rândului) alege mai multe operațiuni: le schimbi împreună ce reprezintă sau sursa, le copiezi pentru Excel ori le ștergi.
• „Lipește din Excel” adaugă dintr-odată rânduri copiate dintr-un tabel.
• „De verificat” arată operațiunile fără document, cele lăsate la „altele” și zilele cu soldul casei negativ.
• „Exportă” (sus, în dreapta) descarcă registrul pe modelul oficial, PDF sau Excel, gata de tipărit și de semnat.`,
  },
  t5: { en: "Rules and keeping", ro: "Reguli și arhivare" },
  b5: {
    en: `• It's kept per calendar year, in lei. It can be kept electronically, as long as it can be printed whenever a tax inspection asks.
• Since 1 March 2015, registers are no longer registered or stamped at ANAF; their pages are numbered.
• The supporting documents stay with the register: the originals or, for electronic invoices, the XML file from SPV (e-Factura).
• Keeping it: the accounting law, as changed in 2023 (Legea 36/2023), asks for 5 years from 1 July of the following year; OMFP 170/2015 still says 10 years for registers. To be safe, keep them 10 years.
• On an income norm the register isn't required.`,
    ro: `• Se ține pe an calendaristic, în lei. Poate fi ținut electronic, cu condiția să poată fi tipărit oricând la cererea inspecției fiscale.
• Din 1 martie 2015, registrele nu se mai înregistrează și nu se mai parafează la ANAF; filele se numerotează.
• Documentele justificative stau împreună cu registrul: originalele sau, pentru facturile electronice, fișierul XML din SPV (e-Factura).
• Arhivare: Legea contabilității, după modificările din 2023 (Legea 36/2023), cere 5 ani de la 1 iulie a anului următor; OMFP 170/2015 vorbește încă de 10 ani pentru registre. Ca să fii acoperit, păstrează-le 10 ani.
• La normă de venit registrul nu e obligatoriu.`,
  },
});

const FISCAL = words({
  name: { en: "Fiscal register", ro: "Registrul de evidență fiscală" },
  short: {
    en: "Once a year, for each income source: the gross income and the deductible expenses that give the net income (or loss) in the tax return. Made from the cash book and the fixed assets, before Declarația unică (due 25 May).",
    ro: "O dată pe an, pentru fiecare sursă de venit: venitul brut și cheltuielile deductibile din care rezultă venitul net (sau pierderea) din Declarația unică. Se întocmește din registrul-jurnal și din mijloacele fixe, înainte de Declarația unică (termen: 25 mai).",
  },
  t1: { en: "In short", ro: "Pe scurt" },
  b1: {
    en: `**What it is.** The register where the net annual income (or the net loss) is worked out for each income source: the gross income minus the deductible expenses. Its model and rules are in OMFP 3.254/2017.

**Who keeps it.** Anyone with income from independent activities whose net income is set on the real system (PFA, II, IF, liberal professions). On an income norm, only the income part is filled in.

**What stays out.** VAT (for a VAT payer, the amounts are without it), the contributions (CAS, CASS), the income tax, your own withdrawals and contributions, transfers between cash and bank, loans, non-deductible expenses.

**What's done with it.** It isn't handed in anywhere. You take the net income from it into Declarația unică, and keep it for a possible inspection.`,
    ro: `**Ce este.** Registrul în care se stabilește, pentru fiecare sursă de venit, venitul net anual sau pierderea netă anuală: venitul brut minus cheltuielile deductibile. Modelul și regulile sunt în OMFP 3.254/2017.

**Cine îl ține.** Cei care obțin venituri din activități independente și își stabilesc venitul net în sistem real (PFA, II, IF, profesii liberale). La normă de venit se completează numai partea de venituri.

**Ce nu intră.** TVA-ul (la plătitorii de TVA, sumele sunt fără TVA), contribuțiile CAS și CASS, impozitul pe venit, retragerile și aporturile tale, transferurile între casă și bancă, împrumuturile, cheltuielile nedeductibile.

**Ce faci cu el.** Nu se depune nicăieri. Din el iei venitul net pe care îl treci în Declarația unică și îl păstrezi pentru un eventual control.`,
  },
  t2: { en: "How to fill it in", ro: "Cum se completează" },
  b2: {
    en: `1. One page for each income source in each category (for example “Content creation, independent activities”).
2. At the top: the year, the source and category of income and, if it applies, “Rectificare”.
3. The lines: the gross income, by kind (platform revenue, brand deals, other services); the deductible expenses, by nature (software, equipment, rent, depreciation…); at the end, the net income or the net loss.
4. Expenses go in only as far as they're deductible: protocol up to 2% of the calculation base, a car used privately too at 50%, fixed assets through the year's depreciation, not when bought.
5. It's filled in once, after the year has ended and before Declarația unică, in a single copy, on paper or electronically.`,
    ro: `1. Câte o pagină pentru fiecare sursă de venit din fiecare categorie (de exemplu „Creare de conținut, activități independente”).
2. Sus: anul, sursa și categoria de venit și, dacă e cazul, mențiunea „Rectificare”.
3. Rândurile: venitul brut, pe feluri de venit (publicitate pe platforme, colaborări cu branduri, alte servicii); cheltuielile deductibile, pe naturi (software, echipamente, chirie, amortizare…); la final, venitul net sau pierderea netă.
4. Cheltuielile se trec doar cât sunt deductibile: protocolul până la 2% din baza de calcul, autoturismul folosit și personal 50%, mijloacele fixe prin amortizarea anului, nu la cumpărare.
5. Se completează o dată, după încheierea anului și înainte de Declarația unică, într-un singur exemplar, pe hârtie sau electronic.`,
  },
  t3: { en: "Examples", ro: "Exemple" },
  b3: {
    en: `## A PFA with YouTube income and brand deals, 2025
| No. | Items | Value (lei) |
| 1 | Gross income | 78,395.85 |
| 1.1 | Platform revenue (AdSense and the like) | 52,395.85 |
| 1.2 | Brand deals | 26,000.00 |
| 2 | Deductible expenses | 21,480.40 |
| 2.1 | Software and subscriptions | 3,479.88 |
| 2.2 | Depreciation of fixed assets | 3,000.00 |
| 2.3 | Other deductible expenses | 15,000.52 |
| 3 | Net annual income | 56,915.45 |

The laptop paid for in March isn't here, but its depreciation for 2025 is. The CAS and CASS paid aren't here at all: Declarația unică works them out.

## On an income norm
Fill in only the gross income, by source. Expenses don't count: the tax is worked out on the norm set for the activity and the county.`,
    ro: `## Un PFA cu venituri din YouTube și colaborări, 2025
| Nr. crt. | Elemente de calcul | Valoare (lei) |
| 1 | Venit brut | 78.395,85 |
| 1.1 | Venituri din publicitate pe platforme (AdSense etc.) | 52.395,85 |
| 1.2 | Colaborări cu branduri | 26.000,00 |
| 2 | Cheltuieli deductibile | 21.480,40 |
| 2.1 | Software și abonamente | 3.479,88 |
| 2.2 | Amortizarea mijloacelor fixe | 3.000,00 |
| 2.3 | Alte cheltuieli deductibile | 15.000,52 |
| 3 | Venit net anual | 56.915,45 |

Plata laptopului din martie nu apare aici, dar amortizarea lui pe 2025 da. CAS-ul și CASS-ul plătite nu apar deloc: le calculează Declarația unică.

## La normă de venit
Completezi doar venitul brut, pe surse. Cheltuielile nu contează: impozitul se calculează la norma stabilită pentru activitate și județ.`,
  },
  t4: { en: "Rectificare", ro: "Rectificare" },
  b4: {
    en: `**What it means.** “Rectificare” marks the register of a year you corrected after it was done, usually after Declarația unică for that year was already filed. OMFP 3.254/2017 (art. 6) says the register changes whenever differences are found in the income or the expenses, up to the day the corrected tax return (declarația rectificativă) is filed.

**When you need it.**
• You forgot an income invoice or a deductible expense, and the return is already filed.
• An amount, an exchange rate or what an expense is was wrong.
• ANAF or your accountant asked for a correction.

**What you do.**
1. Correct the operations in the cash book (in a closed year: reopen it in Settings, or add a reversal).
2. Turn on Rectificare here: the exported register says “Rectificare: Da”.
3. File the corrected Declarația unică (rectificativă) in SPV, with the new net income.
4. Keep both versions of the register, with the documents that explain the difference.

> If the return for that year isn't filed yet, you don't need Rectificare: correct the books and fill in the register as usual.`,
    ro: `**Ce înseamnă.** „Rectificare” marchează registrul unui an pe care l-ai corectat după ce fusese întocmit, de obicei după ce ai depus deja Declarația unică pentru acel an. OMFP 3.254/2017 (art. 6) spune că registrul se modifică ori de câte ori se constată diferențe la venituri sau la cheltuieli, până la data depunerii declarației rectificative.

**Când ai nevoie de ea.**
• Ai uitat o factură de venit sau o cheltuială deductibilă și declarația e deja depusă.
• O sumă, un curs valutar sau felul unei cheltuieli a fost greșit.
• ANAF sau contabilul ți-a cerut o corectare.

**Ce faci.**
1. Corectezi operațiunile în registrul-jurnal (într-un an închis: îl redeschizi din Setări sau faci o stornare).
2. Pornești „Rectificare” aici: registrul exportat va avea „Rectificare: Da”.
3. Depui Declarația unică rectificativă în SPV, cu venitul net nou.
4. Păstrezi ambele variante ale registrului, cu documentele care explică diferența.

> Dacă declarația pentru acel an nu e încă depusă, nu ai nevoie de „Rectificare”: corectezi registrele și completezi registrul ca de obicei.`,
  },
  t5: { en: "In the app", ro: "În aplicație" },
  b5: {
    en: `• The register makes itself from the cash book and the fixed assets: a page for each income source (Settings → Income sources).
• What a line of the cash book is (Income, Deductible expense…) decides where it goes; “Needs a look” in the cash book shows what's still unsure.
• Lines that aren't money (income in kind, a correction from your accountant) go in at the bottom.
• Protocol over 2% and the share of a car used privately are left out by themselves, and said under the page.
• Export downloads it on the official model, ready to sign and keep.`,
    ro: `• Registrul se întocmește singur din registrul-jurnal și din mijloacele fixe: câte o pagină pentru fiecare sursă de venit (Setări → Surse de venit).
• Ce reprezintă fiecare rând din registrul-jurnal (venit, cheltuială deductibilă…) decide unde intră; „De verificat” din registrul-jurnal arată ce nu e încă sigur.
• Rândurile fără încasări sau plăți (venituri în natură, o corecție cerută de contabil) se adaugă jos.
• Protocolul peste 2% și partea personală a autoturismului se scad singure și apar explicate sub pagină.
• „Exportă” îl descarcă pe modelul oficial, gata de semnat și de păstrat.`,
  },
});

const INVENTORY = words({
  name: { en: "Inventory register", ro: "Registrul-inventar" },
  short: {
    en: "What the business owns and owes on a given day: equipment, stocks, cash, bank, money still to collect and to pay. Done when the activity starts, at least every 31 December, and when it ends.",
    ro: "Ce are și ce datorează activitatea la o anumită dată: echipamente, stocuri, numerar, bancă, sume de încasat și de plătit. Se întocmește la începerea activității, cel puțin la 31 decembrie în fiecare an și la încetarea activității.",
  },
  t1: { en: "In short", ro: "Pe scurt" },
  b1: {
    en: `**What it is.** The register where an inventory's results go, grouped: the business's assets and debts on a day. Its official model is form 14-1-2/b (OMFP 170/2015); the rules for counting are in OMFP 2.861/2009.

**When.** When the activity starts, at least once a year (usually on 31 December) and when it ends; also when goods are handed over, after a theft or a disaster.

**Who.** PFAs and the other independent activities on the real system. On an income norm it isn't required.

**Why.** It shows what you have, at the right value, and what's missing. The accounting law fines a missing inventory (300 to 4,000 lei).`,
    ro: `**Ce este.** Registrul în care se trec, grupate, rezultatele inventarierii: elementele de activ și datoriile activității la o dată. Modelul oficial este formularul 14-1-2/b (OMFP 170/2015); regulile inventarierii sunt în OMFP 2.861/2009.

**Când.** La începerea activității, cel puțin o dată pe an (de regulă la 31 decembrie) și la încetarea activității; și la o predare de gestiune, după un furt sau o calamitate.

**Cine.** PFA-urile și celelalte activități independente în sistem real. La normă de venit nu e obligatoriu.

**De ce.** Arată ce ai, la valoarea corectă, și ce lipsește. Legea contabilității sancționează lipsa inventarierii cu amendă (între 300 și 4.000 de lei).`,
  },
  t2: { en: "How it's done", ro: "Cum se face" },
  b2: {
    en: `1. Count and list what's really there: the equipment (fixed assets and small equipment), the stocks, the cash in the till; take the balance from the bank statement.
2. Add what you still have to collect (invoices sent, not paid yet) and what you still have to pay (invoices received, not paid yet).
3. Write each at its value: goods at their entry value, receivables and debts at what's left to collect or pay.
4. Group them by kind (fixed assets, small equipment, cash, bank, receivables, debts) and total each group.
5. At the end: the total of the assets, the total of the debts, and the difference between them.
6. Sign the inventory lists and keep them with the register.

> Your personal things, bought outside the business, don't go in, even if you also use them for the PFA.`,
    ro: `1. Numeri și listezi ce există efectiv: echipamentele (mijloace fixe și obiecte de inventar), stocurile, numerarul din casă; iei soldul din extrasul de cont.
2. Adaugi ce ai de încasat (facturi emise, neîncasate încă) și ce ai de plătit (facturi primite, neplătite încă).
3. Treci fiecare element la valoarea lui: bunurile la valoarea de intrare, creanțele și datoriile la cât a rămas de încasat sau de plătit.
4. Le grupezi pe feluri (mijloace fixe, obiecte de inventar, numerar, bancă, creanțe, datorii) și faci totalul fiecărei grupe.
5. La final: totalul elementelor de activ, totalul datoriilor și diferența dintre ele.
6. Semnezi listele de inventariere și le păstrezi cu registrul.

> Bunurile tale personale, cumpărate în afara activității, nu se trec, chiar dacă le folosești și pentru PFA.`,
  },
  t3: { en: "Examples", ro: "Exemple" },
  b3: {
    en: `## A creator's inventory on 31.12.2025
| No. | Item | Value (lei) |
| 1 | Sony A7 IV camera (fixed asset) | 6,450.00 |
| 2 | Microphone and lights (small equipment) | 1,280.00 |
| 3 | Cash in the till | 0.00 |
| 4 | Money in the bank account | 12,398.61 |
| 5 | Invoice VPL 0005 not paid yet, Brand Z SRL | 2,500.00 |
| 6 | Editing invoice not paid yet (a debt) | 350.00 |

Total assets: 22,628.61 lei. Total debts: 350.00 lei. Difference: 22,278.61 lei.

## A PFA with no goods
A register of two or three lines is fine: the bank balance, what's still to collect and what's still to pay.`,
    ro: `## Inventarul unui creator la 31.12.2025
| Nr. crt. | Denumirea | Valoare (lei) |
| 1 | Cameră foto Sony A7 IV (mijloc fix) | 6.450,00 |
| 2 | Microfon și lumini (obiecte de inventar) | 1.280,00 |
| 3 | Numerar în casă | 0,00 |
| 4 | Disponibil în contul bancar | 12.398,61 |
| 5 | Factură VPL 0005 neîncasată, Brand Z SRL | 2.500,00 |
| 6 | Factură de montaj neplătită (datorie) | 350,00 |

Total elemente de activ: 22.628,61 lei. Total datorii: 350,00 lei. Diferența: 22.278,61 lei.

## Un PFA fără bunuri
Un registru cu două-trei rânduri e valid: soldul din bancă, ce ai de încasat și ce ai de plătit.`,
  },
  t4: { en: "In the app", ro: "În aplicație" },
  b4: {
    en: `• New inventory starts one on a day; “Start from the books” brings in the fixed assets in use, the cash and the bank balance.
• The + at the end of each group adds a line straight into it; Add a line (at the top of the sheet) adds one wherever you choose.
• Debts are taken off by themselves: the difference at the bottom is what's left.
• Export downloads the inventory register on its official model.`,
    ro: `• „Inventar nou” creează un inventar la o dată; „Preia datele din registre” aduce mijloacele fixe în folosință, numerarul și soldul din bancă.
• Butonul + de la capătul fiecărei grupe adaugă un rând direct în ea; „Adaugă un rând” (sus, pe inventar) adaugă unul unde alegi.
• Datoriile se scad singure: diferența de jos arată ce rămâne.
• „Exportă” descarcă registrul-inventar pe modelul oficial.`,
  },
});

const ASSETS = words({
  name: { en: "Fixed assets", ro: "Mijloace fixe" },
  short: {
    en: "Equipment worth 5,000 lei or more (from 2026; 2,500 before), used for more than a year: a camera, a laptop, a car. It isn't deducted when paid, but through depreciation, month by month, on its card (Fișa mijlocului fix).",
    ro: "Echipamentele de cel puțin 5.000 lei (din 2026; înainte 2.500), folosite mai mult de un an: o cameră, un laptop, o mașină. Nu se deduc la plată, ci prin amortizare, lună de lună, pe fișa fiecăruia (Fișa mijlocului fix).",
  },
  t1: { en: "In short", ro: "Pe scurt" },
  b1: {
    en: `**What a fixed asset is.** Something used in the business for more than a year, with a tax value of at least 5,000 lei (the Fiscal Code, art. 28 (2) b), as changed by OUG 8/2026, from the 2026 tax year; up to 31.12.2025 the threshold was 2,500 lei). Under the threshold it's small equipment (obiect de inventar): deducted in full when you pay for it.

**Its card.** Each one has its card (Fișa mijlocului fix, form 14-2-2): the inventory number, the name, the day it came in, the value, the useful life, the depreciation method and the monthly amount.

**How it's deducted.** Through depreciation: the value is spread over the normal useful life from the catalogue of fixed assets (HG 2.139/2004). It starts the month after the asset goes into use.

> Assets you had on 31.12.2025, under 5,000 lei but over 2,500, keep being depreciated over what's left of their life.`,
    ro: `**Ce e un mijloc fix.** Un bun folosit în activitate mai mult de un an, cu o valoare fiscală de cel puțin 5.000 lei (Codul fiscal, art. 28 alin. (2) lit. b), modificat prin OUG 8/2026, începând cu anul fiscal 2026; până la 31.12.2025 pragul a fost 2.500 lei). Sub prag e obiect de inventar: se deduce integral când îl plătești.

**Fișa lui.** Fiecare are fișa lui (Fișa mijlocului fix, formularul 14-2-2): numărul de inventar, denumirea, data intrării, valoarea, durata de folosire, metoda de amortizare și amortizarea lunară.

**Cum se deduce.** Prin amortizare: valoarea se împarte pe durata normală de funcționare din Catalogul mijloacelor fixe (HG 2.139/2004). Amortizarea începe în luna de după punerea în funcțiune.

> Mijloacele fixe pe care le aveai la 31.12.2025, sub 5.000 lei dar peste 2.500, se amortizează în continuare pe durata rămasă.`,
  },
  t2: { en: "Depreciation", ro: "Amortizarea" },
  b2: {
    en: `• **Straight-line:** the same amount every month: the value divided by the number of months.
• **Declining balance:** the straight-line rate times 1.5 (a life of 2 to 5 years), 2 (over 5, up to 10) or 2.5 (over 10), on what's left; towards the end it turns straight-line.
• **Accelerated:** at most 50% in the first year of use, the rest straight-line over the years left.
• **A car** also used privately: at most 1,500 lei a month of its depreciation is deductible.
• **Sold or scrapped:** depreciation stops; what's left is deductible up to what the sale brought in.

You choose the life within the catalogue's range: the shortest deducts soonest. Computers (2.2.9), for example, have 2 to 4 years.`,
    ro: `• **Liniară:** aceeași sumă în fiecare lună: valoarea împărțită la numărul de luni.
• **Degresivă:** cota liniară înmulțită cu 1,5 (durată de 2–5 ani), 2 (peste 5 ani, până la 10) sau 2,5 (peste 10 ani), aplicată valorii rămase; spre final trece pe liniar.
• **Accelerată:** cel mult 50% în primul an de folosire, restul liniar pe anii rămași.
• **Autoturismul** folosit și în scop personal: din amortizarea lui se deduc cel mult 1.500 lei pe lună.
• **Vândut sau casat:** amortizarea se oprește; valoarea rămasă se deduce până la cât s-a încasat din vânzare.

Durata o alegi din intervalul din catalog: cea mai scurtă deduce cel mai repede. De exemplu, calculatoarele (2.2.9) au 2–4 ani.`,
  },
  t3: { en: "Examples", ro: "Exemple" },
  b3: {
    en: `## A laptop for 8,999 lei, bought on 12.01.2026
Computers have 2 to 4 years in the catalogue (code 2.2.9). You choose 3 years (36 months), straight-line: 8,999 ÷ 36 = 249.97 lei a month, from February 2026 (the month after it goes into use).
In 2026, 11 months are deducted: 2,749.67 lei. The rest in 2027, 2028 and January 2029.

## A camera for 4,200 lei in 2026
It's under 5,000 lei, so it isn't a fixed asset: write it as small equipment, deducted in full in the year you pay for it.

## A car for 90,000 lei, used privately too
Passenger cars have 4 to 6 years. Over 5 years, straight-line, that's 1,500 lei a month: just the deductible limit. Its running costs (fuel, upkeep) are deductible at 50%.`,
    ro: `## Un laptop de 8.999 lei, cumpărat pe 12.01.2026
Calculatoarele au în catalog 2–4 ani (codul 2.2.9). Alegi 3 ani (36 de luni), liniar: 8.999 ÷ 36 = 249,97 lei pe lună, din februarie 2026 (luna de după punerea în funcțiune).
În 2026 se deduc 11 luni: 2.749,67 lei. Restul în 2027, 2028 și ianuarie 2029.

## O cameră de 4.200 lei în 2026
E sub 5.000 lei, deci nu e mijloc fix: o treci ca obiect de inventar și se deduce integral în anul plății.

## Un autoturism de 90.000 lei, folosit și personal
Autoturismele au 4–6 ani. Pe 5 ani, liniar, înseamnă 1.500 lei pe lună: exact limita deductibilă. Cheltuielile cu el (combustibil, întreținere) se deduc 50%.`,
  },
  t4: { en: "In the app", ro: "În aplicație" },
  b4: {
    en: `• New fixed asset adds one: its inventory number, its life from the catalogue (with suggestions for what a creator usually buys), the method, and the day it went into use.
• Each has its card, with the depreciation plan month by month; PDF and Excel download it on the official model.
• The year's depreciation goes into the fiscal register by itself, and the assets in use into the inventory.
• Link the payment in the cash book to the asset (What it is → Fixed asset bought), so it isn't deducted twice.`,
    ro: `• „Mijloc fix nou” adaugă unul: numărul de inventar, durata din catalog (cu sugestii pentru ce cumpără de obicei un creator), metoda și ziua punerii în funcțiune.
• Fiecare are fișa lui, cu planul de amortizare lună de lună; PDF și Excel o descarcă pe modelul oficial.
• Amortizarea anului intră singură în registrul de evidență fiscală, iar mijloacele fixe în folosință, în inventar.
• Leagă plata din registrul-jurnal de mijlocul fix (Ce reprezintă → Achiziție mijloc fix), ca să nu fie dedusă de două ori.`,
  },
});

type Source = { title: string; url: string };
const S = {
  contappRegisters: { title: "ContApp: Registrele obligatorii PFA, ghid complet și diferențe", url: "https://contapp.ro/registre-obligatorii-in-contabilitatea-pfa-diferente-de-completare/" },
  omfp170: { title: "OMFP 170/2015: Reglementări contabile privind contabilitatea în partidă simplă (anexa)", url: "https://legeaz.net/monitorul-oficial-139-2015/ordinul-mfp-170-2015/anexa-reglementari-contabile" },
  managerRegisters: {
    title: "Contabilul.ro: Registrele și documentele financiar-contabile în partidă simplă",
    url: "https://contabilul.manager.ro/a/14877/registrele-si-documentele-financiar-contabile-utilizate-in-scopul-conducerii-contabilitatii-in-partida-simpla.html",
  },
  ref3254: { title: "Contzilla: Registrul de evidență fiscală pentru PFA, O 3.254/2017", url: "https://www.contzilla.ro/registrul-de-evidenta-fiscala-pentru-pfa-o-3-254-2017/" },
  refExample: { title: "Fiscalitatea.ro: Registrul de evidență fiscală, exemplu de completare pentru PFA", url: "https://www.fiscalitatea.ro/registrul-de-evidenta-fiscala-exemplu-de-completare-pentru-pfa-uri-24656/" },
  anafRef: { title: "ANAF: Precizări privind Registrul de evidență fiscală (persoane fizice)", url: "https://static.anaf.ro/static/10/Galati/Vrancea/Precizari-REF-PF.pdf" },
  contappInventory: { title: "ContApp: Inventarul PFA și Registrul-inventar", url: "https://contapp.ro/blog/inventarul-patrimoniului-la-pfa-si-profesiile-liberale/" },
  managerInventory: {
    title: "Contabilul.ro: Registrul-inventar, când se întocmește, cum se completează și cum se păstrează",
    url: "https://contabilul.manager.ro/a/27663/registrul-inventar-cand-se-intocmeste-cum-se-completeaza-si-cum-se-pastreaza.html",
  },
  threshold: {
    title: "Contzilla: Plafon încadrare ca mijloc fix în 2026, 5.000 lei",
    url: "https://www.contzilla.ro/plafon-incadrare-ca-mijloc-fix-in-2026-5-000-lei-ce-se-intampla-cu-mijloacele-existente-sub-acest-plafon/",
  },
  contappAmortization: { title: "ContApp: Amortizarea mijloacelor fixe la PFA în 2026", url: "https://contapp.ro/blog/amortizare-mijloace-fixe-pfa/" },
  managerThreshold: { title: "Contabilul.ro: Mijloace fixe și noul prag de 5.000 lei", url: "https://contabilul.manager.ro/a/29884/mijloace-fixe-si-noul-prag-de-5000-lei-doua-intrebari-practice-lamurite.html" },
} satisfies Record<string, Source>;

const GUIDES: Record<RegisterId, { dict: Dict; tabs: number; sources: Source[]; rectify?: number }> = {
  cashbook: { dict: CASHBOOK, tabs: 5, sources: [S.omfp170, S.contappRegisters, S.managerRegisters] },
  fiscal: { dict: FISCAL, tabs: 5, sources: [S.ref3254, S.refExample, S.anafRef, S.contappRegisters], rectify: 4 },
  inventory: { dict: INVENTORY, tabs: 4, sources: [S.contappInventory, S.managerInventory, S.omfp170] },
  assets: { dict: ASSETS, tabs: 4, sources: [S.threshold, S.managerThreshold, S.contappAmortization, S.contappRegisters] },
};

type Guide = { name: string; short: string; tabs: { label: string; body: string }[]; sources: Source[] };
function guideOf(register: RegisterId, lang: Lang): Guide {
  const g = GUIDES[register];
  const t = pick(g.dict, lang) as Record<string, string>;
  return {
    name: t.name,
    short: t.short,
    tabs: Array.from({ length: g.tabs }, (_, i) => ({ label: t[`t${i + 1}`], body: t[`b${i + 1}`] })),
    sources: g.sources,
  };
}
/** The official (Romanian) name, shown under the English one. */
const officialName = (register: RegisterId) => guideOf(register, "ro").name;

// --- Pieces ----------------------------------------------------------------------------------------------------------

/**
 * A register's tab opens with its name (in English, its Romanian name under it: the one on its pages) and the ⓘ at the
 * top right. `aside`: anything else for that corner.
 */
export function RegisterHead({ register, aside }: { register: RegisterId; aside?: React.ReactNode }) {
  const b = useBusiness();
  const g = guideOf(register, b.lang);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 pt-0.5">
        <h2 className="text-[17px] font-semibold leading-tight">
          {g.name}
          <span className="text-ink-faint font-normal"> · {b.year}</span>
        </h2>
        {b.lang === "en" && <p className="mt-0.5 text-[12px] text-ink-faint">{officialName(register)}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {aside}
        <RegisterInfo register={register} />
      </div>
    </div>
  );
}

/** The ⓘ: the register's short description, then More details (the guide's window). */
export function RegisterInfo({ register }: { register: RegisterId }) {
  const b = useBusiness();
  const w = useWords(W);
  const g = guideOf(register, b.lang);
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={w.aboutIt(g.name)}
        title={w.about}
        className={`biz-info-btn w-9 h-9 flex-shrink-0 rounded-lg border inline-flex items-center justify-center transition-colors ${
          open ? "border-amber/60 bg-amber/10 text-amber" : "border-line/15 bg-surface text-ink-soft hover:text-ink hover:border-line/30"
        }`}
      >
        <InfoIcon className="w-[18px] h-[18px]" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={360} align="right" role="dialog" label={g.name}>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-amber/12 text-amber flex items-center justify-center flex-shrink-0" aria-hidden>
              <InfoIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-snug">{g.name}</p>
              {b.lang === "en" && <p className="text-[11.5px] text-ink-faint">{officialName(register)}</p>}
            </div>
          </div>
          <p className="mt-3 text-[13px] text-ink-soft leading-relaxed">{g.short}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-faint">{w.checked}</span>
            <button
              type="button"
              className={`${primary} !h-8 !px-3 !text-[12.5px]`}
              onClick={() => {
                setOpen(false);
                setGuide(true);
              }}
            >
              {w.more}
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </AnchoredMenu>
      {guide && <GuideDialog register={register} onClose={() => setGuide(false)} />}
    </>
  );
}

/** The ⓘ beside the fiscal register's Rectificare switch: what it means, then its tab in the guide. */
export function RectifyInfo() {
  const w = useWords(W);
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={w.rectify}
        title={w.rectify}
        className={`w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors ${open ? "text-amber bg-amber/10" : "text-ink-faint hover:text-ink hover:bg-surface-2"}`}
      >
        <InfoIcon className="w-4 h-4" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={340} align="left" role="dialog" label={w.rectify}>
        <div className="p-4">
          <p className="text-[14px] font-semibold">{w.rectify}</p>
          <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">{w.rectifyShort}</p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={`${primary} !h-8 !px-3 !text-[12.5px]`}
              onClick={() => {
                setOpen(false);
                setGuide(true);
              }}
            >
              {w.rectifyMore}
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </AnchoredMenu>
      {guide && <GuideDialog register="fiscal" startAt={(GUIDES.fiscal.rectify ?? 1) - 1} onClose={() => setGuide(false)} />}
    </>
  );
}

/** The guide: its tabs (← → between them), each written out, then the sources. */
function GuideDialog({ register, startAt = 0, onClose }: { register: RegisterId; startAt?: number; onClose: () => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const g = guideOf(register, b.lang);
  const tabs = [...g.tabs.map((t) => t.label), w.sources];
  const [tab, setTab] = useState(startAt);
  const list = useRef<HTMLDivElement>(null);
  const go = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    setTab(n);
    requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>(`[data-tab="${n}"]`)?.focus());
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width="sm:max-w-3xl"
      title={g.name}
      description={b.lang === "en" ? officialName(register) : undefined}
      footer={
        <>
          <p className="mr-auto text-[11.5px] text-ink-faint leading-snug max-w-md">{w.footnote}</p>
          <button type="button" className={secondary} onClick={onClose}>
            {w.close}
          </button>
        </>
      }
    >
      <div className="-mt-1">
        <div
          ref={list}
          role="tablist"
          aria-label={w.tabs}
          className="flex items-center gap-1 border-b border-line/15 overflow-x-auto no-scrollbar -mx-1 px-1"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              go(tab + 1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              go(tab - 1);
            }
          }}
        >
          {tabs.map((label, i) => (
            <button
              key={label}
              type="button"
              role="tab"
              data-tab={i}
              aria-selected={tab === i}
              tabIndex={tab === i ? 0 : -1}
              onClick={() => setTab(i)}
              className={`relative px-3 h-10 inline-flex items-center text-[13px] font-semibold whitespace-nowrap transition-colors ${tab === i ? "text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {label}
              <span aria-hidden className={`absolute left-2 right-2 bottom-0 h-[2.5px] rounded-t-[2px] bg-amber transition-opacity ${tab === i ? "opacity-100" : "opacity-0"}`} />
            </button>
          ))}
        </div>
        <div key={tab} role="tabpanel" className="biz-guide pt-4 min-h-[16rem]">
          {tab < g.tabs.length ? (
            <Markup text={g.tabs[tab].body} />
          ) : (
            <div>
              <p className="text-[13px] text-ink-soft mb-3">{w.sourcesIntro}</p>
              <ul className="space-y-2">
                {g.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2.5 rounded-xl border border-line/10 px-3.5 py-2.5 hover:border-amber/40 hover:bg-amber/5 transition-colors">
                      <ExternalIcon className="w-4 h-4 mt-0.5 text-ink-faint group-hover:text-amber flex-shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-snug">{s.title}</span>
                        <span className="block text-[11.5px] text-ink-faint truncate">{new URL(s.url).hostname.replace(/^www\./, "")}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// --- The markup ------------------------------------------------------------------------------------------------------

type Block = { kind: "p" | "h" | "tip"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] } | { kind: "table"; rows: string[][] };

function blocksOf(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.split("\n")) {
    const l = line.trim();
    const last = out[out.length - 1];
    if (!l) {
      out.push({ kind: "p", text: "" });
      continue;
    }
    if (l.startsWith("## ")) out.push({ kind: "h", text: l.slice(3) });
    else if (l.startsWith("> ")) out.push({ kind: "tip", text: l.slice(2) });
    else if (l.startsWith("• ")) {
      if (last?.kind === "ul") last.items.push(l.slice(2));
      else out.push({ kind: "ul", items: [l.slice(2)] });
    } else if (/^\d+\.\s/.test(l)) {
      const item = l.replace(/^\d+\.\s/, "");
      if (last?.kind === "ol") last.items.push(item);
      else out.push({ kind: "ol", items: [item] });
    } else if (l.startsWith("|")) {
      const cells = l.split("|").slice(1, -1).map((c) => c.trim());
      if (last?.kind === "table") last.rows.push(cells);
      else out.push({ kind: "table", rows: [cells] });
    } else if (last?.kind === "p" && last.text) last.text += ` ${l}`;
    else out.push({ kind: "p", text: l });
  }
  return out.filter((x) => !(x.kind === "p" && !x.text));
}

/** **bold** inside a line. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-ink">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}

function Markup({ text }: { text: string }) {
  const blocks = blocksOf(text);
  return (
    <div className="space-y-3 text-[13.5px] leading-relaxed text-ink-soft">
      {blocks.map((x, i) => {
        if (x.kind === "h")
          return (
            <h3 key={i} className={`text-[14px] font-semibold text-ink ${i ? "pt-2" : ""}`}>
              {x.text}
            </h3>
          );
        if (x.kind === "tip")
          return (
            <p key={i} className="rounded-xl bg-amber/10 text-ink px-3.5 py-2.5 text-[13px] leading-relaxed">
              <Inline text={x.text} />
            </p>
          );
        if (x.kind === "ul")
          return (
            <ul key={i} className="space-y-1.5">
              {x.items.map((it, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-amber/70 flex-shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <Inline text={it} />
                  </span>
                </li>
              ))}
            </ul>
          );
        if (x.kind === "ol")
          return (
            <ol key={i} className="space-y-2">
              {x.items.map((it, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-px w-6 h-6 rounded-full bg-surface-2 text-ink text-[12px] font-bold tabular-nums flex items-center justify-center flex-shrink-0" aria-hidden>
                    {j + 1}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <Inline text={it} />
                  </span>
                </li>
              ))}
            </ol>
          );
        if (x.kind === "table") {
          const [head, ...rows] = x.rows;
          // Numbers sit on the right (a column whose cells end in digits).
          const right = head.map((_, c) => rows.some((r) => /\d[.,]\d{2}(\s\S+)?$/.test(r[c] ?? "")) && c > 0);
          return (
            <div key={i} className="overflow-x-auto rounded-xl border border-line/10 styled-scroll">
              <table className="w-full text-[12.5px] min-w-[32rem]">
                <thead>
                  <tr className="bg-surface-2 text-[10.5px] text-ink-faint uppercase tracking-wide">
                    {head.map((h, c) => (
                      <th key={c} scope="col" className={`px-3 py-2 font-bold ${right[c] ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, k) => (
                    <tr key={k} className="border-t border-line/10">
                      {r.map((cell, c) => (
                        <td key={c} className={`px-3 py-1.5 text-ink ${right[c] ? "text-right tabular-nums whitespace-nowrap" : ""} ${c === 0 ? "text-ink-faint tabular-nums" : ""}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={i}>
            <Inline text={x.text} />
          </p>
        );
      })}
    </div>
  );
}

export const GUIDE_CHECKED = CHECKED;
