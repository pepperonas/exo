# exo

**Ein Exoskelett für Claude Code.** Ein Mod, der vor teuren Fehlern schützt, während der Arbeit den Überblick behält, am Ende zurückblickt – und ein paar Extras mitbringt, die Spaß machen und trotzdem helfen.

Gebaut auf der Mod-Schnittstelle von Claude Code 2.1.289 (Function Hooks).

<!-- Screenshot: exo-Statuszeile unter dem Prompt (⛨ exo · ● 48/48 · ● CI grün · ⏱ 3:12 heute) -->
<!-- GIF: Prod-Schild-Dialog mit Trockenlauf -->

> ⚠️ **exo ist ein Sicherheitsgurt, keine Sandbox.** Es fängt die häufigen, teuren Fehler ab – ein absichtlich verschleierter Befehl oder ein Agent, der den Mod selbst umschreibt, kommt durch. Details unter [Grenzen](#grenzen).

---

## Module

| Gruppe | Modul | Was es tut | Befehl |
|---|---|---|---|
| Wächter | **Secret-Wächter** (`secrets`) | Prüft Write/Edit, Bash-Schreibvorgänge (`>`, `>>`, `tee`, Heredocs), `git commit` (Nachricht und Diff) und `git push` auf API-Schlüssel, Tokens, private Schlüssel, Passwörter und Zeichenketten mit hoher Entropie. Meldungen zeigen nur die maskierte Form (`sk-ant-…a1b2`). | – |
| Wächter | **Prod-Schild** (`prodShield`) | Fragt vor `ssh`/`scp`/`rsync`/`sftp` auf Produktionshosts (auch über `~/.ssh/config`-Aliase, `-J`, `-o HostName`), vor `systemctl restart/stop/reload` dort, vor `DROP`/`TRUNCATE`/`DELETE`/`UPDATE` ohne `WHERE` und vor Force-Push auf `main`/`master`. Dialog: Ausführen / Abbrechen / Trockenlauf. Prüft vorher die Hausregeln. | – |
| Wächter | **Aufräum-Bremse** (`brake`) | Schnappschuss vor `rm -rf`, `git reset --hard`, `git checkout -- .`, `git restore`, `git clean -f…` – getrackte Änderungen als Stash-Commit (mit Ref gesichert), ungetrackte Dateien als tar. | `/undo-last [id]`, `/undo-list` |
| Wächter | **Kontext-Diät** (`diet`) | Große, lange oder generierte Dateien (Lockfiles, `*.min.js`, `*.map`, Logs) liest Claude als Anfang + Ende statt ganz, mit Hinweis und geschätzter Ersparnis. | – |
| Cockpit | **Testampel** (`testLight`) | Nach Änderungen laufen die betroffenen Tests im Hintergrund (vitest, jest, `node --test`, pytest, cargo, gradle, go). Anzeige `● 48/48` / `● 2 rot`; rote Tests gehen in den nächsten Prompt. Fragt pro Projekt um Erlaubnis. | – |
| Cockpit | **Fertig-Prüfer** (`doneCheck`) | Behauptet eine Antwort „fertig“ oder „funktioniert“, obwohl Dateien geändert wurden und danach kein grüner Test lief: dezenter Hinweis unter der Antwort. | – |
| Cockpit | **Änderungs-Seitenleiste** (`sidebar`) | Alle in der Sitzung geänderten Dateien mit `+/−`, Diff und Zurücksetzen (mit Rückfrage und Schnappschuss). | `/changes` |
| Cockpit | **CI-Ampel** (`ci`) | Zustand der GitHub-Actions-Läufe des Branches (braucht `gh`). Bei Rot: Toast und Knopf „Log an Claude geben“. | – |
| Rückblick | **Recap** (`recap`) | Karte mit Dauer, aktiver Zeit, Turns, Dateien, Tests vorher/nachher, Kosten, offenen Punkten. Hinweis „Letzte Sitzung …“ beim nächsten Start im Projekt. | `/recap [md\|copy]` |
| Rückblick | **Lehren-Sammler** (`lessons`) | Schlägt 1–3 Lehren aus der Sitzung für die Projekt-`CLAUDE.md` vor. Nichts wird ohne Häkchen geschrieben. | (in `/recap`) |
| Rückblick | **Zeiterfassung** (`hours`) | Aktive Zeit je Projekt (Lücke über 5 min = Pause), Tagesstand in der Hinweiszeile. | `/hours [export csv\|json]` |
| Extras | **Erfolge** (`achievements`) | 15 Abzeichen, z. B. „Zehn grüne Turns“, „Früher Vogel“, „Pac-Man hat nie den Geist gesehen“. | `/achievements` |
| Extras | **Spinner-Kino** (`cinema`) | Kleine Filme im Spinner je Tätigkeit: Bagger bei `npm install`, Rakete beim Deploy, Detektiv bei `grep`, Kaffee bei langen Turns. | – |
| Extras | **Gummi-Ente** (`duck`) | Fünf Fragen zur Fehlersuche, daraus ein sauberer Prompt zum Bearbeiten. | `/duck` |

Dazu der Kern: **`/exo`** zeigt Zustand, Zeitverbrauch und letzte Fehler aller Module und schaltet sie.

<!-- Screenshot: /exo Statustabelle -->
<!-- Screenshot: /changes Seitenleiste mit Diff -->
<!-- Screenshot: /achievements Karte -->
<!-- GIF: Spinner-Kino (Bagger bei npm install) -->

---

## Installation

exo ist ein einzelner Mod. Zum Ausprobieren aus einem Klon:

```bash
git clone https://github.com/pepperonas/exo
cd exo && npm ci && npm test
claude --plugin-dir /pfad/zu/exo
```

Oder dauerhaft über `CLAUDE_CODE_PLUGIN_DIRS` in der Umgebung bzw. im `env`-Block von `~/.claude/settings.json`.

exo funktioniert ohne Einrichtung. Ohne eingetragene Produktionshosts ist der Prod-Schild nur für SQL und Force-Push aktiv.

### Produktionshosts eintragen

In `~/.claude/settings.json` (nie ins Repository):

```json
{
  "pluginConfigs": {
    "exo": {
      "options": {
        "prodHosts": ["web=203.0.113.10", "shop=shop.example.com"]
      }
    }
  }
}
```

Der Prod-Schild erkennt die Hosts über Name, Adresse und alle `Host`-Einträge in `~/.ssh/config`, deren `HostName` darauf zeigt. Ändern geht auch über `/config`.

---

## Konfiguration

Alle Optionen über `/config` oder `pluginConfigs.exo.options` in `~/.claude/settings.json`.

| Option | Typ | Standard | Bedeutung |
|---|---|---|---|
| `secrets` | Schalter | an | Secret-Wächter |
| `prodShield` | Schalter | an | Prod-Schild |
| `brake` | Schalter | an | Aufräum-Bremse |
| `diet` | Schalter | an | Kontext-Diät |
| `testLight` | Schalter | an | Testampel |
| `doneCheck` | Schalter | an | Fertig-Prüfer |
| `sidebar` | Schalter | an | Änderungs-Seitenleiste |
| `ci` | Schalter | an | CI-Ampel |
| `recap` | Schalter | an | Recap |
| `lessons` | Schalter | an | Lehren-Sammler |
| `hours` | Schalter | an | Zeiterfassung |
| `achievements` | Schalter | an | Erfolge |
| `cinema` | Schalter | an | Spinner-Kino |
| `duck` | Schalter | an | Gummi-Ente |
| `prodHosts` | Liste `name=adresse` | leer | Produktionshosts |
| `secretAllowPaths` | Liste von Globs | `**/test/fixtures/**`, `**/*.example`, `**/.env.example` | Pfade, in denen Geheimnisse erlaubt sind |
| `snapshotMaxMb` | Zahl | 500 | Darüber fragt die Aufräum-Bremse statt still zu sichern |
| `dietMaxKb` | Zahl | 256 | Ab dieser Größe liest Claude nur Anfang und Ende |
| `dietMaxLines` | Zahl | 2000 | Ab dieser Zeilenzahl ebenso |
| `testCommand` | Text | leer | Überschreibt die Runner-Erkennung; `{files}` wird durch die geänderten Dateien ersetzt |
| `quietHours` | `HH-HH` | `22-07` | In dieser Zeit keine Erfolgs-Toasts und -Töne |
| `sound` | Schalter | aus | Ton bei neuen Abzeichen (nur macOS) |
| `reducedMotion` | Schalter | aus | Spinner-Kino als Standbild |

`/exo on|off <modul>` überschreibt die Schalter für dich dauerhaft (gespeichert im Store von exo).

### Hausregeln (`~/.claude/exo/rules.json`)

Regeln, die der Prod-Schild vor einem Befehl prüft. Fehlt die Datei, legt exo sie mit dieser Standardregel an:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "nginx-certbot",
      "hosts": ["*"],
      "match": "\\bnginx\\b",
      "check": ["ssh", "{host}", "pgrep", "-x", "certbot"],
      "blockWhen": "exit0",
      "text": "Nie nginx ändern, während certbot läuft (certbot läuft gerade auf diesem Host)."
    }
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `id` | Kleinbuchstaben, Ziffern, `-` |
| `hosts` | Namen aus `prodHosts` oder `*` |
| `match` | Regulärer Ausdruck auf den Befehl |
| `check` | Prüfbefehl als argv; `{host}` wird zur Adresse |
| `blockWhen` | `exit0` (blockieren, wenn die Prüfung 0 liefert) oder `exitNonZero` |
| `text` | Begründung bei Ablehnung |

