// The vulnerability gate's rules (1.31.7). Pure: scripts/audit.mjs runs npm audit and hands its answers here;
// tests/audit.test.ts checks every rule.
//
//   - A package the app ships (dependencies, and everything they pull in): a known problem rated moderate, high or
//     critical stops the build.
//   - The build's own tools (devDependencies only): high or critical stops it; moderate is shown as a warning.
//   - Low and info are only shown.
//   - A waiver (security/audit-waivers.json) lets one advisory through until its date, at most 90 days ahead, with
//     a reason. An expired waiver lets nothing through. A waiver for something npm no longer reports is pointed out.

export const LEVELS = ["info", "low", "moderate", "high", "critical"];
export const SHIPS_STOPS_AT = "moderate";
export const TOOLS_STOP_AT = "high";
export const MAX_WAIVER_DAYS = 90;

const rank = (s) => {
  const i = LEVELS.indexOf(String(s ?? "").toLowerCase());
  return i === -1 ? LEVELS.length : i; // An unknown rating counts as the worst.
};
export const atLeast = (severity, floor) => rank(severity) >= rank(floor);

/** "https://github.com/advisories/GHSA-abcd-efgh-ijkl" → "GHSA-abcd-efgh-ijkl" (else npm's own number). */
export function advisoryId(via) {
  const m = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(String(via?.url ?? ""));
  if (m) return `GHSA-${m[0].slice(5).toLowerCase()}`;
  return via?.source !== undefined ? `npm-${via.source}` : `unknown-${String(via?.name ?? "?")}`;
}

/**
 * Every advisory in one `npm audit --json` answer (report version 2), once each: the package it's about, what it
 * says, how bad, where it sits in node_modules and what would fix it. Packages that are only listed because they
 * contain a vulnerable one (like next, holding an old postcss) don't add advisories of their own.
 */
export function advisoriesOf(report) {
  const out = new Map();
  const vulns = report && typeof report === "object" ? report.vulnerabilities ?? {} : {};
  for (const [name, v] of Object.entries(vulns)) {
    for (const via of Array.isArray(v?.via) ? v.via : []) {
      if (!via || typeof via !== "object") continue;
      const id = advisoryId(via);
      const key = `${id}|${via.name ?? name}`;
      const prev = out.get(key);
      const nodes = [...new Set([...(prev?.nodes ?? []), ...(Array.isArray(v.nodes) ? v.nodes : [])])];
      out.set(key, {
        id,
        pkg: String(via.name ?? name),
        title: String(via.title ?? "").trim() || "No title",
        severity: String(via.severity ?? v.severity ?? "critical").toLowerCase(),
        url: typeof via.url === "string" ? via.url : null,
        range: typeof via.range === "string" ? via.range : v.range ?? null,
        nodes,
        fix: v.fixAvailable ?? null,
      });
    }
  }
  return [...out.values()];
}

/** YYYY-MM-DD in UTC. */
export const dayOf = (d) => new Date(d).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * The waiver list, checked: each needs an advisory id, the package, a reason of a few words and a date
 * (YYYY-MM-DD) at most 90 days from today. Mistakes in the file stop the build (a waiver that silently does nothing
 * is worse than none).
 */
export function readWaivers(file, today) {
  const errors = [];
  const active = [];
  const expired = [];
  const list = file && typeof file === "object" && Array.isArray(file.waivers) ? file.waivers : null;
  if (!list) return { active, expired, errors: ['security/audit-waivers.json must look like { "waivers": [ … ] }'] };
  list.forEach((w, i) => {
    const where = `waiver ${i + 1}${w?.id ? ` (${w.id})` : ""}`;
    if (!w || typeof w !== "object") return void errors.push(`${where}: not an object`);
    if (!/^(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}|npm-\d+)$/i.test(String(w.id ?? ""))) errors.push(`${where}: "id" must be the advisory's GHSA-xxxx-xxxx-xxxx`);
    if (!String(w.package ?? "").trim()) errors.push(`${where}: "package" is missing`);
    if (String(w.reason ?? "").trim().length < 12) errors.push(`${where}: "reason" must say why it's safe to wait (a sentence)`);
    const until = String(w.until ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(`${until}T00:00:00Z`))) return void errors.push(`${where}: "until" must be a date like 2026-11-30`);
    const left = daysBetween(today, until);
    if (left > MAX_WAIVER_DAYS) errors.push(`${where}: "until" is ${left} days away; a waiver lasts at most ${MAX_WAIVER_DAYS} days`);
    const entry = { id: String(w.id), pkg: String(w.package ?? ""), reason: String(w.reason ?? ""), until };
    if (left < 0) expired.push(entry);
    else active.push(entry);
  });
  return { active, expired, errors };
}

