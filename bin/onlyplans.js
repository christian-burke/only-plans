#!/usr/bin/env node
// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CHANGES_DIR = path.join('docs', 'changes');
const ARCHIVE_DIR = 'archive';
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const SPEC = 'spec.md';
const PLAN = 'plan.md';
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
const STEP_ORDER = 'GIVEN,WHEN,THEN';

const USAGE = `usage: onlyplans <command> [args]

  init                                       create docs/changes/ and its archive/
  new <id>                                   create a change from the templates
  list [--json]                              active changes with task counts
  tasks <id> [--json]                        the parsed task lines of a change
  criteria <id> <task>                       the scenario a task's proof names
  validate <id> [--strict]                   check both files, print PASS or findings
  archive <id> [--date YYYY-MM-DD] [--force] move a finished change to the archive`;

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

/** @param {string} file */
function isDir(file) {
  return fs.existsSync(file) && fs.statSync(file).isDirectory();
}

/** @param {string} file @returns {Line[]} */
function readLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map((text, i) => ({ n: i + 1, text }));
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
      const seen = spec.sections.includes('Requirements');
      spec.sections.push(h.text);
      inRequirements = h.text === 'Requirements';
      if (seen) spec.stray.push(line);
      continue;
    }
    if (!inRequirements) continue;
    if (h && h.level === 3 && h.text.startsWith('Requirement: ')) {
      requirement = { name: h.text.slice(13).trim(), line: line.n, text: '', scenarios: [] };
      spec.requirements.push(requirement);
    } else if (h && h.level === 4 && h.text.startsWith('Scenario: ') && requirement) {
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
  return { id: m[2], text: text.trim(), done: m[1] !== ' ', fields, line: line.n, raw: line.text };
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
      inTasks = h.text === 'Tasks';
      continue;
    }
    if (!inTasks || !line.text.startsWith('- [')) continue;
    const task = parseTask(line);
    if (task) plan.tasks.push(task);
    else plan.malformed.push(line);
  }
  return plan;
}

/** @param {string} raw @returns {Proof} */
function parseProof(raw) {
  const isPath = raw.includes('/') || raw.includes('::');
  return { kind: isPath ? 'path' : 'scenario', target: isPath ? raw.split('::')[0] : raw, raw };
}

/** @param {Spec} spec */
function scenariosOf(spec) {
  return spec.requirements.flatMap((r) => r.scenarios);
}

/** @param {string} id */
function idParts(id) {
  return id.split('.').map(Number);
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
  if (!title) return [finding(file, 1, 'missing title', `write "${want}" on the first line`)];
  if (title.id !== id) {
    return [finding(file, title.line, `title id "${title.id}" does not match folder "${id}"`,
      `write "${want}"`)];
  }
  return [];
}

/** @param {string[]} present @param {string[]} wanted @param {string} file */
function sectionFindings(present, wanted, file) {
  return wanted.filter((s) => !present.includes(s))
    .map((s) => finding(file, 1, `missing section "## ${s}"`, `add "## ${s}"`));
}

/** @param {Spec} spec @param {string} id @returns {Finding[]} */
function specFindings(spec, id) {
  const out = titleFindings(spec.title, id, SPEC, '<title>');
  out.push(...sectionFindings(spec.sections, ['Why', 'Requirements'], SPEC));
  /** @type {Set<string>} */
  const names = new Set();
  for (const r of spec.requirements) {
    if (!r.scenarios.length) {
      out.push(finding(SPEC, r.line, `requirement "${r.name}" has no scenario`,
        'add a "#### Scenario:" block under it'));
    }
    if (!/\bSHALL\b/.test(r.text)) {
      out.push(finding(SPEC, r.line, `requirement "${r.name}" does not say SHALL`,
        'write "The system SHALL <behavior>."'));
    }
    for (const s of r.scenarios) {
      if (s.steps.join(',') !== STEP_ORDER) {
        out.push(finding(SPEC, s.line, `scenario "${s.name}" lacks GIVEN, WHEN, THEN in order`,
          'write one "- GIVEN", one "- WHEN", then one "- THEN" line'));
      }
      if (names.has(s.name)) {
        out.push(finding(SPEC, s.line, `duplicate scenario name "${s.name}"`, 'rename it'));
      }
      names.add(s.name);
    }
  }
  for (const line of firstOfEachBlock(spec.stray)) {
    out.push(finding(SPEC, line.n, 'content after "## Requirements" is not a requirement block',
      'move it above "## Requirements" or into a "### Requirement:" block'));
  }
  return out;
}

