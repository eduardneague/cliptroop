// 1.56.0: Affiliates. The owner (Nov 25 2026): "i want an affiliate page where i can add this. i want to be able to add
// the name, link the video of the product that we did, either long or short, the product link, the code, percentage
// and a way to add credentials and a link to the affiliate platform for each of these. the credentials should only be
// seen by the master or by who i choose that can see them from the team, come up with great security things, make
// sure that we have a table view and card view and all the things from shorts with the multi select and so on".
// The rules (what's typed, pasted, exported), the sealing of logins and the unlock (for real, with a key made here;
// they're server-only, so this file runs itself again with the react-server condition), and how it's all wired.
// The database's own rules: supabase/tests/affiliates.test.sql.
// 1.57.0: Sponsorships (the same page, renamed): what kind of deal, every video on the channel, the product's picture
// (the owner, Nov 26 2026). The database's rules for them: supabase/tests/sponsorships.test.sql.
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
    kinds: ["affiliate"],
    productUrl: "https://gravastar.com/k98",
    code: "VIVERRO",
    percentage: "10%",
    status: "active",
    platformUrl: "https://impact.com",
    notes: null,
    long: null,
    short: null,
    picture: null,
    pictureOff: false,
    createdAt: "2026-11-20T10:00:00Z",
    updatedAt: "2026-11-20T10:00:00Z",
    login: { updatedAt: "2026-11-20T10:00:00Z", by: "Edu" },
    ...over,
  });
  ok(R.descriptionText([a({}), a({ name: "Abxylute.com", productUrl: "https://abxylute.com/p5", code: "viverroVIP", percentage: "$5 USD OFF" }), a({ name: "Deepcool.com", code: null, percentage: null })]) ===
    "Gravastar.com: https://gravastar.com/k98\nCode VIVERRO (10% off)\n\nAbxylute.com: https://abxylute.com/p5\nCode viverroVIP ($5 USD OFF)\n\nDeepcool.com: https://gravastar.com/k98", "the lines for a video's description");
  ok(R.csvCell("=HYPERLINK(\"http://evil\")") === `"'=HYPERLINK(""http://evil"")"` && R.csvCell("+1") === "'+1" && R.csvCell("@x") === "'@x" && R.csvCell("a,b") === '"a,b"' && R.csvCell(null) === "", "a spreadsheet cell can't be a formula");
  const csv = R.affiliatesCsv([a({ notes: "=cmd" })]);
  ok(csv.startsWith("Name,Type,Product link,Code,Percentage,Status,Long video,Short,Affiliate platform,Notes\r\n") && /,Affiliate,/.test(csv) && /,'=cmd\r\n$/.test(csv), "the spreadsheet's columns, its kind (and the formula defused)");
  ok(!/login|password|username/i.test(csv), "never a login in the spreadsheet");

  // ---- The list -----------------------------------------------------------------------------------------------------------
  const list = [
    a({ id: "1", name: "Zeta", createdAt: "2026-11-01T00:00:00Z", status: "paused", code: null, login: null }),
    a({ id: "2", name: "alpha", kinds: ["affiliate", "review"], createdAt: "2026-11-03T00:00:00Z", long: { kind: "long", source: "team", id: "p", number: 12, title: "Keyboard review", stageLabel: "Publish", watchUrl: null, thumb: null } }),
    a({ id: "3", name: "Beta", kinds: ["review"], createdAt: "2026-11-02T00:00:00Z", status: "ended", short: { kind: "short", source: "channel", id: "Short136_bb", number: null, title: "K98 in 30s", stageLabel: "On the channel", watchUrl: "https://www.youtube.com/shorts/Short136_bb", thumb: null } }),
  ];
  const f = R.readFilters({});
  ok(R.applyFilters(list, f).map((x) => x.id).join() === "2,3,1", "newest first by default");
  ok(R.applyFilters(list, { ...f, sort: "name" }).map((x) => x.name).join() === "alpha,Beta,Zeta", "A to Z, whatever the case");
  ok(R.applyFilters(list, R.readFilters({ status: "ended" })).map((x) => x.id).join() === "3", "by status");
  ok(R.applyFilters(list, R.readFilters({ video: "long" })).map((x) => x.id).join() === "2" && R.applyFilters(list, R.readFilters({ video: "none" })).map((x) => x.id).join() === "1", "by video");
  ok(R.applyFilters(list, R.readFilters({ code: "1", login: "1" })).map((x) => x.id).join() === "2,3", "with a code, with a login");
  ok(R.applyFilters(list, R.readFilters({ q: "#12" })).map((x) => x.id).join() === "2" && R.applyFilters(list, R.readFilters({ q: "keyboard" })).map((x) => x.id).join() === "2" && R.applyFilters(list, R.readFilters({ q: "k98 in" })).map((x) => x.id).join() === "3", "found by a video's number or title (one on the channel too)");
  ok(R.applyFilters(list, R.readFilters({ type: "review" })).map((x) => x.id).join() === "2,3" && R.applyFilters(list, R.readFilters({ type: "affiliate" })).map((x) => x.id).join() === "2,1" && R.applyFilters(list, R.readFilters({ type: "paid" })).length === 0, "the kind's tab: each one in all of its kinds' tabs");
  ok(R.applyFilters(list, R.readFilters({ q: "review" })).map((x) => x.id).join() === "2,3", "found by its kind too");
  const weird = R.readFilters({ type: "barter", status: "x", video: "y", sort: "z", q: "q".repeat(500) });
  ok(weird.kind === null && weird.status === null && weird.video === null && weird.sort === "newest" && weird.q.length === 100, "anything unknown in the address is no filter");
  ok(
    R.filtersHref(R.readFilters({ status: "paused", q: "grava" }), { sort: "name" }, "grid") === "/sponsorships?status=paused&sort=name&q=grava&view=grid" &&
      R.filtersHref(f) === "/sponsorships" &&
      R.filtersHref(R.readFilters({ type: "review", status: "active" }), { kind: "paid" }) === "/sponsorships?type=paid&status=active",
    "the address for a filter (the tab's kind kept with the rest)"
  );

  // ---- 1.57.0: what kind of deal --------------------------------------------------------------------------------------------
  ok(JSON.stringify(R.cleanKinds(["paid", "affiliate", "paid"])) === '["affiliate","paid"]' && R.cleanKinds([]) === null && R.cleanKinds(["barter"]) === null && JSON.stringify(R.cleanKinds("review")) === '["review"]', "kinds: known ones, in order, no repeats; none is nothing");
  ok(
    JSON.stringify(R.kindsFromText("Review")) === '["review"]' &&
      JSON.stringify(R.kindsFromText("affiliate + paid")) === '["affiliate","paid"]' &&
      JSON.stringify(R.kindsFromText("Sponsored, gifted")) === '["review","paid"]' &&
      R.kindsFromText("barter").length === 0,
    "a sheet's Type cell, as people write it"
  );
  const k1 = R.cleanAffiliate({ name: "A", kinds: ["review", "affiliate"] });
  ok("ok" in k1 && k1.ok.kinds.join() === "affiliate,review", "the window's kinds, in order");
  ok("error" in R.cleanAffiliate({ name: "A", kinds: [] }) && "error" in R.cleanAffiliate({ name: "A", kinds: ["affiliate", "barter"] }), "never none, never an unknown one");
  const k0 = R.cleanAffiliate({ name: "A" });
  ok("ok" in k0 && k0.ok.kinds.join() === "affiliate" && k0.ok.picture === "keep", "nothing said: an affiliate (as everything was before), the picture as it is");
  const typed = R.parsePasted("Name\tType\tCode\nDeepcool.com\tReview\t-\nGravastar.com\t\tVIVERRO", ["paid"]);
  ok(typed.header && typed.rows[0].fields?.kinds.join() === "review" && typed.rows[1].fields?.kinds.join() === "paid", "pasted: a Type column, else the tab it's pasted on");
  ok(R.parsePasted(sheet).rows.every((r) => r.fields?.kinds.join() === "affiliate" && r.fields?.picture === "auto"), "pasted on All: affiliates, their pictures looked for");

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
  const ch = R.cleanAffiliate({ name: "A", longYoutubeId: "Long136_aaa", shortId: "50000000-0000-4000-8000-000000000001" });
  ok("ok" in ch && ch.ok.longYoutubeId === "Long136_aaa" && ch.ok.projectId === null && !!ch.ok.shortId, "a long video only on the channel, a Short of the team's");
  ok("error" in R.cleanAffiliate({ name: "A", longYoutubeId: "not an id!" }) && "error" in R.cleanAffiliate({ name: "A", projectId: "40000000-0000-4000-8000-000000000001", longYoutubeId: "Long136_aaa" }), "a channel video is an id, and one per place");
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
  const choose = R.cleanAffiliate({ name: "A", picture: { url: "http://shop.example.com/p.jpg", source: "link" } });
  ok("ok" in choose && typeof choose.ok.picture === "object" && choose.ok.picture.url === "https://shop.example.com/p.jpg", "a pasted picture, on https");
  ok("error" in R.cleanAffiliate({ name: "A", picture: { url: "https://10.0.0.5/p.jpg", source: "link" } }) && "error" in R.cleanAffiliate({ name: "A", picture: { url: "https://x.example.com/p.jpg", source: "elsewhere" } }) && "error" in R.cleanAffiliate({ name: "A", picture: "sometimes" }), "never a picture inside a network, never an unknown kind of change");
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
  const save = fn("saveAffiliate");
  ok(/if \(kept\.has\(id\) && !\(await unlockedFor\(c\.supabase, c\.user\.id\)\)\) return \{ error: LOCKED, locked: true \};/.test(save) && save.indexOf("unlockedFor") < save.indexOf('from("affiliates")'), "replacing or removing a kept login needs the unlock, checked before anything is written");
  ok(/sealLogin\(c\.teamId, savedId, sealing\)/.test(save) && /affiliate_login_save/.test(save), "a login is sealed before the database sees it");
  ok(/withLogins\(c, wanted\)\)\.size && !\(await unlockedFor/.test(fn("deleteAffiliates")), "deleting ones with a login needs the unlock");
  ok(/if \(!c\.master\) return \{ error: "Only masters choose who manages sponsorships\." \};/.test(fn("setAffiliateAccess")) && /kind: "affiliate_access"/.test(fn("setAffiliateAccess")) && /href: SPONSORSHIPS_PATH/.test(fn("setAffiliateAccess")), "only Masters let people in; they're told (and sent to the page)");
  ok(/if \(!c\.master\) return \{ error: "Only masters see who used the logins\." \};/.test(fn("affiliateLoginActivity")), "only Masters read the activity");
  // 1.57.0: pictures and videos, only for the people who manage sponsorships; the server reads only public pages.
  const finder = fn("findProductPicture");
  ok(/if \(!c\.manage\) return \{ error: NO_MANAGE \};/.test(finder) && /overLimit\("affiliate-picture", c\.user\.id, 30, 60_000\)/.test(finder) && /const url = normalizeUrl\(productUrl\);/.test(finder), "a picture is looked for by the people let in, a few a minute, for a web address");
  ok(/if \(!c\.manage\) return \{ error: NO_MANAGE \};/.test(fn("affiliateVideoChoices")) && /readVideoChoices\(c\.supabase, c\.teamId\)/.test(fn("affiliateVideoChoices")), "the videos to link: the people let in, read as them");
  ok(/if \(!c\.manage\) return \{ error: NO_MANAGE \};/.test(fn("setAffiliatesKinds")) && /const clean = cleanKinds\(kinds\);/.test(fn("setAffiliatesKinds")), "changing the kind: the people let in, checked");
  ok(/lookForPictures\(c\.teamId, \[savedId\]\)/.test(fn("saveAffiliate")) && /lookForPictures\(c\.teamId, /.test(fn("importAffiliates")), "saved or pasted with a product link and no picture: the server looks after answering");
  const pictures = read("modules/affiliates/lib/pictures.ts");
  ok(/^import "server-only";/.test(pictures) && /if \(!publicUrl\(url\)\) return null;/.test(pictures) && (pictures.match(/if \(!publicUrl\(next\)/g) ?? []).length === 2, "the server reads only public pages, each redirect checked before it's followed");
  ok(/admin\.rpc\("affiliate_pictures_claim"/.test(pictures) && /admin\.rpc\("affiliate_picture_found"/.test(pictures) && !/from\("affiliates"\)\.update\(\{ image_url/.test(pictures), "the background look goes through the database's two functions");
  const web = read("lib/web-page.ts");
  ok(/lookup: safeLookup as never/.test(web) && /all\.some\(\(a\) => isPrivateAddress\(a\.address\)\)/.test(web) && /if \(u\.port && u\.port !== "80" && u\.port !== "443"\) return false;/.test(web), "checked on the address the connection uses, ports 80 and 443 only");
  const preview = read("app/api/link-preview/route.ts");
  ok(/from "@\/lib\/web-page"/.test(preview) && !/function safeLookup/.test(preview), "the link previews read pages the same way (one reader, not two)");
  const sponsorPage = read("app/(dashboard)/sponsorships/page.tsx");
  ok(/if \(data\.needPictures\) \{[\s\S]*after\(\(\) => fillPictures\(teamId/.test(sponsorPage) && /export const maxDuration = 60;/.test(sponsorPage), "opening the page: pictures still missing are looked for after it's sent");
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
  ok(/<AffiliatesTable list=\{list\} manage=\{manage\} tab=\{f\.kind\} \/>/.test(body) && /<AffiliateCards list=\{list\} manage=\{manage\} tab=\{f\.kind\} \/>/.test(body) && /<ViewToggle/.test(body) && /<FiltersMenu/.test(body) && /<PickAffiliatesButton \/>/.test(body), "a table and cards, Filters, Select (as the shorts list)");
  ok(/<KindTabs/.test(body) && /DEAL_KINDS\.map\(\(k\) => \(\{ key: k, label: KIND_TAB\[k\]/.test(body), "tabs for the kinds of deal, over one list");
  ok(/setAffiliatesKinds/.test(picker) && /setAffiliatesKinds/.test(read("modules/affiliates/components/row-menu.tsx")), "the kind changed for several at once, or on one");
  const mark = read("modules/affiliates/components/brand-mark.tsx");
  ok(/referrerPolicy="no-referrer"/.test(mark) && /data-row-num=""/.test(mark) && /onError=\{\(\) => setFailed\(url\)\}/.test(mark), "the picture: asked for without saying where from; picking still puts the tick box there; the initial if it doesn't open");
  ok(/findProductPicture\(ctx\.teamId, url\)/.test(dialog) && /<VideoField kind="long"/.test(dialog) && /youtubeIdOf\(raw\)/.test(dialog), "the window: the picture as soon as a link is typed; videos found by title, number or YouTube link");
  ok(/<RowPick id=\{a\.id\}/.test(read("modules/affiliates/components/affiliates-table.tsx")) && /<CardPick id=\{a\.id\}/.test(read("modules/affiliates/components/affiliate-cards.tsx")), "rows and cards are picked");

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
