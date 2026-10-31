# json-output — JSON output for validate and criteria, path in list

## Why

Hooks and CI steps consume `validate`, `criteria`, and `list` by scraping their text. Each
already has the data as objects; printing it as JSON removes the scrapers. Text output of every
command stays byte-identical.

## Requirements

### Requirement: validate --json

`validate <id> [--strict] --json` SHALL print the findings as a JSON array of objects with
`file`, `line`, `what`, and `fix`, where `file` is the repo-relative path the text mode prints
before the colon. The exit code SHALL be the same as text mode.

#### Scenario: Clean change prints an empty array

- GIVEN a change that passes `validate --strict`
- WHEN `validate <id> --strict --json` runs
- THEN stdout is `[]` and the exit code is 0

#### Scenario: Findings carry the rendered path

- GIVEN a change whose plan names a scenario that does not exist
- WHEN `validate <id> --json` runs
- THEN stdout is an array whose finding has `file` equal to `docs/changes/<id>/plan.md`, the same
  `line` and `what` the text mode prints, and the exit code is 1

#### Scenario: Strict findings serialize too

- GIVEN a change with a scenario no task proves
- WHEN `validate <id> --strict --json` runs
- THEN the array holds a finding whose `file` ends in `spec.md`, while `validate <id> --json`
  prints `[]`

### Requirement: criteria --json

`criteria <id> <task> --json` SHALL print one JSON object. For a scenario proof it carries
`kind` `scenario`, `name`, `file`, `line`, `given`, `when`, `then`, and `block`. For a path proof
it carries `kind` `path`, `path`, and `raw`. Errors SHALL be unchanged from text mode.

#### Scenario: Scenario proof as JSON

- GIVEN a task whose proof names a scenario
- WHEN `criteria <id> <task> --json` runs
- THEN the object has `kind` `scenario`, the scenario's `name` and `line`, `file` equal to
  `docs/changes/<id>/spec.md`, `given`, `when`, and `then` as the text after each keyword, and
  `block` equal to the text mode's output without its trailing newline

#### Scenario: Path proof as JSON

- GIVEN a task whose proof is `test/login.test.js::rejects`
- WHEN `criteria <id> <task> --json` runs
- THEN stdout is an object with `kind` `path`, `path` `test/login.test.js`, and `raw`
  `test/login.test.js::rejects`

#### Scenario: Missing task fails the same way

- GIVEN a task id that does not exist
- WHEN `criteria <id> <task> --json` runs
- THEN stderr carries the existing `no task` message, stdout is empty, and the exit code is 1

### Requirement: list --json carries the path

Each row of `list --json` SHALL carry `path`, the repo-relative folder of the change with forward
slashes and no trailing slash. Text mode SHALL be unchanged.

#### Scenario: Row has a path

- GIVEN an active change `<id>`
- WHEN `list --json` runs
- THEN its row has `path` equal to `docs/changes/<id>`

### Requirement: Text output is unchanged

The text mode of `validate`, `criteria`, and `list` SHALL print exactly what it printed before.

#### Scenario: Text modes unchanged

- GIVEN the passing fixture
- WHEN `validate`, `criteria <id> 1.2`, and `list` run without `--json`
- THEN each prints the same stdout as before this change

### Requirement: Flags are discoverable

Tab completion SHALL offer `--json` on `validate` and `criteria`, and `--help` SHALL show it.

#### Scenario: Completion offers the flag

- GIVEN a repo with an active change
- WHEN `__complete validate <id> --` and `__complete criteria <id> <task> --` run
- THEN each offers `--json`

#### Scenario: Help shows the flag

- GIVEN any directory
- WHEN `onlyplans --help` runs
- THEN the usage lines for `validate` and `criteria` include `[--json]`
