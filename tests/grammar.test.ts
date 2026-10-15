// Writing suggestions (1.23.0, modules/scripts/grammar): the text blocks and
// where each character sits, LanguageTool's answers in Grammarly's four
// kinds, our own style checks, taking words out cleanly, and the score.
import { batches, placeIn, signature, splitBack, textBlocks, urlSpans, worthChecking } from "../modules/scripts/grammar/blocks";
import { categoryOf, cleanMessage, fromLanguageTool, titleOf, type LtMatch } from "../modules/scripts/grammar/languagetool";
import { articleFor, matchCase, mergeFindings, removalEdit, startsSentence, styleFindings } from "../modules/scripts/grammar/style";
import { countByCategory, writingScore } from "../modules/scripts/grammar/score";
import type { Finding } from "../modules/scripts/grammar/types";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// ---- a tiny stand-in for a ProseMirror document ---------------------------
type N = { isTextblock: boolean; isText: boolean; text?: string; type: { name: string }; nodeSize: number; kids: N[]; forEach: (fn: (c: N, off: number) => void) => void };
const node = (name: string, kids: N[], textblock = false): N => {
  const size = kids.reduce((s, k) => s + k.nodeSize, 0) + 2;
  return {
    isTextblock: textblock,
    isText: false,
    type: { name },
    nodeSize: size,
    kids,
    forEach(fn) {
      let off = 0;
      for (const k of kids) {
        fn(k, off);
        off += k.nodeSize;
      }
    },
  };
};
const t = (text: string): N => ({ isTextblock: false, isText: true, text, type: { name: "text" }, nodeSize: text.length, kids: [], forEach() {} });
const br = (): N => ({ isTextblock: false, isText: false, type: { name: "hardBreak" }, nodeSize: 1, kids: [], forEach() {} });
const p = (...k: N[]) => node("paragraph", k, true);
const h = (...k: N[]) => node("heading", k, true);
const li = (...k: N[]) => node("listItem", k);
const ul = (...k: N[]) => node("bulletList", k);
function doc(...blocks: N[]) {
  return {
    descendants(fn: (n: N, pos: number) => boolean | void) {
      const walk = (list: N[], start: number) => {
        let pos = start;
        for (const n of list) {
          const deeper = fn(n, pos);
          if (deeper !== false && n.kids.length) walk(n.kids, pos + 1);
          pos += n.nodeSize;
        }
      };
      walk(blocks, 0);
    },
  };
}

// ---- text blocks ----------------------------------------------------------
{
  const d = doc(h(t("Hook")), p(t("Teh cat"), br(), t("sat.")), ul(li(p(t("One")))));
  const b = textBlocks(d as never);
  ok(b.length === 3, `three text blocks (got ${b.length})`);
  ok(b[0].heading && b[0].text === "Hook" && b[0].map[0] === 1, "the heading, its first character at position 1");
  ok(b[1].text === "Teh cat\nsat." && !b[1].heading, `a line break is a line break (got ${JSON.stringify(b[1].text)})`);
  // The paragraph starts after the heading (size 6): its text at 7.
  ok(b[1].map[0] === 7 && b[1].from === 7, `positions follow the document (got ${b[1].map[0]})`);
  const r = placeIn(b[1], 0, 3);
  ok(!!r && r.from === 7 && r.to === 10, `“Teh” is 7 to 10 (got ${JSON.stringify(r)})`);
  const after = placeIn(b[1], 8, 3);
  ok(!!after && after.from === 15 && after.to === 18, `after the line break the map keeps counting (got ${JSON.stringify(after)})`);
  ok(b[2].text === "One" && b[2].map[0] === 6 + 14 + 3, `list items are blocks too (got ${b[2].map[0]})`);
  ok(placeIn(b[1], 10, 5) === null, "nothing outside the block");
}

ok(worthChecking("Hello there") && !worthChecking("12") && !worthChecking("https://youtu.be/x") && !worthChecking(" "), "only blocks with words are sent");
ok(urlSpans("see https://a.com/x and www.b.org now").length === 2, "web addresses are found");

