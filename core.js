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

  /* ---------- voice following ---------- */

  /** Lowercase, strip accents and punctuation: "L'équipe," -> "lequipe". */
  function normWord(w) {
    return String(w).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  }

  function editDistance(a, b) {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0]; prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[b.length];
  }

  /** Forgiving equality for already-normalised words (speech recognition is never exact). */
  function wordsMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const min = Math.min(a.length, b.length);
    if (min < 4) return false;                                   // short words must be exact
    if (a.startsWith(b) || b.startsWith(a)) return true;         // partial / interim words
    if (min >= 5) return editDistance(a, b) <= (Math.max(a.length, b.length) >= 8 ? 2 : 1);
    return false;
  }

  /**
   * Where is the speaker now? `sw` are the normalised script words, `pos` the index of the next
   * word expected, `spoken` the latest words heard. Returns the new `pos` (never goes backwards).
   * A match needs the last heard word to fit and, unless it is the very next word or a long
   * distinctive one nearby, at least one more aligned word: this stops "the" or "and" from
   * teleporting the text.
   */
  function advance(sw, pos, spoken, look) {
    look = look || 14;
    const sp = spoken.map(normWord).filter(Boolean).slice(-5);
    if (!sp.length || pos >= sw.length) return pos;
    const last = sp[sp.length - 1];
    const end = Math.min(sw.length - 1, pos + look);
    let best = -1, bestScore = 0;
    for (let i = pos; i <= end; i++) {
      if (!wordsMatch(sw[i], last)) continue;
      let score = 1;
      for (let k = 1; k < 4 && k < sp.length && i - k >= 0; k++) if (wordsMatch(sw[i - k], sp[sp.length - 1 - k])) score++;
      const d = i - pos;
      const ok = score >= 2 || d <= 1 || (sw[i].length >= 5 && d <= 6);
      if (ok && score > bestScore) { best = i; bestScore = score; }   // strict ">" keeps the nearest on ties
    }
    return best < 0 ? pos : best + 1;
  }

  /** Cheap language guess for choosing the recognition language: "fr", "en" or null. */
  function guessLang(src) {
    const FR = new Set("le la les des du de un une et est je tu il nous vous pour que qui dans pas sur avec mon ma mes ton ce cette sont suis je j l d qu c".split(" "));
    const EN = new Set("the and to of is are you your i a an for that this with in on it we my me be have not at as but".split(" "));
    let fr = 0, en = 0;
    for (const raw of parseScript(src).filter((l) => l.type === "text").map((l) => l.text.replace(CUE, " ")).join(" ").split(/[\s']+/)) {
      const w = normWord(raw);
      if (FR.has(w)) fr++;
      if (EN.has(w)) en++;
    }
    if (fr + en < 3) return null;
    return fr > en * 1.2 ? "fr" : en > fr * 1.2 ? "en" : null;
  }

  /* ---------- delivery cues: [smile], [passion], [pause]... shown as big emoji ---------- */
  const EMOTIONS = [
    { emoji: "😊", en: "smile", fr: "sourire" },
    { emoji: "🔥", en: "passion", fr: "passion", alias: ["excited", "enthousiaste", "energy", "energie"] },
    { emoji: "😌", en: "calm", fr: "calme" },
    { emoji: "💪", en: "emphasis", fr: "insiste", alias: ["insist", "stress", "emphase"] },
    { emoji: "😮", en: "surprise", fr: "surprise" },
    { emoji: "😄", en: "laugh", fr: "rire" },
    { emoji: "😐", en: "serious", fr: "serieux" },
    { emoji: "😔", en: "sad", fr: "triste" },
    { emoji: "🐢", en: "slow", fr: "lent", alias: ["ralentis"] },
    { emoji: "⚡", en: "fast", fr: "rapide", alias: ["accelere"] },
    { emoji: "⏸", en: "pause", fr: "pause", alias: ["silence", "beat"] },
    { emoji: "🌬️", en: "breathe", fr: "respire", alias: ["breath", "respiration"] },
    { emoji: "👀", en: "eyes", fr: "regard", alias: ["look", "eyecontact", "camera"] },
  ];

  /** Emotion entry for a cue tag ("Smile", "sourire"...), or null for an unknown tag. */
  function emotionFor(tag) {
    const k = normWord(tag);
    if (!k) return null;
    return EMOTIONS.find((e) => k === normWord(e.en) || k === normWord(e.fr) || (e.alias || []).includes(k)) || null;
  }

  const api = { parseScript, countWords, durationSeconds, formatTime, pixelsPerSecond, clamp, normWord, wordsMatch, advance, guessLang, EMOTIONS, emotionFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TPCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
