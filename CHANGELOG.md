# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-10-05

### Added
- **`/exo` argument list:** while the prompt reads `/exo `, the line under it lists what may follow — `status · on · off · reset · rules · help`, then the module ids after `on`/`off`/`reset` — and narrows as you type. A list to read, not tab completion: Claude Code completes command names but gives mods no way to complete arguments.
- Real screenshots in the README, recorded from a Claude Code session (`npm run screens`, `docs/SCREENSHOTS.md`).

### Fixed
- After `/clear` exo's line disappeared and its ticker stopped: the engine fires no `session.start` then. exo now starts over for the new session.
- `/achievements` came out as one paragraph (a fenced block in command output loses its line breaks); plain text now.
- The `/exo` table lost its columns with longer module names.
- English counts: `1 turn`, `1 path`, `1 event`.

### Changed
- `npm run check` validates with `--strict`; the project notes moved to `.claude/CLAUDE.md`.

## [0.1.0] - 2026-10-05

### Added
- **Core:** dispatcher with a fixed order and an error policy (guards fail closed, comfort modules fail open), journal, Bash parser (substitutions, arithmetic, parameter expansion, `bash -c`, remote commands of `ssh`, `find -exec`, wrappers), status line and band, store with budgets and migrations, `/exo`.
- **Kill switch:** `~/.claude/exo/DISABLED`, `EXO_DISABLE=1`, `/exo off`.
- **Self-protection:** changes to exo's switches need an *allow*; an effect check reverts changes that were not confirmed.
- **Guards:** secret guard, prod shield with house rules and dry run, cleanup brake with `/undo-last` and `/undo-list`, context diet.
- **Cockpit:** test light (with consent per project), done check, changes sidebar (`/changes`), CI light.
- **Review:** recap (`/recap`), lessons, time tracking (`/hours`).
- **Extras:** achievements (`/achievements`), spinner cinema, rubber duck (`/duck`).
- **Language:** interface, documentation and tool output in English; German claims, password names and the old lessons heading are still recognised.
- **Tooling:** mutation probe (`npm run mutate`), git history scan (`npm run history-scan`), social card (`npm run social`), plugin marketplace (`/plugin install exo@pepperonas-exo`).
