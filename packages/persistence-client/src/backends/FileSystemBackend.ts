// `FileSystemBackend` — JSONL append-only file backend (W-09 in
// `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`).
//
// Why:
//   The headless CLI (S18-T3) noted that persistence was in-memory
//   only "until a file-system backend lands in S19+".  W-09 closes
//   that gap: this backend writes one PersistedEvent per line as JSON
//   to an append-only `.pryzm-log` file, plus a sibling `.checkpoint`
//   file that tracks the most recent durable seq.
//
// Design choices:
//   * Append-only NDJSON.  Trivial to inspect with `head` / `tail`,
//     trivial to splice into the InMemoryBackend by streaming each
//     line through `JSON.parse`.  No DB drivers, no NPM transitive
//     surface — the only dependency is `node:fs`.
//   * Synchronous flush on close.  Append uses
//     `fsPromises.appendFile` which fsyncs at OS level on most
//     platforms; we additionally `await fh.sync()` if we hold an
//     open file handle.  No event loss in the headless CLI's
//     "run command, exit" lifecycle.
//   * Checkpoint file is a single-line integer.  Atomic write via
//     write-temp-then-rename.  This is the same pattern used by
//     the IndexedDbBackend's META store.
//   * No locking.  The CLI is single-process; concurrent writers are
//     out of scope (and would corrupt any append-only log without a
//     coordinator regardless of format).
//
// File layout:
//   <projectPath>/
//     events.pryzm-log     # NDJSON, one PersistedEvent per line
//     events.checkpoint    # single integer, the highest checkpointed seq

import { mkdir, readFile, rename, writeFile, appendFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  EventLogClosedError,
  type Backend,
  type PersistedEvent,
} from '../types.js';

export interface FileSystemBackendOptions {
  /** Directory to store the log + checkpoint files.  Created if missing. */
  readonly projectPath: string;
  /** Override the log filename.  Default: `events.pryzm-log`. */
  readonly logFilename?: string;
  /** Override the checkpoint filename.  Default: `events.checkpoint`. */
  readonly checkpointFilename?: string;
}

const DEFAULT_LOG_FILE = 'events.pryzm-log';
const DEFAULT_CHECKPOINT_FILE = 'events.checkpoint';

/** Append-only JSONL file backend for the EventLog (W-09). */
export class FileSystemBackend implements Backend {
  private readonly logPath: string;
  private readonly checkpointPath: string;
  private closed = false;
  private initPromise: Promise<void> | null = null;

  constructor(opts: FileSystemBackendOptions) {
    if (!opts.projectPath || typeof opts.projectPath !== 'string') {
      throw new Error('FileSystemBackend: projectPath is required');
    }
    const root = resolve(opts.projectPath);
    this.logPath = join(root, opts.logFilename ?? DEFAULT_LOG_FILE);
    this.checkpointPath = join(root, opts.checkpointFilename ?? DEFAULT_CHECKPOINT_FILE);
  }

  /** Lazily ensure the project directory exists.  Idempotent. */
  private async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      await mkdir(dirname(this.logPath), { recursive: true });
    })();
    return this.initPromise;
  }

  // ────────────────────────────────────────────────────────────── Backend
  async append(event: PersistedEvent): Promise<void> {
    this.assertOpen();
    await this.init();
    // Guard against backwards seq, mirroring InMemoryBackend.
    const last = await this.readLastEventSeq();
    if (last !== null && event.seq <= last) {
      throw new Error(
        `[FileSystemBackend] non-monotonic seq — got ${event.seq}, last=${last} ` +
          `(the EventLog must be the sole writer).`,
      );
    }
    // NDJSON: one event per line.  No fancy framing, no escapes; the
    // codec is JSON which already handles newline escaping inside
    // string values via `\n`.
    const line = JSON.stringify(event) + '\n';
    await appendFile(this.logPath, line, 'utf8');
  }

  async *replay(fromSeq: number): AsyncIterable<PersistedEvent> {
    this.assertOpen();
    await this.init();
    let raw: string;
    try {
      raw = await readFile(this.logPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    // Snapshot-then-iterate: matches InMemoryBackend / IDB cursor
    // semantics — concurrent appends do not show up mid-iteration.
    const lines = raw.split('\n');
    for (const line of lines) {
      if (line.length === 0) continue;
      const ev = JSON.parse(line) as PersistedEvent;
      if (ev.seq >= fromSeq) yield ev;
    }
  }

  async checkpoint(seq: number): Promise<void> {
    this.assertOpen();
    await this.init();
    const current = await this.lastCheckpoint();
    if (seq < current) {
      throw new RangeError(
        `[FileSystemBackend] checkpoint cannot go backwards (${seq} < ${current}).`,
      );
    }
    // Atomic checkpoint: write temp file, rename over the old one.
    const tmp = `${this.checkpointPath}.tmp`;
    await writeFile(tmp, String(seq), 'utf8');
    await rename(tmp, this.checkpointPath);
  }

  async highestSeq(): Promise<number> {
    this.assertOpen();
    await this.init();
    return (await this.readLastEventSeq()) ?? 0;
  }

  async lastCheckpoint(): Promise<number> {
    this.assertOpen();
    await this.init();
    try {
      const raw = await readFile(this.checkpointPath, 'utf8');
      const n = Number.parseInt(raw.trim(), 10);
      return Number.isFinite(n) ? n : 0;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
  }

  // ────────────────────────────────────────────────────────────── helpers
  /** Test/debug helper — number of NDJSON lines currently on disk. */
  async size(): Promise<number> {
    await this.init();
    try {
      const raw = await readFile(this.logPath, 'utf8');
      return raw.split('\n').filter((l) => l.length > 0).length;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw err;
    }
  }

  /** Test helper — has the log file been created on disk? */
  async exists(): Promise<boolean> {
    try {
      await stat(this.logPath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  /** Public path getters for diagnostics + tests. */
  get logFilePath(): string { return this.logPath; }
  get checkpointFilePath(): string { return this.checkpointPath; }

  private async readLastEventSeq(): Promise<number | null> {
    let raw: string;
    try {
      raw = await readFile(this.logPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    // The trailing `\n` in NDJSON means the last entry may be empty.
    const lines = raw.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line && line.length > 0) {
        const ev = JSON.parse(line) as PersistedEvent;
        return ev.seq;
      }
    }
    return null;
  }

  private assertOpen(): void {
    if (this.closed) throw new EventLogClosedError();
  }
}