const sameId = (a, b) => a.toLowerCase() === b.toLowerCase();

/**
 * The verdict: `ships` = advisories from `npm audit --omit=dev`, `all` = from `npm audit --include=dev`.
 * Returns what stops the build, what's only shown, what was let through by a waiver, and notes about the waivers.
 */
export function verdict({ ships, all, waivers }) {
  const shipIds = new Set(ships.map((a) => `${a.id}|${a.pkg}`));
  const tools = all.filter((a) => !shipIds.has(`${a.id}|${a.pkg}`));
  const waiverFor = (a) => waivers.active.find((w) => sameId(w.id, a.id));
  const stop = [];
  const warn = [];
  const waived = [];
  for (const [list, scope, floor] of [
    [ships, "ships", SHIPS_STOPS_AT],
    [tools, "tool", TOOLS_STOP_AT],
  ]) {
    for (const a of list) {
      const item = { ...a, scope };
      if (!atLeast(a.severity, floor)) warn.push(item);
      else if (waiverFor(a)) waived.push({ ...item, waiver: waiverFor(a) });
      else stop.push(item);
    }
  }
  const seen = new Set(all.concat(ships).map((a) => a.id.toLowerCase()));
  const notes = [
    ...waivers.active.filter((w) => !seen.has(w.id.toLowerCase())).map((w) => `Waiver ${w.id} (${w.pkg}) isn't needed any more: npm no longer reports it. Take it out of security/audit-waivers.json.`),
    ...waivers.expired.map((w) => `Waiver ${w.id} (${w.pkg}) ended on ${w.until}, so it no longer lets anything through.`),
  ];
  const order = (a, b) => rank(b.severity) - rank(a.severity) || a.pkg.localeCompare(b.pkg);
  return { ok: stop.length === 0 && waivers.errors.length === 0, stop: stop.sort(order), warn: warn.sort(order), waived: waived.sort(order), notes, errors: waivers.errors };
}

/** What would fix it, in words. */
export function fixText(a) {
  const f = a.fix;
  if (f && typeof f === "object" && f.name) {
    return f.isSemVerMajor
      ? `npm says ${f.name}@${f.version} would fix it, but that's a new major version: check whether a newer release of the package that holds it is out, or make the app use a fixed copy with an "overrides" entry in package.json.`
      : `update it: npm install ${f.name}@${f.version}`;
  }
  if (f === true) return "npm audit fix can update it within the versions package.json allows.";
  return "no fixed version yet: wait for one, or add a waiver with a reason and an end date.";
}

/** The report, as lines for the build log. */
export function describe(result) {
  const lines = [];
  const where = (a) => {
    // "node_modules/next/node_modules/postcss" → inside next; "node_modules/@a/b/node_modules/c/node_modules/d" → inside @a/b → c.
    const inside = a.nodes
      .map((n) => String(n).replace(/^node_modules\//, "").split("/node_modules/"))
      .filter((parts) => parts.length > 1)
      .map((parts) => parts.slice(0, -1).join(" → "));
    return inside.length ? ` (inside ${[...new Set(inside)].join(", ")})` : "";
  };
  const line = (a) => `${a.pkg}${where(a)}: ${a.severity.toUpperCase()} · ${a.title} · ${a.id}${a.url ? ` (${a.url})` : ""}`;
  if (result.stop.length) {
    lines.push(`✗ ${result.stop.length} known vulnerabilit${result.stop.length === 1 ? "y stops" : "ies stop"} the build:`);
    for (const a of result.stop) lines.push(`  • ${line(a)}`, `    ${a.scope === "ships" ? "The app ships this package." : "A build tool (devDependencies)."} Fix: ${fixText(a)}`);
  }
  for (const e of result.errors) lines.push(`✗ ${e}`);
  if (result.waived.length) {
    lines.push(`! Let through by a waiver:`);
    for (const a of result.waived) lines.push(`  • ${line(a)}`, `    until ${a.waiver.until}: ${a.waiver.reason}`);
  }
  if (result.warn.length) {
    lines.push(`· Below the bar (shown only):`);
    for (const a of result.warn) lines.push(`  • ${line(a)}`);
  }
  for (const n of result.notes) lines.push(`! ${n}`);
  if (result.ok) lines.push(result.waived.length ? "✓ No known vulnerability stops the build (see the waivers above)." : "✓ No known vulnerabilities that stop the build.");
  return lines;
}
