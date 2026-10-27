"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const BUILD = "20261027-teacher-chip";
const MRJ_SIGNIN_AUTH = "20261022-block-id-1.6.0";
const MRJ_SIGNIN_BOOT = "20261007-progress-1.4.2";
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
const localVersionParams = [
  ...html.matchAll(/(?:src|href)="(?!https?:\/\/)[^"]*\?v=([^"']+)"/g),
].map((m) => m[1]);
assert.ok(localVersionParams.length >= 4, "index.html should version local scripts");
for (const v of localVersionParams) {
  assert.strictEqual(v, BUILD, `local index.html ?v= must match BUILD (${v})`);
}

assert.match(
  html,
  new RegExp(`mrj-auth\\.js\\?v=${MRJ_SIGNIN_AUTH}`),
  "index.html should pin mrj-signin auth script cache"
);
assert.match(
  html,
  new RegExp(`mrj-auth-boot\\.js\\?v=${MRJ_SIGNIN_BOOT}`),
  "index.html should pin mrj-signin boot script cache"
);

console.log("cache_bump.test.js: ok");
