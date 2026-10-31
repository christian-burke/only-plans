# release-fixes — Review fixes before 0.2.1

## Why

A five-lens review of the repo before 0.2.1 found four places where the tool lies to its user on
realistic input, and three documentation lines that contradict the code. Each fix is small and
each makes a promise in the README true, so they ship with 0.2.1.

## Requirements

### Requirement: Task-like lines are never silently skipped

Under `## Tasks`, a line that starts with optional whitespace, a `-`, `*`, or `+` bullet, and `[`
SHALL be parsed as a task when it matches the grammar and SHALL be reported as malformed
otherwise.

#### Scenario: Indented task line is a finding

- GIVEN a plan with `  - [ ] 1.2.1 Nested — proof: Bad password` under `## Tasks`
- WHEN `validate <id>` runs
- THEN it reports that line as not matching the grammar and exits 1

#### Scenario: Star bullet is a finding

- GIVEN a plan with `* [ ] 1.3 Starred — proof: Bad password` under `## Tasks`
- WHEN `validate <id>` runs
- THEN it reports that line as not matching the grammar and exits 1

### Requirement: Filesystem errors are one line

An error that is not a finding or refusal, such as a permission or read error, SHALL print one
line on stderr naming the error code and path, with no stack trace, and SHALL exit 1.

#### Scenario: Read-only plan on done

- GIVEN a change whose `plan.md` is read-only
- WHEN `done <id> <task>` runs on an unchecked task
- THEN stderr is one line containing `EACCES` and the plan path, stdout is empty, and the exit
  code is 1

### Requirement: A byte order mark does not hide the title

`readLines` SHALL ignore a leading UTF-8 byte order mark when parsing, so a file that starts
with one validates like a file without it. `done` SHALL keep preserving it.

#### Scenario: BOM file validates

- GIVEN the passing fixture with a UTF-8 byte order mark prepended to both files
- WHEN `validate <id> --strict` runs
- THEN it prints `PASS`

### Requirement: An archive date must exist

`archive --date` SHALL refuse a date whose parts do not form a real calendar date, with the
existing usage error and exit 2.

#### Scenario: Impossible date refused

- GIVEN a change whose every task is checked
- WHEN `archive <id> --dry-run --date 2026-99-99` runs
- THEN stderr says `--date must be YYYY-MM-DD`, stdout is empty, and the exit code is 2

### Requirement: Documentation matches the parser

The README and `templates/agents.md` SHALL say that `[x]` and `[X]` both count as done, the
template SHALL tell agents that `archive` gates on task lines only, and step 3 of the template
SHALL point at `tasks --next`.

#### Scenario: Template says what the tool does

- GIVEN a fresh `init`
- WHEN the inserted section is read
- THEN it mentions `tasks <id> --next`, says `[x]` or `[X]` counts as done, and says `archive`
  checks the task lines
