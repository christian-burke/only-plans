"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { BIN, ID, copyFixture, run, fixtureFile } = require("./helpers");

const AGENTS_MARKERS = ["<!-- onlyplans:start -->", "<!-- onlyplans:end -->"];

function freshDir() {
  return fs.mkdtempSync(path.join(require("node:os").tmpdir(), "onlyplans-init-"));
}

function agentsText(cwd) {
  return fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
}

function planPath(cwd) {
  return path.join(cwd, "docs", "changes", ID, "plan.md");
}

test("init creates both folders with .gitkeep and is idempotent", () => {
  const cwd = freshDir();
  for (let i = 0; i < 2; i++) {
    assert.equal(run(cwd, "init").status, 0);
    assert.ok(fs.existsSync(path.join(cwd, "docs", "changes", ".gitkeep")));
    assert.ok(fs.existsSync(path.join(cwd, "docs", "changes", "archive", ".gitkeep")));
  }
});

test("init creates AGENTS.md with the onlyplans section, then reports unchanged", () => {
  const cwd = freshDir();
  const first = run(cwd, "init");
  assert.match(first.stdout, /^AGENTS\.md: added onlyplans section$/m);
  const text = agentsText(cwd);
  assert.match(text, /^<!-- onlyplans:start -->\n\n## OnlyPlans\n/);
  assert.match(text, /onlyplans archive <id>/);
  assert.match(text, /\n\n<!-- onlyplans:end -->\n$/);
  assert.match(run(cwd, "init").stdout, /^AGENTS\.md: unchanged onlyplans section$/m);
  assert.equal(agentsText(cwd), text);
});

test("init appends to an existing AGENTS.md and repairs a changed section", () => {
  const cwd = freshDir();
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), "## Rules\n\n- Be brief.\n");
  run(cwd, "init");
  fs.appendFileSync(path.join(cwd, "AGENTS.md"), "\n## After\n");
  const good = agentsText(cwd);
  assert.match(good, /^## Rules\n\n- Be brief\.\n\n<!-- onlyplans:start -->\n/);
  assert.match(good, /<!-- onlyplans:end -->\n\n## After\n$/);
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), good.replace("--strict", "--loose"));
  assert.match(run(cwd, "init").stdout, /^AGENTS\.md: updated onlyplans section$/m);
  assert.equal(agentsText(cwd), good);
});

test("init refuses an AGENTS.md with a lone marker and leaves it alone", () => {
  for (const marker of AGENTS_MARKERS) {
    const cwd = freshDir();
    const text = `# Rules\n\n${marker}\nold\n\n## Keep me\n`;
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), text);
    const result = run(cwd, "init");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AGENTS\.md: has one of .* without the other — restore both/);
    assert.equal(agentsText(cwd), text);
  }
});

test("init keeps the line endings of a CRLF AGENTS.md", () => {
  const cwd = freshDir();
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# Rules\r\n\r\n- Be brief.\r\n");
  assert.equal(run(cwd, "init").status, 0);
  const text = agentsText(cwd);
  assert.ok(
    text.split("\r\n").every((line) => !line.includes("\n")),
    "found a bare LF",
  );
  assert.match(text, /\r\n\r\n<!-- onlyplans:end -->\r\n$/);
  assert.match(run(cwd, "init").stdout, /^AGENTS\.md: unchanged onlyplans section$/m);
  assert.equal(agentsText(cwd), text);
});

test("init leaves a section alone that a Markdown formatter has reflowed", () => {
  const cwd = freshDir();
  run(cwd, "init");
  const [begin, end] = AGENTS_MARKERS;
  const text = agentsText(cwd);
  const body = text.slice(text.indexOf(begin) + begin.length, text.indexOf(end));
  // Join each paragraph onto one line, number every list item "1.", and drop the padding,
  // as mdformat does.
  const reflowed = body
    .trim()
    .split("\n\n")
    .map((paragraph) => paragraph.replace(/\n\s*(?!\d+\. )/g, " ").replace(/^\d+\. /gm, "1. "))
    .join("\n\n");
  const formatted = `${begin}\n${reflowed}\n${end}\n`;
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), formatted);
  assert.match(run(cwd, "init").stdout, /^AGENTS\.md: unchanged onlyplans section$/m);
  assert.equal(agentsText(cwd), formatted);
});

test("init --no-agents leaves AGENTS.md alone", () => {
  const cwd = freshDir();
  assert.equal(run(cwd, "init", "--no-agents").status, 0);
  assert.ok(!fs.existsSync(path.join(cwd, "AGENTS.md")));
  assert.ok(fs.existsSync(path.join(cwd, "docs", "changes", "archive")));
});

