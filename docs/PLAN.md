# exo – Plan

Stand: 2026-10-05 · Grundlage: Claude Code 2.1.289, Engine-Typen `claude-code.d.ts` dieses Builds,
Referenz-Mod usage-bars 0.3.0. Phase 0 (Analyse) und Phase 1 (Rückfragen) sind abgeschlossen;
die Entscheidungen daraus stehen in Abschnitt 1.

> Dieses Dokument enthält **keine echten Adressen**. Beispiele nutzen Dokumentationsadressen
> (`203.0.113.0/24`, `example.com`). Die echten Prod-Hosts stehen nur in der lokalen
> Konfiguration (`pluginConfigs.exo.options.prodHosts` in `~/.claude/settings.json`).

---

## 1. Entscheidungen

| Thema | Entscheidung |
|---|---|
| Paketierung | **Ein** Mod `exo`, Module intern schaltbar. Getrennte Veröffentlichung von Erfolge/Kino/Ente frühestens als Option in Etappe 6 (über ein Noun `$.exo` in `engine.create` + `dependencies`). |
| Begründung | Die Engine ordnet Hooks nur nach Tiers (prepend > user > append > builtin > core); innerhalb des user-Tiers ist **keine Reihenfolge zugesichert**. Wächter müssen deshalb hinter genau einem Dispatcher in genau einem Mod sitzen. |
| Prod-Hosts | `userConfig.prodHosts: string[]`, Format `name=adresse`. Nur lokal gesetzt, nie im Repo. |
| Hausregeln | `~/.claude/exo/rules.json`, beim Laden validiert. Kaputt/ungültig → eingebaute Defaults (certbot-Regel) **plus sichtbare Warnung in `/exo`**. Kein Absturz, kein stilles Ignorieren. |
| Datenablage | `~/.claude/exo/` (`rules.json`, `snapshots/`, `originals/`, `DISABLED`). Zustand in `$.store` (Plugin-eigen, max. 4 MiB). |
| Notausschalter | Datei `~/.claude/exo/DISABLED` (wirkt sofort, auch aus einem zweiten Terminal), Umgebungsvariable `EXO_DISABLE=1` (wirkt ab Start der Sitzung), `/exo off`. Details 3.4. |
| Prod-Schild-Dialog | Nativer `$.ui.ask`. Esc = Abbruch. „Trockenlauf“ nur als Option, wenn es eine echte Entsprechung gibt. Ohne interaktive UI (`-p`) → Ablehnung. |
| Rückblick | `session.end`: nur Fakten speichern, schnell, kein Modellaufruf. Hinweis „Letzte Sitzung …“ beim nächsten Start im selben Projekt: einmal, wegklickbar, entfällt nach 7 Tagen. Offene Punkte per Modell nur bei `/recap`. |
| Zeiterfassung | Eigenständig in `$.store`. Tagesstand in der Hinweiszeile, Woche per `/hours`, Export CSV/JSON für den Eigengebrauch. **Kein Bezug zu feierabend** (weder lesen noch schreiben noch Format). |
| Spinner-Kino | Variante A: nur `Spinner.message` animieren; Zeit und Tokens zeichnet weiter die Engine. |
| Qualität | `tsc --strict` + `claude plugin validate`. Kein ESLint. Keine neuen Laufzeit-Abhängigkeiten. |
| Lizenz | MIT. |
| Repo | `pepperonas/exo`, **privat**. Öffentlich erst nach Etappe 6 und nach History-Prüfung (Abschnitt 8). |
| Entwicklung | Repo `~/claude/_mods/exo`, per Symlink in den Dev-Mods-Ordner der Sitzung (Hot-Reload). Symlink erst, wenn Etappe 1 den Notausschalter enthält. |
| Fertig-Prüfer | Meldet nur, wenn im Turn Dateien geändert wurden (Entscheid nach Phase 2). |
| Prod-Schild | Keine Allow-Liste für Lesebefehle: jeder Prod-Zugriff fragt (Entscheid nach Phase 2). |

---

## 2. Verzeichnisstruktur

Sprache, Build und Tests wie usage-bars: TypeScript/TSX ohne Build-Schritt (die Engine lädt
die Quelle), reine Logik in eigenen Dateien, Node-Tests über `tsx`, Engine-Tests über
`claude plugin test`. Nur Dateien mit `.ts`/`.tsx` werden geladen; Daten (Frames, Regeln,
Abzeichen) sind deshalb `.ts`-Module, keine JSON-Dateien.

```
exo/
  .claude-plugin/plugin.json      Manifest, userConfig, "types"
  hooks/
    hooks.json                    { "modules": ["./register.tsx"] }
    register.tsx                  einzige Registrierung + Adapter `hostOf($)` + `$.state`-Atome
  core/
    adapter/host.ts               Host-Interface (das Einzige, was Module sehen)
    journal/events.ts             Ereignistypen
    journal/journal.ts            Ringpuffer, Abfragen, Persistenz-Kompaktierung
    dispatcher/dispatcher.ts      tool.call-Reihenfolge, Fehlerpolitik, Budget
    statusline/statusline.ts      Slots, Priorität, Kürzung nach Breite
    config/config.ts              userConfig + /exo-Overrides + Defaults, Validierung
    config/rules.ts               rules.json-Schema, Validierung, Default-Regeln
    store/store.ts                versioniertes Schema, Migrationen, Größenbudget, Drosselung
    shell/parse.ts                Bash-Parser
    shell/words.ts                Befehlserkennung auf geparsten Befehlen (git, rm, ssh …)
    health/health.ts              Zustand je Modul, Zeitverbrauch, letzte Fehler
    killswitch.ts                 DISABLED-Datei / EXO_DISABLE
    i18n.ts                       Texte (de; Struktur für en)
    exo-command.ts                /exo
  modules/
    waechter/{secrets,prod,brake,diet}.ts      (+ jeweils *-logic.ts rein)
    cockpit/{testlight,donecheck,sidebar,ci}.ts
    rueckblick/{recap,lessons,hours}.ts
    erfolge/{rules.ts,erfolge.ts}
    kino/{frames/*.ts,kino.ts}
    ente/ente.ts
  types/index.d.ts                PluginState-Vertrag
  tests/                          *.spec.ts  (node --test, rein)
  hooks/*.test.tsx                Engine-Tests (claude plugin test)
  tools/mutate.ts                 Mutationsprobe (Abschnitt 6)
  docs/PLAN.md, docs/MUTATIONS.md
```

