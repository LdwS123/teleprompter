(() => {
  const { parseScript, countWords, durationSeconds, formatTime, pixelsPerSecond, clamp, normWord, advance, guessLang } = TPCore;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  /* ---------- i18n ---------- */
  const T = {
    fr: {
      title: "Téléprompteur", tagline: "Gratuit, privé, fonctionne hors ligne. Rien ne quitte ton navigateur.",
      yourScript: "Ton script", placeholder: "Colle ou écris ton script ici…",
      syntax: "Astuce : une ligne qui commence par // est une note pour toi (affichée en petit, jamais comptée). [pause] ou [sourire] devient un repère coloré.",
      sample: "Exemple", import: "Importer .txt", export: "Exporter", clear: "Effacer", settings: "Réglages",
      speed: "Vitesse de lecture", size: "Taille du texte", width: "Largeur du texte", lh: "Interligne", countdown: "Compte à rebours",
      left: "Gauche", center: "Centre", mirror: "Miroir (pour vitre / beam-splitter)", band: "Ligne de lecture",
      camera: "Aperçu caméra en fond", record: "Enregistrer la vidéo pendant la lecture", start: "Lancer le téléprompteur",
      keys: "Espace : lecture/pause · ↑ ↓ : vitesse · + − : taille · M : miroir · R : début · Échap : quitter · molette ou glisser pour avancer à la main",
      privacy: "100% local : ton script et ta vidéo ne sont jamais envoyés (seule exception : le mode voix dans Chrome).",
      words: "mots", min: "min", wpm: "mots/min", cleared: "Effacer le script ?", empty: "Écris d'abord un script.",
      camFail: "Caméra/micro refusés ou indisponibles. Le téléprompteur fonctionne quand même.", saved: "Vidéo enregistrée",
      voice: "Suivre ma voix (le texte avance quand tu lis)", vlang: "Langue parlée", vauto: "Auto (selon le script)",
      voiceNote: "Fonctionne dans Chrome / Edge / Safari. Attention : Chrome envoie l'audio aux serveurs de Google pour la reconnaissance vocale. Désactivé par défaut.",
      noVoice: "La reconnaissance vocale n'existe pas dans ce navigateur (essaie Chrome). Défilement automatique à la place.",
      micFail: "Micro refusé : défilement automatique à la place."
    },
    en: {
      title: "Teleprompter", tagline: "Free, private, works offline. Nothing leaves your browser.",
      yourScript: "Your script", placeholder: "Paste or write your script here…",
      syntax: "Tip: a line starting with // is a note for you (shown small, never counted). [pause] or [smile] becomes a coloured cue.",
      sample: "Sample", import: "Import .txt", export: "Export", clear: "Clear", settings: "Settings",
      speed: "Reading speed", size: "Text size", width: "Text width", lh: "Line spacing", countdown: "Countdown",
      left: "Left", center: "Center", mirror: "Mirror (for glass / beam-splitter rigs)", band: "Reading line",
      camera: "Camera preview in background", record: "Record video while reading", start: "Start teleprompter",
      keys: "Space: play/pause · ↑ ↓: speed · + −: size · M: mirror · R: restart · Esc: exit · wheel or drag to scroll by hand",
      privacy: "100% local: your script and video are never uploaded (one exception: voice mode in Chrome).",
      words: "words", min: "min", wpm: "wpm", cleared: "Clear the script?", empty: "Write a script first.",
      camFail: "Camera/mic denied or unavailable. The teleprompter still works.", saved: "Video saved",
      voice: "Follow my voice (text moves as you read)", vlang: "Spoken language", vauto: "Auto (from the script)",
      voiceNote: "Works in Chrome / Edge / Safari. Heads-up: Chrome sends the audio to Google's servers for speech recognition. Off by default.",
      noVoice: "Speech recognition isn't available in this browser (try Chrome). Using automatic scrolling instead.",
      micFail: "Microphone denied: using automatic scrolling instead."
    }
  };
  const SAMPLE = {
    fr: "// Hook : 3 secondes pour accrocher\nTu postules à 100 offres et personne ne répond ?\n\n[pause]\n\nVoici ce que j'ai changé : je ne cherche plus les offres, c'est mon agent qui les trouve avant tout le monde.\n\nResultat : je suis le premier candidat, pas le centième.\n\n// Appel à l'action\nSuis-moi pour la suite, et dis-moi en commentaire quel poste tu vises.",
    en: "// Hook: 3 seconds to grab them\nYou apply to 100 jobs and nobody replies?\n\n[pause]\n\nHere's what I changed: I stopped hunting for postings, my agent finds them before anyone else.\n\nResult: I'm the first applicant, not the hundredth.\n\n// Call to action\nFollow for part two, and tell me in the comments which role you're after."
  };

  let lang = localStorage.getItem("tp.lang") || ((navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en");
  const t = (k) => T[lang][k] || k;
  function applyLang() {
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach((e) => { const k = e.dataset.i18n; for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { n.textContent = t(k); return; } if (!e.children.length) e.textContent = t(k); });
    $$("[data-i18n-ph]").forEach((e) => (e.placeholder = t(e.dataset.i18nPh)));
    $("#lang").textContent = lang === "fr" ? "EN" : "FR";
    $("#sample").title = "";
    refreshStats();
  }

  /* ---------- state ---------- */
  const DEF = { wpm: 150, size: 76, width: 84, lh: 1.35, countdown: 3, align: "center", mirror: false, band: true, camera: false, record: false, voice: false, vlang: "auto" };
  let S = { ...DEF };
  try { S = { ...DEF, ...JSON.parse(localStorage.getItem("tp.settings") || "{}") }; } catch (_) {}
  const scriptEl = $("#script");
  scriptEl.value = localStorage.getItem("tp.script") ?? SAMPLE[lang];
  const save = () => { localStorage.setItem("tp.settings", JSON.stringify(S)); localStorage.setItem("tp.script", scriptEl.value); };

  const RANGES = { wpm: (v) => v, size: (v) => v + " px", width: (v) => v + " %", lh: (v) => Number(v).toFixed(2), countdown: (v) => (v ? v + " s" : "off") };
  const CHECKS = ["mirror", "band", "camera", "record", "voice"];
  function syncControls() {
    for (const k of Object.keys(RANGES)) { $("#" + k).value = S[k]; $("#" + k + "V").textContent = RANGES[k](S[k]); }
    for (const k of CHECKS) $("#" + k).checked = S[k];
    $("#vlang").value = S.vlang; $("#voiceOpts").hidden = !S.voice;
    $$("[data-align]").forEach((b) => b.classList.toggle("on", b.dataset.align === S.align));
  }
  for (const k of Object.keys(RANGES)) $("#" + k).addEventListener("input", (e) => { S[k] = Number(e.target.value); syncControls(); refreshStats(); save(); });
  for (const k of CHECKS) $("#" + k).addEventListener("change", (e) => { S[k] = e.target.checked; if (k === "record" && S.record) { S.camera = true; } syncControls(); save(); });
  $("#vlang").addEventListener("change", (e) => { S.vlang = e.target.value; save(); });
  $$("[data-align]").forEach((b) => b.addEventListener("click", () => { S.align = b.dataset.align; syncControls(); save(); }));

  function refreshStats() {
    const w = countWords(scriptEl.value);
    $("#stats").textContent = `${w} ${t("words")} · ≈ ${formatTime(durationSeconds(w, S.wpm))} @ ${S.wpm} ${t("wpm")}`;
  }
  scriptEl.addEventListener("input", () => { refreshStats(); save(); });

  /* ---------- editor actions ---------- */
  $("#lang").onclick = () => { lang = lang === "fr" ? "en" : "fr"; localStorage.setItem("tp.lang", lang); applyLang(); };
  $("#sample").onclick = () => { scriptEl.value = SAMPLE[lang]; refreshStats(); save(); };
  $("#clear").onclick = () => { if (confirm(t("cleared"))) { scriptEl.value = ""; refreshStats(); save(); } };
  $("#file").onchange = async (e) => { const f = e.target.files[0]; if (f) { scriptEl.value = await f.text(); refreshStats(); save(); } e.target.value = ""; };
  $("#export").onclick = () => download(new Blob([scriptEl.value], { type: "text/plain" }), "script.txt");
  function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

  /* ---------- prompter ---------- */
  const P = $("#prompter"), stage = $("#stage"), track = $("#track"), cam = $("#cam"), hud = $("#hud");
  let pos = 0, endPos = 0, speed = 0, playing = false, last = 0, raf = 0, words = 0, speedMul = 1, hideTimer = 0, counting = false, countTimer = 0;
  let wake = null, stream = null, rec = null, chunks = [], recStart = 0, recTick = 0;
  // voice following: wordEls/sw are the script words (DOM + normalised), tops their y in the track,
  // wp the index of the next word to be spoken, target the scroll position we ease towards
  let vActive = false, wordEls = [], sw = [], tops = [], wp = 0, target = 0, marked = 0, recog = null;

  function build() {
    track.textContent = "";
    wordEls = []; sw = []; wp = 0; marked = 0;
    for (const l of parseScript(scriptEl.value)) {
      const p = document.createElement("p");
      if (l.type === "gap") p.className = "gap";
      else if (l.type === "note") { p.className = "note"; p.textContent = l.text; }
      else for (const part of l.text.split(/(\[[^\]]*\])/)) {
        if (!part) continue;
        if (/^\[[^\]]*\]$/.test(part)) { const s = document.createElement("span"); s.className = "cue"; s.textContent = part.slice(1, -1); p.append(s, " "); }
        else for (const tok of part.split(/(\s+)/)) {
          if (!tok) continue;
          if (/^\s+$/.test(tok)) { p.append(tok); continue; }
          // "early-stage" is spoken as two words, so it becomes two spans ("early-" + "stage")
          for (const piece of tok.match(/[^-–—/]+[-–—/]?|[-–—/]+/g) || [tok]) {
            const w = document.createElement("span"); w.className = "w"; w.textContent = piece;
            p.append(w); wordEls.push(w); sw.push(normWord(piece));
          }
        }
      }
      track.appendChild(p);
    }
    words = countWords(scriptEl.value);
  }
  function layout() {
    const vh = stage.clientHeight;
    track.style.fontSize = S.size + "px";
    track.style.lineHeight = S.lh;
    track.style.width = S.width + "%";
    track.style.textAlign = S.align;
    track.style.paddingTop = vh * 0.38 + "px";      // first line starts on the reading line
    track.style.paddingBottom = vh * 0.62 + "px";
    stage.classList.toggle("mirror", S.mirror);
    $("#band-line").classList.toggle("off", !S.band);
    const content = track.scrollHeight - vh;        // padding sums to one viewport height
    endPos = Math.max(0, content - 0);
    speed = pixelsPerSecond(content, words, S.wpm, speedMul);
    $("#hWpm").textContent = Math.round(S.wpm * speedMul) + " " + t("wpm");
    pos = clamp(pos, 0, endPos);
    if (vActive) {                                   // measure every word once; voice mode only needs these numbers
      track.style.transform = "none";
      const t0 = track.getBoundingClientRect().top;
      tops = wordEls.map((el) => el.getBoundingClientRect().top - t0);
      pos = target = wordTarget(wp);
    }
    render();
  }
  const wordTarget = (i) => clamp((tops[Math.min(i, tops.length - 1)] || 0) - stage.clientHeight * 0.38, 0, endPos);
  function render() {
    track.style.transform = `translate3d(0,${-pos}px,0)`;
    $("#progress i").style.width = (endPos ? (pos / endPos) * 100 : 0) + "%";
  }

  function tick(now) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (vActive) {                                    // ease towards the word being spoken, no timer-driven scroll
      pos += (target - pos) * (1 - Math.exp(-dt * 6));
      if (Math.abs(target - pos) < 0.3) pos = target;
      render(); raf = requestAnimationFrame(tick); return;
    }
    pos = Math.min(endPos, pos + speed * dt);
    render();
    if (pos >= endPos) { pause(); if (rec) setTimeout(stopRecording, 1200); return; }
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (playing || counting) return;
    if (vActive ? wp >= sw.length : pos >= endPos) { pos = target = 0; wp = 0; markAll(); }
    playing = true; last = performance.now(); setPlayIcon(); raf = requestAnimationFrame(tick); poke();
    if (vActive) startVoice();
  }
  function pause() { playing = false; cancelAnimationFrame(raf); stopVoice(); setPlayIcon(); poke(); }
  const setPlayIcon = () => ($("#hPlay").textContent = playing || counting ? "⏸" : "▶");
  function toggle() { if (counting) cancelCountdown(); else playing ? pause() : startWithCountdown(); }

  function startWithCountdown() {
    if (S.countdown <= 0 || pos > 0) return play();
    let n = S.countdown; counting = true; setPlayIcon();
    const c = $("#count"); c.classList.add("on"); c.textContent = n;
    countTimer = setInterval(() => { n--; if (n <= 0) { cancelCountdown(); play(); } else c.textContent = n; }, 1000);
  }
  function cancelCountdown() { clearInterval(countTimer); counting = false; $("#count").classList.remove("on"); setPlayIcon(); }

  function restart() { cancelCountdown(); pause(); pos = target = 0; wp = 0; markAll(); render(); }
  function setWpm(d) { S.wpm = clamp(S.wpm + d, 60, 260); save(); syncControls(); layout(); }
  function setSize(d) {
    S.size = clamp(S.size + d, 28, 180); save(); syncControls();
    const r = endPos ? pos / endPos : 0; layout();
    if (!vActive) { pos = r * endPos; render(); }       // voice mode re-anchors on the current word inside layout()
  }

  /* ---------- voice following ---------- */
  function voiceLang() {
    if (S.vlang !== "auto") return S.vlang;
    const g = guessLang(scriptEl.value) || lang;
    return g === "fr" ? "fr-FR" : "en-US";
  }
  function markAll() {
    wordEls.forEach((el, i) => { el.classList.toggle("said", i < wp); el.classList.toggle("cur", i === wp); });
    marked = wp;
  }
  function markFast() {                                // only touch the words between the old and the new position
    for (let i = marked; i < wp && i < wordEls.length; i++) { wordEls[i].classList.add("said"); wordEls[i].classList.remove("cur"); }
    wordEls[wp]?.classList.add("cur"); marked = wp;
  }
  let prevHeard = [];
  function onSpeech(text) {
    const heard = text.split(/\s+/).filter(Boolean);
    $("#hHeard").textContent = heard.slice(-7).join(" ");
    // recognition re-sends the whole utterance on every update: only replay the words that are new,
    // one at a time, so a burst of words moves the text exactly like the same words arriving slowly
    let c = 0; while (c < prevHeard.length && c < heard.length && prevHeard[c] === heard[c]) c++;
    prevHeard = heard;
    const before = wp;
    for (let j = c; j < heard.length; j++) wp = advance(sw, wp, heard.slice(Math.max(0, j - 4), j + 1));
    if (wp === before) return;
    markFast(); target = Math.max(target, wordTarget(wp));
    if (wp >= sw.length) { pause(); if (rec) setTimeout(stopRecording, 1200); }
  }
  function startVoice() {
    if (recog || !SR) return;
    prevHeard = [];
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = voiceLang();
    r.onresult = (e) => { let txt = ""; for (let i = e.resultIndex; i < e.results.length; i++) txt += " " + e.results[i][0].transcript; onSpeech(txt); };
    r.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { vActive = false; P.classList.remove("voice"); stopVoice(); alert(t("micFail")); } };
    r.onend = () => { $("#hMic").classList.remove("live"); if (recog === r) { recog = null; if (playing && vActive) setTimeout(startVoice, 200); } };   // Chrome ends sessions on silence
    recog = r;
    try { r.start(); $("#hMic").classList.add("live"); } catch (_) { recog = null; }
  }
  function stopVoice() { const r = recog; recog = null; $("#hMic").classList.remove("live"); try { r?.abort(); } catch (_) {} }
  function syncWordToScroll() {                        // after a manual scroll: the next word is the first one at/below the reading line
    if (!vActive) return;
    const line = pos + stage.clientHeight * 0.38 - 2;
    let i = tops.findIndex((y) => y >= line);
    wp = i < 0 ? sw.length : i; target = pos; markAll();
  }
  function toggleMirror() { S.mirror = !S.mirror; save(); syncControls(); layout(); }

  function poke() { // show HUD, hide it again while playing
    hud.classList.remove("hide"); $("#heard").classList.remove("hide"); P.classList.remove("nocursor"); clearTimeout(hideTimer);
    if (playing) hideTimer = setTimeout(() => { hud.classList.add("hide"); $("#heard").classList.add("hide"); P.classList.add("nocursor"); }, 2600);
  }

  async function open() {
    if (!scriptEl.value.trim()) { alert(t("empty")); return; }
    save(); build(); speedMul = 1; pos = target = 0;
    vActive = S.voice && !!SR;
    if (S.voice && !SR) alert(t("noVoice"));
    P.classList.toggle("voice", vActive); $("#hHeard").textContent = "";
    P.hidden = false; layout(); markAll();
    try { await document.documentElement.requestFullscreen?.(); } catch (_) {}
    try { wake = await navigator.wakeLock?.request("screen"); } catch (_) {}
    if (S.camera || S.record) await startCamera();
    if (S.record && stream) startRecording();
    layout(); poke();
    startWithCountdown();
  }
  async function close() {
    cancelCountdown(); pause();
    if (rec) { await stopRecording(); }
    stopCamera(); try { await wake?.release(); } catch (_) {} wake = null;
    if (document.fullscreenElement) try { await document.exitFullscreen(); } catch (_) {}
    P.hidden = true; vActive = false; P.classList.remove("voice");
  }

  /* ---------- camera + recording ---------- */
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: S.record });
      cam.srcObject = stream; cam.style.display = "block"; await cam.play();
    } catch (e) { stream = null; cam.style.display = "none"; alert(t("camFail")); }
  }
  function stopCamera() { stream?.getTracks().forEach((tr) => tr.stop()); stream = null; cam.srcObject = null; }
  function startRecording() {
    const mime = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) return;
    chunks = []; rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(1000); recStart = Date.now(); $("#rec").hidden = false;
    recTick = setInterval(() => ($("#recT").textContent = formatTime(Math.floor((Date.now() - recStart) / 1000))), 500);
  }
  function stopRecording() {
    return new Promise((res) => {
      if (!rec) return res();
      const r = rec; rec = null; clearInterval(recTick); $("#rec").hidden = true;
      r.onstop = () => {
        const ext = r.mimeType.includes("mp4") ? "mp4" : "webm";
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        download(new Blob(chunks, { type: r.mimeType }), `teleprompter-${stamp}.${ext}`); res();
      };
      r.state !== "inactive" ? r.stop() : r.onstop();
    });
  }

  /* ---------- input ---------- */
  $("#start").onclick = open;
  $("#hPlay").onclick = toggle; $("#hRestart").onclick = restart; $("#hClose").onclick = close;
  $("#hSlow").onclick = () => setWpm(-5); $("#hFast").onclick = () => setWpm(5);
  $("#hSmall").onclick = () => setSize(-4); $("#hBig").onclick = () => setSize(4); $("#hMirror").onclick = toggleMirror;

  document.addEventListener("keydown", (e) => {
    if (P.hidden) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") open(); return; }
    const k = e.key;
    if (k === " ") { e.preventDefault(); toggle(); }
    else if (k === "ArrowUp") { e.preventDefault(); setWpm(5); }
    else if (k === "ArrowDown") { e.preventDefault(); setWpm(-5); }
    else if (k === "+" || k === "=") setSize(4);
    else if (k === "-" || k === "_") setSize(-4);
    else if (k === "m" || k === "M") toggleMirror();
    else if (k === "r" || k === "R") restart();
    else if (k === "Escape") close();
    poke();
  });
  document.addEventListener("fullscreenchange", () => !P.hidden && layout());
  window.addEventListener("resize", () => !P.hidden && layout());

  P.addEventListener("wheel", (e) => { e.preventDefault(); pos = clamp(pos + e.deltaY, 0, endPos); target = pos; render(); syncWordToScroll(); poke(); }, { passive: false });
  P.addEventListener("mousemove", poke);
  let drag = null;
  stage.addEventListener("pointerdown", (e) => { drag = { y: e.clientY, p: pos, moved: false }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener("pointermove", (e) => { if (!drag) return; const dy = e.clientY - drag.y; if (Math.abs(dy) > 6) drag.moved = true; if (drag.moved) { pos = clamp(drag.p - dy, 0, endPos); target = pos; render(); } });
  stage.addEventListener("pointerup", () => { if (drag && !drag.moved) toggle(); else syncWordToScroll(); drag = null; poke(); });
  document.addEventListener("visibilitychange", async () => { if (!document.hidden && !P.hidden && wake?.released) try { wake = await navigator.wakeLock.request("screen"); } catch (_) {} });

  syncControls(); applyLang();
})();