test("init refuses when a root exists above", () => {
  const sub = path.join(copyFixture("pass"), "packages", "app");
  fs.mkdirSync(sub, { recursive: true });
  const result = run(sub, "init");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a root already exists above/);
  assert.ok(!fs.existsSync(path.join(sub, "docs")));
});

test("new creates a change that validates until --strict, and twice fails", () => {
  const cwd = copyFixture("pass");
  assert.equal(run(cwd, "new", "fix-logout").status, 0);
  const spec = fs.readFileSync(path.join(cwd, "docs/changes/fix-logout/spec.md"), "utf8");
  assert.match(spec, /^# fix-logout — fix logout$/m);
  assert.equal(run(cwd, "validate", "fix-logout").stdout, "PASS\n");
  const strict = run(cwd, "validate", "fix-logout", "--strict");
  assert.equal(strict.status, 1);
  assert.match(
    strict.stdout,
    /spec\.md:5: unresolved placeholder — replace or remove "<replace me>"$/m,
  );
  assert.match(strict.stdout, /plan\.md:5: unresolved placeholder/);
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
    line: 5,
  });
  assert.deepEqual(rows[3].fields, { proof: "test/login.test.js::rejects" });
});

test("a dash in the task text stays in the text and the task still counts", () => {
  const cwd = copyFixture("task-prose-dash");
  const rows = JSON.parse(run(cwd, "tasks", ID, "--json").stdout);
  assert.equal(rows[1].text, "Reject bad passwords — the old check was wrong");
  assert.deepEqual(rows[1].fields, { proof: "Bad password" });
  assert.equal(run(cwd, "validate", ID, "--strict").stdout, "PASS\n");
  assert.equal(run(cwd, "list").stdout, `${ID} 1/4\n`);
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
  const bad = [
    ["bogus"],
    ["tasks"],
    ["tasks", ID, "--strict"],
    ["validate", ID, "extra"],
    ["done", ID],
  ];
  for (const args of bad) {
    const result = run(cwd, ...args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^usage: onlyplans/m);
  }
  assert.equal(run(cwd).status, 0);
  assert.match(run(cwd).stdout, /^usage: onlyplans/);
});