---

## 3. Kern

### 3.1 Adapter

`core/adapter/host.ts` definiert `Host`: genau die Fähigkeiten, die exo braucht
(`now, after, every, store, fs, run, env, ask, toast, log, Statuszeile/Band, Sitzung`;
spätere Etappen ergänzen `spawn, open/close Pane, copy, model.complete, prompt.fill,
session.usage/messages`). Der Adapter `hostOf($)` steht in **`hooks/register.tsx`**:
`claude plugin validate` verfolgt `$` statisch und lässt ihn **nur in Funktionen derselben
Datei** fließen, nie über einen Import (Engine-Regel, in Etappe 1 festgestellt). Ebenso
müssen die `$.state`-Atome dort als Konstanten stehen, und `$.env.get` nimmt nur
**literale** Variablennamen (`Host.env` ist deshalb auf `HOME | EXO_DISABLE | NO_COLOR`
typisiert). Module importieren nie `claude-code`; Tests geben ihnen einen Fake-Host.
Ändert die Engine ihre API, wird nur `hostOf` angepasst.

Engine-Fakten, die der Adapter kapselt:
- `$.fs`: kein delete/rename, 4 MiB je Datei → Löschen, `tar`, `du`, `tail`, `wc` über `run`.
- `$.process.run`: Timeout Standard 30 s, max. 10 min, nicht abbrechbar. `$.process.spawn`
  ist abbrechbar (Schleife verlassen = Prozess beenden) → für Testläufe.
- `$.store`: JSON, **4 MiB gesamt pro Plugin** → Budget in 3.7.
- Modulvariablen gehen bei Hot-Reload verloren, Timer werden verworfen, `session.start`
  feuert erneut → alles, was eine Zeichnung liest, liegt in `$.state`; Timer werden in
  `session.start` (neu) gestartet.

### 3.2 Journal

Typisierter Ereignisstrom, Ringpuffer im Speicher (Obergrenze 2.000 Ereignisse), den alle
Module lesen. Module schreiben nie ineinander, nur ins Journal.

```ts
type Base = { seq: number; at: number; turnId?: string }
type JournalEvent = Base & (
  | { type: 'session.start'; sessionId: string; cwd: string; project: string }
  | { type: 'prompt.submit'; chars: number }                 // kein Prompttext
  | { type: 'turn.start'; turnId: string }
  | { type: 'tool.start'; id: string; tool: string; summary: string; kind?: ActivityKind }
  | { type: 'tool.end'; id: string; tool: string; ms: number; ok: boolean;
      exitCode?: number; files?: string[]; denied?: string /* Modul-ID */ }
  | { type: 'file.changed'; path: string; added: number; removed: number; via: 'Edit'|'Write' }
  | { type: 'test.run'; source: 'testlight'|'claude'; phase: 'start'|'end';
      ok?: boolean; passed?: number; failed?: number; runner?: string }
  | { type: 'build.run'; ok: boolean }
  | { type: 'ci.status'; state: 'green'|'red'|'running'|'unknown'; runId?: number }
  | { type: 'turn.complete'; turnId: string; ms: number; claims: string[]; reason: string }
  | { type: 'snapshot'; id: string; kind: string }
  | { type: 'budget.exceeded'; module: string; ms: number }
  | { type: 'module.error'; module: string; message: string }
  | { type: 'session.end'; reason: string }
)
```

Regeln:
- `summary` von Befehlen läuft **immer** durch die Secret-Maskierung, bevor es ins Journal
  kommt; Prompt- und Antworttexte werden nicht im Journal gespeichert (die Antwort wird nur
  im Augenblick von `turn.complete` ausgewertet: `claims` und Lehren-Kandidaten).
- `file.changed`: aus Edit (Zeilen von `old_string`/`new_string`) und Write (Diff gegen das
  Original). Änderungen durch Bash sind nicht erfasst (Grenze, README).
- Persistenz: das laufende Journal kompaktiert (ohne `tool.start`, gekürzte `summary`) unter
  `journal:current`, max. 512 KB, gedrosselt alle 5 s. Bei `session.end` wird es zur
  Sitzungszusammenfassung verdichtet (Abschnitt 4.3).

### 3.3 Dispatcher für `tool.call`

Genau **ein** `on('tool.call', …)` ohne Matcher. Reihenfolge:

| # | Schritt | Darf | Bei internem Fehler |
|---|---|---|---|
| 0 | Notausschalter | alles durchlassen | – |
| 0b | Bash parsen (einmal, für alle) | – | Parse-Fehler ⇒ „unparsbar“, Schritte 1/2/4 behandeln das konservativ |
| 1 | Secrets | `{deny}` | **fail closed**: nur diesen Aufruf ablehnen |
| 2 | Prod-Schild | `{deny}`, Dialog, Befehl umschreiben (Trockenlauf) | **fail closed** |
| 3 | Kontext-Diät | Read-Argumente umschreiben | fail open |
| 4 | Aufräum-Bremse | Schnappschuss, ggf. Dialog | fail open **mit Warnung** im Ergebnis-`context` („kein Schnappschuss“) – außer Größenlimit-Dialog wurde abgelehnt ⇒ `{deny}` |
| 5 | `next(e)` | ausführen | – |
| 6 | Journal, Testampel, Seitenleiste, Diät-Ergebnis | nachgelagert; nur Diät verändert das Ergebnis (`context`) | fail open |

- Jeder Schritt läuft in eigenem `try/catch`, misst seine Zeit und meldet sie an Health.
- Die Engine ist selbst **fail open**: ein Hook, der wirft oder sein Budget (10 s eigene
  Zeit; `$`-Aufrufe und Dialoge zählen nicht) überzieht, wird übersprungen und der Aufruf
  läuft. Deshalb zusätzlich ein `.catch`-Handler an der Registrierung (1 s Gnadenfrist):
  Notausschalter gesetzt → `next(e)`; Aufruf ist Bash/Write/Edit/NotebookEdit → `{deny}` mit
  Hinweis auf den Notausschalter; sonst → `next(e)`.
