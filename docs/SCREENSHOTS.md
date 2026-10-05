# Screenshots

The pictures in the README are real Claude Code sessions with exo loaded — not mock-ups. This is how they are made.

## Record

1. A throwaway project (the README shows `shop-api`: a `src/cart.js`, four `node:test` tests, a git repo).
2. Placeholder production hosts, so no real address can appear on screen. Pass them through a settings file instead of touching your own settings:

   ```json
   { "pluginConfigs": { "exo": { "options": { "prodHosts": ["web=203.0.113.10", "shop=shop.example.com"] } } } }
   ```

3. Start Claude Code with exo in a detached tmux session:

   ```bash
   tmux new-session -d -s exo -x 130 -y 36 -c /tmp/shop-api \
     "claude --plugin-dir /path/to/exo --settings /path/to/demo-settings.json"
   ```

4. Drive it with `tmux send-keys -t exo -l "<prompt>"` and `tmux send-keys -t exo Enter`. A click inside a pane is an SGR mouse sequence, e.g. `tmux send-keys -t exo -l $'\e[<0;85;2M'` then the same with `m`. `C-o` toggles the detailed transcript (the secret guard's own message is only visible there).
5. Capture the screen with its colours:

   ```bash
   tmux capture-pane -t exo -e -p > docs/screens/<name>.ans
   ```

| Picture | What was done |
|---|---|
| `testlight-consent` | Asked for a JSDoc comment; the test light asks before its first run |
| `prod-shield` | Asked to run `sqlite3 shop.db 'DROP TABLE orders'`; then *Cancel* |
| `secret-guard` | A demo key in `vendor-key.txt` and `src/config.js`, then `git add -A && git commit`; detailed transcript |
| `spinner-cinema` | Captured while tests were running |
| `hero` | After a change with a new test: the status line |
| `changes` | `/changes`, then a click on the file |
| `exo-status`, `recap`, `achievements` | The commands |
| `cleanup-brake` | `rm -rf dist`, `/undo-list`, `/undo-last` |

Demo keys are generated at random and never typed into a prompt: a key in the prompt would appear in full on the screen. Check every capture before committing:

```bash
grep -l 'sk-ant-api03-[A-Za-z0-9]\{20,\}' docs/screens/*.ans   # must print nothing
```

## Render

```bash
npm run screens   # docs/screens/*.ans → docs/*.png
```

`tools/screens.ts` turns the ANSI colours into HTML and screenshots it with Playwright's Chromium. `CROPS` names, per picture, the line it starts at — whole lines above it are left out (the start of the session, unrelated output). Nothing is changed or added.
