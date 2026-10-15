#!/usr/bin/env node
// @ts-check
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHANGES_DIR = path.join("docs", "changes");
const ARCHIVE_DIR = "archive";
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");
const SPEC = "spec.md";
const PLAN = "plan.md";
const MAX_COLUMNS = 100;
const EXIT = { ok: 0, fail: 1, usage: 2 };

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ARCHIVED = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
const TITLE = /^# (\S+) — (.+)$/;
const HEADING = /^(#{1,6}) (.*)$/;
const STEP = /^- (GIVEN|WHEN|THEN)\b/;
const TASK = /^- \[([ xX])\] (\d+(?:\.\d+)*) (.+)$/;
const FIELD = /^([A-Za-z][\w-]*):\s*(.*)$/;
const FIELD_SEPARATOR = /\s+—\s+/;
const STEP_ORDER = "GIVEN,WHEN,THEN";

const USAGE = `usage: onlyplans <command> [args]

  init [--no-agents]                         create docs/changes/ and add an AGENTS.md section
  new <id>                                   create a change from the templates
  list [--json]                              active changes with task counts
  tasks <id> [--json]                        the parsed task lines of a change
  criteria <id> <task>                       the scenario a task's proof names
  validate <id> [--strict]                   check both files, print PASS or findings
  archive <id> [--date YYYY-MM-DD] [--force] move a finished change to the archive
  setup --tabcomplete <zsh|bash|powershell>  add tab completion to your shell profile

<id> may also be given as a path, such as docs/changes/<id>/.`;

const COMPLETE = "__complete";
const VALUE_FLAGS = new Set(["date", "tabcomplete"]);
const SHELL_MARKERS = ["# >>> onlyplans >>>", "# <<< onlyplans <<<"];
const COMPLETION_DIR = path.join(__dirname, "..", "completion");
const AGENTS_FILE = "AGENTS.md";
const AGENTS_MARKERS = ["<!-- onlyplans:start -->", "<!-- onlyplans:end -->"];

/** The section `init` upserts into AGENTS.md so agents that read it learn the tool. */
const AGENTS_BLOCK = [
  "## OnlyPlans",
  "",
  "Changes live in `docs/changes/<id>/` as `spec.md` and `plan.md`. Finished changes move to",
  "`docs/changes/archive/`. Run `onlyplans --help` for all commands.",
  "",
  "Work a change in this order:",
  "",
  "1. `onlyplans new <id>` creates the folder. Fill `spec.md` with requirements and",
  "   scenarios, and `plan.md` with tasks. Each task names a proof: a scenario from",
  "   `spec.md` or a test path.",
  "2. `onlyplans validate <id> --strict` must print `PASS` before any task starts.",
  "3. `onlyplans tasks <id> --json` lists the tasks. `onlyplans criteria <id> <task>` prints the",
  "   scenario a task must satisfy.",
  "4. Do one task, make its proof pass, then check its box in `plan.md`.",
  "5. `onlyplans archive <id>` when every box is checked. Never edit `docs/changes/archive/`.",
  "",
  "Task line grammar: `- [ ] 1.1 <task> — proof: <Scenario name>`. Extra `key: value` fields",
  "are allowed and kept.",
].join("\n");

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

/**
 * @typedef {{ n: number, text: string }} Line
 * @typedef {{ id: string, title: string, line: number }} Title
 * @typedef {{ name: string, line: number, steps: string[], block: string[] }} Scenario
 * @typedef {{ name: string, line: number, text: string, scenarios: Scenario[] }} Requirement
 * @typedef {{ title: Title | null, sections: string[], requirements: Requirement[],
 *             stray: Line[], lines: Line[] }} Spec
 * @typedef {{ id: string, text: string, done: boolean, fields: Record<string, string>,
 *             line: number, raw: string }} Task
 * @typedef {{ title: Title | null, sections: string[], tasks: Task[], malformed: Line[],
 *             lines: Line[] }} Plan
 * @typedef {{ kind: 'scenario' | 'path', target: string, raw: string }} Proof
 * @typedef {{ file: string, line: number, what: string, fix: string }} Finding
 * @typedef {{ root: string, id: string, dir: string }} Change
 * @typedef {{ cwd: string, positional: string[], flags: Record<string, string | boolean> }} Ctx
 */

class CliError extends Error {
  /** @param {string} message @param {number} [exitCode] */
  constructor(message, exitCode = EXIT.fail) {
    super(message);
    this.exitCode = exitCode;
  }
}

/** @param {string} text */
function print(text) {
  process.stdout.write(`${text}\n`);
}

/**
 * Resolves symlinks such as macOS's /var so paths compare by location. A missing path passes.
 * @param {string} file
 */
function realPath(file) {
  return fs.existsSync(file) ? fs.realpathSync(file) : file;
}

/** @param {string} file */
function isDir(file) {
  return fs.existsSync(file) && fs.statSync(file).isDirectory();
}

/** @param {string} file @returns {Line[]} */
function readLines(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((text, i) => ({ n: i + 1, text }));
}

/** @param {string} text */
function heading(text) {
  const m = HEADING.exec(text);
  return m ? { level: m[1].length, text: m[2].trim() } : null;
}

/** @param {Line[]} lines @returns {Title | null} */
function firstTitle(lines) {
  const first = lines.find((line) => line.text.trim());
  const m = first && TITLE.exec(first.text);
  return m ? { id: m[1], title: m[2], line: first.n } : null;
}

/** @param {string[]} block */
function trimTrailingBlank(block) {
  while (block.length && !block[block.length - 1].trim()) block.pop();
  return block;
}

/** @param {Line[]} lines @returns {Spec} */
function parseSpec(lines) {
  /** @type {Spec} */
  const spec = { title: firstTitle(lines), sections: [], requirements: [], stray: [], lines };
  let inRequirements = false;
  /** @type {Requirement | null} */
  let requirement = null;
  /** @type {Scenario | null} */
  let scenario = null;
  for (const line of lines) {
    if (spec.title && line.n === spec.title.line) continue;
    const h = heading(line.text);
    if (h && h.level <= 4) scenario = null;
    if (h && h.level <= 3) requirement = null;
    if (h && h.level === 2) {
      const seen = spec.sections.includes("Requirements");
      spec.sections.push(h.text);
      inRequirements = h.text === "Requirements";
      if (seen) spec.stray.push(line);
      continue;
    }
    if (!inRequirements) continue;
    if (h && h.level === 3 && h.text.startsWith("Requirement: ")) {
      requirement = { name: h.text.slice(13).trim(), line: line.n, text: "", scenarios: [] };
      spec.requirements.push(requirement);
    } else if (h && h.level === 4 && h.text.startsWith("Scenario: ") && requirement) {
      scenario = { name: h.text.slice(10).trim(), line: line.n, steps: [], block: [line.text] };
      requirement.scenarios.push(scenario);
    } else if (scenario) {
      scenario.block.push(line.text);
      const step = STEP.exec(line.text);
      if (step) scenario.steps.push(step[1]);
    } else if (requirement && line.text.trim()) {
      requirement.text += `${line.text.trim()} `;
    } else if (line.text.trim()) {
      spec.stray.push(line);
    }
  }
  for (const r of spec.requirements) r.scenarios.forEach((s) => trimTrailingBlank(s.block));
  return spec;
}

/** @param {Line} line @returns {Task | null} */
function parseTask(line) {
  const m = TASK.exec(line.text);
  if (!m) return null;
  const [text, ...parts] = m[3].split(FIELD_SEPARATOR);
  /** @type {Record<string, string>} */
  const fields = {};
  for (const part of parts) {
    const f = FIELD.exec(part);
    if (!f) return null;
    fields[f[1]] = f[2];
  }
  return { id: m[2], text: text.trim(), done: m[1] !== " ", fields, line: line.n, raw: line.text };
}

/** @param {Line[]} lines @returns {Plan} */
function parsePlan(lines) {
  /** @type {Plan} */
  const plan = { title: firstTitle(lines), sections: [], tasks: [], malformed: [], lines };
  let inTasks = false;
  for (const line of lines) {
    if (plan.title && line.n === plan.title.line) continue;
    const h = heading(line.text);
    if (h && h.level === 2) {
      plan.sections.push(h.text);
      inTasks = h.text === "Tasks";
      continue;
    }
    if (!inTasks || !line.text.startsWith("- [")) continue;
    const task = parseTask(line);
    if (task) plan.tasks.push(task);
    else plan.malformed.push(line);
  }
  return plan;
}

/** @param {string} raw @returns {Proof} */
function parseProof(raw) {
  const isPath = raw.includes("/") || raw.includes("::");
  return { kind: isPath ? "path" : "scenario", target: isPath ? raw.split("::")[0] : raw, raw };
}

/** @param {Spec} spec */
function scenariosOf(spec) {
  return spec.requirements.flatMap((r) => r.scenarios);
}

/** @param {string} id */
function idParts(id) {
  return id.split(".").map(Number);
}

/** @param {string} a @param {string} b */
function compareIds(a, b) {
  const pa = idParts(a);
  const pb = idParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/** @param {Line[]} lines Groups consecutive line numbers so one block yields one finding. */
function firstOfEachBlock(lines) {
  return lines.filter((line, i) => i === 0 || lines[i - 1].n !== line.n - 1);
}

/**
 * @param {string} file @param {number} line @param {string} what @param {string} fix
 * @returns {Finding}
 */
function finding(file, line, what, fix) {
  return { file, line, what, fix };
}

/** @param {Title | null} title @param {string} id @param {string} file @param {string} suffix */
function titleFindings(title, id, file, suffix) {
  const want = `# ${id} — ${suffix}`;
  if (!title) return [finding(file, 1, "missing title", `write "${want}" on the first line`)];
  if (title.id !== id) {
    return [
      finding(
        file,
        title.line,
        `title id "${title.id}" does not match folder "${id}"`,
        `write "${want}"`,
      ),
    ];
  }
  return [];
}

/** @param {string[]} present @param {string[]} wanted @param {string} file */
function sectionFindings(present, wanted, file) {
  return wanted
    .filter((s) => !present.includes(s))
    .map((s) => finding(file, 1, `missing section "## ${s}"`, `add "## ${s}"`));
}

/** @param {Spec} spec @param {string} id @returns {Finding[]} */
function specFindings(spec, id) {
  const out = titleFindings(spec.title, id, SPEC, "<title>");
  out.push(...sectionFindings(spec.sections, ["Why", "Requirements"], SPEC));
  /** @type {Set<string>} */
  const names = new Set();
  for (const r of spec.requirements) {
    if (!r.scenarios.length) {
      out.push(
        finding(
          SPEC,
          r.line,
          `requirement "${r.name}" has no scenario`,
          'add a "#### Scenario:" block under it',
        ),
      );
    }
    if (!/\bSHALL\b/.test(r.text)) {
      out.push(
        finding(
          SPEC,
          r.line,
          `requirement "${r.name}" does not say SHALL`,
          'write "The system SHALL <behavior>."',
        ),
      );
    }
    for (const s of r.scenarios) {
      if (s.steps.join(",") !== STEP_ORDER) {
        out.push(
          finding(
            SPEC,
            s.line,
            `scenario "${s.name}" lacks GIVEN, WHEN, THEN in order`,
            'write one "- GIVEN", one "- WHEN", then one "- THEN" line',
          ),
        );
      }
      if (names.has(s.name)) {
        out.push(finding(SPEC, s.line, `duplicate scenario name "${s.name}"`, "rename it"));
      }
      names.add(s.name);
    }
  }
  for (const line of firstOfEachBlock(spec.stray)) {
    out.push(
      finding(
        SPEC,
        line.n,
        'content after "## Requirements" is not a requirement block',
        'move it above "## Requirements" or into a "### Requirement:" block',
      ),
    );
  }
  return out;
}

/** @param {Plan} plan @param {string} id @returns {Finding[]} */
function planFindings(plan, id) {
  const out = titleFindings(plan.title, id, PLAN, "Plan");
  if (plan.title && plan.title.id === id && plan.title.title !== "Plan") {
    out.push(
      finding(PLAN, plan.title.line, `title is "${plan.title.title}"`, `write "# ${id} — Plan"`),
    );
  }
  out.push(...sectionFindings(plan.sections, ["Tasks"], PLAN));
  for (const line of plan.malformed) {
    out.push(
      finding(
        PLAN,
        line.n,
        "task line does not match the grammar",
        'write "- [ ] <n.n> <task> — proof: <Scenario name>"',
      ),
    );
  }
  /** @type {Set<string>} */
  const ids = new Set();
  let previous = "";
  for (const t of plan.tasks) {
    if (!("proof" in t.fields)) {
      out.push(
        finding(
          PLAN,
          t.line,
          `task ${t.id} has no proof`,
          'append " — proof: <Scenario name>" or " — proof: <path>"',
        ),
      );
    }
    if (ids.has(t.id)) out.push(finding(PLAN, t.line, `duplicate task id ${t.id}`, "renumber it"));
    else if (previous && compareIds(previous, t.id) >= 0) {
      out.push(
        finding(
          PLAN,
          t.line,
          `task id ${t.id} does not ascend from ${previous}`,
          "renumber the tasks in order",
        ),
      );
    }
    ids.add(t.id);
    previous = t.id;
  }
  return out;
}

/** @param {Task} task @param {Proof} proof */
function missingScenarioFinding(task, proof) {
  const hint = /\s/.test(proof.target) ? "" : `; for a root file write ./${proof.target}`;
  return finding(
    PLAN,
    task.line,
    `no scenario named "${proof.target}"${hint}`,
    "name a scenario from spec.md",
  );
}

/** @param {Change} change @param {Spec} spec @param {Plan} plan @returns {Finding[]} */
function proofFindings(change, spec, plan) {
  const names = new Set(scenariosOf(spec).map((s) => s.name));
  /** @type {Finding[]} */
  const out = [];
  for (const t of plan.tasks) {
    if (!("proof" in t.fields)) continue;
    const proof = parseProof(t.fields.proof);
    if (proof.kind === "scenario" && !names.has(proof.target)) {
      out.push(missingScenarioFinding(t, proof));
    } else if (proof.kind === "path" && !fs.existsSync(path.join(change.root, proof.target))) {
      out.push(
        finding(
          PLAN,
          t.line,
          `path "${proof.target}" does not exist from the repo root`,
          "create the file or fix the path",
        ),
      );
    }
  }
  return out;
}

/** @param {Spec} spec @param {Plan} plan @returns {Finding[]} */
function strictFindings(spec, plan) {
  const proven = new Set(plan.tasks.map((t) => parseProof(t.fields.proof ?? "").target));
  /** @type {Finding[]} */
  const out = [];
  for (const r of spec.requirements) {
    if (!r.scenarios.some((s) => proven.has(s.name))) {
      out.push(
        finding(
          SPEC,
          r.line,
          `requirement "${r.name}" is not the proof of any task`,
          "add a task whose proof names one of its scenarios",
        ),
      );
    }
  }
  return [...out, ...widthFindings(SPEC, spec.lines), ...widthFindings(PLAN, plan.lines)];
}

/** @param {string} file @param {Line[]} lines */
function widthFindings(file, lines) {
  return lines
    .filter((line) => line.text.length >= MAX_COLUMNS)
    .map((line) =>
      finding(
        file,
        line.n,
        `line is ${line.text.length} columns`,
        `keep lines under ${MAX_COLUMNS}`,
      ),
    );
}

/** @param {string} id */
function relChange(id) {
  return path.join(CHANGES_DIR, id);
}

/** @param {string} name */
function relArchived(name) {
  return path.join(CHANGES_DIR, ARCHIVE_DIR, name);
}

/** @param {Change} change @param {string} file */
function relFile(change, file) {
  return path.join(relChange(change.id), file);
}

/** @param {string} file */
function missingFileFinding(file) {
  return finding(file, 1, "file is missing", `add ${file}`);
}

/** @param {Change} change @param {Finding} f */
function renderFinding(change, f) {
  return `${relFile(change, f.file)}:${f.line}: ${f.what} — ${f.fix}`;
}

/** @param {Change} change @param {boolean} strict @returns {Finding[]} */
function validateChange(change, strict) {
  const missing = [SPEC, PLAN].filter((file) => !fs.existsSync(path.join(change.dir, file)));
  if (missing.length) return missing.map(missingFileFinding);
  const spec = parseSpec(readLines(path.join(change.dir, SPEC)));
  const plan = parsePlan(readLines(path.join(change.dir, PLAN)));
  const out = [
    ...specFindings(spec, change.id),
    ...planFindings(plan, change.id),
    ...proofFindings(change, spec, plan),
    ...(strict ? strictFindings(spec, plan) : []),
  ];
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** @param {string} cwd */
function locateRoot(cwd) {
  let dir = cwd;
  for (;;) {
    if (isDir(path.join(dir, CHANGES_DIR))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** @param {string} cwd */
function requireRoot(cwd) {
  const root = locateRoot(cwd);
  if (!root) {
    throw new CliError(`${CHANGES_DIR}: not found in ${cwd} or above — run onlyplans init`);
  }
  return root;
}

/** @param {string} root */
function changesDir(root) {
  return path.join(root, CHANGES_DIR);
}

/** @param {string} root */
function archiveDir(root) {
  return path.join(changesDir(root), ARCHIVE_DIR);
}

/** @param {string} dir */
function subdirs(dir) {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** @param {string} root */
function activeIds(root) {
  return subdirs(changesDir(root)).filter((name) => name !== ARCHIVE_DIR);
}

/** @param {string} root @param {string} id */
function archivedEntry(root, id) {
  return subdirs(archiveDir(root)).find((name) => ARCHIVED.exec(name)?.[2] === id);
}

/** @param {string} root @param {string} id @returns {Change} */
function requireChange(root, id) {
  const dir = path.join(changesDir(root), id);
  if (id === ARCHIVE_DIR || !isDir(dir)) {
    throw new CliError(`${relChange(id)}: no such change — run onlyplans list`);
  }
  return { root, id, dir };
}

/**
 * @template T
 * @param {Change} change @param {string} file @param {(lines: Line[]) => T} parse
 */
function readChangeFile(change, file, parse) {
  const full = path.join(change.dir, file);
  if (!fs.existsSync(full)) {
    throw new CliError(renderFinding(change, missingFileFinding(file)));
  }
  return parse(readLines(full));
}

/** @param {Change} change */
function readPlan(change) {
  return readChangeFile(change, PLAN, parsePlan);
}

/** @param {Change} change */
function readSpec(change) {
  return readChangeFile(change, SPEC, parseSpec);
}

/**
 * Accepts an id or a path to the change folder, such as docs/changes/<id>/, and returns the id.
 * @param {string} cwd @param {string} root @param {string} arg
 */
function idFromArg(cwd, root, arg) {
  if (!arg.includes("/") && !arg.includes(path.sep)) return arg;
  const rel = path.relative(changesDir(root), realPath(path.resolve(cwd, arg)));
  if (!rel || rel.startsWith("..") || rel.includes(path.sep)) {
    throw new CliError(`${arg}: not a change id or a path under ${CHANGES_DIR}`, EXIT.usage);
  }
  return rel;
}

/** @param {Ctx} ctx */
function changeFromCtx(ctx) {
  const root = requireRoot(ctx.cwd);
  return requireChange(root, idFromArg(ctx.cwd, root, ctx.positional[0]));
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
  for (const dir of [changesDir(ctx.cwd), archiveDir(ctx.cwd)]) {
    fs.mkdirSync(dir, { recursive: true });
    const keep = path.join(dir, ".gitkeep");
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, "");
    print(path.relative(ctx.cwd, dir) + path.sep);
  }
  if (ctx.flags["no-agents"]) return;
  const outcome = upsertBlock(path.join(ctx.cwd, AGENTS_FILE), AGENTS_MARKERS, AGENTS_BLOCK);
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
  print(relChange(id) + path.sep);
}

/** @param {string} root @param {string} id */
function taskCounts(root, id) {
  const file = path.join(changesDir(root), id, PLAN);
  const tasks = fs.existsSync(file) ? parsePlan(readLines(file)).tasks : [];
  return { id, total: tasks.length, done: tasks.filter((t) => t.done).length };
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
    const rows = plan.tasks.map(({ id, text, done, fields }) => ({ id, text, done, fields }));
    print(JSON.stringify(rows, null, 2));
  } else {
    plan.tasks.forEach((t) => print(t.raw));
  }
}

/** @param {Ctx} ctx */
function criteria(ctx) {
  const taskId = ctx.positional[1];
  const change = changeFromCtx(ctx);
  const plan = readPlan(change);
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new CliError(
      `${relFile(change, PLAN)}: no task ${taskId}` + ` — run onlyplans tasks ${change.id}`,
    );
  }
  if (!("proof" in task.fields)) {
    throw new CliError(
      `${relFile(change, PLAN)}:${task.line}: task ${taskId} has no proof` +
        ' — append " — proof: <Scenario name>"',
    );
  }
  const proof = parseProof(task.fields.proof);
  if (proof.kind === "path") return print(proof.raw);
  const scenario = scenariosOf(readSpec(change)).find((s) => s.name === proof.target);
  if (!scenario) throw new CliError(renderFinding(change, missingScenarioFinding(task, proof)));
  print(scenario.block.join("\n"));
}

/** @param {Ctx} ctx */
function validate(ctx) {
  const change = changeFromCtx(ctx);
  const findings = validateChange(change, Boolean(ctx.flags.strict));
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
  print(relArchived(targetName) + path.sep);
}

/** @param {string | boolean | undefined} shell @returns {keyof SHELLS} */
function requireShell(shell) {
  if (typeof shell === "string" && shell in SHELLS) return /** @type {keyof SHELLS} */ (shell);
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

/** @param {keyof SHELLS} shell */
function profilePath(shell) {
  const home = os.homedir();
  if (shell === "zsh") return path.join(process.env.ZDOTDIR || home, ".zshrc");
  if (shell === "bash") {
    return path.join(home, process.platform === "darwin" ? ".bash_profile" : ".bashrc");
  }
  return powershellProfile();
}

/**
 * Writes `body` between the markers in `file`, replacing an earlier block or appending a new one.
 * Everything outside the markers is left as it was.
 * @param {string} file @param {string[]} markers @param {string} body
 * @returns {"added" | "updated" | "unchanged"}
 */
function upsertBlock(file, [begin, end], body) {
  const block = `${begin}\n${body}\n${end}`;
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const start = existing.indexOf(begin);
  const stop = existing.indexOf(end, start);
  if (start >= 0 && stop >= 0) {
    const current = existing.slice(start, stop + end.length);
    if (current === block) return "unchanged";
    fs.writeFileSync(file, existing.slice(0, start) + block + existing.slice(stop + end.length));
    return "updated";
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const separator = !existing ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  fs.appendFileSync(file, `${separator}${block}\n`);
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
 * What Tab may offer: candidates, or a hint for the user when there are none.
 * @typedef {{ list: string[], hint: string }} Completion
 */

/** @param {string[]} list @param {string} [hint] @returns {Completion} */
function completion(list, hint = "") {
  return { list, hint };
}

/** @param {string} cwd @returns {Completion} */
function idCompletion(cwd) {
  const root = locateRoot(cwd);
  if (!root) {
    return completion([], "onlyplans: no docs/changes/ above here — run onlyplans init");
  }
  const ids = activeIds(root);
  const hint = ids.length
    ? ""
    : "onlyplans: no active changes — run onlyplans new <id> or onlyplans --help for more";
  return completion(ids, hint);
}

/** @param {string} cwd @param {string[]} before @returns {Completion} */
function taskIdCompletion(cwd, [arg]) {
  try {
    const plan = readPlan(changeFromCtx({ cwd, positional: [arg], flags: {} }));
    const ids = plan.tasks.map((t) => t.id);
    return completion(ids, ids.length ? "" : `onlyplans: no tasks in ${arg}`);
  } catch (error) {
    if (error instanceof CliError) return completion([], error.message);
    throw error;
  }
}

/** @type {Record<string, () => Completion>} */
const FLAG_VALUES = {
  tabcomplete: () => completion(Object.keys(SHELLS)),
  date: () => completion([], "onlyplans: --date takes YYYY-MM-DD"),
};

/**
 * @typedef {{ arity: number, flags: string[], run: (ctx: Ctx) => number | void,
 *             positional?: Array<(cwd: string, before: string[]) => Completion> }} Command
 */

/** @type {Record<string, Command>} */
const COMMANDS = {
  init: { arity: 0, flags: ["no-agents"], run: init },
  new: { arity: 1, flags: [], run: create },
  list: { arity: 0, flags: ["json"], run: list },
  tasks: { arity: 1, flags: ["json"], run: tasks, positional: [idCompletion] },
  criteria: { arity: 2, flags: [], run: criteria, positional: [idCompletion, taskIdCompletion] },
  validate: { arity: 1, flags: ["strict"], run: validate, positional: [idCompletion] },
  archive: { arity: 1, flags: ["date", "force"], run: archive, positional: [idCompletion] },
  setup: { arity: 0, flags: ["tabcomplete"], run: setup },
};

/** Splits the words before the cursor into positionals and the flags already used.
 * @param {string[]} before */
function typedSoFar(before) {
  /** @type {string[]} */
  const positionals = [];
  /** @type {Set<string>} */
  const used = new Set();
  for (let i = 0; i < before.length; i++) {
    const name = before[i].startsWith("--") ? before[i].slice(2) : null;
    if (name === null) positionals.push(before[i]);
    else {
      used.add(name);
      if (VALUE_FLAGS.has(name)) i++;
    }
  }
  return { positionals, used };
}

/** @param {Command} command @param {Set<string>} used */
function flagCompletion(command, used) {
  return completion(command.flags.filter((f) => !used.has(f)).map((f) => `--${f}`));
}

/**
 * The words typed so far. The last one is the word under the cursor, and may be empty.
 * @param {string} cwd @param {string[]} words @returns {Completion}
 */
function candidates(cwd, words) {
  const [name, ...args] = words;
  if (words.length <= 1) return completion([...Object.keys(COMMANDS), "--help"]);
  const command = COMMANDS[name];
  if (!command) return completion([], `onlyplans: unknown command ${name}`);
  const before = args.slice(0, -1);
  const current = args[args.length - 1];
  const previous = before[before.length - 1];
  const valueOf = previous?.startsWith("--") ? FLAG_VALUES[previous.slice(2)] : undefined;
  if (valueOf) return valueOf();
  const { positionals, used } = typedSoFar(before);
  if (current.startsWith("-")) return flagCompletion(command, used);
  const next = command.positional?.[positionals.length];
  if (next) return next(cwd, positionals);
  if (positionals.length < command.arity) return completion([]);
  return flagCompletion(command, used);
}

/** @param {string} cwd @param {string[]} argv */
function complete(cwd, argv) {
  const words = argv.length ? argv : [""];
  const current = words[words.length - 1];
  const { list, hint } = candidates(cwd, words);
  const matches = list.filter((c) => c.startsWith(current));
  matches.forEach(print);
  const noMatch = list.length ? `onlyplans: nothing matches "${current}"` : hint;
  if (!matches.length && noMatch) process.stderr.write(`${noMatch}\n`);
  return EXIT.ok;
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const name = arg.startsWith("--") ? arg.slice(2) : null;
    if (name && VALUE_FLAGS.has(name)) flags[name] = argv[++i] ?? "";
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
  if (argv[0] === COMPLETE) return complete(process.cwd(), argv.slice(1));
  const {
    positional: [name, ...positional],
    flags,
  } = parseArgs(argv);
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

process.exitCode = main(process.argv.slice(2));
