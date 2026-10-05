# exo – Plan

As of: 2026-10-05 · Basis: Claude Code 2.1.289, engine types `claude-code.d.ts` of this build,
reference mod usage-bars 0.3.0. Phase 0 (analysis) and Phase 1 (follow-up questions) are complete;
the decisions from them are in section 1.

> **Later decision:** the interface was planned German and is now **English**. UI strings quoted below
> in German (with English glosses) describe the plan, not the shipped texts.

> This document contains **no real addresses**. Examples use documentation addresses
> (`203.0.113.0/24`, `example.com`). The real prod hosts exist only in the local
> configuration (`pluginConfigs.exo.options.prodHosts` in `~/.claude/settings.json`).

---

## 1. Decisions

| Topic | Decision |
|---|---|
| Packaging | **One** mod `exo`, modules switchable internally. Separate publication of Achievements/Cinema/Duck at the earliest as an option in Stage 6 (via a noun `$.exo` in `engine.create` + `dependencies`). |
| Rationale | The engine orders hooks only by tiers (prepend > user > append > builtin > core); within the user tier **no order is guaranteed**. Guards must therefore sit behind exactly one dispatcher in exactly one mod. |
| Prod hosts | `userConfig.prodHosts: string[]`, format `name=address`. Set only locally, never in the repo. |
| House rules | `~/.claude/exo/rules.json`, validated on load. Broken/invalid → built-in defaults (certbot rule) **plus a visible warning in `/exo`**. No crash, no silent ignoring. |
| Data storage | `~/.claude/exo/` (`rules.json`, `snapshots/`, `originals/`, `DISABLED`). State in `$.store` (plugin-owned, max. 4 MiB). |
| Kill switch | File `~/.claude/exo/DISABLED` (takes effect immediately, also from a second terminal), environment variable `EXO_DISABLE=1` (takes effect from session start), `/exo off`. Details 3.4. |
| Prod shield dialog | Native `$.ui.ask`. Esc = cancel. „Trockenlauf“ (dry run) only as an option when there is a real equivalent. Without interactive UI (`-p`) → denial. |
| Review | `session.end`: only store facts, fast, no model call. Notice „Letzte Sitzung …“ (Last session …) on the next start in the same project: once, dismissible, dropped after 7 days. Open items via the model only on `/recap`. |
| Time tracking | Standalone in `$.store`. Day total in the hint line, week via `/hours`, export CSV/JSON for personal use. **No relation to feierabend** (neither reading nor writing nor format). |
| Spinner cinema | Variant A: only animate `Spinner.message`; time and tokens continue to be drawn by the engine. |
| Quality | `tsc --strict` + `claude plugin validate`. No ESLint. No new runtime dependencies. |
| License | MIT. |
| Repo | `pepperonas/exo`, **private**. Public only after Stage 6 and after the history check (section 8). |
| Development | Repo `~/claude/_mods/exo`, symlinked into the session's dev-mods folder (hot reload). Symlink only once Stage 1 contains the kill switch. |
| Done check | Reports only if files were changed in the turn (decided after Phase 2). |
| Prod shield | No allow list for read commands: every prod access asks (decided after Phase 2). |

---

## 2. Directory structure

Language, build and tests as in usage-bars: TypeScript/TSX without a build step (the engine loads
the source), pure logic in separate files, Node tests via `tsx`, engine tests via
`claude plugin test`. Only files with `.ts`/`.tsx` are loaded; data (frames, rules,
badges) are therefore `.ts` modules, not JSON files.

```
exo/
  .claude-plugin/plugin.json      manifest, userConfig, "types"
  hooks/
    hooks.json                    { "modules": ["./register.tsx"] }
    register.tsx                  sole registration + adapter `hostOf($)` + `$.state` atoms
  core/
    adapter/host.ts               Host interface (the only thing modules see)
    journal/events.ts             event types
    journal/journal.ts            ring buffer, queries, persistence compaction
    dispatcher/dispatcher.ts      tool.call order, error policy, budget
    statusline/statusline.ts      slots, priority, truncation by width
    config/config.ts              userConfig + /exo overrides + defaults, validation
    config/rules.ts               rules.json schema, validation, default rules
    store/store.ts                versioned schema, migrations, size budget, throttling
    shell/parse.ts                Bash parser
    shell/words.ts                command recognition on parsed commands (git, rm, ssh …)
    health/health.ts              state per module, time spent, last errors
    killswitch.ts                 DISABLED file / EXO_DISABLE
    i18n.ts                       texts (de; structure for en)
    exo-command.ts                /exo
  modules/
    waechter/{secrets,prod,brake,diet}.ts      (+ each *-logic.ts pure)
    cockpit/{testlight,donecheck,sidebar,ci}.ts
    rueckblick/{recap,lessons,hours}.ts
    erfolge/{rules.ts,erfolge.ts}
    kino/{frames/*.ts,kino.ts}
    ente/ente.ts
  types/index.d.ts                PluginState contract
  tests/                          *.spec.ts  (node --test, pure)
  hooks/*.test.tsx                engine tests (claude plugin test)
  tools/mutate.ts                 mutation probe (section 6)
  docs/PLAN.md, docs/MUTATIONS.md
```

---

## 3. Core

### 3.1 Adapter

