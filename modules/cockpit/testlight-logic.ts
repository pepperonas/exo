/**
 * #4 Live-Testampel, the pure part: which runner, which command for the
 * changed files, which Bash commands are Claude's own test or build runs, and
 * what a run's output says (counted as green and red tests).
 */
import type { Cmd } from '../../core/shell/words'

export type RunnerName = 'vitest' | 'jest' | 'node' | 'npm' | 'pytest' | 'cargo' | 'gradle' | 'go' | 'custom'

export interface Runner {
  name: RunnerName
  /** argv for the given changed files (absolute paths). */
  argv(files: string[]): string[]
}

export interface ProjectFacts {
  root: string
  /** package.json content, parsed; undefined without one. */
  pkg?: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  hasPytest: boolean
  hasCargo: boolean
  hasGradlew: boolean
  hasGradle: boolean
  hasGoMod: boolean
}

const has = (pkg: ProjectFacts['pkg'], dep: string) => !!(pkg?.dependencies?.[dep] ?? pkg?.devDependencies?.[dep])
const rel = (root: string, f: string) => (f.startsWith(root + '/') ? f.slice(root.length + 1) : f)

export function detectRunner(p: ProjectFacts, override: string): Runner | null {
  if (override.trim()) {
    const parts = override.trim().split(/\s+/)
    return { name: 'custom', argv: files => parts.flatMap(x => (x === '{files}' ? files.map(f => rel(p.root, f)) : [x])) }
  }
  if (p.pkg) {
    const test = p.pkg.scripts?.test ?? ''
    if (has(p.pkg, 'vitest') || /\bvitest\b/.test(test)) return { name: 'vitest', argv: files => ['npx', '--no-install', 'vitest', 'related', '--run', ...files.map(f => rel(p.root, f))] }
    if (has(p.pkg, 'jest') || /\bjest\b/.test(test)) return { name: 'jest', argv: files => ['npx', '--no-install', 'jest', '--findRelatedTests', ...files.map(f => rel(p.root, f)), '--passWithNoTests'] }
    if (test && !/no test specified/.test(test)) return { name: test.includes('--test') ? 'node' : 'npm', argv: () => ['npm', 'test', '--silent'] }
  }
  if (p.hasPytest) return { name: 'pytest', argv: files => ['python3', '-m', 'pytest', '-q', ...relatedPy(files).map(f => rel(p.root, f))] }
  if (p.hasCargo) return { name: 'cargo', argv: () => ['cargo', 'test', '--quiet'] }
  if (p.hasGradlew) return { name: 'gradle', argv: () => ['./gradlew', 'test', '-q'] }
  if (p.hasGradle) return { name: 'gradle', argv: () => ['gradle', 'test', '-q'] }
  if (p.hasGoMod) return { name: 'go', argv: () => ['go', 'test', './...'] }
  return null
}

/** Python: changed test files run themselves; any other change runs the whole suite. */
function relatedPy(files: string[]): string[] {
  const tests = files.filter(f => /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(f))
  return tests.length === files.length ? tests : []
}

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|rs|go|kt|kts|java|scala|rb|swift|c|cc|cpp|h|hpp|cs|php|vue|svelte)$/
const IGNORED = /(^|\/)(node_modules|dist|build|out|target|coverage|\.git|\.venv|venv|__pycache__|\.next)(\/|$)/

export const isSourceFile = (path: string) => SOURCE.test(path) && !IGNORED.test(path)

const TEST_SCRIPTS = /^(test|tests|test:.*|vitest|jest|check)$/
const BUILD_SCRIPTS = /^(build|build:.*|compile|typecheck|tsc|lint)$/

