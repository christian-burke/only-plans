## OnlyPlans

Changes live in `docs/changes/<id>/` as `spec.md` and `plan.md`. Finished changes move to
`docs/changes/archive/`. `onlyplans list` shows the active changes. Run `onlyplans --help` for all
commands.

Work a change in this order:

1. `onlyplans new <id>` creates the folder from the templates. The id is lowercase words joined by
   dashes. Replace every `<replace me>` in both files.
2. `onlyplans validate <id> --strict` must print `PASS` before any task starts. Otherwise it prints
   one finding per line as `file:line: what — fix`.
3. `onlyplans tasks <id> --json` lists the tasks. `onlyplans criteria <id> <task>` prints the
   scenario a task must satisfy.
4. Do one task, make its proof pass, then run `onlyplans done <id> <task>` to check its box. Never
   edit `plan.md` by hand for this.
5. `onlyplans archive <id>` when every box is checked. Never edit `docs/changes/archive/`.

`spec.md` holds `## Why` and `## Requirements`. Each `### Requirement:` says SHALL and has one or
more `#### Scenario:` blocks with GIVEN, WHEN, and THEN lines, in that order.

`plan.md` holds `## Tasks`, `## Close-Out`, and `## Notes`. A task line is
`- [ ] 1.1 <task> — proof: <Scenario name>`. The proof names a scenario in `spec.md` or a path
from the repo root; a proof with `/` or `::` is a path. Extra `key: value` fields are allowed and
kept. Ids ascend and may leave gaps: insert a task as `1.2.1` between `1.2` and `1.3`, never
renumber. Only `[x]` counts as done.
