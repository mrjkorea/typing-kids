"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const TEST_STUDENT = "zz_test_mrjmetrics";
const BUILD = "20261011-savefix";

const posts = [];
const noteScores = [];

function createDom() {
  const app = { innerHTML: "", appendChild() {}, style: {} };
  return {
    getElementById(id) {
      if (id === "app") return app;
      return null;
    },
    body: { style: {} },
    createElement() {
      return {
        style: {},
        className: "",
        textContent: "",
        addEventListener() {},
        appendChild() {},
        setAttribute() {},
      };
    },
    addEventListener() {},
  };
}

function loadAppInVm() {
  posts.length = 0;
  noteScores.length = 0;

  const window = {
    TYPING_KIDS_SYNC: {},
    MRJ_AUTH: {
      student() {
        return TEST_STUDENT;
      },
      noteScore(payload) {
        noteScores.push(payload);
      },
    },
    fetch() {
      return Promise.reject(new Error("fetch disabled in score_log tests"));
    },
    addEventListener() {},
    speechSynthesis: null,
    localStorage: {
      _data: {},
      getItem(k) {
        return this._data[k] || null;
      },
      setItem(k, v) {
        this._data[k] = v;
      },
    },
    Audio: function () {
      return { play() {}, catch() {} };
    },
    Date,
    Math,
    JSON,
    Promise,
    setInterval() {
      return 0;
    },
    clearInterval() {},
  };
  window.document = createDom();
  window.window = window;

  const scoresSrc = fs.readFileSync(
    path.join(__dirname, "..", "mrj-scores.js"),
    "utf8"
  );
  vm.runInNewContext(scoresSrc, window, { filename: "mrj-scores.js" });
  window.MRJ_SCORES.localDate = function () {
    return "2026-10-11";
  };
  window.MRJ_SCORES.post = function (opts) {
    posts.push(opts);
    return Promise.resolve({ status: "mock" });
  };

  let appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.ok(
    appSrc.includes(`const BUILD = "${BUILD}"`),
    "app.js BUILD must match savefix stamp"
  );
  appSrc = appSrc.replace(/\n  init\(\);\n\}\)\(\);$/, "\n})();");

  vm.runInNewContext(appSrc, window, { filename: "app.js" });

  const api = window.__MRJ_TYPING_KIDS_TEST__;
  assert.ok(api && typeof api.logTyping === "function", "test API missing");
  return { api, window };
}

const { api } = loadAppInVm();

api.setPlayMetrics(45, 5, Date.now() - 60000);
api.logTyping({
  lessonId: "L1",
  lessonTitle: "Lesson One Title",
  screenIdx: 0,
  screenType: "words",
  passed: true,
});

assert.strictEqual(posts.length, 1);
const row = posts[0];
assert.strictEqual(row.itemId, "L1:s1");
assert.strictEqual(row.scoreValue, 45);
assert.strictEqual(row.scoreMax, 50);
assert.strictEqual(row.scorePct, 90);
assert.strictEqual(row.itemType, "typing_screen");
assert.strictEqual(row.correctness, "correct");
assert.ok(row.metadata && typeof row.metadata.wpm === "number");

assert.strictEqual(noteScores.length, 1);
assert.strictEqual(noteScores[0].itemId, "L1:s1");
assert.strictEqual(noteScores[0].scoreValue, 45);
assert.strictEqual(noteScores[0].scoreMax, 50);
assert.strictEqual(noteScores[0].scorePct, 90);
assert.strictEqual(noteScores[0].localDate, "2026-10-11");
assert.strictEqual(noteScores[0].program, "typing-kids");

posts.length = 0;
noteScores.length = 0;
api.setPlayMetrics(40, 10, Date.now() - 60000);
api.logTyping({
  lessonId: "L1",
  lessonTitle: "Lesson One Title",
  screenIdx: 0,
  screenType: "words",
  passed: false,
  reason: "Accuracy was 80%. Need 90%.",
});
assert.strictEqual(posts[0].correctness, "incorrect");

posts.length = 0;
noteScores.length = 0;
api.setPlayMetrics(45, 5, Date.now() - 60000);
api.logTyping({
  lessonId: "L1",
  lessonTitle: "Lesson One Title",
  screenIdx: 0,
  screenType: "words",
  passed: true,
  isLesson: true,
});
assert.strictEqual(posts[0].itemId, "L1:lesson");
assert.strictEqual(posts[0].itemType, "typing_lesson");

const allIds = [...posts, ...noteScores].map((r) => r.itemId);
const dateRe = /\d{4}-\d{2}-\d{2}/;
for (const id of allIds) {
  assert.ok(!dateRe.test(id), "itemId must not contain a date: " + id);
  assert.ok(
    !String(id).toLowerCase().includes("lesson one"),
    "itemId must not contain lesson title"
  );
}

console.log("score_log.test.js: ok");
