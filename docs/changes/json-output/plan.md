# json-output — Plan

## Tasks

- [ ] 1.1 Serialize findings via one findingRow helper — proof: Findings carry the rendered path
- [ ] 1.2 Print [] and exit 0 for a clean change — proof: Clean change prints an empty array
- [ ] 1.3 Combine --json with --strict — proof: Strict findings serialize too
- [ ] 2.1 Record given, when, then on Scenario in the parser — proof: Scenario proof as JSON
- [ ] 2.2 Print a path proof as JSON — proof: Path proof as JSON
- [ ] 2.3 Keep criteria errors on stderr with --json — proof: Missing task fails the same way
- [ ] 3.1 Add path to list --json rows — proof: Row has a path
- [ ] 4.1 Pin text modes with literal expected output — proof: Text modes unchanged
- [ ] 4.2 Add json to validate and criteria flags and USAGE — proof: Completion offers the flag
- [ ] 4.3 Document the three JSON shapes in README — proof: ./README.md
- [ ] 4.4 Add the changelog entry under Unreleased — proof: ./CHANGELOG.md

## Close-Out

- [ ] Every proof passes.

## Notes

Brief: hooks parse `validate --json` in pre-commit and CI; a task brief appends the scenario
`criteria --json` returns; session start maps a change id to its folder with `list --json`.
`file` in a finding is the rendered repo-relative path, not the bare `spec.md`, so a consumer
can open it from the repo root without knowing the change folder.
