/**
 * Per-student localStorage + server pack merge for MRJ Typing Kids.
 * Safe in browser and Node (for unit tests).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TYPING_KIDS_SYNC = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SAVE_KEY_BASE = "mrj_typing_kids";
  const PROGRAM = "typing-kids";
  const PASS_ACCURACY = 90;
  const REMOTE_SAVE_MS = 17000;

  function idKey(id) {
    return String(id == null ? "" : id)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function studentStorageKey(studentId) {
    const k = idKey(studentId);
    return k ? `${SAVE_KEY_BASE}:${k}` : SAVE_KEY_BASE;
  }

  function defaultSave() {
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
    const out = defaultSave();
    if (!raw || typeof raw !== "object") return out;
    if (raw.students && typeof raw.students === "object") {
      out.students = { ...raw.students };
    }
    if (raw.current != null) out.current = String(raw.current);
    if (raw.teacher_wpm != null) out.teacher_wpm = Number(raw.teacher_wpm) || 10;
    out.pass_accuracy = PASS_ACCURACY;
    if (raw.tts != null) out.tts = Boolean(raw.tts);
    if (raw.sounds != null) out.sounds = Boolean(raw.sounds);
    if (!out.teacher_wpm || out.teacher_wpm < 1) out.teacher_wpm = 10;
    return out;
  }

  function mergePassed(a, b) {
    const out = {};
    const keys = new Set([
      ...Object.keys(a || {}),
      ...Object.keys(b || {}),
    ]);
    keys.forEach((k) => {
      out[k] = Boolean((a && a[k]) || (b && b[k]));
    });
    return out;
  }

  function mergeBest(a, b) {
    const out = {};
    const keys = new Set([
      ...Object.keys(a || {}),
      ...Object.keys(b || {}),
    ]);
    keys.forEach((lid) => {
      const pa = (a && a[lid]) || {};
      const pb = (b && b[lid]) || {};
      out[lid] = {
        wpm: Math.max(Number(pa.wpm || 0), Number(pb.wpm || 0)),
        acc: Math.max(Number(pa.acc || 0), Number(pb.acc || 0)),
      };
    });
    return out;
  }

  function pickCosmetic(localVal, remoteVal) {
    const l = String(localVal || "none");
    const r = String(remoteVal || "none");
    if (l !== "none") return l;
    if (r !== "none") return r;
    return "none";
  }

  function mergeStudentRecord(localRec, remoteRec) {
    const a = localRec || {};
    const b = remoteRec || {};
    return {
      theme: String(a.theme || b.theme || "sky"),
      points: Math.max(Number(a.points || 0), Number(b.points || 0)),
      hat: pickCosmetic(a.hat, b.hat),
      shirt: pickCosmetic(a.shirt, b.shirt),
      glasses: pickCosmetic(a.glasses, b.glasses),
      passed: mergePassed(a.passed, b.passed),
      best: mergeBest(a.best, b.best),
    };
  }

  /**
   * Merge server pack into local save (union / max). Local is the left operand.
   */
  function mergeSave(local, remote) {
    const loc = normalizeSave(local);
    const rem = normalizeSave(remote);
    const out = defaultSave();
    out.teacher_wpm = Math.max(loc.teacher_wpm, rem.teacher_wpm);
    out.tts = loc.tts;
    out.sounds = loc.sounds;
    out.current = loc.current || rem.current || "";
    const ids = new Set([
      ...Object.keys(loc.students),
      ...Object.keys(rem.students),
    ]);
    ids.forEach((sid) => {
      out.students[sid] = mergeStudentRecord(
        loc.students[sid],
        rem.students[sid]
      );
    });
    return out;
  }

  function parsePackJson(text) {
    if (text == null || String(text).trim() === "") {
      return defaultSave();
    }
    try {
      const parsed = JSON.parse(String(text));
      return normalizeSave(parsed);
    } catch (_) {
      return defaultSave();
    }
  }

  function countPassed(save) {
    let n = 0;
    const st = (save && save.students) || {};
    Object.keys(st).forEach((sid) => {
      const p = st[sid].passed || {};
      Object.keys(p).forEach((k) => {
        if (p[k]) n += 1;
      });
    });
    return n;
  }

  function totalPoints(save) {
    let n = 0;
    const st = (save && save.students) || {};
    Object.keys(st).forEach((sid) => {
      n += Number(st[sid].points || 0);
    });
    return n;
  }

  function bestScoreSum(save) {
    let sum = 0;
    const st = (save && save.students) || {};
    Object.keys(st).forEach((sid) => {
      const best = st[sid].best || {};
      Object.keys(best).forEach((lid) => {
        sum += Number(best[lid].wpm || 0) + Number(best[lid].acc || 0);
      });
    });
    return sum;
  }

  /** True if `candidate` has strictly more progress than `baseline`. */
  function isRicherThan(candidate, baseline) {
    const c = normalizeSave(candidate);
    const b = normalizeSave(baseline);
    const cp = countPassed(c);
    const bp = countPassed(b);
    if (cp > bp) return true;
    if (cp < bp) return false;
    const cpts = totalPoints(c);
    const bpts = totalPoints(b);
    if (cpts > bpts) return true;
    if (cpts < bpts) return false;
    return bestScoreSum(c) > bestScoreSum(b);
  }

  function createRemoteSaveScheduler(authRef, getSaveJson) {
    let packLoadOk = false;
    let lastSaveAt = 0;
    let pending = false;
    let timer = null;
    let retryTimer = null;

    function auth() {
      return typeof authRef === "function" ? authRef() : authRef;
    }

    function canSave() {
      if (!packLoadOk) return false;
      const a = auth();
      if (!a || typeof a.savePack !== "function") return false;
      if (typeof a.packReady === "function" && !a.packReady(PROGRAM)) {
        return false;
      }
      return true;
    }

    function setPackLoadOk(ok) {
      packLoadOk = !!ok;
    }

    function flush() {
      if (!pending || !canSave()) return Promise.resolve();
      pending = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastSaveAt = Date.now();
      const json =
        typeof getSaveJson === "function" ? getSaveJson() : "{}";
      const a = auth();
      return Promise.resolve(a.savePack(PROGRAM, json));
    }

    function queue() {
      if (!canSave()) return;
      pending = true;
      const now = Date.now();
      const wait = Math.max(0, REMOTE_SAVE_MS - (now - lastSaveAt));
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        flush();
      }, wait);
    }

    function scheduleRetry(fn, delayMs) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(fn, delayMs == null ? 30000 : delayMs);
    }

    function clearRetry() {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    return {
      PROGRAM,
      REMOTE_SAVE_MS,
      setPackLoadOk,
      canSave,
      queue,
      flush,
      scheduleRetry,
      clearRetry,
    };
  }

  return {
    SAVE_KEY_BASE,
    LEGACY_SAVE_KEY: SAVE_KEY_BASE,
    PROGRAM,
    PASS_ACCURACY,
    REMOTE_SAVE_MS,
    idKey,
    studentStorageKey,
    defaultSave,
    normalizeSave,
    mergeSave,
    mergeStudentRecord,
    parsePackJson,
    isRicherThan,
    countPassed,
    createRemoteSaveScheduler,
  };
});