- Fail-closed-Meldung: `exo/<modul> ist gestört (<Fehler>). Dieser Aufruf wurde
  abgelehnt. Abschalten: /exo off <modul> oder touch ~/.claude/exo/DISABLED`.
- Budget: synchrone Prüfungen 1–4 zusammen < 50 ms (ohne Dialoge und bewusste Prüfbefehle
  wie die certbot-Abfrage). Überschreitung → `budget.exceeded` ins Journal, Anzeige in `/exo`.
- Grenze, die in die README gehört: Lädt das Modul gar nicht (Syntaxfehler, Engine-Fehler),
  gibt es keinen Schutz – die Engine lässt dann alles durch. `/exo` zeigt den Ladezustand;
  ist exo nicht aktiv, fehlt seine Statuszeile.

### 3.4 Notausschalter

`core/killswitch.ts`, geprüft als **erster Schritt in jedem Hook** (Dispatcher, `.catch`,
`prompt.submit`, `ui.render` …):
- `~/.claude/exo/DISABLED` existiert → exo ist komplett passiv (alle Hooks reichen `next(e)`
  durch, Statuszeile zeigt `exo aus (DISABLED)`). Wirkt live, ohne Neustart, und lässt sich
  aus einem zweiten Terminal setzen, auch wenn exo in dieser Sitzung Bash blockiert.
- `EXO_DISABLE=1` in der Umgebung → ebenso (gilt ab Start: `EXO_DISABLE=1 claude …`).
- `/exo off` → alle Module aus, gespeichert in `$.store`; `/exo on` hebt es auf.
- Prüfung über `$.fs.exists` mit 1-s-Cache (ein `$`-Aufruf zählt nicht gegen das Budget).
- Datei und Umgebungsvariable werden in `tool.call` und im `.catch`-Handler **ohne die
  Laufzeit** geprüft: auch wenn exos eigener Zustand nicht aufgebaut werden kann, greift
  der Schalter. Ein gescheiterter Aufbau wird beim nächsten Aufruf neu versucht.
- Letzte Rückfallebene ohne exo: Symlink im Dev-Mods-Ordner entfernen bzw. Plugin deaktivieren.

Jede Ablehnungsmeldung nennt den Notausschalter.

### 3.4a Selbstschutz (nach Sicherheitsprüfung, 2026-10-05)

Ohne ihn könnte Claude alle Wächter mit einem Aufruf abschalten (`touch ~/.claude/exo/DISABLED`,
`rules.json` leeren, eine exo-Option in `settings.json` auf `false`). `core/selfprotect.ts`
erkennt Schreibzugriffe auf `~/.claude/exo/` und auf exo-Einträge in
`~/.claude/settings*.json` (Write/Edit/NotebookEdit über den Pfad, Bash über den Text plus
„nur lesend?“-Prüfung: ausschließlich Leseprogramme ohne schreibende Umleitung). Solche
Aufrufe brauchen ein **Zulassen** im Dialog; Esc oder fehlende UI → Ablehnung. Läuft im
Dispatcher direkt nach dem Notausschalter, **unabhängig von den Modulschaltern**, fail closed.
Zweite Prüfrunde (gleicher Tag): Bash wird auf dem Rohtext **und** auf den von der Shell
„gekochten“ Wörtern geprüft (`DIS""ABLED`); der bloße Dateiname `DISABLED` bzw. `rules.json`
reicht, weil das Bash-Werkzeug sein Arbeitsverzeichnis zwischen Aufrufen behält (`cd` im einen,
`touch DISABLED` im nächsten Aufruf) – bewusst übervorsichtig, `echo DISABLED > notiz.txt` fragt
deshalb nach. „Nur lesend“ heißt: Programme, die keine anderen starten können (ohne `rg --pre`,
`less`/`LESSOPEN`), keine Umgebungs-Präfixe, keine schreibende Umleitung inkl. `>&datei`. Pfade
werden normalisiert (`//`, `.`, `..`), ohne Groß-/Kleinschreibung verglichen (macOS) und über
`$.fs.stat(…, { resolve: true })` durch Symlinks aufgelöst. Unbekannte Werkzeuge (MCP) werden
auf jeden Pfad nach `~/.claude/exo` geprüft.
Dritte Prüfrunde: Globs werden segmentweise gegen die Steuernamen geprüft (`DIS*`,
`e?o/[D]ISABLED`; ein bloßes `*` nicht, Bash trifft damit keine Punktnamen); Pfadstücke in
Variablen zählen, wenn der Befehl ein Fragment von `.claude` oder `DISABLED` enthält (bewusst eng:
`claude`/`exo` allein träfe jeden Schreibbefehl im Workspace `~/claude`); undurchsichtige
Ausführung (`eval`, `source`, Shell aus einer Pipe, `base64 -d`/`xxd -r`) gilt immer als
Steueränderung; `pluginConfigs`, `claude plugin disable … exo` und `~/.claude/dev-mods` zählen.
Ein Pfad, der sich gar nicht auflösen lässt, gilt als betroffen (fail closed), und der Adapter
fällt nie auf den unaufgelösten Pfad zurück. Fällt der Kern aus, lässt der `.catch`-Pfad nur
noch reine Lesewerkzeuge (`core/tools.ts`) durch.
Vierte Prüfrunde – **Wirkungsprüfung** (`core/integrity.ts`): Eine Textprüfung ist nie
vollständig; deshalb vergleicht exo vor und nach jedem Aufruf, der etwas ändern kann (alles außer
`core/tools.ts`), den Zustand seiner Schalter (`DISABLED`, `rules.json`, exo-Einträge in
`~/.claude/settings*.json`, `/exo`-Prefs im Store). Eine Änderung wird dem Menschen vorgelegt
(Behalten / Rückgängig); ohne Antwort oder ohne UI wird sie zurückgesetzt. exo *einschalten*
(DISABLED gelöscht) wird nie zurückgedreht. Zusätzlich bezieht die Textprüfung das verfolgte
Arbeitsverzeichnis ein (`core/cwd.ts`): in `~/.claude` zählt jeder schreibende Befehl, relative
Ziele werden aufgelöst. Unbekanntes Arbeitsverzeichnis (`cd -`, `cd $X`) löst bewusst *keine*
Dauer-Rückfrage aus – das deckt die Wirkungsprüfung.
Grenze: Ein Agent mit Shell kann den Mod selbst ändern; das deckt keine der beiden Prüfungen ab –
Sicherheitsgurt, keine Sandbox.

