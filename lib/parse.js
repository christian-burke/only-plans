// @ts-check
"use strict";

const fs = require("node:fs");

const SPEC = "spec.md";
const PLAN = "plan.md";

const TITLE = /^# (\S+) — (.+)$/;
const HEADING = /^(#{1,6}) (.*)$/;
const STEP = /^- (GIVEN|WHEN|THEN)\b\s*(.*)$/;
const TASK = /^- \[([ xX])\] (\d+(?:\.\d+)*) (.+)$/;
/** Anything bullet-and-bracket shaped is a task attempt, so a near miss is reported. */
const TASK_CANDIDATE = /^\s*[-*+]\s*\[/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FIELD = /^([A-Za-z][\w-]*):\s*(.*)$/;
/** Only a dash followed by `key:` starts a field, so a dash in the task text stays prose. */
const FIELD_SEPARATOR = /\s+—\s+(?=[A-Za-z][\w-]*:)/;

/**
 * @typedef {{ n: number, text: string }} Line
 * @typedef {{ char: string, len: number, line: Line }} Fence
 * @typedef {{ id: string, title: string, line: number }} Title
 * @typedef {{ name: string, line: number, steps: string[], given: string | null,
 *             when: string | null, then: string | null, block: string[] }} Scenario
 * @typedef {{ name: string, line: number, text: string, scenarios: Scenario[] }} Requirement
 * @typedef {{ title: Title | null, sections: string[], requirements: Requirement[],
 *             stray: Line[], unclosedFence: Fence | null, lines: Line[] }} Spec
 * @typedef {{ id: string, text: string, done: boolean, fields: Record<string, string>,
 *             line: number, raw: string, section: { text: string, line: number } | null }} Task
 * @typedef {{ title: Title | null, sections: string[], tasks: Task[], malformed: Line[],
 *             unclosedFence: Fence | null, lines: Line[] }} Plan
 * @typedef {{ kind: 'scenario' | 'path', target: string, raw: string }} Proof
 */

/**
 * Accepts LF or CRLF, so a checkout on Windows parses the same.
 * @param {string} file @returns {Line[]}
 */
function readLines(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/^﻿/, "")
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

/**
 * CommonMark: a backtick fence's info string may not contain a backtick. A fence never nests, so
 * everything up to the matching closer is opaque.
 * @param {Line} line @returns {Fence | null}
 */
function fenceOpener(line) {
  const m = FENCE.exec(line.text);
  if (!m || (m[1][0] === "`" && m[2].includes("`"))) return null;
  return { char: m[1][0], len: m[1].length, line };
}

/** @param {Fence} fence @param {string} text */
function closesFence(fence, text) {
  const m = FENCE.exec(text);
  return Boolean(m) && m[1][0] === fence.char && m[1].length >= fence.len && !m[2].trim();
}

/** @param {string[]} block */
function trimTrailingBlank(block) {
  while (block.length && !block[block.length - 1].trim()) block.pop();
  return block;
}

/** @param {Line[]} lines @returns {Spec} */
function parseSpec(lines) {
  /** @type {Spec} */
  const spec = {
    title: firstTitle(lines),
    sections: [],
    requirements: [],
    stray: [],
    unclosedFence: null,
    lines,
  };
  let inRequirements = false;
  /** @type {Requirement | null} */
  let requirement = null;
  /** @type {Scenario | null} */
  let scenario = null;
  /** @type {"given" | "when" | "then" | null} The step whose value a wrapped line extends. */
  let open = null;
  /** @type {Fence | null} */
  let fence = null;
  for (const line of lines) {
    if (spec.title && line.n === spec.title.line) continue;
    const opener = fence ? null : fenceOpener(line);
    if (fence || opener) {
      if (opener) {
        fence = opener;
        open = null;
      } else if (fence && closesFence(fence, line.text)) fence = null;
      scenario?.block.push(line.text);
      continue;
    }
    const h = heading(line.text);
    if (h && h.level <= 4) scenario = null;
    if (h) open = null;
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
      scenario = {
        name: h.text.slice(10).trim(),
        line: line.n,
        steps: [],
        given: null,
        when: null,
        then: null,
        block: [line.text],
      };
      requirement.scenarios.push(scenario);
      open = null;
    } else if (scenario) {
      scenario.block.push(line.text);
      const step = STEP.exec(line.text);
      if (step) {
        scenario.steps.push(step[1]);
        const keyword = /** @type {"given" | "when" | "then"} */ (step[1].toLowerCase());
        // A repeated keyword sets nothing, so its wrapped lines have nothing to extend.
        open = scenario[keyword] === null ? keyword : null;
        scenario[keyword] ??= step[2].trim();
      } else if (!line.text.trim()) {
        open = null;
      } else if (open) {
        const text = line.text.trim();
        scenario[open] = scenario[open] ? `${scenario[open]} ${text}` : text;
      }
    } else if (requirement && line.text.trim()) {
      requirement.text += `${line.text.trim()} `;
    } else if (line.text.trim()) {
      spec.stray.push(line);
    }
  }
  spec.unclosedFence = fence;
  for (const r of spec.requirements) r.scenarios.forEach((s) => trimTrailingBlank(s.block));
  return spec;
}

/**
 * Markdown reads a non-blank line directly under a list item as part of it unless the line
 * starts a new block, so a wrapped task needs no indentation.
 * @param {string} text
 */
function continuesTask(text) {
  return Boolean(text.trim()) && !/^\s*[-*+]\s/.test(text) && !heading(text);
}

/**
 * Joins a task's physical lines into the one logical line the grammar reads.
 * @param {Line[]} lines
 */
function logicalText(lines) {
  return lines.map((line, i) => (i ? line.text.trim() : line.text)).join(" ");
}

/** @param {Line[]} lines The task line, then its continuations. @returns {Task | null} */
function parseTask(lines) {
  const m = TASK.exec(logicalText(lines));
  if (!m) return null;
  const [text, ...parts] = m[3].split(FIELD_SEPARATOR);
  /** @type {Record<string, string>} */
  const fields = {};
  for (const part of parts) {
    const [, key, value] = /** @type {RegExpExecArray} */ (FIELD.exec(part));
    fields[key] = value;
  }
  return {
    id: m[2],
    text: text.trim(),
    done: m[1] !== " ",
    fields,
    line: lines[0].n,
    raw: lines.map((line) => line.text).join("\n"),
    section: null,
  };
}

/** @param {Line[]} lines @returns {Plan} */
function parsePlan(lines) {
  /** @type {Plan} */
  const plan = {
    title: firstTitle(lines),
    sections: [],
    tasks: [],
    malformed: [],
    unclosedFence: null,
    lines,
  };
  let inTasks = false;
  /** @type {Task["section"]} */
  let section = null;
  /** @type {Line[]} The task line being read and the continuations seen so far. */
  let pending = [];
  const flush = () => {
    if (!pending.length) return;
    const task = parseTask(pending);
    if (task) {
      task.section = section;
      plan.tasks.push(task);
    } else plan.malformed.push(pending[0]);
    pending = [];
  };
  /** @type {Fence | null} */
  let fence = null;
  for (const line of lines) {
    if (plan.title && line.n === plan.title.line) continue;
    if (fence) {
      if (closesFence(fence, line.text)) fence = null;
      continue;
    }
    const opener = fenceOpener(line);
    if (opener) {
      flush();
      fence = opener;
      continue;
    }
    if (pending.length && continuesTask(line.text)) {
      pending.push(line);
      continue;
    }
    flush();
    const h = heading(line.text);
    if (h && h.level === 2) {
      plan.sections.push(h.text);
      inTasks = h.text === "Tasks";
      section = null;
      continue;
    }
    if (inTasks && h && h.level === 3) {
      section = { text: h.text, line: line.n };
      continue;
    }
    if (inTasks && TASK_CANDIDATE.test(line.text)) pending.push(line);
  }
  flush();
  plan.unclosedFence = fence;
  return plan;
}

/**
 * A name from the spec wins, so a scenario called `GET /login renders` is not taken for a path.
 * @param {string} raw @param {Set<string>} names Scenario names in the spec.
 * @returns {Proof}
 */
function parseProof(raw, names) {
  if (names.has(raw)) return { kind: "scenario", target: raw, raw };
  const isPath = raw.includes("/") || raw.includes("::");
  return { kind: isPath ? "path" : "scenario", target: isPath ? raw.split("::")[0] : raw, raw };
}

/** @param {Spec} spec */
function scenariosOf(spec) {
  return spec.requirements.flatMap((r) => r.scenarios);
}

/** @param {Spec} spec */
function scenarioNames(spec) {
  return new Set(scenariosOf(spec).map((s) => s.name));
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
  scenarioNames,
  compareIds,
};
