"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { ID, copyFixture, run, runIn } = require("./helpers");

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
  [[], ["init", "new", "list", "tasks", "criteria", "validate", "archive", "setup"]],
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
  [["setup", "--"], ["--tabcomplete"]],
  [["setup", "--tabcomplete", ""], ["zsh", "bash", "powershell"]],
  [["setup", "--tabcomplete", "p"], ["powershell"]],
  [["setup", "--tabcomplete", "zsh", ""], []],
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

const MARKERS = ["# >>> onlyplans >>>", "# <<< onlyplans <<<"];

/** A temp home passed as both HOME and ZDOTDIR, so real profiles stay untouched. */
function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "onlyplans-home-"));
  return { home, env: { HOME: home, ZDOTDIR: home } };
}

function setup(env, ...args) {
  return runIn({ cwd: os.tmpdir(), env }, "setup", ...args);
}

function blockOf(text) {
  const start = text.indexOf(MARKERS[0]);
  const stop = text.indexOf(MARKERS[1]);
  assert.ok(start >= 0 && stop > start, "block present");
  return text.slice(start, stop + MARKERS[1].length);
}

function bashProfileName() {
  return process.platform === "darwin" ? ".bash_profile" : ".bashrc";
}

test("setup --tabcomplete zsh adds one marked block, then reports unchanged", () => {
  const { home, env } = tempHome();
  const profile = path.join(home, ".zshrc");
  const first = setup(env, "--tabcomplete", "zsh");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(
    first.stdout,
    `${profile}: added onlyplans tab completion — open a new shell to use it\n`,
  );
  const text = fs.readFileSync(profile, "utf8");
  assert.match(blockOf(text), /_onlyplans\(\)/);
  assert.match(blockOf(text), /compdef _onlyplans onlyplans/);
  const second = setup(env, "--tabcomplete", "zsh");
  assert.equal(second.stdout, `${profile}: unchanged onlyplans tab completion\n`);
  assert.equal(fs.readFileSync(profile, "utf8"), text);
});

test("setup --tabcomplete repairs a changed block and leaves the rest of the file alone", () => {
  const { home, env } = tempHome();
  const profile = path.join(home, ".zshrc");
  fs.writeFileSync(profile, "export BEFORE=1\n");
  setup(env, "--tabcomplete", "zsh");
  fs.appendFileSync(profile, "export AFTER=1\n");
  const good = fs.readFileSync(profile, "utf8");
  fs.writeFileSync(profile, good.replace("local -a candidates", "local -a broken"));
  const result = setup(env, "--tabcomplete", "zsh");
  assert.match(result.stdout, /: updated onlyplans tab completion/);
  assert.equal(fs.readFileSync(profile, "utf8"), good);
  assert.match(good, /^export BEFORE=1\n\n# >>> onlyplans >>>\n/);
  assert.match(good, /# <<< onlyplans <<<\nexport AFTER=1\n$/);
});

test("setup --tabcomplete zsh honors ZDOTDIR over HOME", () => {
  const { home, env } = tempHome();
  const zdotdir = path.join(home, "zdot");
  setup({ ...env, ZDOTDIR: zdotdir }, "--tabcomplete", "zsh");
  assert.ok(fs.existsSync(path.join(zdotdir, ".zshrc")));
  assert.ok(!fs.existsSync(path.join(home, ".zshrc")));
});

test("setup --tabcomplete bash appends after a blank line to the platform profile", () => {
  const { home, env } = tempHome();
  const profile = path.join(home, bashProfileName());
  fs.writeFileSync(profile, "export X=1");
  assert.equal(setup(env, "--tabcomplete", "bash").status, 0);
  const text = fs.readFileSync(profile, "utf8");
  assert.match(text, /^export X=1\n\n# >>> onlyplans >>>\n/);
  assert.match(blockOf(text), /complete -F _onlyplans onlyplans/);
});

test("setup --tabcomplete powershell fails in one line when no PowerShell is on the PATH", () => {
  const { env } = tempHome();
  const noPwsh = { ...env, PATH: path.dirname(process.execPath) };
  const result = setup(noPwsh, "--tabcomplete", "powershell");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^pwsh: not found — /);
});

test("setup usage errors exit 2", () => {
  const { env } = tempHome();
  for (const args of [[], ["--tabcomplete"], ["--tabcomplete", "fish"], ["--json"]]) {
    assert.equal(setup(env, ...args).status, 2, args.join(" "));
  }
});

/** Installs completion into a temp home and returns the profile to source. */
function installedProfile(shell) {
  const { home, env } = tempHome();
  assert.equal(setup(env, "--tabcomplete", shell).status, 0);
  return path.join(home, shell === "zsh" ? ".zshrc" : bashProfileName());
}

test("the installed bash block fills COMPREPLY from the tool", () => {
  const cwd = copyFixture("pass");
  const profile = installedProfile("bash");
  const script = (words) =>
    `source "${profile}"; COMP_WORDS=(${words}); COMP_CWORD=$((${"${#COMP_WORDS[@]}"} - 1));` +
    ' _onlyplans; printf "%s\\n" "${COMPREPLY[@]}"';
  assert.deepEqual(shellLines("bash", cwd, script('onlyplans tasks ""')), [ID]);
  const forTask = script(`onlyplans criteria ${ID} "2"`);
  assert.deepEqual(shellLines("bash", cwd, forTask), ["2.1", "2.2"]);
});

test("the installed zsh block hands candidates to compadd", () => {
  const cwd = copyFixture("pass");
  const profile = installedProfile("zsh");
  const script = (words) =>
    'compdef() { :; }; compadd() { shift; printf "%s\\n" "$@"; };' +
    ` source "${profile}"; words=(${words}); _onlyplans`;
  assert.deepEqual(shellLines("zsh", cwd, script('onlyplans tasks ""')), [ID]);
  const forTask = script(`onlyplans criteria ${ID} "2"`);
  assert.deepEqual(shellLines("zsh", cwd, forTask), ["2.1", "2.2"]);
});