### 3.5 Statuszeile

Module melden Slots an: `{ id, priority, text, color?, minWidth }`. Der Kern zeichnet:
- **PromptHint**: eine exo-Zeile unter der Engine-Zeile; eingeschachtelt per
  `<Box column>{await next(e)}{exoZeile}</Box>` wie usage-bars, damit beide nebeneinander
  bestehen (Reihenfolge der Zeilen ist nicht garantiert, beide bleiben sichtbar).
  Inhalte: Testampel, CI, Tagesstunden, Notausschalter-Zustand.
- **AbovePrompt**: Band für Dinge mit Knöpfen (Hinweis „Letzte Sitzung …“, „CI-Log an
  Claude geben“, rote Tests). Weicht einer Umfrage (`hasSurvey`).
- Kürzung nach `viewport.columns` bzw. `bodyColumns`: Slots niedrigster Priorität fallen
  zuerst ganz weg (kein abgeschnittener Text in der Mitte).
- Reservierte IDs: `usage` (für eine spätere Anzeige, falls usage-bars fehlt), `context`
  (spätere Kontext-Tankanzeige).

### 3.6 Konfiguration

Vorrang: Notausschalter > `/exo`-Overrides (`$.store`) > `userConfig` > Defaults.

`userConfig` (nur `string`, `number`, `boolean`, `string[]` möglich):

| Feld | Typ | Default |
|---|---|---|
| `secrets`, `prodShield`, `brake`, `diet`, `testLight`, `doneCheck`, `sidebar`, `ci`, `recap`, `lessons`, `hours`, `achievements`, `cinema`, `duck` | boolean | `true` (`ci` nur wirksam mit `gh`) |
| `prodHosts` | string[] `name=adresse` | `[]` (Schild dann nur für SQL + Force-Push) |
| `secretAllowPaths` | string[] (Globs) | `["**/test/fixtures/**", "**/*.example", "**/.env.example"]` |
| `snapshotMaxMb` | number | 500 |
| `dietMaxKb` / `dietMaxLines` | number | 256 / 2000 |
| `testCommand` | string | `""` (automatisch) |
| `quietHours` | string `HH-HH` | `"22-07"` |
| `sound` | boolean | `false` |
| `reducedMotion` | boolean | `false` |

