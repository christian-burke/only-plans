#!/usr/bin/env node
// @ts-check
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SPEC, PLAN, readLines, parsePlan, parseProof, scenariosOf } = require("../lib/parse");
const {
  CHANGES_DIR,
  ARCHIVE_DIR,
  EXIT,
  CliError,
  isDir,
  relChange,
  relArchived,
  relFile,
  locateRoot,
  requireRoot,
  changesDir,
  archiveDir,
  activeIds,
  archivedEntry,
  changeFromCtx,
  readPlan,
  readSpec,
  findingRow,
  renderFinding,
} = require("../lib/repo");
const { validateChange, missingScenarioFinding } = require("../lib/validate");
const {
  COMPLETE,
  completion,
  idCompletion,
  taskIdCompletion,
  complete,
} = require("../lib/complete");

/** @typedef {import("../lib/repo").Ctx} Ctx */
/** @typedef {import("../lib/complete").Completion} Completion */
/** @typedef {import("../lib/complete").Command} Command */
/** @typedef {import("../lib/repo").Change} Change */
/** @typedef {import("../lib/parse").Task} Task */

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const USAGE = `usage: onlyplans <command> [args]

  init [--no-agents]                         create docs/changes/ and add an AGENTS.md section
  new <id>                                   create a change from the templates
  list [--json]                              active changes with task counts
  tasks <id> [--json]                        the parsed task lines of a change
  criteria <id> <task> [--json]              the scenario a task's proof names
  done <id> <task>                           check one task's box in plan.md in place
  validate <id> [--strict] [--json]          check both files, print PASS or findings
  archive <id> [--date YYYY-MM-DD] [--force] move a finished change to the archive
  setup --tabcomplete <zsh|bash|powershell>  add tab completion to your shell profile

<id> may also be given as a path, such as docs/changes/<id>/.
--help prints this. --version prints the version.`;

const VERSION = require("../package.json").version;
const SHELL_MARKERS = ["# >>> onlyplans >>>", "# <<< onlyplans <<<"];
const COMPLETION_DIR = path.join(__dirname, "..", "completion");
const AGENTS_FILE = "AGENTS.md";
const AGENTS_MARKERS = ["<!-- onlyplans:start -->", "<!-- onlyplans:end -->"];

/**
 * The section `init` upserts into AGENTS.md so agents that read it learn the tool. A blank line
 * on each side keeps Markdown formatters from gluing it to the markers.
 */
function agentsBlock() {
  return `\n${fs.readFileSync(path.join(TEMPLATES_DIR, "agents.md"), "utf8")}`;
}

/** The completion script shipped for each shell, and the profile line that loads it. */
const SHELLS = {
  zsh: { file: "onlyplans.zsh", load: sourceLine },
  bash: { file: "onlyplans.bash", load: sourceLine },
  powershell: { file: "onlyplans.ps1", load: dotSourceLine },
};

/** @param {string} file */
function sourceLine(file) {
  return `if [ -f '${file}' ]; then . '${file}'; fi`;
}

/** @param {string} file */
function dotSourceLine(file) {
  return `if (Test-Path '${file}') { . '${file}' }`;
}

/** @param {string} text */
function print(text) {
  process.stdout.write(`${text}\n`);
}

function today() {
  const d = new Date();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {Ctx} ctx */
function init(ctx) {
  const own = locateRoot(ctx.cwd) === ctx.cwd;
  const above = own ? null : locateRoot(path.dirname(ctx.cwd));
  if (above) {
    throw new CliError(
      `${changesDir(above)}: a root already exists above ${ctx.cwd}` +
        ` — run onlyplans from ${above}`,
    );
  }
  for (const rel of [CHANGES_DIR, path.posix.join(CHANGES_DIR, ARCHIVE_DIR)]) {
    const dir = path.join(ctx.cwd, rel);
    fs.mkdirSync(dir, { recursive: true });
    const keep = path.join(dir, ".gitkeep");
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, "");
    print(`${rel}/`);
  }
  if (ctx.flags["no-agents"]) return;
  const outcome = upsertBlock(path.join(ctx.cwd, AGENTS_FILE), AGENTS_MARKERS, agentsBlock());
  print(`${AGENTS_FILE}: ${outcome} onlyplans section`);
}

