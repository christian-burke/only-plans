# next-and-dry-run — Plan

## Tasks

- [x] 1.1 Add the task-sections fixture; pin validate and text — proof: Headings leave text alone
- [x] 1.2 Record the nearest ### heading on each task in parsePlan — proof: Row has its section
- [x] 1.3 Emit null section fields for plans without headings — proof: No heading gives null
- [x] 2.1 Add --next to tasks for text and JSON — proof: Next unchecked task
- [x] 2.2 Print all tasks checked or null when nothing is left — proof: Nothing left
- [x] 3.1 Add --dry-run to archive with the would move line — proof: Dry run succeeds
- [x] 3.2 Refuse on unchecked tasks after printing the destination — proof: Dry run refuses
- [x] 3.3 Refuse on an existing target, touch nothing — proof: Dry run hits a target
- [x] 4.1 Show the flags in USAGE; pin completion and help — proof: Flags are shown
- [x] 4.2 Document section, section_line, --next, --dry-run in README — proof: ./README.md
- [x] 4.3 Bump to 0.2.1 and retitle Unreleased in the changelog — proof: Version and changelog agree

## Close-Out

- [ ] Every proof passes.

## Notes

Last of the three PRs from the synapse request batch. `section` is any level-3 heading; the
tool does not require or parse a `Task N:` prefix, and no rule counts tasks per section. The
dry run mirrors the real exit codes so a script can branch on them the same way.
