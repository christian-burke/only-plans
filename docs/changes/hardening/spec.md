# hardening — Parser and done hardening for 0.2.2

## Why

The pre-0.2.1 review found inputs the parser reads wrongly and places the tool misbehaves
outside a clean checkout: parallel `done` runs lose checks and can read a half-written file,
fenced code blocks are parsed as content, a few proofs resolve to the wrong thing, a nested repo
picks up its parent's `docs/changes/`, and a mis-cased id is accepted on case-insensitive
filesystems. The AGENTS template also has to carry the new proof rule. This change ships as
0.2.2 together with the recovered release fixes.

## Requirements

### Requirement: Concurrent checks all land

`done` SHALL hold `plan.md.lock`, created exclusively in the change folder, while it re-reads
`plan.md`, checks its line, and writes the result to a temporary file in the same folder that it
renames over `plan.md`. It SHALL remove the lock on every exit path. A run that cannot take the
lock within two seconds SHALL exit 1 with a message naming the lock file and saying to delete it
if no other `done` is running.

#### Scenario: Parallel done runs keep every check

- GIVEN a plan with three unchecked tasks
- WHEN three `done` processes run at once, one per task
- THEN every process exits 0, afterwards all three tasks read `[x]`, and no lock file remains

#### Scenario: Held lock is reported

- GIVEN a `plan.md.lock` already present in the change folder
- WHEN `done <id> <task>` runs on an unchecked task
- THEN it exits 1 with a message naming `plan.md.lock`, and `plan.md` is unchanged

### Requirement: Fenced code blocks are not content

Both parsers SHALL treat a fence, a line of up to three spaces then three or more backticks or
tildes, and every line up to its closer, the same character at least as many times with only
whitespace after, as opaque. No section, heading, task, continuation, requirement, scenario, or step
SHALL be read from those lines, and a fence SHALL end a wrapped task or step. Fenced lines inside
a scenario SHALL stay in its block. A fence left open at the end of a file SHALL be a finding,
and `archive` and `tasks --next` SHALL refuse with that finding rather than act on a plan whose
tasks it may hide. The `--strict` line rules SHALL still apply to fenced lines.

#### Scenario: Fenced task line is not a task

- GIVEN a plan whose `## Tasks` holds, after a real task, a fenced example line
  `- [ ] 9.9 Example — proof: X` indented two spaces inside its fence
- WHEN `tasks <id> --json` and `validate <id>` run
- THEN the example is not a row, the real task's text does not include the fence, and `validate`
  reports nothing about either

#### Scenario: Fenced heading does not start a section

- GIVEN a spec whose `## Why` holds a fenced `## Requirements` line
- WHEN `validate <id>` runs
- THEN the real `## Requirements` heading is not reported as stray

#### Scenario: Fenced comment stays in the scenario

- GIVEN a scenario whose THEN is followed by a fenced shell snippet containing a `# comment` line
- WHEN `validate <id> --strict` and `criteria <id> <task> --json` run
- THEN validate prints `PASS`, `then` is the THEN text alone, and `block` contains the snippet

#### Scenario: Unclosed fence is a finding

- GIVEN a plan whose `## Tasks` opens a fence after its first task and never closes it
- WHEN `validate <id>` runs
- THEN it reports the fence's line as unclosed and exits 1

#### Scenario: Unclosed fence blocks archive and next

- GIVEN a plan with a checked task, then an unclosed fence, then an unchecked task
- WHEN `archive <id> --dry-run` and `tasks <id> --next` run
- THEN both exit 1 with the unclosed-fence finding on stderr, and nothing on disk changes

### Requirement: Proofs resolve as a reader would expect

A proof that equals a scenario name in `spec.md` SHALL be that scenario; otherwise a proof with
`/` or `::` is a path. A proof whose path part is empty, such as `::rejects`, SHALL be the
finding `proof "::rejects" names no path — write <path>::rejects`. Under `--strict`, a GIVEN,
WHEN, or THEN with no text after the keyword, counting its wrapped lines, SHALL be a finding.

#### Scenario: Slash in a scenario name

- GIVEN a scenario named `GET /login renders` and a task whose proof is that name
- WHEN `validate <id> --strict` and `criteria <id> <task>` run
- THEN validate prints `PASS` and `criteria` prints the scenario block

#### Scenario: Empty path proof is a finding

- GIVEN a task whose proof is `::rejects`
- WHEN `validate <id>` runs
- THEN it reports `proof "::rejects" names no path` at the task's line and exits 1

#### Scenario: Empty step is a strict finding

- GIVEN a scenario whose WHEN line is `- WHEN` with nothing after it and no wrapped line below
- WHEN `validate <id>` and `validate <id> --strict` run
- THEN plain validate prints `PASS` and strict reports the step with no text

### Requirement: A repo finds its own root

Root discovery SHALL check the current directory, then each directory above it, and SHALL stop
after the first that holds a `.git` file or directory, whether or not `docs/changes/` is there.
With no `.git` anywhere it SHALL search up to the filesystem root as today. `init` SHALL apply
the same boundary when it checks for a root above. The tool SHALL only test that `.git` exists
and SHALL never read it.

#### Scenario: Nested repo finds its own root

- GIVEN an outer folder with `docs/changes/` and an inner folder holding an empty `.git` file
  and no `docs/changes/`
- WHEN `list` and then `init` run inside the inner folder
- THEN `list` fails with the `not found — run onlyplans init` error, and `init` creates
  `docs/changes/` inside the inner folder

### Requirement: Ids match their folder exactly

A change id SHALL equal a folder name under `docs/changes/` as the directory lists it, byte for
byte, on every filesystem.

#### Scenario: Mis-cased id is no such change

- GIVEN an active change `add-login`
- WHEN `tasks ADD-LOGIN` runs
- THEN it fails with the `no such change` error

### Requirement: The AGENTS template matches the parser

The inserted section SHALL state the proof rule as "a proof that equals a scenario name is that
scenario; otherwise a proof with `/` or `::` is a path", and SHALL keep pointing at
`tasks <id> --next`, saying `archive` ignores the Close-Out box, and saying `[x]` or `[X]`
counts as done. This repo's own `AGENTS.md` SHALL carry the same section.

#### Scenario: Template says what the tool does

- GIVEN a fresh `init`
- WHEN the inserted section is read
- THEN it says a proof that equals a scenario name is that scenario, and still mentions
  `tasks <id> --next`, `[X]`, and `ignores the Close-Out box`
