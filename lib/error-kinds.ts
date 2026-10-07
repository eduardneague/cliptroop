import { createHash } from "node:crypto";

/*
 * Telling errors apart (used by lib/errors.ts). Kept free of server-only
 * imports so tests/error-kinds.test.ts can check it.
 */

/** Next.js uses errors for redirects / not-found / dynamic rendering: those aren't problems. */
export function isControlFlow(e: unknown) {
  const digest = (e as { digest?: unknown } | null)?.digest;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return (
    (typeof digest === "string" && /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(digest)) ||
    /^(NEXT_REDIRECT|NEXT_NOT_FOUND|Dynamic server usage)/.test(msg)
  );
}

export { isNetworkNoise } from "./network-noise";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The same error, wherever it happens: numbers, ids and quoted values don't make it a new one. */
export function fingerprint(source: string, message: string, route: string) {
  const norm = message
    .replace(UUID, "<id>")
    .replace(/"[^"]{0,80}"/g, '"…"')
    .replace(/\d+/g, "<n>")
    .slice(0, 300);
  const where = route.replace(UUID, "[id]").split("?")[0];
  return createHash("sha1").update(`${source}|${where}|${norm}`).digest("hex");
}