`rules.json` (Hausregeln), Version 1:

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
      "text": "Nie nginx ändern, während certbot läuft."
    }
  ]
}
```

Validierung rein (`validateRules(json) → { rules, errors[] }`): unbekannte Felder,
ungültige Regex, `check` kein String-Array, Platzhalter außer `{host}` → Fehler. Fehler in
einer Regel verwerfen nur diese Regel; ist die Datei unlesbar/kein JSON → nur Defaults.
Jeder Fehler erscheint in `/exo` und einmal als Toast.

### 3.7 Store

Schlüssel mit Schema-Version `schema: 1` und Migrationsfunktionen `migrate[n]: (old) => new`
(rein, getestet). Budget (Summe < 3 MiB, Rest Reserve):

| Schlüssel | Inhalt | Obergrenze |
|---|---|---|
| `prefs` | `/exo`-Overrides | klein |
| `journal:current` | laufendes Journal, kompaktiert | 512 KB |
| `sessions` | Zusammenfassungen der letzten 20 Sitzungen (je Projekt) | 300 KB |
| `snapshots` | Metadaten der Schnappschüsse | 64 KB |
| `hours` | Tag × Projekt → aktive Sekunden, Segmente des laufenden Tags | 512 KB, älter 400 Tage entfällt |
| `achievements` | Fortschritt, Zähler, Serien | 64 KB |
| `lastSession` | je Projekt der Hinweis „Letzte Sitzung …“ + `shown` | 64 KB |
| `health` | letzte Fehler je Modul | 32 KB |

`store.ts` misst die JSON-Größe vor jedem `set`, kürzt nach festgelegter Regel (älteste
zuerst) und schreibt gedrosselt (5 s, sofort bei `session.end`).

### 3.8 Shell-Parser

`parse(cmd) → Script`: Liste von Pipelines/Listen mit Operatoren `&& || ; | &`, Subshells
`( … )`, Gruppen `{ …; }`, Befehlssubstitution `$( … )`/Backticks (als verschachtelte
Skripte), Zuweisungspräfixe `FOO=1 cmd`, Anführungszeichen (`'…'`, `"…"` mit Escapes,
`$'…'`), Umleitungen (`>`, `>>`, `2>`, `&>`, `<`, Heredoc `<<EOF`/`<<'EOF'` mit Inhalt),
Kommentare. Kein Ausführen, keine Expansion; unbekannte Expansionen bleiben markiert
(`hasExpansion`). `words.ts` normalisiert Befehle: Wrapper `sudo`, `env`, `nice`, `nohup`,
`time`, `command`, `exec`, `xargs` abschälen; `bash|sh|zsh -c "…"` rekursiv parsen;
`ssh host "…"` liefert den Remote-Befehl als verschachteltes Skript mit Host.
Nach der Sicherheitsprüfung (2026-10-05) außerdem: Substitutionen in Arithmetik
(`$(( $(cmd) ))`, `(( … ))`) und in Parameterexpansion (`${x:-$(cmd)}`, auch in Anführungszeichen),
`$((cmd) )` als Substitution einer Subshell, lokale Befehle von `ssh -o ProxyCommand/LocalCommand`
und `find -exec/-execdir/-ok`.
Fixture-Tests: mindestens 120 Fälle, inklusive Fehlerfälle (offene Anführungszeichen ⇒
`unparsable`, nie Absturz).

### 3.9 Health und `/exo`

`health.ts` je Modul: `state: on|off|broken`, `calls`, `totalMs`, `maxMs`, `budgetHits`,
`lastError { at, message }` (maskiert). Ein Modul gilt als gestört nach einem internen Fehler,
bis `/exo reset <modul>` oder Neustart; Komfortmodule laufen trotzdem weiter.

`/exo` gibt eine Tabelle aus (Modul, Zustand, Zeit, letzter Fehler), dazu Notausschalter-
Zustand, Pfad zu `~/.claude/exo/`, Warnungen aus `rules.json`. Unterbefehle: `/exo on|off`,
`/exo on|off <modul>`, `/exo reset <modul>`, `/exo rules` (geladene Regeln).

### 3.10 Befehlsnamen

`/exo`, `/undo-last`, `/undo-list`, `/recap`, `/hours`, `/achievements`, `/duck`.
Beim Start wird `$.command.list()` geprüft; ein Name, den es schon gibt, wird als `exo-<name>`
registriert und in `/exo` genannt.

---

## 4. Module

### 4.1 Wächter

**#2 Secret-Wächter** (`secrets-logic.ts` rein: `scan(text, ctx) → Finding[]`, `mask(s)`)
- Muster: `sk-ant-…`, OpenAI `sk-…`/`sk-proj-…`, GitHub `ghp_`/`gho_`/`ghu_`/`ghs_`/
  `github_pat_`, AWS `AKIA…` (+ Secret-Key-Kontext), Stripe `sk_live_`/`rk_live_`,
  Slack `xox[abpr]-`, PEM `-----BEGIN … PRIVATE KEY-----`, JWT, `password|passwd|secret|token
  = "…"`-Zuweisungen; dazu Shannon-Entropie ≥ 4,0 Bit/Zeichen ab 24 Zeichen in
  Zuweisungskontext.
- Fehlalarm-Ausschlüsse: UUIDs, Hex-Hashes in Lockfiles (`integrity`, `sha512-`), Git-SHAs,
  Base64-Daten-URLs von Bildern, Platzhalter (`xxx`, `<…>`, `changeme`, `your-…`).
- Prüft: Write (`content`), Edit (`new_string`), NotebookEdit, Bash mit `>`, `>>`, `tee`,
  Heredoc. Vor `git commit`: `git diff --cached -U0` (nur hinzugefügte Zeilen); vor
  `git push`: `git log -p -U0 @{u}..HEAD` (ohne Upstream: `origin/HEAD..HEAD`, sonst nur
  Warnung im `context`).
- `.env`: erlaubt, wenn `git check-ignore -q <pfad>` greift; sonst Ablehnung mit Hinweis,
  `.env` in `.gitignore` aufzunehmen. Erlaubnisliste: `.env.example`, Kommentar
  `exo-allow-secret` auf derselben Zeile, `secretAllowPaths`.
- Meldung: Datei, Zeile, Art, maskierter Wert (`sk-ant-…a1b2`), Vorschlag `.env`. Der
  Klartext verlässt die Prüffunktion nie.
- **Testdaten**: Schlüssel in Tests werden zur Laufzeit zusammengesetzt
  (`'sk-' + 'ant-' + …`), damit weder der eigene Wächter noch GitHub Push Protection die
  Quelle für ein echtes Geheimnis halten.

**#1 Prod-Schild** (`prod-logic.ts` rein: `inspect(script, hosts, sshAliases, rules) → Finding[]`)
- Hosts: `prodHosts` + Aliase aus `~/.ssh/config` (geparst, rein; Host-Einträge, deren
  `HostName` auf eine Prod-Adresse zeigt, und die Prod-Namen selbst; Wildcards `*` werden
  nicht aufgelöst).
- Treffer: `ssh`/`scp`/`rsync`/`sftp` mit Prod-Ziel (inkl. `user@`, `-p`, `-J`, `host:pfad`),
  `systemctl restart|stop|reload` im Remote-Befehl, SQL `DROP`/`TRUNCATE`/`DELETE`/`UPDATE`
  ohne `WHERE` (in `psql -c`, `mysql -e`, `sqlite3 db "…"`, Heredocs an diese Programme),
  `git push --force|-f|--force-with-lease` oder `+main`-Refspec auf `main`/`master`
  (auch wenn der aktuelle Branch main ist und kein Ziel genannt ist).
- Hausregeln: passt `match` auf den (Remote-)Befehl und der Host passt, läuft `check`
  (`$.process.run`, 10 s Timeout). `blockWhen` erfüllt → Ablehnung mit `text`. Prüfung
  nicht durchführbar → im Dialog vermerkt, Entscheidung bleibt beim Menschen.
- Dialog `$.ui.ask("<Ziel>: <Befehl> – ausführen?", optionen)`, Optionen
  `Ausführen` / `Abbrechen` / `Trockenlauf` (nur wenn möglich). Esc/Reject → Abbruch.
  Ohne interaktive UI → `{deny}`.
- Trockenlauf: `rsync` → `--dry-run` einfügen; `git push` → `--dry-run`; SQL `DELETE`/
  `UPDATE` ohne WHERE → `SELECT COUNT(*) FROM <tabelle>` im selben Client-Aufruf, nur wenn das
  SQL ein einzelnes, eindeutig erkanntes Statement ist. Sonst keine Option.
- Unparsbare Befehle mit Prod-Bezug (Adresse/Name kommt im Text vor) → Dialog statt
  Durchwinken. README: Sicherheitsgurt, keine Sandbox; Verschleierung erkennt er nicht.

**#3 Aufräum-Bremse** (`brake-logic.ts` rein: Erkennung + Plan; `brake.ts` führt aus)
- Erkennung: `rm` mit `-r` und `-f` in beliebiger Schreibweise (`-rf`, `-fr`, `-r -f`,
  `--recursive --force`), `git reset --hard`, `git checkout -- .`/`git checkout .`,
  `git restore .` (ohne `--staged`), `git clean` mit `-f` und `d`/`x`.
- Plan je Fall: getrackte Änderungen → `git stash create`, SHA unter
  `refs/exo/snapshots/<id>` sichern (sonst kann `git gc` ihn wegräumen) + `HEAD` merken;
  ungetrackte (`git clean`: Liste aus `git clean -n` mit denselben Flags) und `rm -rf`-Ziele
  → `tar -czf` relativ zum Arbeitsverzeichnis.
- Pfade mit Expansion (`$VAR`, `$(…)`, Globs mit mehr als `* ? [ ]`) werden **nicht**
  ausgewertet (kein Ausführen fremder Ausdrücke) → Dialog „kann nicht gesichert werden:
  trotzdem ausführen?“. Einfache Globs werden über `$.fs.list` aufgelöst.
- Größe vorab (`du -sk`); über `snapshotMaxMb` → Dialog statt stillem Durchwinken.
- Ablage `~/.claude/exo/snapshots/<id>/` (`files.tgz`, `meta.json`), Metadaten auch in
  `$.store`. Aufbewahrung: letzte 20 oder 7 Tage, aufgeräumt bei `session.start`
  (inkl. `refs/exo/...`).
- Nach dem Lauf im Ergebnis-`context`: „wiederherstellbar mit /undo-last“.
- `/undo-last`, `/undo-list`: Wiederherstellen prüft Konflikte vorher (vorhandene Dateien,
  geänderter Worktree) und fragt per `$.ui.ask`; nie stilles Überschreiben.

**#15 Kontext-Diät** (`diet-logic.ts` rein: `decide(read, stat, history) → plan`)
- Greift bei Read ohne `offset`/`limit`/`pages`, wenn Datei > `dietMaxKb` oder >
  `dietMaxLines` Zeilen, oder Lockfile/`*.min.js`/`*.map`/`*.log`. Bilder/PDF/Notebooks nie.
- Umsetzung: `next({ ...e, limit: 200 })`, danach Ende über `tail -n 80`, angehängt als
  `context` am Ergebnis, plus Hinweis (gezielt mit `offset`/`limit` oder `grep`) und
  Ersparnis (≈ Bytes/4 Token). Zeilenzahl über `wc -l` (auch > 4 MiB).
- Schleifenschutz: liest Claude dieselbe Datei als nächsten Read erneut ohne Bereich,
  wird durchgelassen.

### 4.2 Cockpit

**#4 Live-Testampel**
- Runner-Erkennung rein (`detectRunner(files) → Runner`): vitest (`vitest related --run
  <dateien>`), jest (`jest --findRelatedTests`), pytest (passende `test_*.py`, sonst alle),
  `node --test` (Spiegel-Testdatei), `cargo test`, Gradle (`test`). Überschreibbar mit
  `testCommand` (Platzhalter `{files}`).
- Auslöser: `file.changed` an Quellcode. Entprellen 1,5 s, laufenden Lauf abbrechen (spawn
  verlassen), `nice -n 10`. Läuft Claude gerade selbst Tests (Journal `test.run source
  claude phase start` ohne Ende, aus Bash-Erkennung im Shell-Parser) → warten.
- Anzeige: `● 48/48` grün, `● 2 rot`, `● …` läuft.
- Rote Tests (Name, Assertion, Datei:Zeile, max. 2 KB) gehen einmalig über
  `prompt.submit` → `context` in den nächsten Prompt (nicht `prompt.context`, das feuert nur
  einmal pro Konversation).

**#6 „Fertig?“-Prüfer**: `turn.complete` prüft `answer` auf Behauptungen (de/en). Fand in
diesem Turn nach der letzten Dateiänderung kein grüner Test-/Buildlauf statt, gibt der Hook
`{ text: '⚠ In diesem Turn lief kein Test.' }` zurück – die Engine zeigt das dezent unter
der Antwort. Höchstens einmal pro Turn, und nur, wenn im Turn Dateien geändert wurden (entschieden).

**#7 Änderungs-Seitenleiste**: Pane `exo-changes` mit allen geänderten Dateien und `+/−`.
Auswahl zeigt den Diff (`Code`, `format: 'diff'`). Git: `git diff -- <pfad>`. Ohne Git:
Original beim ersten Anfassen in `~/.claude/exo/originals/<sitzung>/` sichern, Diff
selbst (Myers, rein). Zurücksetzen nach `$.ui.ask`-Bestätigung, vorher Schnappschuss über
die Bremsen-Mechanik.

**#14 CI-Ampel**: aktiv nur mit `gh auth status` = 0 und GitHub-Remote. Alle 60 s
`gh run list --branch <b> --limit 1 --json …`, exponentielles Backoff bei Fehlern, Pause
nach 15 min ohne Prompt. Anzeige `● CI grün · vor 3 min`. Rot: Toast (Toasts können keine
Knöpfe tragen) + Eintrag im AbovePrompt-Band mit Knopf **Log an Claude geben**: holt
`gh run view <id> --log-failed`, kürzt auf 6 KB, legt es per `$.prompt.fill` ins
Eingabefeld (Martin schickt selbst ab).

### 4.3 Rückblick

Ein gemeinsamer Bericht.
- `session.end` (kurze Zeitgrenze): Fakten aus dem Journal verdichten (Dauer, Turns,
  Dateien, Tests vorher/nachher, Kosten aus `session.usage().cost`, Lehren-Kandidaten als
  kurze Zitate) → `sessions` + `lastSession[projekt]`. Kein Modellaufruf, kein Prozess.
- Nächster Start im selben Projekt (Git-Root, sonst cwd): Band „Letzte Sitzung …“ mit
  Schließen-Knopf, einmal, entfällt nach 7 Tagen.
- `/recap`: Karte als Befehlsausgabe (gezeichnet über `CommandOutput`), offene Punkte per
  `$.model.complete({ model: 'haiku', timeoutMs: 20000 })` aus den letzten Antworten
  (`$.session.messages`). `/recap md` schreibt `<projekt>/.exo/recap-<datum>.md`,
  `/recap copy` → Zwischenablage.
- **#16 Lehren**: Erkennung („das war die Ursache“, „Falle“, „nie wieder“, „Lehre“, en-
  Entsprechungen) in `turn.complete`. Bei `/recap` 1–3 Vorschläge, Auswahl per
  `$.ui.ask` (multiSelect), Dubletten zu bestehenden Einträgen der Ziel-CLAUDE.md
  (normalisierter Textvergleich) fallen weg. Geschrieben wird nur nach Bestätigung,
  angehängt unter `## Lehren (exo)` der nächstgelegenen CLAUDE.md im Projekt.
