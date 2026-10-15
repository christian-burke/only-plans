"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { ID, copyFixture, run } = require("./helpers");

const BIN = path.join(__dirname, "..", "bin", "onlyplans.js");
const CHANGE_PATH = `docs/changes/${ID}`;

/** A PATH whose first entry holds an `onlyplans` command that runs this checkout. */
function pathWithBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onlyplans-bin-"));
  fs.symlinkSync(BIN, path.join(dir, "onlyplans"));
  return `${dir}${path.delimiter}${process.env.PATH}`;
}

/** Runs a script in the named shell with `onlyplans` on the PATH; returns stdout lines. */
function shellLines(shell, cwd, script) {
  const env = { ...process.env, PATH: pathWithBin() };
  const result = spawnSync(shell, ["-c", script], { cwd, encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\n").filter(Boolean);
}

function completeLines(cwd, ...words) {
  const result = run(cwd, "__complete", ...words);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\n").filter(Boolean);
}

test("commands accept a path to the change folder in place of the id", () => {
  const cwd = copyFixture("pass");
  assert.equal(run(cwd, "validate", `${CHANGE_PATH}/`).stdout, "PASS\n");
  assert.equal(run(cwd, "validate", path.join(cwd, CHANGE_PATH)).stdout, "PASS\n");
  assert.equal(run(path.join(cwd, "test"), "validate", `../${CHANGE_PATH}`).stdout, "PASS\n");
  assert.match(run(cwd, "criteria", CHANGE_PATH, "2.2").stdout, /^test\/login\.test\.js/);
  assert.equal(run(cwd, "tasks", CHANGE_PATH, "--json").status, 0);
});

test("a path that is not a change folder is a usage error", () => {
  const cwd = copyFixture("pass");
  for (const arg of ["docs/changes/", "./docs", `${CHANGE_PATH}/spec.md`, "../elsewhere"]) {
    const result = run(cwd, "validate", arg);
    assert.equal(result.status, 2, arg);
    assert.match(result.stderr, /not a change id or a path under docs\/changes/);
  }
});

const CANDIDATES = [
  [[], ["init", "new", "list", "tasks", "criteria", "validate", "archive", "completion"]],
  [["ta"], ["tasks"]],
  [["tasks", ""], [ID]],
  [["tasks", "add"], [ID]],
  [["tasks", "docs/"], []],
  [["validate", ""], [ID]],
  [["archive", ""], [ID]],
  [["criteria", ID, ""], ["1.1", "1.2", "2.1", "2.2"]],
  [["criteria", `${CHANGE_PATH}/`, "2"], ["2.1", "2.2"]],
  [["criteria", "nope", ""], []],
  [["tasks", ID, "--"], ["--json"]],
  [["archive", ID, "--f"], ["--force"]],
  [["completion", ""], ["zsh", "bash", "powershell"]],
  [["completion", "p"], ["powershell"]],
  [["new", ""], []],
  [["bogus", ""], []],
  [["tasks", ID, "extra"], []],
];

for (const [words, expected] of CANDIDATES) {
  test(`__complete [${words.join(" ")}] offers [${expected.join(" ")}]`, () => {
    assert.deepEqual(completeLines(copyFixture("pass"), ...words), expected);
  });
}

test("__complete outside a root prints nothing and exits 0", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "onlyplans-noroot-"));
  assert.deepEqual(completeLines(cwd, "tasks", ""), []);
});

test("completion prints a script per shell and rejects others", () => {
  const cwd = copyFixture("pass");
  for (const [shell, marker] of [
    ["zsh", /^compdef _onlyplans onlyplans$/m],
    ["bash", /^complete -F _onlyplans onlyplans$/m],
    ["powershell", /^Register-ArgumentCompleter -Native -CommandName onlyplans/m],
  ]) {
    const result = run(cwd, "completion", shell);
    assert.equal(result.status, 0, shell);
    assert.match(result.stdout, marker);
    assert.match(result.stdout, /__complete/);
  }
  assert.equal(run(cwd, "completion", "fish").status, 2);
});

test("the bash script fills COMPREPLY from the tool", () => {
  const cwd = copyFixture("pass");
  const script = (words) =>
    'eval "$(onlyplans completion bash)";' +
    ` COMP_WORDS=(${words}); COMP_CWORD=$((${"${#COMP_WORDS[@]}"} - 1));` +
    ' _onlyplans; printf "%s\\n" "${COMPREPLY[@]}"';
  assert.deepEqual(shellLines("bash", cwd, script('onlyplans tasks ""')), [ID]);
  const forTask = script(`onlyplans criteria ${ID} "2"`);
  assert.deepEqual(shellLines("bash", cwd, forTask), ["2.1", "2.2"]);
});

test("the zsh script hands candidates to compadd", () => {
  const cwd = copyFixture("pass");
  const script = (words) =>
    'compdef() { :; }; compadd() { shift; printf "%s\\n" "$@"; };' +
    ` eval "$(onlyplans completion zsh)"; words=(${words}); _onlyplans`;
  assert.deepEqual(shellLines("zsh", cwd, script('onlyplans tasks ""')), [ID]);
  const forTask = script(`onlyplans criteria ${ID} "2"`);
  assert.deepEqual(shellLines("zsh", cwd, forTask), ["2.1", "2.2"]);
});
