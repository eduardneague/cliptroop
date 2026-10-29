// A tiny stand-in for Supabase (Auth + PostgREST) so the real pages render with sample data.
const http = require("http");
const path = require("path");
const fs = require("fs");
const FIX = path.join(__dirname, "fixtures.cjs");
const log = [];
// The fixtures are read again (so edits apply without a restart), at most once a second.
let cached = null;
function fixtures() {
  if (cached && Date.now() - cached.at < 1000) return cached.F;
  const id = require.resolve(FIX);
  delete require.cache[id];
  const F = require(FIX);
  // require() also keeps every fresh copy in module.children: let the old ones go
  // (otherwise memory grows with every request until the process is killed).
  module.children = module.children.filter((m) => m.id !== id || m.exports === F);
  cached = { at: Date.now(), F };
  return F;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const WRITABLE = new Set(["daily_word_plays", ...String(process.env.MOCK_WRITES || "").split(",").filter(Boolean)]);
// The fixtures are read again on every request; tables that remember writes keep their rows here.
const stores = new Map();
const tableRows = (F, name) => {
  // (A table an RPC has written to keeps its rows too: business_years, 1.42.0.)
  if (!WRITABLE.has(name) && !stores.has(name)) return F.tables[name];
  if (!stores.has(name)) stores.set(name, [...(F.tables[name] ?? [])]);
  return stores.get(name);
};
const storeOf = (F, name) => {
  if (!stores.has(name)) stores.set(name, [...(F.tables[name] ?? [])]);
  return stores.get(name);
};

/** One PostgREST test on one row's column (`not` turns it round). */
function testOp(row, k, not, op, raw) {
  const x = row[k];
  let r;
  if (op === "eq") r = String(x) === raw;
  else if (op === "neq") r = String(x) !== raw;
  else if (op === "in") r = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(x));
  else if (op === "is") r = raw === "null" ? x === null || x === undefined : String(x) === raw;
  else if (op === "gte") r = x !== null && x !== undefined && String(x) >= raw;
  else if (op === "lte") r = x !== null && x !== undefined && String(x) <= raw;
  else if (op === "gt") r = x !== null && x !== undefined && String(x) > raw;
  else if (op === "lt") r = x !== null && x !== undefined && String(x) < raw;
  else if (op === "like" || op === "ilike") {
    // PostgREST patterns: % or * any run, _ one character, \ escapes.
    let re = "";
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === "\\" && i + 1 < raw.length) re += raw[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      else if (ch === "%" || ch === "*") re += ".*";
      else if (ch === "_") re += ".";
      else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    r = x !== null && x !== undefined && new RegExp(`^${re}$`, op === "ilike" ? "is" : "s").test(String(x));
  } else r = true;
  return not ? !r : r;
}

/** A logic tree's parts: commas at its own level (not inside brackets or a "quoted, value"). */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === "\\" && i + 1 < s.length) {
        cur += ch + s[++i];
        continue;
      }
      if (ch === '"') quoted = false;
      cur += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0 && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const unquote = (v) => (/^".*"$/s.test(v) ? v.slice(1, -1).replace(/\\(.)/g, "$1") : v);
/** 1.41.0: or=(…) / and=(…) logic trees (nested, not., quoted values), as PostgREST reads them. */
function evalTree(expr, row) {
  const m = /^(not\.)?(or|and)\((.*)\)$/s.exec(expr.trim());
  if (m) {
    const parts = splitTop(m[3]);
    const r = m[2] === "or" ? parts.some((p) => evalTree(p, row)) : parts.every((p) => evalTree(p, row));
    return m[1] ? !r : r;
  }
  const f = /^([a-z0-9_]+)\.(not\.)?(eq|neq|in|is|gte|lte|gt|lt|like|ilike)\.(.*)$/s.exec(expr.trim());
  if (!f) return true;
  return testOp(row, f[1], !!f[2], f[3], unquote(f[4]));
}