- **#17 Stunden**: Aktivität = `prompt.submit`, `tool.start/end`, `turn.complete`; Lücke
  > 5 min = Pause. Aggregat Tag × Projekt in `hours`. Hinweiszeile `⏱ 3:12 heute`. `/hours`
  zeigt die Woche je Projekt; `/hours export csv|json` schreibt nach `~/.claude/exo/`.

### 4.4 #18 Erfolge & Serien

Regeln als Daten (`erfolge/rules.ts`):
`{ id, title, description, icon, metric, op, value, scope: 'turn'|'session'|'day'|'ever',
requires?: 'usage-bars' }`, ausgewertet über Journal-Kennzahlen (rein). Startset ~15, u. a.
„10 Turns ohne roten Test“, „Erster Commit vor 9 Uhr“, „Kontext nie über 50 %“, „Pac-Man hat
nie den Geist gesehen“ (5-h-Fenster blieb unter 90 %; sichtbar nur, wenn usage-bars geladen
ist – erkennbar an `$.config.list()`-Zeilen `usage-bars.*`; Werte aus `$.session.usage()`).
Toast + optional Ton, höchstens ein Abzeichen pro Turn, Ruhezeiten. `/achievements` als
ASCII-Karte.

### 4.5 #19 Spinner-Kino

