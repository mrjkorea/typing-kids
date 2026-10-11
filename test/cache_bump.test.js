"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const BUILD = "20261011-savefix";
const root = path.join(__dirname, "..");

const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const buildMatch = appJs.match(/const BUILD = "([^"]+)"/);
assert.ok(buildMatch, "BUILD constant in app.js");
assert.strictEqual(buildMatch[1], BUILD);

const stamp = fs
  .readFileSync(path.join(root, "BUILD_STAMP.txt"), "utf8")
  .trim();
assert.strictEqual(stamp, BUILD);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const versionParams = [...html.matchAll(/\?v=([^"']+)/g)].map((m) => m[1]);
assert.ok(versionParams.length >= 3, "index.html should version local scripts");
for (const v of versionParams) {
  assert.strictEqual(v, BUILD, `index.html ?v= must match BUILD (${v})`);
}

console.log("cache_bump.test.js: ok");
