// 1.42.0: Business, a PFA's registers (migration 0120), for the team of the sample user.
//   MOCK_BUSINESS=1        Business is on for the team, with a year and a half of books: the PFA set up (from June
//                          2025), its income source, 2025 (closed) and 2026's entries to the end of October (AdSense in
//                          USD at BNR's rate, brand deals, subscriptions, a car's fuel at 50%, CASS, a storno), three
//                          fixed assets (a camera from 2025, a laptop, a car capped at 1,500 lei a month), the inventory
//                          of 31.12.2025, a line of income in kind, a few documents and some history
//   MOCK_BUSINESS=fresh    on, nothing set up yet (the page starts with setting up the PFA)
//   MOCK_BUSINESS_ACCESS=maria:view,andrei:edit   who else the owner let in (default maria:view)
//   MOCK_NO_0120=1         as before migration 0120 (no such tables or functions)
// Writes stay with MOCK_WRITES=business_entries,business_profiles,… (see README). BNR's rates: /bnr/… (start the app with
// BNR_RATES_URL=http://127.0.0.1:54321/bnr/).

function businessFixtures({ TEAM, U, people, at }) {
  const mode = process.env.MOCK_BUSINESS || "";
  if (process.env.MOCK_NO_0120)
    return {
      tables: {},
      missing: ["team_features", "business_access", "business_profiles", "business_sources", "business_years", "business_assets", "business_entries", "business_inventories", "business_inventory_items", "business_files", "business_ref_lines", "business_history"],
      rpc: Object.fromEntries(["my_business_access", "business_set_year"].map((fn) => [fn, () => ({ __status: 404, __body: { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null } })])),
    };
  const on = !!mode;
  const byName = Object.fromEntries(people.map((p) => [p.username, p.id]));
  const access = on
    ? String(process.env.MOCK_BUSINESS_ACCESS ?? "maria:view")
        .split(",")
        .filter(Boolean)
        .map((x) => {
          const [who, level] = x.split(":");
          return { team_id: TEAM, user_id: byName[who] ?? who, can_edit: level === "edit", granted_by: U[0], granted_at: at(-20) };
        })
    : [];
  const id = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const SRC = id("b1000000", 1);
  const CAMERA = id("b2000000", 1);
  const LAPTOP = id("b2000000", 2);
  const CAR = id("b2000000", 3);
  const full = mode && mode !== "fresh";
  let n = 0;
  const entries = [];
  const add = (d, dir, ch, amount, kind, nature, explanation, doc, more = {}) => {
    n++;
    entries.push({
      id: id("b3000000", n),
      team_id: TEAM,
      entry_date: d,
      doc_type: doc[0],
      doc_number: doc[1],
      explanation,
      partner: more.partner ?? "",
      direction: dir,
      channel: ch,
      amount,
      vat_amount: 0,
      kind,
      nature,
      source_id: ["income", "expense", "asset"].includes(kind) ? SRC : null,
      deductible_pct: more.pct ?? (nature === "vehicle" ? 50 : 100),
      currency: more.cur ?? "RON",
      fx_amount: more.fx ?? null,
      fx_rate: more.rate ?? null,
      fx_rate_date: more.rateDate ?? null,
      asset_id: more.asset ?? null,
      reversal_of: more.rev ?? null,
      note: more.note ?? "",
      created_at: `${d}T${String(9 + (n % 8)).padStart(2, "0")}:00:00Z`,
      created_by: U[0],
      updated_at: `${d}T12:00:00Z`,
      updated_by: U[0],
    });
    return id("b3000000", n);
  };
  if (full) {
    // 2025: the PFA starts in June.
    add("2025-06-10", "in", "cash", 8000, "contribution", "", "Aport numerar titular la începerea activității", ["receipt", "1"]);
    add("2025-06-12", "in", "bank", 8000, "transfer", "", "Depunere numerar în cont", ["bank_statement", "1"]);
    add("2025-06-12", "out", "cash", 8000, "transfer", "", "Depunere numerar în cont", ["receipt", "2"]);
    add("2025-06-20", "out", "bank", 6450, "asset", "", "Cameră foto Sony A7 IV — achiziție mijloc fix", ["invoice", "FOTO 2231"], { asset: CAMERA, partner: "F64 Studio SRL" });
    add("2025-07-04", "in", "bank", 3120.4, "income", "advertising", "Încasare Google AdSense, iunie", ["bank_statement", "2"], { cur: "USD", fx: 720, rate: 4.3339, rateDate: "2025-07-03", partner: "Google Ireland Ltd." });
    add("2025-08-05", "in", "bank", 3480.7, "income", "advertising", "Încasare Google AdSense, iulie", ["bank_statement", "3"], { cur: "USD", fx: 795, rate: 4.3782, rateDate: "2025-08-04", partner: "Google Ireland Ltd." });
    add("2025-09-15", "in", "bank", 5000, "income", "sponsorship", "Colaborare campanie toamnă — Brand Y", ["invoice", "VPL 0001"], { partner: "Brand Y SRL" });
    add("2025-10-03", "out", "bank", 289.99, "expense", "software", "Abonament Adobe Creative Cloud", ["invoice", "IE-48810"], { partner: "Adobe Systems Software Ireland" });
    add("2025-11-28", "out", "bank", 450, "expense", "accounting", "Servicii contabilitate", ["invoice", "CTB 112"], { partner: "Contabil Expert SRL" });
    add("2025-12-30", "out", "bank", 12.5, "expense", "bank", "Comision administrare cont", ["bank_statement", "8"]);
    // 2026.
    add("2026-01-05", "in", "bank", 4382.1, "income", "advertising", "Încasare Google AdSense, decembrie 2025", ["bank_statement", "1"], { cur: "USD", fx: 1000, rate: 4.3821, rateDate: "2026-01-02", partner: "Google Ireland Ltd." });
    add("2026-01-08", "out", "bank", 289.99, "expense", "software", "Abonament Adobe Creative Cloud", ["invoice", "IE-55821"], { partner: "Adobe Systems Software Ireland" });
    add("2026-01-12", "out", "bank", 8999, "asset", "", "Laptop MacBook Pro 14\" — achiziție mijloc fix", ["invoice", "EMG 4471200"], { asset: LAPTOP, partner: "Dante International SA" });
    add("2026-01-15", "out", "bank", 500, "transfer", "", "Retragere numerar pentru casă", ["bank_statement", "1"]);
    add("2026-01-15", "in", "cash", 500, "transfer", "", "Retragere numerar pentru casă", ["receipt", "1"]);
    add("2026-01-20", "out", "cash", 120, "expense", "protocol", "Masă de protocol cu Brand X", ["fiscal_receipt", "0045"]);
    add("2026-01-31", "out", "bank", 12.5, "expense", "bank", "Comision administrare cont", ["bank_statement", "1"]);
    add("2026-02-03", "in", "bank", 7500, "income", "sponsorship", "Colaborare campanie Brand X (contract 12/2026)", ["invoice", "VPL 0002"], { partner: "Brand X SRL" });
    add("2026-02-10", "out", "bank", 450, "expense", "vehicle", "Combustibil", ["fiscal_receipt", "OMV 2210"]);
    add("2026-02-15", "out", "bank", 2430, "tax", "", "Plată CASS 2026 (anticipat)", ["payment_order", "3"], { partner: "ANAF" });
    const wrong = add("2026-02-20", "out", "bank", 300, "expense", "software", "Abonament plătit de două ori", ["invoice", "X-1"]);
    add("2026-03-02", "out", "bank", 12000, "asset", "", "Autoturism Dacia Duster (avans)", ["invoice", "AUTO 77"], { asset: CAR, partner: "Auto Center SRL" });
    add("2026-03-05", "in", "bank", 6200.75, "income", "advertising", "Încasare Google AdSense, februarie", ["bank_statement", "3"], { cur: "USD", fx: 1420.5, rate: 4.3652, rateDate: "2026-03-04", partner: "Google Ireland Ltd." });
    add("2026-03-09", "out", "bank", 500, "transfer", "", "Retragere numerar pentru casă", ["bank_statement", "3"]);
    add("2026-03-09", "in", "cash", 500, "transfer", "", "Retragere numerar pentru casă", ["receipt", "1"]);
    add("2026-03-10", "out", "bank", -300, "expense", "software", "Stornare (Factură X-1, 20.02.2026): Abonament plătit de două ori", ["invoice", "X-1"], { rev: wrong });
    add("2026-03-18", "out", "cash", 85, "expense", "materials", "Baterii și carduri de memorie", ["fiscal_receipt", "2201"]);
    add("2026-04-04", "in", "bank", 5233.2, "income", "advertising", "Încasare Google AdSense, martie", ["bank_statement", "4"], { cur: "USD", fx: 1200, rate: 4.361, rateDate: "2026-04-03", partner: "Google Ireland Ltd." });
    add("2026-04-15", "out", "bank", 1199, "expense", "equipment", "Microfon Shure MV7+", ["invoice", "EMG 4512011"], { partner: "Dante International SA" });
    add("2026-04-21", "out", "bank", 89.9, "expense", "telecom", "Abonament telefon și internet", ["invoice", "ORG 8812"], { partner: "Orange Romania SA" });
    add("2026-05-06", "in", "bank", 4810.55, "income", "advertising", "Încasare Google AdSense, aprilie", ["bank_statement", "5"], { cur: "USD", fx: 1102.3, rate: 4.3641, rateDate: "2026-05-05", partner: "Google Ireland Ltd." });
    add("2026-05-12", "in", "bank", 9800, "income", "sponsorship", "Colaborare Brand Z — 2 videoclipuri", ["invoice", "VPL 0003"], { partner: "Brand Z SRL" });
    add("2026-05-20", "out", "bank", 640, "expense", "travel", "Cazare filmare Brașov", ["invoice", "BKG 99812"], { partner: "Booking.com B.V." });
    add("2026-05-26", "out", "bank", 4120, "tax", "", "Impozit pe venit și CAS 2025 (Declarația unică)", ["payment_order", "7"], { partner: "ANAF" });
    add("2026-06-04", "in", "bank", 5120.3, "income", "advertising", "Încasare Google AdSense, mai", ["bank_statement", "6"], { cur: "USD", fx: 1180, rate: 4.3392, rateDate: "2026-06-03", partner: "Google Ireland Ltd." });
    add("2026-06-10", "out", "bank", 520, "expense", "vehicle", "Combustibil și ITP", ["fiscal_receipt", "PETROM 77"]);
    add("2026-06-30", "out", "bank", 12.5, "expense", "bank", "Comision administrare cont", ["bank_statement", "6"]);
    add("2026-07-03", "in", "bank", 6890.4, "income", "advertising", "Încasare Google AdSense, iunie", ["bank_statement", "7"], { cur: "USD", fx: 1590, rate: 4.3336, rateDate: "2026-07-02", partner: "Google Ireland Ltd." });
    add("2026-07-15", "out", "bank", 450, "expense", "accounting", "Servicii contabilitate", ["invoice", "CTB 140"], { partner: "Contabil Expert SRL" });
    add("2026-07-22", "out", "bank", 159, "expense", "software", "Epidemic Sound (anual)", ["invoice", "EPI-2026-7781"], { partner: "Epidemic Sound AB" });
    add("2026-08-05", "in", "bank", 7012.15, "income", "advertising", "Încasare Google AdSense, iulie", ["bank_statement", "8"], { cur: "USD", fx: 1611, rate: 4.3527, rateDate: "2026-08-04", partner: "Google Ireland Ltd." });
    add("2026-08-19", "in", "bank", 6500, "income", "sponsorship", "Integrare Brand Y", ["invoice", "VPL 0004"], { partner: "Brand Y SRL" });
    add("2026-08-28", "out", "cash", 210, "expense", "protocol", "Cină de lucru cu agenția", ["fiscal_receipt", "8812"]);
    add("2026-09-04", "in", "bank", 6644.6, "income", "advertising", "Încasare Google AdSense, august", ["bank_statement", "9"], { cur: "USD", fx: 1530, rate: 4.3429, rateDate: "2026-09-03", partner: "Google Ireland Ltd." });
    add("2026-09-15", "out", "bank", 2430, "tax", "", "Plată CASS 2026 (a doua tranșă)", ["payment_order", "11"], { partner: "ANAF" });
    add("2026-09-23", "out", "bank", 64.99, "expense", "software", "Canva Pro", ["invoice", "", ], { partner: "Canva Pty Ltd" });
    add("2026-10-05", "in", "bank", 7301.8, "income", "advertising", "Încasare Google AdSense, septembrie", ["bank_statement", "10"], { cur: "USD", fx: 1665.2, rate: 4.3849, rateDate: "2026-10-02", partner: "Google Ireland Ltd." });
    add("2026-10-12", "out", "bank", 1500, "withdrawal", "", "Retragere titular", ["payment_order", "14"]);
    add("2026-10-20", "out", "bank", 380, "expense", "other", "Recuzită filmare", ["fiscal_receipt", "1199"]);
  }
  const asset = (aid, no, name, details, code, document, acquired, inService, value, life, method, car) => ({
    id: aid,
    team_id: TEAM,
    inventory_no: no,
    name,
    details,
    catalog_code: code,
    document,
    acquired_on: acquired,
    in_service_on: inService,
    value,
    life_months: life,
    method,
    car_cap: car,
    disposed_on: null,
    disposal_note: "",
    created_at: `${acquired}T10:00:00Z`,
    created_by: U[0],
    updated_at: `${acquired}T10:00:00Z`,
    updated_by: U[0],
  });
  const assets = full
    ? [
        asset(CAMERA, "MF-1", "Cameră foto Sony A7 IV", "Body + obiectiv 28-70 mm, s/n 4021187", "2.1.26.2", "Factură FOTO 2231 din 20.06.2025", "2025-06-20", "2025-06-20", 6450, 108, "linear", false),
        asset(LAPTOP, "MF-2", "Laptop MacBook Pro 14\"", "M4 Pro, 24 GB, 1 TB", "2.2.9", "Factură EMG 4471200 din 12.01.2026", "2026-01-12", "2026-01-12", 8999, 24, "linear", false),
        asset(CAR, "MF-3", "Autoturism Dacia Duster", "1.3 TCe, 2026", "2.3.2.1.1", "Factură AUTO 77 din 02.03.2026", "2026-03-02", "2026-03-10", 98000, 60, "linear", true),
      ]
    : [];
  const INV = id("b4000000", 1);
  const items = full
    ? [
        { item_group: "fixed_asset", name: "Cameră foto Sony A7 IV (nr. inventar MF-1)", quantity: 1, unit: "buc.", value: 6450, document: "Factură FOTO 2231 din 20.06.2025" },
        { item_group: "cash", name: "Numerar în casă", quantity: null, unit: "", value: 0, document: "" },
        { item_group: "bank", name: "Disponibil în conturi bancare", quantity: null, unit: "", value: 12398.61, document: "Extras de cont la 31.12.2025" },
        { item_group: "receivable", name: "Factură VPL 0005 neîncasată — Brand Z SRL", quantity: null, unit: "", value: 2500, document: "Factură VPL 0005" },
      ].map((it, i) => ({ id: id("b5000000", i + 1), team_id: TEAM, inventory_id: INV, position: i, note: "", created_by: U[0], created_at: "2025-12-31T18:00:00Z", updated_by: U[0], updated_at: "2025-12-31T18:00:00Z", ...it }))
    : [];
  const files = full
    ? [
        { id: id("b6000000", 1), team_id: TEAM, entry_id: entries[10].id, asset_id: null, path: `${TEAM}/${entries[10].id}/a1b2c3d4-extras-ianuarie.pdf`, name: "Extras ianuarie.pdf", size: 182_311, mime: "application/pdf", created_at: "2026-01-06T09:00:00Z", created_by: U[0], business_entries: { entry_date: entries[10].entry_date } },
        { id: id("b6000000", 2), team_id: TEAM, entry_id: entries[11].id, asset_id: null, path: `${TEAM}/${entries[11].id}/e5f6a7b8-adobe.pdf`, name: "Adobe IE-55821.pdf", size: 64_220, mime: "application/pdf", created_at: "2026-01-08T09:00:00Z", created_by: U[0], business_entries: { entry_date: entries[11].entry_date } },
        { id: id("b6000000", 3), team_id: TEAM, entry_id: null, asset_id: LAPTOP, path: `${TEAM}/${LAPTOP}/c9d0e1f2-factura-laptop.pdf`, name: "Factura laptop.pdf", size: 120_004, mime: "application/pdf", created_at: "2026-01-12T09:00:00Z", created_by: U[0], business_entries: null },
      ]
    : [];
  const history = full
    ? [
        { id: 3, team_id: TEAM, item: "entry", item_id: entries[entries.length - 1].id, action: "add", changed_by: U[0], changed_at: at(-8, 11), before: null, after: entries[entries.length - 1] },
        { id: 2, team_id: TEAM, item: "year", item_id: "2025", action: "close", changed_by: U[0], changed_at: "2026-03-20T10:00:00Z", before: { year: 2025, closed_at: null }, after: { year: 2025, closed_at: "2026-03-20T10:00:00Z" } },
        ...[entries.find((e) => e.explanation === "Combustibil")].filter(Boolean).map((fuel) => ({ id: 1, team_id: TEAM, item: "entry", item_id: fuel.id, action: "change", changed_by: U[0], changed_at: "2026-02-11T10:00:00Z", before: { ...fuel, amount: 405 }, after: fuel })),
      ]
    : [];
  return {
    missing: [],
    tables: {
      team_features: on ? [{ team_id: TEAM, feature: "business", enabled_by: U[0], enabled_at: at(-30) }] : [],
      business_access: access,
      business_profiles: full
        ? [
            {
              team_id: TEAM,
              name: "MARIN EDUARD PERSOANĂ FIZICĂ AUTORIZATĂ",
              holder: "Marin Eduard",
              cui: "45123456",
              reg_no: "F40/1234/2025",
              address: "Str. Exemplului nr. 1, bl. A, sc. 2, ap. 10, Sector 3, București",
              caen: "5911 — Activități de producție video",
              regime: "real",
              vat: "special",
              activity_start: "2025-06-01",
              keeps_cash: true,
              opening_date: "2025-06-01",
              opening_cash: 0,
              opening_bank: 0,
              fx_rule: "previous",
              updated_by: U[0],
              updated_at: "2025-06-01T10:00:00Z",
            },
          ]
        : [],
      business_sources: full ? [{ id: SRC, team_id: TEAM, name: "Creare de conținut", category: "independent", archived: false, position: 0, created_at: "2025-06-01T10:00:00Z" }] : [],
      business_years: full ? [{ team_id: TEAM, year: 2025, closed_at: "2026-03-20T10:00:00Z", closed_by: U[0], rectified: false }] : [],
      business_assets: assets,
      business_entries: entries,
      business_inventories: full ? [{ id: INV, team_id: TEAM, taken_on: "2025-12-31", kind: "year_end", note: "Inventariere făcută de titular.", created_by: U[0], created_at: "2025-12-31T18:00:00Z", updated_by: U[0], updated_at: "2025-12-31T18:00:00Z" }] : [],
      business_inventory_items: items,
      business_files: files,
      business_ref_lines: full ? [{ id: id("b7000000", 1), team_id: TEAM, year: 2026, source_id: SRC, kind: "income", label: "Venituri în natură: produse primite de la Brand Z (valoare de piață)", amount: 1800, note: "Proces-verbal 3/2026", created_by: U[0], created_at: "2026-05-12T10:00:00Z", updated_by: U[0], updated_at: "2026-05-12T10:00:00Z" }] : [],
      business_history: history,
    },
    rpc: {
      // As 0120: nothing while it's off; the owner; whoever was given it.
      my_business_access: (b, F) => {
        // On while the team has its team_features row (Developer → Features adds and removes it, with MOCK_WRITES).
        const isOn = F?.tables?.team_features ? F.tables.team_features.some((f) => f.team_id === b?.p_team && f.feature === "business") : on;
        if (!isOn || b?.p_team !== TEAM) return null;
        const me = F?.user?.id;
        if (me === U[0]) return "owner";
        const row = (F?.tables?.business_access ?? access).find((a) => a.user_id === me);
        return row ? (row.can_edit ? "edit" : "view") : null;
      },
    },
  };
}

