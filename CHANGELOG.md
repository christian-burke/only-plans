# Changelog

## 0.2.1

- `validate --strict` accepts a line of exactly 100 characters and reports only longer ones, so a
  repo formatted at width 100 passes. The fix text now says "at or under 100".
- The `AGENTS.md` section `init` writes fills 100 columns and lives in `templates/agents.md`. Run
  `onlyplans init` again to refresh it; a section a formatter has rewrapped counts as unchanged.
- The repo records its own changes under `docs/changes/` and pins Prettier as a dev dependency.
- `validate --json` prints findings as `{file, line, what, fix}` objects, and `[]` when clean. The
  exit code matches text mode.
- `criteria --json` prints the scenario a task's proof names as one object with its `given`,
  `when`, and `then` text, or the `path` and `raw` of a path proof.
- `list --json` rows carry a `path` to the change folder.
- `tasks --json` rows carry `section` and `section_line`, the `###` heading a task sits under
  inside `## Tasks`, or `null` for both without one.
- `tasks --next` prints the first unchecked task, or `all tasks checked`. With `--json` it prints
  that task's row, or `null`.
- `archive --dry-run` prints `would move <from> to <to>`, runs every check, and moves nothing.

## 0.2.0

- `done <id> <task>` checks one task's box in `plan.md` in place and changes no other byte,
  CRLF and a missing final newline included. A second run is a no-op. The `AGENTS.md` section
  now tells agents to run it instead of editing the line; run `onlyplans init` again to
  refresh the section.
- A bare `.` or `..` is refused as a change id, as any other missing change is.

## 0.1.2

- `init` pads the `AGENTS.md` section with blank lines, as Markdown formatters expect around
  an HTML comment, and leaves the section alone once a formatter has rewrapped it or renumbered
  its list. Only a real change in the text counts as a change.

## 0.1.1

- `validate --strict` reports a scenario that no task proves. A requirement with no proven
  scenario is still one finding at the requirement.
- Task ids may leave gaps: insert `1.2.1` between `1.2` and `1.3` instead of renumbering.
  The `AGENTS.md` section says so, and tells agents to check a box by editing that one line.

## 0.1.0

- First release: `init`, `new`, `list`, `tasks`, `criteria`, `validate`, and `archive`.
- Requires Node 22 or later. Runs on Windows; paths print with `/` on every platform, and
  spec and plan files may use CRLF.
- `--version`. `tasks --json` rows carry `line`. A `—` in task text stays in the text; only
  ` — key:` starts a field.
- `validate --strict` reports any `<replace me>` left from the templates. The `AGENTS.md`
  section now covers the file shapes, the id rule, and `list`.
- `init` adds an OnlyPlans section to `AGENTS.md`; `--no-agents` skips it.
- `setup --tabcomplete` for zsh, bash, and PowerShell. Commands accept `docs/changes/<id>/`
  as an id.
