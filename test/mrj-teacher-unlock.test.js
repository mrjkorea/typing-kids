"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("teacher unlock reads MRJSignin isTeacher", () => {
  const src = fs.readFileSync(path.join(__dirname, "../mrj-teacher-unlock.js"), "utf8");
  assert.match(src, /isTeacher\(\)/);
});