`core/adapter/host.ts` defines `Host`: exactly the capabilities exo needs
(`now, after, every, store, fs, run, env, ask, toast, log, status line/band, session`;
later stages add `spawn, open/close Pane, copy, model.complete, prompt.fill,
session.usage/messages`). The adapter `hostOf($)` lives in **`hooks/register.tsx`**:
`claude plugin validate` tracks `$` statically and lets it flow **only into functions of the same
file**, never across an import (engine rule, found in Stage 1). Likewise
the `$.state` atoms must be constants there, and `$.env.get` only takes
**literal** variable names (`Host.env` is therefore typed as `HOME | EXO_DISABLE | NO_COLOR`).
Modules never import `claude-code`; tests give them a fake host.
If the engine changes its API, only `hostOf` is adjusted.

Engine facts encapsulated by the adapter:
- `$.fs`: no delete/rename, 4 MiB per file → deletion, `tar`, `du`, `tail`, `wc` via `run`.
- `$.process.run`: timeout default 30 s, max. 10 min, not abortable. `$.process.spawn`
  is abortable (leaving the loop = terminating the process) → for test runs.
- `$.store`: JSON, **4 MiB total per plugin** → budget in 3.7.
- Module variables are lost on hot reload, timers are discarded, `session.start`
  fires again → everything a render reads lives in `$.state`; timers are (re)started in
  `session.start`.

### 3.2 Journal

Typed event stream, in-memory ring buffer (cap 2,000 events), which all
modules read. Modules never write into each other, only into the journal.

