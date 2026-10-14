// The search bar's words (1.22.0, lib/queries.ts searchWords): each one has
// to be in a title, so "what your phone says about you 14" finds "What Your
// Phone Says About You #14".
import { searchWords } from "../modules/analytics/lib/search-words";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

ok(same(searchWords("what your phone says about you 14"), ["what", "your", "phone", "says", "about", "you", "14"]), "every word, the number too");
ok(same(searchWords("What Your Phone Says About You #14 🔥"), ["what", "your", "phone", "says", "about", "you", "14"]), "a # and an emoji in the title make the same words");
ok(same(searchWords("Don’t do this!"), ["don", "do", "this"]), `apostrophes split words (got ${searchWords("Don’t do this!").join(",")})`);
ok(same(searchWords("Don't do this!"), searchWords("Don’t do this!")), "a straight and a curly apostrophe match");
ok(searchWords("🔥🔥").length === 0, "no words: the phrase as typed is searched instead");
ok(same(searchWords("a 5 x"), ["5"]), "single letters left out, numbers kept");
ok(searchWords("one two three four five six seven eight nine ten").length === 8, "at most 8 words");
ok(same(searchWords("Ce înseamnă ASTA"), ["ce", "înseamnă", "asta"]), "letters with accents stay");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("video search: all passed");