`ui.render` auf `Spinner`: `next({ ...e, props: { ...e.props, message: frame + fakt } })`.
Tätigkeit aus dem Journal (laufendes `tool.start` + `kind` vom Shell-Parser: install, build,
deploy, search, test, sonst lange Turns > 60 s → Kaffee). Frames als `.ts`-Daten,
Stil-Pakete. 30-fps-Timer nur, solange ein Tool läuft oder ein Turn arbeitet; danach
gestoppt. `NO_COLOR`/`reducedMotion` → statisches Symbol. Jeder Fehler → `next(e)`.
Grenze: Spinner gibt es nur auf Terminal und Desktop; `ToolProgress` ist nur die
ctrl+b-Pille und wird nicht genutzt.

### 4.6 #20 Gummi-Ente

`/duck` öffnet ein Pane (`focus`, `closeOnEscape`) mit ASCII-Ente, fünf Fragen nacheinander
(`Input`, Knöpfe Weiter/Überspringen). Template deterministisch, rein getestet. Am Ende
Vorschau (`Code`) und Knopf **In den Prompt übernehmen** → `$.prompt.fill`; abgeschickt wird
erst, wenn Martin Enter drückt.

---

### 4.7 Stand Etappe 2 (2026-10-05) – Abweichungen und Ergänzungen

- **Arbeitsverzeichnis:** Das Bash-Werkzeug behält sein Verzeichnis zwischen Aufrufen; exo
  verfolgt die `cd`s jedes Aufrufs (`core/cwd.ts`). Secrets (Ziele von `>`/`tee`, Git-Verzeichnis),
  Bremse (relative Pfade) und Selbstschutz rechnen damit. Bei `cd -`/`cd $X` ist es unbekannt.
- **Secrets:** Werte, die mit `/` beginnen (Regex-Literale, Pfade), gelten nicht als Passwort.
  `git push` prüft `git log -p HEAD --not --remotes` (alles, was noch auf keinem Remote liegt) statt
  `@{u}..HEAD` – das trifft auch einen ersten Push ohne Upstream.
- **Prod-Schild:** Ein Force-Push ohne Refspec fragt Git nach dem Branch; ist der nicht ermittelbar,
  wird `main` angenommen (Vorsicht vor Bequemlichkeit). Ein ssh-Fehler (Exit 255) bei einer
  Hausregel-Prüfung heißt „Prüfung nicht möglich“ – im Dialog vermerkt, Entscheidung beim Menschen.
- **Bremse:** `xargs rm -rf` und `find -exec rm -rf {}` bekommen ihre Pfade erst zur Laufzeit –
  das gilt als „nicht sicherbar“ und fragt. Ohne UI läuft die Bremse mit einem Hinweis weiter (sie
  ist ein Komfort-Wächter; ein headless Skript soll nicht an ihr hängen).
- **Selbstschutz + Wirkungsprüfung:** Wurde eine Steueränderung im Dialog zugelassen, fragt die
  Wirkungsprüfung danach nicht noch einmal.
- **Befehle:** `/undo-last [id]`, `/undo-list`; belegte Namen weichen auf `exo-<name>` aus.
- **Testdaten:** Die Fake-Schlüssel der Tests tragen `exo-allow-secret`, sonst blockierte exo
  die Commits seines eigenen Repos (Selbsttest mit dem eigenen Scanner: 0 Funde).

## 5. Zustandsvertrag (`types/index.d.ts`)

`PluginState['exo']`: `status` (Statuszeilen-Slots), `banner` (AbovePrompt-Einträge),
`changes` (Seitenleiste), `duck` (Dialogzustand), `spinner` (aktuelle Tätigkeit + Startzeit),
`health` (für `/exo`). Alles, was eine Zeichnung liest, liegt hier, nicht in Modulvariablen.

---

## 6. Testplan

Zwei Ebenen wie usage-bars:
- `npm test` → `node --import tsx --test tests/*.spec.ts`: reine Logik, ohne Claude Code.
- `npm run test:engine` → `claude plugin test .`: Hooks gegen die echte Engine
  (`claude-code/testing`, Mock-Clock/Store, beide Oberflächen terminal + desktop).
