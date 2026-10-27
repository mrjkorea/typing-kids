"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("teacher unlock reads MRJSignin isTeacher", () => {
  const src = fs.readFileSync(path.join(__dirname, "../mrj-teacher-unlock.js"), "utf8");
  assert.match(src, /isTeacher\(\)/);
});

test("app lesson gates honor teacher mode", () => {
  const src = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  assert.match(src, /function lessonUnlocked\(idx\)/);
  assert.match(src, /if \(mrjTeacher\(\)\) return true;/);
  assert.match(src, /mrj-teacher/);
});
