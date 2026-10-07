(function () {
  "use strict";

  const BUILD = "20261007-pack-1";
  const SYNC = window.TYPING_KIDS_SYNC || {};
  const PROGRAM = SYNC.PROGRAM || "typing-kids";
  const PASS_ACCURACY = SYNC.PASS_ACCURACY || 90;

  const THEMES = {
    sky: {
      label: "Sky Classroom",
      bg: "#E8F4FF",
      panel: "#FFFFFF",
      accent: "#2B6CB0",
      text: "#1A365D",
      good: "#276749",
      bad: "#C53030",
      key: "#BEE3F8",
      btnText: "#1A365D",
    },
    ocean: {
      label: "Ocean",
      bg: "#023E8A",
      panel: "#0077B6",
      accent: "#90E0EF",
      text: "#CAF0F8",
      good: "#80ED99",
      bad: "#FF6B6B",
      key: "#0096C7",
      btnText: "#023E8A",
    },
    forest: {
      label: "Forest",
      bg: "#1B4332",
      panel: "#2D6A4F",
      accent: "#95D5B2",
      text: "#D8F3DC",
      good: "#B7E4C7",
      bad: "#F07167",
      key: "#40916C",
      btnText: "#1B4332",
    },
    neon: {
      label: "Night Neon",
      bg: "#0D0221",
      panel: "#261447",
      accent: "#FF2E97",
      text: "#F8F32B",
      good: "#39FF14",
      bad: "#FF3131",
      key: "#3A0CA3",
      btnText: "#FFFFFF",
    },
  };

  const FINGER_COLOR = {
    LP: "#F6AD55",
    LR: "#68D391",
    LM: "#63B3ED",
    LI: "#F687B3",
    RI: "#F687B3",
    RM: "#63B3ED",
    RR: "#68D391",
    RP: "#F6AD55",
    TH: "#9F7AEA",
  };

  const QWERTY = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
    ["z", "x", "c", "v", "b", "n", "m", ",", "."],
    [" "],
  ];

  const Mode = {
    WAIT: "wait",
    HUB: "hub",
    LESSONS: "lessons",
    TEACH: "teach",
    PLAY: "play",
    RESULT: "result",
    SHOP: "shop",
    SETTINGS: "settings",
  };

  let curriculum = {};
  let shop = {};
  let save = defaultSave();
  let mode = Mode.WAIT;
  let studentId = "";
  let studentKey = "";
  let authReady = false;
  let dataReady = false;
  let remoteSave = null;
  let lessonIdx = 0;
  let screenIdx = 0;
  let target = "";
  let typed = 0;
  let errors = 0;
  let startedAt = 0;
  let timedLeft = 0;
  let timedTimer = null;
  let lastWpm = 0;
  let lastAcc = 100;
  let lastPass = false;
  let failReason = "";
  let audioUnlocked = false;

  const sfx = {
    click: new Audio("assets/click.wav"),
    error: new Audio("assets/error.wav"),
    ok: new Audio("assets/ok.wav"),
    level: new Audio("assets/level.wav"),
  };

  const appEl = document.getElementById("app");

  function defaultSave() {
    if (typeof SYNC.defaultSave === "function") return SYNC.defaultSave();
    return {
      students: {},
      current: "",
      teacher_wpm: 10,
      pass_accuracy: PASS_ACCURACY,
      tts: true,
      sounds: true,
    };
  }

  function normalizeSave(raw) {
    if (typeof SYNC.normalizeSave === "function") return SYNC.normalizeSave(raw);
    const out = defaultSave();
    if (raw && typeof raw === "object") Object.assign(out, raw);
    out.pass_accuracy = PASS_ACCURACY;
    return out;
  }

  function storageKeyForStudent(id) {
    if (typeof SYNC.studentStorageKey === "function") {
      return SYNC.studentStorageKey(id);
    }
    const k = String(id || "").trim().toLowerCase();
    return k ? "mrj_typing_kids:" + k : "mrj_typing_kids";
  }

  function loadSaveFromKey(key) {
    save = defaultSave();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        save = normalizeSave(JSON.parse(raw));
      }
    } catch (_) {
      /* ignore */
    }
  }

  function persistLocal() {
    if (!studentKey) return;
    try {
      localStorage.setItem(studentKey, JSON.stringify(save));
    } catch (_) {
      /* ignore */
    }
  }

  function persist() {
    persistLocal();
    if (remoteSave && typeof remoteSave.queue === "function") {
      remoteSave.queue();
    }
  }

  function authApi() {
    return window.MRJ_AUTH || null;
  }

  function packApiAvailable() {
    const auth = authApi();
    return !!(auth && typeof auth.loadPack === "function");
  }

  async function syncPackFromServer() {
    const auth = authApi();
    if (!packApiAvailable()) {
      if (remoteSave) remoteSave.setPackLoadOk(true);
      return;
    }
    let result;
    try {
      result = await auth.loadPack(PROGRAM);
    } catch (_) {
      result = { ok: false };
    }
    if (!result || !result.ok) {
      if (remoteSave) {
        remoteSave.setPackLoadOk(false);
        remoteSave.scheduleRetry(function () {
          syncPackFromServer();
        });
      }
      return;
    }
    if (remoteSave) remoteSave.clearRetry();
    const remote = typeof SYNC.parsePackJson === "function"
      ? SYNC.parsePackJson(result.progress_json)
      : defaultSave();
    const before = normalizeSave(save);
    const merged =
      typeof SYNC.mergeSave === "function"
        ? SYNC.mergeSave(before, remote)
        : before;
    const richer =
      typeof SYNC.isRicherThan === "function"
        ? SYNC.isRicherThan(merged, remote)
        : false;
    save = merged;
    persistLocal();
    if (remoteSave) remoteSave.setPackLoadOk(true);
    if (
      richer &&
      typeof auth.savePack === "function" &&
      (!auth.packReady || auth.packReady(PROGRAM))
    ) {
      try {
        await auth.savePack(PROGRAM, JSON.stringify(save));
      } catch (_) {
        /* ignore */
      }
    }
  }

  function currentName() {
    return String(studentId || "").trim();
  }

  function currentStudent() {
    const n = currentName();
    if (!n) return {};
    const students = save.students || {};
    return students[n] || {};
  }

  function ensureStudent(name) {
    name = String(name || "").trim();
    if (!name) return;
    if (!save.students) save.students = {};
    if (!save.students[name]) {
      save.students[name] = {
        theme: "sky",
        points: 0,
        hat: "none",
        shirt: "plain",
        glasses: "none",
        passed: {},
        best: {},
      };
    }
    save.current = name;
    persist();
  }

  function themeId() {
    const st = currentStudent();
    const tid = String(st.theme || "sky");
    return THEMES[tid] ? tid : "sky";
  }

  function T() {
    return THEMES[themeId()];
  }

  function applyTheme() {
    const t = T();
    document.body.style.backgroundColor = t.bg;
    document.body.style.color = t.text;
  }

  function setTheme(tid) {
    if (!THEMES[tid]) return;
    const n = currentName();
    if (!n) return;
    save.students[n].theme = tid;
    persist();
    render();
  }

  function addPoints(n) {
    const st = currentStudent();
    if (!st || !currentName()) return;
    st.points = (st.points || 0) + n;
    save.students[currentName()] = st;
    persist();
  }

  function spend(cost) {
    const st = currentStudent();
    if (!st || !currentName()) return false;
    if ((st.points || 0) < cost) return false;
    st.points -= cost;
    save.students[currentName()] = st;
    persist();
    return true;
  }

  function markPassed(lessonId, wpm, acc) {
    const st = currentStudent();
    if (!st || !currentName()) return;
    st.passed = st.passed || {};
    st.passed[lessonId] = true;
    st.best = st.best || {};
    const prev = st.best[lessonId] || {};
    st.best[lessonId] = {
      wpm: Math.max(Number(prev.wpm || 0), wpm),
      acc: Math.max(Number(prev.acc || 0), acc),
    };
    save.students[currentName()] = st;
    persist();
    postScore(lessonId, wpm, acc);
  }

  function postScore(lessonId, wpm, acc) {
    const id = currentName();
    if (!id) return;
    const auth = window.MRJ_AUTH;
    if (!auth || typeof auth.noteScore !== "function") return;
    if (String(auth.student() || "").trim() !== id) return;
    auth.noteScore({
      program: "typing-kids",
      itemId: String(lessonId || ""),
      scoreValue: Number(wpm) || 0,
      scoreMax: 100,
      scorePct: Number(acc) || 0,
    });
  }

  function isPassed(lessonId) {
    const st = currentStudent();
    return Boolean(st.passed && st.passed[lessonId]);
  }

  function lessons() {
    return curriculum.lessons || [];
  }

  function lessonUnlocked(idx) {
    if (idx <= 0) return true;
    const L = lessons();
    if (idx >= L.length) return false;
    const prev = L[idx - 1];
    return isPassed(String(prev.id || ""));
  }

  function lesson() {
    const L = lessons();
    if (lessonIdx < 0 || lessonIdx >= L.length) return {};
    return L[lessonIdx];
  }

  function screen() {
    const L = lesson();
    const screens = L.screens || [];
    if (screenIdx < 0 || screenIdx >= screens.length) return {};
    return screens[screenIdx];
  }

  function snapped(n, step) {
    const f = 1 / step;
    return Math.round(n * f) / f;
  }

  function acc() {
    const total = typed + errors;
    if (total <= 0) return 100;
    return (100 * typed) / total;
  }

  function wpm() {
    let mins = (Date.now() - startedAt) / 60000;
    if (mins <= 0) mins = 1 / 60;
    const words = typed / 5;
    return words / mins;
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function rgbToHex(r, g, b) {
    const c = (n) => n.toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  function lerpColor(a, b, t) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    return rgbToHex(
      Math.round(A.r + (B.r - A.r) * t),
      Math.round(A.g + (B.g - A.g) * t),
      Math.round(A.b + (B.b - A.b) * t)
    );
  }

  function unlockAudio() {
    audioUnlocked = true;
  }

  function beep(which) {
    if (!save.sounds) return;
    const a = sfx[which];
    if (!a) return;
    if (!audioUnlocked) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  let enVoice = null;

  function pickVoice() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices();
    enVoice = voices.find((v) => /^en/i.test(v.lang)) || voices[0] || null;
  }

  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = pickVoice;
    pickVoice();
  }

  function speak(text) {
    if (!save.tts || !text || !String(text).trim()) return;
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).trim());
    u.rate = 1;
    u.pitch = 1;
    if (enVoice) u.voice = enVoice;
    speechSynthesis.speak(u);
  }

  function stopSpeech() {
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  function clearTimed() {
    if (timedTimer) {
      clearInterval(timedTimer);
      timedTimer = null;
    }
  }

  function bootScreen() {
    const sc = screen();
    const typ = String(sc.type || "");
    typed = 0;
    errors = 0;
    startedAt = Date.now();
    target = String(sc.prompt || "");
    clearTimed();
    if (typ === "teach") {
      mode = Mode.TEACH;
      speak(sc.tts || sc.body || "");
    } else {
      mode = Mode.PLAY;
      if (typ === "timed") {
        timedLeft = Number(sc.seconds || 60);
        timedTimer = setInterval(() => {
          timedLeft = Math.max(0, timedLeft - 0.1);
          const label = document.getElementById("time-label");
          if (label) label.textContent = `Time ${Math.ceil(timedLeft)}`;
          if (timedLeft <= 0) finishScreen();
        }, 100);
      }
      if (save.tts && target) {
        speak("Type this. " + target.replace(/\n/g, " "));
      }
    }
  }

  function startLesson(i) {
    if (!authReady) return;
    lessonIdx = i;
    screenIdx = 0;
    bootScreen();
    render();
  }

  function promptHtml(t) {
    let done = target.slice(0, typed).replace(/\[/g, "(").replace(/\]/g, ")");
    let cur = "";
    let rest = "";
    if (typed < target.length) {
      cur = target[typed];
      rest = target.slice(typed + 1);
    }
    const showNl = (s) => s.replace(/\n/g, "↵\n");
    done = showNl(done);
    const curShow = cur === "\n" ? "↵" : cur === " " ? "␣" : cur;
    rest = showNl(rest).replace(/\[/g, "(").replace(/\]/g, ")");
    return (
      `<span class="prompt-done">${escapeHtml(done)}</span>` +
      `<span class="prompt-cur" style="background:${t.accent};color:#000">${escapeHtml(curShow)}</span>` +
      `<span class="prompt-rest">${escapeHtml(rest)}</span>`
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }


  // Jay 28SEP2026: every passed lesson also lands a row in the ONE score book.
  function logToOneBook(lessonTitle, wpmValue, accValue) {
    if (!window.MRJ_SCORES) return;
    var who = currentName();
    if (!who) return;
    window.MRJ_SCORES.post({
      student: who,
      program: "typing-kids",
      appName: "MRJ Typing Kids",
      source: "typing-kids",
      unitTitle: String(lessonTitle || ""),
      itemId: "typing:" + String(lessonTitle || "lesson") + ":" + new Date().toISOString().slice(0, 10),
      itemType: "typing_lesson",
      scoreValue: Number(accValue || 0),
      scoreMax: 100,
      metadata: { wpm: Number(wpmValue || 0), goal_wpm: Number(save.teacher_wpm || 0) }
    });
  }

  function finishScreen() {
    clearTimed();
    const a = acc();
    const w = wpm();
    const needWpm = Number(save.teacher_wpm || 10);
    const needAcc = Number(save.pass_accuracy || PASS_ACCURACY);
    const sc = screen();
    const typ = String(sc.type || "");
    if (typ !== "teach" && a + 0.001 < needAcc) {
      lastPass = false;
      failReason = `Accuracy was ${snapped(a, 0.1)}%. Need 90%.`;
      lastWpm = w;
      lastAcc = a;
      beep("error");
      mode = Mode.RESULT;
      render();
      return;
    }
    const needSpeed = typ === "words" || typ === "sentence" || typ === "timed";
    if (needSpeed && w + 0.001 < needWpm) {
      lastPass = false;
      failReason = `Speed was ${snapped(w, 0.1)} WPM. Need ${needWpm}.`;
      lastWpm = w;
      lastAcc = a;
      beep("error");
      mode = Mode.RESULT;
      render();
      return;
    }
    logToOneBook((lesson() || {}).title || (lesson() || {}).id, w, a);
    advanceOrFinish(true, w, a);
  }

  function advanceOrFinish(ok, w, a) {
    const L = lesson();
    const screens = L.screens || [];
    if (screenIdx + 1 < screens.length) {
      screenIdx += 1;
      bootScreen();
      render();
      return;
    }
    lastPass = ok;
    lastWpm = w;
    lastAcc = a;
    failReason = "";
    if (ok) {
      markPassed(String(L.id || ""), w, a);
      addPoints(50);
      beep("level");
    }
    mode = Mode.RESULT;
    render();
  }

  function onPlayKey(e) {
    if (mode !== Mode.PLAY) return;
    const sc = screen();
    if (String(sc.type || "") === "teach") return;
    if (typed >= target.length) return;

    let got = "";
    if (e.key === "Enter") got = "\n";
    else if (e.key.length === 1) got = e.key;
    else return;

    const want = target[typed];
    if (want === undefined) return;

    if (e.key.length === 1 || e.key === "Enter") {
      e.preventDefault();
    }

    unlockAudio();

    if (got === want) {
      typed += 1;
      beep("click");
      if (typed >= target.length) finishScreen();
      else updatePlayUi();
    } else {
      errors += 1;
      beep("error");
      updatePlayUi();
    }
  }

  function updatePlayUi() {
    const t = T();
    const promptEl = document.getElementById("prompt-box");
    if (promptEl) promptEl.innerHTML = promptHtml(t);
    const statsEl = document.getElementById("stats-line");
    if (statsEl) {
      statsEl.textContent = `Errors: ${errors}   Accuracy so far: ${snapped(acc(), 0.1)}%`;
    }
    paintKeyboard();
  }

  function keyColor(k, want, t) {
    const fingers = curriculum.fingers || {};
    const fid = String(fingers[k] || "");
    let base = t.key;
    if (FINGER_COLOR[fid]) base = lerpColor(FINGER_COLOR[fid], t.key, 0.35);
    const w = want.toLowerCase();
    const match = k === w || (w === "\n" && k === ";");
    if (match) return { bg: t.accent, highlight: true };
    return { bg: base, highlight: false };
  }

  function paintKeyboard() {
    const kb = document.getElementById("keyboard");
    if (!kb) return;
    const t = T();
    let want = "";
    if (typed < target.length) want = target[typed];
    kb.querySelectorAll(".kb-key").forEach((el) => {
      const k = el.dataset.key;
      const { bg, highlight } = keyColor(k, want, t);
      el.style.backgroundColor = bg;
      el.classList.toggle("highlight", highlight);
      el.style.color = highlight ? "#000" : "#111";
    });
  }

  function btn(text, onClick, opts = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn" + (opts.ghost ? " btn-ghost" : "") + (opts.block ? " btn-block" : "");
    b.textContent = text;
    const t = T();
    if (!opts.ghost) {
      b.style.backgroundColor = t.accent;
      b.style.color = t.btnText;
    } else {
      b.style.color = t.text;
    }
    b.disabled = Boolean(opts.disabled);
    b.addEventListener("click", () => {
      unlockAudio();
      onClick();
    });
    return b;
  }

  function panel() {
    const p = document.createElement("div");
    p.className = "panel";
    p.style.backgroundColor = T().panel;
    return p;
  }

  function lbl(text, size) {
    const el = document.createElement("p");
    el.textContent = text;
    if (size === "xl") el.className = "title-xl";
    else if (size === "lg") el.className = "title-lg";
    else if (size === "md") el.className = "title-md";
    else el.className = "muted";
    el.style.color = T().text;
    return el;
  }

  function avatarPreview() {
    const st = currentStudent();
    const wrap = document.createElement("div");
    wrap.className = "avatar-wrap";
    const shirt = String(st.shirt || "plain");
    const body = document.createElement("div");
    body.className = "avatar-body";
    body.style.backgroundColor =
      shirt === "mrj"
        ? "#4C51BF"
        : shirt === "star"
          ? "#DD6B20"
          : shirt === "stripe"
            ? "#3182CE"
            : "#718096";
    wrap.appendChild(body);
    const head = document.createElement("div");
    head.className = "avatar-head";
    wrap.appendChild(head);
    const hat = String(st.hat || "none");
    if (hat !== "none") {
      const h = document.createElement("div");
      h.className = "avatar-hat";
      h.style.backgroundColor =
        hat === "crown" ? "#D69E2E" : hat === "headband" ? "#E53E3E" : "#2B6CB0";
      wrap.appendChild(h);
    }
    const glasses = String(st.glasses || "none");
    if (glasses !== "none") {
      const g = document.createElement("div");
      g.className = "avatar-glasses";
      g.style.backgroundColor = glasses === "sun" ? "#1A202C" : "#4A5568";
      wrap.appendChild(g);
    }
    return wrap;
  }

  function avatarRow() {
    const st = currentStudent();
    const p = panel();
    p.className += " avatar-row";
    p.appendChild(avatarPreview());
    const v = document.createElement("div");
    v.className = "vstack";
    v.appendChild(
      lbl(
        `Hat: ${st.hat || "none"}   Shirt: ${st.shirt || "plain"}   Glasses: ${st.glasses || "none"}`
      )
    );
    v.appendChild(lbl("Pass a lesson (90% + teacher WPM) to earn points."));
    p.appendChild(v);
    return p;
  }

  function renderHub(root) {
    const v = document.createElement("div");
    v.className = "vstack";
    const top = document.createElement("div");
    top.className = "hstack spread";
    const st = currentStudent();
    const who = currentName();
    top.appendChild(
      lbl(
        who ? `Hi ${who}  •  ${st.points || 0} points` : `${st.points || 0} points`,
        "lg"
      )
    );
    v.appendChild(top);
    v.appendChild(avatarRow());
    const grid = document.createElement("div");
    grid.className = "hub-grid";
    const cards = [
      ["Lessons", "Beginner → basic, same key order as class typing.", () => {
        mode = Mode.LESSONS;
        render();
      }],
      ["Themes", "Four looks. Colors and sounds change.", null],
      ["Avatar shop", "Spend points from passed levels.", () => {
        mode = Mode.SHOP;
        render();
      }],
      ["Teacher", "Set WPM. Accuracy stays 90%.", () => {
        mode = Mode.SETTINGS;
        render();
      }],
    ];
    cards.forEach(([title, body, cb]) => {
      const p = panel();
      p.className += " hub-card";
      p.appendChild(lbl(title, "md"));
      p.appendChild(lbl(body));
      if (cb) p.appendChild(btn("Open", cb));
      else p.appendChild(lbl("Pick a theme below."));
      grid.appendChild(p);
    });
    v.appendChild(grid);
    v.appendChild(lbl("Games: later. Offline only."));
    const themes = document.createElement("div");
    themes.className = "hstack";
    Object.keys(THEMES).forEach((tid) => {
      const t = THEMES[tid];
      themes.appendChild(
        btn(t.label, () => setTheme(tid), { disabled: tid === themeId() })
      );
    });
    v.appendChild(themes);
    root.appendChild(v);
  }

  function renderLessons(root) {
    const v = document.createElement("div");
    v.className = "vstack";
    const top = document.createElement("div");
    top.className = "hstack";
    top.appendChild(btn("Back", () => {
      mode = Mode.HUB;
      render();
    }));
    top.appendChild(
      lbl(
        `Lessons  •  Need ${save.pass_accuracy}% and ${save.teacher_wpm} WPM`,
        "md"
      )
    );
    v.appendChild(top);
    const scroll = document.createElement("div");
    scroll.className = "lesson-scroll panel";
    scroll.style.backgroundColor = T().panel;
    const list = document.createElement("div");
    list.className = "vstack";
    let lastUnit = "";
    lessons().forEach((les, i) => {
      const unit = String(les.unit || "");
      if (unit !== lastUnit) {
        lastUnit = unit;
        const u = lbl(unit, "md");
        u.className += " unit-label";
        list.appendChild(u);
      }
      const unlocked = lessonUnlocked(i);
      const passed = isPassed(String(les.id || ""));
      let title = `${i}. ${les.title || ""}`;
      if (passed) title += "  ✓";
      list.appendChild(
        btn(title, () => {
          if (!lessonUnlocked(i)) return;
          startLesson(i);
        }, { block: true, disabled: !unlocked })
      );
    });
    scroll.appendChild(list);
    v.appendChild(scroll);
    root.appendChild(v);
  }

  function keyboardUi() {
    const p = panel();
    p.className += " keyboard-panel";
    const v = document.createElement("div");
    v.className = "vstack";
    v.appendChild(lbl("Hands: colored keys match fingers. Bumps on F and J."));
    const kb = document.createElement("div");
    kb.id = "keyboard";
    QWERTY.forEach((row) => {
      const h = document.createElement("div");
      h.className = "kb-row";
      row.forEach((k) => {
        const key = document.createElement("div");
        key.className = "kb-key" + (k === " " ? " space" : "");
        key.dataset.key = k;
        key.textContent = k === " " ? "SPACE" : k.toUpperCase();
        h.appendChild(key);
      });
      kb.appendChild(h);
    });
    v.appendChild(kb);
    p.appendChild(v);
    return p;
  }

  function renderPlay(root) {
    const L = lesson();
    const sc = screen();
    const v = document.createElement("div");
    v.className = "vstack";
    const top = document.createElement("div");
    top.className = "hstack spread";
    const left = document.createElement("div");
    left.className = "hstack";
    left.appendChild(
      btn("Quit lesson", () => {
        stopSpeech();
        clearTimed();
        mode = Mode.LESSONS;
        render();
      })
    );
    const screens = L.screens || [];
    left.appendChild(
      lbl(`${L.title || ""}  •  screen ${screenIdx + 1}/${screens.length}`, "md")
    );
    top.appendChild(left);
    if (String(sc.type || "") === "timed") {
      const tl = lbl(`Time ${Math.ceil(timedLeft)}`, "md");
      tl.id = "time-label";
      top.appendChild(tl);
    }
    v.appendChild(top);
    const p = panel();
    const inner = document.createElement("div");
    inner.className = "vstack";
    const typ = String(sc.type || "");
    if (typ === "teach" || mode === Mode.TEACH) {
      inner.appendChild(lbl(String(sc.title || ""), "lg"));
      inner.appendChild(lbl(String(sc.body || "")));
      inner.appendChild(
        btn("Continue", () => advanceOrFinish(true, 0, 100))
      );
    } else {
      const t = T();
      const prompt = document.createElement("div");
      prompt.id = "prompt-box";
      prompt.className = "prompt-box";
      prompt.innerHTML = promptHtml(t);
      inner.appendChild(prompt);
      const stats = document.createElement("p");
      stats.id = "stats-line";
      stats.className = "stats-line";
      stats.textContent = `Errors: ${errors}   Accuracy so far: ${snapped(acc(), 0.1)}%`;
      inner.appendChild(stats);
    }
    p.appendChild(inner);
    v.appendChild(p);
    if (mode === Mode.PLAY) v.appendChild(keyboardUi());
    root.appendChild(v);
    if (mode === Mode.PLAY) paintKeyboard();
  }

  function renderResult(root) {
    const box = document.createElement("div");
    box.className = "vstack center-card panel";
    box.style.backgroundColor = T().panel;
    if (lastPass) {
      box.appendChild(lbl("Passed!", "xl"));
      box.style.color = T().good;
      box.appendChild(
        lbl(`Accuracy ${snapped(lastAcc, 0.1)}%   WPM ${snapped(lastWpm, 0.1)}`)
      );
      if (currentName()) {
        box.appendChild(lbl("+50 points. Dress your avatar in the shop."));
      }
      speak("Passed. Great work.");
      box.appendChild(
        btn("Next lesson", () => {
          if (lessonIdx + 1 < lessons().length && lessonUnlocked(lessonIdx + 1)) {
            startLesson(lessonIdx + 1);
          } else {
            mode = Mode.LESSONS;
            render();
          }
        })
      );
    } else {
      box.appendChild(lbl("Try again", "xl"));
      box.style.color = T().bad;
      box.appendChild(lbl(failReason));
      box.appendChild(
        lbl(`Accuracy ${snapped(lastAcc, 0.1)}%   WPM ${snapped(lastWpm, 0.1)}`)
      );
      speak("Try again. " + failReason);
      box.appendChild(
        btn("Retry this screen", () => {
          bootScreen();
          render();
        })
      );
    }
    box.appendChild(
      btn("Lesson list", () => {
        mode = Mode.LESSONS;
        render();
      })
    );
    root.appendChild(box);
  }

  function buy(slot, id, cost) {
    const st = currentStudent();
    if (!st || !currentName()) return;
    const field = slot === "hats" ? "hat" : slot === "shirts" ? "shirt" : "glasses";
    if (String(st[field] || "") === id) return;
    if (cost > 0 && !spend(cost)) return;
    const st2 = currentStudent();
    st2[field] = id;
    save.students[currentName()] = st2;
    persist();
    render();
  }

  function renderShop(root) {
    const v = document.createElement("div");
    v.className = "vstack";
    const top = document.createElement("div");
    top.className = "hstack";
    top.appendChild(btn("Back", () => {
      mode = Mode.HUB;
      render();
    }));
    top.appendChild(
      lbl(`Shop  •  ${currentStudent().points || 0} points`, "lg")
    );
    v.appendChild(top);
    v.appendChild(avatarRow());
    ["hats", "shirts", "glasses"].forEach((slot) => {
      v.appendChild(lbl(slot.charAt(0).toUpperCase() + slot.slice(1), "md"));
      const row = document.createElement("div");
      row.className = "hstack shop-row";
      (shop[slot] || []).forEach((it) => {
        const id = String(it.id || "");
        const cost = Number(it.cost || 0);
        row.appendChild(
          btn(`${it.name || id} (${cost})`, () => buy(slot, id, cost))
        );
      });
      v.appendChild(row);
    });
    root.appendChild(v);
  }

  function renderSettings(root) {
    const v = document.createElement("div");
    v.className = "vstack";
    v.appendChild(btn("Back", () => {
      mode = Mode.HUB;
      render();
    }));
    v.appendChild(lbl("Teacher settings", "lg"));
    v.appendChild(lbl("Accuracy is locked at 90%. Below that is a fail."));
    v.appendChild(lbl(`WPM goal now: ${save.teacher_wpm}`, "md"));
    const row = document.createElement("div");
    row.className = "hstack";
    [5, 10, 15, 20, 25, 30].forEach((n) => {
      row.appendChild(
        btn(`${n} WPM`, () => {
          save.teacher_wpm = n;
          persist();
          render();
        })
      );
    });
    v.appendChild(row);
    const ttsRow = document.createElement("label");
    ttsRow.className = "check-row";
    const tts = document.createElement("input");
    tts.type = "checkbox";
    tts.checked = Boolean(save.tts);
    tts.addEventListener("change", () => {
      save.tts = tts.checked;
      persist();
    });
    ttsRow.appendChild(tts);
    ttsRow.appendChild(document.createTextNode("Read aloud (text to speech)"));
    v.appendChild(ttsRow);
    const sndRow = document.createElement("label");
    sndRow.className = "check-row";
    const snd = document.createElement("input");
    snd.type = "checkbox";
    snd.checked = Boolean(save.sounds);
    snd.addEventListener("change", () => {
      save.sounds = snd.checked;
      persist();
    });
    sndRow.appendChild(snd);
    sndRow.appendChild(document.createTextNode("Key sounds"));
    v.appendChild(sndRow);
    root.appendChild(v);
  }

  function render() {
    applyTheme();
    appEl.innerHTML = "";
    if (mode === Mode.WAIT) {
      const p = document.createElement("p");
      p.className = "loading";
      p.textContent = "Loading…";
      appEl.appendChild(p);
      return;
    }
    if (mode === Mode.HUB) renderHub(appEl);
    else if (mode === Mode.LESSONS) renderLessons(appEl);
    else if (mode === Mode.TEACH || mode === Mode.PLAY) renderPlay(appEl);
    else if (mode === Mode.RESULT) renderResult(appEl);
    else if (mode === Mode.SHOP) renderShop(appEl);
    else if (mode === Mode.SETTINGS) renderSettings(appEl);
  }

  window.addEventListener("keydown", onPlayKey);

  async function init() {
    save = defaultSave();
    if (typeof SYNC.createRemoteSaveScheduler === "function") {
      remoteSave = SYNC.createRemoteSaveScheduler(authApi, function () {
        return JSON.stringify(save);
      });
    }
    window.addEventListener("pagehide", function () {
      if (remoteSave && typeof remoteSave.flush === "function") {
        remoteSave.flush();
      }
    });
    try {
      const [cRes, sRes] = await Promise.all([
        fetch("data/curriculum.json"),
        fetch("data/shop.json"),
      ]);
      curriculum = await cRes.json();
      shop = await sRes.json();
    } catch (err) {
      appEl.innerHTML = `<p class="loading">Could not load data. Open from GitHub Pages or a local server.<br>${escapeHtml(
        String(err)
      )}</p>`;
      return;
    }
    dataReady = true;
    if (authReady) enterAfterAuth();
  }

  function enterAfterAuth() {
    if (!authReady || !dataReady) return;
    if (studentId) ensureStudent(studentId);
    else {
      save.current = "";
      persistLocal();
    }
    mode = Mode.HUB;
    render();
  }

  function onAuthReady(event) {
    const detail = event && event.detail ? event.detail : {};
    studentId = detail.id == null ? "" : String(detail.id).trim();
    studentKey = studentId ? storageKeyForStudent(studentId) : "";
    if (remoteSave) remoteSave.setPackLoadOk(false);
    loadSaveFromKey(studentKey);
    if (studentKey && curriculum.default_wpm) {
      try {
        if (!localStorage.getItem(studentKey)) {
          save.teacher_wpm = Number(curriculum.default_wpm) || 10;
          persistLocal();
        }
      } catch (_) {
        /* ignore */
      }
    }
    authReady = true;
    syncPackFromServer().finally(function () {
      enterAfterAuth();
    });
  }

  window.addEventListener("mrj-auth-ready", onAuthReady);

  window.MRJ_TYPING_KIDS_BUILD = BUILD;

  init();
})();