```ts
type Base = { seq: number; at: number; turnId?: string }
type JournalEvent = Base & (
  | { type: 'session.start'; sessionId: string; cwd: string; project: string }
  | { type: 'prompt.submit'; chars: number }                 // no prompt text
  | { type: 'turn.start'; turnId: string }
  | { type: 'tool.start'; id: string; tool: string; summary: string; kind?: ActivityKind }
  | { type: 'tool.end'; id: string; tool: string; ms: number; ok: boolean;
      exitCode?: number; files?: string[]; denied?: string /* module ID */ }
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

Rules:
- The `summary` of commands **always** passes through secret masking before it enters
  the journal; prompt and answer texts are not stored in the journal (the answer is only
  evaluated at the moment of `turn.complete`: `claims` and lesson candidates).
- `file.changed`: from Edit (lines of `old_string`/`new_string`) and Write (diff against the
  original). Changes made via Bash are not captured (limitation, README).
- Persistence: the running journal compacted (without `tool.start`, truncated `summary`) under
  `journal:current`, max. 512 KB, throttled every 5 s. On `session.end` it is condensed into the
  session summary (section 4.3).

### 3.3 Dispatcher for `tool.call`

Exactly **one** `on('tool.call', …)` without a matcher. Order:

| # | Step | May | On internal error |
|---|---|---|---|
| 0 | Kill switch | let everything through | – |
| 0b | Parse Bash (once, for all) | – | Parse error ⇒ "unparsable", steps 1/2/4 treat it conservatively |
| 1 | Secrets | `{deny}` | **fail closed**: deny only this call |
| 2 | Prod shield | `{deny}`, dialog, rewrite command (dry run) | **fail closed** |
| 3 | Context diet | rewrite Read arguments | fail open |
| 4 | Cleanup brake | snapshot, possibly dialog | fail open **with warning** in the result `context` („kein Schnappschuss“ (no snapshot)) – unless the size-limit dialog was declined ⇒ `{deny}` |
| 5 | `next(e)` | execute | – |
| 6 | Journal, test light, sidebar, diet result | downstream; only the diet changes the result (`context`) | fail open |

- Each step runs in its own `try/catch`, measures its time and reports it to Health.
- The engine itself is **fail open**: a hook that throws or exceeds its budget (10 s of own
  time; `$` calls and dialogs don't count) is skipped and the call
  proceeds. Hence additionally a `.catch` handler on the registration (1 s grace period):
  kill switch set → `next(e)`; call is Bash/Write/Edit/NotebookEdit → `{deny}` with
  a pointer to the kill switch; otherwise → `next(e)`.
- Fail-closed message: `exo/<modul> ist gestört (<Fehler>). Dieser Aufruf wurde
  abgelehnt. Abschalten: /exo off <modul> oder touch ~/.claude/exo/DISABLED` (exo/<module> is
  broken (<error>). This call was denied. Turn off: … or …).
- Budget: synchronous checks 1–4 together < 50 ms (excluding dialogs and deliberate check commands
  such as the certbot query). Exceeding it → `budget.exceeded` in the journal, shown in `/exo`.
- Limitation that belongs in the README: if the module doesn't load at all (syntax error, engine error),
  there is no protection – the engine then lets everything through. `/exo` shows the load state;
  if exo is not active, its status line is missing.

### 3.4 Kill switch

`core/killswitch.ts`, checked as the **first step in every hook** (dispatcher, `.catch`,
`prompt.submit`, `ui.render` …):
- `~/.claude/exo/DISABLED` exists → exo is completely passive (all hooks pass `next(e)`
  through, status line shows `exo aus (DISABLED)` (exo off)). Takes effect live, without restart, and can be
  set from a second terminal, even if exo is blocking Bash in this session.
- `EXO_DISABLE=1` in the environment → likewise (applies from start: `EXO_DISABLE=1 claude …`).
- `/exo off` → all modules off, stored in `$.store`; `/exo on` reverts it.
- Check via `$.fs.exists` with a 1 s cache (a `$` call doesn't count against the budget).
- File and environment variable are checked in `tool.call` and in the `.catch` handler **without the
  runtime**: even if exo's own state cannot be built, the switch
  takes effect. A failed build is retried on the next call.
- Last fallback without exo: remove the symlink in the dev-mods folder or disable the plugin.

Every denial message names the kill switch.

### 3.4a Self-protection (after security review, 2026-10-05)

Without it, Claude could turn off all guards with a single call (`touch ~/.claude/exo/DISABLED`,
emptying `rules.json`, setting an exo option in `settings.json` to `false`). `core/selfprotect.ts`
detects write access to `~/.claude/exo/` and to exo entries in
`~/.claude/settings*.json` (Write/Edit/NotebookEdit via the path, Bash via the text plus a
"read-only?" check: exclusively read programs without a writing redirection). Such
calls need an **Allow** in the dialog; Esc or missing UI → denial. Runs in the
dispatcher directly after the kill switch, **independent of the module switches**, fail closed.
Second review round (same day): Bash is checked on the raw text **and** on the words
"cooked" by the shell (`DIS""ABLED`); the bare file name `DISABLED` or `rules.json`
suffices, because the Bash tool keeps its working directory between calls (`cd` in one,
`touch DISABLED` in the next call) – deliberately over-cautious, `echo DISABLED > notiz.txt` therefore
asks. "Read-only" means: programs that cannot start others (without `rg --pre`,
`less`/`LESSOPEN`), no environment prefixes, no writing redirection incl. `>&datei`. Paths
are normalized (`//`, `.`, `..`), compared case-insensitively (macOS) and resolved through symlinks via
`$.fs.stat(…, { resolve: true })`. Unknown tools (MCP) are
checked for any path under `~/.claude/exo`.
Third review round: globs are checked segment by segment against the control names (`DIS*`,
`e?o/[D]ISABLED`; a bare `*` not, as Bash doesn't match dot names with it); path fragments in
variables count if the command contains a fragment of `.claude` or `DISABLED` (deliberately narrow:
`claude`/`exo` alone would hit every write command in the workspace `~/claude`); opaque
execution (`eval`, `source`, shell from a pipe, `base64 -d`/`xxd -r`) always counts as a
control change; `pluginConfigs`, `claude plugin disable … exo` and `~/.claude/dev-mods` count.
A path that cannot be resolved at all counts as affected (fail closed), and the adapter
never falls back to the unresolved path. If the core fails, the `.catch` path only lets
pure read tools (`core/tools.ts`) through.
Fourth review round – **effect check** (`core/integrity.ts`): a text check is never
complete; therefore exo compares, before and after every call that can change something (everything except
`core/tools.ts`), the state of its switches (`DISABLED`, `rules.json`, exo entries in
`~/.claude/settings*.json`, `/exo` prefs in the store). A change is presented to the human
(„Behalten“ / „Rückgängig“ (Keep / Undo)); with no answer or no UI it is reverted. Turning exo *on*
(DISABLED deleted) is never reverted. In addition, the text check takes the tracked
working directory into account (`core/cwd.ts`): in `~/.claude` every write command counts, relative
targets are resolved. An unknown working directory (`cd -`, `cd $X`) deliberately does *not* trigger a
permanent prompt – the effect check covers that.
Limitation: an agent with a shell can modify the mod itself; neither check covers that –
a safety belt, not a sandbox.

### 3.5 Status line

Modules register slots: `{ id, priority, text, color?, minWidth }`. The core draws:
- **PromptHint**: an exo line below the engine line; nested via
  `<Box column>{await next(e)}{exoZeile}</Box>` like usage-bars, so that both coexist
  (the order of the lines is not guaranteed, both remain visible).
  Contents: test light, CI, hours of the day, kill switch state.
- **AbovePrompt**: band for things with buttons (notice „Letzte Sitzung …“, „CI-Log an
  Claude geben“ (give CI log to Claude), red tests). Yields to a survey (`hasSurvey`).
- Truncation by `viewport.columns` or `bodyColumns`: lowest-priority slots drop out
  entirely first (no text cut off in the middle).
- Reserved IDs: `usage` (for a later display, in case usage-bars is missing), `context`
  (later context fuel gauge).

### 3.6 Configuration

Precedence: kill switch > `/exo` overrides (`$.store`) > `userConfig` > defaults.

`userConfig` (only `string`, `number`, `boolean`, `string[]` possible):

| Field | Type | Default |
|---|---|---|
| `secrets`, `prodShield`, `brake`, `diet`, `testLight`, `doneCheck`, `sidebar`, `ci`, `recap`, `lessons`, `hours`, `achievements`, `cinema`, `duck` | boolean | `true` (`ci` only effective with `gh`) |
| `prodHosts` | string[] `name=address` | `[]` (shield then only for SQL + force push) |
| `secretAllowPaths` | string[] (globs) | `["**/test/fixtures/**", "**/*.example", "**/.env.example"]` |
| `snapshotMaxMb` | number | 500 |
| `dietMaxKb` / `dietMaxLines` | number | 256 / 2000 |
| `testCommand` | string | `""` (automatic) |
| `quietHours` | string `HH-HH` | `"22-07"` |
| `sound` | boolean | `false` |
| `reducedMotion` | boolean | `false` |

`rules.json` (house rules), version 1:

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

Validation is pure (`validateRules(json) → { rules, errors[] }`): unknown fields,
invalid regex, `check` not a string array, placeholders other than `{host}` → error. Errors in
one rule discard only that rule; if the file is unreadable/not JSON → defaults only.
Every error appears in `/exo` and once as a toast.

### 3.7 Store

Keys with schema version `schema: 1` and migration functions `migrate[n]: (old) => new`
(pure, tested). Budget (total < 3 MiB, the rest as reserve):

| Key | Content | Cap |
|---|---|---|
| `prefs` | `/exo` overrides | small |
| `journal:current` | running journal, compacted | 512 KB |
| `sessions` | summaries of the last 20 sessions (per project) | 300 KB |
| `snapshots` | snapshot metadata | 64 KB |
| `hours` | day × project → active seconds, segments of the current day | 512 KB, older than 400 days dropped |
| `achievements` | progress, counters, streaks | 64 KB |
| `lastSession` | per project the notice „Letzte Sitzung …“ + `shown` | 64 KB |
| `health` | last errors per module | 32 KB |

`store.ts` measures the JSON size before every `set`, truncates according to a fixed rule (oldest
first) and writes throttled (5 s, immediately on `session.end`).

### 3.8 Shell parser

`parse(cmd) → Script`: list of pipelines/lists with operators `&& || ; | &`, subshells
`( … )`, groups `{ …; }`, command substitution `$( … )`/backticks (as nested
scripts), assignment prefixes `FOO=1 cmd`, quotes (`'…'`, `"…"` with escapes,
`$'…'`), redirections (`>`, `>>`, `2>`, `&>`, `<`, heredoc `<<EOF`/`<<'EOF'` with content),
comments. No execution, no expansion; unknown expansions remain marked
(`hasExpansion`). `words.ts` normalizes commands: peels wrappers `sudo`, `env`, `nice`, `nohup`,
`time`, `command`, `exec`, `xargs`; parses `bash|sh|zsh -c "…"` recursively;
`ssh host "…"` yields the remote command as a nested script with host.
After the security review (2026-10-05) additionally: substitutions in arithmetic
(`$(( $(cmd) ))`, `(( … ))`) and in parameter expansion (`${x:-$(cmd)}`, also inside quotes),
`$((cmd) )` as substitution of a subshell, local commands of `ssh -o ProxyCommand/LocalCommand`
and `find -exec/-execdir/-ok`.
Fixture tests: at least 120 cases, including error cases (unclosed quotes ⇒
`unparsable`, never a crash).

### 3.9 Health and `/exo`

`health.ts` per module: `state: on|off|broken`, `calls`, `totalMs`, `maxMs`, `budgetHits`,
`lastError { at, message }` (masked). A module counts as broken after an internal error,
until `/exo reset <modul>` or restart; comfort modules keep running anyway.

`/exo` prints a table (module, state, time, last error), plus kill switch
state, path to `~/.claude/exo/`, warnings from `rules.json`. Subcommands: `/exo on|off`,
`/exo on|off <modul>`, `/exo reset <modul>`, `/exo rules` (loaded rules).

### 3.10 Command names

`/exo`, `/undo-last`, `/undo-list`, `/recap`, `/hours`, `/achievements`, `/duck`.
At startup `$.command.list()` is checked; a name that already exists is registered as `exo-<name>`
and named in `/exo`.

---

## 4. Modules

### 4.1 Guards

**#2 Secret guard (`secrets`)** (`secrets-logic.ts` pure: `scan(text, ctx) → Finding[]`, `mask(s)`)
- Patterns: `sk-ant-…`, OpenAI `sk-…`/`sk-proj-…`, GitHub `ghp_`/`gho_`/`ghu_`/`ghs_`/
  `github_pat_`, AWS `AKIA…` (+ secret key context), Stripe `sk_live_`/`rk_live_`,
  Slack `xox[abpr]-`, PEM `-----BEGIN … PRIVATE KEY-----`, JWT, `password|passwd|secret|token
  = "…"` assignments; plus Shannon entropy ≥ 4.0 bits/character from 24 characters in an
  assignment context.
- False-positive exclusions: UUIDs, hex hashes in lockfiles (`integrity`, `sha512-`), Git SHAs,
  base64 data URLs of images, placeholders (`xxx`, `<…>`, `changeme`, `your-…`).
- Checks: Write (`content`), Edit (`new_string`), NotebookEdit, Bash with `>`, `>>`, `tee`,
  heredoc. Before `git commit`: `git diff --cached -U0` (added lines only); before
  `git push`: `git log -p -U0 @{u}..HEAD` (without upstream: `origin/HEAD..HEAD`, otherwise only a
  warning in the `context`).
- `.env`: allowed if `git check-ignore -q <pfad>` applies; otherwise denial with a hint
  to add `.env` to `.gitignore`. Allow list: `.env.example`, comment
  `exo-allow-secret` on the same line, `secretAllowPaths`.
- Message: file, line, kind, masked value (`sk-ant-…a1b2`), suggestion `.env`. The
  plaintext never leaves the check function.
- **Test data**: keys in tests are assembled at runtime
  (`'sk-' + 'ant-' + …`), so that neither the own guard nor GitHub Push Protection mistakes the
  source for a real secret.

**#1 Prod shield (`prodShield`)** (`prod-logic.ts` pure: `inspect(script, hosts, sshAliases, rules) → Finding[]`)
- Hosts: `prodHosts` + aliases from `~/.ssh/config` (parsed, pure; host entries whose
  `HostName` points to a prod address, and the prod names themselves; wildcards `*` are
  not resolved).
- Matches: `ssh`/`scp`/`rsync`/`sftp` with a prod target (incl. `user@`, `-p`, `-J`, `host:pfad`),
  `systemctl restart|stop|reload` in the remote command, SQL `DROP`/`TRUNCATE`/`DELETE`/`UPDATE`
  without `WHERE` (in `psql -c`, `mysql -e`, `sqlite3 db "…"`, heredocs to these programs),
  `git push --force|-f|--force-with-lease` or `+main` refspec on `main`/`master`
  (also if the current branch is main and no target is given).
- House rules: if `match` matches the (remote) command and the host matches, `check` runs
  (`$.process.run`, 10 s timeout). `blockWhen` met → denial with `text`. Check
  not feasible → noted in the dialog, decision stays with the human.
- Dialog `$.ui.ask("<Ziel>: <Befehl> – ausführen?", optionen)` (<target>: <command> – run?), options
  „Ausführen“ (Run) / „Abbrechen“ (Cancel) / „Trockenlauf“ (dry run; only when possible). Esc/reject → cancel.
  Without interactive UI → `{deny}`.
- Dry run: `rsync` → insert `--dry-run`; `git push` → `--dry-run`; SQL `DELETE`/
  `UPDATE` without WHERE → `SELECT COUNT(*) FROM <tabelle>` in the same client call, only if the
  SQL is a single, unambiguously recognized statement. Otherwise no option.
- Unparsable commands with a prod reference (address/name appears in the text) → dialog instead of
  waving through. README: safety belt, not a sandbox; it does not detect obfuscation.

**#3 Cleanup brake (`brake`)** (`brake-logic.ts` pure: detection + plan; `brake.ts` executes)
- Detection: `rm` with `-r` and `-f` in any spelling (`-rf`, `-fr`, `-r -f`,
  `--recursive --force`), `git reset --hard`, `git checkout -- .`/`git checkout .`,
  `git restore .` (without `--staged`), `git clean` with `-f` and `d`/`x`.
- Plan per case: tracked changes → `git stash create`, save the SHA under
  `refs/exo/snapshots/<id>` (otherwise `git gc` may clean it up) + remember `HEAD`;
  untracked (`git clean`: list from `git clean -n` with the same flags) and `rm -rf` targets
  → `tar -czf` relative to the working directory.
- Paths with expansion (`$VAR`, `$(…)`, globs with more than `* ? [ ]`) are **not**
  evaluated (no execution of foreign expressions) → dialog „kann nicht gesichert werden:
  trotzdem ausführen?“ (cannot be backed up: run anyway?). Simple globs are resolved via `$.fs.list`.
- Size beforehand (`du -sk`); above `snapshotMaxMb` → dialog instead of silent waving through.
- Storage `~/.claude/exo/snapshots/<id>/` (`files.tgz`, `meta.json`), metadata also in
  `$.store`. Retention: last 20 or 7 days, cleaned up on `session.start`
  (incl. `refs/exo/...`).
- After the run in the result `context`: „wiederherstellbar mit /undo-last“ (restorable with /undo-last).
- `/undo-last`, `/undo-list`: restoring checks for conflicts beforehand (existing files,
  changed worktree) and asks via `$.ui.ask`; never silent overwriting.

**#15 Context diet (`diet`)** (`diet-logic.ts` pure: `decide(read, stat, history) → plan`)
- Applies to Read without `offset`/`limit`/`pages` if the file is > `dietMaxKb` or >
  `dietMaxLines` lines, or a lockfile/`*.min.js`/`*.map`/`*.log`. Never images/PDF/notebooks.
- Implementation: `next({ ...e, limit: 200 })`, then the end via `tail -n 80`, appended as
  `context` to the result, plus a hint (targeted with `offset`/`limit` or `grep`) and
  savings (≈ bytes/4 tokens). Line count via `wc -l` (also > 4 MiB).
- Loop protection: if Claude reads the same file again as the next Read without a range,
  it is let through.

### 4.2 Cockpit

**#4 Live test light (`testLight`)**
- Runner detection pure (`detectRunner(files) → Runner`): vitest (`vitest related --run
  <dateien>`), jest (`jest --findRelatedTests`), pytest (matching `test_*.py`, otherwise all),
  `node --test` (mirror test file), `cargo test`, Gradle (`test`). Overridable with
  `testCommand` (placeholder `{files}`).
- Trigger: `file.changed` on source code. Debounce 1.5 s, abort a running run (leave
  spawn), `nice -n 10`. If Claude is currently running tests itself (journal `test.run source
  claude phase start` without end, from Bash detection in the shell parser) → wait.
- Display: `● 48/48` green, `● 2 rot` (2 red), `● …` running.
- Red tests (name, assertion, file:line, max. 2 KB) go once via
  `prompt.submit` → `context` into the next prompt (not `prompt.context`, which fires only
  once per conversation).

**#6 Done check (`doneCheck`)** („Fertig?“ (Done?)): `turn.complete` checks `answer` for claims (de/en). If
no green test/build run took place in this turn after the last file change, the hook returns
`{ text: '⚠ In diesem Turn lief kein Test.' }` (No test ran in this turn.) – the engine shows it subtly below
the answer. At most once per turn, and only if files were changed in the turn (decided).

**#7 Changes sidebar (`sidebar`)**: pane `exo-changes` with all changed files and `+/−`.
Selection shows the diff (`Code`, `format: 'diff'`). Git: `git diff -- <pfad>`. Without Git:
back up the original on first touch in `~/.claude/exo/originals/<sitzung>/`, diff
computed in-house (Myers, pure). Reset after `$.ui.ask` confirmation, preceded by a snapshot via
the brake mechanism.

**#14 CI light (`ci`)**: active only with `gh auth status` = 0 and a GitHub remote. Every 60 s
`gh run list --branch <b> --limit 1 --json …`, exponential backoff on errors, pause
after 15 min without a prompt. Display `● CI grün · vor 3 min` (CI green · 3 min ago). Red: toast (toasts cannot carry
buttons) + entry in the AbovePrompt band with button **Log an Claude geben** (give log to Claude): fetches
`gh run view <id> --log-failed`, truncates to 6 KB, puts it via `$.prompt.fill` into the
input field (Martin submits it himself).

### 4.3 Review

One combined report.
- `session.end` (short time limit): condense facts from the journal (duration, turns,
  files, tests before/after, cost from `session.usage().cost`, lesson candidates as
  short quotes) → `sessions` + `lastSession[projekt]`. No model call, no process.
- Next start in the same project (Git root, otherwise cwd): band „Letzte Sitzung …“ with
  a close button, once, dropped after 7 days.
- `/recap`: card as command output (drawn via `CommandOutput`), open items via
  `$.model.complete({ model: 'haiku', timeoutMs: 20000 })` from the last answers
  (`$.session.messages`). `/recap md` writes `<projekt>/.exo/recap-<datum>.md`,
  `/recap copy` → clipboard.
- **#16 Lessons (`lessons`)**: detection („das war die Ursache“ (that was the cause), „Falle“ (trap), „nie wieder“ (never again), „Lehre“ (lesson), en
  equivalents) in `turn.complete`. On `/recap` 1–3 suggestions, selection via
  `$.ui.ask` (multiSelect), duplicates of existing entries in the target CLAUDE.md
  (normalized text comparison) are dropped. Written only after confirmation,
  appended under `## Lehren (exo)` of the nearest CLAUDE.md in the project.