- `npm run check` → `tsc -p .` + `claude plugin validate .`. `tsc` deckt Kern, Hooks,
  Vertrag und Engine-Tests ab; die Node-Tests (`tests/`) laufen über tsx ohne Typprüfung,
  weil sie sonst `@types/node` als neue Abhängigkeit bräuchten.

| Modul | Rein (spec) | Engine (test.tsx) |
|---|---|---|
| Shell-Parser | ≥ 120 Fixtures, Fehlerfälle, Verschachtelung, ssh-Remote | – |
| Journal | Ringpuffer, Kompaktierung, Maskierung | Ereignisse aus echten Hooks |
| Dispatcher | – | Reihenfolge, fail closed (Wächter wirft ⇒ deny), fail open (Komfort wirft ⇒ läuft), `.catch`, Notausschalter (Datei/Env/`/exo off`), Budget-Meldung |
| Config/Rules | Validierung, kaputtes JSON, Vorrang | Warnung in `/exo` |
| Store | Migrationen, Budget-Kürzung | Drosselung |
| Secrets | jedes Muster positiv, Fehlalarm-Fälle, Maskierung, Allow-Liste, `.env`-Regel | Write/Edit/Bash/commit/push |
| Prod-Schild | Host-Erkennung inkl. ssh-config, SQL, Force-Push, Trockenlauf-Umschreibung, Regeln | Dialog-Optionen, Esc, `-p` |
| Bremse | Erkennung aller Schreibweisen, Plan, Expansions-Fälle | Schnappschuss + `/undo-last` in einem Wegwerf-Repo |
| Diät | Schwellen, Ausnahmen, Schleifenschutz | Umschreibung + `context` |
| Testampel | Runner-Erkennung, Ausgabe-Parser je Runner | Entprellen, Abbruch, Kontext im nächsten Prompt |
| Fertig-Prüfer | Behauptungs-Erkennung de/en | Hinweis höchstens einmal |
| Seitenleiste | Myers-Diff | Pane, Reset mit Bestätigung |
| CI | Backoff, Zustandsableitung | Band-Knopf |
| Rückblick | Verdichtung, 7-Tage-Regel, Lehren-Erkennung, Dubletten, Stunden-Aggregat | Hinweis einmal + wegklickbar |
| Erfolge | jede Regel, ein Abzeichen pro Turn, Ruhezeiten | Toast |
| Kino | Zuordnung Tätigkeit → Animation, Breite, NO_COLOR | Fallback bei Fehler |
| Ente | Template | Pane-Ablauf, `prompt.fill` |
| Doku | Drift-Wächter (README ↔ userConfig, Befehle, Module) wie usage-bars | – |

**Mutationsprobe** (Pflicht für Shell-Parser, Secrets, Prod-Schild, Bremse):
`tools/mutate.ts` (ohne Abhängigkeiten) kopiert das Repo in ein Temp-Verzeichnis, wendet
je Eintrag aus `tests/mutations.ts` eine Ersetzung an, **prüft per Prüfsumme, dass sie
gegriffen hat**, und erwartet, dass die genannten Tests fehlschlagen. Ergebnis in
`docs/MUTATIONS.md`. Jeder sicherheitsrelevante Test muss dort mindestens einmal rot gesehen
worden sein. Ein Mutant, der nicht kompiliert, zählt nicht.

---

## 7. Etappen

Nach jeder Etappe: `npm test`, `npm run test:engine`, `npm run check` grün, Bericht, Commit,
Push (privat).

1. **Kern** – Adapter, Journal, Dispatcher (mit leeren Wächter-Platzhaltern), Notausschalter,
   Shell-Parser, Statuszeile, Config + rules.json-Validierung, Store, Health, `/exo`.
   Danach Symlink in den Dev-Mods-Ordner und Hot-Reload aktivieren. **Danach anhalten.**
2. **Wächter** – #2 Secrets, #1 Prod-Schild, #3 Aufräum-Bremse (+ `/undo-last`,
   `/undo-list`), #15 Kontext-Diät. Mutationsprobe.
3. **Cockpit** – #4 Testampel, #6 Fertig-Prüfer, #7 Seitenleiste, #14 CI-Ampel.
4. **Rückblick** – #10 Recap, #16 Lehren, #17 Stunden als ein Bericht.
5. **Extras** – #20 Ente, #18 Erfolge, #19 Kino.
6. **Veröffentlichung** – README (Modulübersicht, Installation, Konfigurationsreferenz,
   Platzhalter für Screenshots/GIFs, Abschnitt „Grenzen“), `CLAUDE.md` mit Lehren aus dem
   Bau, CHANGELOG, LICENSE (MIT), Footer `© 2026 Martin Pfeffer | celox.io`.
   History-Prüfung (Abschnitt 8), danach erst Freigabe zur Veröffentlichung.

---

## 8. Vor der Veröffentlichung

- Komplette Git-History (`git log -p --all`) durch den eigenen Secret-Scanner und eine
  Suche nach den lokal konfigurierten Prod-Adressen und -Namen sowie privaten IP-Bereichen.
- Treffer → Historie bereinigen, bevor das Repo öffentlich wird.
- Tests und Doku verwenden durchgehend `203.0.113.x`, `198.51.100.x`, `example.com`.

---

## 9. Risiken und Grenzen

- **Kein Schutz, wenn das Modul nicht lädt** (die Engine lässt dann durch). Gegenmittel:
  `/exo` zeigt Zustand, Statuszeile fehlt sichtbar, Engine-Tests vor jedem Commit.
- **Der Wächter läuft in der Sitzung, die ihn baut.** Ein Fehler kann eigene Befehle
  blockieren → Notausschalter ab Etappe 1; Tests mit zusammengesetzten Fake-Schlüsseln.
- Dialoghäufigkeit des Prod-Schilds: jeder `ssh` auf Prod fragt, bewusst ohne
  Lese-Allow-Liste (entschieden).
- Datei-Änderungen per Bash (sed, Skripte) sieht die Seitenleiste nicht.
- `$.store` 4 MiB: Budget in 3.7 ist hart; Stunden und Sitzungen werden gekürzt, nie die
  Schnappschuss-Metadaten der letzten 7 Tage.
- Ton nur auf macOS (`afplay`).
