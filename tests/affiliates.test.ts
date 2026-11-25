// 1.56.0: Affiliates. The owner (Nov 25 2026): "i want an affiliate page where i can add this. i want to be able to add
// the name, link the video of the product that we did, either long or short, the product link, the code, percentage
// and a way to add credentials and a link to the affiliate platform for each of these. the credentials should only be
// seen by the master or by who i choose that can see them from the team, come up with great security things, make
// sure that we have a table view and card view and all the things from shorts with the multi select and so on".
// The rules (what's typed, pasted, exported), the sealing of logins and the unlock (for real, with a key made here;
// they're server-only, so this file runs itself again with the react-server condition), and how it's all wired.
// The database's own rules: supabase/tests/affiliates.test.sql.
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

  // ---- An affiliate, as typed ------------------------------------------------------------------------------------------
  const good = R.cleanAffiliate({ name: "  Gravastar.com ", productUrl: "gravastar.com/k98", code: " VIVERRO ", percentage: "10%", status: "", platformUrl: "", notes: " ", projectId: "", shortId: null });
  ok("ok" in good && good.ok.name === "Gravastar.com" && good.ok.productUrl === "https://gravastar.com/k98" && good.ok.code === "VIVERRO" && good.ok.status === "active" && good.ok.platformUrl === null && good.ok.notes === null && good.ok.projectId === null, "tidied: trimmed, https added, blanks are nothing, Active");
  ok("error" in R.cleanAffiliate({ name: "  " }), "a name is needed");
  ok("error" in R.cleanAffiliate({ name: "x".repeat(121) }), "a name has a limit");
  ok("error" in R.cleanAffiliate({ name: "A", productUrl: "javascript:alert(1)" }), "a product link that isn't a web address is refused");
  ok("error" in R.cleanAffiliate({ name: "A", status: "gone" }), "an unknown status is refused");
  ok("error" in R.cleanAffiliate({ name: "A", projectId: "1; drop table" }), "a video is an id");
  const both = R.cleanAffiliate({ name: "A", projectId: "40000000-0000-4000-8000-000000000001", shortId: "50000000-0000-4000-8000-000000000001" });
  ok("ok" in both && !!both.ok.projectId && !!both.ok.shortId, "a long video and a Short, both");

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
  const noHead = R.parsePasted("Brand A\tbrand-a.com\tCODE\t20%\tdashboard.brand-a.com\tpaid monthly");
  ok(!noHead.header && noHead.rows[0].fields?.productUrl === "https://brand-a.com" && noHead.rows[0].fields?.platformUrl === "https://dashboard.brand-a.com" && noHead.rows[0].fields?.notes === "paid monthly", "without headings: name, link, code, percentage, platform, notes");
  const csvIn = R.parsePasted('code,name,percentage\nX1,"Shop, Inc.",10%');
  ok(csvIn.header && csvIn.rows[0].fields?.name === "Shop, Inc." && csvIn.rows[0].fields?.code === "X1", "commas and quotes too, columns in any order");
  ok(R.parsePasted("Ok\tjavascript:alert(1)").rows[0].error !== null, "a bad row says what's wrong");
  ok(R.parsePasted(Array.from({ length: 250 }, (_, i) => `Brand ${i}`).join("\n")).rows.length === 200, "200 at most at once");

  // ---- Out of the page ----------------------------------------------------------------------------------------------------
  const a = (over: Partial<import("../modules/affiliates/lib/rules").Affiliate>): import("../modules/affiliates/lib/rules").Affiliate => ({
    id: "20000000-0000-4000-8000-000000000001",
    name: "Gravastar.com",
    productUrl: "https://gravastar.com/k98",
    code: "VIVERRO",
    percentage: "10%",
    status: "active",
    platformUrl: "https://impact.com",
    notes: null,
    long: null,
    short: null,
    createdAt: "2026-11-20T10:00:00Z",
    updatedAt: "2026-11-20T10:00:00Z",
    login: { updatedAt: "2026-11-20T10:00:00Z", by: "Edu" },
    ...over,
  });
  ok(R.descriptionText([a({}), a({ name: "Abxylute.com", productUrl: "https://abxylute.com/p5", code: "viverroVIP", percentage: "$5 USD OFF" }), a({ name: "Deepcool.com", code: null, percentage: null })]) ===
    "Gravastar.com: https://gravastar.com/k98\nCode VIVERRO (10% off)\n\nAbxylute.com: https://abxylute.com/p5\nCode viverroVIP ($5 USD OFF)\n\nDeepcool.com: https://gravastar.com/k98", "the lines for a video's description");
  ok(R.csvCell("=HYPERLINK(\"http://evil\")") === `"'=HYPERLINK(""http://evil"")"` && R.csvCell("+1") === "'+1" && R.csvCell("@x") === "'@x" && R.csvCell("a,b") === '"a,b"' && R.csvCell(null) === "", "a spreadsheet cell can't be a formula");
  const csv = R.affiliatesCsv([a({ notes: "=cmd" })]);
  ok(csv.startsWith("Name,Product link,Code,Percentage,Status,Long video,Short,Affiliate platform,Notes\r\n") && /,'=cmd\r\n$/.test(csv), "the spreadsheet's columns (and the formula defused)");
  ok(!/login|password|username/i.test(csv), "never a login in the spreadsheet");

  // ---- The list -----------------------------------------------------------------------------------------------------------
  const list = [
    a({ id: "1", name: "Zeta", createdAt: "2026-11-01T00:00:00Z", status: "paused", code: null, login: null }),
    a({ id: "2", name: "alpha", createdAt: "2026-11-03T00:00:00Z", long: { kind: "long", id: "p", number: 12, title: "Keyboard review", stageLabel: "Publish", watchUrl: null, thumb: null } }),
    a({ id: "3", name: "Beta", createdAt: "2026-11-02T00:00:00Z", status: "ended", short: { kind: "short", id: "s", number: 45, title: "K98 in 30s", stageLabel: "Posted", watchUrl: null, thumb: null } }),
  ];
  const f = R.readFilters({});
  ok(R.applyFilters(list, f).map((x) => x.id).join() === "2,3,1", "newest first by default");
  ok(R.applyFilters(list, { ...f, sort: "name" }).map((x) => x.name).join() === "alpha,Beta,Zeta", "A to Z, whatever the case");
  ok(R.applyFilters(list, R.readFilters({ status: "ended" })).map((x) => x.id).join() === "3", "by status");
  ok(R.applyFilters(list, R.readFilters({ video: "long" })).map((x) => x.id).join() === "2" && R.applyFilters(list, R.readFilters({ video: "none" })).map((x) => x.id).join() === "1", "by video");
  ok(R.applyFilters(list, R.readFilters({ code: "1", login: "1" })).map((x) => x.id).join() === "2,3", "with a code, with a login");
  ok(R.applyFilters(list, R.readFilters({ q: "#45" })).map((x) => x.id).join() === "3" && R.applyFilters(list, R.readFilters({ q: "keyboard" })).map((x) => x.id).join() === "2", "found by a video's number or title");
  const weird = R.readFilters({ status: "x", video: "y", sort: "z", q: "q".repeat(500) });
  ok(weird.status === null && weird.video === null && weird.sort === "newest" && weird.q.length === 100, "anything unknown in the address is no filter");
  ok(R.filtersHref(R.readFilters({ status: "paused", q: "grava" }), { sort: "name" }, "grid") === "/affiliates?status=paused&sort=name&q=grava&view=grid" && R.filtersHref(f) === "/affiliates", "the address for a filter");

  // ---- Who, and what it says ------------------------------------------------------------------------------------------------
  ok(R.canManageAffiliates(["master"], false) && R.canManageAffiliates(["editor"], true) && !R.canManageAffiliates(["editor", "publisher"], false) && !R.canManageAffiliates(null, true), "masters, and the people they let in");
  ok(R.eventText({ action: "copied_password", who: "Ana", whom: null, affiliate: "Gravastar.com" }) === "Ana copied Gravastar.com's password" && R.eventText({ action: "granted", who: "You", whom: "Mihai", affiliate: null }) === "You let Mihai in", "the activity in words");

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
  const actions = read("app/(dashboard)/affiliates/actions.ts");
  const fn = (name: string) => actions.slice(actions.indexOf(`export async function ${name}`), actions.indexOf("\nexport ", actions.indexOf(`export async function ${name}`) + 10));
  ok(/const rights = await affiliateRights\(supabase, teamId, user\.id, membership\.roles\);/.test(actions), "who may do what is read from the database each time");
  const opener = fn("openAffiliateLogin");
  ok(/if \(!c\.manage\) return \{ error: NO_LOGINS \};/.test(opener) && /const until = await unlockedFor\(c\.supabase, c\.user\.id\);\s*if \(!until\) return \{ error: LOCKED, locked: true \};/.test(opener), "opening a login: let in, and unlocked");
  ok(/c\.supabase\.rpc\("affiliate_login_open", \{ p_affiliate: affiliateId, p_how: how \}\)/.test(opener) && /openSealed\(c\.teamId, affiliateId, data\)/.test(opener), "the database checks again and writes it down; opened for this team and affiliate only");
  ok(/if \(how === "copied_password"\) return \{ password: login\.password, until \};/.test(opener) && /if \(how === "copied_username"\) return \{ username: login\.username, until \};/.test(opener), "copying one part hands over only that part");
  ok(/overLimit\("affiliate-login-open", c\.user\.id, 40, 60_000\)/.test(opener), "and how many a minute");
  const unlock = fn("unlockLogins");
  ok(/await confirmPassword\(c\.user, password\)/.test(unlock) && /httpOnly: true,\s*sameSite: "strict",/.test(unlock) && /path: UNLOCK_PATH,/.test(unlock) && /maxAge: UNLOCK_MINUTES \* 60,/.test(unlock), "the unlock: the password (sign-in limits), then a cookie only the server reads, for /affiliates, 15 minutes");
  ok(/export const UNLOCK_PATH = "\/affiliates";/.test(read("modules/affiliates/lib/vault.ts")), "…sent nowhere else");
  const save = fn("saveAffiliate");
  ok(/if \(kept\.has\(id\) && !\(await unlockedFor\(c\.supabase, c\.user\.id\)\)\) return \{ error: LOCKED, locked: true \};/.test(save) && save.indexOf("unlockedFor") < save.indexOf('from("affiliates")'), "replacing or removing a kept login needs the unlock, checked before anything is written");
  ok(/sealLogin\(c\.teamId, savedId, sealing\)/.test(save) && /affiliate_login_save/.test(save), "a login is sealed before the database sees it");
  ok(/withLogins\(c, wanted\)\)\.size && !\(await unlockedFor/.test(fn("deleteAffiliates")), "deleting ones with a login needs the unlock");
  ok(/if \(!c\.master\) return \{ error: "Only masters choose who manages affiliates\." \};/.test(fn("setAffiliateAccess")) && /kind: "affiliate_access"/.test(fn("setAffiliateAccess")), "only Masters let people in; they're told");
  ok(/if \(!c\.master\) return \{ error: "Only masters see who used the logins\." \};/.test(fn("affiliateLoginActivity")), "only Masters read the activity");
  const queries = read("modules/affiliates/lib/queries.ts");
  ok(!/affiliate_logins/.test(queries.replace(/\/\*[\s\S]*?\*\//g, "")) && /supabase\.rpc\("affiliate_login_states", \{ p_team: teamId \}\)/.test(queries), "the page never reads a login: only which ones have one");
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
  ok(/const SECRET = \{ autoComplete: "off", spellCheck: false, autoCapitalize: "off", autoCorrect: "off", "data-1p-ignore": "", "data-lpignore": "true"/.test(dialog) && (dialog.match(/\{\.\.\.SECRET\}/g) ?? []).length === 3, "the login's fields keep password managers and the spell checker out");
  ok(!/affiliate\.login\.(username|password)/.test(dialog), "the window never shows a kept login");
  ok(/role="switch"/.test(read("modules/affiliates/components/logins-bar.tsx")), "Masters choose who manages affiliates");
  const picker = read("modules/affiliates/components/affiliates-picker.tsx");
  ok(/<ListPicker ids=\{items\.map\(\(i\) => i\.id\)\}/.test(picker) && /<BarDelete/.test(picker) && /affiliatesCsv\(chosen\)/.test(picker) && /descriptionText\(chosen\)/.test(picker), "several at once: copy, export, status, delete (the shorts list's picking)");
  const body = read("modules/affiliates/components/affiliates-body.tsx");
  ok(/<AffiliatesTable list=\{list\} manage=\{manage\} \/>/.test(body) && /<AffiliateCards list=\{list\} manage=\{manage\} \/>/.test(body) && /<ViewToggle/.test(body) && /<FiltersMenu/.test(body) && /<PickAffiliatesButton \/>/.test(body), "a table and cards, Filters, Select (as the shorts list)");
  ok(/<RowPick id=\{a\.id\}/.test(read("modules/affiliates/components/affiliates-table.tsx")) && /<CardPick id=\{a\.id\}/.test(read("modules/affiliates/components/affiliate-cards.tsx")), "rows and cards are picked");

  // The page, in the app.
  const nav = read("lib/nav-items.ts");
  ok(/\{ label: "Content", items: \[SHORTS, VIDEOS, AFFILIATES\] \}/.test(nav) && /href: "\/affiliates", label: "Affiliates"/.test(nav), "in the menu, under Content");
  ok(/id: "affiliates", kind: "page", title: "Affiliates"/.test(read("lib/search/catalog.ts")), "search finds it");
  ok(/\[\/\^\\\/affiliates\(\\\/\|\$\)\/, \(\) => <AffiliatesLoading \/>\]/.test(read("app/(dashboard)/loading.tsx")), "the app's loading screen is the page's own on the way there");
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
