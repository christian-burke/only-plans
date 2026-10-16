# Changelog

## 0.1.0

- First release: `init`, `new`, `list`, `tasks`, `criteria`, `validate`, and `archive`.
- Requires Node 22 or later. Runs on Windows; paths print with `/` on every platform, and
  spec and plan files may use CRLF.
- `--version`. `tasks --json` rows carry `line`. A `—` in task text stays in the text; only
  ` — key:` starts a field.
- `validate --strict` reports any `<replace me>` left from the templates. The `AGENTS.md`
  section now covers the file shapes, the id rule, and `list`.
- `init` adds an OnlyPlans section to `AGENTS.md`; `--no-agents` skips it.
- `setup --tabcomplete` for zsh, bash, and PowerShell. Commands accept `docs/changes/<id>/`
  as an id.
