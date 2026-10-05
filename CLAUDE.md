# CLAUDE.md – exo

Claude-Code-Mod (Function Hooks, Claude Code 2.1.289). Plan und Entscheidungen: `docs/PLAN.md`. Mutationsprotokoll: `docs/MUTATIONS.md`.

## Aufbau

- `hooks/register.tsx` – die **einzige** Datei, die mit `$` spricht: Registrierung, Adapter `hostOf($)`, `$.state`-Atome, Render-Hooks.
- `core/` – Kern gegen das Interface `Host` (`core/adapter/host.ts`): Dispatcher (feste Reihenfolge, Fehlerpolitik), Journal, Shell-Parser, Selbstschutz, Wirkungsprüfung, Store, Config, Statuszeile.
- `modules/` – Wächter, Cockpit, Rückblick, Extras; jedes Modul ist ein `Step` mit optionalen Lebenszyklus-Haken (`start`, `before`, `after`, `promptContext`, `turnComplete`, `end`).
- `tests/*.spec.ts` – reine Logik (`npm test`); `hooks/*.test.tsx` – gegen die Engine (`npm run test:engine`).

## Prüfen vor jedem Commit

```bash
npm test && npm run check && npm run test:engine && npm run mutate
```

Rückgabewerte **direkt** auswerten. `cmd | tail && echo OK` prüft `tail`, nicht `cmd` – das ist beim Bau mehrfach passiert und hat einmal einen kaputten Scan als „keine Treffer“ ausgegeben.

## Lehren aus dem Bau

### Engine (claude plugin validate)
- `$` darf **nie über eine Import-Grenze** gereicht werden; nur an Funktionen derselben Datei. Deshalb lebt der Adapter in `register.tsx`.
- `$.env.get` nimmt nur **literale** Namen. `Host.env` ist auf eine feste Liste typisiert.
- `$.state`-Refs müssen als Konstanten (aus `atom(...)`) in derselben Datei stehen.
- Die Engine ist **fail open**: Ein Hook, der wirft oder 10 s eigene Zeit überzieht, wird übersprungen und der Aufruf läuft. Fail closed nur über eigenes `try/catch` plus `.catch`-Handler an der Registrierung.
- `prompt.context` feuert **einmal pro Konversation** – Text an den nächsten Prompt geht über `prompt.submit` → `context`.
- `turn.complete`: Ein zurückgegebener `text` ≠ Antwort erscheint **unter** der Antwort.
- `$.fs.stat(p, { resolve: true })`: `isLink` ist auch bei verwaistem Symlink wahr, `realPath` fehlt dann.

### Test-Kit (claude plugin test)
- Kein echtes Dateisystem (`no implementation for fs.stat`). Ein Hook, der wirft, wird **übersprungen** – „Datei fehlt“ lässt sich darüber nicht nachbilden.
- `$` im Test hat kein `store` und kein `clock`; Store über eigene `store.*`-Hooks, Zeit über die von `mock.clock` zurückgegebene Uhr.

### Sicherheit
- **Textprüfungen sind nie vollständig.** Vier Prüfrunden haben am Selbstschutz immer neue Schreibweisen gefunden. Die tragende Sicherung ist die **Wirkungsprüfung** (Zustand vorher/nachher), die Textprüfung nur die Vorwarnung.
- Alles, was exo selbst ausführt oder schreibt, braucht dieselbe Sorgfalt wie Claudes Aufrufe: Die Testampel führte Projektbefehle ungefragt aus (jetzt: Zustimmung pro Projekt + Fingerabdruck der Konfiguration); Schreibvorgänge folgten Symlinks (jetzt: `core/safepath.ts`).
- Ein „Zulassen“ deckt nur, was gezeigt wurde. Bei Bash zeigt der Text nicht die Wirkung.
- Was künftige Sitzungen als Anweisung lesen (CLAUDE.md), wird im vollen Wortlaut gezeigt, bereinigt und nur angekreuzt geschrieben.
- Unbekannte Fehler bei Pfadprüfungen führen zur **Ablehnung** (`isMissingError`).

### Tests
- **Ein Test, der nie rot war, ist keine Zusicherung.** `npm run mutate` beweist es je Test; „UNGÜLTIG“ heißt verschobener Anker, „BLIND“ heißt schwacher Test oder redundanter Code.
- Testschlüssel zur Laufzeit zusammensetzen und mit `exo-allow-secret` markieren – sonst blockiert der eigene Secret-Wächter die Commits dieses Repos.
- Namen in Erkennungsregeln als **ganze Bestandteile** prüfen: der Secret-Wächter hielt live `passed = …` für ein Passwort.

## Konventionen

- Oberfläche Deutsch, Code und Commits Englisch.
- Keine echten Adressen im Repo: Beispiele mit `203.0.113.x`, `198.51.100.x`, `example.com`.
- Keine neuen Laufzeit-Abhängigkeiten; devDependencies fest gepinnt.

## Hinweis zu `claude plugin validate`

Die Warnung „CLAUDE.md at the plugin root is not loaded as project context" ist erwartet: diese Datei ist
Entwicklerdoku für Arbeiten **am** Repo, kein Kontext, den exo an Nutzer ausliefert. exo liefert bewusst
keinen Skill mit.
