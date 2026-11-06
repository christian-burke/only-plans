# text-wrapping-proofs — Plan

## Tasks

- [ ] 1.1 Add the wrapped fixture; join indented lines — proof: Proof on a continuation line
- [ ] 1.2 Pin that a field on a continuation line is kept — proof: Field on a continuation line
- [ ] 1.3 Print physical lines in tasks text; line stays first — proof: Done checks the first line
- [ ] 1.4 Pin criteria through a wrapped proof — proof: Criteria reads a wrapped proof
- [ ] 1.5 Pin that an unindented line stays out — proof: Unindented line is not a continuation
- [ ] 2.1 Drop the path-exists check; flip its fixture to pass — proof: Missing path passes
- [ ] 2.2 Pin the root-file hint — proof: Root file hint stays
- [ ] 3.1 Document wrapping and the dropped check in the README — proof: ./README.md
- [ ] 3.2 Note wrapping in templates/agents.md and rerun init — proof: templates/agents.md
- [ ] 3.3 Add Unreleased entries to the changelog — proof: ./CHANGELOG.md

## Close-Out

- [ ] Every proof passes.

## Notes

Both reports came from the same agent run. The silent case is the one to watch: a plan whose
proof sat on the first line and a field on the second passed strict while the field was dropped.
The path check is removed rather than moved; `done` stays a bare checkbox flip and running the
proof is the real check. Continuations follow the spec parser's wrapped GIVEN, WHEN, THEN lines.