/** BNR's XML for every banking day of a year up to `to` (a few currencies, rates that move a little). */
function bnrXml(year, to) {
  const out = [];
  const start = Date.UTC(year, 0, 1);
  const end = Math.min(Date.parse(`${to}T00:00:00Z`), Date.UTC(year, 11, 31));
  for (let t = start, k = 0; t <= end; t += 86_400_000, k++) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const wave = Math.sin(k / 9) * 0.02;
    const day = d.toISOString().slice(0, 10);
    out.push(
      `<Cube date="${day}"><Rate currency="EUR">${(5.08 + wave).toFixed(4)}</Rate><Rate currency="USD">${(4.36 + wave * 1.4).toFixed(4)}</Rate><Rate currency="GBP">${(5.85 + wave).toFixed(4)}</Rate><Rate currency="HUF" multiplier="100">${(1.29 + wave / 10).toFixed(4)}</Rate></Cube>`
    );
  }
  return `<?xml version="1.0" encoding="utf-8"?><DataSet xmlns="http://www.bnr.ro/xsd"><Header><Publisher>National Bank of Romania</Publisher></Header><Body><Subject>Reference rates</Subject><OrigCurrency>RON</OrigCurrency>${out.join("")}</Body></DataSet>`;
}

module.exports = { businessFixtures, bnrXml };