- **#17 Time tracking (`hours`)**: activity = `prompt.submit`, `tool.start/end`, `turn.complete`; gap
  > 5 min = break. Aggregate day × project in `hours`. Hint line `⏱ 3:12 heute` (today). `/hours`
  shows the week per project; `/hours export csv|json` writes to `~/.claude/exo/`.

### 4.4 #18 Achievements & streaks (`achievements`)

Rules as data (`erfolge/rules.ts`):
`{ id, title, description, icon, metric, op, value, scope: 'turn'|'session'|'day'|'ever',
requires?: 'usage-bars' }`, evaluated via journal metrics (pure). Starter set ~15, among others
„10 Turns ohne roten Test“ (10 turns without a red test), „Erster Commit vor 9 Uhr“ (first commit before 9 am), „Kontext nie über 50 %“ (context never above 50 %), „Pac-Man hat
nie den Geist gesehen“ (Pac-Man never saw the ghost; the 5-h window stayed below 90 %; visible only if usage-bars is loaded
– recognizable by `$.config.list()` lines `usage-bars.*`; values from `$.session.usage()`).
Toast + optional sound, at most one badge per turn, quiet hours. `/achievements` as an
ASCII card.

### 4.5 #19 Spinner cinema (`cinema`)

`ui.render` on `Spinner`: `next({ ...e, props: { ...e.props, message: frame + fakt } })`.
Activity from the journal (running `tool.start` + `kind` from the shell parser: install, build,
deploy, search, test, otherwise long turns > 60 s → coffee). Frames as `.ts` data,
style packs. 30 fps timer only while a tool is running or a turn is working; afterwards
stopped. `NO_COLOR`/`reducedMotion` → static symbol. Any error → `next(e)`.
Limitation: Spinner exists only on terminal and desktop; `ToolProgress` is only the
ctrl+b pill and is not used.