/** The rows a request's filters and order let through, and (1.41.0) how many before its page (count=exact). */
function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (k === "or" || k === "and") {
      out = out.filter((row) => evalTree(`${k}${v}`, row));
      continue;
    }
    if (k.includes(".")) continue; // filters on embedded tables: ignore
    const m = /^(not\.)?(eq|neq|in|is|gte|lte|gt|lt|like|ilike)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, not, op, raw] = m;
    const has = out.length && Object.prototype.hasOwnProperty.call(out[0], k);
    if (!has) continue;
    out = out.filter((row) => testOp(row, k, !!not, op, raw));
  }
  // order=col.desc.nullslast,col2.asc (columns of the row itself; embedded ones are ignored).
  const order = params.get("order");
  if (order && out.length) {
    const keys = order
      .split(",")
      .map((x) => x.split("."))
      .filter(([c]) => c && Object.prototype.hasOwnProperty.call(out[0], c))
      .map(([c, dir = "asc", nulls]) => ({ c, desc: dir === "desc", nullsFirst: nulls ? nulls === "nullsfirst" : dir === "desc" }));
    if (keys.length)
      out = [...out].sort((a, b) => {
        for (const k of keys) {
          const x = a[k.c];
          const y = b[k.c];
          const xn = x === null || x === undefined;
          const yn = y === null || y === undefined;
          if (xn || yn) {
            if (xn && yn) continue;
            return (xn ? -1 : 1) * (k.nullsFirst ? 1 : -1);
          }
          const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
          if (cmp) return k.desc ? -cmp : cmp;
        }
        return 0;
      });
  }
  const total = out.length;
  const offset = Number(params.get("offset") || 0);
  const limit = params.get("limit");
  if (offset || limit) out = out.slice(offset, limit ? offset + Number(limit) : undefined);
  return { rows: out, total };
}
const applyFilters = (rows, params) => filterRows(rows, params).rows;