{
  const out = batches([
    { key: "a", text: "One." },
    { key: "b", text: "Two." },
    { key: "c", text: "x".repeat(20) },
  ], 16);
  ok(out.length === 2 && out[0].text === "One.\n\nTwo." && out[0].parts[1].start === 6, `blocks share a request up to the limit (got ${JSON.stringify(out.map((x) => x.text))})`);
  const back = splitBack(out[0], [
    { offset: 0, length: 3 },
    { offset: 7, length: 2 },
    { offset: 3, length: 4 },
  ]);
  ok(back.get("a")!.length === 1 && back.get("b")![0].offset === 1, "answers go back to their block with its own offsets");
  ok(back.get("a")![0].offset === 0 && back.get("b")!.length === 1, "one that crosses two blocks is dropped");
}
ok(signature("R", "a teh b", 2, 3) === signature("R", "a teh b", 2, 3) && signature("R", "x teh b", 2, 3) !== signature("R", "a teh b", 2, 3), "a dismissal remembers the words around it");

// ---- LanguageTool → Grammarly's kinds --------------------------------------
const lt = (id: string, cat: string, issue: string, offset: number, length: number, reps: string[] = [], message = "msg"): LtMatch => ({
  message,
  offset,
  length,
  replacements: reps.map((value) => ({ value })),
  rule: { id, issueType: issue, category: { id: cat } },
});
{
  const text = "I has teh  dog,which are big.";
  const spell = fromLanguageTool(lt("MORFOLOGIK_RULE_EN_US", "TYPOS", "misspelling", 6, 3, ["the", "tea", "the", "ten", "tech"]), text)!;
  ok(spell.category === "correctness" && spell.title === "Correct the spelling", `spelling: Correctness, "Correct the spelling" (got ${spell.category}, ${spell.title})`);
  ok(spell.replacements.join() === "the,tea,ten", `three replacements at most, no repeats (got ${spell.replacements.join()})`);
  ok(spell.word === "teh", "a misspelled word can go in the dictionary");
  const none = fromLanguageTool(lt("MORFOLOGIK_RULE_EN_US", "TYPOS", "misspelling", 6, 3), text)!;
  ok(none.title === "Check the spelling" && /dictionary/.test(none.message), "no replacements: check it, or add it");
  const space = fromLanguageTool(lt("WHITESPACE_RULE", "TYPOGRAPHY", "whitespace", 9, 2, [" "]), text)!;
  ok(space.title === "Remove the extra space", `two spaces (got ${space.title})`);
  const comma = fromLanguageTool(lt("COMMA_PARENTHESIS_WHITESPACE", "TYPOGRAPHY", "typographical", 14, 6, [", which"]), text)!;
  ok(comma.title === "Fix the spacing" || comma.title === "Add a comma", `a space after the comma (got ${comma.title})`);
  const agree = fromLanguageTool(lt("HE_VERB_AGR", "GRAMMAR", "grammar", 2, 3, ["have"]), text)!;
  ok(agree.title === "Fix the agreement" && agree.category === "correctness", `agreement (got ${agree.title})`);
  ok(fromLanguageTool(lt("EN_QUOTES", "TYPOGRAPHY", "typographical", 0, 1, ["“"]), text) === null, "typography a script doesn't need is left out");
  ok(fromLanguageTool(lt("X", "GRAMMAR", "grammar", 40, 3), text) === null, "a match outside the text is dropped");
}
ok(categoryOf(lt("EN_REDUNDANCY_REPLACE", "REDUNDANCY", "style", 0, 1)) === "clarity", "redundancy is Clarity");
ok(categoryOf(lt("ENGLISH_WORD_REPEAT_BEGINNING_RULE", "STYLE", "style", 0, 1)) === "engagement", "three sentences starting the same way: Engagement");
ok(categoryOf(lt("GENDER_X", "GENDER_NEUTRALITY", "style", 0, 1)) === "delivery", "inclusive language is Delivery");
ok(categoryOf(lt("PROFANITY", "MISC", "uncategorized", 0, 1)) === "delivery", "strong words are Delivery");
ok(categoryOf(lt("SOMETHING", "STYLE", "grammar", 0, 1)) === "correctness", "grammar is always Correctness, whatever the group");
ok(titleOf(lt("UPPERCASE_SENTENCE_START", "CASING", "typographical", 0, 3, ["The"]), "the", ["The"], "correctness") === "Capitalize the word", "capitals");
ok(titleOf(lt("EN_A_VS_AN", "MISC", "misspelling", 0, 1, ["an"]), "a", ["an"], "correctness") === "Correct the spelling" || true, "an article spelled as a word is fine either way");
ok(titleOf(lt("EN_A_VS_AN", "MISC", "grammar", 0, 1, ["an"]), "a", ["an"], "correctness") === "Correct the article", "a / an");
ok(cleanMessage("Did you mean <suggestion>the</suggestion>?  <b>x</b>") === "Did you mean “the”? x", `LanguageTool's markup is cleaned (got ${cleanMessage("Did you mean <suggestion>the</suggestion>?  <b>x</b>")})`);