test("--version prints the package version", () => {
  const result = run(copyFixture("pass"), "--version");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${require("../package.json").version}\n`);
});

test("an unknown change is one line on stderr with exit 1", () => {
  const result = run(copyFixture("pass"), "validate", "nope");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "docs/changes/nope: no such change — run onlyplans list\n");
});

test("any command outside a root fails in one line that points at init", () => {
  const cwd = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "onlyplans-noroot-"));
  const result = run(cwd, "list");
  assert.equal(result.status, 1);
  const expected = /^docs\/changes: not found in \S+ or above — run onlyplans init\n$/;
  assert.match(result.stderr, expected);
});

test("tasks on a change without plan.md fails with the missing-file finding", () => {
  const result = run(copyFixture("missing-plan"), "tasks", ID);
  assert.equal(result.status, 1);
  const expected = "docs/changes/add-login/plan.md:1: file is missing — add plan.md\n";
  assert.equal(result.stderr, expected);
});

test("archive without --date uses today", () => {
  const cwd = copyFixture("unchecked-none");
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  assert.equal(run(cwd, "archive", ID).stdout, `docs/changes/archive/${today}-${ID}/\n`);
  assert.ok(fs.existsSync(path.join(cwd, "docs/changes/archive", `${today}-${ID}`, "spec.md")));
});

test("criteria on a task without a proof fails at the task line", () => {
  const result = run(copyFixture("task-no-proof"), "criteria", ID, "1.2");
  assert.equal(result.status, 1);
  const expected = /^docs\/changes\/add-login\/plan\.md:6: task 1\.2 has no proof — /;
  assert.match(result.stderr, expected);
});

test("done checks one line and changes nothing else", () => {
  const cwd = copyFixture("pass");
  const before = fs.readFileSync(planPath(cwd), "utf8");
  const result = run(cwd, "done", ID, "1.2");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `checked 1.2 at docs/changes/${ID}/plan.md:6\n`);
  assert.equal(fs.readFileSync(planPath(cwd), "utf8"), before.replace("- [ ] 1.2", "- [x] 1.2"));
});

test("done on a checked task is a no-op", () => {
  const cwd = copyFixture("pass");
  const before = fs.readFileSync(planPath(cwd));
  const result = run(cwd, "done", ID, "1.1");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "1.1 already checked\n");
  assert.deepEqual(fs.readFileSync(planPath(cwd)), before);
});

test("done on an unknown task fails in one line and leaves the file alone", () => {
  const cwd = copyFixture("pass");
  const before = fs.readFileSync(planPath(cwd));
  const result = run(cwd, "done", ID, "9.9");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^docs\/changes\/add-login\/plan\.md: no task 9\.9 — /);
  assert.deepEqual(fs.readFileSync(planPath(cwd)), before);
});

test("done keeps CRLF line endings", () => {
  const cwd = copyFixture("pass");
  const crlf = fs.readFileSync(planPath(cwd), "utf8").replaceAll("\n", "\r\n");
  fs.writeFileSync(planPath(cwd), crlf);
  assert.equal(run(cwd, "done", ID, "1.2").status, 0);
  const after = fs.readFileSync(planPath(cwd), "utf8");
  assert.ok(
    after.split("\r\n").every((line) => !line.includes("\n")),
    "found a bare LF",
  );
  assert.equal(after, crlf.replace("- [ ] 1.2", "- [x] 1.2"));
});

test("done keeps a missing final newline missing", () => {
  const cwd = copyFixture("pass");
  const text = fs.readFileSync(planPath(cwd), "utf8").replace(/\n$/, "");
  fs.writeFileSync(planPath(cwd), text);
  assert.equal(run(cwd, "done", ID, "1.2").status, 0);
  assert.equal(fs.readFileSync(planPath(cwd), "utf8"), text.replace("- [ ] 1.2", "- [x] 1.2"));
});

test("done treats an uppercase X as checked and leaves it uppercase", () => {
  const cwd = copyFixture("pass");
  const text = fs.readFileSync(planPath(cwd), "utf8").replace("- [x] 1.1", "- [X] 1.1");
  fs.writeFileSync(planPath(cwd), text);
  assert.equal(run(cwd, "done", ID, "1.1").stdout, "1.1 already checked\n");
  assert.equal(fs.readFileSync(planPath(cwd), "utf8"), text);
});

test("done keeps a byte order mark", () => {
  const cwd = copyFixture("pass");
  const text = `\uFEFF${fs.readFileSync(planPath(cwd), "utf8")}`;
  fs.writeFileSync(planPath(cwd), text);
  assert.equal(run(cwd, "done", ID, "1.2").status, 0);
  assert.equal(fs.readFileSync(planPath(cwd), "utf8"), text.replace("- [ ] 1.2", "- [x] 1.2"));
});

/** Runs the bin with both streams piped into a consumer that exits at once; returns its status. */
function statusIntoClosedPipe(cwd, ...args) {
  const script = `"${process.execPath}" "${BIN}" ${args.join(" ")} 2>&1 | true`;
  const result = spawnSync("bash", ["-c", `${script}; exit \${PIPESTATUS[0]}`], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.stderr, "");
  return result.status;
}

test("a consumer that closes the pipe early gets no stack trace and the usual exit code", () => {
  const cwd = copyFixture("strict-placeholder");
  assert.equal(statusIntoClosedPipe(cwd, "validate", ID, "--strict"), 1);
  assert.equal(statusIntoClosedPipe(cwd, "bogus"), 2);
  assert.equal(statusIntoClosedPipe(cwd, "tasks", ID), 0);
});

test("output larger than the pipe buffer survives a consumer that stops after one line", () => {
  const cwd = copyFixture("pass");
  const lines = Array.from(
    { length: 5000 },
    (_, i) => `- [ ] 1.${i + 1} Do thing ${i + 1} — proof: Form renders`,
  );
  fs.writeFileSync(planPath(cwd), `# ${ID} — Plan\n\n## Tasks\n\n${lines.join("\n")}\n`);
  const script = `"${process.execPath}" "${BIN}" tasks ${ID} | head -1; exit \${PIPESTATUS[0]}`;
  const result = spawnSync("bash", ["-c", script], { cwd, encoding: "utf8" });
  assert.equal(result.stdout, `${lines[0]}\n`);
  assert.equal(result.stderr, "");
  assert.equal(result.status, 0);
});

test("npm pack ships every file under lib/", () => {
  const root = path.join(__dirname, "..");
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const shipped = new Set(JSON.parse(result.stdout)[0].files.map((f) => f.path));
  for (const name of fs.readdirSync(path.join(root, "lib"))) {
    assert.ok(shipped.has(`lib/${name}`), `lib/${name} is not in the package`);
  }
});