Eine kaputte oder ungültige Datei bringt exo nicht zum Absturz: Es gelten die eingebauten Regeln, und `/exo` sowie ein Toast zeigen, was nicht stimmt.

---

## Notausschalter

Drei Wege, exo komplett abzuschalten:

1. **`touch ~/.claude/exo/DISABLED`** – wirkt sofort, auch aus einem zweiten Terminal, auch wenn exo in dieser Sitzung gerade Bash blockiert.
2. **`EXO_DISABLE=1 claude …`** – für die ganze Sitzung.
3. **`/exo off`** – gespeichert, `/exo on` hebt es auf.

Claude selbst kann exo nicht abschalten: Änderungen an `~/.claude/exo/`, an exos Einträgen in den Settings und an den gespeicherten Schaltern brauchen dein **Zulassen** im Dialog. Ändert ein Aufruf sie trotzdem (etwa über einen verschleierten Befehl), fragt exo danach, ob die Änderung bleiben soll, und setzt sie ohne Zustimmung zurück.

---

## Grenzen

- **Sicherheitsgurt, keine Sandbox.** Erkannt wird, was in Befehlen und Dateiinhalten erkennbar ist. Absichtlich verschleierte Befehle (z. B. in Skripten, die Claude vorher schreibt), Werkzeuge außerhalb von Claude Code und ein Agent, der exo selbst umschreibt, sind nicht abgedeckt.
- **Lädt das Modul nicht, schützt es nicht.** Claude Code lässt bei einem fehlerhaften Mod alles durch. `/exo` zeigt den Zustand; fehlt `⛨ exo` unter dem Prompt, ist exo nicht aktiv.
- **Ein Wächter, der abstürzt,** lehnt nur den betroffenen Aufruf ab (fail closed); Komfortmodule laufen bei Fehlern weiter (fail open). Fällt exos Kern aus, gehen nur reine Lesewerkzeuge durch.
- **Dialoge brauchen eine Oberfläche.** Unter `claude -p` lehnt der Prod-Schild ab, die Testampel startet nichts, Steueränderungen werden zurückgesetzt.
- **Arbeitsverzeichnis von Bash:** exo verfolgt die `cd`s zwischen Aufrufen. Nach `cd -` oder `cd $VAR` kennt es den Ort nicht mehr sicher.
- **Seitenleiste und Fertig-Prüfer** sehen Änderungen über Write/Edit, nicht über Bash (`sed -i`, Skripte).
- **`~/.ssh/config`:** `Include` und `Match` werden nicht ausgewertet.
- **Testampel:** Bei `node --test`/`npm test` läuft die ganze Suite (keine verlässliche Zuordnung Datei → Test). Sie führt Befehle aus deinem Projekt aus – deshalb fragt sie pro Projekt und erneut, wenn sich die Test-Konfiguration ändert.
- **Schreibvorgänge von exo selbst** (CLAUDE.md, Recap-Dateien) prüfen, dass der Pfad aufgelöst im Projekt liegt. Zwischen Prüfung und Schreiben bleibt ein kurzes Zeitfenster (`$.fs` kennt kein atomares Umbenennen).
- **Ton** nur auf macOS (`afplay`).

