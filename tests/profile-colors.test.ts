// A profile's colours (1.29.5, lib/profile/colors.ts): what can be saved, and what it draws with.
import { cleanColor, cleanColors, colorCss, colorName, COLOR_PRESETS, DEFAULT_COLORS, readColors, sameColors } from "../lib/profile/colors";
import { NEEDS_0093, NEEDS_0099, pageRow, saveProblem } from "../modules/profile/page-data";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

ok(cleanColor("level") === "level" && cleanColor("theme") === "theme" && cleanColor("#3E63DD") === "#3e63dd" && cleanColor(" #3e63dd ") === "#3e63dd", "the level's, the theme's, a colour (lower case)");
ok(cleanColor("off") === "level" && cleanColor("off", true) === "off", "off only where it can be (the glow)");
ok(["#fff", "red", "url(x)", "#12345", "#1234567", "", null, 5, {}].every((v) => cleanColor(v) === "level"), "anything else: the level's");

ok(sameColors(readColors(null), DEFAULT_COLORS), "a database before 0099: the level's colours");
const row = readColors({ frame_color: "theme", bar_color: "#E2A300", glow_color: "off" });
ok(row.frame === "theme" && row.bar === "#e2a300" && row.glow === "off", "read from a row");
ok(readColors({ frame_color: "off" }).frame === "level", "a frame can't be off");
const sent = cleanColors({ frame: "#30a46c", bar: "nope", glow: "off", evil: "x" });
ok(sent.frame === "#30a46c" && sent.bar === "level" && sent.glow === "off" && !("evil" in sent), "what the page sends, cleaned");
ok(sameColors(cleanColors(null), DEFAULT_COLORS) && sameColors(cleanColors([1, 2]), DEFAULT_COLORS), "nothing sent: the level's");
ok(!sameColors(DEFAULT_COLORS, { ...DEFAULT_COLORS, glow: "off" }), "a change is a change");

ok(colorCss("level", "#e2a300") === "#e2a300" && colorCss("theme", "#e2a300") === "rgb(var(--amber))" && colorCss("#30a46c", "#e2a300") === "#30a46c", "as CSS");
ok(colorName("level").includes("level") && colorName("#30a46c") === "Green" && colorName("#123456") === "Your own colour" && colorName("off") === "Off", "names for the picker");
ok(COLOR_PRESETS.length === 12 && new Set(COLOR_PRESETS.map((p) => p.hex)).size === 12 && COLOR_PRESETS.every((p) => cleanColor(p.hex) === p.hex), "a dozen colours, each one that can be saved");

// What Save sends (modules/profile/page-data.ts): colours only when given, cleaned; what a refusal means.
const r = pageRow({ public: true, colors: { frame: "#3E63DD", bar: "nope", glow: "off" } }, "u1");
ok("row" in r && r.row.frame_color === "#3e63dd" && r.row.bar_color === "level" && r.row.glow_color === "off" && r.row.public === true, "colours go in cleaned");
const plain = pageRow({ public: false }, "u1");
ok("row" in plain && !("frame_color" in plain.row), "no colours given: none sent (a database without 0099 saves the rest)");
ok("error" in pageRow({ frame: "golden" }, "u1"), "an unknown frame is refused here already");
ok(saveProblem({ code: "PGRST204", message: "Could not find the 'bar_color' column of 'profile_pages' in the schema cache" }) === NEEDS_0099, "PostgREST without the colour columns: the 0099 note (not 0093's)");
ok(saveProblem({ code: "42703", message: 'column "glow_color" of relation "profile_pages" does not exist' }) === NEEDS_0099, "Postgres without them: the same");
ok(saveProblem({ code: "PGRST205", message: "Could not find the table 'public.profile_pages' in the schema cache" }) === NEEDS_0093, "no profile pages at all: the 0093 note");
ok(saveProblem({ code: "P0001", message: "Reach level 5 to use this frame." }) === "Reach level 5 to use this frame.", "the database's own words");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("profile colours: all passed");
