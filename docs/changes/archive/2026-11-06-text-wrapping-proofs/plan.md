# text-wrapping-proofs — Plan

## Tasks

- [x] 1.1 Add the wrapped fixture; join indented lines — proof: Proof on a continuation line
- [x] 1.2 Pin that a field on a continuation line is kept — proof: Field on a continuation line
- [x] 1.3 Print physical lines in tasks text; line stays first — proof: Done checks the first line
- [x] 1.4 Pin criteria through a wrapped proof — proof: Criteria reads a wrapped proof
- [x] 1.5 Join unindented prose as Markdown does — proof: Unindented prose continues the task
- [x] 2.1 Drop the path-exists check; flip its fixture to pass — proof: Missing path passes
- [x] 2.2 Pin the root-file hint — proof: Root file hint stays
- [x] 3.1 Document wrapping and the dropped check in the README — proof: ./README.md
- [x] 3.2 Note wrapping in templates/agents.md and rerun init — proof: templates/agents.md
- [x] 3.3 Add the entries to the changelog — proof: ./CHANGELOG.md

## Close-Out

- [x] Every proof passes.

## Notes

Both reports came from the same agent run. The silent case is the one to watch: a plan whose
proof sat on the first line and a field on the second passed strict while the field was dropped.
The path check is removed rather than moved; `done` stays a bare checkbox flip and running the
proof is the real check. Continuations follow the spec parser's wrapped GIVEN, WHEN, THEN lines.