/** A flat sample picture: a "thumbnail" (16:9, a big word) or a channel picture (square). */
function sampleImage(res, p) {
  let h = 0;
  for (const ch of p) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = ["#E8630D", "#178C7C", "#3159C9", "#6B4FD6", "#B84070", "#B4890E", "#2B9757", "#C2410C", "#0E7490"];
  const bg = hues[h % hues.length];
  const fg = hues[(h >> 5) % hues.length] === bg ? "#111" : hues[(h >> 5) % hues.length];
  const avatar = p.includes("/c/");
  const label = (/\/(v\d+|lib\d+|ch\d+)\./.exec(p) || [, "IMG"])[1].replace("lib", "").replace("ch", "").toUpperCase();
  const svg = avatar
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88"><rect width="88" height="88" fill="${bg}"/><circle cx="44" cy="36" r="16" fill="#fff" opacity=".85"/><rect x="18" y="58" width="52" height="30" rx="15" fill="#fff" opacity=".85"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${bg}"/><rect x="760" y="120" width="420" height="480" rx="40" fill="${fg}" opacity=".9"/><circle cx="970" cy="300" r="110" fill="#fff" opacity=".9"/><text x="80" y="420" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="260" fill="#fff">${label}</text><rect x="80" y="470" width="520" height="40" rx="8" fill="#111" opacity=".55"/></svg>`;
  res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=3600", "Access-Control-Allow-Origin": "*" });
  res.end(svg);
}
/** MOCK_DASH_BG_FILE=/path/to/file (.jpg .png .webp .gif .mp4 .webm): the dashboard background; else a drawn dusk sky. */
function sampleBackground(req, res) {
  const file = process.env.MOCK_DASH_BG_FILE;
  if (!file || !fs.existsSync(file)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22184a"/><stop offset=".55" stop-color="#c45262"/><stop offset="1" stop-color="#faaa5c"/></linearGradient><radialGradient id="g" cx=".3" cy=".35" r=".4"><stop offset="0" stop-color="#ffc878" stop-opacity=".7"/><stop offset="1" stop-color="#ffc878" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#s)"/><rect width="1600" height="900" fill="url(#g)"/><path d="M0 700 Q 300 620 600 690 T 1200 670 T 1600 690 V900 H0Z" fill="#1c1228"/></svg>`;
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=3600", "Access-Control-Allow-Origin": "*" });
    return res.end(svg);
  }
  const ext = file.split(".").pop().toLowerCase();
  const type = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif", mp4: "video/mp4", webm: "video/webm" }[ext] || "application/octet-stream";
  const size = fs.statSync(file).size;
  const m = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range || ""));
  const head = { "Content-Type": type, "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=3600" };
  if (!m) {
    res.writeHead(200, { ...head, "Content-Length": size });
    return req.method === "HEAD" ? res.end() : fs.createReadStream(file).pipe(res);
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  res.writeHead(206, { ...head, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
  return req.method === "HEAD" ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
}

// Resumable uploads (TUS, what Supabase Storage speaks): id → { length, offset, name }.
/** MOCK_VIDEO=/path/to/file.mp4 (or .webm): the file every signed review-videos link plays (with Range support). */
function sampleVideo(req, res) {
  const file = process.env.MOCK_VIDEO;
  if (!file || !fs.existsSync(file)) return send(res, 404, { error: "no sample video (set MOCK_VIDEO)" });
  const size = fs.statSync(file).size;
  const m = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range || ""));
  // (Headless Chromium can't play H.264: a .webm sample works there.)
  const head = { "Content-Type": file.endsWith(".webm") ? "video/webm" : "video/mp4", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
  if (!m) {
    res.writeHead(200, { ...head, "Content-Length": size });
    return req.method === "HEAD" ? res.end() : fs.createReadStream(file).pipe(res);
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  res.writeHead(206, { ...head, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
  return req.method === "HEAD" ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
}

const uploads = new Map();
const TUS_HEADERS = { "Tus-Resumable": "1.0.0", "Access-Control-Expose-Headers": "Location, Upload-Offset, Upload-Length, Tus-Resumable" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  req.bytes = 0;
  req.on("data", (c) => {
    body += c;
    req.bytes += c.length;
  });
  // MOCK_DELAY=1500: every database answer takes that long (to see the loading screens).
  req.on("end", () => setTimeout(() => answer(req, res, url, body), Number(process.env.MOCK_DELAY) || 0));
});
function answer(req, res, url, body) {
  {
    const F = fixtures();
    log.push(`${req.method} ${url.pathname}${url.search}`);
    if (process.env.MOCK_LOG) console.log(req.method, decodeURIComponent(url.pathname + url.search).slice(0, 300));
    // "*" doesn't cover Authorization in browsers: echo what was asked for.
    if (req.method === "OPTIONS") return send(res, 204, undefined, { "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS" });
    // Sample exchange rates (start the app with FX_RATES_URL=http://127.0.0.1:54321/fx/latest/USD).
    if (url.pathname === "/fx/latest/USD")
      return send(res, 200, {
        result: "success",
        base_code: "USD",
        time_last_update_utc: new Date(Date.now() - 6 * 3600e3).toUTCString(),
        rates: { USD: 1, EUR: 0.92, GBP: 0.79, RON: 4.58, CAD: 1.36, AUD: 1.52, CHF: 0.88, JPY: 149.5, INR: 83.4, BRL: 5.1, MXN: 17.9, PLN: 3.98, SEK: 10.6, NOK: 10.8, DKK: 6.86, HUF: 362, CZK: 23.1, TRY: 34.2, AED: 3.6725, ZAR: 18.4, MDL: 17.7, BGN: 1.8, RSD: 107.8, UAH: 41.2, KRW: 1380, CNY: 7.2, SGD: 1.34, NZD: 1.66, HKD: 7.8, ILS: 3.7 },
      });
    // BNR's reference rates (1.42.0; start the app with BNR_RATES_URL=http://127.0.0.1:54321/bnr/): a year's banking days
    // up to today, the last ten, or today's.
    if (url.pathname.startsWith("/bnr/")) {
      const { bnrXml } = require("./business.cjs");
      const today = new Date().toISOString().slice(0, 10);
      const y = /nbrfxrates(\d{4})\.xml$/.exec(url.pathname);
      let xml = y ? bnrXml(Number(y[1]), today) : bnrXml(Number(today.slice(0, 4)), today);
      if (!y) {
        const cubes = xml.match(/<Cube date="[^"]+">[\s\S]*?<\/Cube>/g) ?? [];
        const keep = url.pathname.endsWith("10days.xml") ? cubes.slice(-10) : cubes.slice(-1);
        xml = xml.replace(/<Cube[\s\S]*<\/Cube>/, keep.join(""));
      }
      res.writeHead(200, { "Content-Type": "text/xml; charset=utf-8", "Access-Control-Allow-Origin": "*" });
      return res.end(xml);
    }
    if (url.pathname === "/auth/v1/user") return send(res, 200, F.user);
    if (url.pathname.startsWith("/auth/v1/")) return send(res, 200, {});
    if (url.pathname.startsWith("/storage/v1/")) {
      // Resumable uploads (tus-js-client): create (with the first chunk), then PATCH the rest.
      // MOCK_UPLOAD_FAIL=1 refuses them like a full bucket would.
      if (url.pathname === "/storage/v1/upload/resumable" && req.method === "POST") {
        if (process.env.MOCK_UPLOAD_FAIL) return send(res, 413, { error: "Payload too large", message: "The object exceeded the maximum allowed size" }, TUS_HEADERS);
        const id = Math.random().toString(36).slice(2);
        const meta = Object.fromEntries(String(req.headers["upload-metadata"] || "").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.trim().split(" "); return [k, v ? Buffer.from(v, "base64").toString() : ""]; }));
        uploads.set(id, { length: Number(req.headers["upload-length"] || 0), offset: req.bytes, name: `${meta.bucketName}/${meta.objectName}` });
        return send(res, 201, undefined, { ...TUS_HEADERS, Location: `http://127.0.0.1:54321/storage/v1/upload/resumable/${id}`, "Upload-Offset": String(req.bytes) });
      }
      const tus = /^\/storage\/v1\/upload\/resumable\/([a-z0-9]+)$/.exec(url.pathname);
      if (tus) {
        const u = uploads.get(tus[1]);
        if (!u) return send(res, 404, undefined, TUS_HEADERS);
        if (req.method === "PATCH") u.offset += req.bytes;
        return send(res, req.method === "PATCH" ? 204 : 200, undefined, { ...TUS_HEADERS, "Upload-Offset": String(u.offset), "Upload-Length": String(u.length), "Cache-Control": "no-store" });
      }
      // Removing files (storage.remove): accepted.
      if (req.method === "DELETE" && url.pathname.startsWith("/storage/v1/object/")) return send(res, 200, []);
      // Plain uploads (storage.upload, e.g. a picture pasted into a script) and copies: accepted
      // (MOCK_UPLOAD_FAIL=1: refused); public files answer with a generated sample picture.
      if (url.pathname === "/storage/v1/object/copy" && req.method === "POST") return send(res, 200, { Key: (body ? JSON.parse(body).destinationKey : "") ?? "" });
      if ((req.method === "POST" || req.method === "PUT") && /^\/storage\/v1\/object\/(?!sign\/|public\/|upload\/)[^/]+\/.+/.test(url.pathname)) {
        if (process.env.MOCK_UPLOAD_FAIL) return send(res, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
        return send(res, 200, { Key: decodeURIComponent(url.pathname.replace("/storage/v1/object/", "")), Id: Math.random().toString(36).slice(2) });
      }
      // A dashboard background (1.27.5): MOCK_DASH_BG_FILE (a picture, GIF or video), else a generated dusk.
      if (url.pathname.startsWith("/storage/v1/object/public/dashboard-backgrounds/")) return sampleBackground(req, res);
      if (url.pathname.startsWith("/storage/v1/object/public/")) return sampleImage(res, decodeURIComponent(url.pathname));
      // Batch signing (createSignedUrls): links to generated sample images below.
      if (req.method === "POST" && /\/object\/sign\/[^/]+\/?$/.test(url.pathname)) {
        const bucket = url.pathname.split("/sign/")[1].replace(/\/$/, "");
        const paths = (body ? JSON.parse(body).paths : null) ?? [];
        return send(res, 200, paths.map((p) => ({ path: p, signedURL: `/object/img/${bucket}/${p}?token=mock`, error: null })));
      }
      if (url.pathname.includes("/sign/review-videos/") && process.env.MOCK_VIDEO) {
        return send(res, 200, { signedURL: `/object/video/${url.pathname.split("/sign/")[1]}?token=mock` });
      }
      if (url.pathname.includes("/sign/")) return send(res, 200, { signedURL: "/missing.png" });
      if (url.pathname.startsWith("/storage/v1/object/video/")) return sampleVideo(req, res);
      if (url.pathname === "/storage/v1/bucket") return send(res, 200, [{ id: "thumbnails", name: "thumbnails", public: true }]);
      if (url.pathname.startsWith("/storage/v1/object/img/")) return sampleImage(res, decodeURIComponent(url.pathname));
      return send(res, 404, { error: "not found" });
    }
    const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(url.pathname);
    // The daily word's one-step guess (0079), on the remembered plays.
    if (rpc && rpc[1] === "daily_word_guess") {
      const b = body ? JSON.parse(body) : {};
      const rows = tableRows(F, "daily_word_plays");
      const now = new Date().toISOString();
      let row = rows.find((r) => r.user_id === b.p_user && r.day === b.p_day);
      if (!row) rows.push((row = { user_id: b.p_user, day: b.p_day, puzzle: b.p_puzzle, guesses: [], solved: false, finished_at: null, created_at: now, updated_at: now }));
      if (row.finished_at) return send(res, 200, [{ result: "over", guesses: row.guesses, solved: row.solved, finished: true }]);
      if (row.guesses.includes(b.p_word)) return send(res, 200, [{ result: "again", guesses: row.guesses, solved: row.solved, finished: false }]);
      row.guesses = [...row.guesses, b.p_word];
      row.solved = !!b.p_solved;
      const done = row.solved || row.guesses.length >= 6;
      row.finished_at = done ? now : null;
      row.updated_at = now;
      return send(res, 200, [{ result: "ok", guesses: row.guesses, solved: row.solved, finished: done }]);
    }
    // Closing, reopening, correcting a year of Business (0120's business_set_year), on the remembered years.
    if (rpc && rpc[1] === "business_set_year") {
      const b = body ? JSON.parse(body) : {};
      const rows = storeOf(F, "business_years");
      let row = rows.find((r) => r.team_id === b.p_team && r.year === b.p_year);
      if (!row) rows.push((row = { team_id: b.p_team, year: b.p_year, closed_at: null, closed_by: null, rectified: false }));
      if (b.p_closed === true || b.p_closed === false) {
        row.closed_at = b.p_closed ? new Date().toISOString() : null;
        row.closed_by = b.p_closed ? F.user.id : null;
      }
      if (b.p_rectified === true || b.p_rectified === false) row.rectified = b.p_rectified;
      return send(res, 200, [{ year: row.year, closed_at: row.closed_at, closed_by: row.closed_by, rectified: row.rectified }]);
    }
    if (rpc) {
      const v = F.rpc?.[rpc[1]];
      // (The fixture sees who's signed in and the remembered rows of business_access and team_features: 1.42.0's
      // my_business_access, so Developer → Features turns Business on and off in the mock too.)
      const out = typeof v === "function" ? v(body ? JSON.parse(body) : {}, { user: F.user, tables: { business_access: tableRows(F, "business_access") ?? [], team_features: tableRows(F, "team_features") ?? [] } }) : v ?? null;
      // An RPC fixture can answer like a raised exception: { __status: 400, __body: { code, message } }.
      if (out && typeof out === "object" && out.__status) return send(res, out.__status, out.__body);
      return send(res, 200, out);
    }
    const t = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(url.pathname);
    // A table a migration hasn't made yet (fixtures' missingTables, e.g. MOCK_NO_0119=1): PostgREST's own answer.
    if (t && (F.missingTables ?? []).includes(t[1])) return send(res, 404, { code: "PGRST205", message: `Could not find the table 'public.${t[1]}' in the schema cache`, details: null, hint: null });
    if (t) {
      // Tables that remember writes (the daily word's plays, and any in MOCK_WRITES=a,b):
      // inserts are kept, updates change the rows they match.
      const writable = WRITABLE.has(t[1]);
      const one = String(req.headers["accept"] || "").includes("vnd.pgrst.object");
      // (1.42.0: .single() / .maybeSingle() on a write answer with the one row, as PostgREST does.)
      const answerRows = (status, rows) => (one ? (rows.length ? send(res, status, rows[0]) : send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null })) : send(res, status, rows));
      if (writable && req.method === "POST") {
        const now = new Date().toISOString();
        const incoming = [].concat(body ? JSON.parse(body) : []);
        // An upsert (on_conflict=…, Prefer: resolution=merge-duplicates) changes the row it meets instead of adding one.
        const conflict = String(req.headers["prefer"] || "").includes("merge-duplicates") ? (url.searchParams.get("on_conflict") || "id").split(",") : null;
        const table = tableRows(F, t[1]);
        const out = [];
        for (const r of incoming) {
          const same = conflict ? table.find((x) => conflict.every((c) => r[c] !== undefined && String(x[c]) === String(r[c]))) : null;
          if (same) {
            Object.assign(same, r, { updated_at: now });
            out.push(same);
          } else {
            // (A few columns the database fills in itself: who, and when Business was turned on, 1.42.0.)
            const own = t[1] === "profile_wallpapers" ? { user_id: F.user.id } : t[1] === "team_features" ? { enabled_at: now } : {};
            const row = { id: require("crypto").randomUUID(), created_at: now, updated_at: now, ...own, ...r };
            table.push(row);
            out.push(row);
          }
        }
        return answerRows(201, out);
      }
      if (writable && req.method === "PATCH") {
        const hit = applyFilters(tableRows(F, t[1]), url.searchParams);
        const patch = body ? JSON.parse(body) : {};
        for (const r of hit) Object.assign(r, patch, { updated_at: new Date().toISOString() });
        return answerRows(200, hit);
      }
      if (writable && req.method === "DELETE") {
        const rows = tableRows(F, t[1]);
        const hit = applyFilters(rows, url.searchParams);
        for (const r of hit) rows.splice(rows.indexOf(r), 1);
        return answerRows(200, hit);
      }
      // An update answers with the rows it matched (like "update … returning").
      if (req.method === "PATCH") return send(res, 200, applyFilters(F.tables[t[1]] ?? [], url.searchParams));
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, req.method === "POST" ? 201 : 200, []);
      const table = t[1];
      if (!F.tables[table] && process.env.MOCK_LOG) console.log("   (no fixture for", table + ")");
      const found = filterRows(tableRows(F, table) ?? [], url.searchParams);
      let rows = found.rows;
      const range = req.headers["range"];
      const total = found.total;
      if (range) {
        const [a, b] = String(range).split("-").map(Number);
        rows = rows.slice(a, b + 1);
      }
      const headers = { "Content-Range": `0-${Math.max(0, rows.length - 1)}/${total}` };
      if (req.method === "HEAD") return send(res, 200, undefined, headers);
      const accept = String(req.headers["accept"] || "");
      if (accept.includes("vnd.pgrst.object")) {
        if (!rows.length) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null }, headers);
        return send(res, 200, rows[0], headers);
      }
      return send(res, 200, rows, headers);
    }
    return send(res, 404, { message: "mock: unknown " + url.pathname });
  }
}
server.listen(54321, "127.0.0.1", () => console.log("mock supabase on :54321"));
