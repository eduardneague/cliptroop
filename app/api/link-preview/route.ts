import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup, type LookupAddress } from "node:dns";
import { getCachedUser } from "@/lib/supabase/get-user";
import { frameAllowed, isLocalHost, isPrivateAddress, parsePreview, type LinkPreview } from "@/lib/link-preview";

/*
 * GET /api/link-preview?url= (1.23.0): what a link in a script leads to
 * (title, a line about it, picture, icon) and whether the site lets other
 * apps show it inside them (the editor's in-app window).
 *
 * The server only reads public web pages: http(s), ports 80 and 443,
 * never an address inside a network (checked on the address actually used,
 * so a name can't point somewhere else between the check and the request),
 * at most 4 redirects, 6 seconds and 600 KB of the page.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (body: unknown, status = 200, cache = false) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache ? "private, max-age=3600" : "no-store" },
  });

type Res = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

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

function get(url: URL): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ClipTroopLinkPreview/1.0)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en;q=0.9,*;q=0.5",
        },
        timeout: 6000,
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
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        };
        // Only a page is read; anything else (a video, a PDF) is described by its address.
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          return resolve({ status: res.statusCode, headers: res.headers, body: "" });
        }
        if (!/html|xml/i.test(type)) {
          res.resume();
          return resolve({ status: res.statusCode ?? 0, headers: res.headers, body: "" });
        }
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > 600_000) {
            res.destroy();
            done();
            return;
          }
          chunks.push(c);
        });
        res.on("end", done);
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

function allowed(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  // An address written as numbers is checked here; names are checked when they're looked up.
  if (/^[\d.]+$/.test(host) || host.includes(":")) return !isPrivateAddress(host);
  return !isLocalHost(host);
}

export async function GET(req: Request) {
  const user = await getCachedUser();
  if (!user) return json({ error: "Sign in first." }, 401);
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return json({ error: "That isn't a web address." }, 400);
  }
  if (raw.length > 2000 || !allowed(url)) return json({ error: "That address can't be previewed." }, 400);

  try {
    let res: Res | null = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await get(url);
      const loc = res.headers.location;
      if (res.status >= 300 && res.status < 400 && typeof loc === "string") {
        const next = new URL(loc, url);
        if (!allowed(next)) return json({ error: "That link leads somewhere that can't be previewed." }, 400);
        url = next;
        continue;
      }
      break;
    }
    if (!res) return json({ error: "No answer." }, 502);
    const header = (n: string) => {
      const v = res!.headers[n];
      return Array.isArray(v) ? v.join(", ") : v ?? null;
    };
    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const preview: LinkPreview = {
      url: url.toString(),
      ...(res.body ? parsePreview(res.body, url.toString()) : { title: null, description: null, image: null, icon: new URL("/favicon.ico", url).toString(), site: null }),
      frame: res.status < 400 && frameAllowed(header, appOrigin),
    };
    return json(preview, 200, true);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "EBLOCKED") return json({ error: "That address can't be previewed." }, 400);
    return json({ error: "Couldn't reach that page." }, 502);
  }
}
