// 1.56.0: Affiliates. The owner (Nov 25 2026): "i want an affiliate page where i can add this. i want to be able to add
// the name, link the video of the product that we did, either long or short, the product link, the code, percentage
// and a way to add credentials and a link to the affiliate platform for each of these. the credentials should only be
// seen by the master or by who i choose that can see them from the team, come up with great security things, make
// sure that we have a table view and card view and all the things from shorts with the multi select and so on".
// The rules (what's typed, pasted, exported), the sealing of logins and the unlock (for real, with a key made here;
// they're server-only, so this file runs itself again with the react-server condition), and how it's all wired.
// The database's own rules: supabase/tests/affiliates.test.sql.
// 1.57.0: Sponsorships (the same page, renamed): what kind of deal, every video on the channel, the product's picture
// (the owner, Nov 26 2026). The database's rules for them: supabase/tests/sponsorships.test.sql. 1.58.0: companies
// with their products ("i want a group of products as the company and then i want to be able to add products"), the
// company's code or a product's own, verified on each product: supabase/tests/sponsorship-products.test.sql.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

if (!process.env.AFFILIATES_TEST_CHILD) {
  const r = spawnSync("npx", ["--yes", "tsx", "--conditions=react-server", __filename], {
    stdio: "inherit",
    env: { ...process.env, AFFILIATES_TEST_CHILD: "1" },
    shell: process.platform === "win32",
  });
  process.exit(r.status ?? 1);
}

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

