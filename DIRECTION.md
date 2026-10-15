# OnlyPlans — Specification

Repo and npm package: `only-plans`. Bin: `onlyplans`. Status: draft for the author.

## 1. Purpose

OnlyPlans is a standalone, minimal spec-driven change record. One change is one folder with a
spec and a plan. A finished change moves to an archive. The tool has no knowledge of any
orchestrator, agent, or harness. only-orchestrator consumes it through a provider adapter, the
same way it consumes OpenSpec.

## 2. The one promise

OnlyPlans never grows a proposal, design, or delta split. A change is `spec.md` and `plan.md`.
There are no main specs and no sync step. The archive is the history. A repo that needs
cumulative specs graduates to OpenSpec.

## 3. Layout in a target repo

```
docs/changes/<id>/spec.md
docs/changes/<id>/plan.md
docs/changes/archive/<YYYY-MM-DD>-<id>/     # the folder, moved whole
```

- `<id>` is kebab-case and unique among active and archived changes.
- Commands that take `<id>` also accept a path to the folder, such as `docs/changes/<id>/`.
- One root keeps one glob for tools. The archive path is one constant in the tool.

## 4. spec.md

```markdown
# <id> — <title>

## Why

One to three sentences: the problem and the outcome.

## Requirements

### Requirement: <name>

The system SHALL <behavior>.

#### Scenario: <name>

- GIVEN <context>
- WHEN <action>
- THEN <checkable outcome>
```

Rules:

- Every requirement has at least one scenario, and its text contains `SHALL`.
- Every scenario has GIVEN, WHEN, and THEN lines, in that order.
- Scenario names are unique within the file.
- Nothing follows `## Requirements` except requirement blocks.

## 5. plan.md

```markdown
# <id> — Plan

## Tasks

- [ ] 1.1 <task> — proof: <Scenario name>
- [ ] 1.2 <task> — proof: tests/test_x.py::test_y

## Close-Out

- [ ] Every proof passes.

## Notes

Free text. Tools never parse it.
```

Task line grammar:

- A checkbox, an id, the task text, then `—` separated `key: value` fields.
- `proof` is required. It names a scenario in this change's `spec.md`, or a path in the repo
  with an optional `::<name>` suffix.
- Any other field is allowed and preserved. OnlyPlans ignores it.
- Ids are unique and ascending by their numeric parts.
- Only `[x]` and `[X]` count as done.

## 6. The tool

One file, no dependencies, published as the npm package `only-plans` with the bin `onlyplans`.
Node is already present wherever Claude Code or OpenSpec runs, so it adds no runtime.

- Exit 0 on success.
- Every error is one line: what failed, `file:line` where, and what to do.
- The tool never commits or branches. Callers own git. It writes only under `docs/changes/`,
  except `setup`, which writes a marked block to the shell profile.

| Command                                                | Does                                                                                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onlyplans init`                                       | Creates `docs/changes/` and `docs/changes/archive/`, each with a `.gitkeep`. Idempotent.                                                                                           |
| `onlyplans new <id>`                                   | Creates the folder from the two templates with `<id>` filled in. Refuses if the id exists, active or archived.                                                                     |
| `onlyplans list [--json]`                              | Active changes with task counts: `{id, total, done}`.                                                                                                                              |
| `onlyplans tasks <id> [--json]`                        | The parsed task lines: `{id, text, done, fields}`. `fields` holds every `key: value` on the line.                                                                                  |
| `onlyplans criteria <id> <task>`                       | Prints the scenario blocks the task's proof names, verbatim. Errors on a missing scenario. A path proof prints the path.                                                           |
| `onlyplans validate <id> [--strict]`                   | Runs the rules for both files. Prints `PASS`, or one finding per line. `--strict` adds: every requirement is named as proof by at least one task, and lines are under 100 columns. |
| `onlyplans archive <id> [--date YYYY-MM-DD] [--force]` | Refuses while a task is unchecked and names the ids, unless `--force`. Moves the folder to `archive/<date>-<id>/`. Refuses if the target exists. Does not touch git.               |
| `onlyplans setup --tabcomplete <shell>` | Upserts a marked block with the completion script into the profile of `zsh`, `bash`, or `powershell`. The script calls the tool for candidates. |

## 7. Templates

`templates/spec.md` and `templates/plan.md` follow sections 4 and 5. Each holds one example
requirement, one scenario, and one task, each marked `<replace me>`. `new` fills the title from
`<id>` with dashes turned into spaces.

## 8. Validation findings

Each finding is one line:

```
docs/changes/<id>/<file>:<line>: <what> — <fix>
```

The rule set is sections 4 and 5, plus:

- Both files exist.
- The two `# <id>` titles match the folder name.
- A proof that names a scenario resolves in `spec.md`.
- A proof that names a path resolves from the repo root.

## 9. Tests

`node --test` with fixtures under `test/fixtures/`.

- One passing fixture.
- One failing fixture per validation rule, each asserting the `file:line` in the finding.
- `new` twice fails.
- `archive` with an unchecked task fails and names it. With `--force` it moves.
- `archive` into an existing target fails.
- `tasks --json` preserves unknown fields.
- `criteria` returns the scenario text byte for byte.

## 10. Repo

A new repo, `only-plans`:

```
package.json        # name only-plans, version, bin, files, engines.node >= 24, no dependencies
bin/onlyplans.js
templates/spec.md
templates/plan.md
test/
README.md           # one screen: the layout, the task grammar, the seven commands
LICENSE             # MIT
CHANGELOG.md
```

Constraints:

- Prose in Simplified Technical English. Lines under 100 columns.
- No attribution to any AI model in commits or files.
- No dependency beyond Node.

## 11. Out of the author's scope

How only-orchestrator will use it:

- The provider adapter maps `create` to `new`, `tasks` to `tasks --json`, `criteria` to
  `criteria`, `validate` to `validate --strict`, and `close` to writing its retro into
  `## Notes` from its own ledger in `.oo/`, then `archive`.
- The orchestrator adds `kind`, `files`, and `independent` fields to task lines. OnlyPlans
  never reads them.
- `record.provider = "onlyplans"` replaces `plain`. The new and early stage presets select it.
