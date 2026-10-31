"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { BIN, ID, copyFixture, run, runIn } = require("./helpers");
const CHANGE_PATH = `docs/changes/${ID}`;

const WINDOWS = process.platform === "win32";
const POSIX_SHELLS_SKIP = WINDOWS && "bash and zsh are not the Windows story";
/** Windows keeps PATH under whatever casing the parent used. */
const PATH_KEY = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
const PWSH = ["pwsh", "powershell"].find(
  (exe) => spawnSync(exe, ["-NoProfile", "-Command", "1"], { stdio: "ignore" }).status === 0,
);

/** An environment whose PATH starts with an `onlyplans` command for this checkout, then node. */
function envWithBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onlyplans-bin-"));
  if (WINDOWS) {
    fs.writeFileSync(path.join(dir, "onlyplans.cmd"), `@"${process.execPath}" "${BIN}" %*\r\n`);
  } else {
    fs.symlinkSync(BIN, path.join(dir, "onlyplans"));
  }
  const entries = [dir, path.dirname(process.execPath), process.env[PATH_KEY]];
  return { ...process.env, [PATH_KEY]: entries.join(path.delimiter) };
}

/** Runs a script in the named shell with `onlyplans` on the PATH; returns stdout lines. */
function shellLines(shell, cwd, script) {
  const result = spawnSync(shell, ["-c", script], { cwd, encoding: "utf8", env: envWithBin() });
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
  assert.equal(run(cwd, "done", CHANGE_PATH, "1.1").stdout, "1.1 already checked\n");
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
  [
    [],
    [
      "init",
      "new",
      "list",
      "tasks",
      "criteria",
      "done",
      "validate",
      "archive",
      "setup",
      "--help",
      "--version",
    ],
  ],
  [["ta"], ["tasks"]],
  [["tasks", ""], [ID]],
  [["tasks", "add"], [ID]],
  [["tasks", "docs/"], []],
  [["validate", ""], [ID]],
  [
    ["validate", ID, ""],
    ["--strict", "--json"],
  ],
  [["archive", ""], [ID]],
  [
    ["criteria", ID, ""],
    ["1.1", "1.2", "2.1", "2.2"],
  ],
  [
    ["criteria", `${CHANGE_PATH}/`, "2"],
    ["2.1", "2.2"],
  ],
  [
    ["done", ID, ""],
    ["1.1", "1.2", "2.1", "2.2"],
  ],
  [["criteria", "nope", ""], []],
  [
    ["tasks", ID, "--"],
    ["--json", "--next"],
  ],
  [["archive", ID, "--f"], ["--force"]],
  [["setup", ""], ["--tabcomplete"]],
  [["setup", "--"], ["--tabcomplete"]],
  [
    ["setup", "--tabcomplete", ""],
    ["zsh", "bash", "powershell"],
  ],
  [["setup", "--tabcomplete", "p"], ["powershell"]],
  [["setup", "--tabcomplete", "zsh", ""], []],
  [
    ["tasks", ID, ""],
    ["--json", "--next"],
  ],
  [["tasks", ID, "--json", ""], ["--next"]],
  [["list", ""], ["--json"]],
  [["init", ""], ["--no-agents"]],
  [["init", "--no-agents", ""], []],
  [["criteria", ID, "2.1", ""], ["--json"]],
  [["archive", ID, "--date", ""], []],
  [["archive", ID, "--date", "2026-01-01", ""], ["--force"]],
  [["new", ""], []],
  [["bogus", ""], []],
  [["tasks", ID, "extra"], []],
];

for (const [words, expected] of CANDIDATES) {
  test(`__complete [${words.join(" ")}] offers [${expected.join(" ")}]`, () => {
    assert.deepEqual(completeLines(copyFixture("pass"), ...words), expected);
  });
}

const HINTS = [
  [["tasks", "zz"], /^onlyplans: nothing matches "zz"$/],
  [["criteria", "nope", ""], /^docs\/changes\/nope: no such change/],
  [["archive", ID, "--date", ""], /^onlyplans: --date takes YYYY-MM-DD$/],
  [["bogus", ""], /^onlyplans: unknown command bogus$/],
];

for (const [words, expected] of HINTS) {
  test(`__complete [${words.join(" ")}] hints on stderr`, () => {
    const result = run(copyFixture("pass"), "__complete", ...words);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr.trimEnd(), expected);
  });
}

