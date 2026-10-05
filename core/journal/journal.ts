/**
 * The session's event log, read by every module. Modules never write into
 * each other, only into the journal. A ring buffer in memory; a compacted
 * copy goes to the store.
 *
 * Nothing secret goes in: commands are kept only as argument-free
 * summaries (`summarize`), prompt and answer texts not at all.
 */

export type ActivityKind = 'install' | 'build' | 'deploy' | 'search' | 'test' | 'git' | 'other'

type Ev =
  | { type: 'session.start'; sessionId: string; project: string }
  | { type: 'prompt.submit'; chars: number }
  | { type: 'turn.start'; turnId: string }
  | { type: 'tool.start'; id: string; tool: string; summary: string; kind?: ActivityKind }
  | { type: 'tool.end'; id: string; tool: string; ms: number; ok: boolean; exitCode?: number; files?: string[]; denied?: string }
  | { type: 'file.changed'; path: string; added: number; removed: number; via: 'Edit' | 'Write' | 'NotebookEdit' }
  | { type: 'test.run'; source: 'testlight' | 'claude'; phase: 'start' | 'end'; ok?: boolean; green?: number; red?: number; runner?: string }
  | { type: 'build.run'; ok: boolean }
  | { type: 'ci.status'; state: 'green' | 'red' | 'running' | 'unknown'; runId?: number }
  | { type: 'turn.complete'; turnId: string; ms: number; claims: string[]; reason: string }
  | { type: 'snapshot'; id: string; kind: string }
  | { type: 'budget.exceeded'; module: string; ms: number }
  | { type: 'module.error'; module: string; message: string }
  | { type: 'session.end'; reason: string }

export type JournalEvent = Ev & { seq: number; at: number; turnId?: string }
export type NewEvent = Ev & { turnId?: string }
export type EventType = JournalEvent['type']
export type EventOf<T extends EventType> = Extract<JournalEvent, { type: T }>

export const CAPACITY = 2_000
export const SUMMARY_MAX = 120

export interface JournalSnapshot {
  sessionId: string
  seq: number
  events: JournalEvent[]
}

export class Journal {
  private buf: JournalEvent[] = []
  private seq = 0
  private listeners = new Set<(e: JournalEvent) => void>()
  /** The turn in progress; stamped on events that do not carry their own. */
  turnId: string | undefined

  constructor(
    public sessionId = '',
    readonly capacity = CAPACITY,
  ) {}

  push(e: NewEvent, at: number): JournalEvent {
    const ev = { ...e, seq: ++this.seq, at } as JournalEvent
    if (ev.turnId === undefined && this.turnId !== undefined && e.type !== 'session.start') ev.turnId = this.turnId
    if (ev.type === 'tool.start') ev.summary = ev.summary.slice(0, SUMMARY_MAX)
    this.buf.push(ev)
    if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity)
    for (const l of this.listeners) {
      try {
        l(ev)
      } catch {
        // a listener's failure is its module's business, never the journal's
      }
    }
    return ev
  }

  /** Called for every new event; returns the unsubscribe function. */
  subscribe(fn: (e: JournalEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  all(): readonly JournalEvent[] {
    return this.buf
  }

  ofType<T extends EventType>(type: T): EventOf<T>[] {
    return this.buf.filter((e): e is EventOf<T> => e.type === type)
  }

  inTurn(turnId: string): JournalEvent[] {
    return this.buf.filter(e => e.turnId === turnId)
  }

  last<T extends EventType>(type: T): EventOf<T> | undefined {
    for (let i = this.buf.length - 1; i >= 0; i--) if (this.buf[i]!.type === type) return this.buf[i] as EventOf<T>
    return undefined
  }

  size(): number {
    return this.buf.length
  }

  /** For the store: `tool.start` dropped (its `tool.end` says enough). */
  snapshot(): JournalSnapshot {
    return { sessionId: this.sessionId, seq: this.seq, events: this.buf.filter(e => e.type !== 'tool.start') }
  }

  /** Drops the oldest events until the snapshot shrinks; null when empty. */
  static shrink(s: JournalSnapshot): JournalSnapshot | null {
    if (!s.events.length) return null
    const drop = Math.max(1, Math.ceil(s.events.length / 4))
    return { ...s, events: s.events.slice(drop) }
  }

  /** Restores a snapshot of the same session; returns false otherwise. */
  restore(raw: unknown, sessionId: string): boolean {
    if (!raw || typeof raw !== 'object') return false
    const s = raw as Partial<JournalSnapshot>
    if (s.sessionId !== sessionId || !Array.isArray(s.events) || typeof s.seq !== 'number') return false
    const events = s.events.filter(e => e && typeof e === 'object' && typeof (e as JournalEvent).type === 'string' && typeof (e as JournalEvent).seq === 'number')
    // Events logged before the restore (a hook that raced the start) follow
    // the restored ones with fresh numbers.
    const early = this.buf
    this.buf = events.slice(-this.capacity)
    this.seq = Math.max(s.seq, ...this.buf.map(e => e.seq))
    for (const e of early) this.buf.push({ ...e, seq: ++this.seq })
    if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity)
    this.sessionId = sessionId
    return true
  }
}
