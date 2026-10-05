# Changelog

Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionen [Semantic Versioning](https://semver.org/lang/de/).

## [0.1.0] – 2026-10-05

### Neu
- **Kern:** Dispatcher mit fester Reihenfolge und Fehlerpolitik (Wächter fail closed, Komfort fail open), Journal, Bash-Parser (Substitutionen, Arithmetik, Parameterexpansion, `bash -c`, `ssh`-Remote-Befehle, `find -exec`, Wrapper), Statuszeile und Band, Store mit Budgets und Migrationen, `/exo`.
- **Notausschalter:** `~/.claude/exo/DISABLED`, `EXO_DISABLE=1`, `/exo off`.
- **Selbstschutz:** Änderungen an exos Schaltern brauchen ein Zulassen; Wirkungsprüfung setzt unbestätigte Änderungen zurück.
- **Wächter:** Secret-Wächter, Prod-Schild mit Hausregeln und Trockenlauf, Aufräum-Bremse mit `/undo-last` und `/undo-list`, Kontext-Diät.
- **Cockpit:** Testampel (mit Zustimmung pro Projekt), Fertig-Prüfer, Änderungs-Seitenleiste (`/changes`), CI-Ampel.
- **Rückblick:** Recap (`/recap`), Lehren-Sammler, Zeiterfassung (`/hours`).
- **Extras:** Erfolge (`/achievements`), Spinner-Kino, Gummi-Ente (`/duck`).