### 4.6 #20 Rubber duck (`duck`)

`/duck` opens a pane (`focus`, `closeOnEscape`) with an ASCII duck, five questions in sequence
(`Input`, buttons „Weiter“/„Überspringen“ (Next/Skip)). Template deterministic, tested pure. At the end
a preview (`Code`) and button **In den Prompt übernehmen** (insert into the prompt) → `$.prompt.fill`; it is submitted
only when Martin presses Enter.

---

### 4.7 State as of Stage 2 (2026-10-05) – deviations and additions

- **Working directory:** the Bash tool keeps its directory between calls; exo
  tracks the `cd`s of each call (`core/cwd.ts`). Secrets (targets of `>`/`tee`, Git directory),
  brake (relative paths) and self-protection take it into account. With `cd -`/`cd $X` it is unknown.
- **Secrets:** values starting with `/` (regex literals, paths) don't count as a password.
  `git push` checks `git log -p HEAD --not --remotes` (everything not yet on any remote) instead of
  `@{u}..HEAD` – this also covers a first push without upstream.
- **Prod shield:** a force push without a refspec asks Git for the branch; if it cannot be determined,
  `main` is assumed (caution over convenience). An ssh error (exit 255) in a
  house-rule check means "check not possible" – noted in the dialog, decision with the human.
