const test = require("node:test");
const assert = require("node:assert/strict");
const { parseScript, countWords, durationSeconds, formatTime, pixelsPerSecond, clamp } = require("../core.js");

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
