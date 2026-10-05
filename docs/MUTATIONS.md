# Mutationsprobe

Stand 2026-10-05 · `npm run mutate` · 102/102 erkannt

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
| `self-off` | `core/dispatcher/dispatcher.ts` | Claude kann den Notausschalter selbst setzen | erkannt: 4 Test(s) rot · 2dd64bedd25c→1a22ef951503 |
| `self-esc` | `core/dispatcher/dispatcher.ts` | Esc im Dialog erlaubt die Änderung | erkannt: 2 Test(s) rot · 2dd64bedd25c→e3cc212d7020 |
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
| `eff-off` | `core/dispatcher/dispatcher.ts` | verschleierte Befehle setzen DISABLED unbemerkt | erkannt: 4 Test(s) rot · 2dd64bedd25c→74d49b859b7a |
| `eff-esc` | `core/dispatcher/dispatcher.ts` | Esc behält die Änderung | erkannt: 3 Test(s) rot · 2dd64bedd25c→7f2f0cb91750 |
| `eff-noui` | `core/dispatcher/dispatcher.ts` | ohne UI bleibt die Änderung | erkannt: 1 Test(s) rot · 2dd64bedd25c→03f8b1735129 |
| `eff-disabled` | `core/integrity.ts` | DISABLED wird nicht bemerkt | erkannt: 3 Test(s) rot · 06f2ae35cdeb→91a3e9f837e3 |
| `eff-rules` | `core/integrity.ts` | rules.json-Änderung wird nicht bemerkt | erkannt: 1 Test(s) rot · 06f2ae35cdeb→c92e9c34bbfc |
| `eff-settings` | `core/integrity.ts` | settings.json-Änderung wird nicht bemerkt | erkannt: 1 Test(s) rot · 06f2ae35cdeb→2077b856bb04 |
| `eff-prefs` | `core/integrity.ts` | /exo-Schalter im Store unbemerkt geändert | erkannt: 1 Test(s) rot · 06f2ae35cdeb→0decb3654437 |
| `eff-keep-others` | `core/integrity.ts` | Rücksetzen löscht fremde Plugin-Einstellungen | erkannt: 1 Test(s) rot · 06f2ae35cdeb→1390b0981212 |
| `eff-approved` | `core/dispatcher/dispatcher.ts` | nach Zulassen wird ein zweites Mal gefragt (und rückgängig gemacht) | erkannt: 1 Test(s) rot · 2dd64bedd25c→6280ad06a9db |
| `sec-anthropic` | `modules/waechter/secrets-logic.ts` | Anthropic-Schlüssel werden nicht erkannt | erkannt: 7 Test(s) rot · f85a5c4b4e4d→ec641ae3bfbe |
| `sec-github` | `modules/waechter/secrets-logic.ts` | GitHub-Tokens werden nicht erkannt | erkannt: 3 Test(s) rot · f85a5c4b4e4d→1139ed149644 |
| `sec-pem` | `modules/waechter/secrets-logic.ts` | private Schlüssel werden nicht erkannt | erkannt: 1 Test(s) rot · f85a5c4b4e4d→d405f68d4d8e |
| `sec-mask` | `modules/waechter/secrets-logic.ts` | Meldungen zeigen das Geheimnis im Klartext | erkannt: 11 Test(s) rot · f85a5c4b4e4d→f8e3c4f7c014 |
| `sec-password` | `modules/waechter/secrets-logic.ts` | Passwörter in Zuweisungen fallen durch | erkannt: 1 Test(s) rot · f85a5c4b4e4d→6629cc54ff99 |
| `sec-entropy` | `modules/waechter/secrets-logic.ts` | Zeichenketten mit hoher Entropie fallen durch | erkannt: 1 Test(s) rot · f85a5c4b4e4d→6dce90ffa7d4 |
| `sec-placeholder` | `modules/waechter/secrets-logic.ts` | Platzhalter lösen Fehlalarm aus | erkannt: 2 Test(s) rot · f85a5c4b4e4d→80642f36c946 |
| `sec-uuid` | `modules/waechter/secrets-logic.ts` | Hashes und UUIDs lösen Fehlalarm aus | erkannt: 1 Test(s) rot · f85a5c4b4e4d→f63a0c4493e7 |
| `sec-allow` | `modules/waechter/secrets-logic.ts` | exo-allow-secret wirkt nicht | erkannt: 1 Test(s) rot · f85a5c4b4e4d→8636e59bb289 |
| `sec-diff-added` | `modules/waechter/secrets-logic.ts` | auch entfernte Zeilen gelten als Fund | erkannt: 1 Test(s) rot · f85a5c4b4e4d→ebeb5063881d |
| `sec-env` | `modules/waechter/secrets.ts` | ignorierte .env wird blockiert | erkannt: 1 Test(s) rot · 53b4ee3c214b→ed0ac7f08b4e |
| `sec-commit` | `modules/waechter/secrets.ts` | der Staging-Diff wird nicht geprüft | erkannt: 1 Test(s) rot · 53b4ee3c214b→ff389a95f6f9 |
| `sec-push` | `modules/waechter/secrets.ts` | zu pushende Commits werden nicht geprüft | erkannt: 1 Test(s) rot · 53b4ee3c214b→c66a3edb7284 |
| `sec-redirect` | `modules/waechter/secrets.ts` | echo KEY > datei geht durch | erkannt: 1 Test(s) rot · 53b4ee3c214b→fb96cd7da296 |
| `prod-alias` | `modules/waechter/prod-logic.ts` | ssh-Aliase auf Prod werden nicht erkannt | erkannt: 4 Test(s) rot · f0772a984792→336ee2e18ac9 |
| `prod-user` | `modules/waechter/prod-logic.ts` | user@host wird nicht erkannt | erkannt: 3 Test(s) rot · f0772a984792→39f5874024c4 |
| `prod-scp` | `modules/waechter/prod-logic.ts` | scp/rsync auf Prod gehen durch | erkannt: 7 Test(s) rot · f0772a984792→a7366c500127 |
| `prod-service` | `modules/waechter/prod-logic.ts` | systemctl restart auf Prod wird nicht gemeldet | erkannt: 1 Test(s) rot · f0772a984792→d9dfaa62b46b |
| `prod-sql-where` | `modules/waechter/prod-logic.ts` | DELETE mit WHERE gilt als zerstörerisch | erkannt: 2 Test(s) rot · f0772a984792→c75f9de77273 |
| `prod-sql-drop` | `modules/waechter/prod-logic.ts` | DROP TABLE geht durch | erkannt: 4 Test(s) rot · f0772a984792→4633cd424dce |
| `prod-plus` | `modules/waechter/prod-logic.ts` | +main als Force-Push übersehen | erkannt: 1 Test(s) rot · f0772a984792→b6cdb3f9260d |
| `prod-branch` | `modules/waechter/prod-logic.ts` | git push --force auf main ohne Refspec geht durch | erkannt: 2 Test(s) rot · f0772a984792→82fcc7d11512 |
| `prod-dry-drop` | `modules/waechter/prod-logic.ts` | Trockenlauf für DROP wird erfunden | erkannt: 1 Test(s) rot · f0772a984792→a32294410cdd |
| `prod-noui` | `modules/waechter/prod.ts` | ohne UI läuft ein Prod-Befehl ungefragt | erkannt: 1 Test(s) rot · 43cd6794755b→1059751ba894 |
| `prod-esc` | `modules/waechter/prod.ts` | Esc führt den Prod-Befehl aus | erkannt: 4 Test(s) rot · 43cd6794755b→7f1f2d482483 |
| `prod-rule` | `modules/waechter/prod.ts` | Hausregel (certbot) wird ignoriert | erkannt: 1 Test(s) rot · 43cd6794755b→66545444516f |
| `prod-unparsable` | `modules/waechter/prod.ts` | unlesbare Befehle mit Prod-Bezug gehen durch | erkannt: 1 Test(s) rot · 43cd6794755b→c54b58f7375d |
| `brake-rf` | `modules/waechter/brake-logic.ts` | rm -Rf / --recursive --force werden übersehen | erkannt: 1 Test(s) rot · c5e5e94be00e→17edbf909f0a |
| `brake-feeder` | `modules/waechter/brake-logic.ts` | xargs rm -rf wird still nicht gesichert | erkannt: 2 Test(s) rot · c5e5e94be00e→aa38362dcb48 |
| `brake-vars` | `modules/waechter/brake-logic.ts` | rm -rf "$X" wird ohne Rückfrage ausgeführt | erkannt: 2 Test(s) rot · c5e5e94be00e→528695e081bd |
| `brake-clean-n` | `modules/waechter/brake-logic.ts` | die Sicherung führt git clean echt aus | erkannt: 3 Test(s) rot · c5e5e94be00e→ad3c07fa131f |
| `brake-ref` | `modules/waechter/brake.ts` | Stash-Commit ohne Ref (gc räumt ihn weg) | erkannt: 1 Test(s) rot · 696c38ec6d78→cde9e0420de0 |
| `brake-untracked` | `modules/waechter/brake.ts` | git clean: ungetrackte Dateien nicht gesichert | erkannt: 2 Test(s) rot · 696c38ec6d78→3e14528340c7 |
| `brake-limit` | `modules/waechter/brake.ts` | Größenlimit ohne Rückfrage | erkannt: 1 Test(s) rot · 696c38ec6d78→aa3d73a594da |
| `brake-overwrite` | `modules/waechter/undo.ts` | /undo-last überschreibt ungefragt | erkannt: 1 Test(s) rot · c9789191761e→a150383abb25 |
| `brake-retention` | `modules/waechter/brake-logic.ts` | alte Schnappschüsse bleiben ewig | erkannt: 1 Test(s) rot · c5e5e94be00e→0dc2c14aa8e6 |
| `diet-range` | `modules/waechter/diet-logic.ts` | gezielte Reads werden trotzdem gekürzt / Endlosschleife | erkannt: 1 Test(s) rot · c25f29a9f97e→a53e774559b7 |
| `diet-guard` | `modules/waechter/diet.ts` | zweites Lesen derselben Datei wird wieder gekürzt | erkannt: 1 Test(s) rot · 08ba2897039d→fa5758856bd6 |
| `diet-tail` | `modules/waechter/diet.ts` | das Ende der Datei fehlt | erkannt: 1 Test(s) rot · 08ba2897039d→e421978c3482 |
| `fail-closed` | `core/dispatcher/dispatcher.ts` | ein gestörter Wächter lässt durch | erkannt: 2 Test(s) rot · 2dd64bedd25c→610dcb9cd3e7 |
| `deny-stops` | `core/dispatcher/dispatcher.ts` | eine Ablehnung wird ignoriert | erkannt: 1 Test(s) rot · 2dd64bedd25c→097e359c6c13 |
| `kill-first` | `core/dispatcher/dispatcher.ts` | der Notausschalter wirkt nicht im Dispatcher | erkannt: 1 Test(s) rot · 2dd64bedd25c→f0db19584443 |
| `step-order` | `core/dispatcher/dispatcher.ts` | die feste Reihenfolge gilt nicht | erkannt: 1 Test(s) rot · 2dd64bedd25c→4b1d4c45bf0f |
| `catch-guarded` | `core/dispatcher/dispatcher.ts` | der Kern-Ausfall lässt Bash durch | erkannt: 2 Test(s) rot · 2dd64bedd25c→12c9331de37b |
| `catch-ran` | `core/dispatcher/dispatcher.ts` | ein schon gelaufener Aufruf wird nachträglich abgelehnt | erkannt: 1 Test(s) rot · 2dd64bedd25c→309572dc82d5 |
| `disabled-off` | `core/dispatcher/dispatcher.ts` | abgeschaltete Module laufen weiter | erkannt: 1 Test(s) rot · 2dd64bedd25c→27f502a91476 |
| `kill-file` | `core/killswitch.ts` | die DISABLED-Datei wirkt nicht | erkannt: 2 Test(s) rot · da54bcf5bb3e→47f842ebc53c |
| `kill-env` | `core/killswitch.ts` | EXO_DISABLE wirkt nicht | erkannt: 1 Test(s) rot · da54bcf5bb3e→7319566b0932 |
| `kill-cache` | `core/killswitch.ts` | die Datei wird nach dem ersten Blick nie wieder geprüft | erkannt: 1 Test(s) rot · da54bcf5bb3e→efef0eb52577 |
| `rules-unknown` | `core/config/rules.ts` | Tippfehler in Regelfeldern fallen nicht auf | erkannt: 1 Test(s) rot · 5cc4df906ecb→c5321842b642 |
| `rules-fallback` | `core/config/rules.ts` | kaputte rules.json verliert die eingebauten Regeln | erkannt: 1 Test(s) rot · 5cc4df906ecb→98d8bafb942a |