- **Brake:** `xargs rm -rf` and `find -exec rm -rf {}` only get their paths at runtime –
  this counts as "cannot be backed up" and asks. Without UI the brake continues with a notice (it
  is a comfort guard; a headless script should not get stuck on it).
- **Self-protection + effect check:** if a control change was allowed in the dialog, the
  effect check doesn't ask again afterwards.
- **Commands:** `/undo-last [id]`, `/undo-list`; taken names fall back to `exo-<name>`.
- **Test data:** the fake keys of the tests carry `exo-allow-secret`, otherwise exo blocked
  the commits of its own repo (self-test with its own scanner: 0 findings).

### 4.8 State as of Stage 3 (2026-10-05)

- **Module lifecycle:** steps can additionally have `start` (session start/reload),
  `promptContext` (text for the next prompt, via `prompt.submit`) and `turnComplete` (line
  below the answer); the runtime calls them per module in a protected way.
- **File changes** are reported by the core itself (`file.changed` with +/−, Myers diff in `core/diff.ts`,
  tested against `patch`) – all cockpit modules read them from the journal.
- **Test light:** background run via `$.process.spawn` (abortable), `nice -n 10`, 1.5 s
  debounced, waits for Claude's own test runs. For `node --test`/`npm test` the whole
  suite runs (no reliable mapping file → test); vitest/jest use `related`/
  `--findRelatedTests`, pytest only the changed test files when test files changed.
