"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { ID, copyFixture, run } = require("./helpers");

const CHANGE = `docs/changes/${ID}`;

test("the passing fixture validates, also under --strict", () => {
  const cwd = copyFixture("pass");
  for (const args of [
    ["validate", ID],
    ["validate", ID, "--strict"],
  ]) {
    const result = run(cwd, ...args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, "PASS\n");
  }
});

const FAILURES = [
  ["missing-spec", "spec.md:1: file is missing"],
  ["missing-plan", "plan.md:1: file is missing"],
  ["spec-title-id", 'spec.md:1: title id "other" does not match folder'],
  ["plan-title-id", 'plan.md:1: title id "other" does not match folder'],
  ["plan-title-word", 'plan.md:1: title is "Roadmap"'],
  ["spec-missing-section", 'spec.md:1: missing section "## Why"'],
  ["plan-missing-section", 'plan.md:1: missing section "## Tasks"'],
  ["requirement-no-scenario", 'spec.md:25: requirement "Session" has no scenario'],
  ["requirement-no-shall", 'spec.md:9: requirement "Login form" does not say SHALL'],
  ["scenario-step-order", 'spec.md:13: scenario "Form renders" lacks GIVEN, WHEN, THEN'],
  ["duplicate-scenario", 'spec.md:29: duplicate scenario name "Form renders"'],
  ["stray-content", 'spec.md:9: content after "## Requirements" is not a requirement block'],
  ["task-grammar", "plan.md:6: task line does not match the grammar"],
  ["task-no-proof", "plan.md:6: task 1.2 has no proof"],
  ["proof-scenario-missing", 'plan.md:6: no scenario named "Wrong password"'],
  ["proof-root-file", 'plan.md:6: no scenario named "Makefile"; for a root file write ./Makefile'],
  ["proof-path-missing", 'plan.md:8: path "test/missing.test.js" does not exist'],
  ["duplicate-task-id", "plan.md:7: duplicate task id 1.2"],
  ["task-order", "plan.md:7: task id 1.0 does not ascend from 1.2"],
];

for (const [fixture, expected] of FAILURES) {
  test(`validate fails on ${fixture} at the right line`, () => {
    const result = run(copyFixture(fixture), "validate", ID);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`^${escape(`${CHANGE}/${expected}`)}`, "m"));
    assert.doesNotMatch(result.stdout, /^PASS$/m);
  });
}

test("a change saved with CRLF line endings parses like one saved with LF", () => {
  const cwd = copyFixture("pass");
  const dir = path.join(cwd, CHANGE);
  for (const file of ["spec.md", "plan.md"]) {
    const full = path.join(dir, file);
    fs.writeFileSync(full, fs.readFileSync(full, "utf8").replace(/\n/g, "\r\n"));
  }
  assert.equal(run(cwd, "validate", ID, "--strict").stdout, "PASS\n");
  assert.equal(JSON.parse(run(cwd, "tasks", ID, "--json").stdout).length, 4);
  assert.match(run(cwd, "criteria", ID, "1.1").stdout, /^#### Scenario: Form renders\n\n- GIVEN/);
});

const STRICT_FAILURES = [
  [
    "strict-unproven-requirement",
    'spec.md:25: requirement "Session" is not the proof of any task',
  ],
  ["strict-wide-line", "spec.md:23: line is 105 characters"],
  ["strict-placeholder", "spec.md:5: unresolved placeholder"],
  ["strict-orphan-scenario", 'spec.md:19: scenario "Bad password" is not the proof of any task'],
];

for (const [fixture, expected] of STRICT_FAILURES) {
  test(`${fixture} passes plain validate and fails --strict`, () => {
    const cwd = copyFixture(fixture);
    assert.equal(run(cwd, "validate", ID).stdout, "PASS\n");
    const result = run(cwd, "validate", ID, "--strict");
    assert.equal(result.status, 1);
    assert.match(result.stdout, new RegExp(`^${escape(`${CHANGE}/${expected}`)}`, "m"));
  });
}

test("every finding is one line in file:line: what — fix form", () => {
  const result = run(copyFixture("requirement-no-scenario"), "validate", ID, "--strict");
  for (const line of result.stdout.trimEnd().split("\n")) {
    assert.match(line, /^docs\/changes\/add-login\/(spec|plan)\.md:\d+: .+ — .+$/);
  }
});

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("an orphaned scenario is one finding, not also a requirement finding", () => {
  const result = run(copyFixture("strict-orphan-scenario"), "validate", ID, "--strict");
  assert.equal(result.stdout.trimEnd().split("\n").length, 1);
});

test("ids inserted as 1.2.1 and 1.7 validate and keep their order", () => {
  const cwd = copyFixture("task-inserted-ids");
  assert.equal(run(cwd, "validate", ID, "--strict").stdout, "PASS\n");
  const ids = JSON.parse(run(cwd, "tasks", ID, "--json").stdout).map((t) => t.id);
  assert.deepEqual(ids, ["1.1", "1.2", "1.2.1", "1.7", "2.1", "2.2"]);
});
