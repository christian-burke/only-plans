# text-wrapping-proofs — Wrapped task lines and path proofs that do not exist yet

## Why

Two reports from the field. First, `validate` refuses a path proof whose file is missing, so a
plan whose later tasks prove against the test file an earlier task creates can never print `PASS`
before work starts, which the workflow requires. Second, the task grammar is one physical line,
and `--strict` caps lines at 100 characters, so a long task has no legal form. A task wrapped onto
a second line loses whatever sat there: a proof on the continuation reports `has no proof`, and a
trailing field vanishes with `PASS` still printed.

## Requirements

### Requirement: Tasks may wrap

A task line SHALL continue onto the lines directly below it that start with two or more spaces.
The tool SHALL trim each continuation and join it to the task with one space before the text is
split into fields, so a field or a proof on a continuation line counts. A task's `line` SHALL
stay the first physical line, and `tasks` text output SHALL print the physical lines as they are
in the file. A line that starts with `- [` SHALL always begin a new task, and a line with no
indentation SHALL not be a continuation.

#### Scenario: Proof on a continuation line

- GIVEN a plan whose task 1.1 wraps its text onto an indented line that ends with
  `— proof: Form renders`, followed by task 1.2 on its own line
- WHEN `validate <id> --strict` and `tasks <id> --json` run
- THEN validate prints `PASS`, the row for 1.1 has `text` equal to both lines joined by one
  space and `proof` `Form renders`, and 1.2 is a separate row

#### Scenario: Field on a continuation line

- GIVEN a task whose first line ends with `— proof: Bad password` and whose indented second line
  is `— kind: api`
- WHEN `tasks <id> --json` runs
- THEN the row's `fields` carry both `proof` `Bad password` and `kind` `api`

#### Scenario: Done checks the first line

- GIVEN a plan with a wrapped unchecked task
- WHEN `done <id> <task>` runs and then `tasks <id>` runs
- THEN only the first physical line of the task changed, from `- [ ]` to `- [x]`, and text
  output prints both physical lines of the task as they now are in the file

#### Scenario: Criteria reads a wrapped proof

- GIVEN a wrapped task whose proof sits on the continuation line
- WHEN `criteria <id> <task>` runs
- THEN it prints the named scenario's block

#### Scenario: Unindented line is not a continuation

- GIVEN a task followed by an unindented line of prose that is not a task
- WHEN `tasks <id> --json` runs
- THEN the task's `text` and `fields` exclude the prose, as they do today

### Requirement: A path proof need not exist yet

`validate` SHALL accept a path proof whether or not the path exists, since the task that owns
the proof often creates the file. The `./<name>` hint for a bare root file name that matches no
scenario SHALL stay.

#### Scenario: Missing path passes

- GIVEN a plan whose task proves against `test/missing.test.js::rejects` and no such file
- WHEN `validate <id>` and `validate <id> --strict` run
- THEN both print `PASS` with exit 0

#### Scenario: Root file hint stays

- GIVEN a plan whose task proves against `Makefile` and no scenario has that name
- WHEN `validate <id>` runs
- THEN the finding reads `no scenario named "Makefile"; for a root file write ./Makefile`
