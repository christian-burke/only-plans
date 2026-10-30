// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  SPEC,
  PLAN,
  readLines,
  parseSpec,
  parsePlan,
  parseProof,
  scenariosOf,
  compareIds,
} = require("./parse");
const { finding, missingFileFinding } = require("./repo");

/** @typedef {import("./parse").Line} Line */
/** @typedef {import("./parse").Title} Title */
/** @typedef {import("./parse").Spec} Spec */
/** @typedef {import("./parse").Task} Task */
/** @typedef {import("./parse").Plan} Plan */
/** @typedef {import("./parse").Proof} Proof */
/** @typedef {import("./repo").Change} Change */
/** @typedef {import("./repo").Finding} Finding */

const MAX_CHARS = 100;
const PLACEHOLDER = "<replace me>";

const STEP_ORDER = "GIVEN,WHEN,THEN";

/** @param {Line[]} lines Groups consecutive line numbers so one block yields one finding. */
function firstOfEachBlock(lines) {
  return lines.filter((line, i) => i === 0 || lines[i - 1].n !== line.n - 1);
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
    const orphans = r.scenarios.filter((s) => !proven.has(s.name));
    if (orphans.length === r.scenarios.length) {
      out.push(
        finding(
          SPEC,
          r.line,
          `requirement "${r.name}" is not the proof of any task`,
          "add a task whose proof names one of its scenarios",
        ),
      );
      continue;
    }
    for (const s of orphans) {
      out.push(
        finding(
          SPEC,
          s.line,
          `scenario "${s.name}" is not the proof of any task`,
          "add a task whose proof names it, or remove the scenario",
        ),
      );
    }
  }
  return [...out, ...lineFindings(SPEC, spec.lines), ...lineFindings(PLAN, plan.lines)];
}

/**
 * Line-level checks that strict mode applies to both files.
 * @type {Array<{ test: (text: string) => boolean, what: (text: string) => string, fix: string }>}
 */
const LINE_RULES = [
  {
    test: (text) => [...text].length > MAX_CHARS,
    what: (text) => `line is ${[...text].length} characters`,
    fix: `keep lines at or under ${MAX_CHARS} characters`,
  },
  {
    test: (text) => text.includes(PLACEHOLDER),
    what: () => "unresolved placeholder",
    fix: `replace or remove "${PLACEHOLDER}"`,
  },
];

/** @param {string} file @param {Line[]} lines */
function lineFindings(file, lines) {
  return lines.flatMap((line) =>
    LINE_RULES.filter((rule) => rule.test(line.text)).map((rule) =>
      finding(file, line.n, rule.what(line.text), rule.fix),
    ),
  );
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

module.exports = { validateChange, missingScenarioFinding };
