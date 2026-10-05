# Mutationsprobe

Stand 2026-10-05 · `npm run mutate` · 150/150 erkannt

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
| `self-off` | `core/dispatcher/dispatcher.ts` | Claude kann den Notausschalter selbst setzen | erkannt: 4 Test(s) rot · 3cfa860a8997→1b4e85a4d628 |
| `self-esc` | `core/dispatcher/dispatcher.ts` | Esc im Dialog erlaubt die Änderung | erkannt: 2 Test(s) rot · 3cfa860a8997→47baf30644bf |
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
| `eff-off` | `core/dispatcher/dispatcher.ts` | verschleierte Befehle setzen DISABLED unbemerkt | erkannt: 7 Test(s) rot · 3cfa860a8997→e6fd074cdf72 |
| `eff-esc` | `core/integrity.ts` | Esc behält die Änderung | erkannt: 5 Test(s) rot · a42ffb83bbd4→a8dd7626103e |
| `eff-noui` | `core/integrity.ts` | ohne UI bleibt die Änderung | erkannt: 1 Test(s) rot · a42ffb83bbd4→fd073fcf32a4 |
| `eff-disabled` | `core/integrity.ts` | DISABLED wird nicht bemerkt | erkannt: 6 Test(s) rot · a42ffb83bbd4→ea6b3c6265f5 |
| `eff-rules` | `core/integrity.ts` | rules.json-Änderung wird nicht bemerkt | erkannt: 1 Test(s) rot · a42ffb83bbd4→a96249138649 |
| `eff-settings` | `core/integrity.ts` | settings.json-Änderung wird nicht bemerkt | erkannt: 1 Test(s) rot · a42ffb83bbd4→50841466f564 |
| `eff-prefs` | `core/integrity.ts` | /exo-Schalter im Store unbemerkt geändert | erkannt: 1 Test(s) rot · a42ffb83bbd4→2ee677bc8c5b |
| `eff-keep-others` | `core/integrity.ts` | Rücksetzen löscht fremde Plugin-Einstellungen | erkannt: 1 Test(s) rot · a42ffb83bbd4→1636b14d3b6c |
| `eff-approved` | `core/dispatcher/dispatcher.ts` | nach Zulassen wird ein zweites Mal gefragt (und rückgängig gemacht) | erkannt: 2 Test(s) rot · 3cfa860a8997→2507b4f635a2 |
| `eff-approved-scope` | `core/dispatcher/dispatcher.ts` | ein Zulassen deckt auch andere Schalter | erkannt: 1 Test(s) rot · 3cfa860a8997→80c57664ae3c |
| `eff-approved-bash` | `core/dispatcher/dispatcher.ts` | ein Bash-Zulassen deckt die Wirkung | erkannt: 1 Test(s) rot · 3cfa860a8997→533894e4116c |
| `sec-anthropic` | `modules/waechter/secrets-logic.ts` | Anthropic-Schlüssel werden nicht erkannt | erkannt: 7 Test(s) rot · 86dbaf356b22→e367341e9924 |
| `sec-github` | `modules/waechter/secrets-logic.ts` | GitHub-Tokens werden nicht erkannt | erkannt: 4 Test(s) rot · 86dbaf356b22→24e10cef768c |
| `sec-pem` | `modules/waechter/secrets-logic.ts` | private Schlüssel werden nicht erkannt | erkannt: 1 Test(s) rot · 86dbaf356b22→7e2e3f414d9a |
| `sec-mask` | `modules/waechter/secrets-logic.ts` | Meldungen zeigen das Geheimnis im Klartext | erkannt: 11 Test(s) rot · 86dbaf356b22→0a7400a3068d |
| `sec-password` | `modules/waechter/secrets-logic.ts` | Passwörter in Zuweisungen fallen durch | erkannt: 1 Test(s) rot · 86dbaf356b22→40122cf02cee |
| `sec-entropy` | `modules/waechter/secrets-logic.ts` | Zeichenketten mit hoher Entropie fallen durch | erkannt: 1 Test(s) rot · 86dbaf356b22→74983d944bc7 |
| `sec-placeholder` | `modules/waechter/secrets-logic.ts` | Platzhalter lösen Fehlalarm aus | erkannt: 2 Test(s) rot · 86dbaf356b22→16233750927f |
| `sec-uuid` | `modules/waechter/secrets-logic.ts` | Hashes und UUIDs lösen Fehlalarm aus | erkannt: 1 Test(s) rot · 86dbaf356b22→4222b3d85984 |
| `sec-allow` | `modules/waechter/secrets-logic.ts` | exo-allow-secret wirkt nicht | erkannt: 1 Test(s) rot · 86dbaf356b22→f795129a01ac |
| `sec-diff-added` | `modules/waechter/secrets-logic.ts` | auch entfernte Zeilen gelten als Fund | erkannt: 1 Test(s) rot · 86dbaf356b22→b5b32712b278 |
| `sec-env` | `modules/waechter/secrets.ts` | ignorierte .env wird blockiert | erkannt: 1 Test(s) rot · fd2a60a2a137→94f1947cb34a |
| `sec-commit` | `modules/waechter/secrets.ts` | der Staging-Diff wird nicht geprüft | erkannt: 1 Test(s) rot · fd2a60a2a137→5b43acf6b013 |
| `sec-push` | `modules/waechter/secrets.ts` | zu pushende Commits werden nicht geprüft | erkannt: 1 Test(s) rot · fd2a60a2a137→af15fb23acac |
| `sec-redirect` | `modules/waechter/secrets.ts` | echo KEY > datei geht durch | erkannt: 1 Test(s) rot · fd2a60a2a137→fd8c4fec1169 |
| `sec-add-commit` | `modules/waechter/secrets.ts` | git add -A && git commit: neue Dateien ungeprüft | erkannt: 1 Test(s) rot · fd2a60a2a137→6fd70cbcbc9b |
| `prod-alias` | `modules/waechter/prod-logic.ts` | ssh-Aliase auf Prod werden nicht erkannt | erkannt: 4 Test(s) rot · d944a7c16138→36c5f167ba14 |
| `prod-user` | `modules/waechter/prod-logic.ts` | user@host wird nicht erkannt | erkannt: 4 Test(s) rot · d944a7c16138→a4b0af6ff078 |
| `prod-scp` | `modules/waechter/prod-logic.ts` | scp/rsync auf Prod gehen durch | erkannt: 8 Test(s) rot · d944a7c16138→40bf6f1df426 |
| `prod-service` | `modules/waechter/prod-logic.ts` | systemctl restart auf Prod wird nicht gemeldet | erkannt: 1 Test(s) rot · d944a7c16138→cf3eac70c74b |
| `prod-sql-where` | `modules/waechter/prod-logic.ts` | DELETE mit WHERE gilt als zerstörerisch | erkannt: 2 Test(s) rot · d944a7c16138→da36199dc239 |
| `prod-sql-drop` | `modules/waechter/prod-logic.ts` | DROP TABLE geht durch | erkannt: 4 Test(s) rot · d944a7c16138→664d543cc180 |
| `prod-plus` | `modules/waechter/prod-logic.ts` | +main als Force-Push übersehen | erkannt: 1 Test(s) rot · d944a7c16138→5ecac0190fd2 |
| `prod-branch` | `modules/waechter/prod-logic.ts` | git push --force auf main ohne Refspec geht durch | erkannt: 2 Test(s) rot · d944a7c16138→5600d96b1e59 |
| `prod-dry-drop` | `modules/waechter/prod-logic.ts` | Trockenlauf für DROP wird erfunden | erkannt: 1 Test(s) rot · d944a7c16138→059dce07ac90 |
| `prod-noui` | `modules/waechter/prod.ts` | ohne UI läuft ein Prod-Befehl ungefragt | erkannt: 1 Test(s) rot · 43cd6794755b→1059751ba894 |
| `prod-esc` | `modules/waechter/prod.ts` | Esc führt den Prod-Befehl aus | erkannt: 4 Test(s) rot · 43cd6794755b→7f1f2d482483 |
| `prod-rule` | `modules/waechter/prod.ts` | Hausregel (certbot) wird ignoriert | erkannt: 1 Test(s) rot · 43cd6794755b→66545444516f |
| `prod-unparsable` | `modules/waechter/prod.ts` | unlesbare Befehle mit Prod-Bezug gehen durch | erkannt: 1 Test(s) rot · 43cd6794755b→c54b58f7375d |
| `prod-jump` | `modules/waechter/prod-logic.ts` | ssh -J/-o HostName auf Prod geht durch | erkannt: 1 Test(s) rot · d944a7c16138→65b443054afa |
| `prod-dot` | `modules/waechter/prod-logic.ts` | vps. mit Schlusspunkt geht durch | erkannt: 1 Test(s) rot · d944a7c16138→1cb4a172f4b2 |
| `brake-rf` | `modules/waechter/brake-logic.ts` | rm -Rf / --recursive --force werden übersehen | erkannt: 1 Test(s) rot · 92de5803b6ef→2797a5fd732b |
| `brake-feeder` | `modules/waechter/brake-logic.ts` | xargs rm -rf wird still nicht gesichert | erkannt: 2 Test(s) rot · 92de5803b6ef→4a605f789873 |
| `brake-vars` | `modules/waechter/brake-logic.ts` | rm -rf "$X" wird ohne Rückfrage ausgeführt | erkannt: 2 Test(s) rot · 92de5803b6ef→16fd6cde90b1 |
| `brake-clean-n` | `modules/waechter/brake-logic.ts` | die Sicherung führt git clean echt aus | erkannt: 3 Test(s) rot · 92de5803b6ef→191598add99b |
| `brake-ref` | `modules/waechter/brake.ts` | Stash-Commit ohne Ref (gc räumt ihn weg) | erkannt: 1 Test(s) rot · 696c38ec6d78→cde9e0420de0 |
| `brake-untracked` | `modules/waechter/brake.ts` | git clean: ungetrackte Dateien nicht gesichert | erkannt: 2 Test(s) rot · 696c38ec6d78→3e14528340c7 |
| `brake-limit` | `modules/waechter/brake.ts` | Größenlimit ohne Rückfrage | erkannt: 1 Test(s) rot · 696c38ec6d78→aa3d73a594da |
| `brake-overwrite` | `modules/waechter/undo.ts` | /undo-last überschreibt ungefragt | erkannt: 1 Test(s) rot · e685310d960f→fcb1c640536d |
| `brake-retention` | `modules/waechter/brake-logic.ts` | alte Schnappschüsse bleiben ewig | erkannt: 1 Test(s) rot · 92de5803b6ef→10eccc71b34c |
| `diet-range` | `modules/waechter/diet-logic.ts` | gezielte Reads werden trotzdem gekürzt / Endlosschleife | erkannt: 1 Test(s) rot · c25f29a9f97e→a53e774559b7 |
| `diet-guard` | `modules/waechter/diet.ts` | zweites Lesen derselben Datei wird wieder gekürzt | erkannt: 1 Test(s) rot · 08ba2897039d→fa5758856bd6 |
| `diet-tail` | `modules/waechter/diet.ts` | das Ende der Datei fehlt | erkannt: 1 Test(s) rot · 08ba2897039d→e421978c3482 |
| `sec-name-parts` | `modules/waechter/secrets-logic.ts` | passed/compass/bypass gelten als Passwort (Fehlalarm, live erlebt) | erkannt: 4 Test(s) rot · 86dbaf356b22→87159880da9c |
| `tl-debounce` | `modules/cockpit/testlight.ts` | jede Änderung startet sofort einen Testlauf | erkannt: 2 Test(s) rot · 3727cc440ed9→89ab61423261 |
| `tl-nice` | `modules/cockpit/testlight.ts` | Hintergrundtests mit voller Priorität | erkannt: 1 Test(s) rot · 3727cc440ed9→4a0c375f515a |
| `tl-claude-wait` | `modules/cockpit/testlight.ts` | Testampel läuft parallel zu Claudes eigenem Testlauf | erkannt: 1 Test(s) rot · 3727cc440ed9→81b630f34282 |
| `tl-cut` | `modules/cockpit/testlight.ts` | veralteter Lauf wird nicht abgebrochen | erkannt: 1 Test(s) rot · 3727cc440ed9→a34cbcf9f75f |
| `tl-once` | `modules/cockpit/testlight.ts` | rote Tests in jedem Prompt erneut | erkannt: 1 Test(s) rot · 3727cc440ed9→5ffa4e2c2509 |
| `tl-project` | `modules/cockpit/testlight.ts` | Änderungen außerhalb des Projekts lösen Tests aus | erkannt: 1 Test(s) rot · 3727cc440ed9→a37d8a823791 |
| `tl-vitest` | `modules/cockpit/testlight-logic.ts` | vitest-Fehlschläge werden nicht gezählt | erkannt: 1 Test(s) rot · bdf1e85975ce→ad863d2ff12e |
| `tl-ssh` | `modules/cockpit/testlight-logic.ts` | Tests auf einem anderen Rechner gelten als lokale | erkannt: 1 Test(s) rot · bdf1e85975ce→72784b768c6f |
| `dc-files` | `modules/cockpit/donecheck.ts` | Warnung auch ohne Dateiänderung | erkannt: 1 Test(s) rot · 40a8f3756d55→290615c8fae8 |
| `dc-after` | `modules/cockpit/donecheck.ts` | ein grüner Lauf vor der letzten Änderung zählt | erkannt: 1 Test(s) rot · 40a8f3756d55→72bae0c51e7c |
| `dc-reason` | `modules/cockpit/donecheck.ts` | Warnung auch bei abgebrochenen Turns | erkannt: 1 Test(s) rot · 40a8f3756d55→2b701100e015 |
| `sb-first-touch` | `modules/cockpit/sidebar.ts` | Ausgangsstand wird bei jeder Änderung überschrieben | erkannt: 1 Test(s) rot · bb5607acc591→7a102502ed82 |
| `sb-snapshot` | `modules/cockpit/sidebar.ts` | Zurücksetzen ohne Schnappschuss | erkannt: 1 Test(s) rot · bb5607acc591→c99750ab1094 |
| `sb-ask` | `modules/cockpit/sidebar.ts` | Zurücksetzen ohne Rückfrage | erkannt: 1 Test(s) rot · bb5607acc591→09ed5b337ea5 |
| `sb-persist` | `modules/cockpit/sidebar.ts` | Ausgangsstände gehen beim Neuladen verloren | erkannt: 1 Test(s) rot · bb5607acc591→4e0a0bbc3e33 |
| `ci-once` | `modules/cockpit/ci.ts` | Toast bei jedem Abruf erneut | erkannt: 1 Test(s) rot · 00aba8d9b363→3dffbf619a00 |
| `ci-idle` | `modules/cockpit/ci.ts` | CI wird auch in ruhenden Sitzungen abgefragt | erkannt: 1 Test(s) rot · 00aba8d9b363→b32986d6463c |
| `ci-backoff` | `modules/cockpit/ci.ts` | kein Backoff bei Fehlern | erkannt: 1 Test(s) rot · 00aba8d9b363→acac5122ad4e |
| `core-filechanged` | `core/dispatcher/dispatcher.ts` | Dateiänderungen landen nicht im Journal | erkannt: 1 Test(s) rot · 3cfa860a8997→42c1c17d2230 |
| `tl-consent` | `modules/cockpit/testlight.ts` | Projektbefehle laufen ohne Zustimmung | erkannt: 3 Test(s) rot · 3727cc440ed9→1c46098f7cc0 |
| `tl-consent-fp` | `modules/cockpit/testlight.ts` | geänderte Test-Konfiguration läuft ohne neue Frage | erkannt: 1 Test(s) rot · 3727cc440ed9→dfe31b31d3d9 |
| `tl-noui` | `modules/cockpit/testlight.ts` | ohne UI wird trotzdem gefragt/gestartet | erkannt: 1 Test(s) rot · 3727cc440ed9→e81f59c379f2 |
| `tl-effects` | `modules/cockpit/testlight.ts` | Testlauf schaltet exo unbemerkt ab | erkannt: 1 Test(s) rot · 3727cc440ed9→8e872dd0b181 |
| `tl-argv-dot` | `modules/cockpit/testlight-logic.ts` | Dateinamen werden als Optionen gelesen | erkannt: 2 Test(s) rot · bdf1e85975ce→069d976af6f5 |
| `sec-name-core` | `modules/waechter/secrets-logic.ts` | dbpassword/rootpwd rutschen durch | erkannt: 1 Test(s) rot · 86dbaf356b22→2fc0fe177ad7 |
| `sec-name-digits` | `modules/waechter/secrets-logic.ts` | pass123 rutscht durch | erkannt: 1 Test(s) rot · 86dbaf356b22→f7bf63b73e29 |
| `h-gap` | `modules/rueckblick/hours-logic.ts` | Pausen zählen als Arbeitszeit | erkannt: 1 Test(s) rot · 35599ebfc61d→4634fffb0d90 |
| `h-project` | `modules/rueckblick/hours-logic.ts` | Projektwechsel wird dem neuen Projekt angerechnet | erkannt: 1 Test(s) rot · 35599ebfc61d→062e02ee4819 |
| `h-prune` | `modules/rueckblick/hours-logic.ts` | alte Tage bleiben ewig | erkannt: 1 Test(s) rot · 35599ebfc61d→1a3ba479868f |
| `r-once` | `modules/rueckblick/recap.ts` | Hinweis „Letzte Sitzung“ erscheint jedes Mal | erkannt: 1 Test(s) rot · e08c628ddf5c→4ef4cb304c08 |
| `r-week` | `modules/rueckblick/recap.ts` | Hinweis auch nach mehr als sieben Tagen | erkannt: 1 Test(s) rot · e08c628ddf5c→b3e5f14bdda9 |
| `r-same` | `modules/rueckblick/recap.ts` | Hinweis auf die eigene, laufende Sitzung | erkannt: 1 Test(s) rot · e08c628ddf5c→5b95e7b9119b |
| `r-empty` | `modules/rueckblick/recap.ts` | leere Sitzungen verdrängen echte | erkannt: 1 Test(s) rot · e08c628ddf5c→757901aef071 |
| `l-ticked` | `modules/rueckblick/recap.ts` | Lehren werden ohne Häkchen geschrieben | erkannt: 1 Test(s) rot · e08c628ddf5c→8a573a73406a |
| `l-esc` | `modules/rueckblick/recap.ts` | Esc schreibt alle Lehren | erkannt: 1 Test(s) rot · e08c628ddf5c→5311579f624b |
| `l-dup` | `modules/rueckblick/recap.ts` | Dubletten zur CLAUDE.md werden erneut angeboten | erkannt: 1 Test(s) rot · e08c628ddf5c→33dd354e1452 |
| `l-code` | `modules/rueckblick/recap-logic.ts` | Code-Blöcke liefern Scheinlehren | erkannt: 1 Test(s) rot · 4722f61a350e→04a7177447fe |
| `l-label` | `modules/rueckblick/recap-logic.ts` | Label ist ein abgeschnittener Text (Kommas, nicht vollständig gelesen) | erkannt: 2 Test(s) rot · 4722f61a350e→a2cf508dd19f |
| `l-sanitize` | `modules/rueckblick/recap-logic.ts` | Markup/HTML landet in der CLAUDE.md | erkannt: 1 Test(s) rot · 4722f61a350e→5b4033e68c54 |
| `l-fulltext` | `modules/rueckblick/recap.ts` | angekreuzt wird, was nicht vollständig zu lesen war | erkannt: 1 Test(s) rot · e08c628ddf5c→4ca87e6ddbc0 |
| `safe-lessons` | `modules/rueckblick/recap.ts` | Lehren über einen Symlink nach ~/.bashrc | erkannt: 1 Test(s) rot · e08c628ddf5c→968d29f6fb06 |
| `safe-md` | `modules/rueckblick/recap.ts` | /recap md schreibt über einen Symlink nach /etc | erkannt: 1 Test(s) rot · e08c628ddf5c→5f182655c8cd |
| `fail-closed` | `core/dispatcher/dispatcher.ts` | ein gestörter Wächter lässt durch | erkannt: 2 Test(s) rot · 3cfa860a8997→15e5bf55b34b |
| `deny-stops` | `core/dispatcher/dispatcher.ts` | eine Ablehnung wird ignoriert | erkannt: 1 Test(s) rot · 3cfa860a8997→8e0a98cf0258 |
| `kill-first` | `core/dispatcher/dispatcher.ts` | der Notausschalter wirkt nicht im Dispatcher | erkannt: 1 Test(s) rot · 3cfa860a8997→85d43cf6cdb6 |
| `step-order` | `core/dispatcher/dispatcher.ts` | die feste Reihenfolge gilt nicht | erkannt: 1 Test(s) rot · 3cfa860a8997→84bcbadbf8a0 |
| `catch-guarded` | `core/dispatcher/dispatcher.ts` | der Kern-Ausfall lässt Bash durch | erkannt: 2 Test(s) rot · 3cfa860a8997→22bc7f70c831 |
| `catch-ran` | `core/dispatcher/dispatcher.ts` | ein schon gelaufener Aufruf wird nachträglich abgelehnt | erkannt: 1 Test(s) rot · 3cfa860a8997→18b891a7f2f6 |
| `disabled-off` | `core/dispatcher/dispatcher.ts` | abgeschaltete Module laufen weiter | erkannt: 1 Test(s) rot · 3cfa860a8997→c0121b3116f7 |
| `kill-file` | `core/killswitch.ts` | die DISABLED-Datei wirkt nicht | erkannt: 2 Test(s) rot · da54bcf5bb3e→47f842ebc53c |
| `kill-env` | `core/killswitch.ts` | EXO_DISABLE wirkt nicht | erkannt: 1 Test(s) rot · da54bcf5bb3e→7319566b0932 |
| `kill-cache` | `core/killswitch.ts` | die Datei wird nach dem ersten Blick nie wieder geprüft | erkannt: 1 Test(s) rot · da54bcf5bb3e→efef0eb52577 |
| `rules-unknown` | `core/config/rules.ts` | Tippfehler in Regelfeldern fallen nicht auf | erkannt: 1 Test(s) rot · 5cc4df906ecb→c5321842b642 |
| `rules-fallback` | `core/config/rules.ts` | kaputte rules.json verliert die eingebauten Regeln | erkannt: 1 Test(s) rot · 5cc4df906ecb→98d8bafb942a |
