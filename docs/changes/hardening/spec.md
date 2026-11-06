# hardening — Parser and done hardening for 0.2.2

## Why

The pre-0.2.1 review found inputs the parser reads wrongly and two places the tool misbehaves
outside a clean checkout: parallel `done` runs lose checks, fenced code blocks are parsed as
content, a few proofs resolve to the wrong thing, a nested repo picks up its parent's
`docs/changes/`, and a mis-cased id is accepted on case-insensitive filesystems. PR #13 also
reverted three lines of the AGENTS template that 0.2.1 had fixed. This change ships as 0.2.2.

## Requirements

### Requirement: Concurrent checks all land

`done` SHALL write `plan.md` through a temporary file in the same folder renamed over the
original, SHALL re-read the file immediately before writing, and after writing SHALL verify its
task is checked, retrying from a fresh read a bounded number of times when it is not.

#### Scenario: Parallel done runs keep every check

- GIVEN a plan with three unchecked tasks
- WHEN three `done` processes run at once, one per task
- THEN every process exits 0 and afterwards all three tasks read `[x]`

### Requirement: Fenced code blocks are not content

Both parsers SHALL treat lines between a fence opener (three or more backticks or tildes at the
start of a line) and its matching closer as opaque: no heading, task line, requirement, or
scenario step is read from them. Scenario blocks SHALL still include fenced lines verbatim.

#### Scenario: Fenced task line is not a task

- GIVEN a plan whose `## Notes` or `## Tasks` holds a fenced example `- [ ] 9.9 Example — proof: X`
- WHEN `tasks <id> --json` and `validate <id>` run
- THEN the example is not a row, and `validate` reports nothing about it

#### Scenario: Fenced heading does not start a section

- GIVEN a spec whose `## Why` holds a fenced `## Requirements` line
- WHEN `validate <id>` runs
- THEN the real `## Requirements` heading is not reported as stray

#### Scenario: Fenced comment stays in the scenario

- GIVEN a scenario whose THEN is followed by a fenced shell snippet containing a `# comment` line
- WHEN `validate <id>` and `criteria <id> <task>` run
- THEN validate passes and `criteria` prints the snippet inside the scenario block

### Requirement: Proofs resolve as a reader would expect

A proof that exactly matches a scenario name SHALL be that scenario, even when the name contains
`/`. A proof whose path part is empty, such as `::name`, SHALL be a finding. Under `--strict`, a
GIVEN, WHEN, or THEN line with no text after the keyword SHALL be a finding.

#### Scenario: Slash in a scenario name

- GIVEN a scenario named `GET /login renders` and a task whose proof is that name
- WHEN `validate <id> --strict` and `criteria <id> <task>` run
- THEN validate prints `PASS` and `criteria` prints the scenario block

#### Scenario: Empty path proof is a finding

- GIVEN a task whose proof is `::rejects`
- WHEN `validate <id>` runs
- THEN it reports that the proof has no path and exits 1

#### Scenario: Empty step is a strict finding

- GIVEN a scenario whose WHEN line is `- WHEN` with nothing after it
- WHEN `validate <id>` and `validate <id> --strict` run
- THEN plain validate prints `PASS` and strict reports the step with no text

### Requirement: A repo finds its own root

Root discovery SHALL stop at the first directory above the current one that contains a `.git`
entry, so a `docs/changes/` in a parent repo is never used by a nested repo. The tool still
never reads or writes git state.

#### Scenario: Nested repo finds its own root

- GIVEN an outer folder with `docs/changes/` and an inner folder with a `.git` entry and no
  `docs/changes/`
- WHEN `list` and then `init` run inside the inner folder
- THEN `list` fails with the `not found — run onlyplans init` error, and `init` creates
  `docs/changes/` inside the inner folder

### Requirement: Ids match their folder exactly

A change id SHALL match an existing folder name exactly, byte for byte, on every filesystem.

#### Scenario: Mis-cased id is no such change

- GIVEN an active change `add-login`
- WHEN `tasks ADD-LOGIN` runs
- THEN it fails with the `no such change` error

### Requirement: The AGENTS template matches the parser

The inserted section SHALL point step 3 at `tasks <id> --next`, SHALL say that `archive` gates on
task lines and ignores the Close-Out box, and SHALL say `[x]` or `[X]` counts as done. A test
SHALL pin those three strings.

#### Scenario: Template says what the tool does

- GIVEN a fresh `init`
- WHEN the inserted section is read
- THEN it mentions `tasks <id> --next`, `[X]`, and `ignores the Close-Out box`