/** @param {Ctx} ctx */
function create(ctx) {
  const [id] = ctx.positional;
  const root = requireRoot(ctx.cwd);
  if (!KEBAB.test(id) || id === ARCHIVE_DIR) {
    throw new CliError(
      `${id}: not a valid id — use lowercase letters, digits, and single` + " dashes",
      EXIT.usage,
    );
  }
  const dir = path.join(changesDir(root), id);
  if (isDir(dir)) throw new CliError(`${relChange(id)}: already exists — pick another id`);
  const archived = archivedEntry(root, id);
  if (archived) {
    throw new CliError(`${relArchived(archived)}: id already archived — pick another id`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const title = id.split("-").join(" ");
  for (const file of [SPEC, PLAN]) {
    const text = fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf8");
    fs.writeFileSync(path.join(dir, file), text.replaceAll("<id>", id).replace("<title>", title));
  }
  print(`${relChange(id)}/`);
}

/** @param {string} root @param {string} id */
function taskCounts(root, id) {
  const file = path.join(changesDir(root), id, PLAN);
  const tasks = fs.existsSync(file) ? parsePlan(readLines(file)).tasks : [];
  return {
    id,
    path: relChange(id),
    total: tasks.length,
    done: tasks.filter((t) => t.done).length,
  };
}

/** @param {Ctx} ctx */
function list(ctx) {
  const root = requireRoot(ctx.cwd);
  const rows = activeIds(root).map((id) => taskCounts(root, id));
  if (ctx.flags.json) print(JSON.stringify(rows, null, 2));
  else rows.forEach((r) => print(`${r.id} ${r.done}/${r.total}`));
}

/** @param {Ctx} ctx */
function tasks(ctx) {
  const change = changeFromCtx(ctx);
  const plan = readPlan(change);
  if (ctx.flags.json) {
    const rows = plan.tasks.map(({ id, text, done, fields, line }) => ({
      id,
      text,
      done,
      fields,
      line,
    }));
    print(JSON.stringify(rows, null, 2));
  } else {
    plan.tasks.forEach((t) => print(t.raw));
  }
}

/** @param {Change} change @param {string} taskId @returns {Task} */
function requireTask(change, taskId) {
  const task = readPlan(change).tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new CliError(
      `${relFile(change, PLAN)}: no task ${taskId} — run onlyplans tasks ${change.id}`,
    );
  }
  return task;
}

/** @param {Ctx} ctx */
function criteria(ctx) {
  const taskId = ctx.positional[1];
  const change = changeFromCtx(ctx);
  const task = requireTask(change, taskId);
  if (!("proof" in task.fields)) {
    throw new CliError(
      `${relFile(change, PLAN)}:${task.line}: task ${taskId} has no proof` +
        ' — append " — proof: <Scenario name>"',
    );
  }
  const proof = parseProof(task.fields.proof);
  if (proof.kind === "path") {
    return print(
      ctx.flags.json
        ? JSON.stringify({ kind: "path", path: proof.target, raw: proof.raw }, null, 2)
        : proof.raw,
    );
  }
  const scenario = scenariosOf(readSpec(change)).find((s) => s.name === proof.target);
  if (!scenario) throw new CliError(renderFinding(change, missingScenarioFinding(task, proof)));
  const block = scenario.block.join("\n");
  if (!ctx.flags.json) return print(block);
  const { name, line, given, when, then } = scenario;
  const file = relFile(change, SPEC);
  print(JSON.stringify({ kind: "scenario", name, file, line, given, when, then, block }, null, 2));
}

/**
 * Turns the leading `- [ ]` into `- [x]` on line `lineNumber` (1-based) and leaves every other
 * byte as it was.
 * Splits on `\n` alone so a `\r` stays with its line and a missing final newline stays missing.
 * @param {string} text @param {number} lineNumber
 */
function checkLine(text, lineNumber) {
  const lines = text.split("\n");
  lines[lineNumber - 1] = lines[lineNumber - 1].replace(/^- \[ \]/, "- [x]");
  return lines.join("\n");
}

/** @param {Ctx} ctx */
function done(ctx) {
  const taskId = ctx.positional[1];
  const change = changeFromCtx(ctx);
  const task = requireTask(change, taskId);
  if (task.done) return print(`${taskId} already checked`);
  const file = path.join(change.dir, PLAN);
  // latin1 maps every byte to one code unit and back, so nothing outside the one line changes.
  fs.writeFileSync(file, checkLine(fs.readFileSync(file, "latin1"), task.line), "latin1");
  print(`checked ${taskId} at ${relFile(change, PLAN)}:${task.line}`);
}

/** @param {Ctx} ctx */
function validate(ctx) {
  const change = changeFromCtx(ctx);
  const findings = validateChange(change, Boolean(ctx.flags.strict));
  if (ctx.flags.json) {
    print(
      JSON.stringify(
        findings.map((f) => findingRow(change, f)),
        null,
        2,
      ),
    );
    return findings.length ? EXIT.fail : EXIT.ok;
  }
  if (!findings.length) return print("PASS");
  findings.forEach((f) => print(renderFinding(change, f)));
  return EXIT.fail;
}

/** @param {Ctx} ctx */
function archive(ctx) {
  const change = changeFromCtx(ctx);
  const date = typeof ctx.flags.date === "string" ? ctx.flags.date : today();
  if (!DATE.test(date)) throw new CliError(`${date}: --date must be YYYY-MM-DD`, EXIT.usage);
  const unchecked = readPlan(change).tasks.filter((t) => !t.done);
  if (unchecked.length && !ctx.flags.force) {
    const ids = unchecked.map((t) => t.id).join(", ");
    throw new CliError(
      `${relFile(change, PLAN)}:${unchecked[0].line}: unchecked tasks ${ids}` +
        " — check them or pass --force",
    );
  }
  const targetName = `${date}-${change.id}`;
  const target = path.join(archiveDir(change.root), targetName);
  if (fs.existsSync(target)) {
    throw new CliError(`${relArchived(targetName)}: already exists — pass a different --date`);
  }
  fs.mkdirSync(archiveDir(change.root), { recursive: true });
  fs.renameSync(change.dir, target);
  print(`${relArchived(targetName)}/`);
}

/** @param {string | boolean | undefined} shell @returns {keyof typeof SHELLS} */
function requireShell(shell) {
  if (typeof shell === "string" && shell in SHELLS) {
    return /** @type {keyof typeof SHELLS} */ (shell);
  }
  const given = shell || "<shell>";
  throw new CliError(`${given}: unknown shell — use zsh, bash, or powershell`, EXIT.usage);
}

/** Asks PowerShell for $PROFILE, since it is not an environment variable. */
function powershellProfile() {
  for (const exe of ["pwsh", "powershell"]) {
    const result = spawnSync(exe, ["-NoProfile", "-Command", "$PROFILE"], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new CliError(
    "pwsh: not found — run onlyplans setup --tabcomplete powershell from PowerShell, or" +
      ` dot-source ${path.join(COMPLETION_DIR, SHELLS.powershell.file)} from $PROFILE by hand`,
  );
}

/** @param {keyof typeof SHELLS} shell */
function profilePath(shell) {
  const home = os.homedir();
  if (shell === "zsh") return path.join(process.env.ZDOTDIR || home, ".zshrc");
  if (shell === "bash") {
    return path.join(home, process.platform === "darwin" ? ".bash_profile" : ".bashrc");
  }
  return powershellProfile();
}

/**
 * Equal once whitespace is collapsed and ordered-list numbers are flattened, so a Markdown
 * formatter's rewrap, added blank lines, or renumbering to "1." does not count as a change.
 * @param {string} a @param {string} b
 */
function sameText(a, b) {
  const squash = (/** @type {string} */ text) =>
    text
      .replace(/^\s*\d+\.(?=\s)/gm, "1.")
      .replace(/\s+/g, " ")
      .trim();
  return squash(a) === squash(b);
}

/**
 * Writes `body` between the markers in `file`, replacing an earlier block or appending a new one.
 * Everything outside the markers is left as it was.
 * @param {string} file @param {string[]} markers @param {string} body
 * @returns {"added" | "updated" | "unchanged"}
 */
function upsertBlock(file, [begin, end], body) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const block = [begin, ...body.split("\n"), end].join(eol);
  const start = existing.indexOf(begin);
  const stop = existing.indexOf(end, start);
  if (start >= 0 !== stop >= 0) {
    throw new CliError(
      `${file}: has one of "${begin}" and "${end}" without the other` +
        " — restore both markers or delete the block",
    );
  }
  if (start >= 0) {
    const current = existing.slice(start, stop + end.length);
    if (sameText(current, block)) return "unchanged";
    fs.writeFileSync(file, existing.slice(0, start) + block + existing.slice(stop + end.length));
    return "updated";
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const separator = !existing ? "" : existing.endsWith("\n") ? eol : eol + eol;
  fs.appendFileSync(file, `${separator}${block}${eol}`);
  return "added";
}

/** @param {Ctx} ctx */
function setup(ctx) {
  if (!("tabcomplete" in ctx.flags)) {
    throw new CliError("setup needs --tabcomplete <zsh|bash|powershell>", EXIT.usage);
  }
  const shell = requireShell(ctx.flags.tabcomplete);
  const profile = profilePath(shell);
  const script = path.join(COMPLETION_DIR, SHELLS[shell].file);
  const outcome = upsertBlock(profile, SHELL_MARKERS, SHELLS[shell].load(script));
  const next = outcome === "unchanged" ? "" : " — open a new shell to use it";
  print(`${profile}: ${outcome} onlyplans tab completion${next}`);
}

/**
 * The flags that take a value, and what Tab offers for each.
 * @type {Record<string, () => Completion>}
 */
const FLAG_VALUES = {
  tabcomplete: () => completion(Object.keys(SHELLS)),
  date: () => completion([], "onlyplans: --date takes YYYY-MM-DD"),
};

/** @type {Record<string, Command>} */
const COMMANDS = {
  init: { arity: 0, flags: ["no-agents"], run: init },
  new: { arity: 1, flags: [], run: create },
  list: { arity: 0, flags: ["json"], run: list },
  tasks: { arity: 1, flags: ["json"], run: tasks, positional: [idCompletion] },
  criteria: {
    arity: 2,
    flags: ["json"],
    run: criteria,
    positional: [idCompletion, taskIdCompletion],
  },
  done: { arity: 2, flags: [], run: done, positional: [idCompletion, taskIdCompletion] },
  validate: { arity: 1, flags: ["strict", "json"], run: validate, positional: [idCompletion] },
  archive: { arity: 1, flags: ["date", "force"], run: archive, positional: [idCompletion] },
  setup: { arity: 0, flags: ["tabcomplete"], run: setup },
};

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const name = arg.startsWith("--") ? arg.slice(2) : null;
    if (name && Object.hasOwn(FLAG_VALUES, name)) flags[name] = argv[++i] ?? "";
    else if (name) flags[name] = true;
    else positional.push(arg);
  }
  return { positional, flags };
}

/** @param {string} message */
function usageError(message) {
  process.stderr.write(`${message}\n${USAGE}\n`);
  return EXIT.usage;
}

/** @param {string[]} argv */
function main(argv) {
  if (argv[0] === COMPLETE) {
    const { matches, message } = complete(process.cwd(), argv.slice(1), COMMANDS, FLAG_VALUES);
    matches.forEach(print);
    if (message) process.stderr.write(`${message}\n`);
    return EXIT.ok;
  }
  const {
    positional: [name, ...positional],
    flags,
  } = parseArgs(argv);
  if (!name && flags.version) {
    print(VERSION);
    return EXIT.ok;
  }
  if (!name || flags.help) {
    print(USAGE);
    return EXIT.ok;
  }
  const command = COMMANDS[name];
  if (!command) return usageError(`unknown command: ${name}`);
  if (positional.length !== command.arity) {
    return usageError(`${name} takes ${command.arity} argument(s), got ${positional.length}`);
  }
  const unknown = Object.keys(flags).find((flag) => !command.flags.includes(flag));
  if (unknown) return usageError(`${name} does not take --${unknown}`);
  try {
    return command.run({ cwd: process.cwd(), positional, flags }) ?? EXIT.ok;
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    process.stderr.write(`${error.message}\n`);
    return error.exitCode;
  }
}

// A consumer such as `head` may close a pipe early. That is not an error worth a stack trace.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error.code !== "EPIPE") throw error;
    process.exit();
  });
}

process.exitCode = main(process.argv.slice(2));
