"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const TEST_STUDENT = "zz_test_mrjmetrics";

async function main() {
  const fetchBodies = [];

  const window = {
    MRJ_AUTH: {
      student() {
        return TEST_STUDENT;
      },
    },
    fetch(url, opts) {
      fetchBodies.push(JSON.parse(opts.body));
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve({ status: "mock" });
        },
      });
    },
    localStorage: {
      _data: {},
      getItem(k) {
        return this._data[k] || null;
      },
      setItem(k, v) {
        this._data[k] = v;
      },
    },
    addEventListener() {},
  };
  window.window = window;

  const scoresSrc = fs.readFileSync(
    path.join(__dirname, "..", "mrj-scores.js"),
    "utf8"
  );
  vm.runInNewContext(scoresSrc, window, { filename: "mrj-scores.js" });

  window.MRJ_AUTH.student = function () {
    return "";
  };
  const skipped = await window.MRJ_SCORES.post({
    program: "typing-kids",
    itemId: "L1:s1",
    scoreValue: 1,
    scoreMax: 1,
  });
  assert.strictEqual(skipped.status, "skipped");
  assert.strictEqual(fetchBodies.length, 0);

  window.MRJ_AUTH.student = function () {
    return TEST_STUDENT;
  };
  await window.MRJ_SCORES.post({
    program: "typing-kids",
    itemId: "L1:s1",
    scoreValue: 10,
    scoreMax: 10,
  });
  assert.strictEqual(fetchBodies.length, 1);
  const body = fetchBodies[0];
  assert.strictEqual(body.student_email, TEST_STUDENT);
  assert.notStrictEqual(body.student_email, "unknown");
  assert.ok(body.session_id.includes("typing-kids"));
  assert.ok(body.session_id.includes("zz_test_mrjmetrics"));
  const ev = body.events[0];
  assert.strictEqual(ev.identity_method, "mrj_signin");
  assert.strictEqual(ev.identity_confidence, "high");
  assert.strictEqual(ev.local_date, window.MRJ_SCORES.localDate());

  console.log("mrj_scores_post.test.js: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
