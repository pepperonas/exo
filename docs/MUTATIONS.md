# Mutation probe

As of 2026-10-05 · `npm run mutate` · 165/165 caught

Each row breaks one safety-relevant behaviour on purpose. *caught* means: the mutation provably took effect (checksum before → after) and the named tests turned red. *INVALID* means the anchor moved or the mutant does not run; *BLIND* means all tests stayed green — a weak test or redundant code.

| Mutation | File | Breaks | Result |
|---|---|---|---|
| `sq-quote` | `core/shell/parse.ts` | single quotes stay in the word | caught: 6 test(s) red · 06f53ae83c3c→2cefc4ccb169 |
| `and-op` | `core/shell/parse.ts` | && is not recognised as an operator | caught: 10 test(s) red · 06f53ae83c3c→d1ead4fdf1c7 |
| `dq-escape` | `core/shell/parse.ts` | escapes inside double quotes | caught: 3 test(s) red · 06f53ae83c3c→9cd6190f6a8e |
| `cmdsub` | `core/shell/parse.ts` | $(…) is not captured as a command | caught: 12 test(s) red · 06f53ae83c3c→b98bfe668b1c |
| `backtick` | `core/shell/parse.ts` | backticks are not captured as a command | caught: 3 test(s) red · 06f53ae83c3c→7834415b4f4f |
| `heredoc-tabs` | `core/shell/parse.ts` | <<- with tabs does not find its end | caught: 1 test(s) red · 06f53ae83c3c→5c228931da2d |
| `trailing-and` | `core/shell/parse.ts` | `a &&` counts as complete | caught: 1 test(s) red · 06f53ae83c3c→f187a9c8c451 |
| `redirect-fd` | `core/shell/parse.ts` | file descriptor of a redirect is lost | caught: 1 test(s) red · 06f53ae83c3c→e6b1f4b85692 |
| `glob-flag` | `core/shell/parse.ts` | globs are not marked | caught: 1 test(s) red · 06f53ae83c3c→c8958910060d |
| `bash-c` | `core/shell/words.ts` | bash -c "…" is not inspected | caught: 10 test(s) red · 9fbadc5692e4→e889f5e8b743 |
| `ssh-remote` | `core/shell/words.ts` | the remote command of ssh is not inspected | caught: 12 test(s) red · 9fbadc5692e4→2629a9cd9086 |
| `ssh-user` | `core/shell/words.ts` | user@host is not split into host and user | caught: 2 test(s) red · 9fbadc5692e4→a48df7ee4cf4 |
| `sudo-peel` | `core/shell/words.ts` | sudo is not peeled off | caught: 9 test(s) red · 9fbadc5692e4→0c8eb6412c8e |
| `xargs-peel` | `core/shell/words.ts` | xargs rm is not recognised as rm | caught: 2 test(s) red · 9fbadc5692e4→afdb8e8a8221 |
| `subst-cmds` | `core/shell/words.ts` | commands inside substitutions are missing | caught: 16 test(s) red · 9fbadc5692e4→0d947cd21d49 |
| `summary-args` | `core/shell/words.ts` | summary contains arguments (secrets could reach the journal) | caught: 1 test(s) red · 9fbadc5692e4→4cc7446b5875 |
| `arith-subs` | `core/shell/parse.ts` | commands inside $(( … )) stay invisible | caught: 3 test(s) red · 06f53ae83c3c→2e0339cf2829 |
| `arith-depth` | `core/shell/parse.ts` | nested parentheses end arithmetic too early | caught: 3 test(s) red · 06f53ae83c3c→21675d1b3cd1 |
| `arith-fallback` | `core/shell/parse.ts` | $((cmd) ) is not read as a command | caught: 1 test(s) red · 06f53ae83c3c→c4ab7afcd1bc |
| `brace-subs` | `core/shell/parse.ts` | commands inside ${x:-$(…)} stay invisible | caught: 3 test(s) red · 06f53ae83c3c→516d4b00584f |
| `brace-quoted` | `core/shell/parse.ts` | commands inside ${x:-'$(…)'} stay invisible | caught: 1 test(s) red · 06f53ae83c3c→86a2a92e373e |
| `ssh-proxy` | `core/shell/words.ts` | ssh -o ProxyCommand runs locally, unseen | caught: 4 test(s) red · 9fbadc5692e4→4063935d2950 |
| `find-exec` | `core/shell/words.ts` | find -exec rm stays invisible | caught: 2 test(s) red · 9fbadc5692e4→0f650e186169 |
| `self-off` | `core/dispatcher/dispatcher.ts` | Claude can set the kill switch itself | caught: 4 test(s) red · 3cfa860a8997→1b4e85a4d628 |
| `self-esc` | `core/dispatcher/dispatcher.ts` | Esc in the dialog allows the change | caught: 2 test(s) red · 3cfa860a8997→47baf30644bf |
| `self-path` | `core/selfprotect.ts` | Write to ~/.claude/exo/ passes without asking | caught: 7 test(s) red · c6cccd80c901→359106802ea0 |
| `self-readonly` | `core/selfprotect.ts` | every Bash command counts as read-only | caught: 29 test(s) red · c6cccd80c901→5a6bb51aed35 |
| `self-settings` | `core/selfprotect.ts` | exo options in settings.json pass without asking | caught: 3 test(s) red · c6cccd80c901→f158215223ee |
| `self-cooked` | `core/selfprotect.ts` | DIS""ABLED bypasses detection | caught: 2 test(s) red · c6cccd80c901→2c137dbf0cb2 |
| `self-bare-name` | `core/selfprotect.ts` | cd in one call, touch DISABLED in the next | caught: 3 test(s) red · c6cccd80c901→45f3821d550e |
| `self-redir-amp` | `core/selfprotect.ts` | >&file counts as reading | caught: 2 test(s) red · c6cccd80c901→35cff345d58c |
| `self-norm` | `core/selfprotect.ts` | // ./ ../ and upper case bypass the path comparison | caught: 5 test(s) red · c6cccd80c901→da15fe7a9462 |
| `self-unknown-tool` | `core/selfprotect.ts` | MCP tools write to ~/.claude/exo without asking | caught: 2 test(s) red · c6cccd80c901→dd1452e36850 |
| `self-symlink` | `core/selfprotect.ts` | a symlink to ~/.claude/exo bypasses the protection | caught: 1 test(s) red · c6cccd80c901→6b2071dbba44 |
| `self-glob` | `core/selfprotect.ts` | touch DIS* bypasses the protection | caught: 3 test(s) red · c6cccd80c901→ca00e8f51bb4 |
| `self-expansion` | `core/selfprotect.ts` | path pieces in variables bypass the protection | caught: 1 test(s) red · c6cccd80c901→81b1b9e90895 |
| `self-opaque` | `core/selfprotect.ts` | base64 -d | sh bypasses the protection | caught: 1 test(s) red · c6cccd80c901→28de1fc5789b |
| `self-unresolved` | `core/selfprotect.ts` | an unresolvable path counts as harmless | caught: 1 test(s) red · c6cccd80c901→b208c0d482f2 |
| `self-pluginconfigs` | `core/selfprotect.ts` | exo options via a symlink to settings.json | caught: 1 test(s) red · c6cccd80c901→836d1447084e |
| `self-cwd-dir` | `core/selfprotect.ts` | cd ~/.claude/exo, then touch x | caught: 1 test(s) red · c6cccd80c901→312b313df429 |
| `self-cwd-rel` | `core/selfprotect.ts` | relative targets into ~/.claude/exo | caught: 1 test(s) red · c6cccd80c901→30ac45d7ca23 |
| `self-cwd-after` | `core/selfprotect.ts` | cd inside the command is missed | caught: 1 test(s) red · c6cccd80c901→bb18881ba01f |
| `eff-off` | `core/dispatcher/dispatcher.ts` | obfuscated commands set DISABLED unnoticed | caught: 7 test(s) red · 3cfa860a8997→e6fd074cdf72 |
| `eff-esc` | `core/integrity.ts` | Esc keeps the change | caught: 5 test(s) red · a42ffb83bbd4→a8dd7626103e |
| `eff-noui` | `core/integrity.ts` | without UI the change stays | caught: 1 test(s) red · a42ffb83bbd4→fd073fcf32a4 |
| `eff-disabled` | `core/integrity.ts` | DISABLED is not noticed | caught: 6 test(s) red · a42ffb83bbd4→ea6b3c6265f5 |
| `eff-rules` | `core/integrity.ts` | rules.json change is not noticed | caught: 1 test(s) red · a42ffb83bbd4→a96249138649 |
| `eff-settings` | `core/integrity.ts` | settings.json change is not noticed | caught: 1 test(s) red · a42ffb83bbd4→50841466f564 |
| `eff-prefs` | `core/integrity.ts` | /exo switches changed in the store unnoticed | caught: 1 test(s) red · a42ffb83bbd4→2ee677bc8c5b |
| `eff-keep-others` | `core/integrity.ts` | reset deletes other plugins' settings | caught: 1 test(s) red · a42ffb83bbd4→1636b14d3b6c |
| `eff-approved` | `core/dispatcher/dispatcher.ts` | after allowing, it asks a second time (and reverts) | caught: 2 test(s) red · 3cfa860a8997→2507b4f635a2 |
| `eff-approved-scope` | `core/dispatcher/dispatcher.ts` | one allow also covers other switches | caught: 1 test(s) red · 3cfa860a8997→80c57664ae3c |
| `eff-approved-bash` | `core/dispatcher/dispatcher.ts` | a Bash allow covers the effect | caught: 1 test(s) red · 3cfa860a8997→533894e4116c |
| `sec-anthropic` | `modules/waechter/secrets-logic.ts` | Anthropic keys are not detected | caught: 7 test(s) red · 86dbaf356b22→e367341e9924 |
| `sec-github` | `modules/waechter/secrets-logic.ts` | GitHub tokens are not detected | caught: 4 test(s) red · 86dbaf356b22→24e10cef768c |
| `sec-pem` | `modules/waechter/secrets-logic.ts` | private keys are not detected | caught: 1 test(s) red · 86dbaf356b22→7e2e3f414d9a |
| `sec-mask` | `modules/waechter/secrets-logic.ts` | messages show the secret in plain text | caught: 11 test(s) red · 86dbaf356b22→0a7400a3068d |
| `sec-password` | `modules/waechter/secrets-logic.ts` | passwords in assignments slip through | caught: 1 test(s) red · 86dbaf356b22→40122cf02cee |
| `sec-entropy` | `modules/waechter/secrets-logic.ts` | high-entropy strings slip through | caught: 1 test(s) red · 86dbaf356b22→74983d944bc7 |
| `sec-placeholder` | `modules/waechter/secrets-logic.ts` | placeholders trigger false alarms | caught: 2 test(s) red · 86dbaf356b22→16233750927f |
| `sec-uuid` | `modules/waechter/secrets-logic.ts` | hashes and UUIDs trigger false alarms | caught: 1 test(s) red · 86dbaf356b22→4222b3d85984 |
| `sec-allow` | `modules/waechter/secrets-logic.ts` | exo-allow-secret has no effect | caught: 1 test(s) red · 86dbaf356b22→f795129a01ac |
| `sec-diff-added` | `modules/waechter/secrets-logic.ts` | removed lines also count as findings | caught: 1 test(s) red · 86dbaf356b22→b5b32712b278 |
| `sec-env` | `modules/waechter/secrets.ts` | ignored .env is blocked | caught: 1 test(s) red · fd2a60a2a137→94f1947cb34a |
| `sec-commit` | `modules/waechter/secrets.ts` | the staged diff is not checked | caught: 1 test(s) red · fd2a60a2a137→5b43acf6b013 |
| `sec-push` | `modules/waechter/secrets.ts` | commits to be pushed are not checked | caught: 1 test(s) red · fd2a60a2a137→af15fb23acac |
| `sec-redirect` | `modules/waechter/secrets.ts` | echo KEY > file passes | caught: 1 test(s) red · fd2a60a2a137→fd8c4fec1169 |
| `sec-add-commit` | `modules/waechter/secrets.ts` | git add -A && git commit: new files unchecked | caught: 1 test(s) red · fd2a60a2a137→6fd70cbcbc9b |
| `prod-alias` | `modules/waechter/prod-logic.ts` | ssh aliases to prod are not detected | caught: 4 test(s) red · d944a7c16138→36c5f167ba14 |
| `prod-user` | `modules/waechter/prod-logic.ts` | user@host is not detected | caught: 4 test(s) red · d944a7c16138→a4b0af6ff078 |
| `prod-scp` | `modules/waechter/prod-logic.ts` | scp/rsync to prod pass | caught: 8 test(s) red · d944a7c16138→40bf6f1df426 |
| `prod-service` | `modules/waechter/prod-logic.ts` | systemctl restart on prod is not reported | caught: 1 test(s) red · d944a7c16138→cf3eac70c74b |
| `prod-sql-where` | `modules/waechter/prod-logic.ts` | DELETE with WHERE counts as destructive | caught: 2 test(s) red · d944a7c16138→da36199dc239 |
| `prod-sql-drop` | `modules/waechter/prod-logic.ts` | DROP TABLE passes | caught: 4 test(s) red · d944a7c16138→664d543cc180 |
| `prod-plus` | `modules/waechter/prod-logic.ts` | +main missed as a force push | caught: 1 test(s) red · d944a7c16138→5ecac0190fd2 |
| `prod-branch` | `modules/waechter/prod-logic.ts` | git push --force to main without refspec passes | caught: 2 test(s) red · d944a7c16138→5600d96b1e59 |
| `prod-dry-drop` | `modules/waechter/prod-logic.ts` | a dry run for DROP is invented | caught: 1 test(s) red · d944a7c16138→059dce07ac90 |
| `prod-noui` | `modules/waechter/prod.ts` | without UI a prod command runs without asking | caught: 1 test(s) red · 43cd6794755b→1059751ba894 |
| `prod-esc` | `modules/waechter/prod.ts` | Esc runs the prod command | caught: 4 test(s) red · 43cd6794755b→7f1f2d482483 |
| `prod-rule` | `modules/waechter/prod.ts` | house rule (certbot) is ignored | caught: 1 test(s) red · 43cd6794755b→66545444516f |
| `prod-unparsable` | `modules/waechter/prod.ts` | unreadable commands referencing prod pass | caught: 1 test(s) red · 43cd6794755b→c54b58f7375d |
| `prod-jump` | `modules/waechter/prod-logic.ts` | ssh -J/-o HostName to prod passes | caught: 1 test(s) red · d944a7c16138→65b443054afa |
| `prod-dot` | `modules/waechter/prod-logic.ts` | vps. with trailing dot passes | caught: 1 test(s) red · d944a7c16138→1cb4a172f4b2 |
| `brake-rf` | `modules/waechter/brake-logic.ts` | rm -Rf / --recursive --force are missed | caught: 1 test(s) red · 92de5803b6ef→2797a5fd732b |
| `brake-feeder` | `modules/waechter/brake-logic.ts` | xargs rm -rf is silently not backed up | caught: 2 test(s) red · 92de5803b6ef→4a605f789873 |
| `brake-vars` | `modules/waechter/brake-logic.ts` | rm -rf "$X" runs without asking | caught: 2 test(s) red · 92de5803b6ef→16fd6cde90b1 |
| `brake-clean-n` | `modules/waechter/brake-logic.ts` | the backup actually runs git clean | caught: 3 test(s) red · 92de5803b6ef→191598add99b |
| `brake-ref` | `modules/waechter/brake.ts` | stash commit without ref (gc cleans it up) | caught: 1 test(s) red · 696c38ec6d78→cde9e0420de0 |
| `brake-untracked` | `modules/waechter/brake.ts` | git clean: untracked files not backed up | caught: 2 test(s) red · 696c38ec6d78→3e14528340c7 |
| `brake-limit` | `modules/waechter/brake.ts` | size limit without asking | caught: 1 test(s) red · 696c38ec6d78→aa3d73a594da |
| `brake-overwrite` | `modules/waechter/undo.ts` | /undo-last overwrites without asking | caught: 1 test(s) red · e685310d960f→fcb1c640536d |
| `brake-retention` | `modules/waechter/brake-logic.ts` | old snapshots stay forever | caught: 1 test(s) red · 92de5803b6ef→10eccc71b34c |
| `diet-range` | `modules/waechter/diet-logic.ts` | targeted reads are still truncated / endless loop | caught: 1 test(s) red · c25f29a9f97e→a53e774559b7 |
| `diet-guard` | `modules/waechter/diet.ts` | second read of the same file is truncated again | caught: 1 test(s) red · 08ba2897039d→fa5758856bd6 |
| `diet-tail` | `modules/waechter/diet.ts` | the end of the file is missing | caught: 1 test(s) red · 08ba2897039d→e421978c3482 |
| `sec-name-parts` | `modules/waechter/secrets-logic.ts` | passed/compass/bypass count as passwords (false alarm, seen live) | caught: 4 test(s) red · 86dbaf356b22→87159880da9c |
| `tl-debounce` | `modules/cockpit/testlight.ts` | every change starts a test run immediately | caught: 2 test(s) red · 3727cc440ed9→89ab61423261 |
| `tl-nice` | `modules/cockpit/testlight.ts` | background tests at full priority | caught: 1 test(s) red · 3727cc440ed9→4a0c375f515a |
| `tl-claude-wait` | `modules/cockpit/testlight.ts` | test light runs in parallel with Claude's own test run | caught: 1 test(s) red · 3727cc440ed9→81b630f34282 |
| `tl-cut` | `modules/cockpit/testlight.ts` | stale run is not aborted | caught: 1 test(s) red · 3727cc440ed9→a34cbcf9f75f |
| `tl-once` | `modules/cockpit/testlight.ts` | red tests repeated in every prompt | caught: 1 test(s) red · 3727cc440ed9→5ffa4e2c2509 |
| `tl-project` | `modules/cockpit/testlight.ts` | changes outside the project trigger tests | caught: 1 test(s) red · 3727cc440ed9→a37d8a823791 |
| `tl-vitest` | `modules/cockpit/testlight-logic.ts` | vitest failures are not counted | caught: 1 test(s) red · bdf1e85975ce→ad863d2ff12e |
| `tl-ssh` | `modules/cockpit/testlight-logic.ts` | tests on another machine count as local | caught: 1 test(s) red · bdf1e85975ce→72784b768c6f |
| `dc-files` | `modules/cockpit/donecheck.ts` | warning even without file changes | caught: 1 test(s) red · 40a8f3756d55→290615c8fae8 |
| `dc-after` | `modules/cockpit/donecheck.ts` | a green run before the last change counts | caught: 1 test(s) red · 40a8f3756d55→72bae0c51e7c |
| `dc-reason` | `modules/cockpit/donecheck.ts` | warning even on aborted turns | caught: 1 test(s) red · 40a8f3756d55→2b701100e015 |
| `sb-first-touch` | `modules/cockpit/sidebar.ts` | baseline is overwritten on every change | caught: 1 test(s) red · bb5607acc591→7a102502ed82 |
| `sb-snapshot` | `modules/cockpit/sidebar.ts` | reset without snapshot | caught: 1 test(s) red · bb5607acc591→c99750ab1094 |
| `sb-ask` | `modules/cockpit/sidebar.ts` | reset without asking | caught: 1 test(s) red · bb5607acc591→09ed5b337ea5 |
| `sb-persist` | `modules/cockpit/sidebar.ts` | baselines are lost on reload | caught: 1 test(s) red · bb5607acc591→4e0a0bbc3e33 |
| `ci-once` | `modules/cockpit/ci.ts` | toast again on every poll | caught: 1 test(s) red · 00aba8d9b363→3dffbf619a00 |
| `ci-idle` | `modules/cockpit/ci.ts` | CI is polled even in idle sessions | caught: 1 test(s) red · 00aba8d9b363→b32986d6463c |
| `ci-backoff` | `modules/cockpit/ci.ts` | no backoff on errors | caught: 1 test(s) red · 00aba8d9b363→acac5122ad4e |
| `core-filechanged` | `core/dispatcher/dispatcher.ts` | file changes do not reach the journal | caught: 1 test(s) red · 3cfa860a8997→42c1c17d2230 |
| `tl-consent` | `modules/cockpit/testlight.ts` | project commands run without consent | caught: 3 test(s) red · 3727cc440ed9→1c46098f7cc0 |
| `tl-consent-fp` | `modules/cockpit/testlight.ts` | changed test config runs without asking again | caught: 1 test(s) red · 3727cc440ed9→dfe31b31d3d9 |
| `tl-noui` | `modules/cockpit/testlight.ts` | without UI it still asks/starts | caught: 1 test(s) red · 3727cc440ed9→e81f59c379f2 |
| `tl-effects` | `modules/cockpit/testlight.ts` | test run silently switches exo off | caught: 1 test(s) red · 3727cc440ed9→8e872dd0b181 |
| `tl-argv-dot` | `modules/cockpit/testlight-logic.ts` | file names are read as options | caught: 2 test(s) red · bdf1e85975ce→069d976af6f5 |
| `sec-name-core` | `modules/waechter/secrets-logic.ts` | dbpassword/rootpwd slip through | caught: 1 test(s) red · 86dbaf356b22→2fc0fe177ad7 |
| `sec-name-digits` | `modules/waechter/secrets-logic.ts` | pass123 slips through | caught: 1 test(s) red · 86dbaf356b22→f7bf63b73e29 |
| `h-gap` | `modules/rueckblick/hours-logic.ts` | breaks count as working time | caught: 1 test(s) red · 35599ebfc61d→4634fffb0d90 |
| `h-project` | `modules/rueckblick/hours-logic.ts` | project switch is credited to the new project | caught: 1 test(s) red · 35599ebfc61d→062e02ee4819 |
| `h-prune` | `modules/rueckblick/hours-logic.ts` | old days stay forever | caught: 1 test(s) red · 35599ebfc61d→1a3ba479868f |
| `r-once` | `modules/rueckblick/recap.ts` | "Last session" hint appears every time | caught: 1 test(s) red · e08c628ddf5c→4ef4cb304c08 |
| `r-week` | `modules/rueckblick/recap.ts` | hint even after more than seven days | caught: 1 test(s) red · e08c628ddf5c→b3e5f14bdda9 |
| `r-same` | `modules/rueckblick/recap.ts` | hint about the own, running session | caught: 1 test(s) red · e08c628ddf5c→5b95e7b9119b |
| `r-empty` | `modules/rueckblick/recap.ts` | empty sessions push out real ones | caught: 1 test(s) red · e08c628ddf5c→757901aef071 |
| `l-ticked` | `modules/rueckblick/recap.ts` | lessons are written without a checkmark | caught: 1 test(s) red · e08c628ddf5c→8a573a73406a |
| `l-esc` | `modules/rueckblick/recap.ts` | Esc writes all lessons | caught: 1 test(s) red · e08c628ddf5c→5311579f624b |
| `l-dup` | `modules/rueckblick/recap.ts` | duplicates of CLAUDE.md are offered again | caught: 1 test(s) red · e08c628ddf5c→33dd354e1452 |
| `l-code` | `modules/rueckblick/recap-logic.ts` | code blocks yield fake lessons | caught: 1 test(s) red · 4722f61a350e→04a7177447fe |
| `l-label` | `modules/rueckblick/recap-logic.ts` | label is truncated text (commas, not fully read) | caught: 2 test(s) red · 4722f61a350e→a2cf508dd19f |
| `l-sanitize` | `modules/rueckblick/recap-logic.ts` | markup/HTML ends up in CLAUDE.md | caught: 1 test(s) red · 4722f61a350e→5b4033e68c54 |
| `l-fulltext` | `modules/rueckblick/recap.ts` | things not fully readable get ticked | caught: 1 test(s) red · e08c628ddf5c→4ca87e6ddbc0 |
| `safe-lessons` | `modules/rueckblick/recap.ts` | lessons via a symlink to ~/.bashrc | caught: 1 test(s) red · e08c628ddf5c→968d29f6fb06 |
| `safe-md` | `modules/rueckblick/recap.ts` | /recap md writes via a symlink to /etc | caught: 1 test(s) red · e08c628ddf5c→5f182655c8cd |
| `safe-dangling` | `core/safepath.ts` | a dangling symlink redirects the write outside | caught: 2 test(s) red · c8051b0642d8→61ea9bb61f59 |
| `safe-dots` | `core/safepath.ts` | .. in the path leads out of the project | caught: 1 test(s) red · c8051b0642d8→d21529b7fc54 |
| `safe-missing` | `core/safepath.ts` | every error counts as "missing", the check lets it through | caught: 1 test(s) red · c8051b0642d8→d11208d7627d |
| `duck-blank` | `modules/extras/duck-logic.ts` | empty answers end up in the prompt | caught: 1 test(s) red · ffb7dcbe4e74→92bc2a7c9403 |
| `duck-error-block` | `modules/extras/duck-logic.ts` | error message without code block | caught: 1 test(s) red · ffb7dcbe4e74→87de1b73ed27 |
| `ach-one` | `modules/extras/achievements.ts` | badges in wrong order | caught: 1 test(s) red · 217d370dece1→a64e5644bb27 |
| `ach-quiet` | `modules/extras/achievements.ts` | toasts and sounds during quiet hours | caught: 1 test(s) red · 217d370dece1→dbb4c62cdb9e |
| `ach-streak` | `modules/extras/achievements-logic.ts` | red test does not break the streak | caught: 1 test(s) red · 9ed800ee39ac→528d2c338a8a |
| `ach-seen` | `modules/extras/achievements-logic.ts` | events are counted multiple times | caught: 1 test(s) red · 9ed800ee39ac→395e05de800c |
| `ach-requires` | `modules/extras/achievements-logic.ts` | Pac-Man badge without usage-bars | caught: 1 test(s) red · 9ed800ee39ac→b2d3d55df591 |
| `ach-session` | `modules/extras/achievements-logic.ts` | new session skips its journal | caught: 1 test(s) red · 9ed800ee39ac→1ece3f9b0840 |
| `cine-stop` | `modules/extras/cinema.ts` | the 30 fps timer keeps running | caught: 1 test(s) red · daaa7f32a0fa→7ca3435dba18 |
| `cine-reduced` | `modules/extras/cinema.ts` | reduced motion is ignored | caught: 1 test(s) red · daaa7f32a0fa→d1e418faad40 |
| `cine-coffee` | `modules/extras/cinema-logic.ts` | long turns without coffee | caught: 1 test(s) red · 90a0f7486e81→10135387e311 |
| `cine-width` | `modules/extras/cinema-logic.ts` | spinner exceeds the terminal width | caught: 1 test(s) red · 90a0f7486e81→255427293f3b |
| `fail-closed` | `core/dispatcher/dispatcher.ts` | a faulty guard lets through | caught: 2 test(s) red · 3cfa860a8997→15e5bf55b34b |
| `deny-stops` | `core/dispatcher/dispatcher.ts` | a rejection is ignored | caught: 1 test(s) red · 3cfa860a8997→8e0a98cf0258 |
| `kill-first` | `core/dispatcher/dispatcher.ts` | the kill switch has no effect in the dispatcher | caught: 1 test(s) red · 3cfa860a8997→85d43cf6cdb6 |
| `step-order` | `core/dispatcher/dispatcher.ts` | the fixed order does not apply | caught: 1 test(s) red · 3cfa860a8997→84bcbadbf8a0 |
| `catch-guarded` | `core/dispatcher/dispatcher.ts` | core failure lets Bash through | caught: 2 test(s) red · 3cfa860a8997→22bc7f70c831 |
| `catch-ran` | `core/dispatcher/dispatcher.ts` | an already executed call is rejected afterwards | caught: 1 test(s) red · 3cfa860a8997→18b891a7f2f6 |
| `disabled-off` | `core/dispatcher/dispatcher.ts` | disabled modules keep running | caught: 1 test(s) red · 3cfa860a8997→c0121b3116f7 |
| `kill-file` | `core/killswitch.ts` | the DISABLED file has no effect | caught: 2 test(s) red · da54bcf5bb3e→47f842ebc53c |
| `kill-env` | `core/killswitch.ts` | EXO_DISABLE has no effect | caught: 1 test(s) red · da54bcf5bb3e→7319566b0932 |
| `kill-cache` | `core/killswitch.ts` | the file is never checked again after the first look | caught: 1 test(s) red · da54bcf5bb3e→efef0eb52577 |
| `rules-unknown` | `core/config/rules.ts` | typos in rule fields go unnoticed | caught: 1 test(s) red · 5cc4df906ecb→c5321842b642 |
| `rules-fallback` | `core/config/rules.ts` | broken rules.json loses the built-in rules | caught: 1 test(s) red · 5cc4df906ecb→98d8bafb942a |
