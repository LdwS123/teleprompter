/* Pure helpers (no DOM) so they can be unit-tested with `node --test`. */
(function (root) {
  const CUE = /\[[^\]]*\]/g;

  /** Split a script into typed lines: text, note (// ...), gap (blank). */
  function parseScript(src) {
    return String(src).replace(/\r\n?/g, "\n").split("\n").map((raw) => {
      const line = raw.trimEnd();
      if (!line.trim()) return { type: "gap", text: "" };
      if (/^\s*\/\//.test(line)) return { type: "note", text: line.replace(/^\s*\/\/\s?/, "") };
      return { type: "text", text: line };
    });
  }

  /** Words that are actually spoken: notes and [cues] are excluded. */
  function countWords(src) {
    return parseScript(src)
      .filter((l) => l.type === "text")
      .reduce((n, l) => n + l.text.replace(CUE, " ").split(/\s+/).filter(Boolean).length, 0);
  }

  /** Estimated read time in seconds at a given words-per-minute. */
  function durationSeconds(words, wpm) {
    return wpm > 0 ? Math.round((words / wpm) * 60) : 0;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  /** Scroll speed (px/s) so the text advances at `wpm` words per minute. */
  function pixelsPerSecond(contentHeightPx, words, wpm, mul) {
    if (!words || contentHeightPx <= 0) return 0;
    return (contentHeightPx / words) * (wpm / 60) * (mul || 1);
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const api = { parseScript, countWords, durationSeconds, formatTime, pixelsPerSecond, clamp };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TPCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
