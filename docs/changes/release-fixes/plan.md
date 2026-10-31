# release-fixes — Plan

## Tasks

- [x] 1.1 Report indented task lines as malformed — proof: Indented task line is a finding
- [x] 1.2 Report star and plus bullets as malformed — proof: Star bullet is a finding
- [x] 2.1 Print one line for non-CliError failures in main — proof: Read-only plan on done
- [x] 3.1 Strip a leading BOM in readLines — proof: BOM file validates
- [ ] 4.1 Refuse an impossible --date — proof: Impossible date refused
- [ ] 5.1 Fix README and the AGENTS template — proof: Template says what the tool does
- [ ] 5.2 Add the changelog entries under 0.2.1 — proof: ./CHANGELOG.md

## Close-Out

- [ ] Every proof passes.

## Notes

From the 0.2.1 pre-release review. Deferred to later changes: parser hardening (fenced code
blocks, proof edge cases, empty steps), `done` atomic writes, nested-repo capture, mis-cased
ids, and the `setup` shell-profile fixes.
