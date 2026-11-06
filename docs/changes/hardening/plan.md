# hardening — Plan

## Tasks

- [ ] 1.1 Write plan.md atomically, verify, and retry — proof: Parallel done runs keep every check
- [ ] 2.1 Skip fenced lines in parsePlan — proof: Fenced task line is not a task
- [ ] 2.2 Skip fenced headings in parseSpec — proof: Fenced heading does not start a section
- [ ] 2.3 Keep fenced lines inside the scenario block — proof: Fenced comment stays in the scenario
- [ ] 3.1 Resolve a proof as a scenario when the name matches — proof: Slash in a scenario name
- [ ] 3.2 Report a proof with an empty path — proof: Empty path proof is a finding
- [ ] 3.3 Report an empty step under --strict — proof: Empty step is a strict finding
- [ ] 4.1 Stop root discovery at a .git boundary — proof: Nested repo finds its own root
- [ ] 5.1 Require an exact folder name for an id — proof: Mis-cased id is no such change
- [ ] 6.1 Restore the template lines and pin them — proof: Template says what the tool does
- [ ] 7.1 Document fences, proofs, and the root boundary in README — proof: ./README.md
- [ ] 7.2 Bump to 0.2.2 and retitle Unreleased — proof: ./CHANGELOG.md

## Close-Out

- [ ] Every proof passes.

## Notes

From the 0.2.1 pre-release review, minus what PR #13 made moot: a path proof no longer has to
exist, so directories as proofs are no longer a question. Still deferred to later changes: the
`setup` shell-profile fixes (0.2.3) and the structure and test cleanup. Root discovery looks
for a `.git` entry by name only; the tool keeps its promise never to read or write git state.
