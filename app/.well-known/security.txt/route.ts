import { siteUrl } from "@/lib/public-pages";
import { securityTxt } from "@/lib/security-txt";

/*
 * /.well-known/security.txt (1.33.0, lib/security-txt.ts). The middleware never runs for it (its matcher skips .txt),
 * so it opens without signing in, and it's worked out on each request (its Expires moves with the date).
 */
export function GET(request: Request) {
  return new Response(securityTxt(siteUrl() || new URL(request.url).origin), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
