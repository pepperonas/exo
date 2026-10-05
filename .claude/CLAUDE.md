# CLAUDE.md – exo

Claude Code mod (function hooks, Claude Code 2.1.289). Plan and decisions: `docs/PLAN.md`. Mutation protocol: `docs/MUTATIONS.md`.

Everything is English: interface (status line, dialogs, toasts, command output), documentation, code and commits. Detection logic still recognises German input (claims like „fertig“, password names like `passwort`, the old `## Lehren (exo)` heading) — keep it when you touch those rules.

## Layout

- `hooks/register.tsx` – the **only** file that talks to `$`: registration, the `hostOf($)` adapter, `$.state` atoms, render hooks.
- `core/` – the core, written against the `Host` interface (`core/adapter/host.ts`): dispatcher (fixed order, error policy), journal, shell parser, self-protection, effect check, store, config, status line.
- `modules/` – guards (`waechter`), cockpit, review (`rueckblick`), extras; every module is a `Step` with optional lifecycle hooks (`start`, `before`, `after`, `promptContext`, `turnComplete`, `end`).
- `tests/*.spec.ts` – pure logic and drift guards (`npm test`); `hooks/*.test.tsx` – against the engine (`npm run test:engine`).
- `tools/` – `mutate.ts` (mutation probe), `history-scan.ts` (git history), `social.ts` (social card and icon).

## Check before every commit

```bash
npm test && npm run check && npm run test:engine && npm run mutate
```

Read exit codes **directly**. `cmd | tail && echo OK` checks `tail`, not `cmd` – that happened several times during the build and once reported a broken scan as "no hits".

Changing the number of tests means changing the `node tests`/`engine tests` badges in the README; the drift guards say so.

## Lessons from the build

### Engine (claude plugin validate)
- `$` must **never cross an import boundary**; pass it only to functions in the same file. That is why the adapter lives in `register.tsx`.
- `$.env.get` takes **literal** names only. `Host.env` is typed to a fixed list.
- `$.state` refs must be constants (from `atom(...)`) in the same file.
- The engine **fails open**: a hook that throws or overruns its 10 s own-time budget is skipped and the call goes ahead. Fail closed only through your own `try/catch` plus a `.catch` handler on the registration.
- `prompt.context` fires **once per conversation** – text for the next prompt goes through `prompt.submit` → `context`.
- `turn.complete`: a returned `text` different from the answer appears **beneath** the answer.
- `$.fs.stat(p, { resolve: true })`: `isLink` is true for a dangling symlink too, and `realPath` is missing then.
- This file lives in `.claude/CLAUDE.md`, not the repo root: at the plugin root `claude plugin validate` warns that it is not shipped as context, and `--strict` fails on it. Claude Code reads `.claude/CLAUDE.md` as project instructions just the same.

### Test kit (claude plugin test)
- No real file system (`no implementation for fs.stat`). A hook that throws is **skipped** – "file missing" can't be simulated that way.
- `$` in a test has no `store` and no `clock`; use your own `store.*` hooks, and the clock that `mock.clock` returns.

### Security
- **Text checks are never complete.** Four review rounds kept finding new spellings that slipped past self-protection. What holds is the **effect check** (state before/after); the text check is only the early warning.
- Everything exo runs or writes itself needs the same care as Claude's calls: the test light ran project commands unasked (now: consent per project + a fingerprint of the configuration); writes followed symlinks (now: `core/safepath.ts`).
- An "allow" covers only what was shown. For Bash, the text doesn't show the effect.
- What future sessions read as instructions (`CLAUDE.md`) is shown in full, sanitised, and written only when ticked.
- Unknown errors during path checks lead to **refusal** (`isMissingError`).
- The history scan runs the secret rules line by line; it must pass the lockfile flag, or every `integrity` hash in a lockfile is reported as a high-entropy string.

### Tests
- **A test that was never red is no assurance.** `npm run mutate` proves it per test; "INVALID" means a moved anchor, "BLIND" means a weak test or redundant code.
- Assemble test keys at run time and mark them with `exo-allow-secret` – otherwise exo's own secret guard blocks the commits of this repo.
- Match names in detection rules as **whole parts**: the secret guard once took `passed = …` for a password, live.

## Conventions

- English everywhere; German only where exo must *recognise* German input.
- No real addresses in the repo: examples use `203.0.113.x`, `198.51.100.x`, `example.com`.
- No runtime dependencies; devDependencies pinned exactly. No lockfile in the plugin root (`.npmrc`: `package-lock=false`) – Claude Code would install the dev tools for every user.
