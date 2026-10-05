# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-05

### Added
- **Core:** dispatcher with a fixed order and an error policy (guards fail closed, comfort modules fail open), journal, Bash parser (substitutions, arithmetic, parameter expansion, `bash -c`, remote commands of `ssh`, `find -exec`, wrappers), status line and band, store with budgets and migrations, `/exo`.
- **Kill switch:** `~/.claude/exo/DISABLED`, `EXO_DISABLE=1`, `/exo off`.
- **Self-protection:** changes to exo's switches need an *allow*; an effect check reverts changes that were not confirmed.
- **Guards:** secret guard, prod shield with house rules and dry run, cleanup brake with `/undo-last` and `/undo-list`, context diet.
- **Cockpit:** test light (with consent per project), done check, changes sidebar (`/changes`), CI light.
- **Review:** recap (`/recap`), lessons, time tracking (`/hours`).
- **Extras:** achievements (`/achievements`), spinner cinema, rubber duck (`/duck`).
- **Tooling:** mutation probe (`npm run mutate`), git history scan (`npm run history-scan`), social card (`npm run social`), plugin marketplace (`/plugin install exo@pepperonas-exo`).
