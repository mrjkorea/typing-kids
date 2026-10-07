"use strict";

const assert = require("assert");
const sync = require("../lib/typing-kids-sync.js");

function student(id, extra) {
  return {
    theme: "sky",
    points: 0,
    hat: "none",
    shirt: "plain",
    glasses: "none",
    passed: {},
    best: {},
    ...extra,
  };
}

assert.strictEqual(
  sync.studentStorageKey("Jay"),
  "mrj_typing_kids:jay"
);
assert.strictEqual(
  sync.studentStorageKey("  BOB  "),
  "mrj_typing_kids:bob"
);

const merged = sync.mergeSave(
  {
    students: {
      jay: student("jay", {
        points: 100,
        passed: { L1: true },
        best: { L1: { wpm: 12, acc: 95 } },
      }),
    },
    teacher_wpm: 15,
  },
  {
    students: {
      jay: student("jay", {
        points: 50,
        passed: { L2: true },
        best: { L1: { wpm: 20, acc: 90 }, L2: { wpm: 8, acc: 92 } },
      }),
    },
    teacher_wpm: 10,
  }
);
assert.strictEqual(merged.students.jay.points, 100);
assert.strictEqual(merged.students.jay.passed.L1, true);
assert.strictEqual(merged.students.jay.passed.L2, true);
assert.strictEqual(merged.students.jay.best.L1.wpm, 20);
assert.strictEqual(merged.students.jay.best.L1.acc, 95);
assert.strictEqual(merged.teacher_wpm, 15);

const bad = sync.parsePackJson("{not json");
assert.deepStrictEqual(bad.students, {});

assert.strictEqual(
  sync.isRicherThan(
    { students: { a: student("a", { passed: { x: true } }) } },
    { students: {} }
  ),
  true
);

let packLoaded = false;
let saveCount = 0;
const auth = {
  savePack(program, json) {
    saveCount += 1;
    assert.strictEqual(program, "typing-kids");
    assert.ok(json.length > 2);
    return Promise.resolve({ ok: true });
  },
  packReady() {
    return packLoaded;
  },
};

const scheduler = sync.createRemoteSaveScheduler(auth, () => '{"ok":true}');
scheduler.setPackLoadOk(false);
scheduler.queue();
assert.strictEqual(saveCount, 0);
packLoaded = true;
scheduler.setPackLoadOk(true);
scheduler.queue();
scheduler.flush();
assert.strictEqual(saveCount, 1);

const legacyKey = sync.LEGACY_SAVE_KEY;
const store = {};
store[legacyKey] = JSON.stringify({
  students: { ghost: student("ghost", { points: 9999 }) },
});
const keyed = sync.studentStorageKey("real");
store[keyed] = JSON.stringify({
  students: { real: student("real", { points: 10 }) },
});
assert.ok(store[legacyKey]);
assert.ok(store[keyed]);
assert.notStrictEqual(store[legacyKey], store[keyed]);

console.log("typing-kids-sync.test.js: ok");