- **Done check:** only on file changes in the turn; a green test *or* build run after the
  last change suffices (also one from the test light).
- **Sidebar:** `/changes` opens the pane. The comparison runs against the state **before the
  first change in this session** (backed up under `~/.claude/exo/originals/<sitzung>/`),
  not against Git – so it works the same with and without Git. Resetting asks, backs up beforehand
  (visible in `/undo-list`), deletes a newly created file only after confirmation.
- **Test light – consent (after security review):** project commands (`npm test`, `gradlew`,
  `conftest.py` …) only run after an **Allow** per project; stored with a
  fingerprint of the runner configuration (store key `trust`, outside the repo), asked again on every
  change to it; never without UI. Around every background run lies the same
  effect check as around tool calls. File names are passed to the runner as `./pfad`.
- **CI light:** starts in the background (session start doesn't wait for `gh`); the button puts
  the log into the input field via `$.prompt.fill`, submission is manual.
- **Live false positive of the secret guard:** it blocked exo's own test light (`passed = …`
  counted as a password, the name check looked for the character sequence `pass`). Now only whole
  name components count (`db_password`, `dbPassword`, `PWD` yes; `passed`, `compass`, `bypass` no).

### 4.9 State as of Stage 4 (2026-10-05)

- **Session end:** modules have an `end` hook; it only stores (no model, no process).
- **Recap:** facts from the journal (duration, active time, turns, files summarized per path,
  first and last test run, cost from `$.session.usage`); empty sessions are not
  stored. The notice „Letzte Sitzung …“ appears in the band above the prompt (dismissible),
  once, only in the same project, not for the current session, not after seven days.
  `/recap` asks `haiku` (20 s timeout) for open items from the last 12 answers.
- **Lessons:** candidates from answers (without code blocks), stored per session; on `/recap`
  at most three, without duplicates of the project CLAUDE.md, multi-selection in the native dialog;
  only what is checked is written under `## Lehren (exo)` (the file is created if missing).
- **Lessons – security (after review):** future sessions read a CLAUDE.md as
  instructions. The dialog therefore shows each lesson in full wording (options are only numbers),
  exactly that wording is written, sanitized beforehand (no markup, no HTML, no
  backticks, one line). Own write operations (CLAUDE.md, `.exo/recap-*.md`) check via
  `core/safepath.ts` that the resolved path lies within the project – a symlink pointing outside aborts.
- **Hours:** gap over 5 min = break; switching projects credits nothing. Day total from
  one minute in the hint line, `/hours` week Mon–Sun, `/hours export csv|json` to
  `~/.claude/exo/`. 400 days retention.

### 4.10 State as of Stage 5 (2026-10-05)

- **Duck:** `/duck` opens a dialog pane (`focus`, Esc closes); five questions, each
  skippable, empty answers count as skipped; template fixed, error message as a
  code block. „In den Prompt übernehmen“ puts the text into the input field via `$.prompt.fill` –
  submission is manual. On the phone (no `Input`) only a notice.
- **Achievements:** 15 badges as data (`RULES`: metric + threshold). Counters from the journal
  (each event once, per session from the start), metrics from hours (daily record, daily streak)
  and session verdicts at session end (context ≤ 50 %, 5-h window < 90 % at 10+ turns).
  At most one badge per turn; toast/sound not during quiet hours (it is unlocked anyway).
  „Pac-Man …“ only if usage-bars is loaded (recognized by its `/config` lines; exo reads the values
  itself from `$.session.usage`, not from usage-bars).