---

## Daten und Datenschutz

- **Keine Telemetrie.** Netzwerk nutzen nur `gh` (CI-Ampel) und der eigene Modellaufruf für offene Punkte bei `/recap` (über die Sitzung von Claude Code).
- **Gespeichert** in exos Plugin-Store (höchstens ~3 MiB): Schalter, Journal der laufenden Sitzung (Befehle nur ohne Argumente, keine Prompt- oder Antworttexte), Sitzungsfakten, Stunden, Erfolge, Testampel-Zustimmungen.
- **Auf der Platte** unter `~/.claude/exo/`: `rules.json`, Schnappschüsse (`snapshots/`, 20 Stück oder 7 Tage), Ausgangsstände der Seitenleiste (`originals/`), Stunden-Exporte.
- **Geheimnisse** erscheinen nie im Klartext in Meldungen, Journal oder Store.

---

## Entwicklung

```bash
npm test            # Logik, ohne Claude Code (node --test)
npm run test:engine # Hooks gegen die echte Engine (claude plugin test)
npm run check       # tsc --strict + claude plugin validate
npm run mutate      # Mutationsprobe: jeder sicherheitsrelevante Test einmal rot gesehen
```

Aufbau: `hooks/register.tsx` ist die einzige Stelle, die mit der Engine spricht (Adapter `hostOf($)`); der Kern (`core/`) und die Module (`modules/`) arbeiten gegen das Interface `Host`. Alle `tool.call`-Aufrufe laufen durch einen Dispatcher mit fester Reihenfolge. Details: [`docs/PLAN.md`](docs/PLAN.md), Mutationsprotokoll: [`docs/MUTATIONS.md`](docs/MUTATIONS.md).

---

## Lizenz

MIT – siehe [LICENSE](LICENSE).

---

© 2026 Martin Pfeffer | celox.io
