// 1.53.2: when a comment or an editing idea can't be added, the page says why (modules/scripts/lib/comment-errors.ts)
// and the server counts it in Developer → Problems. The owner (Nov 17 2026): "i cant add sketch ideas", and all the
// page said was "Couldn't add the idea with its sketch."
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commentFailure } from "../modules/scripts/lib/comment-errors";

let fails = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fails++;
    console.log("FAIL", `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
  }
};
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

eq(
  commentFailure({ code: "42501", message: "That drawing doesn't belong to this document." }, "edit_idea", true),
  "Couldn't add the idea with its sketch: the drawing was saved for another document. Draw it again here.",
  "the database's own drawing check, in words"
);
eq(
  commentFailure({ code: "25006", message: "cannot execute INSERT in a read-only transaction" }, "comment", false),
  "Couldn't add the comment: the database is read-only right now (it may be full), so nothing new can be saved.",
  "a full database"
);
ok(commentFailure({ code: "42501", message: 'new row violates row-level security policy for table "script_comments"' }, "edit_idea", false).startsWith("Couldn't add the idea: this account isn't allowed"), "not allowed");
eq(commentFailure({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, "edit_idea", true), "Couldn't add the idea with its sketch (JSON object requested, multiple (or no) rows returned).", "anything else: its own words");
eq(commentFailure(null, "comment", true), "Couldn't add the comment with its sketch.", "nothing to say: as before");
ok(commentFailure({ message: "x".repeat(500) }, "comment", false).length < 200, "a long message is cut");

const actions = readFileSync(join(__dirname, "..", "app/(dashboard)/scripts/actions.ts"), "utf8");
ok(actions.includes(`return { error: commentFailure(error, kind, !!sketch) };`), "addComment uses it");
ok(/void reportError\(\{\s*source: "server",\s*message: `addComment\$\{sketch \? " \(with a sketch\)" : ""\}/.test(actions), "and counts the failure in Developer → Problems");
ok(!/^export (async )?function commentFailure/m.test(actions), "it isn't a server action (it lives in a plain module)");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("script comment errors ok");
