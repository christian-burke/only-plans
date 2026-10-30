# dogfood — Use OnlyPlans in its own repo, at formatter width

## Why

A repo formatted at width 100 produced lines `--strict` rejected, and the `AGENTS.md` section
`init` writes wrapped at 90. Both come from treating "under 100" as the rule when every formatter
treats 100 as the limit. The repo also planned its own work outside the tool it ships.

## Requirements

### Requirement: Strict line length matches formatters

The system SHALL accept a line of exactly 100 characters under `--strict` and SHALL report a
longer line.

#### Scenario: Line of 100 passes

- GIVEN a plan whose longest line is exactly 100 characters
- WHEN `validate --strict` runs
- THEN it prints `PASS`

#### Scenario: Line of 101 fails

- GIVEN a plan with a line of 101 characters
- WHEN `validate --strict` runs
- THEN it reports that line with the fix "keep lines at or under 100 characters"

### Requirement: The AGENTS section fills 100 columns

The system SHALL read the `AGENTS.md` section from `templates/agents.md` and every line it
inserts SHALL be at most 100 characters.

#### Scenario: Section fits width 100

- GIVEN an empty folder
- WHEN `init` runs
- THEN every line of the inserted section is at most 100 characters and at least one is over 90

### Requirement: Formatting is pinned in the repo

The repo SHALL pin Prettier as a dev dependency with its width in a committed config, and
SHALL expose it as `npm run lint` and `npm run format`.

#### Scenario: Lint passes

- GIVEN a fresh `npm ci`
- WHEN `npm run lint` runs
- THEN it reports every file formatted

### Requirement: The repo records its changes with OnlyPlans

The repo SHALL keep `docs/changes/` and SHALL record this change as the first, validated strict.

#### Scenario: Repo validates its own change

- GIVEN `docs/changes/dogfood/`
- WHEN `npm run onlyplans -- validate dogfood --strict` runs
- THEN it prints `PASS`
