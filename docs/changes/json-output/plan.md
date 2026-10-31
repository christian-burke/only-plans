# json-output — Plan

## Tasks

- [x] 1.1 Pin text modes with literal expected output — proof: Text modes unchanged
- [x] 2.1 Add --json to validate via one findingRow — proof: Findings carry the rendered path
- [x] 2.2 Print [] and exit 0 for a clean change — proof: Clean change prints an empty array
- [x] 2.3 Combine --json with --strict — proof: Strict findings serialize too
- [x] 3.1 Add --json to criteria; parser records given, when, then — proof: Scenario proof as JSON
- [x] 3.2 Print a path proof as JSON — proof: Path proof as JSON
- [x] 3.3 Keep criteria errors on stderr with --json — proof: Missing task fails the same way
- [x] 4.1 Add path to list --json rows — proof: Row has a path
- [x] 5.1 Show --json in USAGE for validate and criteria — proof: Completion offers the flag
- [x] 5.2 Document the three JSON shapes in README — proof: ./README.md
- [x] 5.3 Add the changelog entry under Unreleased — proof: ./CHANGELOG.md
- [x] 5.4 Assert --help lists --json on validate and criteria — proof: Help shows the flag

## Close-Out

- [ ] Every proof passes.

## Notes

Brief: hooks parse `validate --json` in pre-commit and CI; a task brief appends the scenario
`criteria --json` returns; session start maps a change id to its folder with `list --json`.
`file` in a finding is the rendered repo-relative path, not the bare `spec.md`, so a consumer
can open it from the repo root without knowing the change folder.
