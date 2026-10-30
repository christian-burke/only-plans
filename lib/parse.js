// @ts-check
"use strict";

const fs = require("node:fs");

const SPEC = "spec.md";
const PLAN = "plan.md";

const TITLE = /^# (\S+) — (.+)$/;
const HEADING = /^(#{1,6}) (.*)$/;
const STEP = /^- (GIVEN|WHEN|THEN)\b/;
const TASK = /^- \[([ xX])\] (\d+(?:\.\d+)*) (.+)$/;
const FIELD = /^([A-Za-z][\w-]*):\s*(.*)$/;
/** Only a dash followed by `key:` starts a field, so a dash in the task text stays prose. */
const FIELD_SEPARATOR = /\s+—\s+(?=[A-Za-z][\w-]*:)/;

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
 */

/**
 * Accepts LF or CRLF, so a checkout on Windows parses the same.
 * @param {string} file @returns {Line[]}
 */
function readLines(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
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
    const [, key, value] = /** @type {RegExpExecArray} */ (FIELD.exec(part));
    fields[key] = value;
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

module.exports = {
  SPEC,
  PLAN,
  readLines,
  parseSpec,
  parsePlan,
  parseProof,
  scenariosOf,
  compareIds,
};