/** @param {Plan} plan @param {string} id @returns {Finding[]} */
function planFindings(plan, id) {
  const out = titleFindings(plan.title, id, PLAN, 'Plan');
  if (plan.title && plan.title.id === id && plan.title.title !== 'Plan') {
    out.push(finding(PLAN, plan.title.line, `title is "${plan.title.title}"`,
      `write "# ${id} — Plan"`));
  }
  out.push(...sectionFindings(plan.sections, ['Tasks'], PLAN));
  for (const line of plan.malformed) {
    out.push(finding(PLAN, line.n, 'task line does not match the grammar',
      'write "- [ ] <n.n> <task> — proof: <Scenario name>"'));
  }
  /** @type {Set<string>} */
  const ids = new Set();
  let previous = '';
  for (const t of plan.tasks) {
    if (!('proof' in t.fields)) {
      out.push(finding(PLAN, t.line, `task ${t.id} has no proof`,
        'append " — proof: <Scenario name>" or " — proof: <path>"'));
    }
    if (ids.has(t.id)) out.push(finding(PLAN, t.line, `duplicate task id ${t.id}`, 'renumber it'));
    else if (previous && compareIds(previous, t.id) >= 0) {
      out.push(finding(PLAN, t.line, `task id ${t.id} does not ascend from ${previous}`,
        'renumber the tasks in order'));
    }
    ids.add(t.id);
    previous = t.id;
  }
  return out;
}

/** @param {Task} task @param {Proof} proof */
function missingScenarioFinding(task, proof) {
  const hint = proof.target.includes('.') && !proof.target.includes(' ')
    ? `; for a root file write ./${proof.target}` : '';
  return finding(PLAN, task.line, `no scenario named "${proof.target}"${hint}`,
    'name a scenario from spec.md');
}

/** @param {Change} change @param {Spec} spec @param {Plan} plan @returns {Finding[]} */
function proofFindings(change, spec, plan) {
  const names = new Set(scenariosOf(spec).map((s) => s.name));
  /** @type {Finding[]} */
  const out = [];
  for (const t of plan.tasks) {
    if (!('proof' in t.fields)) continue;
    const proof = parseProof(t.fields.proof);
    if (proof.kind === 'scenario' && !names.has(proof.target)) {
      out.push(missingScenarioFinding(t, proof));
    } else if (proof.kind === 'path' && !fs.existsSync(path.join(change.root, proof.target))) {
      out.push(finding(PLAN, t.line, `path "${proof.target}" does not exist from the repo root`,
        'create the file or fix the path'));
    }
  }
  return out;
}

/** @param {Spec} spec @param {Plan} plan @returns {Finding[]} */
function strictFindings(spec, plan) {
  const proven = new Set(plan.tasks.map((t) => parseProof(t.fields.proof ?? '').target));
  /** @type {Finding[]} */
  const out = [];
  for (const r of spec.requirements) {
    if (!r.scenarios.some((s) => proven.has(s.name))) {
      out.push(finding(SPEC, r.line, `requirement "${r.name}" is not the proof of any task`,
        'add a task whose proof names one of its scenarios'));
    }
  }
  return [...out, ...widthFindings(SPEC, spec.lines), ...widthFindings(PLAN, plan.lines)];
}

/** @param {string} file @param {Line[]} lines */
function widthFindings(file, lines) {
  return lines.filter((line) => line.text.length >= MAX_COLUMNS)
    .map((line) => finding(file, line.n, `line is ${line.text.length} columns`,
      `keep lines under ${MAX_COLUMNS}`));
}

/** @param {Change} change @param {string} file */
function relFile(change, file) {
  return path.join(CHANGES_DIR, change.id, file);
}

/** @param {Change} change @param {Finding} f */
function renderFinding(change, f) {
  return `${relFile(change, f.file)}:${f.line}: ${f.what} — ${f.fix}`;
}

/** @param {Change} change @param {boolean} strict @returns {Finding[]} */
function validateChange(change, strict) {
  const missing = [SPEC, PLAN].filter((file) => !fs.existsSync(path.join(change.dir, file)));
  if (missing.length) {
    return missing.map((file) => finding(file, 1, 'file is missing', `add ${file}`));
  }
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
  if (!root) throw new CliError(`${CHANGES_DIR}: not found in ${cwd} or above — run onlyplans init`);
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
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
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
    throw new CliError(`${path.join(CHANGES_DIR, id)}: no such change — run onlyplans list`);
  }
  return { root, id, dir };
}

/** @param {Change} change */
function readPlan(change) {
  const file = path.join(change.dir, PLAN);
  if (!fs.existsSync(file)) {
    throw new CliError(`${relFile(change, PLAN)}: file is missing — add ${PLAN}`);
  }
  return parsePlan(readLines(file));
}

/** @param {Change} change */
function readSpec(change) {
  const file = path.join(change.dir, SPEC);
  if (!fs.existsSync(file)) {
    throw new CliError(`${relFile(change, SPEC)}: file is missing — add ${SPEC}`);
  }
  return parseSpec(readLines(file));
}

