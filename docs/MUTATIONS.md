# Mutation probe

As of 2026-10-05 · `npm run mutate` · 165/165 caught

Each row breaks one safety-relevant behaviour on purpose. *caught* means: the mutation provably took effect (checksum before → after) and the named tests turned red. *INVALID* means the anchor moved or the mutant does not run; *BLIND* means all tests stayed green — a weak test or redundant code.

| Mutation | File | Breaks | Result |
|---|---|---|---|
| `sq-quote` | `core/shell/parse.ts` | single quotes stay in the word | caught: 6 test(s) red · b5c4399c301e→9bcb282fc969 |
| `and-op` | `core/shell/parse.ts` | && is not recognised as an operator | caught: 10 test(s) red · b5c4399c301e→79c4fcabd675 |
| `dq-escape` | `core/shell/parse.ts` | escapes inside double quotes | caught: 3 test(s) red · b5c4399c301e→d7ad3e4828b3 |
| `cmdsub` | `core/shell/parse.ts` | $(…) is not captured as a command | caught: 12 test(s) red · b5c4399c301e→cb8228376623 |
| `backtick` | `core/shell/parse.ts` | backticks are not captured as a command | caught: 3 test(s) red · b5c4399c301e→18b4924a6e60 |
| `heredoc-tabs` | `core/shell/parse.ts` | <<- with tabs does not find its end | caught: 1 test(s) red · b5c4399c301e→e23131ee2634 |
| `trailing-and` | `core/shell/parse.ts` | `a &&` counts as complete | caught: 1 test(s) red · b5c4399c301e→a4452946372f |
| `redirect-fd` | `core/shell/parse.ts` | file descriptor of a redirect is lost | caught: 1 test(s) red · b5c4399c301e→d1d98f5e7e1c |
| `glob-flag` | `core/shell/parse.ts` | globs are not marked | caught: 1 test(s) red · b5c4399c301e→0bbcbd5e6b8b |
| `bash-c` | `core/shell/words.ts` | bash -c "…" is not inspected | caught: 10 test(s) red · 5f8929888559→58a523c2e004 |
| `ssh-remote` | `core/shell/words.ts` | the remote command of ssh is not inspected | caught: 12 test(s) red · 5f8929888559→5fcd71cee91c |
| `ssh-user` | `core/shell/words.ts` | user@host is not split into host and user | caught: 2 test(s) red · 5f8929888559→0df6d6e911fb |
| `sudo-peel` | `core/shell/words.ts` | sudo is not peeled off | caught: 9 test(s) red · 5f8929888559→71253c1205e5 |
| `xargs-peel` | `core/shell/words.ts` | xargs rm is not recognised as rm | caught: 2 test(s) red · 5f8929888559→e51102bb68fa |
| `subst-cmds` | `core/shell/words.ts` | commands inside substitutions are missing | caught: 16 test(s) red · 5f8929888559→30f039724dab |
| `summary-args` | `core/shell/words.ts` | summary contains arguments (secrets could reach the journal) | caught: 1 test(s) red · 5f8929888559→6eecd2c94b97 |
| `arith-subs` | `core/shell/parse.ts` | commands inside $(( … )) stay invisible | caught: 3 test(s) red · b5c4399c301e→bd191885e90e |
| `arith-depth` | `core/shell/parse.ts` | nested parentheses end arithmetic too early | caught: 3 test(s) red · b5c4399c301e→6a8f6bb91289 |
| `arith-fallback` | `core/shell/parse.ts` | $((cmd) ) is not read as a command | caught: 1 test(s) red · b5c4399c301e→4443888d49de |
| `brace-subs` | `core/shell/parse.ts` | commands inside ${x:-$(…)} stay invisible | caught: 3 test(s) red · b5c4399c301e→c6b2fdcfb7a8 |
| `brace-quoted` | `core/shell/parse.ts` | commands inside ${x:-'$(…)'} stay invisible | caught: 1 test(s) red · b5c4399c301e→3b199b51f0dd |
| `ssh-proxy` | `core/shell/words.ts` | ssh -o ProxyCommand runs locally, unseen | caught: 4 test(s) red · 5f8929888559→f162e57a2275 |
| `find-exec` | `core/shell/words.ts` | find -exec rm stays invisible | caught: 2 test(s) red · 5f8929888559→209303c8731b |
| `self-off` | `core/dispatcher/dispatcher.ts` | Claude can set the kill switch itself | caught: 4 test(s) red · 9dcaf2023e81→c22db3cc78ef |
| `self-esc` | `core/dispatcher/dispatcher.ts` | Esc in the dialog allows the change | caught: 2 test(s) red · 9dcaf2023e81→e44a0bb3dc3a |
| `self-path` | `core/selfprotect.ts` | Write to ~/.claude/exo/ passes without asking | caught: 7 test(s) red · 15983ea1d2a8→ed7deae70eb2 |
| `self-readonly` | `core/selfprotect.ts` | every Bash command counts as read-only | caught: 29 test(s) red · 15983ea1d2a8→a784122d6d9e |
| `self-settings` | `core/selfprotect.ts` | exo options in settings.json pass without asking | caught: 3 test(s) red · 15983ea1d2a8→75680402d521 |
| `self-cooked` | `core/selfprotect.ts` | DIS""ABLED bypasses detection | caught: 2 test(s) red · 15983ea1d2a8→c8e8b53da0cd |
| `self-bare-name` | `core/selfprotect.ts` | cd in one call, touch DISABLED in the next | caught: 3 test(s) red · 15983ea1d2a8→484333817290 |
| `self-redir-amp` | `core/selfprotect.ts` | >&file counts as reading | caught: 2 test(s) red · 15983ea1d2a8→b24b76bc4aae |
| `self-norm` | `core/selfprotect.ts` | // ./ ../ and upper case bypass the path comparison | caught: 5 test(s) red · 15983ea1d2a8→4ca44295f732 |
| `self-unknown-tool` | `core/selfprotect.ts` | MCP tools write to ~/.claude/exo without asking | caught: 2 test(s) red · 15983ea1d2a8→de723768164f |
| `self-symlink` | `core/selfprotect.ts` | a symlink to ~/.claude/exo bypasses the protection | caught: 1 test(s) red · 15983ea1d2a8→7c2beb56c658 |
| `self-glob` | `core/selfprotect.ts` | touch DIS* bypasses the protection | caught: 3 test(s) red · 15983ea1d2a8→9242d227972d |
| `self-expansion` | `core/selfprotect.ts` | path pieces in variables bypass the protection | caught: 1 test(s) red · 15983ea1d2a8→5a4c52675ea0 |
| `self-opaque` | `core/selfprotect.ts` | base64 -d | sh bypasses the protection | caught: 1 test(s) red · 15983ea1d2a8→e22a6b6ea593 |
| `self-unresolved` | `core/selfprotect.ts` | an unresolvable path counts as harmless | caught: 1 test(s) red · 15983ea1d2a8→c87550008b0f |
| `self-pluginconfigs` | `core/selfprotect.ts` | exo options via a symlink to settings.json | caught: 1 test(s) red · 15983ea1d2a8→ceb55a6e365c |
| `self-cwd-dir` | `core/selfprotect.ts` | cd ~/.claude/exo, then touch x | caught: 1 test(s) red · 15983ea1d2a8→3cfe6f482cc3 |
| `self-cwd-rel` | `core/selfprotect.ts` | relative targets into ~/.claude/exo | caught: 1 test(s) red · 15983ea1d2a8→af8eaec9112e |
| `self-cwd-after` | `core/selfprotect.ts` | cd inside the command is missed | caught: 1 test(s) red · 15983ea1d2a8→a21f1c34ec53 |
| `eff-off` | `core/dispatcher/dispatcher.ts` | obfuscated commands set DISABLED unnoticed | caught: 7 test(s) red · 9dcaf2023e81→5ae97ec8a34a |
| `eff-esc` | `core/integrity.ts` | Esc keeps the change | caught: 5 test(s) red · ccdea4cd0edd→1b8c7e57e3ee |
| `eff-noui` | `core/integrity.ts` | without UI the change stays | caught: 1 test(s) red · ccdea4cd0edd→87533d9151ed |
| `eff-disabled` | `core/integrity.ts` | DISABLED is not noticed | caught: 6 test(s) red · ccdea4cd0edd→5f5ef388da35 |
| `eff-rules` | `core/integrity.ts` | rules.json change is not noticed | caught: 1 test(s) red · ccdea4cd0edd→7e35c8919e82 |
| `eff-settings` | `core/integrity.ts` | settings.json change is not noticed | caught: 1 test(s) red · ccdea4cd0edd→874c79a2a1d6 |
| `eff-prefs` | `core/integrity.ts` | /exo switches changed in the store unnoticed | caught: 1 test(s) red · ccdea4cd0edd→becccefa2a19 |
| `eff-keep-others` | `core/integrity.ts` | reset deletes other plugins' settings | caught: 1 test(s) red · ccdea4cd0edd→e8c27bc9d589 |
| `eff-approved` | `core/dispatcher/dispatcher.ts` | after allowing, it asks a second time (and reverts) | caught: 2 test(s) red · 9dcaf2023e81→a77e0c9e5230 |
| `eff-approved-scope` | `core/dispatcher/dispatcher.ts` | one allow also covers other switches | caught: 1 test(s) red · 9dcaf2023e81→81fde3e9b140 |
| `eff-approved-bash` | `core/dispatcher/dispatcher.ts` | a Bash allow covers the effect | caught: 1 test(s) red · 9dcaf2023e81→be9e2bfd3205 |
| `sec-anthropic` | `modules/waechter/secrets-logic.ts` | Anthropic keys are not detected | caught: 7 test(s) red · bf406cd84205→d668338ab4d3 |
| `sec-github` | `modules/waechter/secrets-logic.ts` | GitHub tokens are not detected | caught: 4 test(s) red · bf406cd84205→7733b03a1ec9 |
| `sec-pem` | `modules/waechter/secrets-logic.ts` | private keys are not detected | caught: 1 test(s) red · bf406cd84205→c72f1fbe156d |
| `sec-mask` | `modules/waechter/secrets-logic.ts` | messages show the secret in plain text | caught: 11 test(s) red · bf406cd84205→cb93929b916d |
| `sec-password` | `modules/waechter/secrets-logic.ts` | passwords in assignments slip through | caught: 1 test(s) red · bf406cd84205→62a62f00c23a |
| `sec-entropy` | `modules/waechter/secrets-logic.ts` | high-entropy strings slip through | caught: 1 test(s) red · bf406cd84205→f17680444dee |
| `sec-placeholder` | `modules/waechter/secrets-logic.ts` | placeholders trigger false alarms | caught: 2 test(s) red · bf406cd84205→381fbe90b763 |
| `sec-uuid` | `modules/waechter/secrets-logic.ts` | hashes and UUIDs trigger false alarms | caught: 1 test(s) red · bf406cd84205→5b04405297ea |
| `sec-allow` | `modules/waechter/secrets-logic.ts` | exo-allow-secret has no effect | caught: 1 test(s) red · bf406cd84205→0353eedca6a3 |
| `sec-diff-added` | `modules/waechter/secrets-logic.ts` | removed lines also count as findings | caught: 1 test(s) red · bf406cd84205→8599e096ad4e |
| `sec-env` | `modules/waechter/secrets.ts` | ignored .env is blocked | caught: 1 test(s) red · f181897159e4→b1edd6105463 |
| `sec-commit` | `modules/waechter/secrets.ts` | the staged diff is not checked | caught: 1 test(s) red · f181897159e4→032a9101edf9 |
| `sec-push` | `modules/waechter/secrets.ts` | commits to be pushed are not checked | caught: 1 test(s) red · f181897159e4→bfe7ccb3ed20 |
| `sec-redirect` | `modules/waechter/secrets.ts` | echo KEY > file passes | caught: 1 test(s) red · f181897159e4→2e7dd9b7fbd3 |
| `sec-add-commit` | `modules/waechter/secrets.ts` | git add -A && git commit: new files unchecked | caught: 1 test(s) red · f181897159e4→e0a26daa59fd |
| `prod-alias` | `modules/waechter/prod-logic.ts` | ssh aliases to prod are not detected | caught: 4 test(s) red · 7321c636be47→2dc4098ebb48 |
| `prod-user` | `modules/waechter/prod-logic.ts` | user@host is not detected | caught: 4 test(s) red · 7321c636be47→cfc088ccedc5 |
| `prod-scp` | `modules/waechter/prod-logic.ts` | scp/rsync to prod pass | caught: 8 test(s) red · 7321c636be47→89fa78dd9480 |
| `prod-service` | `modules/waechter/prod-logic.ts` | systemctl restart on prod is not reported | caught: 1 test(s) red · 7321c636be47→2aae3fead5ee |
| `prod-sql-where` | `modules/waechter/prod-logic.ts` | DELETE with WHERE counts as destructive | caught: 2 test(s) red · 7321c636be47→39c7ceaabd85 |
| `prod-sql-drop` | `modules/waechter/prod-logic.ts` | DROP TABLE passes | caught: 4 test(s) red · 7321c636be47→ea8d33776a9f |
| `prod-plus` | `modules/waechter/prod-logic.ts` | +main missed as a force push | caught: 1 test(s) red · 7321c636be47→cb0b41f3b58f |
| `prod-branch` | `modules/waechter/prod-logic.ts` | git push --force to main without refspec passes | caught: 2 test(s) red · 7321c636be47→3e2ed206cb89 |
| `prod-dry-drop` | `modules/waechter/prod-logic.ts` | a dry run for DROP is invented | caught: 1 test(s) red · 7321c636be47→05d8485f3bc4 |
| `prod-noui` | `modules/waechter/prod.ts` | without UI a prod command runs without asking | caught: 1 test(s) red · 428aa5ff20fa→91174a0feb56 |
| `prod-esc` | `modules/waechter/prod.ts` | Esc runs the prod command | caught: 4 test(s) red · 428aa5ff20fa→c73d97063713 |
| `prod-rule` | `modules/waechter/prod.ts` | house rule (certbot) is ignored | caught: 1 test(s) red · 428aa5ff20fa→f887630e8112 |
| `prod-unparsable` | `modules/waechter/prod.ts` | unreadable commands referencing prod pass | caught: 1 test(s) red · 428aa5ff20fa→0350b375f789 |
| `prod-jump` | `modules/waechter/prod-logic.ts` | ssh -J/-o HostName to prod passes | caught: 1 test(s) red · 7321c636be47→c74591534dc0 |
| `prod-dot` | `modules/waechter/prod-logic.ts` | vps. with trailing dot passes | caught: 1 test(s) red · 7321c636be47→f42466a823c0 |
| `brake-rf` | `modules/waechter/brake-logic.ts` | rm -Rf / --recursive --force are missed | caught: 1 test(s) red · c83d19ca0ada→10f5412026e3 |
| `brake-feeder` | `modules/waechter/brake-logic.ts` | xargs rm -rf is silently not backed up | caught: 2 test(s) red · c83d19ca0ada→75b6677b731d |
| `brake-vars` | `modules/waechter/brake-logic.ts` | rm -rf "$X" runs without asking | caught: 2 test(s) red · c83d19ca0ada→65c3da665303 |
| `brake-clean-n` | `modules/waechter/brake-logic.ts` | the backup actually runs git clean | caught: 3 test(s) red · c83d19ca0ada→5c5242ce05ad |
| `brake-ref` | `modules/waechter/brake.ts` | stash commit without ref (gc cleans it up) | caught: 1 test(s) red · 4fe318292317→8dbc0650fb00 |
| `brake-untracked` | `modules/waechter/brake.ts` | git clean: untracked files not backed up | caught: 2 test(s) red · 4fe318292317→d42be25a55e5 |
| `brake-limit` | `modules/waechter/brake.ts` | size limit without asking | caught: 1 test(s) red · 4fe318292317→b3bdb3eba73f |
| `brake-overwrite` | `modules/waechter/undo.ts` | /undo-last overwrites without asking | caught: 1 test(s) red · f0095f5e1d4d→35c33205c607 |
| `brake-retention` | `modules/waechter/brake-logic.ts` | old snapshots stay forever | caught: 1 test(s) red · c83d19ca0ada→4ec752727e56 |
| `diet-range` | `modules/waechter/diet-logic.ts` | targeted reads are still truncated / endless loop | caught: 1 test(s) red · 9bf34fde05ca→2666633060c7 |
| `diet-guard` | `modules/waechter/diet.ts` | second read of the same file is truncated again | caught: 1 test(s) red · ee755bc24761→c7221a36252b |
| `diet-tail` | `modules/waechter/diet.ts` | the end of the file is missing | caught: 1 test(s) red · ee755bc24761→8dff3ef31fe4 |
| `sec-name-parts` | `modules/waechter/secrets-logic.ts` | passed/compass/bypass count as passwords (false alarm, seen live) | caught: 4 test(s) red · bf406cd84205→22a1c47641c8 |
| `tl-debounce` | `modules/cockpit/testlight.ts` | every change starts a test run immediately | caught: 2 test(s) red · a1c92815c9cd→3989120cb399 |
| `tl-nice` | `modules/cockpit/testlight.ts` | background tests at full priority | caught: 1 test(s) red · a1c92815c9cd→5011d9d1877d |
| `tl-claude-wait` | `modules/cockpit/testlight.ts` | test light runs in parallel with Claude's own test run | caught: 1 test(s) red · a1c92815c9cd→a99f92963669 |
| `tl-cut` | `modules/cockpit/testlight.ts` | stale run is not aborted | caught: 1 test(s) red · a1c92815c9cd→8a1bf6615482 |
| `tl-once` | `modules/cockpit/testlight.ts` | red tests repeated in every prompt | caught: 1 test(s) red · a1c92815c9cd→1c8e351390c7 |
| `tl-project` | `modules/cockpit/testlight.ts` | changes outside the project trigger tests | caught: 1 test(s) red · a1c92815c9cd→a98fe88ae322 |
| `tl-vitest` | `modules/cockpit/testlight-logic.ts` | vitest failures are not counted | caught: 1 test(s) red · cfa244885d14→290aeaf8b58e |
| `tl-ssh` | `modules/cockpit/testlight-logic.ts` | tests on another machine count as local | caught: 1 test(s) red · cfa244885d14→814e3afaff36 |
| `dc-files` | `modules/cockpit/donecheck.ts` | warning even without file changes | caught: 1 test(s) red · 488931bcf718→b1abb01b2aad |
| `dc-after` | `modules/cockpit/donecheck.ts` | a green run before the last change counts | caught: 1 test(s) red · 488931bcf718→a4b5e211f842 |
| `dc-reason` | `modules/cockpit/donecheck.ts` | warning even on aborted turns | caught: 1 test(s) red · 488931bcf718→b088196f425c |
| `sb-first-touch` | `modules/cockpit/sidebar.ts` | baseline is overwritten on every change | caught: 1 test(s) red · 12d2a41ec51e→f000249bbb37 |
| `sb-snapshot` | `modules/cockpit/sidebar.ts` | reset without snapshot | caught: 1 test(s) red · 12d2a41ec51e→b3b49a7dd929 |
| `sb-ask` | `modules/cockpit/sidebar.ts` | revert without asking | caught: 1 test(s) red · 12d2a41ec51e→88201c7e386b |
| `sb-persist` | `modules/cockpit/sidebar.ts` | baselines are lost on reload | caught: 1 test(s) red · 12d2a41ec51e→3e043907cba5 |
| `ci-once` | `modules/cockpit/ci.ts` | toast again on every poll | caught: 1 test(s) red · b75cdf26494f→b52e00d9bd93 |
| `ci-idle` | `modules/cockpit/ci.ts` | CI is polled even in idle sessions | caught: 1 test(s) red · b75cdf26494f→d50a8c3a9441 |
| `ci-backoff` | `modules/cockpit/ci.ts` | no backoff on errors | caught: 1 test(s) red · b75cdf26494f→8608a87747db |
| `core-filechanged` | `core/dispatcher/dispatcher.ts` | file changes do not reach the journal | caught: 1 test(s) red · 9dcaf2023e81→bd44520ccb24 |
| `tl-consent` | `modules/cockpit/testlight.ts` | project commands run without consent | caught: 3 test(s) red · a1c92815c9cd→c48296842b6d |
| `tl-consent-fp` | `modules/cockpit/testlight.ts` | changed test config runs without asking again | caught: 1 test(s) red · a1c92815c9cd→d2b45e28a43a |
| `tl-noui` | `modules/cockpit/testlight.ts` | without UI it still asks/starts | caught: 1 test(s) red · a1c92815c9cd→bf60225e162d |
| `tl-effects` | `modules/cockpit/testlight.ts` | test run silently switches exo off | caught: 1 test(s) red · a1c92815c9cd→b6f5230144c2 |
| `tl-argv-dot` | `modules/cockpit/testlight-logic.ts` | file names are read as options | caught: 2 test(s) red · cfa244885d14→c17bed61b64c |
| `sec-name-core` | `modules/waechter/secrets-logic.ts` | dbpassword/rootpwd slip through | caught: 1 test(s) red · bf406cd84205→563454a1692a |
| `sec-name-digits` | `modules/waechter/secrets-logic.ts` | pass123 slips through | caught: 1 test(s) red · bf406cd84205→dab24bcd4612 |
| `h-gap` | `modules/rueckblick/hours-logic.ts` | breaks count as working time | caught: 1 test(s) red · 400201576f95→f46ad20e4db7 |
| `h-project` | `modules/rueckblick/hours-logic.ts` | project switch is credited to the new project | caught: 1 test(s) red · 400201576f95→a6e8f40ab822 |
| `h-prune` | `modules/rueckblick/hours-logic.ts` | old days stay forever | caught: 1 test(s) red · 400201576f95→f39968a5076f |
| `r-once` | `modules/rueckblick/recap.ts` | "Last session" hint appears every time | caught: 1 test(s) red · bb8f0719e3e5→50fe2845ef22 |
| `r-week` | `modules/rueckblick/recap.ts` | hint even after more than seven days | caught: 1 test(s) red · bb8f0719e3e5→240e787ee153 |
| `r-same` | `modules/rueckblick/recap.ts` | hint about the own, running session | caught: 1 test(s) red · bb8f0719e3e5→df73c185c2e6 |
| `r-empty` | `modules/rueckblick/recap.ts` | empty sessions push out real ones | caught: 1 test(s) red · bb8f0719e3e5→6113ade1791d |
| `l-ticked` | `modules/rueckblick/recap.ts` | lessons are written without a checkmark | caught: 1 test(s) red · bb8f0719e3e5→8aa612842221 |
| `l-esc` | `modules/rueckblick/recap.ts` | Esc writes all lessons | caught: 1 test(s) red · bb8f0719e3e5→a8f6ec1c4947 |
| `l-dup` | `modules/rueckblick/recap.ts` | duplicates of CLAUDE.md are offered again | caught: 1 test(s) red · bb8f0719e3e5→aea9b1177c81 |
| `l-code` | `modules/rueckblick/recap-logic.ts` | code blocks yield fake lessons | caught: 1 test(s) red · c4341a3c3ccc→a920dff8233e |
| `l-label` | `modules/rueckblick/recap-logic.ts` | label is truncated text (commas, not fully read) | caught: 2 test(s) red · c4341a3c3ccc→ca5f51b4ad45 |
| `l-sanitize` | `modules/rueckblick/recap-logic.ts` | markup/HTML ends up in CLAUDE.md | caught: 1 test(s) red · c4341a3c3ccc→396be1178e25 |
| `l-fulltext` | `modules/rueckblick/recap.ts` | things not fully readable get ticked | caught: 1 test(s) red · bb8f0719e3e5→f7366b45b60e |
| `safe-lessons` | `modules/rueckblick/recap.ts` | lessons via a symlink to ~/.bashrc | caught: 1 test(s) red · bb8f0719e3e5→85284118015c |
| `safe-md` | `modules/rueckblick/recap.ts` | /recap md writes via a symlink to /etc | caught: 1 test(s) red · bb8f0719e3e5→fabfc45c0303 |
| `safe-dangling` | `core/safepath.ts` | a dangling symlink redirects the write outside | caught: 2 test(s) red · c8051b0642d8→61ea9bb61f59 |
| `safe-dots` | `core/safepath.ts` | .. in the path leads out of the project | caught: 1 test(s) red · c8051b0642d8→d21529b7fc54 |
| `safe-missing` | `core/safepath.ts` | every error counts as "missing", the check lets it through | caught: 1 test(s) red · c8051b0642d8→d11208d7627d |
| `duck-blank` | `modules/extras/duck-logic.ts` | empty answers end up in the prompt | caught: 1 test(s) red · 0e5401411f54→fd3e6a48f840 |
| `duck-error-block` | `modules/extras/duck-logic.ts` | error message without code block | caught: 1 test(s) red · 0e5401411f54→f82d121f9409 |
| `ach-one` | `modules/extras/achievements.ts` | badges in wrong order | caught: 1 test(s) red · 309da29aba8b→d73338819606 |
| `ach-quiet` | `modules/extras/achievements.ts` | toasts and sounds during quiet hours | caught: 1 test(s) red · 309da29aba8b→238c31b5c19f |
| `ach-streak` | `modules/extras/achievements-logic.ts` | red test does not break the streak | caught: 1 test(s) red · f3ed68c42f8d→b445d81246b6 |
| `ach-seen` | `modules/extras/achievements-logic.ts` | events are counted multiple times | caught: 1 test(s) red · f3ed68c42f8d→c66a92f8c055 |
| `ach-requires` | `modules/extras/achievements-logic.ts` | Pac-Man badge without usage-bars | caught: 1 test(s) red · f3ed68c42f8d→997563b93aa4 |
| `ach-session` | `modules/extras/achievements-logic.ts` | new session skips its journal | caught: 1 test(s) red · f3ed68c42f8d→676aa5fb7894 |
| `cine-stop` | `modules/extras/cinema.ts` | the 30 fps timer keeps running | caught: 1 test(s) red · b4e0f71ab2cc→6c73addcc761 |
| `cine-reduced` | `modules/extras/cinema.ts` | reduced motion is ignored | caught: 1 test(s) red · b4e0f71ab2cc→3dc0f7e4439c |
| `cine-coffee` | `modules/extras/cinema-logic.ts` | long turns without coffee | caught: 1 test(s) red · 7b846caa6266→ab279cf65e91 |
| `cine-width` | `modules/extras/cinema-logic.ts` | spinner exceeds the terminal width | caught: 1 test(s) red · 7b846caa6266→bd263284f3b5 |
| `fail-closed` | `core/dispatcher/dispatcher.ts` | a faulty guard lets through | caught: 2 test(s) red · 9dcaf2023e81→44c4a07c3a88 |
| `deny-stops` | `core/dispatcher/dispatcher.ts` | a rejection is ignored | caught: 1 test(s) red · 9dcaf2023e81→81c54a1e1274 |
| `kill-first` | `core/dispatcher/dispatcher.ts` | the kill switch has no effect in the dispatcher | caught: 1 test(s) red · 9dcaf2023e81→aa770d0456d9 |
| `step-order` | `core/dispatcher/dispatcher.ts` | the fixed order does not apply | caught: 1 test(s) red · 9dcaf2023e81→b3cd46c53c42 |
| `catch-guarded` | `core/dispatcher/dispatcher.ts` | core failure lets Bash through | caught: 2 test(s) red · 9dcaf2023e81→e0da719874f3 |
| `catch-ran` | `core/dispatcher/dispatcher.ts` | an already executed call is rejected afterwards | caught: 1 test(s) red · 9dcaf2023e81→c6696bb87c0c |
| `disabled-off` | `core/dispatcher/dispatcher.ts` | disabled modules keep running | caught: 1 test(s) red · 9dcaf2023e81→f2c95ba47d74 |
| `kill-file` | `core/killswitch.ts` | the DISABLED file has no effect | caught: 2 test(s) red · 6f5fcfab8fd5→18b906c512fe |
| `kill-env` | `core/killswitch.ts` | EXO_DISABLE has no effect | caught: 1 test(s) red · 6f5fcfab8fd5→88d31915e3c0 |
| `kill-cache` | `core/killswitch.ts` | the file is never checked again after the first look | caught: 1 test(s) red · 6f5fcfab8fd5→d0f884e62359 |
| `rules-unknown` | `core/config/rules.ts` | typos in rule fields go unnoticed | caught: 1 test(s) red · 2168ce5b8ae2→af602c4fd0dd |
| `rules-fallback` | `core/config/rules.ts` | broken rules.json loses the built-in rules | caught: 1 test(s) red · 2168ce5b8ae2→c1f011068aad |
