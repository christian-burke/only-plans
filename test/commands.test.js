"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { ID, copyFixture, run, fixtureFile } = require("./helpers");

test("init creates both folders with .gitkeep and is idempotent", () => {
  const cwd = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "onlyplans-init-"));
  for (let i = 0; i < 2; i++) {
    assert.equal(run(cwd, "init").status, 0);
    assert.ok(fs.existsSync(path.join(cwd, "docs", "changes", ".gitkeep")));
    assert.ok(fs.existsSync(path.join(cwd, "docs", "changes", "archive", ".gitkeep")));
  }
});

test("init refuses when a root exists above", () => {
  const sub = path.join(copyFixture("pass"), "packages", "app");
  fs.mkdirSync(sub, { recursive: true });
  const result = run(sub, "init");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a root already exists above/);
  assert.ok(!fs.existsSync(path.join(sub, "docs")));
});

test("new creates a change that validates, and twice fails", () => {
  const cwd = copyFixture("pass");
  assert.equal(run(cwd, "new", "fix-logout").status, 0);
  const spec = fs.readFileSync(path.join(cwd, "docs/changes/fix-logout/spec.md"), "utf8");
  assert.match(spec, /^# fix-logout — fix logout$/m);
  assert.equal(run(cwd, "validate", "fix-logout").stdout, "PASS\n");
  const again = run(cwd, "new", "fix-logout");
  assert.equal(again.status, 1);
  assert.match(again.stderr, /^docs\/changes\/fix-logout: already exists/);
});

test("new refuses an id that is archived", () => {
  const cwd = copyFixture("archived");
  fs.rmSync(path.join(cwd, "docs/changes", ID), { recursive: true });
  const result = run(cwd, "new", ID);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /2026-01-02-add-login: id already archived/);
});

test("new refuses an id that is not kebab-case", () => {
  const result = run(copyFixture("pass"), "new", "Not_Kebab");
  assert.equal(result.status, 2);
});

test("list reports task counts as text and JSON", () => {
  const cwd = copyFixture("pass");
  assert.equal(run(cwd, "list").stdout, `${ID} 1/4\n`);
  assert.deepEqual(JSON.parse(run(cwd, "list", "--json").stdout), [{ id: ID, total: 4, done: 1 }]);
});

test("tasks --json preserves unknown fields", () => {
  const rows = JSON.parse(run(copyFixture("pass"), "tasks", ID, "--json").stdout);
  assert.deepEqual(rows[0], {
    id: "1.1",
    text: "Build the form",
    done: true,
    fields: { proof: "Form renders", kind: "ui" },
  });
  assert.deepEqual(rows[3].fields, { proof: "test/login.test.js::rejects" });
});

test("tasks prints the raw task lines as text", () => {
  const out = run(copyFixture("pass"), "tasks", ID).stdout;
  assert.equal(out.split("\n").filter(Boolean).length, 4);
  assert.match(out, /^- \[x\] 1\.1 Build the form — proof: Form renders — kind: ui$/m);
});

test("criteria returns the scenario block byte for byte", () => {
  const spec = fixtureFile("pass", "spec.md");
  const start = spec.indexOf("#### Scenario: Bad password");
  const end = spec.indexOf("\n\n### Requirement: Session");
  const expected = `${spec.slice(start, end)}\n`;
  assert.equal(run(copyFixture("pass"), "criteria", ID, "1.2").stdout, expected);
});

test("criteria prints a path proof as written", () => {
  assert.equal(
    run(copyFixture("pass"), "criteria", ID, "2.2").stdout,
    "test/login.test.js::rejects\n",
  );
});

test("criteria errors on a missing scenario and a missing task", () => {
  const cwd = copyFixture("proof-scenario-missing");
  const missing = run(cwd, "criteria", ID, "1.2");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /plan\.md:6: no scenario named "Wrong password"/);
  assert.equal(run(cwd, "criteria", ID, "9.9").status, 1);
});

test("archive refuses with unchecked tasks and names them, then moves with --force", () => {
  const cwd = copyFixture("pass");
  const refused = run(cwd, "archive", ID, "--date", "2026-03-04");
  assert.equal(refused.status, 1);
  assert.match(
    refused.stderr,
    /^docs\/changes\/add-login\/plan\.md:6: unchecked tasks 1\.2, 2\.1, 2\.2 — /,
  );
  assert.ok(fs.existsSync(path.join(cwd, "docs/changes", ID)));
  const forced = run(cwd, "archive", ID, "--date", "2026-03-04", "--force");
  assert.equal(forced.status, 0, forced.stderr);
  assert.ok(!fs.existsSync(path.join(cwd, "docs/changes", ID)));
  assert.ok(fs.existsSync(path.join(cwd, "docs/changes/archive/2026-03-04-add-login/spec.md")));
});

test("archive moves a fully checked change without --force", () => {
  const cwd = copyFixture("unchecked-none");
  assert.equal(run(cwd, "archive", ID, "--date", "2026-03-04").status, 0);
  assert.equal(run(cwd, "list").stdout, "");
});

test("archive into an existing target fails", () => {
  const cwd = copyFixture("archived");
  const result = run(cwd, "archive", ID, "--date", "2026-01-02", "--force");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /2026-01-02-add-login: already exists/);
  assert.ok(fs.existsSync(path.join(cwd, "docs/changes", ID, "spec.md")));
});

test("archive rejects a malformed date", () => {
  assert.equal(run(copyFixture("unchecked-none"), "archive", ID, "--date", "tomorrow").status, 2);
});

test("commands run from a subdirectory of the root", () => {
  const sub = path.join(copyFixture("pass"), "test");
  assert.equal(run(sub, "validate", ID).stdout, "PASS\n");
});

test("usage errors exit 2 and print usage", () => {
  const cwd = copyFixture("pass");
  for (const args of [["bogus"], ["tasks"], ["tasks", ID, "--strict"], ["validate", ID, "extra"]]) {
    const result = run(cwd, ...args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^usage: onlyplans/m);
  }
  assert.equal(run(cwd).status, 0);
  assert.match(run(cwd).stdout, /^usage: onlyplans/);
});

test("an unknown change is one line on stderr with exit 1", () => {
  const result = run(copyFixture("pass"), "validate", "nope");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "docs/changes/nope: no such change — run onlyplans list\n");
});
