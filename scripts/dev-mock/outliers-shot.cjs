// Screenshots of the Outliers page (1.27.0) on phones, laptops and big screens, light and dark.
// YouTube's thumbnails can't load here: each one is drawn from the sample's own colours and title.
//   node scripts/dev-mock/outliers-shot.cjs <outdir> [name filter] [--dark] [--view]
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const cookie = require("./cookie.cjs");
const { load } = require("./outliers.cjs");

const [OUT = ".", filter = "", ...flags] = process.argv.slice(2);
// Google's fonts can't be fetched in some sandboxes (the app falls back to plain serif):
// SHOT_FONTS=<a folder with node_modules/@fontsource-variable/{fraunces,inter}> puts the real ones back.
const FONTS = process.env.SHOT_FONTS;
const fontFile = (name) => require("path").join(FONTS, "node_modules/@fontsource-variable", name, "files", `${name}-latin-wght-normal.woff2`);
const D = load();
const pickLong = D.tech.videos.filter((v) => v.kind === "long").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
const TOP = pickLong[0];
const SHORT = D.tech.videos.filter((v) => v.kind === "short").sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
const CHAN = D.tech.channels.sort((a, b) => b.subscribers - a.subscribers)[2];

const SIZES = { phone: [390, 844], laptop: [1440, 900], wide: [1920, 1080] };
const SHOTS = [
  ["home", "/outliers"],
  ["home-shorts", "/outliers?kind=short"],
  ["search", "/outliers?tab=search&min=3"],
  ["search-table", "/outliers?tab=search", { layout: "table" }],
  ["ideas", "/outliers?tab=ideas"],
  ["formats", "/outliers?tab=formats"],
  ["keywords", "/outliers?tab=keywords"],
  ["channels", "/outliers?tab=channels"],
  ["titles", `/outliers?tab=titles&t=${encodeURIComponent("I Tested a $30 Fake Galaxy S26 Ultra")}`],
  ["thumbnails", "/outliers?tab=thumbnails"],
  ["saved", "/outliers?tab=saved"],
  ["video", `/outliers?v=${TOP.id}`],
  ["video-short", `/outliers?kind=short&v=${SHORT.id}`],
  ["channel", `/outliers?c=${CHAN.id}`],
  ["explore", "/outliers?niche=all"],
];

function hashOf(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const light = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
};

/** A thumbnail-like picture for a sample video: its colours, a big word or price, a "product" and a face. */
function thumb(id) {
  const v = D.byId.get(id);
  const h = hashOf(id);
  const [bg, fg, accent] = v?.thumb_colors ?? ["#2f6fd6", "#ffffff", "#f2c230"];
  const portrait = v?.kind === "short";
  const W = portrait ? 720 : 1280;
  const H = portrait ? 1280 : 720;
  const title = v?.title ?? "Video";
  const money = /[$€£]\s?\d[\d,]*/.exec(title)?.[0];
  const words = title.replace(/[^\p{L}\p{N}$ ]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|for|this|that|with|before|watching|every|review)$/i.test(w));
  const big = (money ?? (h % 3 === 0 ? "FAKE?" : words.slice(0, 2).join(" "))).toUpperCase().slice(0, 14);
  const txt = light(bg) ? "#111" : "#fff";
  const stroke = light(bg) ? "#fff" : "#000";
  const layout = h % 3;
  const fs = portrait ? 150 : Math.min(190, Math.round(1500 / Math.max(5, big.length)));
  const tx = portrait ? 60 : layout === 1 ? 640 : 70;
  const ty = portrait ? 340 : layout === 2 ? 600 : 250;
  const obj = portrait
    ? `<rect x="190" y="560" width="340" height="560" rx="44" fill="${fg}" stroke="#000" stroke-width="10"/><circle cx="360" cy="700" r="70" fill="${accent}"/>`
    : layout === 1
      ? `<rect x="110" y="140" width="330" height="480" rx="40" fill="${fg}" stroke="#000" stroke-width="10" transform="rotate(-8 275 380)"/><circle cx="290" cy="300" r="66" fill="${accent}"/>`
      : `<rect x="820" y="110" width="340" height="500" rx="42" fill="${fg}" stroke="#000" stroke-width="10" transform="rotate(${layout === 2 ? 6 : -5} 990 360)"/><circle cx="990" cy="290" r="70" fill="${accent}"/>`;
  const face = portrait
    ? `<circle cx="560" cy="1010" r="120" fill="#f1c7a3" stroke="#000" stroke-width="8"/><circle cx="525" cy="990" r="12" fill="#222"/><circle cx="595" cy="990" r="12" fill="#222"/><ellipse cx="560" cy="1060" rx="34" ry="${h % 2 ? 26 : 12}" fill="#5a1d1d"/>`
    : `<circle cx="${layout === 1 ? 1080 : 600}" cy="${layout === 2 ? 250 : 520}" r="120" fill="#f1c7a3" stroke="#000" stroke-width="8"/><circle cx="${layout === 1 ? 1045 : 565}" cy="${layout === 2 ? 230 : 500}" r="12" fill="#222"/><circle cx="${layout === 1 ? 1115 : 635}" cy="${layout === 2 ? 230 : 500}" r="12" fill="#222"/><ellipse cx="${layout === 1 ? 1080 : 600}" cy="${layout === 2 ? 300 : 570}" rx="34" ry="${h % 2 ? 26 : 12}" fill="#5a1d1d"/>`;
  const arrow = h % 4 === 1 ? `<path d="M${portrait ? "120 520 L260 640" : "560 140 L760 260"}" stroke="${accent}" stroke-width="26" stroke-linecap="round"/><path d="M${portrait ? "220 650 L270 650 L262 600" : "700 270 L770 270 L760 210"}" stroke="${accent}" stroke-width="26" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg}" stop-opacity="0.78"/></linearGradient></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${grad}<rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="#000" opacity="${light(bg) ? 0 : 0.08}"/>${obj}${face}${arrow}<text x="${tx}" y="${ty}" font-family="Inter Display, Inter, DejaVu Sans, sans-serif" font-weight="900" font-size="${fs}" fill="${txt}" stroke="${stroke}" stroke-width="${Math.round(fs / 14)}" paint-order="stroke" letter-spacing="-4">${esc(big)}</text></svg>`;
}

