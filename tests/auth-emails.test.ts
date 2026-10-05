// The sign-in emails: every one links to /welcome with a one-time code and a
// type Supabase's verifyOtp accepts, uses the brand name, no gradients, no scripts.
import { authEmails } from "../lib/auth-emails";
import { APP_NAME } from "../lib/brand";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const TYPES = ["invite", "recovery", "email", "magiclink", "signup", "email_change"];
const emails = authEmails();
ok(emails.length === 5, "five templates");
ok(emails.filter((e) => e.important).map((e) => e.id).join() === "invite,recovery", "invite + reset are the important ones");
for (const e of emails) {
  const links = [...e.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  ok(links.length >= 2, `${e.id}: button + plain link`);
  for (const l of links) {
    const m = /^\{\{ \.SiteURL \}\}\/welcome\?token_hash=\{\{ \.TokenHash \}\}&type=([a-z_]+)$/.exec(l);
    ok(!!m && TYPES.includes(m[1]), `${e.id}: link goes to /welcome with a valid type (${l})`);
  }
  ok(e.html.includes(APP_NAME) && e.subject.includes(APP_NAME), `${e.id}: uses the app's name`);
  ok(!/gradient/i.test(e.html), `${e.id}: no gradients`);
  ok(!/<script/i.test(e.html), `${e.id}: no scripts`);
  ok(!/ConfirmationURL/.test(e.html), `${e.id}: doesn't use the old link`);
  ok(e.html.startsWith("<!doctype html>"), `${e.id}: full document`);
}
if (fails) process.exit(1);
console.log("auth emails ok");