/** What a Bash command runs: a test suite, a build, or neither. */
export function runKind(cmds: readonly Cmd[]): 'test' | 'build' | null {
  let kind: 'test' | 'build' | null = null
  for (const c of cmds) {
    if (c.via.some(v => v.kind === 'ssh')) continue
    const a = c.argv
    const p = c.program
    const sub = a[1] ?? ''
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(p)) {
      const script = sub === 'run' || sub === 'run-script' ? (a[2] ?? '') : sub
      if (TEST_SCRIPTS.test(script) || sub === 't') return 'test'
      if (BUILD_SCRIPTS.test(script)) kind = 'build'
      continue
    }
    if (p === 'npx' || p === 'bunx' || p === 'pnpx') {
      const tool = a.slice(1).find(x => !x.startsWith('-')) ?? ''
      if (/^(vitest|jest|mocha|ava|playwright)$/.test(tool)) return 'test'
      if (/^(tsc|vite|next|webpack|esbuild|rollup)$/.test(tool)) kind = 'build'
      continue
    }
    if (/^(vitest|jest|mocha|pytest|tox|nox|rspec|phpunit)$/.test(p)) return 'test'
    if ((p === 'python' || p === 'python3') && a[1] === '-m' && /^(pytest|unittest)$/.test(a[2] ?? '')) return 'test'
    if (p === 'node' && a.includes('--test')) return 'test'
    if (p === 'cargo' && sub === 'test') return 'test'
    if (p === 'cargo' && (sub === 'build' || sub === 'check' || sub === 'clippy')) kind = 'build'
    if (p === 'go' && sub === 'test') return 'test'
    if (p === 'go' && (sub === 'build' || sub === 'vet')) kind = 'build'
    if ((p === 'gradle' || p === 'gradlew') && a.some(x => /^(test|check|:.*:test)$/.test(x))) return 'test'
    if ((p === 'gradle' || p === 'gradlew') && a.some(x => /^(build|assemble.*)$/.test(x))) kind = 'build'
    if ((p === 'mvn' || p === 'mvnw') && a.includes('test')) return 'test'
    if (p === 'make' && a.some(x => /^(test|check)$/.test(x))) return 'test'
    if (p === 'make' && (a.length === 1 || a.includes('build') || a.includes('all'))) kind = 'build'
    if (p === 'tsc') kind = 'build'
    if (p === 'claude' && a[1] === 'plugin' && a[2] === 'test') return 'test'
  }
  return kind
}

export interface RunOutcome {
  ok: boolean
  /** Tests that went through. */
  green?: number
  /** Tests that did not. */
  red?: number
  /** The failing tests, short: name, assertion, file:line. Capped. */
  failures: string
}

export const FAILURE_MAX = 2_000

const sum = (re: RegExp, text: string): number | undefined => {
  let total: number | undefined
  for (const m of text.matchAll(re)) total = (total ?? 0) + Number(m[1])
  return total
}

/** Strips terminal colours. */
export const plain = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')

export function parseRun(raw: string, exitCode: number | null): RunOutcome {
  const text = plain(raw)
  // node --test (TAP summary)
  let green = sum(/^# pass (\d+)/gm, text)
  let red = sum(/^# fail (\d+)/gm, text)
  // vitest: "Tests  2 failed | 46 passed (48)"
  const vt = /Tests\s+(?:(\d+) failed\s*\|\s*)?(?:(\d+) passed)/.exec(text)
  if (vt && green === undefined) {
    red = Number(vt[1] ?? 0)
    green = Number(vt[2])
  }
  // jest: "Tests:       1 failed, 2 skipped, 47 passed, 50 total"
  const jt = /Tests:\s+(?:(\d+) failed, )?(?:\d+ skipped, )?(?:\d+ todo, )?(\d+) passed/.exec(text)
  if (jt && green === undefined) {
    red = Number(jt[1] ?? 0)
    green = Number(jt[2])
  }
  // pytest: "===== 2 failed, 46 passed in 1.2s ====="
  if (green === undefined && /=+ .*(passed|failed).* in [\d.]+s/.test(text)) {
    green = Number(/(\d+) passed/.exec(text)?.[1] ?? 0)
    red = Number(/(\d+) failed/.exec(text)?.[1] ?? 0)
  }
  // cargo: "test result: FAILED. 46 passed; 2 failed;"
  if (green === undefined && /test result:/.test(text)) {
    green = sum(/test result: \w+\. (\d+) passed/g, text)
    red = sum(/(\d+) failed;/g, text)
  }
  const ok = exitCode === 0 && !red
  return { ok, green, red, failures: ok ? '' : failureText(text) }
}

const MARKERS = /^(?:not ok \d+|\s*(?:FAIL|FAILED|✗|×|✕|●)\s|.*(?:AssertionError|Error:|assert(?:ion)? failed|panicked at|--- FAIL:)|\s*(?:expected|actual|Expected|Received)\b|.*:\d+:\d+)/

/** The lines that say what failed: markers plus the line after each. */
export function failureText(text: string, max = FAILURE_MAX): string {
  const lines = text.split('\n')
  const keep = new Set<number>()
  lines.forEach((l, i) => {
    if (MARKERS.test(l)) {
      keep.add(i)
      if (i + 1 < lines.length) keep.add(i + 1)
    }
  })
  const out = [...keep].sort((a, b) => a - b).map(i => lines[i]!.trimEnd()).filter(Boolean)
  const joined = (out.length ? out : lines.slice(-20)).join('\n')
  return joined.length > max ? joined.slice(0, max) + '\n…' : joined
}
