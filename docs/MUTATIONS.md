# Mutationsprobe

Stand 2026-10-05 · `npm run mutate` · 61/62 erkannt

Jede Zeile bricht absichtlich ein sicherheitsrelevantes Verhalten. „erkannt“ heißt: die Mutation hat nachweislich gegriffen (Prüfsumme vorher → nachher) und die genannten Tests wurden rot.

| Mutation | Datei | bricht | Ergebnis |
|---|---|---|---|
| `sq-quote` | `core/shell/parse.ts` | einfache Anführungszeichen bleiben im Wort | erkannt: 6 Test(s) rot · 06f53ae83c3c→2cefc4ccb169 |
| `and-op` | `core/shell/parse.ts` | && wird nicht als Operator erkannt | erkannt: 10 Test(s) rot · 06f53ae83c3c→d1ead4fdf1c7 |
| `dq-escape` | `core/shell/parse.ts` | Escapes in doppelten Anführungszeichen | erkannt: 3 Test(s) rot · 06f53ae83c3c→9cd6190f6a8e |
| `cmdsub` | `core/shell/parse.ts` | $(…) wird nicht als Befehl erfasst | erkannt: 12 Test(s) rot · 06f53ae83c3c→b98bfe668b1c |
| `backtick` | `core/shell/parse.ts` | Backticks werden nicht als Befehl erfasst | erkannt: 3 Test(s) rot · 06f53ae83c3c→7834415b4f4f |
| `heredoc-tabs` | `core/shell/parse.ts` | <<- mit Tabs findet sein Ende nicht | erkannt: 1 Test(s) rot · 06f53ae83c3c→5c228931da2d |
| `trailing-and` | `core/shell/parse.ts` | `a &&` gilt als vollständig | erkannt: 1 Test(s) rot · 06f53ae83c3c→f187a9c8c451 |
| `redirect-fd` | `core/shell/parse.ts` | Dateideskriptor einer Umleitung geht verloren | erkannt: 1 Test(s) rot · 06f53ae83c3c→e6b1f4b85692 |
| `glob-flag` | `core/shell/parse.ts` | Globs werden nicht markiert | erkannt: 1 Test(s) rot · 06f53ae83c3c→c8958910060d |
| `bash-c` | `core/shell/words.ts` | bash -c "…" wird nicht untersucht | erkannt: 10 Test(s) rot · 9fbadc5692e4→e889f5e8b743 |
| `ssh-remote` | `core/shell/words.ts` | der Remote-Befehl von ssh wird nicht untersucht | erkannt: 12 Test(s) rot · 9fbadc5692e4→2629a9cd9086 |
| `ssh-user` | `core/shell/words.ts` | user@host wird nicht in Host und Nutzer zerlegt | erkannt: 2 Test(s) rot · 9fbadc5692e4→a48df7ee4cf4 |
| `sudo-peel` | `core/shell/words.ts` | sudo wird nicht abgeschält | erkannt: 9 Test(s) rot · 9fbadc5692e4→0c8eb6412c8e |
| `xargs-peel` | `core/shell/words.ts` | xargs rm wird nicht als rm erkannt | erkannt: 2 Test(s) rot · 9fbadc5692e4→afdb8e8a8221 |
| `subst-cmds` | `core/shell/words.ts` | Befehle in Substitutionen fehlen | erkannt: 16 Test(s) rot · 9fbadc5692e4→0d947cd21d49 |
| `summary-args` | `core/shell/words.ts` | Zusammenfassung enthält Argumente (Geheimnisse könnten ins Journal) | erkannt: 1 Test(s) rot · 9fbadc5692e4→4cc7446b5875 |
| `arith-subs` | `core/shell/parse.ts` | Befehle in $(( … )) bleiben unsichtbar | erkannt: 3 Test(s) rot · 06f53ae83c3c→2e0339cf2829 |
| `arith-depth` | `core/shell/parse.ts` | verschachtelte Klammern beenden Arithmetik zu früh | erkannt: 3 Test(s) rot · 06f53ae83c3c→21675d1b3cd1 |
| `arith-fallback` | `core/shell/parse.ts` | $((cmd) ) wird nicht als Befehl gelesen | erkannt: 1 Test(s) rot · 06f53ae83c3c→c4ab7afcd1bc |
| `brace-subs` | `core/shell/parse.ts` | Befehle in ${x:-$(…)} bleiben unsichtbar | erkannt: 3 Test(s) rot · 06f53ae83c3c→516d4b00584f |
| `brace-quoted` | `core/shell/parse.ts` | Befehle in ${x:-'$(…)'} bleiben unsichtbar | erkannt: 1 Test(s) rot · 06f53ae83c3c→86a2a92e373e |
| `ssh-proxy` | `core/shell/words.ts` | ssh -o ProxyCommand führt unsichtbar lokal aus | erkannt: 4 Test(s) rot · 9fbadc5692e4→4063935d2950 |
| `find-exec` | `core/shell/words.ts` | find -exec rm bleibt unsichtbar | erkannt: 2 Test(s) rot · 9fbadc5692e4→0f650e186169 |
| `self-off` | `core/dispatcher/dispatcher.ts` | Claude kann den Notausschalter selbst setzen | UNGÜLTIG: Fundstelle 0× statt 1× |
| `self-esc` | `core/dispatcher/dispatcher.ts` | Esc im Dialog erlaubt die Änderung | erkannt: 2 Test(s) rot · 5cf85f8aeed3→8e2de957baa9 |
| `self-path` | `core/selfprotect.ts` | Write auf ~/.claude/exo/ geht ungefragt durch | erkannt: 7 Test(s) rot · c6cccd80c901→359106802ea0 |
| `self-readonly` | `core/selfprotect.ts` | jeder Bash-Befehl gilt als nur lesend | erkannt: 29 Test(s) rot · c6cccd80c901→5a6bb51aed35 |
| `self-settings` | `core/selfprotect.ts` | exo-Optionen in settings.json gehen ungefragt durch | erkannt: 3 Test(s) rot · c6cccd80c901→f158215223ee |
| `self-cooked` | `core/selfprotect.ts` | DIS""ABLED umgeht die Erkennung | erkannt: 2 Test(s) rot · c6cccd80c901→2c137dbf0cb2 |
| `self-bare-name` | `core/selfprotect.ts` | cd in einem Aufruf, touch DISABLED im nächsten | erkannt: 3 Test(s) rot · c6cccd80c901→45f3821d550e |
| `self-redir-amp` | `core/selfprotect.ts` | >&datei gilt als lesend | erkannt: 2 Test(s) rot · c6cccd80c901→35cff345d58c |
| `self-norm` | `core/selfprotect.ts` | // ./ ../ und Großschreibung umgehen den Pfadvergleich | erkannt: 5 Test(s) rot · c6cccd80c901→da15fe7a9462 |
| `self-unknown-tool` | `core/selfprotect.ts` | MCP-Werkzeuge schreiben ungefragt in ~/.claude/exo | erkannt: 2 Test(s) rot · c6cccd80c901→dd1452e36850 |
| `self-symlink` | `core/selfprotect.ts` | ein Symlink nach ~/.claude/exo umgeht den Schutz | erkannt: 1 Test(s) rot · c6cccd80c901→6b2071dbba44 |
| `self-glob` | `core/selfprotect.ts` | touch DIS* umgeht den Schutz | erkannt: 3 Test(s) rot · c6cccd80c901→ca00e8f51bb4 |
| `self-expansion` | `core/selfprotect.ts` | Pfadstücke in Variablen umgehen den Schutz | erkannt: 1 Test(s) rot · c6cccd80c901→81b1b9e90895 |
| `self-opaque` | `core/selfprotect.ts` | base64 -d | sh umgeht den Schutz | erkannt: 1 Test(s) rot · c6cccd80c901→28de1fc5789b |
| `self-unresolved` | `core/selfprotect.ts` | ein nicht auflösbarer Pfad gilt als harmlos | erkannt: 1 Test(s) rot · c6cccd80c901→b208c0d482f2 |
| `self-pluginconfigs` | `core/selfprotect.ts` | exo-Optionen über einen Symlink auf settings.json | erkannt: 1 Test(s) rot · c6cccd80c901→836d1447084e |
| `self-cwd-dir` | `core/selfprotect.ts` | cd ~/.claude/exo, dann touch x | erkannt: 1 Test(s) rot · c6cccd80c901→312b313df429 |
| `self-cwd-rel` | `core/selfprotect.ts` | relative Ziele nach ~/.claude/exo | erkannt: 1 Test(s) rot · c6cccd80c901→30ac45d7ca23 |
| `self-cwd-after` | `core/selfprotect.ts` | cd innerhalb des Befehls wird übersehen | erkannt: 1 Test(s) rot · c6cccd80c901→bb18881ba01f |
| `eff-off` | `core/dispatcher/dispatcher.ts` | verschleierte Befehle setzen DISABLED unbemerkt | erkannt: 4 Test(s) rot · 5cf85f8aeed3→237088692296 |
| `eff-esc` | `core/dispatcher/dispatcher.ts` | Esc behält die Änderung | erkannt: 3 Test(s) rot · 5cf85f8aeed3→4e085e38c4d5 |
| `eff-noui` | `core/dispatcher/dispatcher.ts` | ohne UI bleibt die Änderung | erkannt: 1 Test(s) rot · 5cf85f8aeed3→0112b1d4de03 |
| `eff-disabled` | `core/integrity.ts` | DISABLED wird nicht bemerkt | erkannt: 3 Test(s) rot · 06f2ae35cdeb→91a3e9f837e3 |
| `eff-rules` | `core/integrity.ts` | rules.json-Änderung wird nicht bemerkt | erkannt: 1 Test(s) rot · 06f2ae35cdeb→c92e9c34bbfc |
| `eff-settings` | `core/integrity.ts` | settings.json-Änderung wird nicht bemerkt | erkannt: 1 Test(s) rot · 06f2ae35cdeb→2077b856bb04 |
| `eff-prefs` | `core/integrity.ts` | /exo-Schalter im Store unbemerkt geändert | erkannt: 1 Test(s) rot · 06f2ae35cdeb→0decb3654437 |
| `eff-keep-others` | `core/integrity.ts` | Rücksetzen löscht fremde Plugin-Einstellungen | erkannt: 1 Test(s) rot · 06f2ae35cdeb→1390b0981212 |
| `fail-closed` | `core/dispatcher/dispatcher.ts` | ein gestörter Wächter lässt durch | erkannt: 2 Test(s) rot · 5cf85f8aeed3→70d08d49af82 |
| `deny-stops` | `core/dispatcher/dispatcher.ts` | eine Ablehnung wird ignoriert | erkannt: 1 Test(s) rot · 5cf85f8aeed3→ffecf2be46aa |
| `kill-first` | `core/dispatcher/dispatcher.ts` | der Notausschalter wirkt nicht im Dispatcher | erkannt: 1 Test(s) rot · 5cf85f8aeed3→7b3e6f3e4ec7 |
| `step-order` | `core/dispatcher/dispatcher.ts` | die feste Reihenfolge gilt nicht | erkannt: 1 Test(s) rot · 5cf85f8aeed3→d86bbabb01f8 |
| `catch-guarded` | `core/dispatcher/dispatcher.ts` | der Kern-Ausfall lässt Bash durch | erkannt: 2 Test(s) rot · 5cf85f8aeed3→87eb8287bcbd |
| `catch-ran` | `core/dispatcher/dispatcher.ts` | ein schon gelaufener Aufruf wird nachträglich abgelehnt | erkannt: 1 Test(s) rot · 5cf85f8aeed3→ac9614886e58 |
| `disabled-off` | `core/dispatcher/dispatcher.ts` | abgeschaltete Module laufen weiter | erkannt: 1 Test(s) rot · 5cf85f8aeed3→29b5943c5c34 |
| `kill-file` | `core/killswitch.ts` | die DISABLED-Datei wirkt nicht | erkannt: 2 Test(s) rot · da54bcf5bb3e→47f842ebc53c |
| `kill-env` | `core/killswitch.ts` | EXO_DISABLE wirkt nicht | erkannt: 1 Test(s) rot · da54bcf5bb3e→7319566b0932 |
| `kill-cache` | `core/killswitch.ts` | die Datei wird nach dem ersten Blick nie wieder geprüft | erkannt: 1 Test(s) rot · da54bcf5bb3e→efef0eb52577 |
| `rules-unknown` | `core/config/rules.ts` | Tippfehler in Regelfeldern fallen nicht auf | erkannt: 1 Test(s) rot · 5cc4df906ecb→c5321842b642 |
| `rules-fallback` | `core/config/rules.ts` | kaputte rules.json verliert die eingebauten Regeln | erkannt: 1 Test(s) rot · 5cc4df906ecb→98d8bafb942a |
