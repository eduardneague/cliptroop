import { APP_NAME } from "@/lib/brand";

/*
 * The "you're offline" page the installed app shows when a page can't load
 * at all (public/sw.js keeps a copy). Plain HTML with everything inline: it
 * must work without the app's scripts, which can't load offline either.
 */
export const dynamic = "force-static";

const MASCOT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 20 84 84" width="96" height="96" aria-hidden="true">
<defs><clipPath id="b"><rect x="30" y="50" width="60" height="50" rx="10"/></clipPath><clipPath id="a"><rect x="29" y="38" width="62" height="10" rx="3"/></clipPath></defs>
<rect x="30" y="50" width="60" height="50" rx="10" fill="#FFF4E6" stroke="#FFF4E6" stroke-width="6"/>
<g clip-path="url(#b)"><rect x="28" y="50" width="64" height="11" fill="#2B2118"/><polygon points="22,61 28,50 34,50 28,61" fill="#E8630D"/><polygon points="33,61 39,50 45,50 39,61" fill="#E8630D"/><polygon points="44,61 50,50 56,50 50,61" fill="#E8630D"/><polygon points="55,61 61,50 67,50 61,61" fill="#E8630D"/><polygon points="66,61 72,50 78,50 72,61" fill="#E8630D"/><polygon points="77,61 83,50 89,50 83,61" fill="#E8630D"/><polygon points="88,61 94,50 100,50 94,61" fill="#E8630D"/></g>
<rect x="30" y="50" width="60" height="50" rx="10" fill="none" stroke="#2B2118" stroke-width="3.4"/>
<ellipse cx="40" cy="86" rx="4.5" ry="2.5" fill="#FF8FA3" opacity="0.65"/><ellipse cx="80" cy="86" rx="4.5" ry="2.5" fill="#FF8FA3" opacity="0.65"/>
<ellipse cx="48" cy="77" rx="3.6" ry="4.6" fill="#2B2118"/><ellipse cx="72" cy="77" rx="3.6" ry="4.6" fill="#2B2118"/>
<circle cx="49.2" cy="75.4" r="1.3" fill="#fff"/><circle cx="73.2" cy="75.4" r="1.3" fill="#fff"/>
<path d="M54.5 86 Q60 91 65.5 86" fill="none" stroke="#2B2118" stroke-width="2.8" stroke-linecap="round"/>
<g transform="rotate(-12 31 48)"><rect x="29" y="38" width="62" height="10" rx="3" fill="#2B2118" stroke="#FFF4E6" stroke-width="5"/>
<g clip-path="url(#a)"><polygon points="22,48 28,38 34,38 28,48" fill="#E8630D"/><polygon points="33,48 39,38 45,38 39,48" fill="#E8630D"/><polygon points="44,48 50,38 56,38 50,48" fill="#E8630D"/><polygon points="55,48 61,38 67,38 61,48" fill="#E8630D"/><polygon points="66,48 72,38 78,38 72,48" fill="#E8630D"/><polygon points="77,48 83,38 89,38 83,48" fill="#E8630D"/><polygon points="88,48 94,38 100,38 94,48" fill="#E8630D"/></g>
<rect x="29" y="38" width="62" height="10" rx="3" fill="none" stroke="#2B2118" stroke-width="2.8"/><circle cx="33" cy="48" r="2.4" fill="#FFF4E6" stroke="#2B2118" stroke-width="1.8"/></g>
</svg>`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function GET() {
  const name = esc(APP_NAME);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Offline · ${name}</title><meta name="theme-color" content="#EDEEE7">
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#EDEEE7;color:#14110C;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px;box-sizing:border-box;text-align:center}
@media (prefers-color-scheme:dark){body{background:#120F0B;color:#F0ECE3}p{color:#B8B0A2}}
main{max-width:22rem}h1{font-size:26px;margin:14px 0 6px;letter-spacing:-.01em}p{margin:0 0 22px;color:#5C5548}
button{font:inherit;font-weight:600;border:0;border-radius:12px;background:#E8630D;color:#fff;padding:0 20px;height:44px;cursor:pointer}
</style></head><body><main>${MASCOT}<h1>You&rsquo;re offline</h1>
<p>${name} needs the internet to show your team&rsquo;s latest work. It&rsquo;ll be right here as soon as you&rsquo;re back online.</p>
<button type="button" onclick="location.reload()">Try again</button></main>
<script>addEventListener("online",function(){location.reload()})</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
}
