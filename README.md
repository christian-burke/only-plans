# only-plans

A minimal spec-driven change record. One change is one folder with a spec and a plan. A
finished change moves to an archive. There are no main specs and no sync step. The archive is
the history.

```
npm install -g only-plans
onlyplans init
onlyplans new add-login
```

## Layout

```
docs/changes/<id>/spec.md
docs/changes/<id>/plan.md
docs/changes/archive/<YYYY-MM-DD>-<id>/     # the folder, moved whole
```

`spec.md` holds `## Why` and `## Requirements`. Each `### Requirement:` says SHALL and has
one or more `#### Scenario:` blocks with GIVEN, WHEN, and THEN lines, in that order.

## Task grammar

`plan.md` holds `## Tasks`, `## Close-Out`, and `## Notes`. The tool reads only the task lines:

```
- [ ] 1.1 <task> — proof: <Scenario name>
- [x] 1.2 <task> — proof: tests/test_x.py::test_y — kind: api
```

A checkbox, an id, the task text, then `—` separated `key: value` fields. `proof` is
required and names a scenario in `spec.md`, or a path from the repo root. A proof with `/`
or `::` is a path. Other fields are kept and ignored. Ids ascend. Only `[x]` counts as done.

## Commands

- `onlyplans init`: creates `docs/changes/` and `docs/changes/archive/`. Idempotent.
- `onlyplans new <id>`: creates the change from the templates. Refuses a used id.
- `onlyplans list [--json]`: active changes with task counts.
- `onlyplans tasks <id> [--json]`: the parsed task lines.
- `onlyplans criteria <id> <task>`: the scenario the task's proof names, verbatim.
- `onlyplans validate <id> [--strict]`: `PASS`, or one finding per line as `file:line`.
- `onlyplans archive <id> [--date D] [--force]`: moves the change to the archive.
- `onlyplans setup --tabcomplete <zsh|bash|powershell>`: adds tab completion to your shell.

`<id>` may also be given as a path, such as `docs/changes/add-login/`.

Exit 0 on success, 1 on a finding or refusal, 2 on bad usage. The tool never touches git and
never writes outside `docs/changes/`.

## Tab completion

```
onlyplans setup --tabcomplete zsh        # or bash, or powershell
```

This adds a marked two-line block to your shell profile that sources the completion script
shipped with the package. Profiles: `.zshrc`, `.bash_profile` on macOS, `.bashrc` elsewhere,
or PowerShell's `$PROFILE`. Open a new shell, and Tab offers command names, active change
ids, task ids, flags, and a hint when there is nothing to offer. Run it again if the install
path changes, such as after switching Node versions. It needs the `onlyplans` command on
your path, so install globally or `npm link`; the shell cannot complete through `npx`.

## Credits

The spec, scenario, and archive shape follow [OpenSpec](https://github.com/Fission-AI/OpenSpec).
OnlyPlans is the smaller cousin: one change is one folder, with no main specs and no sync.
A repo that needs cumulative specs should graduate to OpenSpec. MIT licensed.