(async () => {
  const R = await import("../modules/affiliates/lib/rules");

  // ---- Links ------------------------------------------------------------------------------------------------------------
  const url: [string, string | null | false][] = [
    ["gravastar.com/products/k98", "https://gravastar.com/products/k98"],
    ["https://abxylute.com/products/p5?utm_campaign=e54441&utm_source=discord", "https://abxylute.com/products/p5?utm_campaign=e54441&utm_source=discord"],
    ["http://shop.example.com", "http://shop.example.com"],
    ["https://tidd.ly/4sQBz9e.", "https://tidd.ly/4sQBz9e."],
    ["  https://s.click.aliexpress.com/e/_c3KVhKBD  ", "https://s.click.aliexpress.com/e/_c3KVhKBD"],
    ["shop.com:8080/x", "https://shop.com:8080/x"],
    ["", null],
    ["javascript:alert(1)", false],
    ["JAVASCRIPT:alert(1)", false],
    ["data:text/html,<script>alert(1)</script>", false],
    ["mailto:hi@example.com", false],
    ["ftp://files.example.com", false],
    ["https://user:secret@example.com", false],
    ["https://exa mple.com", false],
    ["localhost:3000/x", false],
    ["nothing", false],
    [`https://example.com/${"a".repeat(2000)}`, false],
  ];
  for (const [given, want] of url) ok(R.normalizeUrl(given) === want, `a link: ${JSON.stringify(given.slice(0, 60))} → ${JSON.stringify(R.normalizeUrl(given))}`);
  ok(R.domainOf("https://www.Gravastar.com/products/x") === "gravastar.com" && R.pathOf("https://www.gravastar.com/products/x?a=1") === "/products/x?a=1" && R.pathOf("https://x.com/") === "", "where a link goes, and the rest");
  ok(R.percentNumber("10%") === 10 && R.percentNumber("12,5 %") === 12.5 && R.percentNumber("$5 USD OFF") === null && R.percentNumber(null) === null, "a percentage as a number (or not one)");
  // 1.58.0: "i shouldnt need to write % on my own, just the number and the symbol should appear there automatically".
  const pcts: [string, string][] = [
    ["10", "10%"],
    [" 12,5 ", "12,5%"],
    ["7.5 %", "7.5%"],
    ["15%", "15%"],
    ["$5 USD OFF", "$5 USD OFF"],
    [" $400 flat ", "$400 flat"],
    ["10 off", "10 off"],
    ["", ""],
  ];
  for (const [given, want] of pcts) ok(R.pctOf(given) === want, `a deal: ${JSON.stringify(given)} → ${JSON.stringify(R.pctOf(given))}`);
  ok(R.pctOf(null) === null && R.pctField("10%") === "10" && R.pctField("12,5 %") === "12,5" && R.pctField("$5 USD OFF") === "$5 USD OFF" && R.pctField(null) === "", "the field shows the number alone (it adds the %)");
  ok(R.pctTyped("10") && R.pctTyped(" 12.5 ") && !R.pctTyped("10%") && !R.pctTyped("$5") && !R.pctTyped(""), "…and its % beside a number");
  ok(/affiliates_pct\(p_deal text\)/.test(read("supabase/migrations/0137_sponsorship_products.sql")) && (read("supabase/migrations/0137_sponsorship_products.sql").match(/new\.percentage := public\.affiliates_pct\(new\.percentage\);/g) ?? []).length === 2, "the database keeps it so too (companies and products)");

  // ---- A company and a product, as typed (1.58.0) -------------------------------------------------------------------------
  const CO = "20000000-0000-4000-8000-000000000001";
  const good = R.cleanCompany({ name: "  Gravastar ", code: " VIVERRO ", percentage: "10%", platformUrl: "", notes: " " });
  ok("ok" in good && good.ok.name === "Gravastar" && good.ok.code === "VIVERRO" && good.ok.percentage === "10%" && good.ok.platformUrl === null && good.ok.notes === null, "a company tidied: trimmed, blanks are nothing");
  const typedPct = R.cleanCompany({ name: "A", percentage: " 12 " });
  ok("ok" in typedPct && typedPct.ok.percentage === "12%", "a company's deal typed as a number: a percentage");
  ok("error" in R.cleanCompany({ name: "  " }) && "error" in R.cleanCompany({ name: "x".repeat(121) }) && "error" in R.cleanCompany({ name: "A", platformUrl: "javascript:alert(1)" }), "a company: a name (with a limit), a platform that's a web address");
  const prod = R.cleanProduct({ companyId: CO, name: "  K98  PRO ", productUrl: "gravastar.com/k98", code: "IGNORED", percentage: "5%", status: "", notes: " ", projectId: "", shortId: null });
  ok("ok" in prod && prod.ok.name === "K98 PRO" && prod.ok.productUrl === "https://gravastar.com/k98" && prod.ok.status === "active" && prod.ok.notes === null && prod.ok.projectId === null && prod.ok.companyId === CO, "a product tidied: trimmed, https added, blanks are nothing, Active");
  ok("ok" in prod && prod.ok.ownCode === false && prod.ok.code === null && prod.ok.percentage === null, "…the company's code unless it says its own (what's typed for its own isn't kept then)");
  const own = R.cleanProduct({ companyId: CO, name: "Keycaps", ownCode: true, code: " KEYS5 ", percentage: "5" });
  ok("ok" in own && own.ok.ownCode && own.ok.code === "KEYS5" && own.ok.percentage === "5%", "its own code and deal (a number: a percentage)");
  const ownNone = R.cleanProduct({ companyId: CO, name: "Review unit", ownCode: true, code: "", percentage: "" });
  ok("ok" in ownNone && ownNone.ok.ownCode && ownNone.ok.code === null, "…or its own, none (a review, say)");
  ok("error" in R.cleanProduct({ companyId: CO, name: "A", ownCode: true, code: "x".repeat(101) }), "its own code has the limit too");
  ok("error" in R.cleanProduct({ name: "A" }) && "error" in R.cleanProduct({ companyId: "not-a-company", name: "A" }), "a product is a company's");
  ok("error" in R.cleanProduct({ companyId: CO, name: "  " }) && "error" in R.cleanProduct({ companyId: CO, name: "x".repeat(121) }), "a product needs a name (with a limit)");
  ok("error" in R.cleanProduct({ companyId: CO, name: "A", productUrl: "javascript:alert(1)" }), "a product link that isn't a web address is refused");
  ok("error" in R.cleanProduct({ companyId: CO, name: "A", status: "gone" }), "an unknown status is refused");
  ok("error" in R.cleanProduct({ companyId: CO, name: "A", projectId: "1; drop table" }), "a video is an id");
  const both = R.cleanProduct({ companyId: CO, name: "A", projectId: "40000000-0000-4000-8000-000000000001", shortId: "50000000-0000-4000-8000-000000000001" });
  ok("ok" in both && !!both.ok.projectId && !!both.ok.shortId, "a long video and a Short, both");
  ok(
    JSON.stringify(R.dealOf({ ownCode: false, code: null, percentage: null }, { code: "VIVERRO", percentage: "10%" })) === '{"code":"VIVERRO","percentage":"10%","own":false}' &&
      JSON.stringify(R.dealOf({ ownCode: true, code: "KEYS5", percentage: "5%" }, { code: "VIVERRO", percentage: "10%" })) === '{"code":"KEYS5","percentage":"5%","own":true}',
    "the code a product goes by: the company's, or its own"
  );
  // The brand, as the database groups the rows from before (0137 affiliates_brand_of: the same cases).
  const brands: [string, string][] = [
    ["Gravastar K98 PRO", "Gravastar"],
    ["Deepcool.com", "Deepcool"],
    ["  Yunzii   M2 Mouse ", "Yunzii"],
    ["Arzopa", "Arzopa"],
    ["The Ridge Wallet", "The Ridge"],
    ["the oodie", "the oodie"],
    ["Keychron: Q1 Max", "Keychron"],
    ["Razer - Kishi", "Razer"],
    ["The", "The"],
    ["", ""],
    ["Promeed.CO Silk", "Promeed"],
  ];
  for (const [given, want] of brands) ok(R.brandOf(given) === want, `a name's brand: ${JSON.stringify(given)} → ${JSON.stringify(R.brandOf(given))}`);
  const sqlBrand = read("supabase/migrations/0137_sponsorship_products.sql");
  ok(/lower\(words\[1\]\) in \('the', 'a', 'an', 'my', 'mr', 'mrs', 'ms', 'dr', 'la', 'le', 'el', 'les', 'los', 'las', 'die', 'der', 'das'\)/.test(sqlBrand) && /\\\.\(com\|net\|org\|io\|co\|shop\|store\|ro\|eu\|de\|uk\|us\|ca\|au\|fr\|it\|es\|nl\|pl\|tech\|gg\|tv\|me\|app\)\$/.test(sqlBrand), "…the same words and endings as the database's");

  // ---- A login, as typed (never kept like this) -------------------------------------------------------------------------
  const none = R.cleanLogin({ username: " ", password: "", notes: "" });
  ok("ok" in none && none.ok === null, "nothing typed: no login");
  const login = R.cleanLogin({ username: " viverro@example.com ", password: " pa ss ", notes: " backup 1234 " });
  ok("ok" in login && login.ok?.username === "viverro@example.com" && login.ok?.password === " pa ss " && login.ok?.notes === "backup 1234", "the password exactly as typed (spaces and all), the rest trimmed");
  ok("error" in R.cleanLogin({ password: "a\nb" }) && "error" in R.cleanLogin({ password: "x".repeat(501) }) && "error" in R.cleanLogin({ username: "x".repeat(201) }), "one line, and limits");

  // ---- Pasted from the owner's spreadsheet (as Google Sheets copies it) ----------------------------------------------------
  const sheet = [
    "Name\tProduct Link\tCode\tPercentage",
    "Abxylute.com\thttps://abxylute.com/products/p5-wireless-controller?utm_campaign=e54441&utm_source=disco\tviverroVIP\t$5 USD OFF",
    "Gravastar.com\thttps://www.gravastar.com/products/mercury-k98-pro-mechanical-gaming-keyboard-phantom-bla\tVIVERRO\t10%",
    "Gravastar.com\thttps://www.gravastar.com/products/mercury-k98-pro-mechanical-gaming-keyboard-phantom-bla\tVIVERRO\t10%",
    "Deepcool.com\thttps://www.deepcool.com/products/Cooling/cpuliquidcoolers/LQ360-ULTRA-ARGB-360mm-Dash\t-\t-",
    "Promeed.com\thttps://tidd.ly/4sQBz9e.\tviverro15\t15%",
    "Arzopa\thttps://s.click.aliexpress.com/e/_c3KVhKBD\t-\t-",
    "Yunzii\thttps://yunzii-mechanical-keyboard.myshopify.com/discount/viverro\tviverro\t5%",
    "\t\t\t",
  ].join("\r\n");
  const pasted = R.parsePasted(sheet);
  ok(pasted.header && pasted.rows.length === 7 && pasted.rows.every((r) => r.fields), `the owner's sheet: 7 affiliates, the first row the headings (${pasted.rows.length})`);
  const deep = pasted.rows.find((r) => r.name === "Deepcool.com")?.fields;
  ok(!!deep && deep.code === null && deep.percentage === null, "“-” is an empty cell");
  ok(pasted.rows[0].fields?.percentage === "$5 USD OFF" && pasted.rows[0].fields?.code === "viverroVIP", "a deal that isn't a percentage stays as written");
  ok(R.parsePasted("Name\tCode\tPercentage\nGravastar K98\tVIVERRO\t10").rows[0].fields?.percentage === "10%", "a pasted number: a percentage");
  const noHead = R.parsePasted("Brand A\tbrand-a.com\tCODE\t20%\tdashboard.brand-a.com\tpaid monthly");
  ok(!noHead.header && noHead.rows[0].fields?.productUrl === "https://brand-a.com" && noHead.rows[0].fields?.platformUrl === "https://dashboard.brand-a.com" && noHead.rows[0].fields?.notes === "paid monthly", "without headings: name, link, code, percentage, platform, notes");
  const csvIn = R.parsePasted('code,name,percentage\nX1,"Shop, Inc.",10%');
  ok(csvIn.header && csvIn.rows[0].fields?.name === "Shop, Inc." && csvIn.rows[0].fields?.code === "X1", "commas and quotes too, columns in any order");
  ok(R.parsePasted("Ok\tjavascript:alert(1)").rows[0].error !== null, "a bad row says what's wrong");
  ok(R.parsePasted(Array.from({ length: 250 }, (_, i) => `Brand ${i}`).join("\n")).rows.length === 200, "200 at most at once");
  // 1.58.0: each row a product, with its company: a Company column, else its brand.
  ok(pasted.rows.map((r) => r.fields?.company).join() === "Abxylute,Gravastar,Gravastar,Deepcool,Promeed,Arzopa,Yunzii", "the owner's sheet: each row's company is its brand");
  const withCo = R.parsePasted("Company\tName\tCode\nGravastar\tK98 PRO\tVIVERRO\nGravastar\t\t-");
  ok(withCo.rows[0].fields?.company === "Gravastar" && withCo.rows[0].fields?.name === "K98 PRO" && withCo.rows[1].fields?.name === "Gravastar", "a Company column: the company; a row without a name is named by it");
  const existing = [
    { id: "c-grava", name: "Gravastar", code: "VIVERRO", percentage: "10%" },
    { id: "c-p1", name: "Promeed.com", code: "viverro15", percentage: "15%" },
    { id: "c-p2", name: "Promeed Silk", code: null, percentage: null },
  ];
  const fields = (rows: string) => R.parsePasted(rows).rows.map((r) => r.fields!);
  const plan = R.planImport(
    fields(
      [
        "Name\tProduct Link\tCode\tPercentage",
        "Gravastar Mercury Mouse\tgravastar.com/m\tVIVERRO\t10",
        "Gravastar Alpha65\tgravastar.com/a\tALPHA\t12%",
        "Gravastar Keycaps\tgravastar.com/k\t-\t-",
        "Razer Mat\trazer.com/m\tMAT\t5%",
        "Razer Kishi\trazer.com/k\tRZR\t8%",
        "Razer Viper\trazer.com/v\tRZR\t8%",
        "Promeed Pillow\tpromeed.com/p\t-\t-",
      ].join("\n")
    ),
    existing
  );
  const grava = plan.find((g) => g.name === "Gravastar");
  ok(plan.length === 3 && grava?.id === "c-grava" && grava.products.length === 3, "pasted rows put with a company here already, by its brand");
  ok(grava?.products.map((p) => `${p.name}:${p.ownCode ? p.code : "company"}`).join() === "Gravastar Mercury Mouse:company,Gravastar Alpha65:ALPHA,Gravastar Keycaps:company", "the company's code, or one of its own (none: the company's)");
  const razer = plan.find((g) => g.name === "Razer");
  ok(razer?.id === null && razer.code === "RZR" && razer.percentage === "8%" && razer.products.filter((p) => p.ownCode).map((p) => p.code).join() === "MAT", "a new company: the code most of its rows have; the others keep their own");
  ok(plan.some((g) => g.name === "Promeed" && g.id === null), "a brand two companies here go by (Promeed.com, Promeed Silk): a new one, not a guess");
  ok(R.planImport(fields("Company\tName\nPromeed.com\tPillow"), existing)[0].id === "c-p1" && R.planImport(fields("Company\tName\npromeed silk\tPillow"), existing)[0].id === "c-p2", "…its exact name finds it (whatever the case)");


  // ---- Out of the page ----------------------------------------------------------------------------------------------------
  type Co = import("../modules/affiliates/lib/rules").Company;
  type Pr = import("../modules/affiliates/lib/rules").Product;
  const pr = (over: Partial<Pr> & { name: string }): Pr => ({
    id: `60000000-0000-4000-8000-${String(Math.random()).slice(2, 14).padEnd(12, "0")}`,
    companyId: CO,
    kinds: ["affiliate"],
    status: "active",
    productUrl: null,
    ownCode: false,
    code: null,
    percentage: null,
    long: null,
    short: null,
    picture: null,
    pictureOff: false,
    check: null,
    notes: null,
    createdAt: "2026-11-20T10:00:00Z",
    updatedAt: "2026-11-20T10:00:00Z",
    ...over,
  });
  const co = (over: Partial<Co> & { name: string }, products: Pr[] = []): Co => ({
    id: CO,
    code: "VIVERRO",
    percentage: "10%",
    platformUrl: "https://impact.com",
    notes: null,
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
    login: { updatedAt: "2026-11-20T10:00:00Z", by: "Edu" },
    ...over,
    products: products.map((p) => ({ ...p, companyId: over.id ?? CO })),
  });
  const gravastar = co({ name: "Gravastar" }, [pr({ name: "K98 PRO", productUrl: "https://gravastar.com/k98" }), pr({ name: "Mercury", productUrl: "https://gravastar.com/m" }), pr({ name: "Keycaps", productUrl: "https://gravastar.com/k", ownCode: true, code: "KEYS5", percentage: "5%" })]);
  const abx = co({ id: "20000000-0000-4000-8000-000000000002", name: "Abxylute", code: "viverroVIP", percentage: "$5 USD OFF" }, [pr({ name: "P5", productUrl: "https://abxylute.com/p5" })]);
  const deepco = co({ id: "20000000-0000-4000-8000-000000000003", name: "Deepcool", code: null, percentage: null }, [pr({ name: "LQ360" })]);
  ok(
    R.descriptionText(R.itemsOf([gravastar, abx, deepco])) ===
      "K98 PRO: https://gravastar.com/k98\nMercury: https://gravastar.com/m\nCode VIVERRO (10% off)\n\nKeycaps: https://gravastar.com/k\nCode KEYS5 (5% off)\n\nP5: https://abxylute.com/p5\nCode viverroVIP ($5 USD OFF)\n\nLQ360",
    "the lines for a video's description: a company's code once under its products, a product's own under it"
  );
  ok(R.companyDescription(co({ name: "Keychron", code: "KEY10" })) === "Keychron\nCode KEY10 (10% off)" && R.companyDescription(abx) === "P5: https://abxylute.com/p5\nCode viverroVIP ($5 USD OFF)", "a company's lines: its products', or (none yet) its name and code");
  ok(R.csvCell("=HYPERLINK(\"http://evil\")") === `"'=HYPERLINK(""http://evil"")"` && R.csvCell("+1") === "'+1" && R.csvCell("@x") === "'@x" && R.csvCell("a,b") === '"a,b"' && R.csvCell(null) === "", "a spreadsheet cell can't be a formula");
  const csv = R.sponsorshipsCsv(R.itemsOf([co({ name: "Gravastar" }, [pr({ name: "K98 PRO", notes: "=cmd" }), pr({ name: "Keycaps", ownCode: true, code: "KEYS5", percentage: "5%", check: { result: "works", by: "Ana", at: "2026-11-25T09:00:00Z" } })])]));
  ok(csv.startsWith("Company,Name,Type,Product link,Code,Percentage,Status,Verified,Long video,Short,Affiliate platform,Notes\r\n"), "the spreadsheet's columns: the company first");
  ok(/^Gravastar,K98 PRO,Affiliate,,VIVERRO,10%,Active,Not verified,,,https:\/\/impact\.com,'=cmd\r$/m.test(csv) && /^Gravastar,Keycaps,Affiliate,,KEYS5,5%,Active,"Verified \(2026-11-25, Ana\)",/m.test(csv), "a row per product: the code it goes by, verified or not and who checked it, the company's platform (the formula defused)");
  ok(!/login|password|username|Edu/i.test(csv), "never a login in the spreadsheet");
  ok(R.parsePasted(csv.replace(/^.*?\r\n/, "Company,Name,Type,Product link,Code,Percentage,Status,Verified,Long video,Short,Affiliate platform,Notes\r\n")).rows.every((r) => r.fields?.company === "Gravastar"), "the sheet this page exports pastes back in, with its companies");

  // ---- The list (1.58.0: companies, each with the products that pass) ---------------------------------------------------
  const long12 = { kind: "long" as const, source: "team" as const, id: "p", number: 12, title: "Keyboard review", stageLabel: "Publish", watchUrl: null, thumb: null };
  const shortK98 = { kind: "short" as const, source: "channel" as const, id: "Short136_bb", number: null, title: "K98 in 30s", stageLabel: "On the channel", watchUrl: "https://www.youtube.com/shorts/Short136_bb", thumb: null };
  const zeta = co({ id: "c1", name: "Zeta", code: null, login: null, createdAt: "2026-10-01T00:00:00Z" }, [pr({ id: "z1", name: "Zeta one", status: "paused", createdAt: "2026-11-01T00:00:00Z" })]);
  const alpha = co({ id: "c2", name: "alpha", createdAt: "2026-10-02T00:00:00Z" }, [
    pr({ id: "a1", name: "Alpha keyboard", kinds: ["affiliate", "review"], createdAt: "2026-11-03T00:00:00Z", long: long12 }),
    pr({ id: "a2", name: "Alpha mouse", createdAt: "2026-10-20T00:00:00Z", check: { result: "works", by: "Ana", at: "2026-11-25T09:00:00Z" } }),
  ]);
  const beta = co({ id: "c3", name: "Beta", createdAt: "2026-10-03T00:00:00Z" }, [pr({ id: "b1", name: "Beta pad", kinds: ["review"], status: "ended", createdAt: "2026-11-02T00:00:00Z", short: shortK98, ownCode: true, check: { result: "broken", by: null, at: "2026-11-24T09:00:00Z" } })]);
  const empty = co({ id: "c4", name: "Empty Co", login: null, createdAt: "2026-11-04T00:00:00Z" }, []);
  const list = [zeta, alpha, beta, empty];
  const ids = (cs: ReturnType<typeof R.applyFilters>) => cs.map((c) => `${c.id}:${c.products.map((p) => p.id).join("+")}`).join(",");
  const f = R.readFilters({});
  ok(ids(R.applyFilters(list, f)) === "c4:,c2:a1+a2,c3:b1,c1:z1", `newest first by default: a company by its newest product, its products newest first (${ids(R.applyFilters(list, f))})`);
  ok(ids(R.applyFilters(list, { ...f, sort: "name" })) === "c2:a1+a2,c3:b1,c4:,c1:z1", "A to Z, whatever the case");
  ok(R.applyFilters(list, f).find((c) => c.id === "c2")?.total === 2, "each company says how many products it has in all");
  ok(ids(R.applyFilters(list, R.readFilters({ status: "ended" }))) === "c3:b1", "by status: a product's (companies without one go)");
  ok(ids(R.applyFilters(list, R.readFilters({ video: "long" }))) === "c2:a1" && ids(R.applyFilters(list, R.readFilters({ video: "none" }))) === "c1:z1,c2:a2", "by video (in order of what shows: alpha's newest without one is older than Zeta's)");
  ok(ids(R.applyFilters(list, R.readFilters({ code: "1" }))) === "c2:a1+a2", "with a code: the one it goes by (Zeta has none; Beta's own is none)");
  ok(ids(R.applyFilters(list, R.readFilters({ login: "1" }))) === "c2:a1+a2,c3:b1", "with a login: the company's");
  ok(ids(R.applyFilters(list, R.readFilters({ q: "#12" }))) === "c2:a1" && ids(R.applyFilters(list, R.readFilters({ q: "k98 in" }))) === "c3:b1", "found by a video's number or title: only that product");
  ok(ids(R.applyFilters(list, R.readFilters({ q: "ALPHA" }))) === "c2:a1+a2" && ids(R.applyFilters(list, R.readFilters({ q: "empty" }))) === "c4:", "a company found by its name: all of its products (none too)");
  ok(ids(R.applyFilters(list, R.readFilters({ q: "mouse" }))) === "c2:a2" && R.applyFilters(list, R.readFilters({ q: "mouse" }))[0].total === 2, "a product found by its name: only it, with its company (which still says how many it has)");
  ok(ids(R.applyFilters(list, R.readFilters({ q: "viverro" }))) === "c4:,c2:a1+a2,c3:b1", "…a company by its code (one without products too)");
  ok(ids(R.applyFilters(list, R.readFilters({ type: "review" }))) === "c2:a1,c3:b1" && ids(R.applyFilters(list, R.readFilters({ type: "affiliate" }))) === "c2:a1+a2,c1:z1" && R.applyFilters(list, R.readFilters({ type: "paid" })).length === 0, "the kind's tab: each product in all of its kinds' tabs; companies without one go");
  ok(ids(R.applyFilters(list, R.readFilters({ q: "review" }))) === "c2:a1,c3:b1", "found by its kind too");
  ok(
    ids(R.applyFilters(list, R.readFilters({ checked: "works" }))) === "c2:a2" && ids(R.applyFilters(list, R.readFilters({ checked: "broken" }))) === "c3:b1" && ids(R.applyFilters(list, R.readFilters({ checked: "none" }))) === "c2:a1,c1:z1" && R.readFilters({ checked: "sometimes" }).checked === null,
    "Filters → Verified: each product's (anything else is no filter)"
  );
  ok(R.filtersHref(R.readFilters({ checked: "none" }), { sort: "name" }) === "/sponsorships?checked=none&sort=name" && R.checkState(pr({ name: "x" })) === "none" && R.CHECK_LABEL.none === "Not verified" && R.CHECK_LABEL.broken === "Not working", "the address and the words");
  const weird = R.readFilters({ type: "barter", status: "x", video: "y", sort: "z", q: "q".repeat(500) });
  ok(weird.kind === null && weird.status === null && weird.video === null && weird.sort === "newest" && weird.q.length === 100, "anything unknown in the address is no filter");
  ok(
    R.filtersHref(R.readFilters({ status: "paused", q: "grava" }), { sort: "name" }, "grid") === "/sponsorships?status=paused&sort=name&q=grava&view=grid" &&
      R.filtersHref(f) === "/sponsorships" &&
      R.filtersHref(R.readFilters({ type: "review", status: "active" }), { kind: "paid" }) === "/sponsorships?type=paid&status=active",
    "the address for a filter (the tab's kind kept with the rest)"
  );
  // Folded companies: the viewer's own, in a cookie.
  ok(R.closedKey("20000000-0000-4000-8000-0000AbCd1234") === "abcd1234" && R.writeClosed(["abcd1234", "abcd1234", "<script>", "00000002"]) === "abcd1234.00000002" && [...R.readClosed("abcd1234.00000002.bad;x.0000000z")].join() === "abcd1234,00000002" && R.readClosed(undefined).size === 0, "folded companies: the ids' random end, kept tidy (nothing else read back)");
  ok(R.writeClosed(Array.from({ length: 500 }, (_, i) => i.toString(16).padStart(8, "0"))).split(".").length === 350, "…350 at most (a cookie's room)");

  // ---- 1.57.0: what kind of deal --------------------------------------------------------------------------------------------
  ok(JSON.stringify(R.cleanKinds(["paid", "affiliate", "paid"])) === '["affiliate","paid"]' && R.cleanKinds([]) === null && R.cleanKinds(["barter"]) === null && JSON.stringify(R.cleanKinds("review")) === '["review"]', "kinds: known ones, in order, no repeats; none is nothing");
  ok(
    JSON.stringify(R.kindsFromText("Review")) === '["review"]' &&
      JSON.stringify(R.kindsFromText("affiliate + paid")) === '["affiliate","paid"]' &&
      JSON.stringify(R.kindsFromText("Sponsored, gifted")) === '["review","paid"]' &&
      R.kindsFromText("barter").length === 0,
    "a sheet's Type cell, as people write it"
  );
  const k1 = R.cleanProduct({ companyId: CO, name: "A", kinds: ["review", "affiliate"] });
  ok("ok" in k1 && k1.ok.kinds.join() === "affiliate,review", "the window's kinds, in order");
  ok("error" in R.cleanProduct({ companyId: CO, name: "A", kinds: [] }) && "error" in R.cleanProduct({ companyId: CO, name: "A", kinds: ["affiliate", "barter"] }), "never none, never an unknown one");
  const k0 = R.cleanProduct({ companyId: CO, name: "A" });
  ok("ok" in k0 && k0.ok.kinds.join() === "affiliate" && k0.ok.picture === "keep", "nothing said: an affiliate (as everything was before), the picture as it is");
  const typed = R.parsePasted("Name\tType\tCode\nDeepcool.com\tReview\t-\nGravastar.com\t\tVIVERRO", ["paid"]);
  ok(typed.header && typed.rows[0].fields?.kinds.join() === "review" && typed.rows[1].fields?.kinds.join() === "paid", "pasted: a Type column, else the tab it's pasted on");
  ok(R.parsePasted(sheet).rows.every((r) => r.fields?.kinds.join() === "affiliate"), "pasted on All: affiliates");

  // ---- 1.57.0: every video on the channel ---------------------------------------------------------------------------------
  const yt: [string, string | null][] = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["youtube.com/shorts/Short136_bb", "Short136_bb"],
    ["https://m.youtube.com/live/Long136_aaa?feature=share", "Long136_aaa"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/@viverro", null],
    ["https://evil.example.com/watch?v=dQw4w9WgXcQ", null],
    ["keyboard", null],
  ];
  for (const [given, want] of yt) ok(R.youtubeIdOf(given) === want, `a YouTube link: ${given} → ${R.youtubeIdOf(given)}`);
  const ch = R.cleanProduct({ companyId: CO, name: "A", longYoutubeId: "Long136_aaa", shortId: "50000000-0000-4000-8000-000000000001" });
  ok("ok" in ch && ch.ok.longYoutubeId === "Long136_aaa" && ch.ok.projectId === null && !!ch.ok.shortId, "a long video only on the channel, a Short of the team's");
  ok("error" in R.cleanProduct({ companyId: CO, name: "A", longYoutubeId: "not an id!" }) && "error" in R.cleanProduct({ companyId: CO, name: "A", projectId: "40000000-0000-4000-8000-000000000001", longYoutubeId: "Long136_aaa" }), "a channel video is an id, and one per place");
  ok(R.choiceThumb({ thumb: null, youtubeId: "Long136_aaa" }) === "https://i.ytimg.com/vi/Long136_aaa/mqdefault.jpg" && R.choiceThumb({ thumb: "https://x.example.com/t.jpg", youtubeId: "Long136_aaa" }) === "https://x.example.com/t.jpg" && R.choiceThumb({ thumb: null, youtubeId: null }) === null, "a video's picture: its own, else YouTube's");

  // ---- 1.57.0: the product's picture --------------------------------------------------------------------------------------
  const pics: [string, string | null | false][] = [
    ["https://cdn.shopify.com/s/files/1/k98.png?v=1", "https://cdn.shopify.com/s/files/1/k98.png?v=1"],
    ["http://abxylute.com/cdn/shop/files/P5.png?v=2", "https://abxylute.com/cdn/shop/files/P5.png?v=2"],
    ["//ae01.alicdn.com/kf/x.jpg", "https://ae01.alicdn.com/kf/x.jpg"],
    ["", null],
    ["javascript:alert(1)", false],
    ["data:image/png;base64,AAAA", false],
    ["https://192.168.1.1/admin.png", false],
    ["https://127.0.0.1/x.png", false],
    ["https://[::1]/x.png", false],
    ["https://localhost/x.png", false],
    ["https://router.local/x.png", false],
    ["https://intranet/x.png", false],
    ["https://user:pw@shop.example.com/x.png", false],
    ["https://shop.example.com:8443/x.png", false],
    ["https://shop.example.com/a b.png", false],
  ];
  for (const [given, want] of pics) ok(R.normalizePicture(given) === want, `a picture's link: ${JSON.stringify(given)} → ${JSON.stringify(R.normalizePicture(given))}`);
  ok(R.smallPicture("https://abxylute.com/cdn/shop/files/P5.png?v=2", 64) === "https://abxylute.com/cdn/shop/files/P5.png?v=2&width=64" && R.smallPicture("https://cdn.shopify.com/s/files/1/k98.png?width=1200", 80) === "https://cdn.shopify.com/s/files/1/k98.png?width=80" && R.smallPicture("https://ae01.alicdn.com/kf/x.jpg", 64) === "https://ae01.alicdn.com/kf/x.jpg", "a smaller copy where the shop's picture server makes one");
  const choose = R.cleanProduct({ companyId: CO, name: "A", picture: { url: "http://shop.example.com/p.jpg", source: "link" } });
  ok("ok" in choose && typeof choose.ok.picture === "object" && choose.ok.picture.url === "https://shop.example.com/p.jpg", "a pasted picture, on https");
  ok("error" in R.cleanProduct({ companyId: CO, name: "A", picture: { url: "https://10.0.0.5/p.jpg", source: "link" } }) && "error" in R.cleanProduct({ companyId: CO, name: "A", picture: { url: "https://x.example.com/p.jpg", source: "elsewhere" } }) && "error" in R.cleanProduct({ companyId: CO, name: "A", picture: "sometimes" }), "never a picture inside a network, never an unknown kind of change");
  const P = await import("../modules/affiliates/lib/picture-parse");
  const page = (head: string, body = "") => `<!doctype html><html><head><title>P5</title>${head}</head><body>${body}</body></html>`;
  const base = "https://abxylute.com/products/p5-wireless-controller";
  ok(P.pictureOf(page('<meta property="og:image" content="http://abxylute.com/cdn/shop/files/a.png"><meta property="og:image:secure_url" content="https://abxylute.com/cdn/shop/files/b.png">'), base) === "https://abxylute.com/cdn/shop/files/b.png", "the page's sharing picture (the https one first)");
  ok(P.pictureOf(page('<meta property="og:image" content="/cdn/shop/files/c.png?v=1&amp;w=2">'), base) === "https://abxylute.com/cdn/shop/files/c.png?v=1&w=2", "…found where the page is");
  ok(P.pictureOf(page('<meta name="twitter:image" content="https://cdn.example.com/t.jpg">'), base) === "https://cdn.example.com/t.jpg", "…or its Twitter one");
  const ld = (j: unknown) => page("", `<script type="application/ld+json">${JSON.stringify(j)}</script>`);
  ok(P.pictureOf(ld({ "@context": "https://schema.org", "@type": "Product", name: "LQ360", image: ["https://www.deepcool.com/i/lq360.png", "https://www.deepcool.com/i/2.png"] }), base) === "https://www.deepcool.com/i/lq360.png", "a product's own picture (JSON-LD)");
  ok(P.pictureOf(ld({ "@graph": [{ "@type": "WebPage" }, { "@type": ["Product"], image: { "@type": "ImageObject", url: "https://x.example.com/p.jpg" } }] }), base) === "https://x.example.com/p.jpg", "…in a graph, as an ImageObject");
  ok(P.pictureOf(page("", '<script type="application/ld+json">{ not json</script><link rel="image_src" href="https://x.example.com/s.jpg">'), base) === "https://x.example.com/s.jpg", "…else image_src (a broken JSON-LD is passed over)");
  ok(P.pictureOf(page('<meta property="og:image" content="https://192.168.0.10/p.png">'), base) === null && P.pictureOf(page('<meta property="og:image" content="javascript:alert(1)">'), base) === null, "never a picture inside a network, never a script");
  ok(P.pictureOf(page(""), base) === null, "a page without one: none");
  ok(P.refreshOf(page('<meta http-equiv="refresh" content="0; URL=\'https://promeed.com/products/x?awc=1\'">'), "https://tidd.ly/4sQBz9e") === "https://promeed.com/products/x?awc=1" && P.refreshOf(page('<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'), base) === null && P.refreshOf(page(""), base) === null, "a page that sends the browser on");
  // The server never reads an address inside a network or the machine itself (lib/web-page.ts), whatever the link says.
  const W = await import("../lib/web-page");
  const pub = (u: string) => W.publicUrl(new URL(u));
  ok(pub("https://abxylute.com/products/p5") && pub("http://shop.example.com:80/x") && !pub("http://127.0.0.1/x") && !pub("http://[::1]/x") && !pub("http://169.254.169.254/latest/meta-data/") && !pub("http://10.0.0.8/x") && !pub("http://localhost:3000/x") && !pub("http://router.local/") && !pub("https://shop.example.com:8443/x") && !pub("ftp://x.example.com/") && !pub("https://u:p@x.example.com/"), "only public pages, on the usual ports");
  const Pic = await import("../modules/affiliates/lib/pictures");
  const t0 = Date.now();
  ok((await Pic.findPicture("http://127.0.0.1:3456/aff.html")) === null && (await Pic.findPicture("http://localhost:3456/")) === null && (await Pic.findPicture("http://169.254.169.254/latest/meta-data/")) === null && (await Pic.findPicture("not a link")) === null && Date.now() - t0 < 2000, "a product link inside a network: nothing is read, at once");

  // ---- Who, and what it says ------------------------------------------------------------------------------------------------
  ok(R.canManageAffiliates(["master"], false) && R.canManageAffiliates(["editor"], true) && !R.canManageAffiliates(["editor", "publisher"], false) && !R.canManageAffiliates(null, true), "masters, and the people they let in");
  ok(R.eventText({ action: "copied_password", who: "Ana", whom: null, affiliate: "Gravastar" }) === "Ana copied Gravastar's password" && R.eventText({ action: "granted", who: "You", whom: "Mihai", affiliate: null }) === "You let Mihai in" && R.eventText({ action: "deleted", who: "You", whom: null, affiliate: null }) === "You deleted a company, with its login", "the activity in words");

  // ---- Sealing a login, for real --------------------------------------------------------------------------------------------
  const key = "a1".repeat(32);
  process.env.SOCIAL_TOKEN_KEY = key;
  const V = await import("../modules/affiliates/lib/vault");
  const T = "10000000-0000-4000-8000-0000000135a0";
  const A1 = "20000000-0000-4000-8000-0000000135a1";
  const A2 = "20000000-0000-4000-8000-0000000135a2";
  const me = { username: "viverro@example.com", password: "Hunter2! with spaces ", notes: "backup: 1234-5678" };
  const sealed = V.sealLogin(T, A1, me);
  const DB_RULE = /^av1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/;
  ok(DB_RULE.test(sealed) && sealed.length <= 12000, "sealed as the database's rule wants it (affiliate_logins_sealed_ok)");
  ok(!sealed.includes("viverro") && !sealed.includes("Hunter2"), "nothing of it readable");
  const back = V.openLogin(T, A1, sealed);
  ok(back.username === me.username && back.password === me.password && back.notes === me.notes, "it opens again, exactly");
  ok(V.sealLogin(T, A1, me) !== sealed, "sealed twice, two different values (a new IV each time)");
  const throws = (f: () => unknown) => {
    try {
      f();
      return false;
    } catch {
      return true;
    }
  };
  ok(throws(() => V.openLogin(T, A2, sealed)), "moved to another affiliate, it won't open");
  ok(throws(() => V.openLogin("10000000-0000-4000-8000-0000000135b0", A1, sealed)), "moved to another team, it won't open");
  const parts = sealed.split(".");
  const flipped = parts[3].slice(0, -2) + (parts[3].slice(-2) === "AA" ? "AB" : "AA");
  ok(throws(() => V.openLogin(T, A1, [parts[0], parts[1], parts[2], flipped].join("."))), "changed, it won't open");
  ok(throws(() => V.openLogin(T, A1, `${sealed}.x`)) && throws(() => V.openLogin(T, A1, "av1.x.y.z")) && throws(() => V.openLogin(T, A1, "hunter2")), "anything else isn't a sealed login");
  const len = (s: string) => Buffer.from(s.split(".")[3], "base64url").length;
  ok(len(V.sealLogin(T, A1, { username: "a", password: "b", notes: "" })) === len(V.sealLogin(T, A1, { username: "a", password: "bbbbbbbbbbbbbbbbbbbb", notes: "" })) && len(sealed) % 64 === 0, "how long a password is doesn't show (padded to 64 bytes)");
  process.env.SOCIAL_TOKEN_KEY = "b2".repeat(32);
  ok(throws(() => V.openLogin(T, A1, sealed)), "another server key doesn't open it");
  process.env.SOCIAL_TOKEN_KEY = "";
  ok(!V.vaultReady() && throws(() => V.sealLogin(T, A1, me)), "no key on the server: nothing is sealed");
  process.env.SOCIAL_TOKEN_KEY = key;

  // ---- The unlock -------------------------------------------------------------------------------------------------------------
  const U = "00000000-0000-4000-8000-0000000135a1";
  const S = "60000000-0000-4000-8000-0000000135a1";
  const now = Date.now();
  const until = now + 15 * 60_000;
  const token = V.unlockToken(U, S, until);
  ok(V.unlockedUntil(token, U, S, 15, now) === until, "unlocked: until when");
  ok(V.unlockedUntil(token, "00000000-0000-4000-8000-0000000135a2", S, 15, now) === null, "someone else's unlock doesn't count");
  ok(V.unlockedUntil(token, U, "60000000-0000-4000-8000-0000000135a2", 15, now) === null && V.unlockedUntil(token, U, null, 15, now) === null, "another sign-in's doesn't either");
  ok(V.unlockedUntil(token, U, S, 15, until + 1) === null, "past its 15 minutes: locked");
  const far = now + 60 * 60_000;
  ok(V.unlockedUntil(V.unlockToken(U, S, far), U, S, 15, now) === null, "one made to last longer than an unlock is refused");
  ok(V.unlockedUntil(`${until}.${"0".repeat(64)}`, U, S, 15, now) === null && V.unlockedUntil(`${until + 1}.${token.split(".")[1]}`, U, S, 15, now) === null && V.unlockedUntil("", U, S, 15, now) === null, "a forged or changed one is refused");

  // ---- How it's wired ---------------------------------------------------------------------------------------------------------
  const actions = read("app/(dashboard)/sponsorships/actions.ts");
  const fn = (name: string) => actions.slice(actions.indexOf(`export async function ${name}`), actions.indexOf("\nexport ", actions.indexOf(`export async function ${name}`) + 10));
  ok(/const rights = await affiliateRights\(supabase, teamId, user\.id, membership\.roles\);/.test(actions), "who may do what is read from the database each time");
  const opener = fn("openAffiliateLogin");
  ok(/if \(!c\.manage\) return \{ error: NO_LOGINS \};/.test(opener) && /const until = await unlockedFor\(c\.supabase, c\.user\.id\);\s*if \(!until\) return \{ error: LOCKED, locked: true \};/.test(opener), "opening a login: let in, and unlocked");
  ok(/c\.supabase\.rpc\("affiliate_login_open", \{ p_affiliate: affiliateId, p_how: how \}\)/.test(opener) && /openSealed\(c\.teamId, affiliateId, data\)/.test(opener), "the database checks again and writes it down; opened for this team and affiliate only");
  ok(/if \(how === "copied_password"\) return \{ password: login\.password, until \};/.test(opener) && /if \(how === "copied_username"\) return \{ username: login\.username, until \};/.test(opener), "copying one part hands over only that part");
  ok(/overLimit\("affiliate-login-open", c\.user\.id, 40, 60_000\)/.test(opener), "and how many a minute");
  const unlock = fn("unlockLogins");
  ok(/await confirmPassword\(c\.user, password\)/.test(unlock) && /httpOnly: true,\s*sameSite: "strict",/.test(unlock) && /path: UNLOCK_PATH,/.test(unlock) && /maxAge: UNLOCK_MINUTES \* 60,/.test(unlock), "the unlock: the password (sign-in limits), then a cookie only the server reads, for /sponsorships, 15 minutes");
  ok(/export const UNLOCK_PATH = "\/sponsorships";/.test(read("modules/affiliates/lib/vault.ts")) && /export const SPONSORSHIPS_PATH = "\/sponsorships";/.test(read("modules/affiliates/lib/rules.ts")), "…sent nowhere else (the page's own address)");
  const save = fn("saveCompany");
  ok(/if \(kept\.has\(id\) && !\(await unlockedFor\(c\.supabase, c\.user\.id\)\)\) return \{ error: LOCKED, locked: true \};/.test(save) && save.indexOf("unlockedFor") < save.indexOf('from("affiliates")'), "replacing or removing a company's kept login needs the unlock, checked before anything is written");
  ok(/sealLogin\(c\.teamId, savedId, sealing\)/.test(save) && /affiliate_login_save/.test(save), "a login is sealed before the database sees it");
  ok(/withLogins\(c, wanted\)\)\.size && !\(await unlockedFor/.test(fn("deleteCompanies")), "deleting a company with a login needs the unlock");
  ok(!/unlockedFor|withLogins/.test(fn("deleteProducts")) && /from\("affiliate_products"\)\.delete\(\)/.test(fn("deleteProducts")), "deleting products doesn't (their company keeps the login)");
  for (const name of ["saveCompany", "deleteCompanies", "saveProduct", "deleteProducts", "moveProducts", "setProductsStatus", "setProductsKinds", "setProductsChecked", "importSponsorships"])
    ok(/const c = await caller\(teamId\);[\s\S]*?if \(!c\.manage\) return \{ error: NO_MANAGE \};/.test(fn(name)), `${name}: the people let in, read from the database`);
  ok(/\.eq\("team_id", c\.teamId\)\.neq\("affiliate_id", companyId\)/.test(fn("moveProducts")), "moving products: this team's, to another company (the database keeps them in the team)");
  ok(/planImport\(\s*clean,/.test(fn("importSponsorships")) && /percentage: pctOf\(c\.percentage\)/.test(fn("importSponsorships")) && /cleanPasted\(r\)/.test(fn("importSponsorships")) && /if \(made\.size\) await c\.supabase\.from\("affiliates"\)\.delete\(\)/.test(fn("importSponsorships")), "a paste: each row checked again, put with its companies as the window showed; nothing half-added");
  ok(/if \(!c\.master\) return \{ error: "Only masters choose who manages sponsorships\." \};/.test(fn("setAffiliateAccess")) && /kind: "affiliate_access"/.test(fn("setAffiliateAccess")) && /href: SPONSORSHIPS_PATH/.test(fn("setAffiliateAccess")), "only Masters let people in; they're told (and sent to the page)");
  ok(/if \(!c\.master\) return \{ error: "Only masters see who used the logins\." \};/.test(fn("affiliateLoginActivity")), "only Masters read the activity");
  // 1.57.0: pictures and videos, only for the people who manage sponsorships; the server reads only public pages.
  const finder = fn("findProductPicture");
  ok(/if \(!c\.manage\) return \{ error: NO_MANAGE \};/.test(finder) && /overLimit\("affiliate-picture", c\.user\.id, 30, 60_000\)/.test(finder) && /const url = normalizeUrl\(productUrl\);/.test(finder), "a picture is looked for by the people let in, a few a minute, for a web address");
  ok(/if \(!c\.manage\) return \{ error: NO_MANAGE \};/.test(fn("affiliateVideoChoices")) && /readVideoChoices\(c\.supabase, c\.teamId\)/.test(fn("affiliateVideoChoices")), "the videos to link: the people let in, read as them");
  ok(/const clean = cleanKinds\(kinds\);/.test(fn("setProductsKinds")), "changing the kind: checked");
  ok(/if \(result !== null && !isCheckResult\(result\)\)/.test(fn("setProductsChecked")) && !/checked_by/.test(fn("setProductsChecked")) && /from\("affiliate_products"\)/.test(fn("setProductsChecked")), "marking verified: a known mark, on products; who is the database's");
  ok(/lookForPictures\(c\.teamId, \[savedId\]\)/.test(fn("saveProduct")) && /lookForPictures\(c\.teamId, /.test(fn("importSponsorships")) && !/lookForPictures/.test(fn("saveCompany")), "a product saved or pasted with a link and no picture: the server looks after answering");
  const pictures = read("modules/affiliates/lib/pictures.ts");
  ok(/^import "server-only";/.test(pictures) && /if \(!publicUrl\(url\)\) return null;/.test(pictures) && (pictures.match(/if \(!publicUrl\(next\)/g) ?? []).length === 2, "the server reads only public pages, each redirect checked before it's followed");
  ok(/admin\.rpc\("affiliate_product_pictures_claim"/.test(pictures) && /admin\.rpc\("affiliate_product_picture_found"/.test(pictures) && !/\.update\(\{ image_url/.test(pictures), "the background look goes through the database's two functions (on products)");
  const web = read("lib/web-page.ts");
  ok(/lookup: safeLookup as never/.test(web) && /all\.some\(\(a\) => isPrivateAddress\(a\.address\)\)/.test(web) && /if \(u\.port && u\.port !== "80" && u\.port !== "443"\) return false;/.test(web), "checked on the address the connection uses, ports 80 and 443 only");
  const preview = read("app/api/link-preview/route.ts");
  ok(/from "@\/lib\/web-page"/.test(preview) && !/function safeLookup/.test(preview), "the link previews read pages the same way (one reader, not two)");
  const sponsorPage = read("app/(dashboard)/sponsorships/page.tsx");
  ok(/if \(data\.needPictures\) \{[\s\S]*after\(\(\) => fillPictures\(teamId/.test(sponsorPage) && /export const maxDuration = 60;/.test(sponsorPage), "opening the page: pictures still missing are looked for after it's sent");
  const queries = read("modules/affiliates/lib/queries.ts");
  ok(!/affiliate_logins/.test(queries.replace(/\/\*[\s\S]*?\*\//g, "")) && /supabase\.rpc\("affiliate_login_states", \{ p_team: teamId \}\)/.test(queries), "the page never reads a login: only which ones have one");
  ok(/from\("affiliate_products"\)\.select\(PRODUCT_COLS\)/.test(queries) && /migration: error && notMigrated\(error\) \? "0136" : "0137"/.test(queries), "the products read with their companies (no products yet: which update is missing)");
  // No browser code reaches the server's secrets.
  const client = walk("modules/affiliates").filter((f) => /\.tsx?$/.test(f) && /^"use client";/.test(read(f)));
  ok(client.length >= 8, `the browser's parts (${client.length})`);
  for (const f of client) ok(!/from "\.\.\/lib\/(vault|queries)"|from "@\/modules\/affiliates\/lib\/(vault|queries)"/.test(read(f)), `${f}: nothing of the server's secrets`);
  ok(/^import "server-only";/.test(read("modules/affiliates/lib/vault.ts")) && /^import "server-only";/.test(read("modules/affiliates/lib/queries.ts")), "the vault and the queries are the server's alone");
  const ctx = read("modules/affiliates/components/affiliates-context.tsx");
  ok(/if \(shown && now >= shown\.hideAt\) setShown\(null\);/.test(ctx) && /document\.visibilityState === "hidden" && setShown\(null\)/.test(ctx) && /SHOWN_SECONDS \* 1000/.test(ctx), "a shown login goes after 30 seconds, or when the tab is left");
  ok(!/localStorage|sessionStorage/.test(ctx), "…and is never stored");
  ok(/new ClipboardItem\(\{ "text\/plain": blob \}\)/.test(ctx), "copying works on Safari too (the clipboard gets the promise in the click)");
  const dialog = read("modules/affiliates/components/affiliate-dialog.tsx");
  ok(/export function CompanyDialog/.test(dialog) && /const SECRET = \{ autoComplete: "off", spellCheck: false, autoCapitalize: "off", autoCorrect: "off", "data-1p-ignore": "", "data-lpignore": "true"/.test(dialog) && (dialog.match(/\{\.\.\.SECRET\}/g) ?? []).length === 3, "the company's window: the login's fields keep password managers and the spell checker out");
  ok(!/company\.login\.(username|password)/.test(dialog), "the window never shows a kept login");
  ok(/if \(fresh\) setProduct\(\{ companyId: id \}\);/.test(read("modules/affiliates/components/affiliates-context.tsx")), "a new company goes on to its first product");
  ok(/role="switch"/.test(read("modules/affiliates/components/logins-bar.tsx")), "Masters choose who manages affiliates");
  const picker = read("modules/affiliates/components/affiliates-picker.tsx");
  ok(/<ListPicker ids=\{items\.map\(\(i\) => i\.product\.id\)\}/.test(picker) && /<BarDelete/.test(picker) && /sponsorshipsCsv\(picked\)/.test(picker) && /descriptionText\(picked\)/.test(picker) && /deleteProducts\(ctx\.teamId, ids\)/.test(picker), "several products at once: copy, export, mark, delete (the shorts list's picking)");
  ok((picker.match(/<BarMenu/g) ?? []).length === 1 && /section: "Verified or not"/.test(picker) && /section: "Type \(only this one\)"/.test(picker) && /section: "Status"/.test(picker), "…one Mark menu (so it all fits the bar, a phone's too)");
  ok(/it\.section && it\.section !== items\[i - 1\]\?\.section/.test(read("components/ui/list-pick.tsx")), "a bar's menu can have sections");
  const body = read("modules/affiliates/components/affiliates-body.tsx");
  ok(/<AffiliatesTable companies=\{list\} manage=\{manage\} tab=\{f\.kind\} \/>/.test(body) && /<AffiliateCards companies=\{list\} manage=\{manage\} tab=\{f\.kind\} \/>/.test(body) && /<ViewToggle/.test(body) && /<FiltersMenu/.test(body) && /<PickAffiliatesButton \/>/.test(body) && /<FoldAll ids=\{list\.map\(\(c\) => c\.id\)\} \/>/.test(body), "a table and cards of companies, Filters, Select, fold all");
  ok(/<KindTabs/.test(body) && /DEAL_KINDS\.map\(\(k\) => \(\{ key: k, label: KIND_TAB\[k\]/.test(body), "tabs for the kinds of deal, over one list");
  ok(/setProductsKinds/.test(picker) && /setProductsKinds/.test(read("modules/affiliates/components/row-menu.tsx")), "the kind changed for several at once, or on one");
  const mark = read("modules/affiliates/components/brand-mark.tsx");
  ok(/referrerPolicy="no-referrer"/.test(mark) && /data-row-num=""/.test(mark) && /onError=\{\(\) => setFailed\(url\)\}/.test(mark), "the picture: asked for without saying where from; picking still puts the tick box there; the initial if it doesn't open");
  const productWindow = read("modules/affiliates/components/product-dialog.tsx");
  ok(/findProductPicture\(ctx\.teamId, url\)/.test(productWindow) && /<VideoField kind="long"/.test(productWindow) && /youtubeIdOf\(raw\)/.test(productWindow), "the product's window: the picture as soon as a link is typed; videos found by title, number or YouTube link");
  ok(/ariaLabel="The code it goes by"/.test(productWindow) && /onChange=\{\(v\) => setOwnCode\(v === "own"\)\}/.test(productWindow), "…the company's code, or its own (a button)");
  ok(/<RowPick id=\{p\.id\}/.test(read("modules/affiliates/components/affiliates-table.tsx")) && /<CardPick id=\{p\.id\}/.test(read("modules/affiliates/components/affiliate-cards.tsx")) && (read("modules/affiliates/components/company-head.tsx").match(/<GroupPick ids=\{c\.products\.map\(\(p\) => p\.id\)\}/g) ?? []).length === 2, "products are picked, a company's at once");
  // 1.57.1: the name gets the room: the product is its domain; the platform and its login, two small icons.
  const table = read("modules/affiliates/components/affiliates-table.tsx");
  const head = read("modules/affiliates/components/company-head.tsx");
  ok(/<OutLink url=\{p\.productUrl\} label=\{domainOf\(p\.productUrl\)\}/.test(table) && !/<PlatformLinks/.test(table) && !/<LoginCell/.test(table), "the table: a product's domain; the platform and login aren't on products");
  const companyRow = head.slice(head.indexOf("export function CompanyRow"), head.indexOf("export function CompanyHead"));
  ok((companyRow.match(/<PlatformLinks /g) ?? []).length === 1 && /md:col-start-3 xl:col-start-7/.test(companyRow), "…they're the company's, once (one login popover), in a column of their own");
  ok(/2xl:grid-cols-\[48px_minmax\(0,1fr\)_7rem_minmax\(0,9\.5rem\)_6rem_minmax\(0,15rem\)_minmax\(0,10rem\)_44px\]/.test(read("modules/affiliates/lib/table-cols.ts")), "a product's columns: Verified right after the name; no platform column (the company's row has it)");
  ok((table.match(/<VerifyChip /g) ?? []).length === 2 && /<VerifyChip product=\{p\} \/>/.test(read("modules/affiliates/components/affiliate-cards.tsx")), "verified or not on each product: its column (and the icon by the name on a phone), and on the cards");
  ok(/<FoldRow/.test(head) && /export function FoldRow/.test(read("modules/affiliates/components/company-fold.tsx")) && /closest\(OWN\)/.test(read("modules/affiliates/components/company-fold.tsx")), "a company's heading folds it (not its own controls)");
  ok(/document\.cookie = `\$\{SPONSORSHIPS_CLOSED_COOKIE\}=\$\{writeClosed\(next\)\}; path=\/sponsorships;/.test(read("modules/affiliates/components/affiliates-context.tsx")) && /readClosed\(jar\.get\(SPONSORSHIPS_CLOSED_COOKIE\)\?\.value\)/.test(read("app/(dashboard)/sponsorships/page.tsx")), "…kept for the next visit (the page reads it)");
  ok(/if \(!ctx\?\.manage\)\s*return \(\s*<span/.test(read("modules/affiliates/components/verify-chip.tsx")), "only the people let in can mark it; the others see it");
  ok(/truncate flex-shrink-0 max-w-\[calc\(100%-1rem\)\]/.test(read("modules/affiliates/components/bits.tsx")) && !/truncate flex-shrink-0 max-w-full/.test(read("modules/affiliates/components/bits.tsx")), "a long link's ↗ stays inside its column (the domain leaves it room)");
  ok(!/UserIcon/.test(read("modules/affiliates/components/login-cell.tsx")) && (read("modules/affiliates/components/login-cell.tsx").match(/<LockIcon /g) ?? []).length === 1, "the login: one small lock, on the company");
  const menu = read("modules/affiliates/components/row-menu.tsx");
  const companyMenu = menu.slice(menu.indexOf("export function CompanyMenu"), menu.indexOf("export function ProductMenu"));
  ok(/\{manage && c\.login && \(/.test(companyMenu) && /ctx\?\.copyPart\(c, "password"\)/.test(companyMenu) && /ctx\?\.show\(c\)/.test(companyMenu) && !/copyPart|show\(/.test(menu.slice(menu.indexOf("export function ProductMenu"))), "the login's show and copy, in the company's ⋯ for the people let in (not a product's)");
  ok(/if \(c\.login && !\(await ctx\.ensureUnlocked\(\)\)\) return;/.test(companyMenu) && /deleteCompanies\(ctx\.teamId, \[c\.id\]\)/.test(companyMenu), "deleting a company with a login: the password first");

  // The page, in the app.
  const nav = read("lib/nav-items.ts");
  ok(/\{ label: "Content", items: \[SHORTS, VIDEOS, SPONSORSHIPS\] \}/.test(nav) && /href: "\/sponsorships", label: "Sponsorships"/.test(nav), "in the menu, under Content, as Sponsorships");
  ok(/id: "sponsorships", kind: "page", title: "Sponsorships"/.test(read("lib/search/catalog.ts")), "search finds it");
  ok(/\[\/\^\\\/\(sponsorships\|affiliates\)\(\\\/\|\$\)\/, \(\) => <SponsorshipsLoading \/>\]/.test(read("app/(dashboard)/loading.tsx")), "the app's loading screen is the page's own on the way there");
  ok(/\{ source: "\/affiliates", destination: "\/sponsorships", permanent: false \}/.test(read("next.config.ts")) && /redirect\(`\/sponsorships/.test(read("app/(dashboard)/affiliates/page.tsx")), "an old link to Affiliates lands on Sponsorships");
  ok(!/"use server"/.test(read("app/(dashboard)/affiliates/actions.ts")) && !/"use server"/.test(read("app/(dashboard)/affiliates/view-mode-actions.ts")), "nothing of the old address still answers");
  ok(/case "affiliate_access":/.test(read("components/ui/notification-cards.tsx")), "the notification for being let in");
  const sql = read("supabase/migrations/0135_affiliates.sql");
  ok(/revoke all on public\.affiliate_logins from anon, authenticated;/.test(sql) && !/grant [^;]* on public\.affiliate_logins to/.test(sql), "the logins table: nothing for anyone signed in");
  ok(/create policy "masters read the login activity" on public\.affiliate_login_events for select to authenticated\s+using \(team_id in \(select public\.my_master_team_ids\(\)\)\);/.test(sql), "the activity: Masters read it");

  console.log(fails ? `${fails} failed` : "affiliates: all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