(async () => {
  const b = await chromium.launch();
  const dark = flags.includes("--dark");
  const view = flags.includes("--view");
  const sizes = Object.entries(SIZES).filter(([k]) => !flags.some((f) => f.startsWith("--size=")) || flags.includes(`--size=${k}`));
  for (const [size, [W, Hh]] of sizes) {
    const ctx = await b.newContext({ viewport: { width: W, height: Hh }, deviceScaleFactor: 1, locale: "en-US", timezoneId: "Europe/Athens" });
    await ctx.addCookies([
      { name: cookie.name, value: cookie.value, domain: "localhost", path: "/" },
      { name: "vp_team", value: "11111111-1111-4111-8111-111111111111", domain: "localhost", path: "/" },
    ]);
    await ctx.addInitScript((d) => {
      try {
        localStorage.setItem("vp-theme", d ? "dark" : "light");
        localStorage.setItem("vp-whats-new-seen", "9.9.9");
      } catch {}
    }, dark);
    if (FONTS) await ctx.route(/\/__shotfonts\/(fraunces|inter)\.woff2$/, (route) => route.fulfill({ status: 200, contentType: "font/woff2", body: require("fs").readFileSync(fontFile(/(fraunces|inter)\.woff2$/.exec(route.request().url())[1])) }));
    await ctx.route(/i\.ytimg\.com\/vi\/([^/]+)\//, (route) => {
      const id = /\/vi\/([^/]+)\//.exec(route.request().url())[1];
      route.fulfill({ status: 200, contentType: "image/svg+xml", body: thumb(id) });
    });
    for (const [name, path, opts] of SHOTS) {
      if (filter && !name.includes(filter)) continue;
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
      page.on("console", (m) => m.type() === "error" && !/WebSocket|realtime|Failed to load resource|favicon/.test(m.text()) && errs.push("console: " + m.text().slice(0, 240)));
      if (opts?.layout) await page.addInitScript((l) => localStorage.setItem("vp-outliers-layout", l), opts.layout);
      const t0 = Date.now();
      const r = await page.goto("http://localhost:3456" + path, { waitUntil: "networkidle", timeout: 240000 }).catch((e) => ({ status: () => "ERR " + e.message.slice(0, 80) }));
      if (dark) await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
      if (FONTS)
        await page.addStyleTag({
          content: `@font-face{font-family:"Fraunces";src:url(/__shotfonts/fraunces.woff2) format("woff2");font-weight:100 900}@font-face{font-family:"InterShot";src:url(/__shotfonts/inter.woff2) format("woff2");font-weight:100 900}:root,html{--font-display:"Fraunces",serif!important;--font-body:"InterShot",sans-serif!important}body{font-family:"InterShot",sans-serif}`,
        });
      await page.waitForTimeout(2200);
      const file = `${OUT}/${name}-${size}${dark ? "-dark" : ""}.png`;
      const panel = name.startsWith("video") || name.startsWith("channel");
      // A panel's whole length: let it grow with its content for the picture.
      if (panel && !view)
        await page.evaluate(() => {
          const root = document.querySelector("[data-outliers-panel-root]");
          const box = document.querySelector("[data-outliers-panel]");
          if (!root || !box) return;
          root.style.position = "absolute";
          root.style.bottom = "auto";
          box.style.height = "auto";
          box.querySelectorAll(".overflow-y-auto").forEach((el) => {
            el.style.overflow = "visible";
            el.style.flex = "none";
          });
          document.body.style.minHeight = `${box.scrollHeight + 40}px`;
        });
      if (panel) await page.waitForTimeout(1500);
      await page.screenshot({ path: file, fullPage: !view });
      console.log(`${name} ${size}${dark ? " dark" : ""}: ${typeof r?.status === "function" ? r.status() : "?"} ${Date.now() - t0}ms${errs.length ? "\n   " + errs.slice(0, 6).join("\n   ") : ""}`);
      await page.close();
    }
    await ctx.close();
  }
  await b.close();
})();
