# hardening — Plan

## Tasks

- [x] 1.1 Lock plan.md; write via a renamed temp file — proof: Parallel done runs keep every check
- [x] 1.2 Fail in one line when the lock is held — proof: Held lock is reported
- [x] 2.1 Skip fenced lines in parsePlan; fence ends a task — proof: Fenced task line is not a task
- [x] 2.2 Skip fenced headings in parseSpec — proof: Fenced heading does not start a section
- [x] 2.3 Keep fences in the block; fence ends a step — proof: Fenced comment stays in the scenario
- [x] 2.4 Report a fence left open at end of file — proof: Unclosed fence is a finding
- [x] 3.1 Resolve a proof as a scenario first in parseProof — proof: Slash in a scenario name
- [x] 3.2 Report a proof with an empty path — proof: Empty path proof is a finding
- [x] 3.3 Report an empty step under --strict — proof: Empty step is a strict finding
- [x] 4.1 Stop locateRoot and init's check at a .git entry — proof: Nested repo finds its own root
- [x] 5.1 Require an exact folder name for an id — proof: Mis-cased id is no such change
- [ ] 6.1 Put the proof rule in the template; rerun init — proof: Template says what the tool does
- [ ] 7.1 Document fences, proofs, the lock, exact ids, .git — proof: ./README.md
- [ ] 7.2 Changelog with the root boundary flagged; bump to 0.2.2 — proof: ./CHANGELOG.md

## Close-Out

- [ ] Every proof passes.

## Notes

From the 0.2.1 pre-release review, minus what PR #13 made moot: a path proof no longer has to
exist, so directories as proofs are no longer a question. The lock stays inside the change
folder, so the README's write promise holds. The rename replaces a symlinked `plan.md` with a
regular file; on Windows a rename over a file another process holds open may need a brief retry.
Root discovery tests only that a `.git` entry exists and never reads it. Still deferred: the
`setup` shell-profile fixes (0.2.3) and the structure and test cleanup.
