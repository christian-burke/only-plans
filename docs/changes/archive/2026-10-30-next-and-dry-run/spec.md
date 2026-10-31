# next-and-dry-run — Sections in tasks, the next task, and a dry archive

## Why

A session-start hook wants "where the work is" in one command, a task brief wants the task's
enclosing section, and an archive flow wants to show the owner what would move before it moves.
Each exists today only as a scrape of text output. This is the last of three changes; it
releases 0.2.1.

## Requirements

### Requirement: Tasks carry their section

`tasks --json` rows SHALL carry `section`, the text of the nearest `###` heading above the task
inside `## Tasks`, and `section_line`, its line number. Both SHALL be `null` when no `###`
heading precedes the task. Any level-3 heading counts; the tool attaches no meaning to its text.
Text output SHALL be unchanged.

#### Scenario: Row has its section

- GIVEN a plan with `### Task 1: Login form` above tasks 1.1 and 1.2 and `### Task 2: Sessions`
  above 2.1 and 2.2
- WHEN `tasks <id> --json` runs
- THEN 1.1 and 1.2 carry `section` `Task 1: Login form` with the heading's line, and 2.1 and
  2.2 carry `Task 2: Sessions`

#### Scenario: No heading gives null

- GIVEN a plan with no `###` headings under `## Tasks`
- WHEN `tasks <id> --json` runs
- THEN every row has `section` `null` and `section_line` `null`

#### Scenario: Headings leave text alone

- GIVEN the plan with sections
- WHEN `validate <id> --strict` and `tasks <id>` run
- THEN validate prints `PASS` and `tasks` prints the same four raw lines as a plan without
  headings

### Requirement: The next task

`tasks <id> --next` SHALL print the first task in file order whose box is unchecked. In text
mode it SHALL print that task's raw line; with `--json` it SHALL print that one row object, not
an array. When every task is checked or there are none, text mode SHALL print
`all tasks checked` and JSON mode SHALL print `null`, both with exit 0.

#### Scenario: Next unchecked task

- GIVEN a plan whose first unchecked task is 1.2
- WHEN `tasks <id> --next` and `tasks <id> --next --json` run
- THEN text mode prints the raw line of 1.2 and JSON mode prints one object with `id` `1.2`

#### Scenario: Nothing left

- GIVEN a plan whose every task is checked
- WHEN `tasks <id> --next` and `tasks <id> --next --json` run
- THEN text mode prints `all tasks checked`, JSON mode prints `null`, and both exit 0

### Requirement: A dry archive

`archive <id> --dry-run` SHALL run every check the real command runs and SHALL change nothing on
disk, including not creating `docs/changes/archive/`. It SHALL print
`would move docs/changes/<id>/ to docs/changes/archive/<date>-<id>/` on stdout before any
refusal, and SHALL exit with the code the real command would.

#### Scenario: Dry run succeeds

- GIVEN a change whose every task is checked
- WHEN `archive <id> --dry-run --date 2026-01-01` runs
- THEN stdout is the `would move` line, the exit code is 0, and nothing on disk changed

#### Scenario: Dry run refuses

- GIVEN a change with unchecked tasks
- WHEN `archive <id> --dry-run` runs
- THEN stdout is the `would move` line, stderr is the existing unchecked refusal naming the
  tasks, the exit code is 1, and nothing on disk changed

#### Scenario: Dry run hits a target

- GIVEN a change whose archive target folder already exists for the given date
- WHEN `archive <id> --dry-run --date <date>` runs
- THEN stderr is the existing `already exists` refusal and the exit code is 1

### Requirement: Flags are discoverable

Tab completion SHALL offer `--next` on `tasks` and `--dry-run` on `archive`, and `--help` SHALL
show both.

#### Scenario: Flags are shown

- GIVEN a repo with an active change
- WHEN `__complete tasks <id> --`, `__complete archive <id> --`, and `--help` run
- THEN completion offers `--next` and `--dry-run` respectively, and the usage lines for `tasks`
  and `archive` include them

### Requirement: Release 0.2.1

The package SHALL be at version 0.2.1 and the changelog's `Unreleased` heading SHALL become
`0.2.1`, with this change's entries added.

#### Scenario: Version and changelog agree

- GIVEN the repo after this change
- WHEN `onlyplans --version` runs and `CHANGELOG.md` is read
- THEN the version is `0.2.1` and the first heading after the title is `## 0.2.1`