function today() {
  const d = new Date();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {Ctx} ctx */
function init(ctx) {
  const own = locateRoot(ctx.cwd) === ctx.cwd;
  const above = own ? null : locateRoot(path.dirname(ctx.cwd));
  if (above) {
    throw new CliError(`${changesDir(above)}: a root already exists above ${ctx.cwd}`
      + ` — run onlyplans from ${above}`);
  }
  for (const dir of [changesDir(ctx.cwd), archiveDir(ctx.cwd)]) {
    fs.mkdirSync(dir, { recursive: true });
    const keep = path.join(dir, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
    print(path.relative(ctx.cwd, dir) + path.sep);
  }
}

/** @param {Ctx} ctx */
function create(ctx) {
  const [id] = ctx.positional;
  const root = requireRoot(ctx.cwd);
  if (!KEBAB.test(id) || id === ARCHIVE_DIR) {
    throw new CliError(`${id}: not a valid id — use lowercase letters, digits, and single dashes`,
      EXIT.usage);
  }
  const dir = path.join(changesDir(root), id);
  if (isDir(dir)) throw new CliError(`${path.join(CHANGES_DIR, id)}: already exists — pick another id`);
  const archived = archivedEntry(root, id);
  if (archived) {
    throw new CliError(`${path.join(CHANGES_DIR, ARCHIVE_DIR, archived)}: id already archived`
      + ' — pick another id');
  }
  fs.mkdirSync(dir, { recursive: true });
  const title = id.split('-').join(' ');
  for (const file of [SPEC, PLAN]) {
    const text = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
    fs.writeFileSync(path.join(dir, file), text.replaceAll('<id>', id).replace('<title>', title));
  }
  print(path.join(CHANGES_DIR, id) + path.sep);
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
  const change = requireChange(requireRoot(ctx.cwd), ctx.positional[0]);
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
  const [id, taskId] = ctx.positional;
  const change = requireChange(requireRoot(ctx.cwd), id);
  const plan = readPlan(change);
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new CliError(`${relFile(change, PLAN)}: no task ${taskId} — run onlyplans tasks ${id}`);
  }
  if (!('proof' in task.fields)) {
    throw new CliError(`${relFile(change, PLAN)}:${task.line}: task ${taskId} has no proof`
      + ' — append " — proof: <Scenario name>"');
  }
  const proof = parseProof(task.fields.proof);
  if (proof.kind === 'path') return print(proof.raw);
  const scenario = scenariosOf(readSpec(change)).find((s) => s.name === proof.target);
  if (!scenario) throw new CliError(renderFinding(change, missingScenarioFinding(task, proof)));
  print(scenario.block.join('\n'));
}

/** @param {Ctx} ctx */
function validate(ctx) {
  const change = requireChange(requireRoot(ctx.cwd), ctx.positional[0]);
  const findings = validateChange(change, Boolean(ctx.flags.strict));
  if (!findings.length) return print('PASS');
  findings.forEach((f) => print(renderFinding(change, f)));
  return EXIT.fail;
}

/** @param {Ctx} ctx */
function archive(ctx) {
  const change = requireChange(requireRoot(ctx.cwd), ctx.positional[0]);
  const date = typeof ctx.flags.date === 'string' ? ctx.flags.date : today();
  if (!DATE.test(date)) throw new CliError(`${date}: --date must be YYYY-MM-DD`, EXIT.usage);
  const unchecked = readPlan(change).tasks.filter((t) => !t.done);
  if (unchecked.length && !ctx.flags.force) {
    const ids = unchecked.map((t) => t.id).join(', ');
    throw new CliError(`${relFile(change, PLAN)}:${unchecked[0].line}: unchecked tasks ${ids}`
      + ' — check them or pass --force');
  }
  const targetName = `${date}-${change.id}`;
  const target = path.join(archiveDir(change.root), targetName);
  if (fs.existsSync(target)) {
    throw new CliError(`${path.join(CHANGES_DIR, ARCHIVE_DIR, targetName)}: already exists`
      + ' — pass a different --date');
  }
  fs.mkdirSync(archiveDir(change.root), { recursive: true });
  fs.renameSync(change.dir, target);
  print(path.join(CHANGES_DIR, ARCHIVE_DIR, targetName) + path.sep);
}

/** @type {Record<string, { arity: number, flags: string[], run: (ctx: Ctx) => number | void }>} */
const COMMANDS = {
  init: { arity: 0, flags: [], run: init },
  new: { arity: 1, flags: [], run: create },
  list: { arity: 0, flags: ['json'], run: list },
  tasks: { arity: 1, flags: ['json'], run: tasks },
  criteria: { arity: 2, flags: [], run: criteria },
  validate: { arity: 1, flags: ['strict'], run: validate },
  archive: { arity: 1, flags: ['date', 'force'], run: archive },
};

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--date') flags.date = argv[++i] ?? '';
    else if (arg.startsWith('--')) flags[arg.slice(2)] = true;
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
  const { positional: [name, ...positional], flags } = parseArgs(argv);
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