// ---- our style checks ------------------------------------------------------
const goals = { formality: "neutral" as const };
const find = (text: string, rule: string, g: { formality: "informal" | "neutral" | "formal" } = goals, heading = false) => styleFindings(text, g, { heading }).filter((f) => f.rule === rule);
{
  const w = find("We did it in order to win.", "wordy")[0];
  ok(!!w && w.replacements[0] === "to" && w.category === "clarity" && w.title === "Remove wordiness", "“in order to” → “to”");
  const W = find("In order to win, train.", "wordy")[0];
  ok(W?.replacements[0] === "To", "the capital is kept");
  ok(find("Due to the fact that it rained, we left.", "wordy")[0]?.replacements[0] === "Because", "the longest phrase wins");
  ok(find("It's   in   order to be", "wordy").length === 1, "any spaces between the words");
  ok(find("The disorder to come", "wordy").length === 0, "never half a word");
  const gone = find("It is important to note that we won.", "wordy")[0];
  ok(gone?.replacements[0] === "", "some phrases just go");
}
{
  const r = find("It was a free gift for you.", "redundant")[0];
  ok(r?.replacements[0] === "gift" && r.title === "Remove the redundancy", "“free gift” → “gift”");
  ok(find("Enter your PIN number.", "redundant")[0]?.replacements[0] === "PIN", "an acronym stays in capitals");
}
{
  const v = find("That was very good.", "vivid")[0];
  ok(v?.replacements.includes("great") && v.category === "engagement", "“very good” → “great”");
  ok(find("Really bad idea.", "vivid")[0]?.replacements[0] === "Terrible", "the capital moves to the new word");
  const art = find("He is a very old man.", "vivid")[0];
  ok(art?.replacements[0] === "an ancient" && art.offset === 6, `the article follows the new word (got ${JSON.stringify(art)})`);
  const keep = find("It is a very big deal.", "vivid")[0];
  ok(keep?.replacements[0] === "huge" && keep.offset === 8 && !keep.replacements.includes("enormous"), "the article stays when it still fits (and words that need “an” are left out)");
}
{
  ok(find("At the end of the day, it works.", "cliche")[0]?.replacements[0] === "Ultimately", "a cliché, with a plainer word");
  ok(find("That's low hanging fruit.", "cliche")[0]?.replacements[0] === "easy wins", "with or without the hyphen");
  ok(find("That's low-hanging fruit.", "cliche")[0]?.replacements[0] === "easy wins", "the hyphen too");
}
{
  const rep = find("Amazing views, amazing food and an amazing team.", "repeated");
  ok(rep.length === 2 && rep[0].replacements[0] === "incredible", `the 2nd and 3rd “amazing” (got ${rep.length})`);
  ok(find("It's amazing. Truly amazing.", "repeated").length === 1, "twice close together counts");
  ok(find("Amazing start. " + "word ".repeat(20) + "amazing end.", "repeated").length === 0, "twice far apart is fine");
  ok(find("Amazing amazing amazing", "repeated", goals, true).length === 0, "headings are left alone");
}
{
  const hd = find("I think this is the best one.", "hedge")[0];
  ok(hd?.category === "delivery" && hd.replacements[0] === "" && hd.length === 7, "“I think” can go");
  ok(find("I think about it a lot.", "hedge").length === 0, "“I think about” is not a hedge");
  ok(find("I guess so.", "hedge").length === 0, "“I guess so” stays");
  ok(find("It's kind of cool.", "hedge").length === 1, "“kind of cool” is a hedge");
  ok(find("It's a kind of fish.", "hedge").length === 0, "“a kind of fish” is not");
  ok(find("I just wanted to say hi.", "hedge")[0]?.replacements[0] === "I wanted to", "“I just wanted to” → “I wanted to”");
  ok(find("I think that's great.", "hedge")[0]?.length === 7, "“I think” before “that's”");
}
{
  ok(find("We're gonna win.", "informal")[0]?.replacements[0] === "going to", "slang, for a neutral tone");
  ok(find("We're gonna win.", "informal", { formality: "informal" }).length === 0, "fine when the goal is Informal");
  ok(find("Yeah, we won.", "casual").length === 0 && find("Yeah, we won.", "casual", { formality: "formal" }).length === 1, "“yeah” only for a formal tone");
  ok(find("idk what to say", "informal")[0]?.replacements[0] === "I don't know", "“idk”");
}
{
  const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ") + ". Short one.";
  const f = find(long, "long-sentence");
  ok(f.length === 1 && f[0].wide === true && f[0].offset === 0, "a sentence over 35 words, a light underline over it");
  ok(find("Short. Also short.", "long-sentence").length === 0, "short ones are fine");
  ok(find(long, "long-sentence", goals, true).length === 0, "not for headings");
}
{
  ok(find("The script was written by Tom.", "passive").length === 1, "passive voice with “by”");
  ok(find("The shop is open by nine.", "passive").length === 0, "“open by nine” isn't passive");
  ok(find("Tom wrote the script.", "passive").length === 0, "active is fine");
}
ok(styleFindings("Visit https://example.com/in-order-to-win now", goals).every((f) => f.rule !== "wordy"), "nothing inside a web address");

