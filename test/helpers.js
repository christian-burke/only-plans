"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BIN = path.join(__dirname, "..", "bin", "onlyplans.js");
const FIXTURES = path.join(__dirname, "fixtures");
const ID = "add-login";

/** Copies a fixture into a fresh temp directory and returns its path. */
function copyFixture(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onlyplans-"));
  fs.cpSync(path.join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

/** Runs the bin with the given cwd and env overrides; returns { status, stdout, stderr }. */
function runIn({ cwd, env = {} }, ...args) {
  const options = { cwd, encoding: "utf8", env: { ...process.env, ...env } };
  const result = spawnSync(process.execPath, [BIN, ...args], options);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Runs the bin in `cwd` with the inherited environment. */
function run(cwd, ...args) {
  return runIn({ cwd }, ...args);
}

function fixtureFile(name, file) {
  return fs.readFileSync(path.join(FIXTURES, name, "docs", "changes", ID, file), "utf8");
}

module.exports = { ID, copyFixture, run, runIn, fixtureFile };
