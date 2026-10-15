'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'onlyplans.js');
const FIXTURES = path.join(__dirname, 'fixtures');
const ID = 'add-login';

/** Copies a fixture into a fresh temp directory and returns its path. */
function copyFixture(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onlyplans-'));
  fs.cpSync(path.join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

/** Runs the bin in `cwd` and returns { status, stdout, stderr }. */
function run(cwd, ...args) {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function fixtureFile(name, file) {
  return fs.readFileSync(path.join(FIXTURES, name, 'docs', 'changes', ID, file), 'utf8');
}

module.exports = { ID, copyFixture, run, fixtureFile };