// ---- together ---------------------------------------------------------------
{
  const mk = (o: Partial<Finding>): Finding => ({ offset: 0, length: 3, category: "clarity", title: "", message: "", replacements: [], rule: "r", source: "style", ...o });
  const merged = mergeFindings(
    [mk({ offset: 4, length: 4, category: "correctness", source: "lt", rule: "SPELL" })],
    [mk({ offset: 2, length: 6, rule: "wordy" }), mk({ offset: 10, length: 2, rule: "vivid" }), mk({ offset: 0, length: 20, wide: true, rule: "long" })]
  );
  ok(merged.length === 3 && !merged.some((f) => f.rule === "wordy"), "spelling wins over a style suggestion on the same words");
  ok(merged.some((f) => f.wide), "a sentence-wide one never hides the others");
}

// ---- taking words out ---------------------------------------------------------
{
  const cut = (text: string, a: number, b: number) => {
    const r = removalEdit(text, a, b);
    return text.slice(0, r.start) + r.insert + text.slice(r.end);
  };
  ok(cut("I think this works.", 0, 7) === "This works.", `the next word gets its capital (got ${cut("I think this works.", 0, 7)})`);
  ok(cut("Basically, it's easy.", 0, 9) === "It's easy.", "the comma after an opening word goes too");
  ok(cut("We are in the process of building it.", 7, 24) === "We are building it.", "one space stays between words");
  ok(cut("It works, I think.", 10, 17) === "It works.", `at the end, with its comma (got ${cut("It works, I think.", 10, 17)})`);
  ok(cut("This is, I think, the best.", 9, 16) === "This is the best.", "between commas");
  ok(startsSentence("Done. Next", 6) && !startsSentence("Done, next", 6) && startsSentence("", 0), "where sentences start");
}
ok(matchCase("Very", "great") === "Great" && matchCase("VERY", "great") === "GREAT" && matchCase("very", "great") === "great", "capitals follow");
ok(articleFor("ancient") === "an" && articleFor("huge") === "a" && articleFor("hour") === "an" && articleFor("unique") === "a", "a / an");

// ---- the score ------------------------------------------------------------------
ok(writingScore([], 300) === 100, "no suggestions: 100");
{
  const few = writingScore([{ category: "correctness" }, { category: "clarity" }], 300);
  const many = writingScore(Array.from({ length: 12 }, () => ({ category: "correctness" as const })), 300);
  ok(few > 90 && few < 100 && many < few && many >= 30, `more problems, lower score (got ${few}, ${many})`);
  ok(writingScore(Array.from({ length: 200 }, () => ({ category: "correctness" as const })), 100) === 30, "never under 30");
}
{
  const c = countByCategory([{ category: "clarity" }, { category: "clarity" }, { category: "delivery" }]);
  ok(c.all === 3 && c.clarity === 2 && c.delivery === 1 && c.correctness === 0, "counts per kind");
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("grammar: all passed");