test("__complete stays silent when there is simply nothing left to offer", () => {
  const done = [
    ["init", "--no-agents", ""],
    ["tasks", ID, "--json", "--next", ""],
    ["new", ""],
  ];
  for (const words of done) {
    const result = run(copyFixture("pass"), "__complete", ...words);
    assert.equal(result.stdout + result.stderr, "", words.join(" "));
  }
});

test("__complete outside a root hints to run init, with exit 0", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "onlyplans-noroot-"));
  const result = run(cwd, "__complete", "tasks", "");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /no docs\/changes\/ above here — run onlyplans init/);
});

test("__complete in an empty root hints to run new", () => {
  const cwd = copyFixture("pass");
  fs.rmSync(path.join(cwd, CHANGE_PATH), { recursive: true });
  const result = run(cwd, "__complete", "validate", "");
  const hint = /no active changes — run onlyplans new <id> or onlyplans --help for more/;
  assert.match(result.stderr, hint);
});

const COMPLETION_DIR = path.join(__dirname, "..", "completion");

test("a completion script ships for every shell", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.ok(pkg.files.includes("completion/"));
  for (const file of ["onlyplans.zsh", "onlyplans.bash", "onlyplans.ps1"]) {
    assert.match(fs.readFileSync(path.join(COMPLETION_DIR, file), "utf8"), /__complete/);
  }
});

const MARKERS = ["# >>> onlyplans >>>", "# <<< onlyplans <<<"];

/** A temp home passed as HOME, USERPROFILE, and ZDOTDIR, so real profiles stay untouched. */
function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "onlyplans-home-"));
  return { home, env: { HOME: home, USERPROFILE: home, ZDOTDIR: home } };
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
  const script = path.join(COMPLETION_DIR, "onlyplans.zsh");
  const line = `if [ -f '${script}' ]; then . '${script}'; fi`;
  assert.equal(blockOf(text), `${MARKERS[0]}\n${line}\n${MARKERS[1]}`);
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
  fs.writeFileSync(profile, good.replace("onlyplans.zsh", "onlyplans.old"));
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
  assert.match(blockOf(text), /^if \[ -f '.*onlyplans\.bash' \]; then \. '.*'; fi$/m);
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

test("the installed bash block fills COMPREPLY from the tool", { skip: POSIX_SHELLS_SKIP }, () => {
  const cwd = copyFixture("pass");
  const profile = installedProfile("bash");
  const script = (words) =>
    `source "${profile}"; COMP_WORDS=(${words}); COMP_CWORD=$((${"${#COMP_WORDS[@]}"} - 1));` +
    ' _onlyplans; printf "%s\\n" "${COMPREPLY[@]}"';
  assert.deepEqual(shellLines("bash", cwd, script('onlyplans tasks ""')), [ID]);
  const forTask = script(`onlyplans criteria ${ID} "2"`);
  assert.deepEqual(shellLines("bash", cwd, forTask), ["2.1", "2.2"]);
});

test("the installed zsh block hands candidates to compadd", { skip: POSIX_SHELLS_SKIP }, () => {
  const cwd = copyFixture("pass");
  const profile = installedProfile("zsh");
  const script = (words) =>
    'compdef() { :; }; compadd() { shift; printf "%s\\n" "$@"; };' +
    ` source "${profile}"; words=(${words}); _onlyplans`;
  assert.deepEqual(shellLines("zsh", cwd, script('onlyplans tasks ""')), [ID]);
  const forTask = script(`onlyplans criteria ${ID} "2"`);
  assert.deepEqual(shellLines("zsh", cwd, forTask), ["2.1", "2.2"]);
});

test(
  "the PowerShell completer offers candidates from the tool",
  { skip: !PWSH && "no pwsh" },
  () => {
    const cwd = copyFixture("pass");
    const script = path.join(__dirname, "..", "completion", "onlyplans.ps1");
    const lines = (line) => {
      const command =
        `. '${script}'; (TabExpansion2 -inputScript '${line}' -cursorColumn ${line.length})` +
        ".CompletionMatches.CompletionText";
      // Encoded, so the script needs no command-line quoting on either platform.
      const encoded = Buffer.from(command, "utf16le").toString("base64");
      const options = { cwd, encoding: "utf8", env: envWithBin() };
      const result = spawnSync(PWSH, ["-NoProfile", "-EncodedCommand", encoded], options);
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.split(/\r?\n/).filter(Boolean);
    };
    assert.deepEqual(lines("onlyplans tasks "), [ID]);
    assert.deepEqual(lines(`onlyplans criteria ${ID} 2`), ["2.1", "2.2"]);
  },
);
