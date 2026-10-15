# OnlyPlans — Roadmap

Steps to complete DIRECTION.md. Each step ends in a working state. Order matters: a step
depends on the ones before it.

## Decisions

Fixed. DIRECTION.md does not state these; the steps below assume them.

- Node floor: `engines.node >= 24`. No fallbacks for older majors.
- Module format: one CommonJS file with a `#!/usr/bin/env node` shebang. No `type` field,
  no bundler.
- Test strategy: tests spawn `bin/onlyplans.js` on a copy of a fixture in a temp directory
  and assert exit code, stdout, stderr, and files. The tool exports nothing.
- Exit codes: 0 success, 1 finding or refusal, 2 bad usage.
- Archive root: `docs/changes/archive/`, one constant, no flag.
- Language: JavaScript with `// @ts-check` and JSDoc `@typedef` blocks for the parser
  output shapes. No TypeScript, no build step, no `typescript` package.

## 1. Scaffold the repo

Deliverable: `npm test` runs and passes zero tests. `npx .` prints usage.

- `package.json`: name `onlyplans`, version `0.1.0`, `bin`, `files`, `engines.node >= 24`,
  `license`, no `dependencies`, `scripts.test = node --test`.
- `LICENSE` (MIT), `CHANGELOG.md` (Unreleased), `.gitignore`, `.editorconfig`.
- `bin/onlyplans.js` with a shebang, `// @ts-check`, usage text, and exit codes. No
  commands yet.
- `README.md` placeholder. Final text comes in step 8.

## 2. Write the templates

Deliverable: `templates/spec.md` and `templates/plan.md` validate once `<replace me>` is
replaced.

- One requirement, one scenario, one task, each marked `<replace me>`. Blank lines after
  every heading, as in DIRECTION.md sections 4 and 5.
- The task's proof names the example scenario so a fresh change validates.
- `## Close-Out` and `## Notes` present in the plan template.

## 3. Build the parsers

Deliverable: internal functions that turn the two files into data with line numbers.
Everything after this step reads from these parsers and nothing else.

- Shared: read a file, split lines, skip blank lines, keep 1-based line numbers on every
  node.
- Spec parser: title (`# <id> — <title>`), `## Why`, `## Requirements`, requirement blocks,
  scenario blocks, and the GIVEN/WHEN/THEN lines. Record stray content after
  `## Requirements`.
- Plan parser: title, `## Tasks`, task line grammar (checkbox, id, text, `—` separated
  `key: value` fields), `## Close-Out`, `## Notes` (kept opaque).
- Proof parser: scenario name vs path, optional `::<name>` suffix.
- JSDoc `@typedef` for each shape: `Spec`, `Requirement`, `Scenario`, `Plan`, `Task`,
  `Proof`, `Finding`. Every parser returns one of them.
- One error type: `{file, line, what, fix}` rendered as
  `docs/changes/<id>/<file>:<line>: <what> — <fix>`.

## 4. Build the validator

Deliverable: `onlyplans validate <id>` prints `PASS` or one finding per line, exit 1.

Rules, each a small function that returns findings:

1. `spec.md` exists.
2. `plan.md` exists.
3. Spec title id matches the folder.
4. Plan title id matches the folder.
5. Every requirement has one or more scenarios.
6. Requirement text contains `SHALL`.
7. Every scenario has GIVEN, WHEN, THEN in that order.
8. Scenario names are unique.
9. Nothing but requirement blocks after `## Requirements`.
10. Every task line matches the grammar.
11. Every task has `proof`.
12. A scenario proof resolves in `spec.md`.
13. A path proof resolves from the repo root.
14. Task ids are unique.
15. Task ids ascend by numeric parts.

`--strict` adds:

16. Every requirement is named as proof by at least one task.
17. Every line in both files is under 100 columns.

## 5. Build the commands

Deliverable: every row of the command table in DIRECTION.md section 6 works by hand.

In dependency order:

- `init`: create `docs/changes/` and `archive/` with `.gitkeep`. Idempotent.
- `new <id>`: check kebab-case, check active and archived ids, copy templates, fill `<id>`
  and the title (dashes turned into spaces).
- `tasks <id> [--json]`: parsed task lines. JSON keeps unknown fields under `fields`.
- `list [--json]`: active changes with `{id, total, done}`.
- `criteria <id> <task>`: print scenario blocks byte for byte. Path proofs print the path.
- `archive <id> [--date] [--force]`: refuse on unchecked tasks and name them, refuse on an
  existing target, then rename the folder. Default date is today.

Shared rules for all commands:

- Exit codes 0, 1, 2 as fixed in Decisions.
- One line per error.
- Writes stay inside `docs/changes/`. Never call git.

## 6. Write the tests

Deliverable: `npm test` covers DIRECTION.md section 9 and every rule in step 4.

- `test/fixtures/pass/` : one valid change.
- `test/fixtures/fail-<rule>/` : one fixture per rule 1 to 17. Each test asserts the exact
  `file:line` in the finding.
- Command tests: `new` twice fails; `archive` with an unchecked task fails and names the
  id, then moves with `--force`; `archive` into an existing target fails; `tasks --json`
  preserves unknown fields; `criteria` output equals the fixture bytes.
- A helper copies a fixture to a temp directory and runs the bin with `child_process`.

## 7. Review against the code rules

Deliverable: `bin/onlyplans.js` passes the AGENTS.md smell scan.

- Commands dispatch through a map, not a switch.
- Rules are small functions over parser output. No rule reads a file.
- No field or option without a caller. No parsing of `## Notes`.
- All prose under 100 columns, in Simplified Technical English.

## 8. Document and release

Deliverable: `onlyplans@0.1.0` on npm.

- `README.md` on one screen: the layout, the task grammar, the seven commands.
- `CHANGELOG.md` entry for `0.1.0`.
- `npm pack --dry-run` shows only `bin/`, `templates/`, `README.md`, `LICENSE`.
- Smoke test in an empty directory: `init`, `new`, `validate`, `archive`.
- Tag and publish. Commits carry no AI attribution.

## 9. Hand off to only-orchestrator

Out of this repo's scope. Record what the adapter can rely on:

- Stable surface: `new`, `tasks --json`, `criteria`, `validate --strict`, `archive`.
- Unknown task fields (`kind`, `files`, `independent`) pass through `tasks --json` untouched.
- `## Notes` is free text. The adapter may overwrite it before `archive`.