- **Cinema:** variant A – only `Spinner.message` (time/tokens remain the engine's). Activity from
  the running tool (journal), coffee after a 60 s turn. 30 fps redraw only while a film
  is playing; reduced motion = still image without a fast timer; `NO_COLOR` = ASCII pack.
- **File system errors:** only `ENOENT`/`ENOTDIR`/"no such file" count as "missing"
  (`isMissingError`), everything else denies. The real error text of `$.fs.stat` is not
  observable in the test kit (it has no file system); if it turns out different, exo denies
  harmless write operations – the safe direction.

## 5. State contract (`types/index.d.ts`)

`PluginState['exo']`: `status` (status line slots), `banner` (AbovePrompt entries),
`changes` (sidebar), `duck` (dialog state), `spinner` (current activity + start time),
`health` (for `/exo`). Everything a render reads lives here, not in module variables.

---

## 6. Test plan

Two levels like usage-bars:
- `npm test` → `node --import tsx --test tests/*.spec.ts`: pure logic, without Claude Code.
- `npm run test:engine` → `claude plugin test .`: hooks against the real engine
  (`claude-code/testing`, mock clock/store, both surfaces terminal + desktop).
- `npm run check` → `tsc -p .` + `claude plugin validate .`. `tsc` covers core, hooks,
  contract and engine tests; the Node tests (`tests/`) run via tsx without type checking,
  because they would otherwise need `@types/node` as a new dependency.

| Module | Pure (spec) | Engine (test.tsx) |
|---|---|---|
| Shell parser | ≥ 120 fixtures, error cases, nesting, ssh remote | – |
| Journal | ring buffer, compaction, masking | events from real hooks |
| Dispatcher | – | order, fail closed (guard throws ⇒ deny), fail open (comfort throws ⇒ runs), `.catch`, kill switch (file/env/`/exo off`), budget message |
| Config/Rules | validation, broken JSON, precedence | warning in `/exo` |
| Store | migrations, budget truncation | throttling |
| Secrets | every pattern positive, false-positive cases, masking, allow list, `.env` rule | Write/Edit/Bash/commit/push |
| Prod shield | host detection incl. ssh config, SQL, force push, dry-run rewrite, rules | dialog options, Esc, `-p` |
| Brake | detection of all spellings, plan, expansion cases | snapshot + `/undo-last` in a throwaway repo |
| Diet | thresholds, exceptions, loop protection | rewrite + `context` |
| Test light | runner detection, output parser per runner | debounce, abort, context in the next prompt |
| Done check | claim detection de/en | notice at most once |
| Sidebar | Myers diff | pane, reset with confirmation |
| CI | backoff, state derivation | band button |
| Review | condensation, 7-day rule, lesson detection, duplicates, hours aggregate | notice once + dismissible |
| Achievements | every rule, one badge per turn, quiet hours | toast |
| Cinema | mapping activity → animation, width, NO_COLOR | fallback on error |
| Duck | template | pane flow, `prompt.fill` |
| Docs | drift guard (README ↔ userConfig, commands, modules) like usage-bars | – |

**Mutation probe** (mandatory for shell parser, secrets, prod shield, brake):
`tools/mutate.ts` (without dependencies) copies the repo into a temp directory, applies
one replacement per entry from `tests/mutations.ts`, **verifies via checksum that it
took effect**, and expects the named tests to fail. Result in
`docs/MUTATIONS.md`. Every security-relevant test must have been seen red there at least
once. A mutant that does not compile does not count.

---

## 7. Stages

After each stage: `npm test`, `npm run test:engine`, `npm run check` green, report, commit,
push (private).

1. **Core** – adapter, journal, dispatcher (with empty guard placeholders), kill switch,
   shell parser, status line, config + rules.json validation, store, health, `/exo`.
   Then symlink into the dev-mods folder and activate hot reload. **Then stop.**
2. **Guards** – #2 Secrets, #1 Prod shield, #3 Cleanup brake (+ `/undo-last`,
   `/undo-list`), #15 Context diet. Mutation probe.
3. **Cockpit** – #4 Test light, #6 Done check, #7 Sidebar, #14 CI light.
4. **Review** – #10 Recap, #16 Lessons, #17 Hours as one report.
5. **Extras** – #20 Duck, #18 Achievements, #19 Cinema.
6. **Publication** – README (module overview, installation, configuration reference,
   placeholders for screenshots/GIFs, section "Limitations"), `CLAUDE.md` with lessons from the
   build, CHANGELOG, LICENSE (MIT), footer `© 2026 Martin Pfeffer | celox.io`.
   History check (section 8), only then release for publication.

---

## 8. Before publication

- Run the complete Git history (`git log -p --all`) through the own secret scanner and a
  search for the locally configured prod addresses and names as well as private IP ranges.
- Matches → clean the history before the repo becomes public.
- Tests and docs consistently use `203.0.113.x`, `198.51.100.x`, `example.com`.

---

## 9. Risks and limitations

- **No protection if the module doesn't load** (the engine then lets things through). Countermeasures:
  `/exo` shows the state, the status line is visibly missing, engine tests before every commit.
- **The guard runs in the session that builds it.** An error can block its own
  commands → kill switch from Stage 1; tests with assembled fake keys.
- Dialog frequency of the prod shield: every `ssh` to prod asks, deliberately without a
  read allow list (decided).
- The sidebar doesn't see file changes made via Bash (sed, scripts).
- `$.store` 4 MiB: the budget in 3.7 is hard; hours and sessions are truncated, never the
  snapshot metadata of the last 7 days.
- Sound only on macOS (`afplay`).
