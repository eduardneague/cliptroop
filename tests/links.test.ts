// Links in scripts (1.23.0): which links have a player the app can show
// (modules/scripts/lib/links.ts), and reading a page's preview safely
// (lib/link-preview.ts).
import { embedFor, hostOf, shortUrl, webUrl } from "../modules/scripts/lib/links";
import { decodeEntities, frameAllowed, isLocalHost, isPrivateAddress, parsePreview } from "../lib/link-preview";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

ok(!!webUrl("https://example.com/a") && !webUrl("javascript:alert(1)") && !webUrl("data:text/html,x") && !webUrl("https://u:p@example.com"), "only plain web addresses");
ok(hostOf("https://www.youtube.com/watch?v=abc") === "youtube.com", "the host without www");
ok(shortUrl("https://www.example.com/a/very/long/path/that/goes/on/and/on/forever/and/ever?x=1", 30).endsWith("…"), "long addresses are cut");

const yt = embedFor("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42");
ok(yt?.src === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42" && yt.kind === "video", `YouTube, from where it was (got ${yt?.src})`);
ok(embedFor("https://youtu.be/dQw4w9WgXcQ")?.src === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "youtu.be");
ok(embedFor("https://youtube.com/shorts/dQw4w9WgXcQ")?.tall === true, "a Short is tall");
ok(embedFor("https://www.youtube.com/@channel") === null, "a channel page has no player");
ok(embedFor("https://www.tiktok.com/@someone/video/7234567890123456789")?.src === "https://www.tiktok.com/embed/v2/7234567890123456789", "TikTok");
ok(embedFor("https://www.instagram.com/reel/Cabc123/")?.src === "https://www.instagram.com/reel/Cabc123/embed", "an Instagram reel");
ok(embedFor("https://x.com/user/status/12345")?.src === "https://platform.twitter.com/embed/Tweet.html?id=12345", "a post on X");
ok(embedFor("https://docs.google.com/document/d/1AbC/edit#heading=h.x")?.src === "https://docs.google.com/document/d/1AbC/preview", "a Google Doc");
ok(embedFor("https://vimeo.com/123456")?.src === "https://player.vimeo.com/video/123456", "Vimeo");
ok(embedFor("https://example.com/watch?v=dQw4w9WgXcQ") === null, "other sites: no player of their own");
ok(embedFor("javascript:alert(1)") === null, "never anything but web addresses");

ok(isPrivateAddress("127.0.0.1") && isPrivateAddress("10.2.3.4") && isPrivateAddress("172.20.1.1") && isPrivateAddress("192.168.1.10") && isPrivateAddress("169.254.169.254"), "private and machine addresses");
ok(isPrivateAddress("::1") && isPrivateAddress("fd00::1") && isPrivateAddress("fe80::1") && isPrivateAddress("::ffff:10.0.0.1") && isPrivateAddress("100.64.0.1"), "IPv6 and shared ones too");
ok(!isPrivateAddress("8.8.8.8") && !isPrivateAddress("2606:4700::1111") && !isPrivateAddress("172.32.0.1"), "public addresses are fine");
ok(isPrivateAddress("not-an-ip"), "anything not understood is refused");
ok(isLocalHost("localhost") && isLocalHost("db.internal") && isLocalHost("printer") && !isLocalHost("example.com"), "local host names");

const html = `<!doctype html><html><head>
<title>Ignored &amp; plain</title>
<meta property="og:title" content="The &quot;Real&quot; Title">
<meta name="description" content="A page about things.">
<meta property="og:image" content="/img/cover.jpg">
<meta property="og:site_name" content="Example">
<link rel="icon" href="/favicon-16.png" sizes="16x16">
<link rel="apple-touch-icon" href="/apple.png">
</head><body><meta property="og:title" content="not this"></body></html>`;
const pv = parsePreview(html, "https://example.com/post/1");
ok(pv.title === 'The "Real" Title', `the page's own title (got ${pv.title})`);
ok(pv.description === "A page about things." && pv.site === "Example", "description and site");
ok(pv.image === "https://example.com/img/cover.jpg" && pv.icon === "https://example.com/apple.png", `addresses made whole, the bigger icon (got ${pv.image}, ${pv.icon})`);
ok(parsePreview("<html><head><title>Only a title</title></head></html>", "https://a.com/").icon === "https://a.com/favicon.ico", "no icon listed: the site's favicon");
ok(decodeEntities("&#39;a&#x27; &lt;b&gt;") === "'a' <b>", "entities");
ok(parsePreview('<head><meta property="og:image" content="javascript:alert(1)"></head>', "https://a.com/").image === null, "never a script address as the picture");

const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
ok(frameAllowed(h({}), "https://app.cliptroop.com"), "no rule: may be shown");
ok(!frameAllowed(h({ "x-frame-options": "DENY" }), null) && !frameAllowed(h({ "x-frame-options": "SAMEORIGIN" }), null), "X-Frame-Options says no");
ok(!frameAllowed(h({ "content-security-policy": "default-src 'self'; frame-ancestors 'self'" }), "https://app.cliptroop.com"), "frame-ancestors 'self' says no");
ok(frameAllowed(h({ "content-security-policy": "frame-ancestors *" }), null), "frame-ancestors * says yes");
ok(frameAllowed(h({ "content-security-policy": "frame-ancestors https://*.cliptroop.com" }), "https://app.cliptroop.com"), "a wildcard for our domain says yes");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("links: all passed");
