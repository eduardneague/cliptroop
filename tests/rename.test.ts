// 1.33.1: a short's or a long video's name, changed from its heading (click it, Save or Enter, Cancel or Esc, clicking
// away keeps it) or from its Settings (Save name, or saved as the window closes), with a toast once it's saved.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanName } from "../lib/names";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

ok(cleanName("  Cats   and\tcups ") === "Cats and cups", "spaces squeezed, ends trimmed");
ok(cleanName("   ") === "" && cleanName(undefined as unknown as string) === "", "nothing is no name");

// The heading.
const title = read("components/ui/editable-title.tsx");
ok(/type="submit"[\s\S]{0,120}onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/.test(title), "Save doesn't take the focus first (Safari would read it as clicking away)");
ok(/onClick=\{cancel\}/.test(title) && /e\.key === "Escape"[\s\S]{0,80}cancel\(\)/.test(title), "Cancel and Esc put the name back");
ok(/onBlur=\{\(e\) => \{\s*if \(!form\.current\?\.contains\(e\.relatedTarget as Node \| null\)\) void save\(\);/.test(title), "clicking away keeps it");
ok(/if \(!\(await onSave\(next\)\)\) \{\s*setShown\(before\);\s*setDraft\(next\);\s*setEditing\(true\);/.test(title), "refused: the old name back, editing what you typed");
ok(/disabled=\{!next\}/.test(title) && /Give it a name\./.test(title), "no saving an empty name");
const shortTitle = read("app/(dashboard)/shorts/[id]/short-title.tsx");
ok(/useAction\(updateShortDetails, \{ success: \(_id, patch\) => `Renamed to “\$\{patch\.title\}”` \}\)/.test(shortTitle) && /rename\.run\(id, \{ title: next \}\)/.test(shortTitle), "a short: saved with a toast");
const longTitle = read("app/(dashboard)/videos/[id]/long-title.tsx");
ok(/useAction\(renameLongVideo, \{ success: \(_id, next\) => `Renamed to “\$\{next\}”` \}\)/.test(longTitle) && /max=\{FORM_LIMITS\.videoTitle\}/.test(longTitle), "a long video: saved with a toast, YouTube's limit");
const longPage = read("app/(dashboard)/videos/[id]/page.tsx");
ok(/<LongTitle[\s\S]{0,200}canEdit=\{userIsMaster \|\| canActOnStage\(membership, project\.stage as PipelineStage\)\}/.test(longPage), "the long video's heading: masters and whoever works on its step (the database's rule)");

// The long video's rename.
const actions = read("app/(dashboard)/videos/[id]/actions.ts");
const rename = /export async function renameLongVideo[\s\S]*?\n\}/.exec(actions)?.[0] ?? "";
ok(/UUID_RE\.test\(projectId\)/.test(rename) && /cleanName\(title\)/.test(rename) && /tooLong\(next, FORM_LIMITS\.videoTitle/.test(rename), "checked: the id, the name, its length");
ok(/getMembership\(supabase, project\.team_id\)/.test(rename) && /isMaster\(membership\?\.roles \?\? \[\]\) && !canActOnStage\(membership, project\.stage as PipelineStage\)/.test(rename), "who may: from the video's own team");
ok(/\.from\("project_titles"\)\.update\(\{ title: next \}\)\.eq\("project_id", projectId\)\.eq\("is_picked", true\)/.test(rename), "the main title idea follows the name");
ok(/refreshLong\(projectId, "any"\)/.test(rename), "the page and the lists show it");

// Settings.
const shortSettings = read("modules/short-videos/components/short-settings-dialog.tsx");
ok(/<Section label="Name">\s*<NameField/.test(shortSettings), "the short's Settings starts with its name");
ok(/function keepTyped\(\)[\s\S]*?next !== savedName && !rename\.pending\) rename\.run\(short\.id, \{ title: next \}\)/.test(shortSettings), "a name still typed is saved as it closes, never twice");
const longSettings = read("app/(dashboard)/videos/[id]/settings-dialog.tsx");
ok(/<span className=\{label\}>Name<\/span>\s*<NameField/.test(longSettings), "the long video's Settings starts with its name");
ok(/const close = \(\) => \{[\s\S]*?next !== savedName && !naming\) rename\(next\)/.test(longSettings), "and saves a typed one as it closes");
ok(/toast\.success\(`Renamed to “\$\{next\}”`\)/.test(longSettings), "with a toast");
ok(/title=\{project\.title\}/.test(longPage), "the page gives Settings the name");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("renaming ok");
