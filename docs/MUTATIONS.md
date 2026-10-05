# Mutationsprobe

Stand 2026-10-05 · `npm run mutate` · 46/46 erkannt

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
| `self-off` | `core/dispatcher/dispatcher.ts` | Claude kann den Notausschalter selbst setzen | erkannt: 4 Test(s) rot · 5b3bdc0c754a→a4ee0ffa5891 |
| `self-esc` | `core/dispatcher/dispatcher.ts` | Esc im Dialog erlaubt die Änderung | erkannt: 2 Test(s) rot · 5b3bdc0c754a→b004913adb70 |
| `self-path` | `core/selfprotect.ts` | Write auf ~/.claude/exo/ geht ungefragt durch | erkannt: 7 Test(s) rot · 0b7630b0c2a1→cc376e5daf7b |
| `self-readonly` | `core/selfprotect.ts` | jeder Bash-Befehl gilt als nur lesend | erkannt: 21 Test(s) rot · 0b7630b0c2a1→0b3eb2ad39c0 |
| `self-settings` | `core/selfprotect.ts` | exo-Optionen in settings.json gehen ungefragt durch | erkannt: 3 Test(s) rot · 0b7630b0c2a1→ffebd3d09df0 |
| `self-cooked` | `core/selfprotect.ts` | DIS""ABLED umgeht die Erkennung | erkannt: 2 Test(s) rot · 0b7630b0c2a1→7209730afa31 |
| `self-bare-name` | `core/selfprotect.ts` | cd in einem Aufruf, touch DISABLED im nächsten | erkannt: 3 Test(s) rot · 0b7630b0c2a1→8555e931f0e2 |
| `self-redir-amp` | `core/selfprotect.ts` | >&datei gilt als lesend | erkannt: 2 Test(s) rot · 0b7630b0c2a1→903796a5b66e |
| `self-norm` | `core/selfprotect.ts` | // ./ ../ und Großschreibung umgehen den Pfadvergleich | erkannt: 5 Test(s) rot · 0b7630b0c2a1→07015e802eff |
| `self-unknown-tool` | `core/selfprotect.ts` | MCP-Werkzeuge schreiben ungefragt in ~/.claude/exo | erkannt: 2 Test(s) rot · 0b7630b0c2a1→2a5125b4701b |
| `self-symlink` | `core/selfprotect.ts` | ein Symlink nach ~/.claude/exo umgeht den Schutz | erkannt: 1 Test(s) rot · 0b7630b0c2a1→77b9287c02fb |
| `fail-closed` | `core/dispatcher/dispatcher.ts` | ein gestörter Wächter lässt durch | erkannt: 2 Test(s) rot · 5b3bdc0c754a→9d9c4bc46eac |
| `deny-stops` | `core/dispatcher/dispatcher.ts` | eine Ablehnung wird ignoriert | erkannt: 1 Test(s) rot · 5b3bdc0c754a→169d2f6e36d6 |
| `kill-first` | `core/dispatcher/dispatcher.ts` | der Notausschalter wirkt nicht im Dispatcher | erkannt: 1 Test(s) rot · 5b3bdc0c754a→8004cddfcf49 |
| `step-order` | `core/dispatcher/dispatcher.ts` | die feste Reihenfolge gilt nicht | erkannt: 1 Test(s) rot · 5b3bdc0c754a→bcd2940c9cb0 |
| `catch-guarded` | `core/dispatcher/dispatcher.ts` | der Kern-Ausfall lässt Bash durch | erkannt: 1 Test(s) rot · 5b3bdc0c754a→a5a71abbb0ba |
| `catch-ran` | `core/dispatcher/dispatcher.ts` | ein schon gelaufener Aufruf wird nachträglich abgelehnt | erkannt: 1 Test(s) rot · 5b3bdc0c754a→04de86874d3a |
| `disabled-off` | `core/dispatcher/dispatcher.ts` | abgeschaltete Module laufen weiter | erkannt: 1 Test(s) rot · 5b3bdc0c754a→f31d3266ef1a |
| `kill-file` | `core/killswitch.ts` | die DISABLED-Datei wirkt nicht | erkannt: 2 Test(s) rot · da54bcf5bb3e→47f842ebc53c |
| `kill-env` | `core/killswitch.ts` | EXO_DISABLE wirkt nicht | erkannt: 1 Test(s) rot · da54bcf5bb3e→7319566b0932 |
| `kill-cache` | `core/killswitch.ts` | die Datei wird nach dem ersten Blick nie wieder geprüft | erkannt: 1 Test(s) rot · da54bcf5bb3e→efef0eb52577 |
| `rules-unknown` | `core/config/rules.ts` | Tippfehler in Regelfeldern fallen nicht auf | erkannt: 1 Test(s) rot · 5cc4df906ecb→c5321842b642 |
| `rules-fallback` | `core/config/rules.ts` | kaputte rules.json verliert die eingebauten Regeln | erkannt: 1 Test(s) rot · 5cc4df906ecb→98d8bafb942a |
