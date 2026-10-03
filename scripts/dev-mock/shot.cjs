// node shot.cjs <path> <outname> [width] [height] [dark] [full]
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const cookie = require("./cookie.cjs");
const OUT = process.env.OUT || ".";
(async () => {
  const [p, out, W = "1440", H = "900", dark = "", full = "full"] = process.argv.slice(2);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, locale: "en-US", timezoneId: "Europe/Bucharest" });
  await ctx.addCookies([{ name: cookie.name, value: cookie.value, domain: "localhost", path: "/" }, { name: "vp_team", value: "11111111-1111-4111-8111-111111111111", domain: "localhost", path: "/" }]);
  if (dark) await ctx.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && !/WebSocket|realtime|Failed to load resource/.test(m.text()) && errs.push("console: " + m.text().slice(0, 300)));
  const r = await page.goto("http://localhost:3456" + p, { waitUntil: "networkidle", timeout: 180000 });
  if (dark) await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${out}.png`, fullPage: full === "full" });
  console.log(p, "->", r.status(), page.url(), errs.length ? "\n" + errs.join("\n") : "");
  await b.close();
})();
