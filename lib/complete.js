// @ts-check
"use strict";

const { CliError, EXIT, locateRoot, activeIds, readPlan, changeFromCtx } = require("./repo");

/** @typedef {import("./repo").Ctx} Ctx */

const COMPLETE = "__complete";
const VALUE_FLAGS = new Set(["date", "tabcomplete"]);

/** @param {string} text */
function print(text) {
  process.stdout.write(`${text}\n`);
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

/**
 * @typedef {{ arity: number, flags: string[], run: (ctx: Ctx) => number | void,
 *             positional?: Array<(cwd: string, before: string[]) => Completion> }} Command
 */

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
 * @param {Record<string, Command>} commands
 * @param {Record<string, () => Completion>} flagValues
 */
function candidates(cwd, words, commands, flagValues) {
  const [name, ...args] = words;
  if (words.length <= 1) return completion([...Object.keys(commands), "--help", "--version"]);
  const command = commands[name];
  if (!command) return completion([], `onlyplans: unknown command ${name}`);
  const before = args.slice(0, -1);
  const current = args[args.length - 1];
  const previous = before[before.length - 1];
  const valueOf = previous?.startsWith("--") ? flagValues[previous.slice(2)] : undefined;
  if (valueOf) return valueOf();
  const { positionals, used } = typedSoFar(before);
  if (current.startsWith("-")) return flagCompletion(command, used);
  const next = command.positional?.[positionals.length];
  if (next) return next(cwd, positionals);
  if (positionals.length < command.arity) return completion([]);
  return flagCompletion(command, used);
}

/**
 * @param {string} cwd @param {string[]} argv
 * @param {Record<string, Command>} commands
 * @param {Record<string, () => Completion>} flagValues
 */
function complete(cwd, argv, commands, flagValues) {
  const words = argv.length ? argv : [""];
  const current = words[words.length - 1];
  const { list, hint } = candidates(cwd, words, commands, flagValues);
  const matches = list.filter((c) => c.startsWith(current));
  matches.forEach(print);
  const noMatch = list.length ? `onlyplans: nothing matches "${current}"` : hint;
  if (!matches.length && noMatch) process.stderr.write(`${noMatch}\n`);
  return EXIT.ok;
}

module.exports = { COMPLETE, VALUE_FLAGS, completion, idCompletion, taskIdCompletion, complete };
