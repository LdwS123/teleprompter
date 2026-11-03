const test = require("node:test");
const assert = require("node:assert/strict");
const { parseScript, countWords, durationSeconds, formatTime, pixelsPerSecond, clamp, normWord, wordsMatch, advance, guessLang } = require("../core.js");

const SW = "hi i am konstantine and i love sales in paris".split(" ").map(normWord);

test("normWord strips accents and punctuation", () => {
  assert.equal(normWord("L'équipe,"), "lequipe");
  assert.equal(normWord("—"), "");
});

test("wordsMatch is forgiving for long words only", () => {
  assert.ok(wordsMatch("konstantine", "konstantin"));   // interim / partial
  assert.ok(wordsMatch("business", "busines"));
  assert.ok(wordsMatch("startup", "startap"));          // one typo
  assert.ok(!wordsMatch("the", "he"));                  // short words must be exact
  assert.ok(!wordsMatch("", "a"));
});

test("advance follows what is being said", () => {
  assert.equal(advance(SW, 0, ["hi", "i", "am"]), 3);
  assert.equal(advance(SW, 3, ["konstantin"]), 4);      // partial word, next word
  assert.equal(advance(SW, 0, ["konstantine"]), 4);     // skipped ahead, distinctive word
});

test("advance ignores common words far away and never goes back", () => {
  assert.equal(advance(SW, 0, ["and"]), 0);             // "and" is 4 words ahead and short
  assert.equal(advance(SW, 5, ["hi"]), 5);
  assert.equal(advance(SW, 0, []), 0);
  assert.equal(advance(SW, 0, ["banana"]), 0);
});

test("advance tolerates a missed word using the aligned tail", () => {
  assert.equal(advance(SW, 4, ["i", "love", "sales"]), 8);
});

test("guessLang", () => {
  assert.equal(guessLang("I love the way you are building this for the team"), "en");
  assert.equal(guessLang("Je suis dans une équipe qui est pour les clients"), "fr");
  assert.equal(guessLang("ok"), null);
});

test("parseScript types lines", () => {
  const l = parseScript("Hello world\r\n\r\n// smile here\nBye");
  assert.deepEqual(l.map((x) => x.type), ["text", "gap", "note", "text"]);
  assert.equal(l[2].text, "smile here");
});

test("countWords ignores notes and [cues]", () => {
  assert.equal(countWords("one two three\n// not spoken at all\nfour [pause] five"), 5);
  assert.equal(countWords(""), 0);
});

test("duration and formatting", () => {
  assert.equal(durationSeconds(150, 150), 60);
  assert.equal(durationSeconds(75, 150), 30);
  assert.equal(durationSeconds(10, 0), 0);
  assert.equal(formatTime(65), "1:05");
});

test("pixelsPerSecond maps wpm to scroll speed", () => {
  assert.equal(pixelsPerSecond(1000, 100, 120, 1), 20); // 10px/word * 2 words/s
  assert.equal(pixelsPerSecond(1000, 0, 120, 1), 0);
  assert.equal(pixelsPerSecond(1000, 100, 120, 0.5), 10);
});

test("clamp", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
});
