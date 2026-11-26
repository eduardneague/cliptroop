import "server-only";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup, type LookupAddress } from "node:dns";
import { isLocalHost, isPrivateAddress } from "@/lib/link-preview";

/*
 * Reading a public web page from the server: the script editor's link previews (1.23.0, app/api/link-preview) and,
 * since 1.57.0, Sponsorships' product pictures (modules/affiliates/lib/pictures.ts). Only http(s) on ports 80 and 443,
 * never an address inside a network (checked on the address the connection really uses, so a name can't point
 * somewhere else between the check and the request), only pages (html or xml: anything else isn't read), a time limit
 * and a size limit. Redirects are the caller's to follow, each one checked with publicUrl() first.
 */

export type WebRes = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

/** Only public addresses, on the address the connection really uses. */
function safeLookup(
  hostname: string,
  options: { all?: boolean; family?: number } | number,
  callback: (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void
) {
  lookup(hostname, { all: true }, (err, list) => {
    if (err) return callback(err);
    const all = (Array.isArray(list) ? list : []) as LookupAddress[];
    if (!all.length || all.some((a) => isPrivateAddress(a.address))) {
      const e = new Error("That address isn't public.") as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return callback(e);
    }
    if (typeof options === "object" && options.all) return callback(null, all);
    callback(null, all[0].address, all[0].family);
  });
}

/** An address the server may read: http(s), ports 80/443, no password in it, not a number inside a network or a local name. */
export function publicUrl(u: URL): boolean {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  // An address written as numbers is checked here; names are checked when they're looked up.
  if (/^[\d.]+$/.test(host) || host.includes(":")) return !isPrivateAddress(host);
  return !isLocalHost(host);
}

/**
 * One request (no redirect followed: a 3xx comes back with its Location and no body). `timeoutMs`: the longest
 * silence; `totalMs`, when given: the longest the whole answer may take (a page that trickles in is cut off).
 */
export function fetchOnce(url: URL, o: { timeoutMs?: number; totalMs?: number; maxBytes?: number; userAgent?: string } = {}): Promise<WebRes> {
  const maxBytes = o.maxBytes ?? 600_000;
  return new Promise((resolve, reject) => {
    let total: ReturnType<typeof setTimeout> | null = null;
    const finish = (fn: () => void) => {
      if (total) clearTimeout(total);
      fn();
    };
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        headers: {
          "User-Agent": o.userAgent ?? "Mozilla/5.0 (compatible; ClipTroopLinkPreview/1.0)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en;q=0.9,*;q=0.5",
        },
        timeout: o.timeoutMs ?? 6000,
      },
      (res: IncomingMessage) => {
        const type = String(res.headers["content-type"] ?? "");
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () => {
          const charset = /charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase() ?? "utf-8";
          let body = "";
          try {
            body = new TextDecoder(charset).decode(Buffer.concat(chunks));
          } catch {
            body = Buffer.concat(chunks).toString("utf8");
          }
          finish(() => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
        };
        // Only a page is read; anything else (a video, a PDF) is described by its address. (Closed at once, 1.57.0:
        // never downloaded, however big.)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.destroy();
          return finish(() => resolve({ status: res.statusCode!, headers: res.headers, body: "" }));
        }
        if (!/html|xml/i.test(type)) {
          res.destroy();
          return finish(() => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: "" }));
        }
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            done();
            return;
          }
          chunks.push(c);
        });
        res.on("end", done);
        res.on("error", (e) => finish(() => reject(e)));
      }
    );
    if (o.totalMs) total = setTimeout(() => req.destroy(new Error("timeout")), o.totalMs);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => finish(() => reject(e)));
    req.end();
  });
}
