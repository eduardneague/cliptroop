// Error alerts: the same error counts once however its ids and numbers differ;
// different errors (or the same one somewhere else) count separately; Next.js
// redirects / not-found are never reported.
import { fingerprint, isControlFlow } from "../lib/error-kinds";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const a = fingerprint("server", 'Could not load short 7f9c2a10-1b2c-4d5e-8f90-123456789abc (row 12) "Intro"', "/shorts/7f9c2a10-1b2c-4d5e-8f90-123456789abc");
const b = fingerprint("server", 'Could not load short 00000000-aaaa-bbbb-cccc-000000000001 (row 873) "Another title"', "/shorts/00000000-aaaa-bbbb-cccc-000000000001?view=script");
ok(a === b, "ids, numbers, quoted values and ?query don't make a new error");
ok(a !== fingerprint("browser", 'Could not load short 7f9c2a10-1b2c-4d5e-8f90-123456789abc (row 12) "Intro"', "/shorts/x"), "browser vs server are separate");
ok(a !== fingerprint("server", "Could not load video", "/shorts/[id]"), "a different message is a different error");
ok(fingerprint("job", "x", "a") !== fingerprint("job", "x", "b"), "the same message somewhere else is separate");
ok(/^[0-9a-f]{40}$/.test(a), "fingerprint is a sha1");

ok(isControlFlow(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })), "redirect is not an error");
ok(isControlFlow(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })), "notFound() is not an error");
ok(isControlFlow(new Error("Dynamic server usage: cookies")), "dynamic rendering bail-out is not an error");
ok(!isControlFlow(new Error("relation \"tasks\" does not exist")), "a real error is reported");
ok(!isControlFlow(null) && !isControlFlow(undefined) && !isControlFlow("boom"), "odd values don't crash");

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
