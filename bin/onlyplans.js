#!/usr/bin/env node
// @ts-check
'use strict';

const USAGE = `usage: onlyplans <command> [args]

  init                                      create docs/changes/ and its archive/
  new <id>                                  create a change from the templates
  list [--json]                             active changes with task counts
  tasks <id> [--json]                       the parsed task lines of a change
  criteria <id> <task>                      the scenario a task's proof names
  validate <id> [--strict]                  check both files, print PASS or findings
  archive <id> [--date YYYY-MM-DD] [--force] move a finished change to the archive`;

const EXIT = { ok: 0, fail: 1, usage: 2 };

/** @param {string} message */
function usageError(message) {
  process.stderr.write(`${message}\n${USAGE}\n`);
  return EXIT.usage;
}

/** @param {string[]} argv */
function main(argv) {
  const [command] = argv;
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(`${USAGE}\n`);
    return EXIT.ok;
  }
  return usageError(`unknown command: ${command}`);
}

process.exitCode = main(process.argv.slice(2));
