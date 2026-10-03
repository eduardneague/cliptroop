// A tiny stand-in for Supabase (Auth + PostgREST) so the real pages render with sample data.
const http = require("http");
const path = require("path");
const FIX = path.join(__dirname, "fixtures.cjs");
const log = [];
function fixtures() {
  delete require.cache[require.resolve(FIX)];
  return require(FIX);
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns", "or", "and"].includes(k)) continue;
    if (k.includes(".")) continue; // filters on embedded tables: ignore
    const m = /^(not\.)?(eq|neq|in|is|gte|lte|gt|lt|like|ilike)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, not, op, raw] = m;
    const has = out.length && Object.prototype.hasOwnProperty.call(out[0], k);
    if (!has) continue;
    const test = (row) => {
      const x = row[k];
      let r;
      if (op === "eq") r = String(x) === raw;
      else if (op === "neq") r = String(x) !== raw;
      else if (op === "in") r = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(x));
      else if (op === "is") r = raw === "null" ? x === null || x === undefined : String(x) === raw;
      else if (op === "gte") r = x !== null && String(x) >= raw;
      else if (op === "lte") r = x !== null && String(x) <= raw;
      else if (op === "gt") r = x !== null && String(x) > raw;
      else if (op === "lt") r = x !== null && String(x) < raw;
      else r = true;
      return not ? !r : r;
    };
    out = out.filter(test);
  }
  const limit = params.get("limit");
  if (limit) out = out.slice(0, Number(limit));
  return out;
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const F = fixtures();
    log.push(`${req.method} ${url.pathname}${url.search}`);
    if (process.env.MOCK_LOG) console.log(req.method, decodeURIComponent(url.pathname + url.search).slice(0, 300));
    if (req.method === "OPTIONS") return send(res, 204, undefined, { "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });
    if (url.pathname === "/auth/v1/user") return send(res, 200, F.user);
    if (url.pathname.startsWith("/auth/v1/")) return send(res, 200, {});
    if (url.pathname.startsWith("/storage/v1/")) {
      if (url.pathname.includes("/sign/")) return send(res, 200, { signedURL: "/missing.png" });
      return send(res, 404, { error: "not found" });
    }
    const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(url.pathname);
    if (rpc) {
      const v = F.rpc?.[rpc[1]];
      return send(res, 200, typeof v === "function" ? v(body ? JSON.parse(body) : {}) : v ?? null);
    }
    const t = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(url.pathname);
    if (t) {
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, req.method === "POST" ? 201 : 200, []);
      const table = t[1];
      if (!F.tables[table] && process.env.MOCK_LOG) console.log("   (no fixture for", table + ")");
      let rows = applyFilters(F.tables[table] ?? [], url.searchParams);
      const range = req.headers["range"];
      const total = rows.length;
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
  });
});
server.listen(54321, "127.0.0.1", () => console.log("mock supabase on :54321"));
